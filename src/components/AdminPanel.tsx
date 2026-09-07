import { useEffect, useState } from 'react'
import { fetchAllProfiles, fetchAuditEvents, updateUserRole, updateUserStatus } from '../lib/auth'
import { getSupabaseConfig, SUPABASE_INIT_SQL } from '../lib/supabase'
import type { AuditAction, AuditEvent, UserProfile, UserRole, UserStatus } from '../types/auth'

const auditLabels: Record<AuditAction, string> = {
  account_registered: 'Registered an account',
  user_approved: 'Approved account',
  user_reactivated: 'Re-approved account',
  user_deactivated: 'Deactivated account',
  role_updated: 'Changed role for'
}

export function AdminPanel({
  currentUser,
  onNotify
}: {
  currentUser: UserProfile | null
  onNotify: (msg: string) => void
}) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all')
  const [showSqlGuide, setShowSqlGuide] = useState(false)
  const [copiedSql, setCopiedSql] = useState(false)

  const config = getSupabaseConfig()

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    const { profiles, error: err } = await fetchAllProfiles()
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      setUsers(profiles)
    }
  }

  const loadAuditTrail = async () => {
    setAuditLoading(true)
    const { events, error: err } = await fetchAuditEvents()
    setAuditLoading(false)
    setAuditError(err || '')
    setAuditEvents(events)
  }

  const refreshAdminData = () => {
    loadUsers()
    loadAuditTrail()
  }

  useEffect(() => {
    refreshAdminData()
  }, [])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (userId === currentUser?.id && newRole !== 'admin') {
      if (!confirm('Warning: Demoting your own account will remove your access to the Admin Console. Proceed?')) {
        return
      }
    }
    const { error: err } = await updateUserRole(userId, newRole)
    if (err) {
      onNotify(`Error: ${err}`)
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
      loadAuditTrail()
      onNotify(`Updated user role to ${newRole}`)
    }
  }

  const handleStatusChange = async (user: UserProfile, newStatus: UserStatus) => {
    if (user.id === currentUser?.id) {
      onNotify('You cannot deactivate your own admin account.')
      return
    }
    const { error: err } = await updateUserStatus(user.id, newStatus)
    if (err) {
      onNotify(`Error: ${err}`)
    } else {
      setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u))
      loadAuditTrail()
      onNotify(`User account has been ${newStatus === 'active' ? 'approved' : 'rejected'}`)
    }
  }

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_INIT_SQL)
    setCopiedSql(true)
    onNotify('SQL script copied to clipboard!')
    setTimeout(() => setCopiedSql(false), 2500)
  }

  const filteredUsers = users.filter(u => {
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter
    if (!search) return matchesStatus
    const q = search.toLowerCase()
    return matchesStatus && ((u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || u.role.includes(q))
  })

  const adminCount = users.filter(u => u.role === 'admin').length
  const staffCount = users.filter(u => u.role === 'staff').length
  const pendingCount = users.filter(u => u.status === 'pending').length

  return (
    <div className="page admin-page">
      <div className="page-title">
        <div>
          <h1>Admin Console</h1>
          <p>Approve new staff accounts, manage permissions, and control workspace access.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="button secondary" onClick={refreshAdminData}>
            Refresh List
          </button>
          <button type="button" className="button" onClick={() => setShowSqlGuide(!showSqlGuide)}>
            {showSqlGuide ? 'Hide SQL Script' : 'Database Setup Script'}
          </button>
        </div>
      </div>

      {/* Database Setup Guide */}
      {showSqlGuide && (
        <div className="admin-sql-guide">
          <div className="sql-guide-header">
            <div>
              <h3>Supabase Database Schema & Approval Flow</h3>
              <p>Run this script in your Supabase SQL Editor. The first account remains the administrator; later registrations are created as pending until you approve them here. It also creates a lightweight audit trail for registrations and access changes.</p>
            </div>
            <button type="button" className="button sm" onClick={handleCopySql}>
              {copiedSql ? 'Copied!' : 'Copy SQL Script'}
            </button>
          </div>
          <pre className="sql-code-block">{SUPABASE_INIT_SQL}</pre>
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <span className="admin-stat-label">Total Users</span>
          <strong className="admin-stat-val">{users.length}</strong>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Admin Accounts</span>
          <strong className="admin-stat-val">{adminCount}</strong>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Staff Members</span>
          <strong className="admin-stat-val">{staffCount}</strong>
        </div>
        <div className="admin-stat-card pending-stat">
          <span className="admin-stat-label">Awaiting Approval</span>
          <strong className="admin-stat-val">{pendingCount}</strong>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Database Connection</span>
          <strong className="admin-stat-val" style={{ color: config.isConfigured ? '#245b4b' : '#a1413a' }}>
            {config.isConfigured ? 'Supabase Connected' : 'Not Connected'}
          </strong>
        </div>
      </div>

      {/* User Management Section */}
      <div className="admin-users-card">
        <div className="admin-users-header">
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <h2>User Accounts & Permissions</h2>
          </div>
          <div className="admin-filter-controls">
            <div className="segmented admin-status-filter" aria-label="Filter users by account status">
              {([
                ['all', `All (${users.length})`],
                ['pending', `Pending (${pendingCount})`],
                ['active', `Active (${users.filter(u => u.status === 'active').length})`],
                ['disabled', `Deactivated (${users.filter(u => u.status === 'disabled').length})`]
              ] as const).map(([status, label]) => <button type="button" key={status} className={statusFilter === status ? 'selected' : ''} onClick={() => setStatusFilter(status)}>{label}</button>)}
            </div>
            <input
              type="text"
              className="admin-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by name, email, or role..."
            />
          </div>
        </div>

        {error && (
          <div className="modal-error-text" style={{ margin: '14px 16px' }}>
            {error} (If the <code>profiles</code> table is not yet created, click "Database Setup Script" above to run the SQL query in Supabase).
          </div>
        )}

        {loading ? (
          <div className="admin-empty-state">
            <p>Loading user list from Supabase...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="admin-empty-state">
            <p>{search ? 'No users matching your search.' : 'No registered users found in the database.'}</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const isCurrent = user.id === currentUser?.id
                  return (
                    <tr key={user.id} className={user.status === 'disabled' ? 'user-row-disabled' : user.status === 'pending' ? 'user-row-pending' : ''}>
                      <td>
                        <div className="user-name-cell">
                          <strong>{user.full_name || 'Staff Member'} {isCurrent && <span className="current-user-tag">You</span>}</strong>
                          <small>{user.email}</small>
                        </div>
                      </td>
                      <td>
                        <select
                          className="admin-role-select"
                          value={user.role}
                          onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
                        >
                          <option value="admin">Administrator</option>
                          <option value="staff">Staff Member</option>
                          <option value="viewer">Viewer (Read-only)</option>
                        </select>
                      </td>
                      <td>
                        <span className={`status-badge ${user.status}`}>
                          {user.status === 'active' ? 'Active' : user.status === 'pending' ? 'Awaiting approval' : 'Deactivated'}
                        </span>
                      </td>
                      <td>
                        <small className="date-cell">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </small>
                      </td>
                      <td>
                        <div className="admin-user-actions">
                          {user.status === 'pending' ? <>
                            <button type="button" className="button sm" disabled={isCurrent} onClick={() => handleStatusChange(user, 'active')}>Approve</button>
                            <button type="button" className="button sm secondary danger-button" disabled={isCurrent} onClick={() => handleStatusChange(user, 'disabled')}>Reject</button>
                          </> : <button
                            type="button"
                            className={`button sm ${user.status === 'active' ? 'secondary danger-button' : 'secondary'}`}
                            disabled={isCurrent}
                            onClick={() => handleStatusChange(user, user.status === 'active' ? 'disabled' : 'active')}
                          >
                            {user.status === 'active' ? 'Deactivate' : 'Re-approve'}
                          </button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="admin-audit-card" aria-labelledby="audit-trail-title">
        <div className="admin-audit-header">
          <div>
            <h2 id="audit-trail-title">Audit trail</h2>
            <p>Last 50 account and access events. Documents, files, and chat content are never logged.</p>
          </div>
          <button type="button" className="button sm secondary" onClick={loadAuditTrail}>Refresh audit trail</button>
        </div>

        {auditError ? (
          <p className="admin-audit-note">Audit trail is unavailable. Run the updated Database Setup Script above to create it.</p>
        ) : auditLoading ? (
          <p className="admin-audit-note">Loading audit trail…</p>
        ) : auditEvents.length === 0 ? (
          <p className="admin-audit-note">No events yet. New registrations and administrator access changes will appear here.</p>
        ) : (
          <div className="admin-audit-list">
            {auditEvents.map(event => (
              <article key={event.id}>
                <div>
                  <strong>{auditLabels[event.action]} <span>{event.target_email || 'account'}</span></strong>
                  <small>by {event.actor_email || 'System'}</small>
                </div>
                <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
