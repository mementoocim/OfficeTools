import { ArrowRight, FilePlus2, Search, ShieldCheck, X } from 'lucide-react'
import type { ReactNode } from 'react'

export function LocalBadge() { return <span className="local-badge"><ShieldCheck size={13} /> Local processing</span> }
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) { return <header className="page-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children}</header> }
export function ToolCard({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: () => void }) { return <button className="tool-card" onClick={action}><span className="tool-icon">{icon}</span><span className="tool-copy"><strong>{title}</strong><small>{text}</small></span><ArrowRight size={18} /></button> }
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
