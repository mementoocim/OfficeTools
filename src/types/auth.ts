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
