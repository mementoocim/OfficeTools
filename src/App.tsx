import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BookOpenText, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileDown, FileSpreadsheet, FileText, Keyboard, LayoutTemplate, Loader2, Medal, MoreHorizontal, Plus, Printer, RotateCcw, Save, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import { AppSidebar } from './components/AppSidebar'
import { Certificates } from './components/Certificates'
import { EmptyState, LocalBadge, Modal, PageTitle, SearchField, ToolCard } from './components/Common'
import type { CertificateData, DocumentData, ImportStatus, Page, RecentFile, ReportSection, SavedTemplate, SpreadsheetData } from './types'
import { storage } from './lib/storage'
import { cleanRows, exportSpreadsheet, readSpreadsheet, toTitleCase, toFirstLetterCase, type CleanMode } from './lib/spreadsheet'
import { exportDocx, exportPdf } from './lib/export'

const id = () => crypto.randomUUID()
const initialDocument: DocumentData = { type: 'Letter', date: new Date().toLocaleDateString('en-CA'), recipientName: '', recipientPosition: '', organization: '', address: '', subject: '', greeting: 'Dear Sir/Madam,', body: 'I am writing to respectfully submit this letter for your consideration.', closing: 'Respectfully yours,', senderName: 'Mico', senderPosition: '' }
const initialCertificate: CertificateData = { title: 'Certificate of Participation', subtitle: 'This certificate is proudly presented to', description: 'for successfully participating in\n\n{{event}}\n\nheld on {{date}}.', event: 'Training Program', date: new Date().toLocaleDateString(), venue: '', signatory: '', signatoryPosition: '', borderStyle: 'gold', includeQr: true }
const defaultSections = (): ReportSection[] => ['Summary', 'Activities Conducted', 'Participants / Beneficiaries', 'Key Accomplishments', 'Issues / Concerns', 'Recommendations', 'Next Steps'].map(title => ({ id: id(), title, content: '', type: 'Text' }))

const validPages: Page[] = ['home', 'documents', 'spreadsheets', 'reports', 'certificates', 'templates', 'recent', 'settings']

function getInitialPage(): Page {
  const hash = window.location.hash.replace(/^#\/?/, '') as Page
  if (validPages.includes(hash)) return hash
  const saved = localStorage.getItem('office_toolkit_page') as Page
  if (validPages.includes(saved)) return saved
  return 'home'
}

export default function App() {
  const [page, setPageState] = useState<Page>(getInitialPage)
  const [collapsed, setCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [recent, setRecent] = useState<RecentFile[]>(storage.recent())
  const [templates, setTemplates] = useState<SavedTemplate[]>(storage.templates())
  const [theme, setTheme] = useState<string>(String(storage.settings().theme || 'system'))
  const [notice, setNotice] = useState('')
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)

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
  return <div className="app-shell">
    <AppSidebar page={page} setPage={setPage} collapsed={collapsed} toggle={() => setCollapsed(!collapsed)} />
    <main className="main-content">
      {page === 'home' && <Home setPage={setPage} recent={recent} setRecent={setRecent} />}
      {page === 'documents' && <Documents templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} notify={notify} onDirtyChange={setDirty} />}
      {page === 'spreadsheets' && <Spreadsheets addRecent={addRecent} notify={notify} onImportStatus={handleImportStatus} onDirtyChange={setDirty} />}
      {page === 'reports' && <Reports templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} notify={notify} onDirtyChange={setDirty} />}
      {page === 'certificates' && <Certificates templates={templates} saveTemplate={saveTemplate} addRecent={addRecent} notify={notify} onImportStatus={handleImportStatus} onDirtyChange={setDirty} />}
      {page === 'templates' && <Templates templates={templates} useTemplate={(t) => { setPage(t.category === 'Document' ? 'documents' : t.category === 'Report' ? 'reports' : 'certificates'); notify(`Open ${t.category} and choose ${t.name} from templates`) }} remove={removeTemplate} />}
      {page === 'recent' && <RecentFiles recent={recent} setRecent={setRecent} />}
      {page === 'settings' && <Settings theme={theme} setTheme={setTheme} clearRecent={() => { if (confirm('Clear all recent file history?')) { storage.clearRecent(); setRecent([]) } }} templates={templates} clearTemplates={() => { if (confirm('Delete all saved templates?')) { templates.forEach(t => storage.deleteTemplate(t.id)); setTemplates([]) } }} />}
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
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    )}
    {commandOpen && <CommandPalette close={() => setCommandOpen(false)} open={(p) => { setPage(p); setCommandOpen(false) }} />}
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

function Documents({ templates, saveTemplate, addRecent, notify, onDirtyChange }: {
  templates: SavedTemplate[]
  saveTemplate: (x: SavedTemplate) => void
  addRecent: (x: RecentFile) => void
  notify: (s: string) => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [doc, setDoc] = useState<DocumentData>(initialDocument), [zoom, setZoom] = useState(0.75), [templateOpen, setTemplateOpen] = useState(false)
  const update = (field: keyof DocumentData, value: string) => setDoc({ ...doc, [field]: value })
  const title = doc.subject || `${doc.type} document`; const lines = documentLines(doc)

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
  }, [doc, onDirtyChange])

  const loadTemplate = (template: SavedTemplate) => { setDoc(template.payload as DocumentData); setTemplateOpen(false); notify('Template loaded') }
  const save = () => { const name = prompt('Template name', doc.subject || 'Untitled Letter'); if (name) saveTemplate({ id: id(), name, category: 'Document', updatedAt: new Date().toLocaleString(), payload: doc }) }
  const record = () => addRecent({ id: id(), name: title, type: 'Document', modified: 'Just now' })
  return <div className="page workspace"><PageTitle title="Document Generator" subtitle="Create polished office documents in a few focused steps"><div className="header-actions"><LocalBadge/><button className="button secondary" onClick={() => setTemplateOpen(true)}><LayoutTemplate size={16}/> Templates</button><button className="button" onClick={save}><Save size={16}/> Save template</button></div></PageTitle><div className="editor-layout"><section className="field-panel"><label>Document type<select value={doc.type} onChange={e => update('type', e.target.value)}><option>Letter</option><option>Memo</option><option>Simple Report</option><option>Certificate</option></select></label>{([['date','Date'],['recipientName','Recipient name'],['recipientPosition','Recipient position'],['organization','Office / Organization'],['address','Address'],['subject','Subject'],['greeting','Greeting']] as [keyof DocumentData, string][]).map(([key, label]) => <label key={key}>{label}<input value={doc[key]} onChange={e => update(key, e.target.value)}/></label>)}<label>Body<textarea rows={7} value={doc.body} onChange={e => update('body', e.target.value)} /></label>{([['closing','Closing'],['senderName','Sender name'],['senderPosition','Sender position']] as [keyof DocumentData, string][]).map(([key, label]) => <label key={key}>{label}<input value={doc[key]} onChange={e => update(key, e.target.value)}/></label>)}</section><section className="preview-area"><div className="preview-toolbar"><button className="icon-button" onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" onClick={() => setZoom(Math.min(1, zoom + .1))}>+</button><button className="text-button" onClick={() => setZoom(.75)}>Fit page</button><span className="toolbar-spacer"/><button className="icon-button" title="Print" onClick={() => print()}><Printer size={17}/></button><button className="button secondary" onClick={() => { exportDocx(title, lines); record() }}><Download size={16}/> DOCX</button><button className="button" onClick={() => { exportPdf(title, lines); record() }}><FileDown size={16}/> PDF</button></div><Paper zoom={zoom} lines={lines}/></section></div>{templateOpen && <TemplateModal templates={templates.filter(t => t.category === 'Document')} load={loadTemplate} close={() => setTemplateOpen(false)} />}</div>
}

function documentLines(doc: DocumentData) { return [doc.date, '', doc.recipientName, doc.recipientPosition, doc.organization, doc.address, '', doc.subject ? `Subject: ${doc.subject}` : '', '', doc.greeting, '', ...doc.body.split('\n'), '', doc.closing, '', doc.senderName, doc.senderPosition].filter((x, i, arr) => x || (i > 0 && arr[i - 1] !== '')) }
function Paper({ zoom, lines, certificate = false }: { zoom: number; lines: string[]; certificate?: boolean }) { return <div className={`paper-wrap ${certificate ? 'certificate-paper' : ''}`}><article className="paper" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: `${(zoom - 1) * 1080}px` }}>{certificate ? <div className="certificate-inner">{lines.map((line, i) => <p key={i} className={i === 0 ? 'certificate-title' : ''}>{line || ' '}</p>)}</div> : lines.map((line, i) => <p key={i} className={line.startsWith('Subject:') ? 'subject-line' : ''}>{line || ' '}</p>)}</article></div> }

function Spreadsheets({ addRecent, notify, onImportStatus, onDirtyChange }: {
  addRecent: (x: RecentFile) => void
  notify: (s: string) => void
  onImportStatus?: (status: ImportStatus | null) => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [data, setData] = useState<SpreadsheetData | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState<SpreadsheetData[]>([])
  const [selectedCol, setSelectedCol] = useState<number>(-1)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState<boolean>(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onDirtyChange?.(Boolean(data && data.rows.length > 0))
  }, [data, onDirtyChange])

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
      notify(`Capitalized every word (after space) in ${colName} (${affectedCount} cell${affectedCount === 1 ? '' : 's'} updated)`)
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

  return (
    <div className="page">
      <PageTitle title="Spreadsheet Tools" subtitle="Import, clean, filter and export spreadsheet data.">
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
          <p>Excel and CSV files are processed on this device.</p>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => importFile(e.target.files?.[0])}
          />
          <button className="button" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Browse files
          </button>
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
                <Sparkles size={13} />
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

            {history.length > 0 && (
              <button
                type="button"
                className="undo"
                title="Undo last clean/case change"
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
                    return (
                      <th key={i} className="th-cell">
                        <div className="th-content">
                          <span className="th-title" title={h}>{h}</span>
                          <div className="th-actions">
                            <button
                              type="button"
                              className="th-btn"
                              title={`Capitalize every word in "${h}" (e.g. ilagan city ➔ Ilagan City)`}
                              onClick={() => clean('titleCase', i)}
                            >
                              Aa
                            </button>
                            <button
                              type="button"
                              className="th-btn"
                              title={`Capitalize first letter only in "${h}" (e.g. ILAGAN CITY ➔ Ilagan city)`}
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
                    {data.headers.map((_, j) => (
                      <td key={j}>{row[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length > 500 && (
              <p className="table-limit">Showing first 500 matching rows to keep the preview quick.</p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function Reports({ templates, saveTemplate, addRecent, notify, onDirtyChange }: {
  templates: SavedTemplate[]
  saveTemplate: (x: SavedTemplate) => void
  addRecent: (x: RecentFile) => void
  notify: (s: string) => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [title, setTitle] = useState('Monthly Activity Report'), [period, setPeriod] = useState(''), [prepared, setPrepared] = useState('Mico'), [office, setOffice] = useState(''), [sections, setSections] = useState(defaultSections), [templatesOpen, setTemplatesOpen] = useState(false)
  const lines = [period && `Reporting period: ${period}`, prepared && `Prepared by: ${prepared}`, office && `Office / Unit: ${office}`, '', ...sections.flatMap(s => [s.title, ...s.content.split('\n'), ''])].filter(Boolean) as string[]

  useEffect(() => {
    const isModified = Boolean(
      period.trim() ||
      office.trim() ||
      title !== 'Monthly Activity Report' ||
      sections.some(s => s.content.trim() !== '')
    )
    onDirtyChange?.(isModified)
  }, [title, period, office, sections, onDirtyChange])

  const changeSection = (index: number, patch: Partial<ReportSection>) => setSections(sections.map((s, i) => i === index ? { ...s, ...patch } : s))
  const use = (template: SavedTemplate) => { const p = template.payload as { title: string; period: string; prepared: string; office: string; sections: ReportSection[] }; setTitle(p.title); setPeriod(p.period); setPrepared(p.prepared); setOffice(p.office); setSections(p.sections); setTemplatesOpen(false); notify('Report template loaded') }
  const save = () => { const name = prompt('Template name', title); if (name) saveTemplate({ id: id(), name, category: 'Report', updatedAt: new Date().toLocaleString(), payload: { title, period, prepared, office, sections } }) }
  return <div className="page workspace"><PageTitle title="Report Builder" subtitle="Build recurring reports with reusable sections."><div className="header-actions"><button className="button secondary" onClick={() => setTemplatesOpen(true)}><Copy size={16}/> Use previous</button><button className="button" onClick={save}><Save size={16}/> Save template</button></div></PageTitle><div className="editor-layout"><section className="field-panel report-fields"><label>Report title<input value={title} onChange={e => setTitle(e.target.value)}/></label><label>Reporting period<input value={period} onChange={e => setPeriod(e.target.value)} placeholder="August 2026"/></label><label>Prepared by<input value={prepared} onChange={e => setPrepared(e.target.value)}/></label><label>Office / Unit<input value={office} onChange={e => setOffice(e.target.value)}/></label><div className="section-editor-head"><b>Sections</b><button className="icon-button" title="Add section" onClick={() => setSections([...sections, { id: id(), title: 'New Section', content: '', type: 'Text' }])}><Plus size={17}/></button></div>{sections.map((s, i) => <div className="section-form" key={s.id}><div><input value={s.title} onChange={e => changeSection(i, { title: e.target.value })}/><button title="Delete section" onClick={() => setSections(sections.filter(x => x.id !== s.id))}><Trash2 size={14}/></button></div><textarea rows={4} value={s.content} onChange={e => changeSection(i, { content: e.target.value })} placeholder={`Write ${s.title.toLowerCase()}...`}/></div>)}</section><section className="preview-area"><div className="preview-toolbar"><span>Live A4 preview</span><span className="toolbar-spacer"/><button className="icon-button" title="Print" onClick={() => print()}><Printer size={17}/></button><button className="button secondary" onClick={() => { exportDocx(title, lines); addRecent({ id: id(), name: title, type: 'Report', modified: 'Just now' }) }}>DOCX</button><button className="button" onClick={() => { exportPdf(title, lines); addRecent({ id: id(), name: title, type: 'Report', modified: 'Just now' }) }}>PDF</button></div><Paper zoom={.75} lines={[title, '', ...lines]}/></section></div>{templatesOpen && <TemplateModal templates={templates.filter(t => t.category === 'Report')} load={use} close={() => setTemplatesOpen(false)} />}</div>
}

function Templates({ templates, useTemplate, remove }: { templates: SavedTemplate[]; useTemplate: (t: SavedTemplate) => void; remove: (id: string) => void }) { const [search, setSearch] = useState(''); const results = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase())); return <div className="page"><PageTitle title="Templates" subtitle="Your reusable documents, reports and certificates."/><SearchField value={search} onChange={setSearch} placeholder="Search templates"/>{results.length ? <div className="template-list">{results.map(t => <article key={t.id}><span className="template-icon">{t.category === 'Document' ? <FileText/> : t.category === 'Report' ? <BookOpenText/> : <Medal/>}</span><div><h3>{t.name}</h3><p>{t.category} · Updated {t.updatedAt}</p></div><button className="button secondary" onClick={() => useTemplate(t)}>Use</button><button className="icon-button" title="Duplicate" onClick={() => { storage.saveTemplate({ ...t, id: id(), name: `${t.name} copy`, updatedAt: new Date().toLocaleString() }); location.reload() }}><Copy size={16}/></button><button className="icon-button danger" title="Delete" onClick={() => remove(t.id)}><Trash2 size={16}/></button></article>)}</div> : <EmptyState title="No templates yet" text="Save a document, report, or certificate as a reusable template."/>}</div> }

function RecentFiles({ recent, setRecent }: { recent: RecentFile[]; setRecent: (items: RecentFile[]) => void }) { return <div className="page"><PageTitle title="Recent Files" subtitle="A lightweight history of work created in Office Toolkit."/>{recent.length ? <><RecentTable recent={recent}/><button className="button danger-button" onClick={() => { if (confirm('Clear all recent history?')) { storage.clearRecent(); setRecent([]) } }}>Clear recent history</button></> : <EmptyState title="No recent files yet" text="Files you work with will appear here."/>}</div> }
function RecentTable({ recent }: { recent: RecentFile[] }) { return <div className="recent-table"><div className="recent-header"><span>Name</span><span>Type</span><span>Modified</span><span>Action</span></div>{recent.map(item => <div className="recent-row" key={item.id}><span className="filename">{item.type === 'Spreadsheet' ? <FileSpreadsheet size={17}/> : <FileText size={17}/>} {item.name}</span><span><i className={`type-dot ${item.type.toLowerCase()}`}/>{item.type}</span><span>{item.modified}</span><span><button className="text-button" onClick={() => alert('This recent entry stores metadata only. Re-import the original file to open it again.')}>Open</button><button className="more-button" title="More actions"><MoreHorizontal size={17}/></button></span></div>)}</div> }

function Settings({ theme, setTheme, clearRecent, templates, clearTemplates }: { theme: string; setTheme: (v: string) => void; clearRecent: () => void; templates: SavedTemplate[]; clearTemplates: () => void }) { return <div className="page settings"><PageTitle title="Settings" subtitle="Personalize Office Toolkit and manage local data."/><section><h2>Appearance</h2><p>Theme</p><div className="segmented">{['light', 'dark', 'system'].map(x => <button key={x} className={theme === x ? 'selected' : ''} onClick={() => setTheme(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div></section><section><h2>Files</h2><label className="toggle-row"><span>Remember recent files<small>Store only metadata for imported files.</small></span><input type="checkbox" defaultChecked/></label><label>Default export format<select defaultValue="PDF"><option>PDF</option><option>DOCX</option><option>Excel</option></select></label></section><section><h2>Privacy</h2><div className="privacy-block"><LocalBadge/><p>Core document and spreadsheet operations are processed in your browser on this device. Office Toolkit does not automatically send your files anywhere.</p></div></section><section><h2>Storage</h2><div className="storage-list"><span>Saved templates <b>{templates.length}</b></span><span>Recent file metadata <b>{storage.recent().length}</b></span></div><div className="header-actions"><button className="button secondary" onClick={clearRecent}>Clear recent history</button><button className="button danger-button" onClick={clearTemplates}>Clear templates</button></div></section><section><h2>About</h2><p>Office Toolkit</p><small>Personal productivity utilities for repetitive office work. Version 0.1.0</small></section></div> }

function TemplateModal({ templates, load, close }: { templates: SavedTemplate[]; load: (t: SavedTemplate) => void; close: () => void }) { return <Modal title="Choose a template" close={close}>{templates.length ? <div className="template-picker">{templates.map(t => <button key={t.id} onClick={() => load(t)}><LayoutTemplate size={18}/><span><strong>{t.name}</strong><small>Updated {t.updatedAt}</small></span><ChevronRight size={17}/></button>)}</div> : <EmptyState title="No saved templates" text="Save your current work as a template to use it again."/>}</Modal> }

function CommandPalette({ close, open }: { close: () => void; open: (page: Page) => void }) { const [query, setQuery] = useState(''); const actions: { name: string; page: Page; icon: typeof FileText }[] = [{ name: 'New Document', page: 'documents', icon: FileText }, { name: 'Import Spreadsheet', page: 'spreadsheets', icon: FileSpreadsheet }, { name: 'New Report', page: 'reports', icon: BookOpenText }, { name: 'Generate Certificates', page: 'certificates', icon: Medal }, { name: 'Open Templates', page: 'templates', icon: LayoutTemplate }, { name: 'Open Recent Files', page: 'recent', icon: FileText }, { name: 'Settings', page: 'settings', icon: FileText }]; const filtered = actions.filter(a => a.name.toLowerCase().includes(query.toLowerCase())); return <Modal title="Command menu" close={close}><SearchField value={query} onChange={setQuery} placeholder="Search commands..."/><div className="command-list">{filtered.map(a => <button key={a.name} onClick={() => open(a.page)}><a.icon size={17}/>{a.name}<ChevronRight size={16}/></button>)}</div></Modal> }

function ConfirmLeaveModal({
  currentPage,
  targetPage,
  onConfirm,
  onCancel
}: {
  currentPage: Page
  targetPage: Page | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const pageTitles: Record<Page, string> = {
    home: 'Home',
    documents: 'Document Generator',
    spreadsheets: 'Spreadsheet Tools',
    reports: 'Report Builder',
    certificates: 'Certificate Generator',
    templates: 'Templates',
    recent: 'Recent Files',
    settings: 'Settings'
  }

  const currentLabel = pageTitles[currentPage] || currentPage
  const targetLabel = targetPage ? (pageTitles[targetPage] || targetPage) : 'another page'

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
              You have active work or imported data in <strong>{currentLabel}</strong>. Leaving to go to <strong>{targetLabel}</strong> will reset your current progress.
            </p>
          </div>
        </div>
        <div className="confirm-leave-actions">
          <button type="button" className="button secondary" onClick={onCancel} autoFocus>
            Stay on {currentLabel}
          </button>
          <button type="button" className="button danger-button confirm-danger-btn" onClick={onConfirm}>
            Leave and discard
          </button>
        </div>
      </div>
    </div>
  )
}
