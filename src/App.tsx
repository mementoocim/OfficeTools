import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowUp, ArrowUpDown, BookOpenText, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileDown, FileSpreadsheet, FileText, Keyboard, LayoutTemplate, Loader2, Medal, Plus, Printer, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import { AppSidebar } from './components/AppSidebar'
import { HelpAssistant } from './components/HelpAssistant'
import { AutoSaveStatus, CrashRecoveryBanner, EmptyState, LocalBadge, Modal, PageTitle, SearchField, ToolCard } from './components/Common'
import type { ArchivedItem, CertificateData, DocumentData, ImportStatus, Page, RecentFile, ReportSection, SavedTemplate, SpreadsheetData } from './types'
import { storage, type StoredDraft } from './lib/storage'
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
import { exportBulkDocumentsZip, exportDocx, exportPdf } from './lib/export'
import { AuthModal } from './components/AuthModal'
import { AuthScreen } from './components/AuthScreen'
import { OnboardingModal } from './components/OnboardingModal'
import { AdminPanel } from './components/AdminPanel'
import { getSupabaseClient, getSupabaseConfig } from './lib/supabase'
import { fetchUserProfile, logoutUser } from './lib/auth'
import type { UserProfile } from './types/auth'

const Certificates = lazy(() => import('./components/Certificates').then(module => ({ default: module.Certificates })))

const id = () => crypto.randomUUID()
const initialDocument: DocumentData = { type: 'Letter', date: new Date().toLocaleDateString('en-CA'), recipientName: '', recipientPosition: '', organization: '', address: '', subject: '', greeting: 'Dear Sir/Madam,', body: 'I am writing to respectfully submit this letter for your consideration.', closing: 'Respectfully yours,', senderName: 'Mico', senderPosition: '', pageSize: 'A4', margins: 'standard', fontFamily: 'Georgia', fontSize: 12 }
const documentTemplate = (data: Partial<DocumentData>): DocumentData => ({ ...initialDocument, ...data })
const builtInDocumentTemplates: { id: string; name: string; description: string; data: DocumentData }[] = [
  { id: 'formal-letter', name: 'Formal Letter', description: 'General-purpose official correspondence.', data: documentTemplate({ subject: 'Request for [Subject]', body: 'I am writing to respectfully request [details of your request].\n\nYour favorable consideration on this matter would be greatly appreciated.' }) },
  { id: 'memorandum', name: 'Memorandum', description: 'Internal office communication and directives.', data: documentTemplate({ type: 'Memorandum', greeting: '', closing: '', subject: '[Subject]', body: 'This is to inform all concerned of the following:\n\n[State the purpose, instructions, and relevant details.]\n\nFor your information and guidance.' }) },
  { id: 'endorsement', name: 'Endorsement Letter', description: 'Forward a request or document for action.', data: documentTemplate({ type: 'Endorsement', subject: 'Endorsement of [Document / Request]', body: 'Respectfully forwarded is the attached [document / request] for your appropriate action.\n\nFor your consideration.' }) },
  { id: 'certification', name: 'Certification', description: 'Certify an office record, fact, or service.', data: documentTemplate({ type: 'Certification', greeting: 'To Whom It May Concern:', subject: 'Certification', body: 'This is to certify that [name / record / fact] is true and correct based on the records of this Office.\n\nThis certification is issued upon the request of the concerned party for whatever lawful purpose it may serve.' }) },
  { id: 'invitation', name: 'Invitation Letter', description: 'Invite a recipient to an office event.', data: documentTemplate({ type: 'Invitation', subject: 'Invitation to [Event]', body: 'We are pleased to invite you to [event] on [date] at [time], to be held at [venue].\n\nYour presence and participation will be greatly appreciated.' }) },
  { id: 'transmittal', name: 'Transmittal Letter', description: 'Transmit records, reports, or attachments.', data: documentTemplate({ type: 'Transmittal', subject: 'Transmittal of [Document]', body: 'Respectfully transmitted is the attached [document / report] for your reference and appropriate action.\n\nPlease acknowledge receipt.' }) }
]
type DocumentPageSetup = { pageSize: 'A4' | 'Letter' | 'Legal'; margins: 'standard' | 'narrow' | 'wide'; fontFamily: string; fontSize: number }
const pageSetupFor = (document: DocumentData): DocumentPageSetup => ({
  pageSize: document.pageSize || 'A4',
  margins: document.margins || 'standard',
  fontFamily: document.fontFamily || 'Georgia',
  fontSize: document.fontSize || 12
})
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
  const [templateToOpen, setTemplateToOpen] = useState<SavedTemplate | null>(null)
  const [theme, setTheme] = useState<string>(String(storage.settings().theme || 'system'))
  const [accent, setAccent] = useState<string>(String(storage.settings().accent || 'blue'))
  const [rememberRecent, setRememberRecent] = useState(Boolean(storage.settings().rememberRecent ?? true))
  const [defaultExport, setDefaultExport] = useState<string>(String(storage.settings().defaultExport || 'PDF'))
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
          if (profile.status !== 'active') {
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
        if (profile.status !== 'active') {
          await supabase.auth.signOut()
          setCurrentUser(null)
          notify(profile.status === 'pending' ? 'Your account is awaiting administrator approval.' : 'Your account has been deactivated.')
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
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = accent
    storage.saveSettings({ ...storage.settings(), theme, accent, rememberRecent, defaultExport })
  }, [theme, accent, rememberRecent, defaultExport])
  useEffect(() => { const keydown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(true) } }; addEventListener('keydown', keydown); return () => removeEventListener('keydown', keydown) }, [])
  const addRecent = (file: RecentFile) => {
    if (!rememberRecent) return
    storage.saveRecent(file)
    setRecent(storage.recent())
  }
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
      {page === 'home' && <Home setPage={setPage} recent={recent} setRecent={setRecent} currentUser={currentUser} />}
      {page === 'documents' && <Documents templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} defaultExport={defaultExport} pendingTemplate={templateToOpen?.category === 'Document' ? templateToOpen : null} onTemplateApplied={() => setTemplateToOpen(null)} notify={notify} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'spreadsheets' && <Spreadsheets addRecent={addRecent} defaultExport={defaultExport} notify={notify} onImportStatus={handleImportStatus} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'reports' && <Reports templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} defaultExport={defaultExport} pendingTemplate={templateToOpen?.category === 'Report' ? templateToOpen : null} onTemplateApplied={() => setTemplateToOpen(null)} notify={notify} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} />}
      {page === 'certificates' && <Suspense fallback={<div className="page workspace"><div className="workspace-loading">Loading certificate workspace…</div></div>}><Certificates templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} pendingTemplate={templateToOpen?.category === 'Certificate' ? templateToOpen : null} onTemplateApplied={() => setTemplateToOpen(null)} notify={notify} onImportStatus={handleImportStatus} onDirtyChange={setDirty} onSnapshotChange={setActiveSnapshot} /></Suspense>}
      {page === 'templates' && <Templates templates={templates} useTemplate={(t) => { setTemplateToOpen(t); setPage(t.category === 'Document' ? 'documents' : t.category === 'Report' ? 'reports' : 'certificates') }} remove={removeTemplate} />}
      {page === 'archives' && <Archives archives={archives} restore={restoreArchive} remove={deleteArchive} clearAll={clearAllArchives} />}
      {page === 'recent' && <RecentFiles recent={recent} setRecent={setRecent} />}
      {page === 'settings' && (
        <Settings
          theme={theme}
          setTheme={setTheme}
          accent={accent}
          setAccent={setAccent}
          rememberRecent={rememberRecent}
          setRememberRecent={setRememberRecent}
          defaultExport={defaultExport}
          setDefaultExport={setDefaultExport}
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
      {page === 'admin' && (
        currentUser.role === 'admin'
          ? <AdminPanel currentUser={currentUser} onNotify={notify} />
          : <div className="page"><PageTitle title="Admin Console" subtitle="This area is restricted to administrators." /><EmptyState title="Administrator access required" text="Your account does not have permission to manage users or database settings." /></div>
      )}
    </main>
    <button className="command-hint" onClick={() => setCommandOpen(true)}>Command menu <kbd>Ctrl K</kbd></button>
    <HelpAssistant page={page} />
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

function Home({ setPage, recent, setRecent, currentUser }: { setPage: (page: Page) => void; recent: RecentFile[]; setRecent: (f: RecentFile[]) => void; currentUser: UserProfile | null }) {
  const hour = new Date().getHours(); const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const fullName = currentUser?.full_name?.trim()
  const givenName = fullName?.includes(',') ? fullName.split(',')[1]?.trim().split(/\s+/)[0] : fullName?.split(/\s+/)[0]
  const displayName = givenName || currentUser?.email?.split('@')[0] || 'there'
  return <div className="page home"><PageTitle title={`${greeting}, ${displayName}.`} subtitle="What would you like to work on?" /><section><div className="section-heading"><h2>Quick Tools</h2><LocalBadge /></div><div className="tool-grid">
    <ToolCard title="Document Generator" text="Create letters, reports and certificates" artwork="/dashboard-assets/document-generator.png" tone="tool-card-document" action={() => setPage('documents')} />
    <ToolCard title="Spreadsheet Tools" text="Clean • Merge • Filter • Convert" artwork="/dashboard-assets/spreadsheet-tools.png" tone="tool-card-spreadsheet" action={() => setPage('spreadsheets')} />
    <ToolCard title="Report Builder" text="Generate recurring reports" artwork="/dashboard-assets/report-builder.png" tone="tool-card-report" action={() => setPage('reports')} />
    <ToolCard title="Bulk Certificate Generator" text="Excel → Certificates → PDF" artwork="/dashboard-assets/certificate-generator.png" tone="tool-card-certificate" action={() => setPage('certificates')} />
  </div></section><section className="recent-section"><div className="section-heading"><h2>Recent Files</h2>{recent.length > 0 && <button className="text-button" onClick={() => { if (confirm('Clear recent history?')) { storage.clearRecent(); setRecent([]) } }}>Clear history</button>}</div>{recent.length ? <RecentTable recent={recent.slice(0, 5)} /> : <EmptyState title="No recent files yet" text="Files and projects you work with will appear here." />}</section></div>
}

function Documents({ templates, saveTemplate, addRecent, defaultExport, pendingTemplate, onTemplateApplied, notify, onDirtyChange, onSnapshotChange }: {
  templates: SavedTemplate[]
  saveTemplate: (x: SavedTemplate) => void
  addRecent: (x: RecentFile) => void
  defaultExport: string
  pendingTemplate: SavedTemplate | null
  onTemplateApplied: () => void
  notify: (s: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onSnapshotChange?: (snapshot: { label: string; summary: string; tool: 'documents'; payload: unknown } | null) => void
}) {
  const initialSnapshot = useRef<StoredDraft<DocumentData> | null>(storage.getDraftSnapshot<DocumentData>('documents')).current
  const hasUnsavedWork = Boolean(
    initialSnapshot &&
    initialSnapshot.data &&
    (
      initialSnapshot.data.recipientName?.trim() ||
      initialSnapshot.data.recipientPosition?.trim() ||
      initialSnapshot.data.organization?.trim() ||
      initialSnapshot.data.address?.trim() ||
      initialSnapshot.data.subject?.trim() ||
      initialSnapshot.data.senderPosition?.trim() ||
      (initialSnapshot.data.body && initialSnapshot.data.body.trim() !== initialDocument.body.trim())
    )
  )

  const [recoveredDraft, setRecoveredDraft] = useState<StoredDraft<DocumentData> | null>(hasUnsavedWork ? initialSnapshot : null)
  const [doc, setDoc] = useState<DocumentData>(initialDocument)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.75)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const canvasEditorRef = useRef<HTMLElement>(null)
  const update = (field: keyof DocumentData, value: string) => setDoc({ ...doc, [field]: value })
  const title = doc.subject || `${doc.type} document`
  const lines = documentLines(doc)
  const pageSetup = pageSetupFor(doc)
  const exportOptions = { ...pageSetup, includeTitle: false }

  useEffect(() => {
    const editor = canvasEditorRef.current
    if (!editor) return
    if (editor.contains(document.activeElement)) return
    const html = documentCanvasHtml(doc)
    if (editor.innerHTML !== html) editor.innerHTML = html
  }, [doc])

  const syncDocumentCanvas = () => {
    const editor = canvasEditorRef.current
    if (!editor) return
    const fieldValue = (field: keyof DocumentData) => editor.querySelector(`[data-field="${field}"]`)?.textContent?.trim() || ''
    const body = editor.querySelector('[data-field="body"]') as HTMLElement | null
    setDoc(current => ({
      ...current,
      date: fieldValue('date'),
      recipientName: fieldValue('recipientName'),
      recipientPosition: fieldValue('recipientPosition'),
      organization: fieldValue('organization'),
      address: fieldValue('address'),
      subject: fieldValue('subject'),
      greeting: fieldValue('greeting'),
      body: richBodyHtml(body?.innerHTML || ''),
      closing: fieldValue('closing'),
      senderName: fieldValue('senderName'),
      senderPosition: fieldValue('senderPosition')
    }))
  }
  const runEditorCommand = (command: string, value?: string) => {
    const editor = canvasEditorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command, false, value)
    syncDocumentCanvas()
  }
  const setLineHeight = (value: string) => {
    const selection = window.getSelection()
    const anchor = selection?.anchorNode
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor?.parentElement
    const block = element?.closest('p, div, li, h1, h2, h3') as HTMLElement | null
    if (!block) return
    block.style.lineHeight = value
    syncDocumentCanvas()
  }
  const insertPageBreak = () => runEditorCommand('insertHTML', '<hr class="page-break" /><p><br /></p>')

  useEffect(() => {
    if (!pendingTemplate) return
    setDoc(pendingTemplate.payload as DocumentData)
    setRecoveredDraft(null)
    setLastSaved(null)
    onTemplateApplied()
    notify(`Loaded "${pendingTemplate.name}" template`)
  }, [pendingTemplate?.id])

  const handleRestore = () => {
    if (recoveredDraft?.data) {
      setDoc(recoveredDraft.data)
      setLastSaved(recoveredDraft.savedAt)
      setRecoveredDraft(null)
      notify('Draft restored from previous session')
    }
  }

  const handleDiscard = () => {
    storage.clearDraft('documents')
    setRecoveredDraft(null)
    setDoc(initialDocument)
    setLastSaved(null)
    notify('Draft discarded. Started blank document.')
  }

  const handleNewDocument = () => {
    const isModified = Boolean(
      doc.recipientName.trim() ||
      doc.recipientPosition.trim() ||
      doc.organization.trim() ||
      doc.address.trim() ||
      doc.subject.trim() ||
      doc.senderPosition.trim() ||
      doc.body.trim() !== initialDocument.body.trim()
    )
    if (isModified && !confirm('Start a new document? Any unsaved changes in the current draft will be reset.')) {
      return
    }
    storage.clearDraft('documents')
    setDoc(initialDocument)
    setLastSaved(null)
    setRecoveredDraft(null)
    notify('Created new blank document')
  }

  useEffect(() => {
    if (recoveredDraft) return

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
      const savedTime = storage.saveDraft('documents', doc, doc.subject || `${doc.type} document`)
      setLastSaved(savedTime)
      onSnapshotChange?.({
        label: doc.subject.trim() || `${doc.type} (${doc.recipientName || 'Untitled'})`,
        summary: `${doc.type} • ${doc.recipientName ? `To: ${doc.recipientName}` : 'In progress'}`,
        tool: 'documents',
        payload: doc
      })
    } else {
      storage.clearDraft('documents')
      setLastSaved(null)
      onSnapshotChange?.(null)
    }
  }, [doc, recoveredDraft, onDirtyChange, onSnapshotChange])

  const loadTemplate = (template: SavedTemplate) => {
    setDoc(template.payload as DocumentData)
    setTemplateOpen(false)
    setRecoveredDraft(null)
    notify('Template loaded')
  }
  const loadBuiltInTemplate = (template: DocumentData) => {
    setDoc({ ...template, date: new Date().toLocaleDateString('en-CA') })
    setTemplateOpen(false)
    setRecoveredDraft(null)
    notify('Office template loaded')
  }
  const save = () => { const name = prompt('Template name', doc.subject || 'Untitled Letter'); if (name) saveTemplate({ id: id(), name, category: 'Document', updatedAt: new Date().toLocaleString(), payload: doc }) }
  const record = () => addRecent({ id: id(), name: title, type: 'Document', modified: 'Just now' })
  const printDocument = () => {
    const style = document.createElement('style')
    style.textContent = `@page { size: ${pageSetup.pageSize}; margin: 0; }`
    document.head.append(style)
    const cleanup = () => style.remove()
    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
    window.setTimeout(cleanup, 1000)
  }
  return (
    <div className="page workspace">
      <PageTitle title="Document Generator" subtitle="Create polished office documents in a few focused steps">
        <div className="header-actions">
          <LocalBadge />
          <button type="button" className="button secondary" onClick={handleNewDocument}>
            New Document
          </button>
          <button className="button secondary" onClick={() => setPageSetupOpen(true)}>Page setup</button>
          <button className="button secondary" onClick={() => setTemplateOpen(true)}>Templates</button>
          <button className="button secondary" onClick={() => setBulkOpen(true)}>Bulk generate</button>
          <button className="button" onClick={save}>Save template</button>
        </div>
      </PageTitle>

      {recoveredDraft && (
        <CrashRecoveryBanner
          savedAt={recoveredDraft.savedAt}
          title={recoveredDraft.title || (recoveredDraft.data?.subject ? recoveredDraft.data.subject : undefined)}
          onRestore={handleRestore}
          onDiscard={handleDiscard}
        />
      )}

      <div className="editor-layout document-canvas-layout">
        <section className="preview-area document-editor-preview">
          <div className="preview-toolbar">
            <button className="icon-button" onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="icon-button" onClick={() => setZoom(Math.min(1, zoom + .1))}>+</button>
            <button className="text-button" onClick={() => setZoom(.75)}>Fit page</button>
            <span className="toolbar-spacer"/>
            <AutoSaveStatus lastSaved={lastSaved} isDirty={Boolean(lastSaved)} />
            <button className="icon-button" title="Print" onClick={printDocument}><Printer size={17}/></button>
            <button className={defaultExport === 'DOCX' ? 'button' : 'button secondary'} onClick={() => { exportDocx(title, lines, exportOptions); record() }}>DOCX</button>
            <button className={defaultExport === 'PDF' ? 'button' : 'button secondary'} onClick={() => { exportPdf(title, lines, exportOptions); record() }}>PDF</button>
          </div>
          <div className="rich-editor-toolbar canvas-rich-editor-toolbar" role="toolbar" aria-label="Document text formatting">
            <select aria-label="Font family" value={pageSetup.fontFamily} onChange={event => setDoc(current => ({ ...current, fontFamily: event.target.value }))}>
              <option value="Calibri">Calibri</option><option value="Aptos">Aptos</option><option value="Times New Roman">Times New Roman</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option>
            </select>
            <input className="rich-font-size" aria-label="Font size in points" type="number" min="6" max="72" step="1" value={pageSetup.fontSize} onChange={event => { const size = Number(event.target.value); if (Number.isFinite(size)) setDoc(current => ({ ...current, fontSize: size })) }} />
            <select aria-label="Text style" defaultValue="p" onChange={event => runEditorCommand('formatBlock', event.target.value)}>
              <option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option>
            </select>
            <button type="button" className="rich-toolbar-button" title="Bold" aria-label="Bold" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('bold')}><b>B</b></button>
            <button type="button" className="rich-toolbar-button" title="Italic" aria-label="Italic" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('italic')}><i>I</i></button>
            <button type="button" className="rich-toolbar-button" title="Underline" aria-label="Underline" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('underline')}><u>U</u></button>
            <button type="button" className="rich-toolbar-button" title="Bulleted list" aria-label="Bulleted list" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('insertUnorderedList')}>•</button>
            <button type="button" className="rich-toolbar-button" title="Numbered list" aria-label="Numbered list" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('insertOrderedList')}>1.</button>
            <button type="button" className="rich-toolbar-button" title="Align left" aria-label="Align left" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('justifyLeft')}>≡</button>
            <button type="button" className="rich-toolbar-button" title="Align center" aria-label="Align center" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('justifyCenter')}>≡</button>
            <button type="button" className="rich-toolbar-button" title="Align right" aria-label="Align right" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('justifyRight')}>≡</button>
            <select aria-label="Line spacing" defaultValue="1.5" onChange={event => setLineHeight(event.target.value)}><option value="1.25">Tight</option><option value="1.5">Normal</option><option value="1.8">Relaxed</option></select>
            <button type="button" className="rich-toolbar-button rich-page-break-button" title="Insert page break" onMouseDown={event => event.preventDefault()} onClick={insertPageBreak}>Page break</button>
          </div>
          <DocumentPaper zoom={zoom} canvasEditorRef={canvasEditorRef} onBlur={syncDocumentCanvas} pageSetup={pageSetup}/>
        </section>
      </div>
      {pageSetupOpen && <DocumentPageSetupModal setup={pageSetup} onChange={changes => setDoc(current => ({ ...current, ...changes }))} close={() => setPageSetupOpen(false)} />}
      {templateOpen && <DocumentTemplateModal templates={templates.filter(t => t.category === 'Document')} loadBuiltIn={loadBuiltInTemplate} loadSaved={loadTemplate} close={() => setTemplateOpen(false)} />}
      {bulkOpen && <BulkDocumentModal document={doc} onClose={() => setBulkOpen(false)} onComplete={(count, format) => { addRecent({ id: id(), name: `${title} (${count} documents)`, type: 'Document', modified: 'Just now' }); notify(`Downloaded ${count} personalized ${format.toUpperCase()} documents in a ZIP file`) }} />}
    </div>
  )
}

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') }
function plainTextToRichHtml(value: string) {
  const paragraphs = (value || '').split(/\n\s*\n/)
  return paragraphs.map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />') || '<br />'}</p>`).join('') || '<p><br /></p>'
}
function richBodyHtml(value: string) {
  if (!/<[a-z][\s\S]*>/i.test(value)) return plainTextToRichHtml(value)
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const allowed = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'font', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr'])
  const cleanNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    if (!allowed.has(tag)) return escapeHtml(element.textContent || '')
    const content = Array.from(element.childNodes).map(cleanNode).join('')
    if (tag === 'br') return '<br />'
    if (tag === 'hr') return '<hr class="page-break" />'
    const outputTag = tag === 'font' ? 'span' : tag
    const styles: string[] = []
    if (['left', 'center', 'right', 'justify'].includes(element.style.textAlign)) styles.push(`text-align:${element.style.textAlign}`)
    if (/^(1\.25|1\.5|1\.8)$/.test(element.style.lineHeight)) styles.push(`line-height:${element.style.lineHeight}`)
    const fontFamily = (element.style.fontFamily || element.getAttribute('face') || '').replace(/["']/g, '').trim()
    if (['Calibri', 'Aptos', 'Times New Roman', 'Arial', 'Georgia', 'Verdana', 'Tahoma'].includes(fontFamily)) styles.push(`font-family:${fontFamily}`)
    return `<${outputTag}${styles.length ? ` style="${styles.join(';')}"` : ''}>${content}</${outputTag}>`
  }
  const html = Array.from(parsed.body.childNodes).map(cleanNode).join('')
  return html || '<p><br /></p>'
}
function richBodyLines(value: string) {
  const parsed = new DOMParser().parseFromString(richBodyHtml(value), 'text/html')
  const lines: string[] = []
  Array.from(parsed.body.children).forEach((element, index, elements) => {
    const tag = element.tagName.toLowerCase()
    if (tag === 'hr') { lines.push('\f'); return }
    if (tag === 'ul' || tag === 'ol') Array.from(element.children).forEach((item, index) => lines.push(`${tag === 'ol' ? `${index + 1}.` : '•'} ${item.textContent?.trim() || ''}`))
    else lines.push(element.textContent?.trim() || '')
    if (index < elements.length - 1 && ['p', 'div', 'h1', 'h2', 'h3'].includes(tag)) lines.push('')
  })
  return lines
}
function documentLines(doc: DocumentData) {
  if (doc.type === 'Memorandum') return ['MEMORANDUM', '', `TO: ${doc.recipientName}`, `FROM: ${doc.senderName}`, `DATE: ${doc.date}`, `SUBJECT: ${doc.subject}`, '', ...richBodyLines(doc.body)].filter((x, i, arr) => x || x === '\f' || (i > 0 && arr[i - 1] !== ''))
  return [doc.date, '', doc.recipientName, doc.recipientPosition, doc.organization, doc.address, '', doc.subject ? `Subject: ${doc.subject}` : '', '', doc.greeting, '', ...richBodyLines(doc.body), '', doc.closing, '', doc.senderName, doc.senderPosition].filter((x, i, arr) => x || x === '\f' || (i > 0 && arr[i - 1] !== ''))
}
function canvasField(value: string, field: keyof DocumentData, placeholder?: string) { return `<p data-field="${field}"${placeholder ? ` data-placeholder="${placeholder}"` : ''}>${escapeHtml(value)}</p>` }
function canvasInlineField(value: string, field: keyof DocumentData, placeholder: string) { return `<span data-field="${field}" data-placeholder="${placeholder}">${escapeHtml(value)}</span>` }
function documentCanvasHtml(document: DocumentData) {
  if (document.type === 'Memorandum') return `<div class="document-memo-title">MEMORANDUM</div><div class="document-memo-meta"><p><strong>TO:</strong> ${canvasInlineField(document.recipientName, 'recipientName', 'Recipient name')}</p><p><strong>FROM:</strong> ${canvasInlineField(document.senderName, 'senderName', 'Sender name')}</p><p><strong>DATE:</strong> ${canvasInlineField(document.date, 'date', 'Date')}</p><p><strong>SUBJECT:</strong> ${canvasInlineField(document.subject, 'subject', 'Subject')}</p></div><div data-field="body" class="rich-document-body rich-body-editor">${richBodyHtml(document.body)}</div>`
  return `<div class="document-date-block">${canvasField(document.date, 'date')}</div><div class="document-recipient-block">${canvasField(document.recipientName, 'recipientName', 'Recipient name')}${canvasField(document.recipientPosition, 'recipientPosition', 'Recipient position')}${canvasField(document.organization, 'organization', 'Office / organization')}${canvasField(document.address, 'address', 'Address')}</div><div class="document-subject-block"><p class="subject-line">Subject: ${canvasInlineField(document.subject, 'subject', 'Subject')}</p></div><div class="document-greeting-block">${canvasField(document.greeting, 'greeting')}</div><div data-field="body" class="rich-document-body rich-body-editor">${richBodyHtml(document.body)}</div><div class="document-closing-block">${canvasField(document.closing, 'closing')}<div class="document-signature-space"></div>${canvasField(document.senderName, 'senderName', 'Sender name')}${canvasField(document.senderPosition, 'senderPosition', 'Sender position')}</div>`
}
function DocumentPaper({ zoom, canvasEditorRef, onBlur, pageSetup }: { zoom: number; canvasEditorRef: RefObject<HTMLElement | null>; onBlur: () => void; pageSetup: DocumentPageSetup }) {
  const dimensions = pageSetup.pageSize === 'Legal'
    ? { width: '215.9mm', height: '355.6mm', className: 'paper-legal' }
    : pageSetup.pageSize === 'Letter'
      ? { width: '215.9mm', height: '279.4mm', className: 'paper-letter' }
      : { width: '210mm', height: '297mm', className: 'paper-a4' }
  const margins = pageSetup.margins === 'narrow'
    ? '12.7mm'
    : pageSetup.margins === 'wide'
      ? '25.4mm 38.1mm'
      : '25.4mm'
  return <div className="paper-wrap"><article ref={canvasEditorRef} className={`paper document-paper ${dimensions.className}`} contentEditable suppressContentEditableWarning role="textbox" aria-label="Editable document canvas" aria-multiline="true" onBlur={onBlur} style={{ width: dimensions.width, minHeight: dimensions.height, padding: margins, fontFamily: pageSetup.fontFamily, fontSize: `${pageSetup.fontSize}pt`, transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: `${(zoom - 1) * 1080}px` }} /></div>
}
function Paper({ zoom, lines, certificate = false }: { zoom: number; lines: string[]; certificate?: boolean }) { return <div className={`paper-wrap ${certificate ? 'certificate-paper' : ''}`}><article className="paper" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: `${(zoom - 1) * 1080}px` }}>{certificate ? <div className="certificate-inner">{lines.map((line, i) => <p key={i} className={i === 0 ? 'certificate-title' : ''}>{line || ' '}</p>)}</div> : lines.map((line, i) => <p key={i} className={line.startsWith('Subject:') ? 'subject-line' : ''}>{line || ' '}</p>)}</article></div> }

function Spreadsheets({ addRecent, defaultExport, notify, onImportStatus, onDirtyChange, onSnapshotChange }: {
  addRecent: (x: RecentFile) => void
  defaultExport: string
  notify: (s: string) => void
  onImportStatus?: (status: ImportStatus | null) => void
  onDirtyChange?: (dirty: boolean) => void
  onSnapshotChange?: (snapshot: { label: string; summary: string; tool: 'spreadsheets'; payload: unknown } | null) => void
}) {
  const initialSnapshot = useRef<StoredDraft<SpreadsheetData> | null>(storage.getDraftSnapshot<SpreadsheetData>('spreadsheets')).current
  const hasUnsavedWork = Boolean(initialSnapshot && initialSnapshot.data && initialSnapshot.data.rows && initialSnapshot.data.rows.length > 0)

  const [recoveredDraft, setRecoveredDraft] = useState<StoredDraft<SpreadsheetData> | null>(hasUnsavedWork ? initialSnapshot : null)
  const [data, setData] = useState<SpreadsheetData | null>(null)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
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

  const syncActiveSheet = (next: SpreadsheetData): SpreadsheetData => {
    if (!next.workbook || !next.activeSheet) return next
    return {
      ...next,
      workbook: {
        ...next.workbook,
        [next.activeSheet]: { headers: next.headers, rows: next.rows }
      }
    }
  }

  const selectSheet = (sheetName: string) => {
    if (!data?.workbook || sheetName === data.activeSheet) return
    const current = syncActiveSheet(data)
    const target = current.workbook?.[sheetName]
    if (!target) return
    setData({ ...current, activeSheet: sheetName, headers: target.headers, rows: target.rows, addedColumns: [] })
    setHistory([])
    setSelectedCol(-1)
    setSortCol(null)
    setSortAsc(true)
    setSearch('')
    setShowSummary(false)
    notify(`Opened sheet "${sheetName}"`)
  }

  const handleRestore = () => {
    if (recoveredDraft?.data) {
      setData(recoveredDraft.data)
      setLastSaved(recoveredDraft.savedAt)
      setRecoveredDraft(null)
      notify('Spreadsheet restored from previous session')
    }
  }

  const handleDiscard = () => {
    storage.clearDraft('spreadsheets')
    setRecoveredDraft(null)
    setData(null)
    setLastSaved(null)
    notify('Draft discarded. Ready for new spreadsheet.')
  }

  const handleCloseSheet = () => {
    if (data && !confirm('Close active spreadsheet? Any unsaved changes will be cleared.')) {
      return
    }
    storage.clearDraft('spreadsheets')
    setData(null)
    setLastSaved(null)
    setRecoveredDraft(null)
    setSearch('')
    setSortCol(null)
    notify('Spreadsheet closed')
  }

  useEffect(() => {
    if (recoveredDraft) return
    const hasData = Boolean(data && data.rows.length > 0)
    onDirtyChange?.(hasData)
    if (hasData && data) {
      const savedTime = storage.saveDraft('spreadsheets', data, data.name || 'Spreadsheet Dataset')
      setLastSaved(savedTime)
      onSnapshotChange?.({
        label: data.name || 'Spreadsheet Dataset',
        summary: `${data.rows.length.toLocaleString()} rows • ${data.headers.length} cols`,
        tool: 'spreadsheets',
        payload: data
      })
    } else {
      storage.clearDraft('spreadsheets')
      setLastSaved(null)
      onSnapshotChange?.(null)
    }
  }, [data, recoveredDraft, onDirtyChange, onSnapshotChange])

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
    setData(syncActiveSheet({ ...data, rows }))

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

      {recoveredDraft && (
        <CrashRecoveryBanner
          savedAt={recoveredDraft.savedAt}
          title={recoveredDraft.title || (recoveredDraft.data?.name ? `${recoveredDraft.data.name} (${recoveredDraft.data.rows?.length.toLocaleString() || 0} rows)` : undefined)}
          onRestore={handleRestore}
          onDiscard={handleDiscard}
        />
      )}

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
              Browse files
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
                {data.rows.length.toLocaleString()} rows · {data.headers.length} columns · Sheet: {data.activeSheet || data.sheets[0]}
              </p>
              {data.sheets.length > 1 && (
                <label className="sheet-selector">
                  <span>Worksheet</span>
                  <select value={data.activeSheet || data.sheets[0]} onChange={e => selectSheet(e.target.value)}>
                    {data.sheets.map(sheetName => <option key={sheetName} value={sheetName}>{sheetName}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="header-actions">
              <AutoSaveStatus lastSaved={lastSaved} isDirty={Boolean(data)} />
              <button
                type="button"
                className="button secondary"
                onClick={handleCloseSheet}
              >
                Close Sheet
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  fileRef.current?.click()
                }}
              >
                Import another
              </button>
              <div className="export-group">
                <button className={defaultExport === 'Excel' ? 'button' : 'button secondary'} onClick={() => exportSpreadsheet(data, 'xlsx')}>
                  Export Excel
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
                Undo
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
                setData(syncActiveSheet({ ...data, headers: newHeaders, rows: newRows, addedColumns: updatedAdded }))
                setFormulaModalOpen(false)
                notify(isNewCol ? `Added calculated column "${colName}"` : `Updated column "${colName}"`)
              }}
              onAppendSummaryRow={(type, colIndices) => {
                setHistory([...history, data])
                const newRows = appendSummaryRow(data.headers, data.rows, type, colIndices)
                setData(syncActiveSheet({ ...data, rows: newRows }))
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
                setData(syncActiveSheet(merged))
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
                setData(syncActiveSheet({ ...data, rows: newRows }))
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
                setData(syncActiveSheet({ ...data, rows: newRows }))
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
                <small>Use numbers, column references, +, −, ×, ÷, %, parentheses, and SUM, AVG, or ROUND. Custom formulas are numeric only.</small>
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

function Reports({ templates, saveTemplate, addRecent, defaultExport, pendingTemplate, onTemplateApplied, notify, onDirtyChange, onSnapshotChange }: {
  templates: SavedTemplate[]
  saveTemplate: (x: SavedTemplate) => void
  addRecent: (x: RecentFile) => void
  defaultExport: string
  pendingTemplate: SavedTemplate | null
  onTemplateApplied: () => void
  notify: (s: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onSnapshotChange?: (snapshot: { label: string; summary: string; tool: 'reports'; payload: unknown } | null) => void
}) {
  const initialSnapshot = useRef<StoredDraft<{ title?: string; period?: string; prepared?: string; office?: string; sections?: ReportSection[] }> | null>(storage.getDraftSnapshot('reports')).current
  const hasUnsavedWork = Boolean(
    initialSnapshot &&
    initialSnapshot.data &&
    (
      initialSnapshot.data.period?.trim() ||
      initialSnapshot.data.office?.trim() ||
      (initialSnapshot.data.title && initialSnapshot.data.title !== 'Monthly Activity Report') ||
      (initialSnapshot.data.sections && initialSnapshot.data.sections.some(s => s.content.trim() !== ''))
    )
  )

  const [recoveredDraft, setRecoveredDraft] = useState(hasUnsavedWork ? initialSnapshot : null)
  const [title, setTitle] = useState('Monthly Activity Report')
  const [period, setPeriod] = useState('')
  const [prepared, setPrepared] = useState('Mico')
  const [office, setOffice] = useState('')
  const [sections, setSections] = useState(defaultSections())
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  useEffect(() => {
    if (!pendingTemplate) return
    const payload = pendingTemplate.payload as { title: string; period: string; prepared: string; office: string; sections: ReportSection[] }
    setTitle(payload.title)
    setPeriod(payload.period)
    setPrepared(payload.prepared)
    setOffice(payload.office)
    setSections(payload.sections)
    setRecoveredDraft(null)
    setLastSaved(null)
    onTemplateApplied()
    notify(`Loaded "${pendingTemplate.name}" template`)
  }, [pendingTemplate?.id])

  const handleRestore = () => {
    if (recoveredDraft?.data) {
      const d = recoveredDraft.data
      if (d.title) setTitle(d.title)
      if (d.period) setPeriod(d.period)
      if (d.prepared) setPrepared(d.prepared)
      if (d.office) setOffice(d.office)
      if (d.sections) setSections(d.sections)
      setLastSaved(recoveredDraft.savedAt)
      setRecoveredDraft(null)
      notify('Report draft restored from previous session')
    }
  }

  const handleDiscard = () => {
    storage.clearDraft('reports')
    setRecoveredDraft(null)
    setTitle('Monthly Activity Report')
    setPeriod('')
    setPrepared('Mico')
    setOffice('')
    setSections(defaultSections())
    setLastSaved(null)
    notify('Draft discarded. Started blank report.')
  }

  const handleNewReport = () => {
    const isModified = Boolean(
      period.trim() ||
      office.trim() ||
      title !== 'Monthly Activity Report' ||
      sections.some(s => s.content.trim() !== '')
    )
    if (isModified && !confirm('Start a new report? Any unsaved changes in current draft will be reset.')) {
      return
    }
    storage.clearDraft('reports')
    setTitle('Monthly Activity Report')
    setPeriod('')
    setPrepared('Mico')
    setOffice('')
    setSections(defaultSections())
    setLastSaved(null)
    setRecoveredDraft(null)
    notify('Created new blank report')
  }

  const lines = [period && `Reporting period: ${period}`, prepared && `Prepared by: ${prepared}`, office && `Office / Unit: ${office}`, '', ...sections.flatMap(s => [s.title, ...s.content.split('\n'), ''])].filter(Boolean) as string[]

  useEffect(() => {
    if (recoveredDraft) return

    const isModified = Boolean(
      period.trim() ||
      office.trim() ||
      title !== 'Monthly Activity Report' ||
      sections.some(s => s.content.trim() !== '')
    )
    onDirtyChange?.(isModified)
    if (isModified) {
      const payload = { title, period, prepared, office, sections }
      const savedTime = storage.saveDraft('reports', payload, title)
      setLastSaved(savedTime)
      onSnapshotChange?.({
        label: title || 'Activity Report',
        summary: `${period ? `Period: ${period} • ` : ''}${sections.length} sections`,
        tool: 'reports',
        payload
      })
    } else {
      storage.clearDraft('reports')
      setLastSaved(null)
      onSnapshotChange?.(null)
    }
  }, [title, period, prepared, office, sections, recoveredDraft, onDirtyChange, onSnapshotChange])

  const changeSection = (index: number, patch: Partial<ReportSection>) => setSections(sections.map((s, i) => i === index ? { ...s, ...patch } : s))
  const use = (template: SavedTemplate) => {
    const p = template.payload as { title: string; period: string; prepared: string; office: string; sections: ReportSection[] }
    setTitle(p.title)
    setPeriod(p.period)
    setPrepared(p.prepared)
    setOffice(p.office)
    setSections(p.sections)
    setTemplatesOpen(false)
    setRecoveredDraft(null)
    notify('Report template loaded')
  }
  const save = () => { const name = prompt('Template name', title); if (name) saveTemplate({ id: id(), name, category: 'Report', updatedAt: new Date().toLocaleString(), payload: { title, period, prepared, office, sections } }) }
  return (
    <div className="page workspace">
      <PageTitle title="Report Builder" subtitle="Build recurring reports with reusable sections.">
        <div className="header-actions">
          <button type="button" className="button secondary" onClick={handleNewReport}>
            New Report
          </button>
          <button className="button secondary" onClick={() => setTemplatesOpen(true)}>Use previous</button>
          <button className="button" onClick={save}>Save template</button>
        </div>
      </PageTitle>

      {recoveredDraft && (
        <CrashRecoveryBanner
          savedAt={recoveredDraft.savedAt}
          title={recoveredDraft.title || recoveredDraft.data.title}
          onRestore={handleRestore}
          onDiscard={handleDiscard}
        />
      )}

      <div className="editor-layout">
        <section className="field-panel report-fields">
          <label>Report title<input value={title} onChange={e => setTitle(e.target.value)}/></label>
          <label>Reporting period<input value={period} onChange={e => setPeriod(e.target.value)} placeholder="August 2026"/></label>
          <label>Prepared by<input value={prepared} onChange={e => setPrepared(e.target.value)}/></label>
          <label>Office / Unit<input value={office} onChange={e => setOffice(e.target.value)}/></label>
          <div className="section-editor-head"><b>Sections</b><button className="icon-button" title="Add section" onClick={() => setSections([...sections, { id: id(), title: 'New Section', content: '', type: 'Text' }])}><Plus size={17}/></button></div>
          {sections.map((s, i) => <div className="section-form" key={s.id}><div><input value={s.title} onChange={e => changeSection(i, { title: e.target.value })}/><button title="Delete section" onClick={() => setSections(sections.filter(x => x.id !== s.id))}><Trash2 size={14}/></button></div><textarea rows={4} value={s.content} onChange={e => changeSection(i, { content: e.target.value })} placeholder={`Write ${s.title.toLowerCase()}...`}/></div>)}
        </section>
        <section className="preview-area">
          <div className="preview-toolbar">
            <span>Live A4 preview</span>
            <span className="toolbar-spacer"/>
            <AutoSaveStatus lastSaved={lastSaved} isDirty={Boolean(lastSaved)} />
            <button className="icon-button" title="Print" onClick={() => print()}><Printer size={17}/></button>
            <button className={defaultExport === 'DOCX' ? 'button' : 'button secondary'} onClick={() => { exportDocx(title, lines); addRecent({ id: id(), name: title, type: 'Report', modified: 'Just now' }) }}>DOCX</button>
            <button className={defaultExport === 'PDF' ? 'button' : 'button secondary'} onClick={() => { exportPdf(title, lines); addRecent({ id: id(), name: title, type: 'Report', modified: 'Just now' }) }}>PDF</button>
          </div>
          <Paper zoom={.75} lines={[title, '', ...lines]}/>
        </section>
      </div>
      {templatesOpen && <TemplateModal templates={templates.filter(t => t.category === 'Report')} load={use} close={() => setTemplatesOpen(false)} />}
    </div>
  )
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

function RecentFiles({ recent, setRecent }: { recent: RecentFile[]; setRecent: (items: RecentFile[]) => void }) { return <div className="page"><PageTitle title="Recent Files" subtitle="A lightweight history of work created in Office Toolkit.">{recent.length > 0 && <button className="button danger-button" onClick={() => { if (confirm('Clear all recent history?')) { storage.clearRecent(); setRecent([]) } }}>Clear recent history</button>}</PageTitle>{recent.length ? <RecentTable recent={recent}/> : <EmptyState title="No recent files yet" text="Files you work with will appear here."/>}</div> }
function RecentTable({ recent }: { recent: RecentFile[] }) { return <div className="recent-table"><div className="recent-header"><span>Name</span><span>Type</span><span>Modified</span><span>Action</span></div>{recent.map(item => <div className="recent-row" key={item.id}><span className="filename">{item.type === 'Spreadsheet' ? <FileSpreadsheet size={17}/> : <FileText size={17}/>} {item.name}</span><span><i className={`type-dot ${item.type.toLowerCase()}`}/>{item.type}</span><span>{item.modified}</span><span><button className="text-button" onClick={() => alert('This recent entry stores metadata only. Re-import the original file to open it again.')}>Open</button></span></div>)}</div> }

function Settings({
  theme,
  setTheme,
  accent,
  setAccent,
  rememberRecent,
  setRememberRecent,
  defaultExport,
  setDefaultExport,
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
  accent: string
  setAccent: (v: string) => void
  rememberRecent: boolean
  setRememberRecent: (value: boolean) => void
  defaultExport: string
  setDefaultExport: (value: string) => void
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
  const [category, setCategory] = useState<'account' | 'appearance' | 'workspace' | 'storage' | 'about'>('account')
  const categories = [
    { id: 'account' as const, label: 'Account', detail: 'Sign-in and cloud access' },
    { id: 'appearance' as const, label: 'Appearance', detail: 'Theme and color palette' },
    { id: 'workspace' as const, label: 'Workspace', detail: 'Files, exports, and privacy' },
    { id: 'storage' as const, label: 'Storage & data', detail: 'Local saved content' },
    { id: 'about' as const, label: 'About', detail: 'Product information' }
  ]

  return (
    <div className="page settings">
      <PageTitle title="Settings" subtitle="Personalize Office Toolkit, manage cloud accounts, and local data." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {categories.map(item => <button type="button" key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}
        </nav>

        <div className="settings-panel">
          {category === 'account' && <section className="settings-category">
            <h2>Account & cloud database</h2>
            <p>Sign in and manage the connected team workspace.</p>
            <div className="settings-account-card">
              <div className="settings-account-header"><div><strong>{currentUser ? (currentUser.full_name || currentUser.email) : 'Not Signed In'}</strong><small>{currentUser ? `Logged in as ${currentUser.role === 'admin' ? 'Administrator' : 'Staff Member'} (${currentUser.email})` : 'Sign in to access team tools and role-based permissions.'}</small></div><span className={`status-badge ${config.isConfigured ? 'active' : 'disabled'}`}>{config.isConfigured ? 'Supabase Connected' : 'Local Mode'}</span></div>
              <div className="header-actions" style={{ marginTop: '12px' }}>{currentUser ? <button type="button" className="button secondary" onClick={onSignOut}>Sign Out</button> : <button type="button" className="button" onClick={() => onOpenAuth('login')}>Sign In / Register</button>}{onOpenOnboarding && <button type="button" className="button secondary" onClick={onOpenOnboarding}>Replay Welcome Tour</button>}</div>
            </div>
          </section>}

          {category === 'appearance' && <section className="settings-category">
            <h2>Appearance</h2><p>Choose how the application looks and feels.</p>
            <div className="settings-block"><h3>Display mode</h3><div className="segmented">{['light', 'dark', 'system'].map(x => <button key={x} className={theme === x ? 'selected' : ''} onClick={() => setTheme(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div></div>
            <div className="settings-block"><h3>Color palette</h3><p>Choose an accent tone for active tools, primary buttons, and focus states.</p><div className="accent-picker-grid">{[
              { id: 'blue', label: 'Cobalt Blue', desc: 'Confident primary actions & clarity', color: '#2563eb' }, { id: 'sky', label: 'Sky Blue', desc: 'Fresh, bright & approachable', color: '#0284c7' }, { id: 'violet', label: 'Violet', desc: 'Focused, polished & distinctive', color: '#7c3aed' }, { id: 'emerald', label: 'Emerald Teal', desc: 'Modern & crisp productivity', color: '#0f766e' }, { id: 'indigo', label: 'Royal Indigo', desc: 'Executive and clean', color: '#4338ca' }, { id: 'forest', label: 'Forest Pine', desc: 'Calming and editorial', color: '#1b4332' }, { id: 'amber', label: 'Warm Amber', desc: 'Classic and archival', color: '#b45309' }, { id: 'rose', label: 'Rose', desc: 'Warm and expressive', color: '#be123c' }, { id: 'slate', label: 'Minimal Slate', desc: 'Monochrome neutral focus', color: '#334155' }
            ].map(item => <button type="button" key={item.id} className={`accent-card ${accent === item.id ? 'active' : ''}`} onClick={() => setAccent(item.id)}><span className="accent-swatch" style={{ background: item.color }} /><div className="accent-card-info"><strong>{item.label}</strong><small>{item.desc}</small></div></button>)}</div></div>
          </section>}

          {category === 'workspace' && <section className="settings-category">
            <h2>Workspace</h2><p>Control file history, exports, and local processing.</p>
            <div className="settings-block"><h3>Files & exports</h3><label className="toggle-row"><span>Remember recent files<small>Store only metadata for imported files.</small></span><input type="checkbox" checked={rememberRecent} onChange={e => setRememberRecent(e.target.checked)} /></label><label>Default export format<select value={defaultExport} onChange={e => setDefaultExport(e.target.value)}><option>PDF</option><option>DOCX</option><option>Excel</option></select></label></div>
            <div className="settings-block"><h3>Privacy</h3><div className="privacy-block"><LocalBadge /><p>Core document and spreadsheet operations are processed in your browser on this device. Office Toolkit does not automatically send your files anywhere.</p></div></div>
          </section>}

          {category === 'storage' && <section className="settings-category">
            <h2>Storage & data</h2><p>Review and clear locally stored workspace information.</p>
            <div className="storage-list"><span>Saved templates <b>{templates.length}</b></span><span>Archived sessions <b>{archives.length}</b></span><span>Recent metadata <b>{storage.recent().length}</b></span></div>
            <div className="header-actions"><button type="button" className="button secondary" onClick={clearRecent}>Clear recent history</button><button type="button" className="button secondary" onClick={clearArchives}>Clear archives</button><button type="button" className="button secondary" onClick={clearTemplates}>Clear templates</button><button type="button" className="button danger-button" onClick={onResetAllData}>Reset all local data</button></div>
          </section>}

          {category === 'about' && <section className="settings-category"><h2>About Office Toolkit</h2><p>Personal productivity utilities for repetitive office work.</p><div className="settings-about"><strong>Office Toolkit</strong><small>Version 0.1.0</small></div></section>}
        </div>
      </div>
    </div>
  )
}

function TemplateModal({ templates, load, close }: { templates: SavedTemplate[]; load: (t: SavedTemplate) => void; close: () => void }) { return <Modal title="Choose a template" close={close}>{templates.length ? <div className="template-picker">{templates.map(t => <button key={t.id} onClick={() => load(t)}><span><strong>{t.name}</strong><small>Updated {t.updatedAt}</small></span></button>)}</div> : <EmptyState title="No saved templates" text="Save your current work as a template to use it again."/>}</Modal> }

function DocumentPageSetupModal({ setup, onChange, close }: { setup: DocumentPageSetup; onChange: (changes: Partial<DocumentPageSetup>) => void; close: () => void }) {
  return <Modal title="Page setup" close={close}>
    <div className="page-setup-form">
      <section>
        <h3>Paper size</h3>
        <div className="segmented" role="group" aria-label="Paper size">
          <button className={setup.pageSize === 'A4' ? 'selected' : ''} onClick={() => onChange({ pageSize: 'A4' })}>A4</button>
          <button className={setup.pageSize === 'Letter' ? 'selected' : ''} onClick={() => onChange({ pageSize: 'Letter' })}>Letter</button>
          <button className={setup.pageSize === 'Legal' ? 'selected' : ''} onClick={() => onChange({ pageSize: 'Legal' })}>Long / Legal</button>
        </div>
      </section>
      <section>
        <h3>Margins</h3>
        <div className="segmented" role="group" aria-label="Document margins">
          <button className={setup.margins === 'narrow' ? 'selected' : ''} onClick={() => onChange({ margins: 'narrow' })}>Narrow</button>
          <button className={setup.margins === 'standard' ? 'selected' : ''} onClick={() => onChange({ margins: 'standard' })}>Standard</button>
          <button className={setup.margins === 'wide' ? 'selected' : ''} onClick={() => onChange({ margins: 'wide' })}>Wide</button>
        </div>
      </section>
      <p className="page-setup-note">Paper settings are saved with the document and applied to print, PDF, and DOCX export.</p>
    </div>
  </Modal>
}

function DocumentTemplateModal({ templates, loadBuiltIn, loadSaved, close }: { templates: SavedTemplate[]; loadBuiltIn: (template: DocumentData) => void; loadSaved: (template: SavedTemplate) => void; close: () => void }) { return <Modal title="Document templates" close={close}><div className="template-library"><section className="template-library-group"><h3>Office templates</h3><p>Start with a structured format, then replace the bracketed details.</p><div className="template-picker">{builtInDocumentTemplates.map(template => <button key={template.id} onClick={() => loadBuiltIn(template.data)}><span><strong>{template.name}</strong><small>{template.description}</small></span></button>)}</div></section>{templates.length > 0 && <section className="template-library-group"><h3>Saved templates</h3><p>Your locally saved document formats.</p><div className="template-picker">{templates.map(template => <button key={template.id} onClick={() => loadSaved(template)}><span><strong>{template.name}</strong><small>Updated {template.updatedAt}</small></span></button>)}</div></section>}</div></Modal> }

const documentMergeFields = ['recipientName', 'recipientPosition', 'organization', 'address'] as const
type DocumentMergeField = typeof documentMergeFields[number]
type DocumentMergeMappings = Record<DocumentMergeField, string>

function guessMergeColumn(headers: string[], patterns: RegExp[]) {
  return headers.find(header => patterns.some(pattern => pattern.test(header))) || ''
}

function mergeDocumentRow(document: DocumentData, row: string[], headers: string[], mappings: DocumentMergeMappings): DocumentData {
  const findValue = (column: string) => {
    const index = headers.findIndex(header => header.trim().toLowerCase() === column.trim().toLowerCase())
    return index >= 0 ? (row[index] || '').trim() : ''
  }
  const replaceFields = (value: string) => value.replace(/{{\s*([^}]+?)\s*}}/g, (_match, column: string) => findValue(column) || `{{${column}}}`)
  const merged = { ...document }
  documentMergeFields.forEach(field => {
    if (mappings[field]) merged[field] = findValue(mappings[field])
  })
  ;(['type', 'date', 'recipientName', 'recipientPosition', 'organization', 'address', 'subject', 'greeting', 'body', 'closing', 'senderName', 'senderPosition'] as const).forEach(field => {
    merged[field] = replaceFields(merged[field])
  })
  return merged
}

function BulkDocumentModal({ document, onClose, onComplete }: { document: DocumentData; onClose: () => void; onComplete: (count: number, format: 'pdf' | 'docx') => void }) {
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetData | null>(null)
  const [mappings, setMappings] = useState<DocumentMergeMappings>({ recipientName: '', recipientPosition: '', organization: '', address: '' })
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf')
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const importSpreadsheet = async (file?: File) => {
    if (!file) return
    try {
      const imported = await readSpreadsheet(file)
      setSpreadsheet(imported)
      setMappings({
        recipientName: guessMergeColumn(imported.headers, [/^full.?name$/i, /^name$/i, /recipient/i, /employee.*name/i]),
        recipientPosition: guessMergeColumn(imported.headers, [/position/i, /designation/i, /title/i]),
        organization: guessMergeColumn(imported.headers, [/organization/i, /office/i, /agency/i, /company/i]),
        address: guessMergeColumn(imported.headers, [/address/i, /location/i])
      })
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read this spreadsheet.')
    }
  }

  const generate = async () => {
    if (!spreadsheet) return
    const rows = spreadsheet.rows.filter(row => row.some(cell => cell.trim()))
    if (!rows.length) {
      setError('This spreadsheet has no data rows to generate.')
      return
    }
    setGenerating(true)
    setProgress({ current: 0, total: rows.length })
    try {
      const documents = rows.map((row, index) => {
        const merged = mergeDocumentRow(document, row, spreadsheet.headers, mappings)
        const mergedTitle = merged.subject || `${merged.type} document`
        return {
          title: mergedTitle,
          lines: documentLines(merged),
          fileName: `${String(index + 1).padStart(3, '0')}_${merged.recipientName || mergedTitle}`
        }
      })
      await exportBulkDocumentsZip(documents, format, `${document.subject || document.type}_batch`, (current, total) => setProgress({ current, total }))
      onComplete(rows.length, format)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate the document batch.')
    } finally {
      setGenerating(false)
    }
  }

  return <Modal title="Bulk document generation" close={generating ? () => undefined : onClose}><div className="bulk-document-modal">{!spreadsheet ? <section className="bulk-import-step"><h3>Import recipient data</h3><p>Choose an Excel or CSV file. It stays on this device and is used only to personalize the current document.</p><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={event => importSpreadsheet(event.target.files?.[0])}/><button type="button" className="button" onClick={() => fileRef.current?.click()}>Choose spreadsheet</button></section> : <><section className="bulk-data-summary"><h3>{spreadsheet.name}</h3><p>{spreadsheet.rows.length.toLocaleString()} rows · {spreadsheet.headers.length} columns</p><button type="button" className="text-button" disabled={generating} onClick={() => fileRef.current?.click()}>Choose another file</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={event => importSpreadsheet(event.target.files?.[0])}/></section><section className="bulk-mapping"><h3>Map recipient fields</h3><p>Optional fields are filled from matching columns. You can also use <code>{'{{Column Name}}'}</code> anywhere in the document.</p><div className="bulk-mapping-grid">{documentMergeFields.map(field => <label key={field}>{field === 'recipientName' ? 'Recipient name' : field === 'recipientPosition' ? 'Recipient position' : field === 'organization' ? 'Office / organization' : 'Address'}<select value={mappings[field]} disabled={generating} onChange={event => setMappings({ ...mappings, [field]: event.target.value })}><option value="">Do not replace</option>{spreadsheet.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></section><section className="bulk-export-options"><h3>Export format</h3><div className="segmented"><button type="button" className={format === 'pdf' ? 'selected' : ''} disabled={generating} onClick={() => setFormat('pdf')}>PDF ZIP</button><button type="button" className={format === 'docx' ? 'selected' : ''} disabled={generating} onClick={() => setFormat('docx')}>DOCX ZIP</button></div></section>{generating && <p className="bulk-progress">Generating {progress.current} of {progress.total} documents…</p>}<div className="modal-actions"><button type="button" className="button secondary" disabled={generating} onClick={onClose}>Cancel</button><button type="button" className="button" disabled={generating} onClick={generate}>{generating ? 'Generating…' : `Generate ${spreadsheet.rows.length} documents`}</button></div></>}{error && <p className="error">{error}</p>}</div></Modal>
}

function CommandPalette({ close, open, isAdmin }: { close: () => void; open: (page: Page) => void; isAdmin?: boolean }) {
  const [query, setQuery] = useState('')
  const actions: { name: string; page: Page }[] = [
    { name: 'New Document', page: 'documents' },
    { name: 'Import Spreadsheet', page: 'spreadsheets' },
    { name: 'New Report', page: 'reports' },
    { name: 'Generate Certificates', page: 'certificates' },
    { name: 'Open Templates', page: 'templates' },
    { name: 'Open Archives', page: 'archives' },
    { name: 'Open Recent Files', page: 'recent' },
    { name: 'Settings', page: 'settings' },
    ...(isAdmin ? [{ name: 'Admin Console', page: 'admin' as Page }] : [])
  ]
  const filtered = actions.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <Modal title="Command menu" close={close}>
      <SearchField value={query} onChange={setQuery} placeholder="Search commands..." />
      <div className="command-list">
        {filtered.map(a => (
          <button key={a.name} onClick={() => open(a.page)}>{a.name}</button>
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
