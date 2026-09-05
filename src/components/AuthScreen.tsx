import { useState } from 'react'
import { getSupabaseConfig, saveSupabaseConfig, getSupabaseClient } from '../lib/supabase'
import { loginWithEmail, loginWithGoogle, registerWithEmail, sendPasswordReset } from '../lib/auth'
import type { UserProfile } from '../types/auth'

type AuthTab = 'login' | 'register' | 'forgot' | 'setup'

export function AuthScreen({
  onSuccess
}: {
  onSuccess: (profile: UserProfile) => void
}) {
  const [tab, setTab] = useState<AuthTab>('login')
  const config = getSupabaseConfig()

  // Form Fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')

  // Supabase Setup Fields
  const [supabaseUrl, setSupabaseUrl] = useState(config.url)
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(config.anonKey)

  // State
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleGoogleAuth = async () => {
    setError('')
    setMessage('')
    setGoogleLoading(true)
    const { error: err } = await loginWithGoogle()
    setGoogleLoading(false)
    if (err) {
      setError(err)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)
    const { profile, error: err } = await loginWithEmail(email, password)
    setLoading(false)

    if (err) {
      setError(err)
      return
    }

    if (profile) {
      onSuccess(profile)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!email || !password || !fullName) {
      setError('Please fill in all required fields.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { profile, error: err } = await registerWithEmail(email, password, fullName)
    setLoading(false)

    if (err) {
      setError(err)
      return
    }

    if (profile) {
      setMessage('Account created successfully! Signing you in...')
      setTimeout(() => {
        onSuccess(profile)
      }, 700)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!email) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    const { error: err } = await sendPasswordReset(email)
    setLoading(false)

    if (err) {
      setError(err)
    } else {
      setMessage('Password reset link has been sent to your email.')
    }
  }

  const handleSaveSetup = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Please enter both Supabase URL and Anon Key.')
      return
    }
    if (!supabaseUrl.startsWith('http')) {
      setError('Supabase URL must start with https://')
      return
    }

    saveSupabaseConfig(supabaseUrl, supabaseAnonKey)
    const client = getSupabaseClient()
    if (client) {
      setMessage('Database configuration saved successfully!')
      setTimeout(() => {
        setTab('login')
        setMessage('')
      }, 600)
    } else {
      setError('Could not connect to Supabase with provided credentials.')
    }
  }

  return (
    <div className="auth-screen-layout">
      <div className="auth-screen-card">
        <div className="auth-brand-header">
          <span className="auth-brand-badge">Office Toolkit</span>
          <h1>Staff Access & Authentication</h1>
          <p>Please sign in or register to access the productivity workspace.</p>
        </div>

        {/* Tab Switcher */}
        {tab !== 'setup' && (
          <div className="segmented auth-tabs" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={tab === 'login' ? 'selected' : ''}
              onClick={() => { setTab('login'); setError(''); setMessage('') }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={tab === 'register' ? 'selected' : ''}
              onClick={() => { setTab('register'); setError(''); setMessage('') }}
            >
              Register
            </button>
          </div>
        )}

        {error && <div className="modal-error-text">{error}</div>}
        {message && <div className="modal-success-text">{message}</div>}

        {/* 1. SIGN IN */}
        {tab === 'login' && (
          <div className="auth-form-wrap">
            <button
              type="button"
              className="button secondary auth-google-btn"
              disabled={googleLoading || loading}
              onClick={handleGoogleAuth}
            >
              {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
            </button>

            <div className="auth-divider">
              <span>or sign in with email</span>
            </div>

            <form onSubmit={handleLogin} className="auth-form">
              <label className="submodal-field">
                <span>Email Address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoFocus
                />
              </label>

              <label className="submodal-field">
                <span>Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </label>

              <div className="auth-extra-row">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => { setTab('forgot'); setError(''); setMessage('') }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => { setTab('setup'); setError(''); setMessage('') }}
                >
                  Database connection
                </button>
              </div>

              <button
                type="submit"
                className="button"
                disabled={loading || googleLoading}
                style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        )}

        {/* 2. REGISTER */}
        {tab === 'register' && (
          <div className="auth-form-wrap">
            <button
              type="button"
              className="button secondary auth-google-btn"
              disabled={googleLoading || loading}
              onClick={handleGoogleAuth}
            >
              {googleLoading ? 'Connecting to Google...' : 'Register with Google'}
            </button>

            <div className="auth-divider">
              <span>or register with email</span>
            </div>

            <form onSubmit={handleRegister} className="auth-form">
              <label className="submodal-field">
                <span>Full Name</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  autoFocus
                />
              </label>

              <label className="submodal-field">
                <span>Email Address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </label>

              <label className="submodal-field">
                <span>Password (Min. 6 characters)</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Create password"
                />
              </label>

              <label className="submodal-field">
                <span>Confirm Password</span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                />
              </label>

              <button
                type="submit"
                className="button"
                disabled={loading || googleLoading}
                style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        {/* 3. FORGOT PASSWORD */}
        {tab === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-form">
            <p className="auth-hint">
              Enter your registered email address and we will send you a password reset link.
            </p>

            <label className="submodal-field">
              <span>Email Address</span>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoFocus
              />
            </label>

            <div className="submodal-actions auth-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => { setTab('login'); setError(''); setMessage('') }}
              >
                Back to Sign In
              </button>
              <button type="submit" className="button" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        )}

        {/* 4. DATABASE SETUP */}
        {tab === 'setup' && (
          <form onSubmit={handleSaveSetup} className="auth-form">
            <p className="auth-hint">
              Connect your Supabase project credentials to enable cloud accounts across team devices.
            </p>

            <label className="submodal-field">
              <span>Supabase Project URL</span>
              <input
                type="url"
                required
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
              />
            </label>

            <label className="submodal-field">
              <span>Supabase Anon Public Key</span>
              <textarea
                rows={3}
                required
                value={supabaseAnonKey}
                onChange={e => setSupabaseAnonKey(e.target.value)}
                placeholder="sb_publishable_... or eyJhbGciOi..."
              />
            </label>

            <div className="submodal-actions auth-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => { setTab('login'); setError(''); setMessage('') }}
              >
                Cancel
              </button>
              <button type="submit" className="button">
                Save Connection
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer-notice">
          <span>Local client-side execution • End-to-end cloud session encryption</span>
        </div>
      </div>
    </div>
  )
}
