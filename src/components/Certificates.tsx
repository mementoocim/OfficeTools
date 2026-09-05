import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  LayoutTemplate,
  Medal,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2
} from 'lucide-react'
import type { CertificateBorderStyle, CertificateData, ImportStatus, RecentFile, SavedTemplate } from '../types'
import { readSpreadsheet, toTitleCase, toFirstLetterCase } from '../lib/spreadsheet'
import {
  exportCombinedCertificatesPdf,
  exportCertificatesZip,
  generateQrDataUrl,
  resolveDescription,
  resolveParticipant
} from '../lib/certificateExport'
import { LocalBadge, PageTitle } from './Common'

interface CertificatesProps {
  templates: SavedTemplate[]
  saveTemplate: (t: SavedTemplate) => void
  addRecent: (f: RecentFile) => void
  notify: (msg: string) => void
  onImportStatus?: (status: ImportStatus | null) => void
  onDirtyChange?: (dirty: boolean) => void
}

const id = () => crypto.randomUUID()

export const initialCertificate: CertificateData = {
  title: 'Certificate of Participation',
  subtitle: 'This certificate is proudly presented to',
  description: 'for successfully participating in\n\n{{event}}\n\nheld on {{date}}.',
  event: 'Capacity Building & Training Program',
  date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  venue: 'Grand Hall, Main Office',
  signatory: 'Juan M. Dela Cruz',
  signatoryPosition: 'Director / Project Head',
  signatory2: '',
  signatory2Position: '',
  borderStyle: 'gold',
  includeQr: true,
  qrPrefix: 'CERT'
}

export function Certificates({ templates, saveTemplate, addRecent, notify, onImportStatus, onDirtyChange }: CertificatesProps) {
  const [participants, setParticipants] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [cert, setCert] = useState<CertificateData>(initialCertificate)
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(1)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [zoom, setZoom] = useState(0.65)
  const [qrPreviewUrl, setQrPreviewUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0, message: '' })

  const fileRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const sig1InputRef = useRef<HTMLInputElement>(null)
  const sig2InputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)

  // Mapping state
  const [nameCol, setNameCol] = useState('')
  const [orgCol, setOrgCol] = useState('')
  const [eventCol, setEventCol] = useState('')
  const [dateCol, setDateCol] = useState('')
  const [venueCol, setVenueCol] = useState('')

  const participantRaw = participants[index] || []
  const resolvedCurrent = participants.length
    ? resolveParticipant(cert, participantRaw, headers, index)
    : {
        name: 'Maria Clara Santos',
        organization: 'Department of Public Administration',
        event: cert.event,
        date: cert.date,
        venue: cert.venue,
        id: 'CERT-2026-0001',
        customFields: {}
      }

  // Update live QR preview for the current participant
  useEffect(() => {
    let active = true
    if (cert.includeQr !== false) {
      const qrPayload = `${cert.title} | Issued to: ${resolvedCurrent.name} | ID: ${resolvedCurrent.id} | Date: ${resolvedCurrent.date || cert.date}`
      generateQrDataUrl(qrPayload).then(url => {
        if (active) setQrPreviewUrl(url)
      })
    } else {
      setQrPreviewUrl('')
    }
    return () => {
      active = false
    }
  }, [cert.includeQr, cert.title, cert.date, resolvedCurrent.name, resolvedCurrent.id, resolvedCurrent.date])

  useEffect(() => {
    const isModified = Boolean(
      participants.length > 0 ||
      step > 1 ||
      isGenerating ||
      cert.title !== initialCertificate.title ||
      cert.event !== initialCertificate.event ||
      cert.venue !== initialCertificate.venue ||
      cert.signatory !== initialCertificate.signatory ||
      cert.backgroundImageUrl ||
      cert.logoUrl
    )
    onDirtyChange?.(isModified)
  }, [participants.length, step, isGenerating, cert, onDirtyChange])

  const importList = async (file?: File) => {
    if (!file) return
    onImportStatus?.({ name: file.name, status: 'loading', message: 'Reading participant list...' })
    try {
      const data = await readSpreadsheet(file)
      setFileName(file.name)
      setHeaders(data.headers)
      const validRows = data.rows.filter(r => r.some(c => c.trim()))
      setParticipants(validRows)
      setIndex(0)

      // Auto-detect columns
      const findCol = (regex: RegExp) => data.headers.find(h => regex.test(h)) || ''
      setNameCol(findCol(/name/i) || data.headers[0] || '')
      setOrgCol(findCol(/organization|agency|company|office|school/i))
      setEventCol(findCol(/event|training|seminar|course/i))
      setDateCol(findCol(/date/i))
      setVenueCol(findCol(/venue|location/i))

      setStep(2)
      onImportStatus?.({
        name: file.name,
        status: 'success',
        message: `Imported ${validRows.length.toLocaleString()} participants`
      })
      notify(`Imported ${validRows.length} participants from ${file.name}`)
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Unable to read participant list.'
      onImportStatus?.({ name: file.name, status: 'error', message: err })
      notify(err)
    }
  }

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    key: 'logoUrl' | 'signatureUrl' | 'signature2Url' | 'backgroundImageUrl'
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      const err = 'Please select a valid image file (PNG, JPG).'
      onImportStatus?.({ name: file.name, status: 'error', message: err })
      notify(err)
      return
    }
    onImportStatus?.({ name: file.name, status: 'loading', message: 'Loading image...' })
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCert(prev => ({
          ...prev,
          [key]: reader.result as string,
          ...(key === 'backgroundImageUrl'
            ? {
                hideDefaultText: true,
                signatory: prev.signatory === 'Juan M. Dela Cruz' ? '' : prev.signatory,
                signatoryPosition: prev.signatoryPosition === 'Director / Project Head' ? '' : prev.signatoryPosition,
                nameY: 94,
                nameX: 148.5
              }
            : {})
        }))
        onImportStatus?.({ name: file.name, status: 'success', message: 'Image loaded successfully' })
        notify(key === 'backgroundImageUrl' ? 'Canva template background loaded!' : 'Image loaded successfully')
      }
    }
    reader.onerror = () => {
      onImportStatus?.({ name: file.name, status: 'error', message: 'Failed to read image file' })
    }
    reader.readAsDataURL(file)
  }

  const insertPlaceholder = (ph: string) => {
    setCert(prev => ({ ...prev, description: `${prev.description} {{${ph}}}` }))
  }

  const handleCombinedPdf = async () => {
    if (!participants.length) return
    setIsGenerating(true)
    setProgress({ current: 0, total: participants.length, percent: 0, message: 'Starting combined PDF rendering...' })
    try {
      await exportCombinedCertificatesPdf(cert, participants, headers, p => setProgress(p))
      addRecent({
        id: id(),
        name: `${cert.title} (Combined - ${participants.length} pages)`,
        type: 'Certificate',
        modified: 'Just now'
      })
      notify(`Downloaded combined PDF with ${participants.length} certificates!`)
    } catch (err) {
      console.error(err)
      notify('Failed to generate combined PDF.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleZipDownload = async () => {
    if (!participants.length) return
    setIsGenerating(true)
    setProgress({ current: 0, total: participants.length, percent: 0, message: 'Packaging certificates into ZIP...' })
    try {
      await exportCertificatesZip(cert, participants, headers, p => setProgress(p))
      addRecent({
        id: id(),
        name: `${cert.title} (ZIP - ${participants.length} PDFs)`,
        type: 'Certificate',
        modified: 'Just now'
      })
      notify(`Downloaded ZIP archive with ${participants.length} individual certificates!`)
    } catch (err) {
      console.error(err)
      notify('Failed to generate ZIP archive.')
    } finally {
      setIsGenerating(false)
    }
  }

  const saveAsTemplate = () => {
    const name = prompt('Template name:', cert.title)
    if (name) {
      saveTemplate({
        id: id(),
        name,
        category: 'Certificate',
        updatedAt: new Date().toLocaleString(),
        payload: cert
      })
    }
  }

  const loadTemplate = (t: SavedTemplate) => {
    setCert(t.payload as CertificateData)
    setTemplatesOpen(false)
    notify('Certificate template loaded')
  }

  const handleUpdateCoord = (key: 'name' | 'qr' | 'sig1' | 'sig2', coords: { x: number; y: number }) => {
    setCert(prev => {
      if (key === 'name') return { ...prev, nameX: coords.x, nameY: coords.y }
      if (key === 'qr') return { ...prev, qrX: coords.x, qrY: coords.y }
      if (key === 'sig1') return { ...prev, sig1X: coords.x, sig1Y: coords.y }
      if (key === 'sig2') return { ...prev, sig2X: coords.x, sig2Y: coords.y }
      return prev
    })
  }

  return (
    <div className="page certificates-page">
      <PageTitle
        title="Bulk Certificate Generator"
        subtitle="Transform participant spreadsheets into official, print-ready certificates in seconds."
      >
        <div className="header-actions">
          <LocalBadge />
          <button className="button secondary" onClick={() => setTemplatesOpen(true)}>
            <LayoutTemplate size={16} /> Templates
          </button>
          <button className="button" onClick={saveAsTemplate}>
            <Save size={16} /> Save template
          </button>
        </div>
      </PageTitle>

      {/* Stepper Header */}
      <div className="steps-bar">
        {[
          { num: 1, label: 'Upload List' },
          { num: 2, label: 'Map Columns' },
          { num: 3, label: 'Design & Branding' },
          { num: 4, label: 'Live Preview' },
          { num: 5, label: 'Bulk Generate' }
        ].map(s => (
          <button
            key={s.num}
            className={`step-item ${step === s.num ? 'current' : step > s.num ? 'done' : ''}`}
            onClick={() => {
              if (participants.length || s.num === 1) setStep(s.num)
            }}
          >
            <span className="step-circle">{s.num}</span>
            <span className="step-label">{s.label}</span>
          </button>
        ))}
      </div>

      {/* STEP 1: Upload List */}
      {step === 1 && (
        <section
          className="cert-dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            importList(e.dataTransfer.files[0])
          }}
        >
          <div className="cert-dropzone-icon">
            <Medal size={42} />
          </div>
          <h2>Upload Participant Spreadsheet</h2>
          <p>
            Drop your Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) or CSV file containing participant names.
          </p>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => importList(e.target.files?.[0])}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="button cert-action-btn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Choose Spreadsheet
            </button>
            <button
              type="button"
              className="button secondary cert-action-btn"
              onClick={() => {
                const sampleHeaders = ['Name', 'Organization', 'Event', 'Date', 'Venue']
                const sampleRows = [
                  ['Juan M. Dela Cruz', 'Department of Education', 'Advanced Office Productivity Seminar', 'September 5, 2026', 'Main Auditorium'],
                  ['Maria Clara Santos', 'City Planning Office', 'Advanced Office Productivity Seminar', 'September 5, 2026', 'Main Auditorium'],
                  ['Antonio Luna', 'Bureau of Internal Revenue', 'Advanced Office Productivity Seminar', 'September 5, 2026', 'Main Auditorium'],
                  ['Gabriela Silang', 'Provincial Health Office', 'Advanced Office Productivity Seminar', 'September 5, 2026', 'Main Auditorium'],
                  ['Jose P. Rizal', 'Department of Science and Technology', 'Advanced Office Productivity Seminar', 'September 5, 2026', 'Main Auditorium']
                ]
                setFileName('Sample_Participants_Seminar.xlsx')
                setHeaders(sampleHeaders)
                setParticipants(sampleRows)
                setIndex(0)
                setNameCol('Name')
                setOrgCol('Organization')
                setEventCol('Event')
                setDateCol('Date')
                setVenueCol('Venue')
                setStep(2)
                notify('Loaded 5 sample participants!')
              }}
            >
              Try with Sample Data (5 Participants)
            </button>
          </div>

          {participants.length > 0 && (
            <div className="existing-file-banner">
              <span>
                Currently loaded: <strong>{fileName || 'Previous list'}</strong> ({participants.length} participants)
              </span>
              <button className="text-button" onClick={() => setStep(2)}>
                Continue with this list →
              </button>
            </div>
          )}
        </section>
      )}

      {/* STEP 2: Map Columns */}
      {step === 2 && (
        <section className="cert-card-container">
          <div className="cert-config-card">
            <h2>Confirm Column Mapping</h2>
            <p className="card-sub">
              Found <strong>{participants.length}</strong> participants from <code>{fileName}</code>. Verify the column
              assignments below.
            </p>

            <div className="mapping-grid">
              <label>
                <span>Participant Name (Required)</span>
                <select value={nameCol} onChange={e => setNameCol(e.target.value)}>
                  {headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Organization / Agency (Optional)</span>
                <select value={orgCol} onChange={e => setOrgCol(e.target.value)}>
                  <option value="">-- None / Default --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Event Name (Optional)</span>
                <select value={eventCol} onChange={e => setEventCol(e.target.value)}>
                  <option value="">-- Use Certificate Title/Event --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Date (Optional)</span>
                <select value={dateCol} onChange={e => setDateCol(e.target.value)}>
                  <option value="">-- Use Certificate Date --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Venue (Optional)</span>
                <select value={venueCol} onChange={e => setVenueCol(e.target.value)}>
                  <option value="">-- Use Certificate Venue --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="clean-helper-banner">
              <div className="clean-helper-info">
                <Sparkles size={16} className="clean-helper-icon" />
                <div>
                  <strong>Need to fix messy participant text casing?</strong>
                  <p>
                    Format names, organizations, and details into Capitalized Words (e.g.{' '}
                    <code>ilagan city</code> ➔ <code>Ilagan City</code>) or First Letter Only (e.g.{' '}
                    <code>ILAGAN CITY</code> ➔ <code>Ilagan city</code>).
                  </p>
                </div>
              </div>
              <div className="clean-helper-buttons">
                <button
                  type="button"
                  className="button secondary sm"
                  title="Capitalize every word / after every space (e.g. 'ilagan city' ➔ 'Ilagan City')"
                  onClick={() => {
                    let count = 0
                    const updated = participants.map(row =>
                      row.map(cell => {
                        const formatted = toTitleCase(cell)
                        if (formatted !== cell) count++
                        return formatted
                      })
                    )
                    setParticipants(updated)
                    notify(
                      count > 0
                        ? `Capitalized every word in participant list (${count} cell${count === 1 ? '' : 's'} updated)`
                        : 'Participant list is already properly capitalized.'
                    )
                  }}
                >
                  <Sparkles size={13} /> Every Word (Ilagan City)
                </button>
                <button
                  type="button"
                  className="button secondary sm"
                  title="Capitalize only the first letter of each cell (e.g. 'ILAGAN CITY' ➔ 'Ilagan city')"
                  onClick={() => {
                    let count = 0
                    const updated = participants.map(row =>
                      row.map(cell => {
                        const formatted = toFirstLetterCase(cell)
                        if (formatted !== cell) count++
                        return formatted
                      })
                    )
                    setParticipants(updated)
                    notify(
                      count > 0
                        ? `Capitalized first letter only in participant list (${count} cell${count === 1 ? '' : 's'} updated)`
                        : 'First letter is already capitalized.'
                    )
                  }}
                >
                  First Letter (Ilagan city)
                </button>
              </div>
            </div>

            <div className="card-actions-row">
              <button className="button secondary" onClick={() => setStep(1)}>
                <ChevronLeft size={16} /> Back
              </button>
              <button className="button" onClick={() => setStep(3)}>
                Proceed to Certificate Design <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 3: Design Certificate */}
      {step === 3 && (
        <section className="cert-designer-layout">
          <div className="cert-controls-panel">
            <h3>Certificate Details & Content</h3>

            <label>
              Certificate Title
              <input
                value={cert.title}
                onChange={e => setCert({ ...cert, title: e.target.value })}
                placeholder="e.g. Certificate of Participation"
              />
            </label>

            <label>
              Subtitle / Presentation Line
              <input
                value={cert.subtitle || ''}
                onChange={e => setCert({ ...cert, subtitle: e.target.value })}
                placeholder="THIS CERTIFICATE IS PROUDLY PRESENTED TO"
              />
            </label>

            <label>
              Certificate Body / Wording
              <textarea
                rows={4}
                value={cert.description}
                onChange={e => setCert({ ...cert, description: e.target.value })}
              />
              <div className="placeholder-tags">
                <span className="placeholder-label">Insert:</span>
                {['name', 'organization', 'event', 'date', 'venue', 'id'].map(p => (
                  <button key={p} type="button" onClick={() => insertPlaceholder(p)}>
                    + {`{{${p}}}`}
                  </button>
                ))}
              </div>
            </label>

            <div className="two-cols">
              <label>
                Event Name
                <input value={cert.event} onChange={e => setCert({ ...cert, event: e.target.value })} />
              </label>
              <label>
                Date Issued
                <input value={cert.date} onChange={e => setCert({ ...cert, date: e.target.value })} />
              </label>
            </div>

            <label>
              Venue / Location
              <input value={cert.venue} onChange={e => setCert({ ...cert, venue: e.target.value })} />
            </label>

            <div className="cert-section-divider">Template Layout & Background</div>
            
            <div className="template-mode-toggle">
              <button
                type="button"
                className={`mode-btn ${!cert.backgroundImageUrl ? 'selected' : ''}`}
                onClick={() => setCert(prev => ({ ...prev, backgroundImageUrl: undefined }))}
              >
                Built-in Borders
              </button>
              <button
                type="button"
                className={`mode-btn ${cert.backgroundImageUrl ? 'selected' : ''}`}
                onClick={() => {
                  if (!cert.backgroundImageUrl) {
                    bgInputRef.current?.click()
                  }
                }}
              >
                Upload Canva / Background Template
              </button>
            </div>

            {cert.backgroundImageUrl ? (
              <div className="canva-config-box">
                <div className="upload-field-row" style={{ marginTop: 10 }}>
                  <div className="upload-info">
                    <strong>Canva Template Image</strong>
                    <small>Full Landscape A4 Background</small>
                  </div>
                  <div className="upload-actions">
                    <div className="image-preview-thumb">
                      <img
                        src={cert.backgroundImageUrl}
                        alt="Canva BG"
                        style={{ width: 44, height: 30, objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        title="Remove background"
                        onClick={() => setCert(prev => ({ ...prev, backgroundImageUrl: undefined }))}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="button secondary sm-btn"
                      onClick={() => bgInputRef.current?.click()}
                    >
                      Change
                    </button>
                  </div>
                </div>

                <label className="cert-toggle-label" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={cert.hideDefaultText !== false}
                    onChange={e => setCert(prev => ({ ...prev, hideDefaultText: e.target.checked }))}
                  />
                  <span>
                    <strong>Canva template already has text</strong>
                    <small>Only overlay Participant Name, Signatures, and QR Code</small>
                  </span>
                </label>

                <div className="canva-sliders-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Name Position</span>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: 12 }}
                      onClick={() => setCert(prev => ({ ...prev, nameX: 148.5, nameY: 94 }))}
                      title="Reset name to standard Canva line (Center: 148.5mm, Line: 94mm)"
                    >
                      Reset to Center Line
                    </button>
                  </div>
                  <label>
                    <span>Name Vertical Position: <strong>{cert.nameY ?? 94} mm</strong></span>
                    <input
                      type="range"
                      min={40}
                      max={180}
                      value={cert.nameY ?? 94}
                      onChange={e => setCert(prev => ({ ...prev, nameY: Number(e.target.value) }))}
                    />
                  </label>

                  <div className="two-cols" style={{ marginTop: 8 }}>
                    <label>
                      <span>Name Size: <strong>{cert.nameSize ?? 28} pt</strong></span>
                      <input
                        type="range"
                        min={18}
                        max={54}
                        value={cert.nameSize ?? 28}
                        onChange={e => setCert(prev => ({ ...prev, nameSize: Number(e.target.value) }))}
                      />
                    </label>

                    <label>
                      <span>Name Color:</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        <input
                          type="color"
                          value={cert.nameColor ?? '#1e2022'}
                          onChange={e => setCert(prev => ({ ...prev, nameColor: e.target.value }))}
                          style={{ width: 40, height: 30, padding: 1, cursor: 'pointer', borderRadius: 6 }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {cert.nameColor ?? '#1e2022'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-style-grid">
                {(
                  [
                    { key: 'gold', label: 'Gold Ornate', color: '#c5a059', border: '3px double #c5a059' },
                    { key: 'modern', label: 'Modern Emerald', color: '#245b4b', border: '3px solid #245b4b' },
                    { key: 'academic', label: 'Academic Navy', color: '#182b49', border: '3px double #182b49' },
                    { key: 'minimal', label: 'Clean Minimal', color: '#888888', border: '1px solid #999999' }
                  ] as { key: CertificateBorderStyle; label: string; color: string; border: string }[]
                ).map(b => (
                  <button
                    key={b.key}
                    type="button"
                    className={`border-choice ${cert.borderStyle === b.key ? 'selected' : ''}`}
                    onClick={() => setCert({ ...cert, borderStyle: b.key })}
                  >
                    <div className="border-choice-preview" style={{ border: b.border }}>
                      <span style={{ background: b.color }} />
                    </div>
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            )}

            <input
              ref={bgInputRef}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => handleImageUpload(e, 'backgroundImageUrl')}
            />

            <div className="cert-section-divider">Branding, Logo & Signatures</div>

            {/* Logo Uploader */}
            <div className="upload-field-row">
              <div className="upload-info">
                <strong>Official Logo</strong>
                <small>PNG or JPG placed top-center</small>
              </div>
              <div className="upload-actions">
                {cert.logoUrl ? (
                  <div className="image-preview-thumb">
                    <img src={cert.logoUrl} alt="Logo" />
                    <button
                      type="button"
                      title="Remove logo"
                      onClick={() => setCert(prev => ({ ...prev, logoUrl: undefined }))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button secondary sm-btn"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload size={14} /> Upload Logo
                  </button>
                )}
                <input
                  ref={logoInputRef}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload(e, 'logoUrl')}
                />
              </div>
            </div>

            {/* Signatory 1 */}
            <div className="two-cols">
              <label>
                Signatory 1 Name
                <input value={cert.signatory} onChange={e => setCert({ ...cert, signatory: e.target.value })} />
              </label>
              <label>
                Signatory 1 Position
                <input
                  value={cert.signatoryPosition}
                  onChange={e => setCert({ ...cert, signatoryPosition: e.target.value })}
                />
              </label>
            </div>
            <div className="upload-field-row">
              <div className="upload-info">
                <strong>Signatory 1 Digital Signature</strong>
                <small>Transparent PNG recommended</small>
              </div>
              <div className="upload-actions">
                {cert.signatureUrl ? (
                  <div className="image-preview-thumb sig-thumb">
                    <img src={cert.signatureUrl} alt="Sig 1" />
                    <button
                      type="button"
                      title="Remove signature"
                      onClick={() => setCert(prev => ({ ...prev, signatureUrl: undefined }))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button secondary sm-btn"
                    onClick={() => sig1InputRef.current?.click()}
                  >
                    <Upload size={14} /> Upload Signature
                  </button>
                )}
                <input
                  ref={sig1InputRef}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload(e, 'signatureUrl')}
                />
              </div>
            </div>

            {/* Signatory 2 (Optional) */}
            <div className="two-cols">
              <label>
                Signatory 2 Name (Optional)
                <input
                  value={cert.signatory2 || ''}
                  onChange={e => setCert({ ...cert, signatory2: e.target.value })}
                  placeholder="Optional co-signatory"
                />
              </label>
              <label>
                Signatory 2 Position
                <input
                  value={cert.signatory2Position || ''}
                  onChange={e => setCert({ ...cert, signatory2Position: e.target.value })}
                  placeholder="Position / Office"
                />
              </label>
            </div>
            {cert.signatory2 && (
              <div className="upload-field-row">
                <div className="upload-info">
                  <strong>Signatory 2 Signature</strong>
                  <small>Transparent PNG</small>
                </div>
                <div className="upload-actions">
                  {cert.signature2Url ? (
                    <div className="image-preview-thumb sig-thumb">
                      <img src={cert.signature2Url} alt="Sig 2" />
                      <button
                        type="button"
                        title="Remove signature 2"
                        onClick={() => setCert(prev => ({ ...prev, signature2Url: undefined }))}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="button secondary sm-btn"
                      onClick={() => sig2InputRef.current?.click()}
                    >
                      <Upload size={14} /> Upload Signature
                    </button>
                  )}
                  <input
                    ref={sig2InputRef}
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={e => handleImageUpload(e, 'signature2Url')}
                  />
                </div>
              </div>
            )}

            {/* QR Code Toggle */}
            <div className="cert-section-divider">Security & Verification</div>
            <label className="cert-toggle-label">
              <input
                type="checkbox"
                checked={cert.includeQr !== false}
                onChange={e => setCert({ ...cert, includeQr: e.target.checked })}
              />
              <span>
                <strong>Include Verification QR Code</strong>
                <small>Embeds an authentic offline verification code on every certificate</small>
              </span>
            </label>

            {cert.includeQr !== false && (
              <label style={{ marginTop: 8 }}>
                Certificate ID Prefix
                <input
                  value={cert.qrPrefix || 'CERT'}
                  onChange={e => setCert({ ...cert, qrPrefix: e.target.value })}
                  placeholder="e.g. CERT or DEPED"
                />
              </label>
            )}

            <div className="cert-flow-actions">
              <button className="button" onClick={() => setStep(4)}>
                Preview Certificate <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Miniature Live Preview alongside Designer */}
          <div className="cert-side-preview">
            <div className="cert-side-preview-header">
              <span>Live Visual Layout (Landscape A4)</span>
              <button className="text-button" onClick={() => setStep(4)}>
                Expand Preview →
              </button>
            </div>
            <div className="cert-mini-stage">
              <CertificateLandscapePaper
                cert={cert}
                participant={resolvedCurrent}
                qrUrl={qrPreviewUrl}
                zoom={0.52}
                onUpdateCoord={handleUpdateCoord}
              />
            </div>
          </div>
        </section>
      )}

      {/* STEP 4: Full Interactive Preview */}
      {step === 4 && (
        <section className="cert-preview-stage">
          <div className="cert-preview-toolbar">
            <div className="participant-pager">
              <button
                className="button secondary sm-btn"
                disabled={index === 0}
                onClick={() => setIndex(Math.max(0, index - 1))}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span>
                Participant <strong>{index + 1}</strong> of <strong>{participants.length || 1}</strong>: &nbsp;
                <em>{resolvedCurrent.name}</em>
              </span>
              <button
                className="button secondary sm-btn"
                disabled={index >= participants.length - 1}
                onClick={() => setIndex(Math.min(participants.length - 1, index + 1))}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>

            <div className="zoom-controls">
              <button className="icon-button" onClick={() => setZoom(Math.max(0.4, zoom - 0.08))}>
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="icon-button" onClick={() => setZoom(Math.min(1.0, zoom + 0.08))}>
                +
              </button>
              <button className="text-button" onClick={() => setZoom(0.65)}>
                Fit
              </button>
            </div>

            <div className="placement-controls">
              <button
                type="button"
                className="button secondary sm-btn"
                title="Center participant name horizontally"
                onClick={() => {
                  setCert(prev => ({ ...prev, nameX: 148.5 }))
                  notify('Name centered horizontally')
                }}
              >
                Center Name
              </button>
              <button
                type="button"
                className="button secondary sm-btn"
                title="Reset all element placements to default"
                onClick={() => {
                  setCert(prev => ({
                    ...prev,
                    nameX: undefined,
                    nameY: undefined,
                    qrX: undefined,
                    qrY: undefined,
                    sig1X: undefined,
                    sig1Y: undefined,
                    sig2X: undefined,
                    sig2Y: undefined
                  }))
                  notify('Positions reset to default')
                }}
              >
                Reset Positions
              </button>
            </div>

            <div className="toolbar-spacer" />

            <button className="button secondary" onClick={() => setStep(3)}>
              Modify Design
            </button>
            <button className="button" onClick={() => setStep(5)}>
              Proceed to Generate ({participants.length}) <ChevronRight size={16} />
            </button>
          </div>

          <div className="drag-hint-banner">
            Click & drag elements to position them. Automatic alignment crosshairs appear when centered.
          </div>

          <div className="cert-canvas-wrapper">
            <CertificateLandscapePaper
              cert={cert}
              participant={resolvedCurrent}
              qrUrl={qrPreviewUrl}
              zoom={zoom}
              onUpdateCoord={handleUpdateCoord}
            />
          </div>
        </section>
      )}

      {/* STEP 5: Bulk Generation & Download */}
      {step === 5 && (
        <section className="cert-generation-stage">
          <div className="generation-header">
            <Wand2 size={36} />
            <h2>Ready to Generate {participants.length} Certificates</h2>
            <p>
              Your certificates will be generated locally in high-definition Landscape A4. Choose your preferred export
              format below:
            </p>
          </div>

          {isGenerating ? (
            <div className="cert-progress-box">
              <div className="progress-top">
                <span>{progress.message || 'Processing...'}</span>
                <strong>{progress.percent}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
              </div>
              <small>
                Completed {progress.current} of {progress.total} certificates. Please keep this tab open.
              </small>
            </div>
          ) : (
            <div className="export-options-grid">
              {/* Option 1: Combined Multi-Page PDF */}
              <div className="export-card primary-card">
                <div className="export-card-icon">
                  <Download size={28} />
                </div>
                <h3>Download Combined PDF</h3>
                <span className="rec-badge">Recommended for Printing</span>
                <p>
                  Combines all <strong>{participants.length}</strong> certificates into a single multi-page PDF document.
                  Open once, print all pages effortlessly.
                </p>
                <button className="button cert-big-btn" onClick={handleCombinedPdf}>
                  <Download size={18} /> Download Combined PDF
                </button>
              </div>

              {/* Option 2: Individual PDFs in ZIP */}
              <div className="export-card">
                <div className="export-card-icon">
                  <Archive size={28} />
                </div>
                <h3>Download All as ZIP (.zip)</h3>
                <span className="zip-badge">Packaged Archive</span>
                <p>
                  Generates an individual, sanitized PDF for each participant (e.g. <code>Certificate_Juan_Dela_Cruz.pdf</code>)
                  packaged cleanly inside 1 zip archive.
                </p>
                <button className="button secondary cert-big-btn" onClick={handleZipDownload}>
                  <Archive size={18} /> Download ZIP Archive
                </button>
              </div>
            </div>
          )}

          <div className="generation-footer-nav">
            <button className="button secondary" disabled={isGenerating} onClick={() => setStep(4)}>
              <ChevronLeft size={16} /> Back to Preview
            </button>
            <button
              className="button secondary"
              disabled={isGenerating}
              onClick={() => {
                setStep(1)
                setParticipants([])
                notify('Reset to start new batch')
              }}
            >
              <RotateCcw size={15} /> Start New Batch
            </button>
          </div>
        </section>
      )}

      {/* Templates Modal */}
      {templatesOpen && (
        <div className="modal-backdrop" onClick={() => setTemplatesOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <header>
              <h2>Certificate Templates</h2>
              <button className="icon-button" onClick={() => setTemplatesOpen(false)}>
                ✕
              </button>
            </header>
            <div className="template-picker">
              {templates.filter(t => t.category === 'Certificate').length ? (
                templates
                  .filter(t => t.category === 'Certificate')
                  .map(t => (
                    <button key={t.id} onClick={() => loadTemplate(t)}>
                      <LayoutTemplate size={18} />
                      <span>
                        <strong>{t.name}</strong>
                        <small>Updated {t.updatedAt}</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))
              ) : (
                <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                  No saved certificate templates yet. Design a certificate and click "Save template" above.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getNaturalCenter(elem: HTMLElement, paper: HTMLElement) {
  const elemRect = elem.getBoundingClientRect()
  const paperRect = paper.getBoundingClientRect()
  const mmPerPxX = 297 / paperRect.width
  const mmPerPxY = 210 / paperRect.height

  const style = window.getComputedStyle(elem)
  let currentTxMm = 0
  let currentTyMm = 0

  if (style.transform && style.transform !== 'none') {
    try {
      const matrix = new DOMMatrixReadOnly(style.transform)
      currentTxMm = matrix.m41 * mmPerPxX
      currentTyMm = matrix.m42 * mmPerPxY
    } catch {
      // ignore
    }
  }

  const currentCenterMmX = (elemRect.left + elemRect.width / 2 - paperRect.left) * mmPerPxX
  const currentCenterMmY = (elemRect.top + elemRect.height / 2 - paperRect.top) * mmPerPxY

  return {
    x: currentCenterMmX - currentTxMm,
    y: currentCenterMmY - currentTyMm
  }
}

/**
 * Landscape A4 Certificate Live Rendering component.
 * Exact 297mm × 210mm proportions with responsive zoom scale.
 */
function CertificateLandscapePaper({
  cert,
  participant,
  qrUrl,
  zoom,
  onUpdateCoord
}: {
  cert: CertificateData
  participant: ReturnType<typeof resolveParticipant>
  qrUrl: string
  zoom: number
  onUpdateCoord?: (key: 'name' | 'qr' | 'sig1' | 'sig2', coords: { x: number; y: number }) => void
}) {
  const paperRef = useRef<HTMLElement>(null)
  const [activeDrag, setActiveDrag] = useState<string | null>(null)
  const [snapGuides, setSnapGuides] = useState<{
    x: number | null
    y: number | null
    labelX?: string
    labelY?: string
  }>({ x: null, y: null })
  const naturalNameYRef = useRef<number>(86)
  const borderClass = cert.backgroundImageUrl ? 'has-canva-bg' : `border-${cert.borderStyle || 'gold'}`
  const descText = resolveDescription(cert.description, participant, cert)

  // Active or fallback coordinates in mm
  const isCanvaMode = Boolean(cert.backgroundImageUrl && cert.hideDefaultText !== false)
  const defaultNameY = isCanvaMode ? 94 : 78
  const nameX = cert.nameX ?? 148.5
  const nameY = cert.nameY ?? defaultNameY
  const qrX = cert.qrX ?? 262
  const qrY = cert.qrY ?? 172
  const hasSignatory2 = Boolean(cert.signatory2 && cert.signatory2.trim())
  const sig1X = cert.sig1X ?? (hasSignatory2 ? 85 : 148.5)
  const sig1Y = cert.sig1Y ?? 180
  const sig2X = cert.sig2X ?? 212
  const sig2Y = cert.sig2Y ?? 180

  const startDrag = (e: React.PointerEvent, key: 'name' | 'qr' | 'sig1' | 'sig2') => {
    if (!onUpdateCoord) return
    e.preventDefault()
    e.stopPropagation()
    setActiveDrag(key)

    const paper = paperRef.current
    if (!paper) return

    const paperRect = paper.getBoundingClientRect()
    const mmPerPxX = 297 / paperRect.width
    const mmPerPxY = 210 / paperRect.height

    const elem = e.currentTarget as HTMLElement
    const elemRect = elem.getBoundingClientRect()
    const naturalCenter = isCanvaMode ? { x: 148.5, y: 105 } : getNaturalCenter(elem, paper)

    if (key === 'name') {
      naturalNameYRef.current = naturalCenter.y
    }

    // Grab offset from the element's actual geometric center
    const grabOffsetMmX = (e.clientX - (elemRect.left + elemRect.width / 2)) * mmPerPxX
    const grabOffsetMmY = (e.clientY - (elemRect.top + elemRect.height / 2)) * mmPerPxY

    const handlePointerMove = (moveEv: PointerEvent) => {
      const mousePaperX = (moveEv.clientX - paperRect.left) * mmPerPxX
      const mousePaperY = (moveEv.clientY - paperRect.top) * mmPerPxY

      const rawX = mousePaperX - grabOffsetMmX
      const rawY = mousePaperY - grabOffsetMmY

      let targetX = Math.round(Math.max(10, Math.min(287, rawX)))
      let targetY = Math.round(Math.max(10, Math.min(200, rawY)))

      let guideX: number | null = null
      let guideY: number | null = null
      let labelX: string | undefined
      let labelY: string | undefined

      const SNAP_THRESHOLD = 3.5

      // 1. Horizontal center snapping (148.5mm)
      if (Math.abs(rawX - 148.5) <= SNAP_THRESHOLD) {
        targetX = 148.5
        guideX = 148.5
        labelX = 'Center'
      }

      // 2. Vertical snapping
      if (!isCanvaMode && key === 'name') {
        // In standard mode, snap to the natural Name slot!
        if (Math.abs(rawY - naturalCenter.y) <= SNAP_THRESHOLD) {
          targetY = Math.round(naturalCenter.y)
          guideY = naturalCenter.y
          labelY = 'Name Slot'
        } else if (Math.abs(rawY - 105) <= SNAP_THRESHOLD) {
          targetY = 105
          guideY = 105
          labelY = 'Page Middle'
        }
      } else {
        // In Canva mode, snap to the Canva name line (94mm) or page middle (105mm)
        if (Math.abs(rawY - 94) <= SNAP_THRESHOLD) {
          targetY = 94
          guideY = 94
          labelY = 'Name Line'
        } else if (Math.abs(rawY - 105) <= SNAP_THRESHOLD) {
          targetY = 105
          guideY = 105
          labelY = 'Page Middle'
        }
      }

      // 3. Signature-specific baseline and column alignment
      if (key === 'sig1' || key === 'sig2') {
        const sigBaseY = naturalCenter.y || 180
        if (Math.abs(rawY - sigBaseY) <= SNAP_THRESHOLD) {
          targetY = Math.round(sigBaseY)
          guideY = sigBaseY
          labelY = 'Signatures Baseline'
        }
        if (key === 'sig1' && Math.abs(rawX - (hasSignatory2 ? 85 : 148.5)) <= SNAP_THRESHOLD) {
          targetX = hasSignatory2 ? 85 : 148.5
          guideX = targetX
          labelX = hasSignatory2 ? 'Left Column' : 'Center'
        } else if (key === 'sig2' && Math.abs(rawX - 212) <= SNAP_THRESHOLD) {
          targetX = 212
          guideX = 212
          labelX = 'Right Column'
        }
      }

      // 4. QR-specific alignments
      if (key === 'qr') {
        if (Math.abs(rawX - 262) <= SNAP_THRESHOLD) {
          targetX = 262
          guideX = 262
          labelX = 'Right Align'
        }
        if (Math.abs(rawY - 172) <= SNAP_THRESHOLD) {
          targetY = 172
          guideY = 172
          labelY = 'Bottom Align'
        }
      }

      setSnapGuides({ x: guideX, y: guideY, labelX, labelY })

      // Real-time position update during drag
      if (isCanvaMode) {
        elem.style.left = `${targetX}mm`
        elem.style.top = `${targetY}mm`
      } else {
        const deltaX = targetX - naturalCenter.x
        const deltaY = targetY - naturalCenter.y
        elem.style.transform = `translate(${deltaX}mm, ${deltaY}mm)`
      }

      onUpdateCoord(key, { x: targetX, y: targetY })
    }

    const handlePointerUp = () => {
      setActiveDrag(null)
      setSnapGuides({ x: null, y: null })
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div className="cert-landscape-wrapper">
      <article
        ref={paperRef}
        className={`cert-landscape-paper ${borderClass} ${activeDrag ? 'is-any-dragging' : ''}`}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          backgroundImage: cert.backgroundImageUrl ? `url("${cert.backgroundImageUrl}")` : undefined,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          border: cert.backgroundImageUrl ? '1px solid var(--border)' : undefined,
          outline: cert.backgroundImageUrl ? 'none' : undefined
        }}
      >
        {/* Smart Alignment Guides (Canva / Figma style crosshair) */}
        {snapGuides.x !== null && (
          <div
            className="cert-guide-line cert-guide-vertical"
            style={{ left: `${snapGuides.x}mm` }}
          >
            {snapGuides.labelX && <span className="cert-guide-pill-v">{snapGuides.labelX}</span>}
          </div>
        )}
        {snapGuides.y !== null && (
          <div
            className="cert-guide-line cert-guide-horizontal"
            style={{ top: `${snapGuides.y}mm` }}
          >
            {snapGuides.labelY && <span className="cert-guide-pill-h">{snapGuides.labelY}</span>}
          </div>
        )}
        {snapGuides.x !== null && snapGuides.y !== null && (
          <div
            className="cert-guide-cross-center"
            style={{ left: `${snapGuides.x}mm`, top: `${snapGuides.y}mm` }}
          />
        )}
        {cert.backgroundImageUrl && cert.hideDefaultText !== false ? (
          <div className="cert-canva-overlay-container">
            {/* Draggable Participant Name */}
            <div
              className={`cert-draggable-item cert-name-layer ${activeDrag === 'name' ? 'is-dragging' : ''}`}
              style={{
                left: `${nameX}mm`,
                top: `${nameY}mm`,
                fontSize: `${cert.nameSize ?? 28}pt`,
                color: cert.nameColor ?? '#1e2022'
              }}
              onPointerDown={e => startDrag(e, 'name')}
              title="Click & drag to position name"
            >
              <h2>{participant.name}</h2>
              <span className="drag-handle-label">
                {activeDrag === 'name' ? `${nameX}mm, ${nameY}mm` : 'Drag to position name'}
              </span>
            </div>

            {/* Draggable Signatory 1 (Only if signature image or custom signatory specified) */}
            {Boolean(cert.signatureUrl || (cert.signatory && cert.signatory.trim() && cert.signatory !== 'Juan M. Dela Cruz')) && (
              <div
                className={`cert-draggable-item cert-sig-item ${activeDrag === 'sig1' ? 'is-dragging' : ''}`}
                style={{
                  left: `${sig1X}mm`,
                  top: `${sig1Y}mm`
                }}
                onPointerDown={e => startDrag(e, 'sig1')}
                title="Click & drag to position signature"
              >
                <div className="cert-signature-block">
                  {cert.signatureUrl && (
                    <div className="cert-signature-img">
                      <img src={cert.signatureUrl} alt="Signature 1" />
                    </div>
                  )}
                  {cert.signatory && cert.signatory !== 'Juan M. Dela Cruz' && (
                    <>
                      <div className="cert-sig-line" />
                      <strong>{cert.signatory}</strong>
                      <small>{cert.signatoryPosition || 'Signatory Position'}</small>
                    </>
                  )}
                </div>
                <span className="drag-handle-label">
                  {activeDrag === 'sig1' ? `${sig1X}mm, ${sig1Y}mm` : 'Drag signature 1'}
                </span>
              </div>
            )}

            {/* Draggable Signatory 2 */}
            {Boolean(cert.signature2Url || (cert.signatory2 && cert.signatory2.trim())) && (
              <div
                className={`cert-draggable-item cert-sig-item ${activeDrag === 'sig2' ? 'is-dragging' : ''}`}
                style={{
                  left: `${sig2X}mm`,
                  top: `${sig2Y}mm`
                }}
                onPointerDown={e => startDrag(e, 'sig2')}
                title="Click & drag to position signatory 2"
              >
                <div className="cert-signature-block">
                  {cert.signature2Url && (
                    <div className="cert-signature-img">
                      <img src={cert.signature2Url} alt="Signature 2" />
                    </div>
                  )}
                  <div className="cert-sig-line" />
                  <strong>{cert.signatory2}</strong>
                  <small>{cert.signatory2Position || 'Position'}</small>
                </div>
                <span className="drag-handle-label">
                  {activeDrag === 'sig2' ? `${sig2X}mm, ${sig2Y}mm` : 'Drag signature 2'}
                </span>
              </div>
            )}

            {/* Draggable QR Code */}
            {cert.includeQr !== false && qrUrl && (
              <div
                className={`cert-draggable-item cert-qr-item ${activeDrag === 'qr' ? 'is-dragging' : ''}`}
                style={{
                  left: `${qrX}mm`,
                  top: `${qrY}mm`
                }}
                onPointerDown={e => startDrag(e, 'qr')}
                title="Click & drag to position QR code"
              >
                <div className="cert-qr-block">
                  <img src={qrUrl} alt="QR Code" />
                  <span className="cert-id-tag">{participant.id}</span>
                  <span className="cert-scan-tag">Scan to verify</span>
                </div>
                <span className="drag-handle-label">
                  {activeDrag === 'qr' ? `${qrX}mm, ${qrY}mm` : 'Drag QR code'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="cert-frame-inner">
            {/* Top Logo (only if uploaded) */}
            {cert.logoUrl && (
              <div className="cert-logo-box">
                <img src={cert.logoUrl} alt="Logo" />
              </div>
            )}

            {/* Title */}
            <h1 className="cert-main-title">{cert.title || 'Certificate of Participation'}</h1>

            {/* Presentation Subtitle */}
            <p className="cert-presentation-sub">
              {(cert.subtitle || 'THIS CERTIFICATE IS PROUDLY PRESENTED TO').toUpperCase()}
            </p>

            {/* Participant Name (Draggable in standard layout too!) */}
            <div
              className={`cert-draggable-item cert-name-standard-wrap ${activeDrag === 'name' ? 'is-dragging' : ''}`}
              style={{
                transform:
                  cert.nameX !== undefined || cert.nameY !== undefined
                    ? `translate(${(cert.nameX ?? 148.5) - 148.5}mm, ${cert.nameY !== undefined ? cert.nameY - naturalNameYRef.current : 0}mm)`
                    : undefined
              }}
              onPointerDown={e => startDrag(e, 'name')}
              title="Click & drag to adjust name position"
            >
              <h2 className="cert-participant-name">{participant.name}</h2>
              <div className="cert-name-underline" />
              <span className="drag-handle-label">
                {activeDrag === 'name' ? `${nameX}mm, ${nameY}mm` : 'Drag to reposition'}
              </span>
            </div>

            {/* Description / Body Text */}
            <div className="cert-body-text">
              {descText.split('\n').map((line, i) => (
                <p key={i}>{line || '\u00A0'}</p>
              ))}
            </div>

            {/* Bottom Area: Signatures & QR Code */}
            <div className="cert-bottom-row">
              {/* Signatory 1 */}
              <div
                className={`cert-draggable-item cert-sig-standard ${activeDrag === 'sig1' ? 'is-dragging' : ''}`}
                style={{
                  transform:
                    cert.sig1X !== undefined || cert.sig1Y !== undefined
                      ? `translate(${sig1X - (hasSignatory2 ? 85 : 148.5)}mm, ${sig1Y - 180}mm)`
                      : undefined
                }}
                onPointerDown={e => startDrag(e, 'sig1')}
                title="Click & drag to adjust signature position"
              >
                <div className="cert-signature-block">
                  {cert.signatureUrl && (
                    <div className="cert-signature-img">
                      <img src={cert.signatureUrl} alt="Signature 1" />
                    </div>
                  )}
                  <div className="cert-sig-line" />
                  <strong>{cert.signatory || 'Signatory Name'}</strong>
                  <small>{cert.signatoryPosition || 'Signatory Position'}</small>
                </div>
                <span className="drag-handle-label">
                  {activeDrag === 'sig1' ? `${sig1X}mm, ${sig1Y}mm` : 'Drag signature 1'}
                </span>
              </div>

              {/* Optional Signatory 2 */}
              {cert.signatory2 && (
                <div
                  className={`cert-draggable-item cert-sig-standard ${activeDrag === 'sig2' ? 'is-dragging' : ''}`}
                  style={{
                    transform:
                      cert.sig2X !== undefined || cert.sig2Y !== undefined
                        ? `translate(${sig2X - 212}mm, ${sig2Y - 180}mm)`
                        : undefined
                  }}
                  onPointerDown={e => startDrag(e, 'sig2')}
                  title="Click & drag to adjust signature 2 position"
                >
                  <div className="cert-signature-block">
                    {cert.signature2Url && (
                      <div className="cert-signature-img">
                        <img src={cert.signature2Url} alt="Signature 2" />
                      </div>
                    )}
                    <div className="cert-sig-line" />
                    <strong>{cert.signatory2}</strong>
                    <small>{cert.signatory2Position || 'Position'}</small>
                  </div>
                  <span className="drag-handle-label">
                    {activeDrag === 'sig2' ? `${sig2X}mm, ${sig2Y}mm` : 'Drag signature 2'}
                  </span>
                </div>
              )}

              {/* QR Code Verification (draggable) */}
              {cert.includeQr !== false && qrUrl && (
                <div
                  className={`cert-draggable-item cert-qr-standard ${activeDrag === 'qr' ? 'is-dragging' : ''}`}
                  onPointerDown={e => startDrag(e, 'qr')}
                  title="Click & drag to move QR Code"
                  style={{
                    transform:
                      cert.qrX !== undefined || cert.qrY !== undefined
                        ? `translate(${qrX - 262}mm, ${qrY - 172}mm)`
                        : undefined
                  }}
                >
                  <div className="cert-qr-block">
                    <img src={qrUrl} alt="QR Code" />
                    <span className="cert-id-tag">{participant.id}</span>
                    <span className="cert-scan-tag">Scan to verify</span>
                  </div>
                  <span className="drag-handle-label">
                    {activeDrag === 'qr' ? `${qrX}mm, ${qrY}mm` : 'Drag QR'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
