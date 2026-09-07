export type UserRole = 'admin' | 'staff' | 'viewer'
export type UserStatus = 'pending' | 'active' | 'disabled'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  status: UserStatus
  created_at: string
  last_sign_in_at?: string
}

export type AuditAction = 'account_registered' | 'user_approved' | 'user_reactivated' | 'user_deactivated' | 'role_updated'

export interface AuditEvent {
  id: number
  actor_id: string | null
  actor_email: string
  action: AuditAction
  target_id: string | null
  target_email: string
  created_at: string
}

export interface SupabaseConfig {
  url: string
  anonKey: string
  isConfigured: boolean
}

export interface AuthState {
  user: UserProfile | null
  session: any | null
  loading: boolean
  isConfigured: boolean
}
