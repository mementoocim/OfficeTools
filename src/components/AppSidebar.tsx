import { Archive, BookOpenText, CaretLeft, ChartBar, ClockCounterClockwise, FileText, GearSix, House, Medal, ShieldCheck, SquaresFour, Table } from '@phosphor-icons/react'
import type { Page } from '../types'
import type { UserProfile } from '../types/auth'

const items = [
  { id: 'home' as Page, label: 'Home', icon: House, group: 'WORKSPACE' },
  { id: 'documents', label: 'Documents', icon: FileText, group: 'TOOLS' },
  { id: 'spreadsheets', label: 'Spreadsheets', icon: Table },
  { id: 'reports', label: 'Reports', icon: ChartBar },
  { id: 'certificates', label: 'Certificates', icon: Medal },
  { id: 'templates', label: 'Templates', icon: SquaresFour, group: 'LIBRARY' },
  { id: 'archives', label: 'Archives', icon: Archive },
  { id: 'recent', label: 'Recent Files', icon: ClockCounterClockwise },
]

const navigationGroups = [
  { label: 'WORKSPACE', items: items.slice(0, 1) },
  { label: 'TOOLS', items: items.slice(1, 5) },
  { label: 'LIBRARY', items: items.slice(5) }
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
      <header className="sidebar-header">
        <span className="brand-mark"><img src="/brand/office-toolkit-mark.png" alt="" /></span>
        {!collapsed && <span className="brand-copy"><strong>Office Toolkit</strong><small>Workspace</small></span>}
        <button title="Collapse sidebar" className="icon-button collapse" onClick={toggle}>
          <CaretLeft size={17} weight="bold" />
        </button>
      </header>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigationGroups.map(group => <section className="nav-section" key={group.label}>
          {!collapsed && <div className="nav-label">{group.label}</div>}
          {group.items.map(item => <button
            key={item.id}
            title={collapsed ? item.label : undefined}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id as Page)}
          >
            <item.icon size={19} weight={page === item.id ? 'fill' : 'duotone'} />
            <span>{item.label}</span>
          </button>)}
        </section>)}

        {isAdmin && (
          <section className="nav-section nav-section-admin">
            {!collapsed && <div className="nav-label">MANAGEMENT</div>}
            <button
              title={collapsed ? 'Admin Console' : undefined}
              className={`nav-item ${page === 'admin' ? 'active' : ''}`}
              onClick={() => setPage('admin')}
            >
              <ShieldCheck size={19} weight={page === 'admin' ? 'fill' : 'duotone'} />
              <span>Admin Console</span>
            </button>
          </section>
        )}
      </nav>

      <footer className="side-bottom sidebar-footer">
        {!collapsed && <div className="nav-label footer-label">ACCOUNT</div>}
        <button
          title={collapsed ? 'Settings' : undefined}
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          <GearSix size={19} weight={page === 'settings' ? 'fill' : 'duotone'} />
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
      </footer>
    </aside>
  )
}
