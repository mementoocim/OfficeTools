import { BookOpenText, ChevronLeft, FileSpreadsheet, Files, FileText, Home, LayoutTemplate, Medal, Settings, TableProperties } from 'lucide-react'
import type { Page } from '../types'

const items: { id: Page; label: string; icon: typeof Home; group?: string }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'documents', label: 'Documents', icon: FileText, group: 'TOOLS' },
  { id: 'spreadsheets', label: 'Spreadsheets', icon: FileSpreadsheet },
  { id: 'reports', label: 'Reports', icon: BookOpenText },
  { id: 'certificates', label: 'Certificates', icon: Medal },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, group: 'LIBRARY' },
  { id: 'recent', label: 'Recent Files', icon: Files },
]

export function AppSidebar({ page, setPage, collapsed, toggle }: { page: Page; setPage: (p: Page) => void; collapsed: boolean; toggle: () => void }) {
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="brand"><span className="brand-mark"><TableProperties size={19} /></span>{!collapsed && <span>Office Toolkit</span>}<button title="Collapse sidebar" className="icon-button collapse" onClick={toggle}><ChevronLeft size={17} /></button></div>
    <nav>{items.map((item, index) => <div key={item.id}>{item.group && <div className="nav-label">{item.group}</div>}<button title={collapsed ? item.label : undefined} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><item.icon size={18} /><span>{item.label}</span></button></div>)}</nav>
    <div className="side-bottom"><button title={collapsed ? 'Settings' : undefined} className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings size={18} /><span>Settings</span></button></div>
  </aside>
}
