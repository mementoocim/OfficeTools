import { getSupabaseClient } from './supabase'
import type { AuditEvent, UserProfile, UserRole, UserStatus } from '../types/auth'

/**
 * Signs in a user with email and password.
 */
export async function loginWithEmail(email: string, password: string): Promise<{ profile: UserProfile | null; error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { profile: null, error: 'Supabase is not connected yet. Please configure your Supabase URL & Anon Key.' }
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })

    if (error) {
      return { profile: null, error: error.message }
    }

    if (!data.user) {
      return { profile: null, error: 'User not found.' }
    }

    // Fetch user profile from database
    const profile = await fetchUserProfile(data.user.id, data.user.email || email)
    if (profile.status !== 'active') {
      await supabase.auth.signOut()
      return {
        profile: null,
        error: profile.status === 'pending'
          ? 'Your registration is awaiting administrator approval.'
          : 'Your account has been deactivated. Please contact an administrator.'
      }
    }

    return { profile, error: null }
  } catch (err) {
    return { profile: null, error: err instanceof Error ? err.message : 'Login failed.' }
  }
}

/**
 * Signs in a user with Google OAuth via Supabase.
 */
export async function loginWithGoogle(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { error: 'Supabase is not connected yet.' }
  }

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    return { error: error ? error.message : null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Google login failed.' }
  }
}

/**
 * Registers a new account.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<{ profile: UserProfile | null; error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { profile: null, error: 'Supabase is not connected. Please setup your Supabase project keys.' }
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim()
        }
      }
    })

    if (error) {
      return { profile: null, error: error.message }
    }

    if (!data.user) {
      return { profile: null, error: 'Signup succeeded but user was not created.' }
    }

    // The signup trigger creates a pending profile for new staff accounts.
    const profile = await fetchUserProfile(data.user.id, data.user.email || email, fullName)
    if (profile.status !== 'active') await supabase.auth.signOut()
    return { profile, error: null }
  } catch (err) {
    return { profile: null, error: err instanceof Error ? err.message : 'Registration failed.' }
  }
}

/**
 * Signs out the current user.
 */
export async function logoutUser(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: null }

  try {
    const { error } = await supabase.auth.signOut()
    return { error: error ? error.message : null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Logout failed.' }
  }
}

/**
 * Sends a password reset email.
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { error: 'Supabase is not connected.' }
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin
    })
    return { error: error ? error.message : null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send reset email.' }
  }
}

/**
 * Fetches the profile created by the secure database signup trigger.
 */
export async function fetchUserProfile(
  userId: string,
  email: string,
  fallbackName?: string
): Promise<UserProfile> {
  const supabase = getSupabaseClient()
  const defaultProfile: UserProfile = {
    id: userId,
    email,
    full_name: fallbackName || email.split('@')[0],
    role: 'staff',
    status: 'pending',
    created_at: new Date().toISOString()
  }

  if (!supabase) return defaultProfile

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      return data as UserProfile
    }

    // Never create a profile from the client: it would bypass admin approval.
    return defaultProfile
  } catch (err) {
    console.warn('Could not fetch profile from table (table may not be created yet):', err)
    return defaultProfile
  }
}

/**
 * Fetches all registered user profiles (For Admin view).
 */
export async function fetchAllProfiles(): Promise<{ profiles: UserProfile[]; error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { profiles: [], error: 'Supabase client not initialized.' }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return { profiles: [], error: error.message }
    }

    return { profiles: (data as UserProfile[]) || [], error: null }
  } catch (err) {
    return { profiles: [], error: err instanceof Error ? err.message : 'Failed to fetch user list.' }
  }
}

/**
 * Fetches a small, admin-only audit window. Audit rows never include document or file contents.
 */
export async function fetchAuditEvents(limit = 50): Promise<{ events: AuditEvent[]; error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { events: [], error: 'Supabase client not initialized.' }

  try {
    const { data, error } = await supabase
      .from('audit_events')
      .select('id, actor_id, actor_email, action, target_id, target_email, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    return { events: error ? [] : (data as AuditEvent[]) || [], error: error ? error.message : null }
  } catch (err) {
    return { events: [], error: err instanceof Error ? err.message : 'Failed to load audit trail.' }
  }
}

/**
 * Updates a user's role (Admin action).
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: 'Supabase client not initialized.' }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)

    return { error: error ? error.message : null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update role.' }
  }
}

/**
 * Updates a user's status (Active/Disabled) (Admin action).
 */
export async function updateUserStatus(userId: string, status: UserStatus): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { error: 'Supabase client not initialized.' }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', userId)

    return { error: error ? error.message : null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update user status.' }
  }
}
