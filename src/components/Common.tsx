import { FilePlus2, Search, ShieldCheck, X } from 'lucide-react'
import type { ReactNode } from 'react'

export function LocalBadge() { return <span className="local-badge"><ShieldCheck size={13} /> Local processing</span> }
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) { return <header className="page-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children}</header> }
export function ToolCard({ title, text, artwork, tone, action }: { title: string; text: string; artwork?: string; tone?: string; action: () => void }) { return <button className={`tool-card ${tone || ''}`} onClick={action}><span className="tool-copy"><strong>{title}</strong><small>{text}</small></span>{artwork && <img className="tool-card-artwork" src={artwork} alt="" width="1536" height="1024" decoding="async" />}</button> }
export function EmptyState({ title, text, action }: { title: string; text: string; action?: () => void }) { return <div className="empty"><span><FilePlus2 size={22} /></span><h3>{title}</h3><p>{text}</p>{action && <button className="button secondary" onClick={action}>Get started</button>}</div> }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) { return <div className="modal-backdrop" onMouseDown={close}><section className="modal" onMouseDown={e => e.stopPropagation()}><header><h2>{title}</h2><button className="icon-button" onClick={close}><X size={18}/></button></header>{children}</section></div> }
export function SearchField({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) { return <label className="search"><Search size={16}/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label> }
export function GoogleWord() {
  return (
    <span className="google-word-brand">
      <span className="google-char-g1">G</span>
      <span className="google-char-o1">o</span>
      <span className="google-char-o2">o</span>
      <span className="google-char-g2">g</span>
      <span className="google-char-l">l</span>
      <span className="google-char-e">e</span>
    </span>
  )
}

export function CrashRecoveryBanner({
  savedAt,
  title,
  onRestore,
  onDiscard
}: {
  savedAt: string
  title?: string
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <div className="crash-recovery-banner" role="alert">
      <div className="crash-recovery-info">
        <strong>Unsaved work recovered from previous session</strong>
        <p>Auto-saved locally at {savedAt}{title ? ` • ${title}` : ''}. Would you like to restore your progress?</p>
      </div>
      <div className="crash-recovery-actions">
        <button type="button" className="button sm" onClick={onRestore}>
          Restore
        </button>
        <button type="button" className="button secondary sm recovery-discard" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}

export function AutoSaveStatus({
  lastSaved,
  isDirty
}: {
  lastSaved: string | null
  isDirty: boolean
}) {
  if (!isDirty && !lastSaved) return null
  return (
    <span className="autosave-status-badge" title="Changes are automatically saved to your local browser storage">
      <span className="autosave-dot" />
      {lastSaved ? `Auto-saved locally (${lastSaved})` : 'Saving changes...'}
    </span>
  )
}
