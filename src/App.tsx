import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowUp, ArrowUpDown, BookOpenText, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileDown, FileSpreadsheet, FileText, Keyboard, LayoutTemplate, Loader2, Medal, MoreHorizontal, Plus, Printer, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import { AppSidebar } from './components/AppSidebar'
import { Certificates } from './components/Certificates'
import { EmptyState, LocalBadge, Modal, PageTitle, SearchField, ToolCard } from './components/Common'
import type { ArchivedItem, CertificateData, DocumentData, ImportStatus, Page, RecentFile, ReportSection, SavedTemplate, SpreadsheetData } from './types'
import { storage } from './lib/storage'
import {
  cleanRows,
  exportSpreadsheet,
  readSpreadsheet,
  toTitleCase,
  toFirstLetterCase,
  mergeSpreadsheets,
  findAndReplace,
  formatColumnCells,
  evaluateColumnFormula,
  calculateMathColumn,
  combineTextColumns,
  calculateColumnSummary,
  appendSummaryRow,
  type CleanMode,
  type ColumnFormatType
} from './lib/spreadsheet'
import { exportDocx, exportPdf } from './lib/export'
import { AuthModal } from './components/AuthModal'
import { AuthScreen } from './components/AuthScreen'
import { OnboardingModal } from './components/OnboardingModal'
import { AdminPanel } from './components/AdminPanel'
import { getSupabaseClient, getSupabaseConfig } from './lib/supabase'
import { fetchUserProfile, logoutUser } from './lib/auth'
import type { UserProfile } from './types/auth'

const id = () => crypto.randomUUID()
const initialDocument: DocumentData = { type: 'Letter', date: new Date().toLocaleDateString('en-CA'), recipientName: '', recipientPosition: '', organization: '', address: '', subject: '', greeting: 'Dear Sir/Madam,', body: 'I am writing to respectfully submit this letter for your consideration.', closing: 'Respectfully yours,', senderName: 'Mico', senderPosition: '' }
const initialCertificate: CertificateData = { title: 'Certificate of Participation', subtitle: 'This certificate is proudly presented to', description: 'for successfully participating in\n\n{{event}}\n\nheld on {{date}}.', event: 'Training Program', date: new Date().toLocaleDateString(), venue: '', signatory: '', signatoryPosition: '', borderStyle: 'gold', includeQr: true }
const defaultSections = (): ReportSection[] => ['Summary', 'Activities Conducted', 'Participants / Beneficiaries', 'Key Accomplishments', 'Issues / Concerns', 'Recommendations', 'Next Steps'].map(title => ({ id: id(), title, content: '', type: 'Text' }))

const validPages: Page[] = ['home', 'documents', 'spreadsheets', 'reports', 'certificates', 'templates', 'archives', 'recent', 'settings', 'admin']

function getInitialPage(): Page {
  const hash = window.location.hash.replace(/^#\/?/, '') as Page
  if (validPages.includes(hash)) return hash
  const saved = localStorage.getItem('office_toolkit_page') as Page
  if (validPages.includes(saved)) return saved
  return 'home'
}

const toolNames: Record<string, string> = {
  home: 'Home',
  documents: 'Document Generator',
  spreadsheets: 'Spreadsheet Tools',
  reports: 'Report Builder',
  certificates: 'Certificate Generator',
  templates: 'Templates',
  archives: 'Archives',
  recent: 'Recent Files',
  settings: 'Settings',
  admin: 'Admin Console'
}

export default function App() {
  const [page, setPageState] = useState<Page>(getInitialPage)
  const [collapsed, setCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [recent, setRecent] = useState<RecentFile[]>(storage.recent())
  const [templates, setTemplates] = useState<SavedTemplate[]>(storage.templates())
  const [archives, setArchives] = useState<ArchivedItem[]>(storage.archives())
  const [theme, setTheme] = useState<string>(String(storage.settings().theme || 'system'))
  const [notice, setNotice] = useState('')
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)

  // User Auth & Onboarding State
  const [authLoading, setAuthLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register' | 'forgot'>('login')
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        fetchUserProfile(data.session.user.id, data.session.user.email || '').then(profile => {
          if (profile.status === 'disabled') {
            supabase.auth.signOut()
            setCurrentUser(null)
          } else {
            setCurrentUser(profile)
            if (!localStorage.getItem(`office_toolkit_onboarded_${profile.id}`)) {
              setOnboardingOpen(true)
            }
          }
          setAuthLoading(false)
        }).catch(() => {
          setAuthLoading(false)
        })
      } else {
        setAuthLoading(false)
      }
    }).catch(() => {
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id, session.user.email || '')
        if (profile.status === 'disabled') {
          await supabase.auth.signOut()
          setCurrentUser(null)
          notify('Your account has been deactivated.')
        } else {
          setCurrentUser(profile)
          if (!localStorage.getItem(`office_toolkit_onboarded_${profile.id}`)) {
            setOnboardingOpen(true)
          }
        }
      } else {
        setCurrentUser(null)
      }
      setAuthLoading(false)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    await logoutUser()
    setCurrentUser(null)
    if (page === 'admin') setPage('home')
    notify('Signed out successfully')
  }

  // Active snapshot for auto-archiving / draft state
  const [activeSnapshot, setActiveSnapshot] = useState<{
    label: string
    summary: string
    tool: 'documents' | 'spreadsheets' | 'reports' | 'certificates'
    payload: unknown
  } | null>(null)

  // Unsaved / active work state tracking
  const [dirty, setDirty] = useState(false)
  const [pendingPage, setPendingPage] = useState<Page | null>(null)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)

  const handleImportStatus = (status: ImportStatus | null) => {
    setImportStatus(status)
    if (status && status.status !== 'loading') {
      setTimeout(() => {
        setImportStatus(curr => (curr === status ? null : curr))
      }, status.status === 'success' ? 3200 : 4500)
    }
  }

  const forceNavigate = (next: Page) => {
    setDirty(false)
    setPageState(next)
    window.location.hash = next
    localStorage.setItem('office_toolkit_page', next)
    setConfirmLeaveOpen(false)
    setPendingPage(null)
  }

  const setPage = (next: Page) => {
    if (next === page) return
    if (dirty) {
      setPendingPage(next)
      setConfirmLeaveOpen(true)
    } else {
      forceNavigate(next)
    }
  }

  const cancelLeave = () => {
    setConfirmLeaveOpen(false)
    setPendingPage(null)
    if (window.location.hash.replace(/^#\/?/, '') !== page) {
      window.location.hash = page
    }
  }

  const confirmLeave = () => {
    if (pendingPage) {
      forceNavigate(pendingPage)
    } else {
      setConfirmLeaveOpen(false)
    }
  }

  const archiveAndLeave = (customLabel: string) => {
    if (activeSnapshot) {
      const label = customLabel.trim() || activeSnapshot.label || 'Saved Session'
      const formattedTime = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      const item: ArchivedItem = {
        id: id(),
        label,
        tool: activeSnapshot.tool,
        toolTitle: toolNames[activeSnapshot.tool] || activeSnapshot.tool,
        savedAt: formattedTime,
        summary: activeSnapshot.summary,
        payload: activeSnapshot.payload
      }
      storage.saveArchive(item)
      setArchives(storage.archives())
      notify(`Saved "${label}" to Archives (${formattedTime})`)
    }
    if (pendingPage) {
      forceNavigate(pendingPage)
    } else {
      setConfirmLeaveOpen(false)
    }
  }

  const restoreArchive = (item: ArchivedItem) => {
    storage.saveDraft(item.tool, item.payload)
    forceNavigate(item.tool)
    notify(`Restored "${item.label}" into ${item.toolTitle}`)
  }

  const deleteArchive = (archiveId: string) => {
    if (confirm('Delete this archived session?')) {
      storage.deleteArchive(archiveId)
      setArchives(storage.archives())
      notify('Archived session deleted')
    }
  }

  const clearAllArchives = () => {
    if (confirm('Delete all saved archives? This cannot be undone.')) {
      storage.clearArchives()
      setArchives([])
      notify('All archives cleared')
    }
  }

  // Intercept closing tab (X), reload (F5 / Ctrl+R), or navigating out of site
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  // Intercept browser back/forward buttons when active work is dirty
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '') as Page
      if (validPages.includes(hash) && hash !== page) {
        if (dirty) {
          window.location.hash = page
          setPendingPage(hash)
          setConfirmLeaveOpen(true)
        } else {
          setPageState(hash)
          localStorage.setItem('office_toolkit_page', hash)
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [page, dirty])

  useEffect(() => {
    if (!window.location.hash || window.location.hash.replace(/^#\/?/, '') !== page) {
      window.location.hash = page
    }
    localStorage.setItem('office_toolkit_page', page)
  }, [page])

  // Escape key handler for confirmation modal
  useEffect(() => {
    if (!confirmLeaveOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelLeave()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmLeaveOpen])

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }
  useEffect(() => { document.documentElement.dataset.theme = theme; storage.saveSettings({ ...storage.settings(), theme }) }, [theme])
  useEffect(() => { const keydown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(true) } }; addEventListener('keydown', keydown); return () => removeEventListener('keydown', keydown) }, [])
  const addRecent = (file: RecentFile) => { storage.saveRecent(file); setRecent(storage.recent()) }
  const saveTemplate = (template: SavedTemplate) => { storage.saveTemplate(template); setTemplates(storage.templates()); notify('Template saved locally') }
  const removeTemplate = (templateId: string) => { if (confirm('Delete this template?')) { storage.deleteTemplate(templateId); setTemplates(storage.templates()) } }

  // 1. Initial Authentication Loading State
  if (authLoading) {
    return (
      <div className="auth-screen-layout">
        <div className="auth-loading-box">
          <span className="auth-brand-badge">Office Toolkit</span>
          <p>Connecting to secure workspace...</p>
        </div>
      </div>
    )
  }

  // 2. Authentication Gatekeeper (Must log in to use the system)
  if (!currentUser) {
    return (
      <AuthScreen
        onSuccess={profile => {
          setCurrentUser(profile)
          if (!localStorage.getItem(`office_toolkit_onboarded_${profile.id}`)) {
            setOnboardingOpen(true)
          }
          notify(`Welcome, ${profile.full_name || profile.email}!`)
        }}
      />
    )
  }

  // 3. Onboarding Experience for New Users (Dedicated Screen - No background workspace)
  if (onboardingOpen && currentUser) {
    return (
      <OnboardingModal
        user={currentUser}
        onComplete={() => setOnboardingOpen(false)}
        onNavigate={target => {
          setOnboardingOpen(false)
          setPage(target)
        }}
      />
    )
  }

  return <div className="app-shell">
    <AppSidebar
      page={page}
      setPage={setPage}
      collapsed={collapsed}
      toggle={() => setCollapsed(!collapsed)}
      currentUser={currentUser}
      onOpenAuth={() => {
        setAuthModalTab('login')
        setAuthModalOpen(true)
      }}
      onSignOut={handleSignOut}
    />
    <main className="main-content">
      {page === 'home' && <Home setPage={setPage} recent={recent} setRecent={setRecent} />}
      {page === 'documents' && <Documents templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} notify={notify} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'spreadsheets' && <Spreadsheets addRecent={addRecent} notify={notify} onImportStatus={handleImportStatus} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'reports' && <Reports templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} notify={notify} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'certificates' && <Certificates templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} notify={notify} onImportStatus={handleImportStatus} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'templates' && <Templates templates={templates} useTemplate={(t) => { setPage(t.category === 'Document' ? 'documents' : t.category === 'Report' ? 'reports' : 'certificates'); notify(`Open ${t.category} and choose ${t.name} from templates`) }} remove={removeTemplate} />}
      {page === 'archives' && <Archives archives={archives} restore={restoreArchive} remove={deleteArchive} clearAll={clearAllArchives} />}
      {page === 'recent' && <RecentFiles recent={recent} setRecent={setRecent} />}
      {page === 'settings' && (
        <Settings
          theme={theme}
          setTheme={setTheme}
          clearRecent={() => { if (confirm('Clear all recent file history?')) { storage.clearRecent(); setRecent([]) } }}
          templates={templates}
          clearTemplates={() => { if (confirm('Delete all saved templates?')) { templates.forEach(t => storage.deleteTemplate(t.id)); setTemplates([]) } }}
          archives={archives}
          clearArchives={clearAllArchives}
          currentUser={currentUser}
          onOpenAuth={(tab) => {
            setAuthModalTab(tab || 'login')
            setAuthModalOpen(true)
          }}
          onSignOut={handleSignOut}
          onOpenOnboarding={() => setOnboardingOpen(true)}
          onResetAllData={() => {
            if (confirm('Are you sure you want to reset all local data? This will clear all local templates, archives, recent files, and cached drafts. This cannot be undone.')) {
              storage.clearAllData()
              setRecent([])
              setTemplates([])
              setArchives([])
              setDirty(false)
              notify('All local storage data and drafts have been reset.')
            }
          }}
        />
      )}
      {page === 'admin' && <AdminPanel currentUser={currentUser} onNotify={notify} />}
    </main>
    <button className="command-hint" onClick={() => setCommandOpen(true)}><Keyboard size={15}/> Command menu <kbd>Ctrl K</kbd></button>
    {notice && <div className="toast">{notice}</div>}
    {importStatus && (
      <aside className={`import-toast ${importStatus.status}`} aria-live="polite">
        <div className="import-toast-icon">
          {importStatus.status === 'loading' && <Loader2 size={16} className="spinner" />}
          {importStatus.status === 'success' && <CheckCircle2 size={16} />}
          {importStatus.status === 'error' && <AlertCircle size={16} />}
        </div>
        <div className="import-toast-content">
          <strong className="import-toast-title">
            {importStatus.status === 'loading' && 'Importing File...'}
            {importStatus.status === 'success' && 'File Ready'}
            {importStatus.status === 'error' && 'Import Error'}
          </strong>
          <span className="import-toast-sub">
            {importStatus.message || importStatus.name}
          </span>
          {importStatus.status === 'loading' && (
            <span className="import-toast-filename">{importStatus.name}</span>
          )}
        </div>
        <button
          type="button"
          className="import-toast-close"
          onClick={() => setImportStatus(null)}
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </aside>
    )}
    {confirmLeaveOpen && (
      <ConfirmLeaveModal
        currentPage={page}
        targetPage={pendingPage}
        activeSnapshot={activeSnapshot}
        onArchiveAndLeave={archiveAndLeave}
        onConfirmLeave={confirmLeave}
        onCancel={cancelLeave}
      />
    )}
    {commandOpen && (
      <CommandPalette
        isAdmin={currentUser?.role === 'admin'}
        close={() => setCommandOpen(false)}
        open={(p) => { setPage(p); setCommandOpen(false) }}
      />
    )}
    <AuthModal
      isOpen={authModalOpen}
      initialTab={authModalTab}
      onClose={() => setAuthModalOpen(false)}
      onSuccess={profile => {
        setCurrentUser(profile)
        setAuthModalOpen(false)
        if (!localStorage.getItem(`office_toolkit_onboarded_${profile.id}`)) {
          setOnboardingOpen(true)
        }
        notify(`Welcome, ${profile.full_name || profile.email}!`)
      }}
    />
  </div>
}

function Home({ setPage, recent, setRecent }: { setPage: (page: Page) => void; recent: RecentFile[]; setRecent: (f: RecentFile[]) => void }) {
  const hour = new Date().getHours(); const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return <div className="page home"><PageTitle title={`${greeting}, Mico.`} subtitle="What would you like to work on?" /><section><div className="section-heading"><h2>Quick Tools</h2><LocalBadge /></div><div className="tool-grid">
    <ToolCard icon={<FileText size={21}/>} title="Document Generator" text="Create letters, reports and certificates" action={() => setPage('documents')} />
    <ToolCard icon={<FileSpreadsheet size={21}/>} title="Spreadsheet Tools" text="Clean • Merge • Filter • Convert" action={() => setPage('spreadsheets')} />
    <ToolCard icon={<BookOpenText size={21}/>} title="Report Builder" text="Generate recurring reports" action={() => setPage('reports')} />
    <ToolCard icon={<Medal size={21}/>} title="Bulk Certificate Generator" text="Excel → Certificates → PDF" action={() => setPage('certificates')} />
  </div></section><section className="recent-section"><div className="section-heading"><h2>Recent Files</h2>{recent.length > 0 && <button className="text-button" onClick={() => { if (confirm('Clear recent history?')) { storage.clearRecent(); setRecent([]) } }}>Clear history</button>}</div>{recent.length ? <RecentTable recent={recent.slice(0, 5)} /> : <EmptyState title="No recent files yet" text="Files and projects you work with will appear here." />}</section></div>
}

function Documents({ templates, saveTemplate, addRecent, notify, onDirtyChange, onSnapshotChange }: {
  templates: SavedTemplate[]
  saveTemplate: (x: SavedTemplate) => void
  addRecent: (x: RecentFile) => void
  notify: (s: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onSnapshotChange?: (snapshot: { label: string; summary: string; tool: 'documents'; payload: unknown } | null) => void
}) {
  const [doc, setDoc] = useState<DocumentData>(() => storage.getDraft<DocumentData>('documents', initialDocument))
  const [zoom, setZoom] = useState(0.75)
  const [templateOpen, setTemplateOpen] = useState(false)
  const update = (field: keyof DocumentData, value: string) => setDoc({ ...doc, [field]: value })
  const title = doc.subject || `${doc.type} document`
  const lines = documentLines(doc)

  useEffect(() => {
    const isModified = Boolean(
      doc.recipientName.trim() ||
      doc.recipientPosition.trim() ||
      doc.organization.trim() ||
      doc.address.trim() ||
      doc.subject.trim() ||
      doc.senderPosition.trim() ||
      doc.body.trim() !== initialDocument.body.trim()
    )
    onDirtyChange?.(isModified)
    if (isModified) {
      storage.saveDraft('documents', doc)
      onSnapshotChange?.({
        label: doc.subject.trim() || `${doc.type} (${doc.recipientName || 'Untitled'})`,
        summary: `${doc.type} • ${doc.recipientName ? `To: ${doc.recipientName}` : 'In progress'}`,
        tool: 'documents',
        payload: doc
      })
    } else {
      storage.clearDraft('documents')
      onSnapshotChange?.(null)
    }
  }, [doc, onDirtyChange, onSnapshotChange])

  const loadTemplate = (template: SavedTemplate) => { setDoc(template.payload as DocumentData); setTemplateOpen(false); notify('Template loaded') }
  const save = () => { const name = prompt('Template name', doc.subject || 'Untitled Letter'); if (name) saveTemplate({ id: id(), name, category: 'Document', updatedAt: new Date().toLocaleString(), payload: doc }) }
  const record = () => addRecent({ id: id(), name: title, type: 'Document', modified: 'Just now' })
  return <div className="page workspace"><PageTitle title="Document Generator" subtitle="Create polished office documents in a few focused steps"><div className="header-actions"><LocalBadge/><button className="button secondary" onClick={() => setTemplateOpen(true)}><LayoutTemplate size={16}/> Templates</button><button className="button" onClick={save}><Save size={16}/> Save template</button></div></PageTitle><div className="editor-layout"><section className="field-panel"><label>Document type<select value={doc.type} onChange={e => update('type', e.target.value)}><option>Letter</option><option>Memo</option><option>Simple Report</option><option>Certificate</option></select></label>{([['date','Date'],['recipientName','Recipient name'],['recipientPosition','Recipient position'],['organization','Office / Organization'],['address','Address'],['subject','Subject'],['greeting','Greeting']] as [keyof DocumentData, string][]).map(([key, label]) => <label key={key}>{label}<input value={doc[key]} onChange={e => update(key, e.target.value)}/></label>)}<label>Body<textarea rows={7} value={doc.body} onChange={e => update('body', e.target.value)} /></label>{([['closing','Closing'],['senderName','Sender name'],['senderPosition','Sender position']] as [keyof DocumentData, string][]).map(([key, label]) => <label key={key}>{label}<input value={doc[key]} onChange={e => update(key, e.target.value)}/></label>)}</section><section className="preview-area"><div className="preview-toolbar"><button className="icon-button" onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" onClick={() => setZoom(Math.min(1, zoom + .1))}>+</button><button className="text-button" onClick={() => setZoom(.75)}>Fit page</button><span className="toolbar-spacer"/><button className="icon-button" title="Print" onClick={() => print()}><Printer size={17}/></button><button className="button secondary" onClick={() => { exportDocx(title, lines); record() }}><Download size={16}/> DOCX</button><button className="button" onClick={() => { exportPdf(title, lines); record() }}><FileDown size={16}/> PDF</button></div><Paper zoom={zoom} lines={lines}/></section></div>{templateOpen && <TemplateModal templates={templates.filter(t => t.category === 'Document')} load={loadTemplate} close={() => setTemplateOpen(false)} />}</div>
}

function documentLines(doc: DocumentData) { return [doc.date, '', doc.recipientName, doc.recipientPosition, doc.organization, doc.address, '', doc.subject ? `Subject: ${doc.subject}` : '', '', doc.greeting, '', ...doc.body.split('\n'), '', doc.closing, '', doc.senderName, doc.senderPosition].filter((x, i, arr) => x || (i > 0 && arr[i - 1] !== '')) }
function Paper({ zoom, lines, certificate = false }: { zoom: number; lines: string[]; certificate?: boolean }) { return <div className={`paper-wrap ${certificate ? 'certificate-paper' : ''}`}><article className="paper" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: `${(zoom - 1) * 1080}px` }}>{certificate ? <div className="certificate-inner">{lines.map((line, i) => <p key={i} className={i === 0 ? 'certificate-title' : ''}>{line || ' '}</p>)}</div> : lines.map((line, i) => <p key={i} className={line.startsWith('Subject:') ? 'subject-line' : ''}>{line || ' '}</p>)}</article></div> }

function Spreadsheets({ addRecent, notify, onImportStatus, onDirtyChange, onSnapshotChange }: {
  addRecent: (x: RecentFile) => void
  notify: (s: string) => void
  onImportStatus?: (status: ImportStatus | null) => void
  onDirtyChange?: (dirty: boolean) => void
  onSnapshotChange?: (snapshot: { label: string; summary: string; tool: 'spreadsheets'; payload: unknown } | null) => void
}) {
  const [data, setData] = useState<SpreadsheetData | null>(() => storage.getDraft<SpreadsheetData | null>('spreadsheets', null))
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState<SpreadsheetData[]>([])
  const [selectedCol, setSelectedCol] = useState<number>(-1)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState<boolean>(true)
  const [formulaModalOpen, setFormulaModalOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [findReplaceModalOpen, setFindReplaceModalOpen] = useState(false)
  const [formatModalOpen, setFormatModalOpen] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const hasData = Boolean(data && data.rows.length > 0)
    onDirtyChange?.(hasData)
    if (hasData && data) {
      storage.saveDraft('spreadsheets', data)
      onSnapshotChange?.({
        label: data.name || 'Spreadsheet Dataset',
        summary: `${data.rows.length.toLocaleString()} rows • ${data.headers.length} cols`,
        tool: 'spreadsheets',
        payload: data
      })
    } else {
      storage.clearDraft('spreadsheets')
      onSnapshotChange?.(null)
    }
  }, [data, onDirtyChange, onSnapshotChange])

  const importFile = async (file?: File) => {
    if (!file) return
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      const err = 'Unsupported format. Choose an .xlsx, .xls, or .csv file.'
      setError(err)
      onImportStatus?.({ name: file.name, status: 'error', message: err })
      return
    }
    onImportStatus?.({ name: file.name, status: 'loading', message: 'Reading spreadsheet...' })
    try {
      const result = await readSpreadsheet(file)
      setData(result)
      setHistory([])
      setSelectedCol(-1)
      setSortCol(null)
      setSortAsc(true)
      setError('')
      addRecent({ id: id(), name: file.name, type: 'Spreadsheet', modified: 'Just now' })
      onImportStatus?.({
        name: file.name,
        status: 'success',
        message: `Imported ${result.rows.length.toLocaleString()} rows (${result.headers.length} columns)`
      })
      notify(`Imported ${result.rows.length.toLocaleString()} rows`)
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Unable to read this spreadsheet.'
      setError(err)
      onImportStatus?.({ name: file.name, status: 'error', message: err })
    }
  }

  const clean = (mode: CleanMode, colIdx: number = selectedCol) => {
    if (!data) return
    const { rows, affectedCount } = cleanRows(data.rows, mode, colIdx)
    const colName = colIdx >= 0 && colIdx < data.headers.length ? `"${data.headers[colIdx]}"` : 'all columns'

    if (affectedCount === 0) {
      if (mode === 'duplicates') return notify('Nothing changed — no duplicate rows were detected.')
      if (mode === 'empty') return notify('Nothing changed — no empty rows were detected.')
      return notify(`Nothing changed in ${colName} — text is already properly formatted.`)
    }

    setHistory([...history, data])
    setData({ ...data, rows })

    if (mode === 'duplicates') {
      notify(`Removed ${affectedCount} duplicate row${affectedCount === 1 ? '' : 's'}`)
    } else if (mode === 'empty') {
      notify(`Removed ${affectedCount} empty row${affectedCount === 1 ? '' : 's'}`)
    } else if (mode === 'titleCase') {
      notify(`Capitalized every word in ${colName} (${affectedCount} cell${affectedCount === 1 ? '' : 's'} updated)`)
    } else if (mode === 'firstLetter') {
      notify(`Capitalized first letter only in ${colName} (${affectedCount} cell${affectedCount === 1 ? '' : 's'} updated)`)
    } else if (mode === 'upperCase') {
      notify(`Converted ${colName} to UPPERCASE (${affectedCount} cell${affectedCount === 1 ? '' : 's'} updated)`)
    } else if (mode === 'lowerCase') {
      notify(`Converted ${colName} to lowercase (${affectedCount} cell${affectedCount === 1 ? '' : 's'} updated)`)
    } else if (mode === 'sentenceCase') {
      notify(`Converted ${colName} to Sentence case (${affectedCount} cell${affectedCount === 1 ? '' : 's'} updated)`)
    } else if (mode === 'trim') {
      notify(`Trimmed excess spaces in ${colName} (${affectedCount} cell${affectedCount === 1 ? '' : 's'} cleaned)`)
    }
  }

  const toggleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortAsc) {
        setSortAsc(false)
      } else {
        setSortCol(null)
        setSortAsc(true)
      }
    } else {
      setSortCol(colIdx)
      setSortAsc(true)
    }
  }

  const visibleRows = useMemo(() => {
    if (!data) return []
    let rows = data.rows
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(row => row.some(cell => (cell || '').toLowerCase().includes(q)))
    }
    if (sortCol !== null && sortCol < data.headers.length) {
      rows = [...rows].sort((a, b) => {
        const valA = a[sortCol] || ''
        const valB = b[sortCol] || ''
        const comp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
        return sortAsc ? comp : -comp
      })
    }
    return rows
  }, [data, search, sortCol, sortAsc])

  const loadSampleDataset = () => {
    const sample: SpreadsheetData = {
      name: 'sample_employees_masterlist.xlsx',
      headers: ['Employee ID', 'First Name', 'Last Name', 'Department', 'Position', 'Daily Rate', 'Days Worked', 'Basic Pay', 'Allowance', 'Tax Deductions', 'Contact Number', 'Hired Date', 'Status'],
      rows: [
        ['EMP-1001', 'JUAN', 'DELA CRUZ', 'Administrative', 'Admin Assistant II', '750', '22', '16500', '2500', '1250', '09171234567', '2022-03-15', 'ACTIVE'],
        ['EMP-1002', 'maria', 'santos', 'Human Resources', 'HR Specialist', '850', '20', '17000', '3000', '1500', '9187654321', '2021-06-01', 'ACTIVE'],
        ['EMP-1003', 'JOSE', 'RIZAL', 'Accounting', 'Accountant I', '950', '22', '20900', '3500', '2100', '09228889999', '2020-01-10', 'ACTIVE'],
        ['EMP-1004', 'gabriela', 'silang', 'Administrative', 'Records Officer', '700', '21', '14700', '2000', '1100', '9051112233', '2023-08-20', 'PENDING'],
        ['EMP-1005', 'ANDRES', 'BONIFACIO', 'Operations', 'Team Leader', '880', '23', '20240', '3200', '1800', '09395556677', '2019-11-05', 'ACTIVE'],
        ['EMP-1006', 'emilio', 'aguinaldo', 'Executive', 'Division Head', '1200', '22', '26400', '5000', '3200', '9173334455', '2018-05-12', 'ACTIVE'],
        ['EMP-1007', 'APOLINARIO', 'MABINI', 'Legal & Policy', 'Legal Researcher', '1100', '21', '23100', '4000', '2700', '09189990011', '2021-09-18', 'ACTIVE'],
        ['EMP-1008', 'melchora', 'aquino', 'Medical / Health', 'Staff Nurse', '800', '22', '17600', '2800', '1400', '9204445566', '2022-10-01', 'ACTIVE'],
        ['EMP-1009', 'ANTONIO', 'LUNA', 'Operations', 'Field Coordinator', '820', '19', '15580', '2500', '1350', '09177778899', '2023-02-14', 'PENDING'],
        ['EMP-1010', 'teresa', 'magbanua', 'Accounting', 'Bookkeeper', '720', '22', '15840', '2200', '1200', '9062223344', '2024-01-08', 'ACTIVE']
      ],
      sheets: ['Masterlist']
    }
    setData(sample)
    setHistory([])
    setSelectedCol(-1)
    setSortCol(null)
    setSortAsc(true)
    setError('')
    addRecent({ id: id(), name: sample.name, type: 'Spreadsheet', modified: 'Just now' })
    notify('Loaded sample Employee Masterlist')
  }

  return (
    <div className="page">
      <PageTitle title="Spreadsheet Tools" subtitle="Import, clean, merge, calculate formulas, and format spreadsheet data.">
        <LocalBadge />
      </PageTitle>

      {!data ? (
        <section
          className="dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            importFile(e.dataTransfer.files[0])
          }}
        >
          <FileSpreadsheet size={31} />
          <h2>Drop a spreadsheet to get started</h2>
          <p>Excel and CSV files are processed locally in your browser.</p>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => importFile(e.target.files?.[0])}
          />
          <div className="header-actions">
            <button className="button" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Browse files
            </button>
            <button type="button" className="button secondary" onClick={loadSampleDataset}>
              Load Sample Dataset
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      ) : (
        <section className="sheet-workspace">
          <div className="sheet-meta">
            <div>
              <h2>{data.name}</h2>
              <p>
                {data.rows.length.toLocaleString()} rows · {data.headers.length} columns · Sheet: {data.sheets[0]}
              </p>
            </div>
            <div className="header-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setData(null)
                  setSearch('')
                  setSortCol(null)
                }}
              >
                <Upload size={16} /> Import another
              </button>
              <div className="export-group">
                <button className="button" onClick={() => exportSpreadsheet(data, 'xlsx')}>
                  <Download size={16} /> Export Excel
                </button>
                <button className="button secondary" onClick={() => exportSpreadsheet(data, 'csv')}>
                  CSV
                </button>
                <button className="button secondary" onClick={() => exportSpreadsheet(data, 'json')}>
                  JSON
                </button>
              </div>
            </div>
          </div>

          <div className="stats">
            <span><b>{data.rows.length}</b> Total rows</span>
            <span><b>{data.headers.length}</b> Columns</span>
            <span><b>{data.rows.filter(r => !r.some(c => (c || '').trim())).length}</b> Empty rows</span>
            {data.addedColumns && data.addedColumns.length > 0 && (
              <span className="added-cols-stat">
                <b>{data.addedColumns.length}</b> Added / Computed column{data.addedColumns.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="sheet-tools">
            <div className="tool-group">
              <span className="tool-group-label">Clean</span>
              <button type="button" onClick={() => clean('duplicates')} title="Remove duplicate rows across sheet">
                Duplicates
              </button>
              <button type="button" onClick={() => clean('empty')} title="Remove completely empty rows">
                Empty rows
              </button>
              <button type="button" onClick={() => clean('trim', selectedCol)} title="Trim extra spaces">
                Trim spaces
              </button>
            </div>

            <div className="tool-separator" />

            <div className="tool-group">
              <span className="tool-group-label">Case</span>
              <select
                className="tool-col-select"
                value={selectedCol}
                onChange={e => setSelectedCol(Number(e.target.value))}
                title="Select column to apply case transformation"
              >
                <option value={-1}>All columns</option>
                {data.headers.map((h, i) => (
                  <option key={i} value={i}>Col: {h}</option>
                ))}
              </select>

              <button
                type="button"
                className="button-tool highlight"
                onClick={() => clean('titleCase', selectedCol)}
                title="Capitalize every word / after every space (e.g. 'ilagan city' ➔ 'Ilagan City', 'CORPORATION' ➔ 'Corporation')"
              >
                Aa Every Word (Ilagan City)
              </button>
              <button
                type="button"
                className="button-tool"
                onClick={() => clean('firstLetter', selectedCol)}
                title="Capitalize only the first letter of cell (e.g. 'ILAGAN CITY' ➔ 'Ilagan city')"
              >
                A_ First Letter (Ilagan city)
              </button>
              <button
                type="button"
                className="button-tool"
                onClick={() => clean('upperCase', selectedCol)}
                title="Convert to UPPERCASE (e.g. 'ilagan city' ➔ 'ILAGAN CITY')"
              >
                UPPER
              </button>
              <button
                type="button"
                className="button-tool"
                onClick={() => clean('lowerCase', selectedCol)}
                title="Convert to lowercase (e.g. 'ILAGAN CITY' ➔ 'ilagan city')"
              >
                lower
              </button>
            </div>

            <div className="tool-separator" />

            <div className="tool-group">
              <span className="tool-group-label">Power Tools</span>
              <button
                type="button"
                className="button-tool highlight"
                onClick={() => setFormulaModalOpen(true)}
                title="Calculate math, deduct, combine text, or custom formulas"
              >
                Formulas
              </button>
              <button
                type="button"
                className="button-tool"
                onClick={() => setMergeModalOpen(true)}
                title="Merge 2 files or sheets using a common matching column (VLOOKUP)"
              >
                Merge 2 Files (VLOOKUP)
              </button>
              <button
                type="button"
                className="button-tool"
                onClick={() => setFindReplaceModalOpen(true)}
                title="Find and replace text across sheet or in a column"
              >
                Find & Replace
              </button>
              <button
                type="button"
                className="button-tool"
                onClick={() => setFormatModalOpen(true)}
                title="Format column as Philippine Peso, Number, Date, or Phone"
              >
                Format Column
              </button>
              <button
                type="button"
                className={`button-tool ${showSummary ? 'active-toggle' : ''}`}
                onClick={() => setShowSummary(!showSummary)}
                title="Toggle sticky summary total row at the bottom of table"
              >
                {showSummary ? 'Hide Totals Row' : 'Totals Row'}
              </button>
            </div>

            {history.length > 0 && (
              <button
                type="button"
                className="undo"
                title="Undo last change"
                onClick={() => {
                  const prior = history.at(-1)!
                  setData(prior)
                  setHistory(history.slice(0, -1))
                  notify('Last operation undone')
                }}
              >
                <RotateCcw size={13} /> Undo
              </button>
            )}

            <SearchField value={search} onChange={setSearch} placeholder="Search cells..." />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {data.headers.map((h, i) => {
                    const isSorted = sortCol === i
                    const isAdded = Boolean(data.addedColumns && data.addedColumns.includes(h))
                    return (
                      <th key={i} className={`th-cell ${isAdded ? 'th-added-col' : ''}`}>
                        <div className="th-content">
                          <span className="th-title" title={h}>
                            <span className="th-text">{h}</span>
                            {isAdded && <span className="col-added-tag" title="Added / Computed column">Added</span>}
                          </span>
                          <div className="th-actions">
                            <button
                              type="button"
                              className="th-btn"
                              title={`Capitalize every word in "${h}"`}
                              onClick={() => clean('titleCase', i)}
                            >
                              Aa
                            </button>
                            <button
                              type="button"
                              className="th-btn"
                              title={`Capitalize first letter only in "${h}"`}
                              onClick={() => clean('firstLetter', i)}
                            >
                              A_
                            </button>
                            <button
                              type="button"
                              className={`th-btn ${isSorted ? 'active' : ''}`}
                              title={isSorted ? (sortAsc ? 'Sorted ascending. Click to sort descending.' : 'Sorted descending. Click to reset.') : `Sort by "${h}"`}
                              onClick={() => toggleSort(i)}
                            >
                              {isSorted ? (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}
                            </button>
                          </div>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.slice(0, 500).map((row, i) => (
                  <tr key={i}>
                    {data.headers.map((h, j) => (
                      <td key={j} className={data.addedColumns?.includes(h) ? 'td-added-col' : ''}>
                        {row[j]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {showSummary && (
                <tfoot className="table-summary-foot">
                  <tr className="summary-row sum-row">
                    {data.headers.map((h, i) => {
                      const stats = calculateColumnSummary(data.rows, i)
                      const isAdded = Boolean(data.addedColumns && data.addedColumns.includes(h))
                      return (
                        <td key={i} className={`summary-cell ${isAdded ? 'td-added-col' : ''}`}>
                          {stats.isNumeric ? (
                            <div className="summary-stat-box">
                              <span className="summary-stat-label">TOTAL</span>
                              <strong className="summary-stat-val">
                                {stats.sum.toLocaleString('en-US', { minimumFractionDigits: stats.sum % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                              </strong>
                            </div>
                          ) : (
                            <div className="summary-stat-box">
                              <span className="summary-stat-label">COUNT</span>
                              <strong className="summary-stat-val">{stats.count} items</strong>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  <tr className="summary-row avg-row">
                    {data.headers.map((h, i) => {
                      const stats = calculateColumnSummary(data.rows, i)
                      const isAdded = Boolean(data.addedColumns && data.addedColumns.includes(h))
                      return (
                        <td key={i} className={`summary-cell ${isAdded ? 'td-added-col' : ''}`}>
                          {stats.isNumeric ? (
                            <div className="summary-stat-box">
                              <span className="summary-stat-label">AVG</span>
                              <strong className="summary-stat-val">
                                {stats.avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong>
                            </div>
                          ) : (
                            <div className="summary-stat-box">
                              <span className="summary-stat-label">—</span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
            {visibleRows.length > 500 && (
              <p className="table-limit">Showing first 500 matching rows to keep the preview quick.</p>
            )}
          </div>

          {formulaModalOpen && (
            <FormulaModal
              headers={data.headers}
              rows={data.rows}
              onApply={(newHeaders, newRows, colName, isNewCol) => {
                setHistory([...history, data])
                const updatedAdded = isNewCol
                  ? Array.from(new Set([...(data.addedColumns || []), colName]))
                  : data.addedColumns
                setData({ ...data, headers: newHeaders, rows: newRows, addedColumns: updatedAdded })
                setFormulaModalOpen(false)
                notify(isNewCol ? `Added calculated column "${colName}"` : `Updated column "${colName}"`)
              }}
              onAppendSummaryRow={(type, colIndices) => {
                setHistory([...history, data])
                const newRows = appendSummaryRow(data.headers, data.rows, type, colIndices)
                setData({ ...data, rows: newRows })
                setFormulaModalOpen(false)
                notify(`Added "${type}" row at the bottom of the table`)
              }}
              onToggleTotalsRow={() => {
                setShowSummary(true)
                setFormulaModalOpen(false)
                notify('Totals row enabled at the bottom of the table')
              }}
              onClose={() => setFormulaModalOpen(false)}
            />
          )}

          {mergeModalOpen && (
            <MergeModal
              primaryData={data}
              onMerge={(merged, summary) => {
                setHistory([...history, data])
                setData(merged)
                setMergeModalOpen(false)
                notify(summary)
              }}
              onClose={() => setMergeModalOpen(false)}
            />
          )}

          {findReplaceModalOpen && (
            <FindReplaceModal
              headers={data.headers}
              rows={data.rows}
              onApply={(newRows, matchCount) => {
                setHistory([...history, data])
                setData({ ...data, rows: newRows })
                setFindReplaceModalOpen(false)
                notify(`Replaced ${matchCount} occurrence${matchCount === 1 ? '' : 's'}`)
              }}
              onClose={() => setFindReplaceModalOpen(false)}
            />
          )}

          {formatModalOpen && (
            <FormatModal
              headers={data.headers}
              rows={data.rows}
              initialColIndex={selectedCol}
              onApply={(newRows, count, formatLabel) => {
                setHistory([...history, data])
                setData({ ...data, rows: newRows })
                setFormatModalOpen(false)
                notify(`Formatted ${count} cell${count === 1 ? '' : 's'} as ${formatLabel}`)
              }}
              onClose={() => setFormatModalOpen(false)}
            />
          )}
        </section>
      )}
    </div>
  )
}

function FormulaModal({
  headers,
  rows,
  onApply,
  onAppendSummaryRow,
  onToggleTotalsRow,
  onClose
}: {
  headers: string[]
  rows: string[][]
  onApply: (newHeaders: string[], newRows: string[][], colName: string, isNewCol: boolean) => void
  onAppendSummaryRow?: (type: 'TOTAL' | 'AVERAGE', colIndices?: number[]) => void
  onToggleTotalsRow?: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'math' | 'summary' | 'text' | 'custom'>('math')

  // Target Destination
  const [targetMode, setTargetMode] = useState<'new_column' | 'replace_column'>('new_column')
  const [replaceColIdx, setReplaceColIdx] = useState(0)

  // Math Tab State
  const [mathOp, setMathOp] = useState<'sum' | 'subtract' | 'multiply' | 'divide' | 'percent'>('sum')
  const [mathColA, setMathColA] = useState(0)
  const [mathColB, setMathColB] = useState(headers.length > 1 ? 1 : 0)
  const [mathSumCols, setMathSumCols] = useState<number[]>([0, headers.length > 1 ? 1 : 0])
  const [mathColName, setMathColName] = useState('Total')
  const [mathSearch, setMathSearch] = useState('')

  // Summary Tab State (Multi-column)
  const [summarySearch, setSummarySearch] = useState('')
  const initialNumericCols = useMemo(() => {
    const numCols = headers.map((_, i) => i).filter(i => calculateColumnSummary(rows, i).isNumeric)
    return numCols.length ? numCols : [0]
  }, [headers, rows])
  const [selectedSummaryCols, setSelectedSummaryCols] = useState<number[]>(initialNumericCols)

  // Compute stats for all selected summary columns
  const multiSummaryStats = useMemo(() => {
    return selectedSummaryCols.map(ci => ({
      ci,
      name: headers[ci] || `Col ${ci + 1}`,
      stats: calculateColumnSummary(rows, ci)
    }))
  }, [selectedSummaryCols, headers, rows])

  const grandTotalSum = useMemo(() => {
    return multiSummaryStats
      .filter(item => item.stats.isNumeric)
      .reduce((acc, item) => acc + item.stats.sum, 0)
  }, [multiSummaryStats])

  // Text Tab State
  const [textCol1, setTextCol1] = useState(0)
  const [textCol2, setTextCol2] = useState(headers.length > 1 ? 1 : 0)
  const [textCol3, setTextCol3] = useState<number>(-1)
  const [textSeparator, setTextSeparator] = useState<' ' | ', ' | ' - ' | ''>(' ')
  const [textColName, setTextColName] = useState('Full Name')

  // Custom Tab State
  const [customFormula, setCustomFormula] = useState(headers.length >= 2 ? `[${headers[0]}] + [${headers[1]}]` : '')
  const [customColName, setCustomColName] = useState('Calculated')
  const [customSearch, setCustomSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (tab === 'math') {
      const nameA = headers[mathColA] || 'Col A'
      const nameB = headers[mathColB] || 'Col B'
      if (mathOp === 'sum') {
        const sumNames = mathSumCols.map(ci => headers[ci]).filter(Boolean).join(' + ')
        setMathColName(sumNames ? `Total (${sumNames})` : 'Total')
      } else if (mathOp === 'subtract') {
        setMathColName(`Net (${nameA} - ${nameB})`)
      } else if (mathOp === 'multiply') {
        setMathColName(`Total (${nameA} x ${nameB})`)
      } else if (mathOp === 'divide') {
        setMathColName(`Ratio (${nameA} / ${nameB})`)
      } else if (mathOp === 'percent') {
        setMathColName(`${nameA} % of ${nameB}`)
      }
    } else if (tab === 'text') {
      const n1 = headers[textCol1] || ''
      const n2 = headers[textCol2] || ''
      setTextColName(`${n1} & ${n2}`)
    }
  }, [tab, mathOp, mathColA, mathColB, mathSumCols, textCol1, textCol2, headers])

  const livePreview = useMemo(() => {
    try {
      if (tab === 'math') {
        const res = calculateMathColumn(
          headers,
          rows.slice(0, 3),
          mathOp,
          mathColA,
          mathColB,
          mathColName,
          'new_column',
          0,
          mathSumCols
        )
        return rows.slice(0, 3).map((r, i) => {
          let exprDesc = ''
          if (mathOp === 'sum') {
            exprDesc = mathSumCols.map(ci => r[ci] || '0').join(' + ')
          } else if (mathOp === 'subtract') {
            exprDesc = `${r[mathColA] || '0'} − ${r[mathColB] || '0'}`
          } else if (mathOp === 'multiply') {
            exprDesc = `${r[mathColA] || '0'} × ${r[mathColB] || '0'}`
          } else if (mathOp === 'divide') {
            exprDesc = `${r[mathColA] || '0'} ÷ ${r[mathColB] || '0'}`
          } else if (mathOp === 'percent') {
            exprDesc = `${r[mathColA] || '0'} / ${r[mathColB] || '0'}`
          }
          return {
            input: `Row ${i + 1}: ${exprDesc}`,
            output: res.rows[i][res.rows[i].length - 1]
          }
        })
      } else if (tab === 'text') {
        const colsToCombine = [textCol1, textCol2, textCol3].filter(ci => ci >= 0)
        const res = combineTextColumns(
          headers,
          rows.slice(0, 3),
          colsToCombine,
          textSeparator,
          textColName,
          'new_column'
        )
        return rows.slice(0, 3).map((r, i) => {
          const parts = colsToCombine.map(ci => r[ci] || '').filter(Boolean)
          return {
            input: `Row ${i + 1}: ${parts.join(textSeparator ? ` + "${textSeparator}" + ` : ' + ')}`,
            output: res.rows[i][res.rows[i].length - 1]
          }
        })
      } else if (tab === 'custom') {
        if (!customFormula.trim()) return []
        const res = evaluateColumnFormula(
          headers,
          rows.slice(0, 3),
          customFormula,
          customColName,
          'new_column'
        )
        return rows.slice(0, 3).map((_, i) => ({
          input: `Row ${i + 1}`,
          output: res.rows[i][res.rows[i].length - 1]
        }))
      }
      return []
    } catch {
      return [{ input: 'Preview', output: '...' }]
    }
  }, [tab, mathOp, mathColA, mathColB, mathSumCols, mathColName, textCol1, textCol2, textCol3, textSeparator, textColName, customFormula, customColName, headers, rows])

  const toggleSumCol = (ci: number) => {
    if (mathSumCols.includes(ci)) {
      if (mathSumCols.length > 1) {
        setMathSumCols(mathSumCols.filter(x => x !== ci))
      }
    } else {
      setMathSumCols([...mathSumCols, ci])
    }
  }

  const handleApply = () => {
    setError('')
    try {
      if (tab === 'math') {
        const res = calculateMathColumn(
          headers,
          rows,
          mathOp,
          mathColA,
          mathColB,
          mathColName,
          targetMode,
          replaceColIdx,
          mathSumCols
        )
        onApply(res.headers, res.rows, res.colName, targetMode === 'new_column')
      } else if (tab === 'text') {
        const cols = [textCol1, textCol2, textCol3].filter(ci => ci >= 0)
        const res = combineTextColumns(
          headers,
          rows,
          cols,
          textSeparator,
          textColName,
          targetMode,
          replaceColIdx
        )
        onApply(res.headers, res.rows, res.colName, targetMode === 'new_column')
      } else if (tab === 'custom') {
        const res = evaluateColumnFormula(
          headers,
          rows,
          customFormula,
          customColName,
          targetMode,
          replaceColIdx
        )
        onApply(res.headers, res.rows, res.colName, targetMode === 'new_column')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation error.')
    }
  }

  return (
    <div className="modal-backdrop centered-backdrop" onMouseDown={onClose}>
      <div className="modal spreadsheet-submodal formula-ux-modal" onMouseDown={e => e.stopPropagation()}>
        <header className="submodal-header">
          <h2>Formulas & Calculations</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close"><X size={16} /></button>
        </header>

        <div className="submodal-body">
          {/* Main 4 Intuitive Tabs */}
          <div className="segmented formula-tabs-bar">
            <button
              type="button"
              className={tab === 'math' ? 'selected' : ''}
              onClick={() => setTab('math')}
            >
              Math & Numbers
            </button>
            <button
              type="button"
              className={tab === 'summary' ? 'selected' : ''}
              onClick={() => setTab('summary')}
            >
              Column Total & Average
            </button>
            <button
              type="button"
              className={tab === 'text' ? 'selected' : ''}
              onClick={() => setTab('text')}
            >
              Combine Text
            </button>
            <button
              type="button"
              className={tab === 'custom' ? 'selected' : ''}
              onClick={() => setTab('custom')}
            >
              Custom Formula
            </button>
          </div>

          {/* TAB 1: MATH & NUMBERS */}
          {tab === 'math' && (
            <div className="builder-section">
              <span className="builder-section-title">1. Choose Math Operation:</span>
              <div className="math-ops-grid">
                <button
                  type="button"
                  className={`op-chip ${mathOp === 'sum' ? 'active' : ''}`}
                  onClick={() => setMathOp('sum')}
                >
                  Sum / Add Columns (+)
                </button>
                <button
                  type="button"
                  className={`op-chip ${mathOp === 'subtract' ? 'active' : ''}`}
                  onClick={() => setMathOp('subtract')}
                >
                  Subtract / Deduct (−)
                </button>
                <button
                  type="button"
                  className={`op-chip ${mathOp === 'multiply' ? 'active' : ''}`}
                  onClick={() => setMathOp('multiply')}
                >
                  Multiply (×)
                </button>
                <button
                  type="button"
                  className={`op-chip ${mathOp === 'divide' ? 'active' : ''}`}
                  onClick={() => setMathOp('divide')}
                >
                  Divide (÷)
                </button>
                <button
                  type="button"
                  className={`op-chip ${mathOp === 'percent' ? 'active' : ''}`}
                  onClick={() => setMathOp('percent')}
                >
                  Percentage (%)
                </button>
              </div>

              {mathOp === 'sum' ? (
                <div className="sum-multi-picker">
                  <div className="selector-header">
                    <span className="builder-field-label">Select columns to add together:</span>
                    <div className="selector-quick-links">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setMathSumCols(headers.map((_, i) => i).filter(i => calculateColumnSummary(rows, i).isNumeric))}
                      >
                        Numeric only
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setMathSumCols(headers.map((_, i) => i))}
                      >
                        Select all
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setMathSumCols([])}
                      >
                        Deselect
                      </button>
                    </div>
                  </div>

                  <div className="selector-search-box">
                    <input
                      type="text"
                      className="col-search-input"
                      value={mathSearch}
                      onChange={e => setMathSearch(e.target.value)}
                      placeholder="Search columns to add..."
                    />
                  </div>

                  <div className="sum-chips-list">
                    {headers
                      .map((h, i) => ({ h, i }))
                      .filter(({ h }) => !mathSearch || h.toLowerCase().includes(mathSearch.toLowerCase()))
                      .map(({ h, i }) => (
                        <label key={i} className={`sum-chip-item ${mathSumCols.includes(i) ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={mathSumCols.includes(i)}
                            onChange={() => toggleSumCol(i)}
                          />
                          <span>{h}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="cols-match-row">
                  <label className="submodal-field">
                    <span>{mathOp === 'subtract' ? 'Starting Column' : mathOp === 'multiply' ? 'First Column' : 'Numerator Column'}</span>
                    <select value={mathColA} onChange={e => setMathColA(Number(e.target.value))}>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </label>

                  <span className="op-symbol">
                    {mathOp === 'subtract' ? '−' : mathOp === 'multiply' ? '×' : mathOp === 'divide' ? '÷' : '% of'}
                  </span>

                  <label className="submodal-field">
                    <span>{mathOp === 'subtract' ? 'Column to Deduct' : mathOp === 'multiply' ? 'Second Column' : 'Denominator Column'}</span>
                    <select value={mathColB} onChange={e => setMathColB(Number(e.target.value))}>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COLUMN TOTAL & AVERAGE */}
          {tab === 'summary' && (
            <div className="builder-section">
              <div className="selector-header">
                <span className="builder-section-title">1. Select Columns to Total & Average:</span>
                <div className="selector-quick-links">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelectedSummaryCols(headers.map((_, i) => i).filter(i => calculateColumnSummary(rows, i).isNumeric))}
                  >
                    Numeric only
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelectedSummaryCols(headers.map((_, i) => i))}
                  >
                    Select all
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelectedSummaryCols([])}
                  >
                    Deselect
                  </button>
                </div>
              </div>

              <div className="selector-search-box">
                <input
                  type="text"
                  className="col-search-input"
                  value={summarySearch}
                  onChange={e => setSummarySearch(e.target.value)}
                  placeholder="Search columns to calculate..."
                />
              </div>

              <div className="sum-chips-list">
                {headers
                  .map((h, i) => ({ h, i }))
                  .filter(({ h }) => !summarySearch || h.toLowerCase().includes(summarySearch.toLowerCase()))
                  .map(({ h, i }) => {
                    const isNum = calculateColumnSummary(rows, i).isNumeric
                    const isSelected = selectedSummaryCols.includes(i)
                    return (
                      <label key={i} className={`sum-chip-item ${isSelected ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedSummaryCols(selectedSummaryCols.filter(x => x !== i))
                            } else {
                              setSelectedSummaryCols([...selectedSummaryCols, i])
                            }
                          }}
                        />
                        <span>{h}</span>
                        {isNum && <span className="chip-type-badge">123</span>}
                      </label>
                    )
                  })}
              </div>

              {selectedSummaryCols.length === 0 ? (
                <div className="empty-selection-hint">
                  Please select at least one column above to view its Total and Average.
                </div>
              ) : selectedSummaryCols.length === 1 ? (
                /* Single column focused card */
                <div className="column-stats-dashboard">
                  <div className="stats-dashboard-card primary-stat">
                    <span className="stats-card-label">TOTAL (Sum of all rows in "{multiSummaryStats[0].name}")</span>
                    <strong className="stats-card-val">
                      {multiSummaryStats[0].stats.isNumeric
                        ? multiSummaryStats[0].stats.sum.toLocaleString('en-US', { minimumFractionDigits: multiSummaryStats[0].stats.sum % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })
                        : `${multiSummaryStats[0].stats.count} text rows (Non-numeric)`}
                    </strong>
                  </div>

                  <div className="stats-dashboard-grid">
                    <div className="stats-dashboard-card">
                      <span className="stats-card-label">AVERAGE (Mean)</span>
                      <strong className="stats-card-val">
                        {multiSummaryStats[0].stats.isNumeric
                          ? multiSummaryStats[0].stats.avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}
                      </strong>
                    </div>

                    <div className="stats-dashboard-card">
                      <span className="stats-card-label">HIGHEST (Max)</span>
                      <strong className="stats-card-val">
                        {multiSummaryStats[0].stats.isNumeric
                          ? multiSummaryStats[0].stats.max.toLocaleString('en-US', { minimumFractionDigits: multiSummaryStats[0].stats.max % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })
                          : '—'}
                      </strong>
                    </div>

                    <div className="stats-dashboard-card">
                      <span className="stats-card-label">LOWEST (Min)</span>
                      <strong className="stats-card-val">
                        {multiSummaryStats[0].stats.isNumeric
                          ? multiSummaryStats[0].stats.min.toLocaleString('en-US', { minimumFractionDigits: multiSummaryStats[0].stats.min % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })
                          : '—'}
                      </strong>
                    </div>

                    <div className="stats-dashboard-card">
                      <span className="stats-card-label">TOTAL ROWS</span>
                      <strong className="stats-card-val">{multiSummaryStats[0].stats.count} rows ({multiSummaryStats[0].stats.numericCount} numbers)</strong>
                    </div>
                  </div>
                </div>
              ) : (
                /* Multi-column comparison breakdown */
                <div className="multi-stats-breakdown-box">
                  <div className="stats-dashboard-card primary-stat grand-total-card">
                    <span className="stats-card-label">GRAND TOTAL (Combined Sum of {multiSummaryStats.filter(s => s.stats.isNumeric).length} Selected Numeric Columns)</span>
                    <strong className="stats-card-val">
                      {grandTotalSum.toLocaleString('en-US', { minimumFractionDigits: grandTotalSum % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                    </strong>
                  </div>

                  <div className="summary-breakdown-wrap">
                    <table className="summary-breakdown-table">
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Total (Sum)</th>
                          <th>Average</th>
                          <th>Min / Max</th>
                          <th>Numbers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiSummaryStats.map(({ ci, name, stats }) => (
                          <tr key={ci}>
                            <td><b>{name}</b></td>
                            <td>
                              {stats.isNumeric
                                ? <b>{stats.sum.toLocaleString('en-US', { minimumFractionDigits: stats.sum % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}</b>
                                : <span className="non-num-text">Text</span>}
                            </td>
                            <td>
                              {stats.isNumeric
                                ? stats.avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '—'}
                            </td>
                            <td>
                              {stats.isNumeric
                                ? `${stats.min.toLocaleString()} to ${stats.max.toLocaleString()}`
                                : '—'}
                            </td>
                            <td>{stats.numericCount} / {stats.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="summary-actions-group">
                <span className="builder-section-title">2. Insert or Show on Sheet:</span>
                <div className="summary-action-btns">
                  <button
                    type="button"
                    className="button"
                    disabled={selectedSummaryCols.length === 0}
                    onClick={() => {
                      if (onAppendSummaryRow) onAppendSummaryRow('TOTAL', selectedSummaryCols)
                      onClose()
                    }}
                  >
                    Insert "TOTAL" Row for {selectedSummaryCols.length} Column{selectedSummaryCols.length === 1 ? '' : 's'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={selectedSummaryCols.length === 0}
                    onClick={() => {
                      if (onAppendSummaryRow) onAppendSummaryRow('AVERAGE', selectedSummaryCols)
                      onClose()
                    }}
                  >
                    Insert "AVERAGE" Row for {selectedSummaryCols.length} Column{selectedSummaryCols.length === 1 ? '' : 's'}
                  </button>
                  {onToggleTotalsRow && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        onToggleTotalsRow()
                        onClose()
                      }}
                    >
                      Turn On Live Totals Row
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COMBINE TEXT */}
          {tab === 'text' && (
            <div className="builder-section">
              <span className="builder-section-title">1. Select Columns in Order:</span>
              <div className="text-cols-row">
                <label className="submodal-field">
                  <span>First Text Column</span>
                  <select value={textCol1} onChange={e => setTextCol1(Number(e.target.value))}>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </label>

                <label className="submodal-field">
                  <span>Second Text Column</span>
                  <select value={textCol2} onChange={e => setTextCol2(Number(e.target.value))}>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </label>

                <label className="submodal-field">
                  <span>Third Column (Optional)</span>
                  <select value={textCol3} onChange={e => setTextCol3(Number(e.target.value))}>
                    <option value={-1}>-- None --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="separator-picker-box">
                <span className="builder-field-label">Choose Separator / Spacing:</span>
                <div className="sep-buttons-group">
                  <button
                    type="button"
                    className={`sep-btn ${textSeparator === ' ' ? 'active' : ''}`}
                    onClick={() => setTextSeparator(' ')}
                  >
                    Space (Juan Dela Cruz)
                  </button>
                  <button
                    type="button"
                    className={`sep-btn ${textSeparator === ', ' ? 'active' : ''}`}
                    onClick={() => setTextSeparator(', ')}
                  >
                    Comma (Dela Cruz, Juan)
                  </button>
                  <button
                    type="button"
                    className={`sep-btn ${textSeparator === ' - ' ? 'active' : ''}`}
                    onClick={() => setTextSeparator(' - ')}
                  >
                    Dash (EMP-1001 - Juan)
                  </button>
                  <button
                    type="button"
                    className={`sep-btn ${textSeparator === '' ? 'active' : ''}`}
                    onClick={() => setTextSeparator('')}
                  >
                    No Space
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CUSTOM EXPRESSION */}
          {tab === 'custom' && (
            <div className="builder-section">
              <label className="submodal-field">
                <span>Custom Formula Expression:</span>
                <input
                  type="text"
                  value={customFormula}
                  onChange={e => setCustomFormula(e.target.value)}
                  placeholder="e.g. [Basic Pay] + [Allowance] - [Tax Deductions]"
                />
              </label>

              <div className="token-picker">
                <div className="selector-header">
                  <span className="token-picker-label">Click to insert column into expression:</span>
                </div>
                <div className="selector-search-box">
                  <input
                    type="text"
                    className="col-search-input"
                    value={customSearch}
                    onChange={e => setCustomSearch(e.target.value)}
                    placeholder="Search columns to insert..."
                  />
                </div>
                <div className="token-chips-wrap">
                  {headers
                    .map((h, i) => ({ h, i }))
                    .filter(({ h }) => !customSearch || h.toLowerCase().includes(customSearch.toLowerCase()))
                    .map(({ h, i }) => (
                      <button
                        key={i}
                        type="button"
                        className="token-chip"
                        onClick={() => setCustomFormula(f => `${f} [${h}]`.trim())}
                      >
                        +{h}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. TARGET DESTINATION (NEW COLUMN VS REPLACE) */}
          {tab !== 'summary' && (
            <div className="destination-section">
              <span className="builder-section-title">2. Where to Place Result:</span>
              <div className="destination-options-box">
                <label className={`destination-radio-card ${targetMode === 'new_column' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="targetMode"
                    checked={targetMode === 'new_column'}
                    onChange={() => setTargetMode('new_column')}
                  />
                  <div className="destination-card-content">
                    <strong>Add as New Column (Recommended)</strong>
                    <input
                      type="text"
                      className="dest-col-input"
                      value={tab === 'math' ? mathColName : tab === 'text' ? textColName : customColName}
                      onChange={e => {
                        if (tab === 'math') setMathColName(e.target.value)
                        else if (tab === 'text') setTextColName(e.target.value)
                        else setCustomColName(e.target.value)
                      }}
                      placeholder="Enter column name..."
                      disabled={targetMode !== 'new_column'}
                    />
                  </div>
                </label>

                <label className={`destination-radio-card ${targetMode === 'replace_column' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="targetMode"
                    checked={targetMode === 'replace_column'}
                    onChange={() => setTargetMode('replace_column')}
                  />
                  <div className="destination-card-content">
                    <strong>Overwrite / Replace Existing Column</strong>
                    <select
                      value={replaceColIdx}
                      onChange={e => setReplaceColIdx(Number(e.target.value))}
                      disabled={targetMode !== 'replace_column'}
                    >
                      {headers.map((h, i) => (
                        <option key={i} value={i}>Column: {h}</option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
            </div>
          )}

          {error && <div className="modal-error-text">{error}</div>}

          {/* 3. LIVE SAMPLE PREVIEW */}
          {tab !== 'summary' && (
            <div className="formula-live-box">
              <span className="live-box-label">Live Calculation Preview:</span>
              <div className="live-box-list">
                {livePreview.map((item, i) => (
                  <div key={i} className="live-box-row">
                    <span className="sample-in">{item.input}</span>
                    <span className="sample-arrow">➔</span>
                    <span className="sample-out"><b>{item.output}</b></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="submodal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {tab === 'summary' ? 'Close' : 'Cancel'}
          </button>
          {tab !== 'summary' && (
            <button type="button" className="button" onClick={handleApply}>
              {targetMode === 'new_column' ? 'Add Column' : 'Update Column'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MergeModal({
  primaryData,
  onMerge,
  onClose
}: {
  primaryData: SpreadsheetData
  onMerge: (merged: SpreadsheetData, summary: string) => void
  onClose: () => void
}) {
  const [secondaryData, setSecondaryData] = useState<SpreadsheetData | null>(null)
  const [primaryKeyIdx, setPrimaryKeyIdx] = useState(0)
  const [secondaryKeyIdx, setSecondaryKeyIdx] = useState(0)
  const [selectedSecCols, setSelectedSecCols] = useState<number[]>([])
  const [mergeSearch, setMergeSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file?: File) => {
    if (!file) return
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('Unsupported file format. Please choose an .xlsx, .xls, or .csv file.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const parsed = await readSpreadsheet(file)
      setSecondaryData(parsed)
      const defaultIndices = parsed.headers
        .map((_, i) => i)
        .filter(i => i !== 0)
      setSelectedSecCols(defaultIndices.length ? defaultIndices : [0])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read second spreadsheet.')
    } finally {
      setLoading(false)
    }
  }

  const toggleCol = (idx: number) => {
    if (selectedSecCols.includes(idx)) {
      setSelectedSecCols(selectedSecCols.filter(i => i !== idx))
    } else {
      setSelectedSecCols([...selectedSecCols, idx])
    }
  }

  const selectAll = () => {
    if (!secondaryData) return
    setSelectedSecCols(secondaryData.headers.map((_, i) => i))
  }

  const deselectAll = () => {
    setSelectedSecCols([])
  }

  const executeMerge = () => {
    if (!secondaryData) return
    if (selectedSecCols.length === 0) {
      setError('Please check at least one column to bring into the primary sheet.')
      return
    }
    const { data: merged, matchedCount, unmatchedCount } = mergeSpreadsheets(
      primaryData,
      secondaryData,
      primaryKeyIdx,
      secondaryKeyIdx,
      selectedSecCols
    )
    const summary = `Merged ${selectedSecCols.length} column(s) from "${secondaryData.name}". Matched ${matchedCount} rows (${unmatchedCount} unmatched).`
    onMerge(merged, summary)
  }

  return (
    <div className="modal-backdrop centered-backdrop" onMouseDown={onClose}>
      <div className="modal spreadsheet-submodal merge-submodal" onMouseDown={e => e.stopPropagation()}>
        <header className="submodal-header">
          <h2>Merge 2 Files (VLOOKUP / Dataset Joiner)</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close"><X size={16} /></button>
        </header>

        <div className="submodal-body">
          {!secondaryData ? (
            <div
              className="dropzone-compact"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                handleFile(e.dataTransfer.files[0])
              }}
            >
              <FileSpreadsheet size={28} />
              <h3>Choose the second file to merge</h3>
              <p>Upload the supplementary spreadsheet or masterlist to pull columns from.</p>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".xlsx,.xls,.csv"
                onChange={e => handleFile(e.target.files?.[0])}
              />
              <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>
                Browse Second File
              </button>
              {loading && <p className="status-hint">Reading file...</p>}
            </div>
          ) : (
            <div className="merge-configured-view">
              <div className="merge-files-indicator">
                <div className="file-chip">
                  <span className="file-chip-role">Primary:</span>
                  <b>{primaryData.name}</b> ({primaryData.rows.length} rows)
                </div>
                <span className="file-chip-arrow">↔</span>
                <div className="file-chip">
                  <span className="file-chip-role">Secondary:</span>
                  <b>{secondaryData.name}</b> ({secondaryData.rows.length} rows)
                </div>
              </div>

              <div className="match-keys-section">
                <span className="section-subtitle">Match rows where both files share the same value:</span>
                <div className="cols-match-row">
                  <label className="submodal-field">
                    <span>{primaryData.name} Key</span>
                    <select
                      value={primaryKeyIdx}
                      onChange={e => setPrimaryKeyIdx(Number(e.target.value))}
                    >
                      {primaryData.headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </label>

                  <span className="op-symbol">═</span>

                  <label className="submodal-field">
                    <span>{secondaryData.name} Key</span>
                    <select
                      value={secondaryKeyIdx}
                      onChange={e => setSecondaryKeyIdx(Number(e.target.value))}
                    >
                      {secondaryData.headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="columns-selector-section">
                <div className="selector-header">
                  <span className="section-subtitle">Columns to add from {secondaryData.name}:</span>
                  <div className="selector-quick-links">
                    <button type="button" className="text-button" onClick={selectAll}>Select all</button>
                    <span>·</span>
                    <button type="button" className="text-button" onClick={deselectAll}>Deselect all</button>
                  </div>
                </div>

                <div className="selector-search-box">
                  <input
                    type="text"
                    className="col-search-input"
                    value={mergeSearch}
                    onChange={e => setMergeSearch(e.target.value)}
                    placeholder="Search columns to import..."
                  />
                </div>

                <div className="columns-checkbox-grid">
                  {secondaryData.headers
                    .map((h, i) => ({ h, i }))
                    .filter(({ h }) => !mergeSearch || h.toLowerCase().includes(mergeSearch.toLowerCase()))
                    .map(({ h, i }) => (
                      <label key={i} className={`column-checkbox-item ${selectedSecCols.includes(i) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedSecCols.includes(i)}
                          onChange={() => toggleCol(i)}
                        />
                        <span>{h}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
          )}

          {error && <div className="modal-error-text">{error}</div>}
        </div>

        <div className="submodal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {secondaryData && (
            <button type="button" className="button" onClick={executeMerge}>
              Merge {selectedSecCols.length} Columns
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FindReplaceModal({
  headers,
  rows,
  onApply,
  onClose
}: {
  headers: string[]
  rows: string[][]
  onApply: (newRows: string[][], matchCount: number) => void
  onClose: () => void
}) {
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [colIdx, setColIdx] = useState<number>(-1)
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)

  const matchCount = useMemo(() => {
    if (!findText) return 0
    const res = findAndReplace(rows, findText, replaceText, colIdx, matchCase, wholeWord)
    return res.matchCount
  }, [rows, findText, replaceText, colIdx, matchCase, wholeWord])

  const handleReplace = () => {
    if (!findText) return
    const res = findAndReplace(rows, findText, replaceText, colIdx, matchCase, wholeWord)
    onApply(res.rows, res.matchCount)
  }

  return (
    <div className="modal-backdrop centered-backdrop" onMouseDown={onClose}>
      <div className="modal spreadsheet-submodal" onMouseDown={e => e.stopPropagation()}>
        <header className="submodal-header">
          <h2>Find & Replace</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close"><X size={16} /></button>
        </header>

        <div className="submodal-body">
          <label className="submodal-field">
            <span>Find Text</span>
            <input
              type="text"
              value={findText}
              onChange={e => setFindText(e.target.value)}
              placeholder="Text to find..."
              autoFocus
            />
          </label>

          <label className="submodal-field">
            <span>Replace With</span>
            <input
              type="text"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder="Replacement text (leave blank to remove)..."
            />
          </label>

          <label className="submodal-field">
            <span>Search Scope</span>
            <select value={colIdx} onChange={e => setColIdx(Number(e.target.value))}>
              <option value={-1}>Entire Spreadsheet (All Columns)</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>Column: {h}</option>
              ))}
            </select>
          </label>

          <div className="checkbox-row-group">
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={e => setMatchCase(e.target.checked)}
              />
              <span>Match case (Exact capital letters)</span>
            </label>
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={e => setWholeWord(e.target.checked)}
              />
              <span>Match whole word only</span>
            </label>
          </div>

          <div className="match-counter-box">
            <span>Matches found: <b>{matchCount}</b></span>
          </div>
        </div>

        <div className="submodal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={!findText || matchCount === 0}
            onClick={handleReplace}
          >
            Replace All ({matchCount})
          </button>
        </div>
      </div>
    </div>
  )
}

function FormatModal({
  headers,
  rows,
  initialColIndex,
  onApply,
  onClose
}: {
  headers: string[]
  rows: string[][]
  initialColIndex: number
  onApply: (newRows: string[][], count: number, label: string) => void
  onClose: () => void
}) {
  const [colIdx, setColIdx] = useState(initialColIndex >= 0 ? initialColIndex : 0)
  const [formatType, setFormatType] = useState<ColumnFormatType>('currency-php')

  const formatOptions: { id: ColumnFormatType; label: string; sample: string }[] = [
    { id: 'currency-php', label: 'Philippine Peso (PHP)', sample: '15000 ➔ ₱ 15,000.00' },
    { id: 'number-commas', label: 'Number with Commas', sample: '15000.5 ➔ 15,000.50' },
    { id: 'number-integer', label: 'Whole Number (Integer)', sample: '15000.75 ➔ 15,001' },
    { id: 'percent', label: 'Percentage (%)', sample: '0.15 ➔ 15.00%' },
    { id: 'date-long', label: 'Date (Month Day, Year)', sample: '2026-09-05 ➔ September 5, 2026' },
    { id: 'date-short', label: 'Date (MM/DD/YYYY)', sample: '2026-09-05 ➔ 09/05/2026' },
    { id: 'date-iso', label: 'Date (YYYY-MM-DD)', sample: '9/5/2026 ➔ 2026-09-05' },
    { id: 'phone-ph', label: 'Philippine Mobile (Local)', sample: '09123456789 ➔ 0912-345-6789' },
    { id: 'phone-intl', label: 'Philippine Mobile (Intl)', sample: '09123456789 ➔ +63 912 345 6789' }
  ]

  const sampleComparison = useMemo(() => {
    const originalSamples = rows.slice(0, 3).map(r => r[colIdx] || '(empty)')
    const dummyRows = originalSamples.map(s => [s])
    const res = formatColumnCells(dummyRows, 0, formatType)
    return originalSamples.map((orig, i) => ({
      orig,
      formatted: res.rows[i][0]
    }))
  }, [rows, colIdx, formatType])

  const handleApply = () => {
    const res = formatColumnCells(rows, colIdx, formatType)
    const opt = formatOptions.find(o => o.id === formatType)
    onApply(res.rows, res.affectedCount, opt?.label || 'Formatted')
  }

  return (
    <div className="modal-backdrop centered-backdrop" onMouseDown={onClose}>
      <div className="modal spreadsheet-submodal" onMouseDown={e => e.stopPropagation()}>
        <header className="submodal-header">
          <h2>Format Column Values</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close"><X size={16} /></button>
        </header>

        <div className="submodal-body">
          <label className="submodal-field">
            <span>Select Target Column</span>
            <select value={colIdx} onChange={e => setColIdx(Number(e.target.value))}>
              {headers.map((h, i) => (
                <option key={i} value={i}>{h}</option>
              ))}
            </select>
          </label>

          <div className="format-options-grid">
            {formatOptions.map(opt => (
              <label
                key={opt.id}
                className={`format-card ${formatType === opt.id ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="formatType"
                  value={opt.id}
                  checked={formatType === opt.id}
                  onChange={() => setFormatType(opt.id)}
                />
                <div className="format-card-info">
                  <strong>{opt.label}</strong>
                  <small>{opt.sample}</small>
                </div>
              </label>
            ))}
          </div>

          <div className="formula-live-box">
            <span className="live-box-label">Live Sample on "{headers[colIdx]}":</span>
            <div className="live-box-list">
              {sampleComparison.map((item, i) => (
                <div key={i} className="live-box-row">
                  <span className="sample-in">{item.orig}</span>
                  <span className="sample-arrow">➔</span>
                  <span className="sample-out"><b>{item.formatted}</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="submodal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" onClick={handleApply}>
            Apply Format
          </button>
        </div>
      </div>
    </div>
  )
}

function Reports({ templates, saveTemplate, addRecent, notify, onDirtyChange, onSnapshotChange }: {
  templates: SavedTemplate[]
  saveTemplate: (x: SavedTemplate) => void
  addRecent: (x: RecentFile) => void
  notify: (s: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onSnapshotChange?: (snapshot: { label: string; summary: string; tool: 'reports'; payload: unknown } | null) => void
}) {
  const [draft] = useState<{ title?: string; period?: string; prepared?: string; office?: string; sections?: ReportSection[] }>(() => storage.getDraft('reports', {}))
  const [title, setTitle] = useState(draft.title || 'Monthly Activity Report')
  const [period, setPeriod] = useState(draft.period || '')
  const [prepared, setPrepared] = useState(draft.prepared || 'Mico')
  const [office, setOffice] = useState(draft.office || '')
  const [sections, setSections] = useState(draft.sections || defaultSections)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const lines = [period && `Reporting period: ${period}`, prepared && `Prepared by: ${prepared}`, office && `Office / Unit: ${office}`, '', ...sections.flatMap(s => [s.title, ...s.content.split('\n'), ''])].filter(Boolean) as string[]

  useEffect(() => {
    const isModified = Boolean(
      period.trim() ||
      office.trim() ||
      title !== 'Monthly Activity Report' ||
      sections.some(s => s.content.trim() !== '')
    )
    onDirtyChange?.(isModified)
    if (isModified) {
      const payload = { title, period, prepared, office, sections }
      storage.saveDraft('reports', payload)
      onSnapshotChange?.({
        label: title || 'Activity Report',
        summary: `${period ? `Period: ${period} • ` : ''}${sections.length} sections`,
        tool: 'reports',
        payload
      })
    } else {
      storage.clearDraft('reports')
      onSnapshotChange?.(null)
    }
  }, [title, period, office, sections, onDirtyChange, onSnapshotChange])

  const changeSection = (index: number, patch: Partial<ReportSection>) => setSections(sections.map((s, i) => i === index ? { ...s, ...patch } : s))
  const use = (template: SavedTemplate) => { const p = template.payload as { title: string; period: string; prepared: string; office: string; sections: ReportSection[] }; setTitle(p.title); setPeriod(p.period); setPrepared(p.prepared); setOffice(p.office); setSections(p.sections); setTemplatesOpen(false); notify('Report template loaded') }
  const save = () => { const name = prompt('Template name', title); if (name) saveTemplate({ id: id(), name, category: 'Report', updatedAt: new Date().toLocaleString(), payload: { title, period, prepared, office, sections } }) }
  return <div className="page workspace"><PageTitle title="Report Builder" subtitle="Build recurring reports with reusable sections."><div className="header-actions"><button className="button secondary" onClick={() => setTemplatesOpen(true)}><Copy size={16}/> Use previous</button><button className="button" onClick={save}><Save size={16}/> Save template</button></div></PageTitle><div className="editor-layout"><section className="field-panel report-fields"><label>Report title<input value={title} onChange={e => setTitle(e.target.value)}/></label><label>Reporting period<input value={period} onChange={e => setPeriod(e.target.value)} placeholder="August 2026"/></label><label>Prepared by<input value={prepared} onChange={e => setPrepared(e.target.value)}/></label><label>Office / Unit<input value={office} onChange={e => setOffice(e.target.value)}/></label><div className="section-editor-head"><b>Sections</b><button className="icon-button" title="Add section" onClick={() => setSections([...sections, { id: id(), title: 'New Section', content: '', type: 'Text' }])}><Plus size={17}/></button></div>{sections.map((s, i) => <div className="section-form" key={s.id}><div><input value={s.title} onChange={e => changeSection(i, { title: e.target.value })}/><button title="Delete section" onClick={() => setSections(sections.filter(x => x.id !== s.id))}><Trash2 size={14}/></button></div><textarea rows={4} value={s.content} onChange={e => changeSection(i, { content: e.target.value })} placeholder={`Write ${s.title.toLowerCase()}...`}/></div>)}</section><section className="preview-area"><div className="preview-toolbar"><span>Live A4 preview</span><span className="toolbar-spacer"/><button className="icon-button" title="Print" onClick={() => print()}><Printer size={17}/></button><button className="button secondary" onClick={() => { exportDocx(title, lines); addRecent({ id: id(), name: title, type: 'Report', modified: 'Just now' }) }}>DOCX</button><button className="button" onClick={() => { exportPdf(title, lines); addRecent({ id: id(), name: title, type: 'Report', modified: 'Just now' }) }}>PDF</button></div><Paper zoom={.75} lines={[title, '', ...lines]}/></section></div>{templatesOpen && <TemplateModal templates={templates.filter(t => t.category === 'Report')} load={use} close={() => setTemplatesOpen(false)} />}</div>
}

function Templates({ templates, useTemplate, remove }: { templates: SavedTemplate[]; useTemplate: (t: SavedTemplate) => void; remove: (id: string) => void }) { const [search, setSearch] = useState(''); const results = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase())); return <div className="page"><PageTitle title="Templates" subtitle="Your reusable documents, reports and certificates."/><SearchField value={search} onChange={setSearch} placeholder="Search templates"/>{results.length ? <div className="template-list">{results.map(t => <article key={t.id}><span className="template-icon">{t.category === 'Document' ? <FileText/> : t.category === 'Report' ? <BookOpenText/> : <Medal/>}</span><div><h3>{t.name}</h3><p>{t.category} · Updated {t.updatedAt}</p></div><button className="button secondary" onClick={() => useTemplate(t)}>Use</button><button className="icon-button" title="Duplicate" onClick={() => { storage.saveTemplate({ ...t, id: id(), name: `${t.name} copy`, updatedAt: new Date().toLocaleString() }); location.reload() }}><Copy size={16}/></button><button className="icon-button danger" title="Delete" onClick={() => remove(t.id)}><Trash2 size={16}/></button></article>)}</div> : <EmptyState title="No templates yet" text="Save a document, report, or certificate as a reusable template."/>}</div> }

function Archives({
  archives,
  restore,
  remove,
  clearAll
}: {
  archives: ArchivedItem[]
  restore: (item: ArchivedItem) => void
  remove: (id: string) => void
  clearAll: () => void
}) {
  const [search, setSearch] = useState('')
  const results = archives.filter(
    a =>
      a.label.toLowerCase().includes(search.toLowerCase()) ||
      a.toolTitle.toLowerCase().includes(search.toLowerCase()) ||
      (a.summary && a.summary.toLowerCase().includes(search.toLowerCase())) ||
      a.savedAt.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page archives-page">
      <PageTitle
        title="Archives"
        subtitle="Your saved snapshots and recovered project sessions with date and time."
      >
        {archives.length > 0 && (
          <button className="button danger-button" onClick={clearAll}>
            Clear all archives
          </button>
        )}
      </PageTitle>

      <SearchField value={search} onChange={setSearch} placeholder="Search archives by label, date, or tool..." />

      {results.length ? (
        <div className="template-list archive-list">
          {results.map(item => (
            <article key={item.id} className="archive-item">
              <span className="template-icon">
                {item.tool === 'documents' ? (
                  <FileText />
                ) : item.tool === 'spreadsheets' ? (
                  <FileSpreadsheet />
                ) : item.tool === 'reports' ? (
                  <BookOpenText />
                ) : (
                  <Medal />
                )}
              </span>
              <div className="archive-info">
                <div className="archive-meta-row">
                  <h3>{item.label}</h3>
                  <span className="archive-tool-badge">{item.toolTitle}</span>
                </div>
                <p className="archive-subtext">
                  <span>Saved: <b>{item.savedAt}</b></span>
                  {item.summary && <span> • {item.summary}</span>}
                </p>
              </div>
              <button className="button" onClick={() => restore(item)}>
                Open in tool
              </button>
              <button
                className="button danger-button"
                onClick={() => remove(item.id)}
                title="Delete this archive"
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={search ? 'No matching archives' : 'No saved archives yet'}
          text={
            search
              ? 'Try searching with a different keyword.'
              : 'When working on a spreadsheet, document, or certificate, you can save snapshots to your archives to recover anytime.'
          }
        />
      )}
    </div>
  )
}

function RecentFiles({ recent, setRecent }: { recent: RecentFile[]; setRecent: (items: RecentFile[]) => void }) { return <div className="page"><PageTitle title="Recent Files" subtitle="A lightweight history of work created in Office Toolkit."/>{recent.length ? <><RecentTable recent={recent}/><button className="button danger-button" onClick={() => { if (confirm('Clear all recent history?')) { storage.clearRecent(); setRecent([]) } }}>Clear recent history</button></> : <EmptyState title="No recent files yet" text="Files you work with will appear here."/>}</div> }
function RecentTable({ recent }: { recent: RecentFile[] }) { return <div className="recent-table"><div className="recent-header"><span>Name</span><span>Type</span><span>Modified</span><span>Action</span></div>{recent.map(item => <div className="recent-row" key={item.id}><span className="filename">{item.type === 'Spreadsheet' ? <FileSpreadsheet size={17}/> : <FileText size={17}/>} {item.name}</span><span><i className={`type-dot ${item.type.toLowerCase()}`}/>{item.type}</span><span>{item.modified}</span><span><button className="text-button" onClick={() => alert('This recent entry stores metadata only. Re-import the original file to open it again.')}>Open</button><button className="more-button" title="More actions"><MoreHorizontal size={17}/></button></span></div>)}</div> }

function Settings({
  theme,
  setTheme,
  clearRecent,
  templates,
  clearTemplates,
  archives,
  clearArchives,
  currentUser,
  onOpenAuth,
  onSignOut,
  onOpenOnboarding,
  onResetAllData
}: {
  theme: string
  setTheme: (v: string) => void
  clearRecent: () => void
  templates: SavedTemplate[]
  clearTemplates: () => void
  archives: ArchivedItem[]
  clearArchives: () => void
  currentUser: UserProfile | null
  onOpenAuth: (tab?: 'login' | 'register' | 'forgot') => void
  onSignOut: () => void
  onOpenOnboarding?: () => void
  onResetAllData: () => void
}) {
  const config = getSupabaseConfig()

  return (
    <div className="page settings">
      <PageTitle title="Settings" subtitle="Personalize Office Toolkit, manage cloud accounts, and local data." />

      <section>
        <h2>Account & Cloud Database</h2>
        <p>Supabase Authentication and Team Management</p>
        <div className="settings-account-card">
          <div className="settings-account-header">
            <div>
              <strong>{currentUser ? (currentUser.full_name || currentUser.email) : 'Not Signed In'}</strong>
              <small>
                {currentUser
                  ? `Logged in as ${currentUser.role === 'admin' ? 'Administrator' : 'Staff Member'} (${currentUser.email})`
                  : 'Sign in to access team tools and role-based permissions.'}
              </small>
            </div>
            <span className={`status-badge ${config.isConfigured ? 'active' : 'disabled'}`}>
              {config.isConfigured ? 'Supabase Connected' : 'Local Mode'}
            </span>
          </div>

          <div className="header-actions" style={{ marginTop: '12px' }}>
            {currentUser ? (
              <button type="button" className="button secondary" onClick={onSignOut}>
                Sign Out
              </button>
            ) : (
              <button type="button" className="button" onClick={() => onOpenAuth('login')}>
                Sign In / Register
              </button>
            )}
            {onOpenOnboarding && (
              <button
                type="button"
                className="button secondary"
                onClick={onOpenOnboarding}
              >
                Replay Welcome Tour
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>Appearance</h2>
        <p>Theme</p>
        <div className="segmented">
          {['light', 'dark', 'system'].map(x => (
            <button key={x} className={theme === x ? 'selected' : ''} onClick={() => setTheme(x)}>
              {x[0].toUpperCase() + x.slice(1)}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Files</h2>
        <label className="toggle-row">
          <span>Remember recent files<small>Store only metadata for imported files.</small></span>
          <input type="checkbox" defaultChecked />
        </label>
        <label>Default export format
          <select defaultValue="PDF">
            <option>PDF</option>
            <option>DOCX</option>
            <option>Excel</option>
          </select>
        </label>
      </section>
      <section>
        <h2>Privacy</h2>
        <div className="privacy-block">
          <LocalBadge />
          <p>Core document and spreadsheet operations are processed in your browser on this device. Office Toolkit does not automatically send your files anywhere.</p>
        </div>
      </section>
      <section>
        <h2>Storage</h2>
        <div className="storage-list">
          <span>Saved templates <b>{templates.length}</b></span>
          <span>Archived sessions <b>{archives.length}</b></span>
          <span>Recent metadata <b>{storage.recent().length}</b></span>
        </div>
        <div className="header-actions">
          <button type="button" className="button secondary" onClick={clearRecent}>Clear recent history</button>
          <button type="button" className="button secondary" onClick={clearArchives}>Clear archives</button>
          <button type="button" className="button secondary" onClick={clearTemplates}>Clear templates</button>
          <button type="button" className="button danger-button" onClick={onResetAllData}>Reset all local data</button>
        </div>
      </section>
      <section>
        <h2>About</h2>
        <p>Office Toolkit</p>
        <small>Personal productivity utilities for repetitive office work. Version 0.1.0</small>
      </section>
    </div>
  )
}

function TemplateModal({ templates, load, close }: { templates: SavedTemplate[]; load: (t: SavedTemplate) => void; close: () => void }) { return <Modal title="Choose a template" close={close}>{templates.length ? <div className="template-picker">{templates.map(t => <button key={t.id} onClick={() => load(t)}><LayoutTemplate size={18}/><span><strong>{t.name}</strong><small>Updated {t.updatedAt}</small></span><ChevronRight size={17}/></button>)}</div> : <EmptyState title="No saved templates" text="Save your current work as a template to use it again."/>}</Modal> }

function CommandPalette({ close, open, isAdmin }: { close: () => void; open: (page: Page) => void; isAdmin?: boolean }) {
  const [query, setQuery] = useState('')
  const actions: { name: string; page: Page; icon: typeof FileText }[] = [
    { name: 'New Document', page: 'documents', icon: FileText },
    { name: 'Import Spreadsheet', page: 'spreadsheets', icon: FileSpreadsheet },
    { name: 'New Report', page: 'reports', icon: BookOpenText },
    { name: 'Generate Certificates', page: 'certificates', icon: Medal },
    { name: 'Open Templates', page: 'templates', icon: LayoutTemplate },
    { name: 'Open Archives', page: 'archives', icon: Archive },
    { name: 'Open Recent Files', page: 'recent', icon: FileText },
    { name: 'Settings', page: 'settings', icon: FileText },
    ...(isAdmin ? [{ name: 'Admin Console', page: 'admin' as Page, icon: ShieldCheck }] : [])
  ]
  const filtered = actions.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <Modal title="Command menu" close={close}>
      <SearchField value={query} onChange={setQuery} placeholder="Search commands..." />
      <div className="command-list">
        {filtered.map(a => (
          <button key={a.name} onClick={() => open(a.page)}>
            <a.icon size={17} />
            {a.name}
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </Modal>
  )
}

function ConfirmLeaveModal({
  currentPage,
  targetPage,
  activeSnapshot,
  onArchiveAndLeave,
  onConfirmLeave,
  onCancel
}: {
  currentPage: Page
  targetPage: Page | null
  activeSnapshot: { label: string; summary: string; tool: 'documents' | 'spreadsheets' | 'reports' | 'certificates'; payload: unknown } | null
  onArchiveAndLeave: (label: string) => void
  onConfirmLeave: () => void
  onCancel: () => void
}) {
  const currentLabel = toolNames[currentPage] || currentPage
  const targetLabel = targetPage ? (toolNames[targetPage] || targetPage) : 'another page'
  const [label, setLabel] = useState(activeSnapshot?.label || `${currentLabel} Session`)

  const defaultTimestamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  return (
    <div className="modal-backdrop centered-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm-leave-modal"
        onMouseDown={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
      >
        <div className="confirm-leave-body">
          <div className="confirm-leave-icon">
            <AlertTriangle size={24} />
          </div>
          <div className="confirm-leave-text">
            <h2 id="confirm-modal-title">Leave with unsaved work?</h2>
            <p id="confirm-modal-desc">
              You have active work in <strong>{currentLabel}</strong>. Leaving to go to <strong>{targetLabel}</strong> will reset your active session.
            </p>
          </div>
        </div>

        {activeSnapshot && (
          <div className="archive-prompt-card">
            <div className="archive-prompt-header">
              <span className="archive-prompt-title">Add to Archives</span>
              <span className="archive-auto-time">{defaultTimestamp}</span>
            </div>
            <label className="archive-input-label">
              <span>Archive Label:</span>
              <input
                type="text"
                className="archive-label-input"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Name this session..."
              />
            </label>
            <p className="archive-prompt-hint">
              {activeSnapshot.summary}
            </p>
          </div>
        )}

        <div className="confirm-leave-actions column">
          {activeSnapshot && (
            <button
              type="button"
              className="button confirm-archive-btn"
              onClick={() => onArchiveAndLeave(label)}
            >
              Archive & Continue
            </button>
          )}
          <div className="confirm-leave-sub-actions">
            <button type="button" className="button secondary" onClick={onCancel} autoFocus>
              Stay on {currentLabel}
            </button>
            <button type="button" className="button danger-button confirm-danger-btn" onClick={onConfirmLeave}>
              Discard & Leave
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
