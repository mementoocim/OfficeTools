import { Archive, BookOpenText, ChevronLeft, FileSpreadsheet, Files, FileText, Home, LayoutTemplate, Medal, Settings, ShieldCheck, TableProperties } from 'lucide-react'
import type { Page } from '../types'
import type { UserProfile } from '../types/auth'

const items: { id: Page; label: string; icon: typeof Home; group?: string }[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'WORKSPACE' },
  { id: 'documents', label: 'Documents', icon: FileText, group: 'TOOLS' },
  { id: 'spreadsheets', label: 'Spreadsheets', icon: FileSpreadsheet },
  { id: 'reports', label: 'Reports', icon: BookOpenText },
  { id: 'certificates', label: 'Certificates', icon: Medal },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, group: 'LIBRARY' },
  { id: 'archives', label: 'Archives', icon: Archive },
  { id: 'recent', label: 'Recent Files', icon: Files },
]

export function AppSidebar({
  page,
  setPage,
  collapsed,
  toggle,
  currentUser,
  onOpenAuth,
  onSignOut
}: {
  page: Page
  setPage: (p: Page) => void
  collapsed: boolean
  toggle: () => void
  currentUser: UserProfile | null
  onOpenAuth: () => void
  onSignOut: () => void
}) {
  const isAdmin = currentUser?.role === 'admin'

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark"><TableProperties size={19} /></span>
        {!collapsed && <span className="brand-copy"><strong>Office Toolkit</strong><small>Productivity workspace</small></span>}
        <button title="Collapse sidebar" className="icon-button collapse" onClick={toggle}>
          <ChevronLeft size={17} />
        </button>
      </div>

      <nav>
        {items.map((item) => (
          <div key={item.id}>
            {item.group && <div className="nav-label">{item.group}</div>}
            <button
              title={collapsed ? item.label : undefined}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          </div>
        ))}

        {isAdmin && (
          <div>
            <div className="nav-label">MANAGEMENT</div>
            <button
              title={collapsed ? 'Admin Console' : undefined}
              className={`nav-item ${page === 'admin' ? 'active' : ''}`}
              onClick={() => setPage('admin')}
            >
              <ShieldCheck size={18} />
              <span>Admin Console</span>
            </button>
          </div>
        )}
      </nav>

      <div className="side-bottom">
        {!collapsed && <div className="nav-label footer-label">ACCOUNT</div>}
        <button
          title={collapsed ? 'Settings' : undefined}
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>

        {!collapsed ? (
          <div className="sidebar-user-card">
            {currentUser ? (
              <div className="sidebar-user-content">
                <div className="sidebar-user-avatar">
                  {(currentUser.full_name || currentUser.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="sidebar-user-info">
                  <strong className="sidebar-user-name" title={currentUser.full_name || currentUser.email}>
                    {currentUser.full_name || currentUser.email.split('@')[0]}
                  </strong>
                  <span className="sidebar-user-role-badge">
                    {currentUser.role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                </div>
                <button
                  type="button"
                  className="sidebar-signout-btn"
                  title="Sign out"
                  onClick={onSignOut}
                >
                  Exit
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="sidebar-login-btn"
                onClick={onOpenAuth}
              >
                Sign In / Staff Access
              </button>
            )}
          </div>
        ) : (
          <div className="sidebar-collapsed-user">
            {currentUser ? (
              <button
                type="button"
                className="sidebar-collapsed-avatar-btn"
                title={`${currentUser.full_name || currentUser.email} (${currentUser.role}). Click to sign out.`}
                onClick={onSignOut}
              >
                {(currentUser.full_name || currentUser.email || 'U').charAt(0).toUpperCase()}
              </button>
            ) : (
              <button
                type="button"
                className="sidebar-collapsed-login-btn"
                title="Sign In"
                onClick={onOpenAuth}
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
