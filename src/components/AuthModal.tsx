import { useState } from 'react'
import { X } from 'lucide-react'
import { loginWithEmail, loginWithGoogle, registerWithEmail, sendPasswordReset } from '../lib/auth'
import { GoogleWord } from './Common'
import type { UserProfile } from '../types/auth'

type AuthTab = 'login' | 'register' | 'forgot'

export function AuthModal({
  isOpen,
  initialTab = 'login',
  onSuccess,
  onClose
}: {
  isOpen: boolean
  initialTab?: AuthTab
  onSuccess: (profile: UserProfile) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<AuthTab>(initialTab || 'login')

  // Form Fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')

  // State
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  if (!isOpen) return null

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
      onClose()
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
        onClose()
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
      setMessage('Password reset instructions sent to your email.')
    }
  }

  return (
    <div className="modal-backdrop centered-backdrop" onMouseDown={onClose}>
      <div
        className="modal auth-modal"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="auth-modal-title"
      >
        <header>
          <h2 id="auth-modal-title">
            {tab === 'login' && 'Staff Sign In'}
            {tab === 'register' && 'Register Staff Account'}
            {tab === 'forgot' && 'Reset Password'}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="modal-content">
          {/* Segmented Switcher for Login / Register */}
          {tab !== 'forgot' && (
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

          {/* TAB 1: LOGIN */}
          {tab === 'login' && (
            <div className="auth-form-wrap">
              <button
                type="button"
                className="button secondary auth-google-btn"
                disabled={googleLoading || loading}
                onClick={handleGoogleAuth}
              >
                {googleLoading ? 'Connecting to Google...' : <>Continue with <GoogleWord /></>}
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
                </div>

                <div className="submodal-actions auth-actions">
                  <button type="submit" className="button" disabled={loading || googleLoading} style={{ width: '100%', justifyContent: 'center' }}>
                    {loading ? 'Signing in...' : 'Sign In with Email'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: REGISTER */}
          {tab === 'register' && (
            <div className="auth-form-wrap">
              <button
                type="button"
                className="button secondary auth-google-btn"
                disabled={googleLoading || loading}
                onClick={handleGoogleAuth}
              >
                {googleLoading ? 'Connecting to Google...' : <>Register with <GoogleWord /></>}
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

                <div className="submodal-actions auth-actions">
                  <button type="submit" className="button" disabled={loading || googleLoading} style={{ width: '100%', justifyContent: 'center' }}>
                    {loading ? 'Creating Account...' : 'Create Account with Email'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: FORGOT PASSWORD */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} className="auth-form">
              <p className="auth-hint">
                Enter your registered email address and we'll send you instructions to reset your password.
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
        </div>
      </div>
    </div>
  )
}
