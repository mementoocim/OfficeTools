import { useEffect, useState } from 'react'
import { fetchAllProfiles, updateUserRole, updateUserStatus } from '../lib/auth'
import { getSupabaseConfig, SUPABASE_INIT_SQL } from '../lib/supabase'
import type { UserProfile, UserRole, UserStatus } from '../types/auth'

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
  const [search, setSearch] = useState('')
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

  useEffect(() => {
    loadUsers()
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
      onNotify(`Updated user role to ${newRole}`)
    }
  }

  const handleStatusToggle = async (user: UserProfile) => {
    if (user.id === currentUser?.id) {
      onNotify('You cannot deactivate your own admin account.')
      return
    }
    const newStatus: UserStatus = user.status === 'active' ? 'disabled' : 'active'
    const { error: err } = await updateUserStatus(user.id, newStatus)
    if (err) {
      onNotify(`Error: ${err}`)
    } else {
      setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u))
      onNotify(`User account has been ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
    }
  }

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_INIT_SQL)
    setCopiedSql(true)
    onNotify('SQL script copied to clipboard!')
    setTimeout(() => setCopiedSql(false), 2500)
  }

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || u.role.includes(q)
  })

  const adminCount = users.filter(u => u.role === 'admin').length
  const staffCount = users.filter(u => u.role === 'staff').length

  return (
    <div className="page admin-page">
      <div className="page-title">
        <div>
          <h1>Admin Console</h1>
          <p>Manage office staff accounts, role permissions, and database connectivity.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="button secondary" onClick={loadUsers}>
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
              <h3>Supabase Database Schema & Auto-Admin Trigger</h3>
              <p>Run this script once in your Supabase SQL Editor to initialize the user profiles table and automatic admin privileges for the first registered user.</p>
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
          <input
            type="text"
            className="admin-search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name, email, or role..."
          />
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
                    <tr key={user.id} className={user.status === 'disabled' ? 'user-row-disabled' : ''}>
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
                          {user.status === 'active' ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td>
                        <small className="date-cell">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`button sm ${user.status === 'active' ? 'secondary danger-button' : 'secondary'}`}
                          disabled={isCurrent}
                          onClick={() => handleStatusToggle(user)}
                        >
                          {user.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
