import { useState } from 'react'
import type { UserProfile } from '../types/auth'
import type { Page } from '../types'

export function OnboardingModal({
  user,
  onComplete,
  onNavigate
}: {
  user: UserProfile
  onComplete: () => void
  onNavigate: (page: Page) => void
}) {
  const [step, setStep] = useState<number>(1)
  const totalSteps = 4
  const isAdmin = user.role === 'admin'
  const displayName = user.full_name || user.email.split('@')[0]

  const handleFinish = (targetPage: Page = 'home') => {
    localStorage.setItem(`office_toolkit_onboarded_${user.id}`, 'true')
    onComplete()
    if (targetPage !== 'home') {
      onNavigate(targetPage)
    }
  }

  return (
    <div className="onboarding-fullscreen-layout">
      {/* Background ambient lighting effects */}
      <div className="onboarding-bg-glow glow-1" />
      <div className="onboarding-bg-glow glow-2" />

      <div className="onboarding-card-wrapper">
        {/* Top Progress & Step Header */}
        <div className="onboarding-top-bar">
          <div className="onboarding-brand-tag">Office Toolkit</div>
          <div className="onboarding-step-indicator">
            <span>Step {step} of {totalSteps}</span>
            <div className="onboarding-pill-track">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`onboarding-step-dot ${i + 1 === step ? 'active' : i + 1 < step ? 'completed' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* STEP 1: WELCOME & PROFILE */}
        {step === 1 && (
          <div className="onboarding-step-body onboarding-anim-enter" key="step-1">
            <div className="onboarding-welcome-hero">
              <h1 className="onboarding-hero-title">Welcome, {displayName}!</h1>
              <p className="onboarding-hero-subtitle">
                Your high-speed office workspace is ready. Let's take a quick look at your tools.
              </p>
            </div>

            {/* Floating File Format Chips Animation */}
            <div className="onboarding-format-chips">
              <div className="format-chip chip-excel">
                <span className="chip-code">XLSX</span>
                <span className="chip-name">Excel Spreadsheets</span>
              </div>
              <div className="format-chip chip-word">
                <span className="chip-code">DOCX</span>
                <span className="chip-name">Word Documents</span>
              </div>
              <div className="format-chip chip-pdf">
                <span className="chip-code">PDF</span>
                <span className="chip-name">Bulk Certificates</span>
              </div>
              <div className="format-chip chip-report">
                <span className="chip-code">DOC</span>
                <span className="chip-name">Office Reports</span>
              </div>
            </div>

            {/* User Account Role Card */}
            <div className="onboarding-profile-box">
              <div className="profile-box-left">
                <strong>{user.full_name || user.email}</strong>
                <small>{user.email}</small>
              </div>
              <span className={`status-badge ${isAdmin ? 'active' : 'disabled'}`}>
                {isAdmin ? 'Administrator' : 'Staff Member'}
              </span>
            </div>
          </div>
        )}

        {/* STEP 2: SUITE OF TOOLS (Word, Excel, PDF, Certificates) */}
        {step === 2 && (
          <div className="onboarding-step-body onboarding-anim-enter" key="step-2">
            <div className="onboarding-section-head">
              <h2>Your Office Toolkit Suite</h2>
              <p>Specialized utilities crafted for repetitive office workflows.</p>
            </div>

            <div className="onboarding-suite-grid">
              {/* Tool 1: Excel */}
              <div className="onboarding-tool-card tool-card-excel">
                <div className="tool-card-top">
                  <span className="tool-badge-format excel">XLSX • CSV</span>
                  <strong>Spreadsheet Tools</strong>
                </div>
                <p>Clean text case (UPPER/Title), sum & average calculation, formula evaluation, and instant duplicate/empty cleaning.</p>
              </div>

              {/* Tool 2: Word */}
              <div className="onboarding-tool-card tool-card-word">
                <div className="tool-card-top">
                  <span className="tool-badge-format word">DOCX • Letter</span>
                  <strong>Document Generator</strong>
                </div>
                <p>Draft official letters, memos, and endorsements with live A4 page preview, printing, and direct DOCX / PDF export.</p>
              </div>

              {/* Tool 3: Certificates */}
              <div className="onboarding-tool-card tool-card-cert">
                <div className="tool-card-top">
                  <span className="tool-badge-format cert">PDF • Batch</span>
                  <strong>Bulk Certificate Generator</strong>
                </div>
                <p>Import Excel participant masterlists, map template placeholders, and generate high-res print-ready PDF certificates.</p>
              </div>

              {/* Tool 4: Reports */}
              <div className="onboarding-tool-card tool-card-report">
                <div className="tool-card-top">
                  <span className="tool-badge-format report">PDF • Sections</span>
                  <strong>Report Builder</strong>
                </div>
                <p>Structured multi-section report builder with auto-formatting, activity logs, and one-click PDF compilation.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: SMART PRODUCTIVITY & DATA SECURITY */}
        {step === 3 && (
          <div className="onboarding-step-body onboarding-anim-enter" key="step-3">
            <div className="onboarding-section-head">
              <h2>Speed & Privacy Features</h2>
              <p>Everything is optimized for fast navigation and safe offline/online work.</p>
            </div>

            <div className="onboarding-feature-rows">
              <div className="onboarding-feature-item">
                <div className="feature-key-badge badge-cmd">Ctrl + K</div>
                <div className="feature-text">
                  <strong>Universal Command Menu</strong>
                  <p>Press Ctrl + K anytime to instantly jump between tools, templates, and archives without touching the mouse.</p>
                </div>
              </div>

              <div className="onboarding-feature-item">
                <div className="feature-key-badge badge-archive">Archive</div>
                <div className="feature-text">
                  <strong>Unsaved Work Protection</strong>
                  <p>Accidentally leaving a page? Office Toolkit prompts you to snapshot your active work into Archives so nothing is lost.</p>
                </div>
              </div>

              <div className="onboarding-feature-item">
                <div className="feature-key-badge badge-local">Local</div>
                <div className="feature-text">
                  <strong>Client-Side Processing</strong>
                  <p>Spreadsheet parsing, document styling, and certificate rendering happen right inside your browser for maximum privacy.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: LAUNCH PAD */}
        {step === 4 && (
          <div className="onboarding-step-body onboarding-anim-enter" key="step-4">
            <div className="onboarding-welcome-hero">
              <h1 className="onboarding-hero-title">Ready to get started?</h1>
              <p className="onboarding-hero-subtitle">
                Choose a tool to begin, or go straight to your workspace dashboard.
              </p>
            </div>

            <div className="onboarding-launch-grid">
              <button
                type="button"
                className="onboarding-launch-btn excel-launch"
                onClick={() => handleFinish('spreadsheets')}
              >
                <span className="launch-tag">XLSX</span>
                <strong>Spreadsheet Tools</strong>
                <small>Clean, calculate & merge tables</small>
              </button>

              <button
                type="button"
                className="onboarding-launch-btn word-launch"
                onClick={() => handleFinish('documents')}
              >
                <span className="launch-tag">DOCX</span>
                <strong>Document Generator</strong>
                <small>Write letters, memos & notices</small>
              </button>

              <button
                type="button"
                className="onboarding-launch-btn cert-launch"
                onClick={() => handleFinish('certificates')}
              >
                <span className="launch-tag">PDF</span>
                <strong>Bulk Certificates</strong>
                <small>Excel list to batch certificates</small>
              </button>

              {isAdmin ? (
                <button
                  type="button"
                  className="onboarding-launch-btn admin-launch"
                  onClick={() => handleFinish('admin')}
                >
                  <span className="launch-tag">ADMIN</span>
                  <strong>Admin Console</strong>
                  <small>Manage staff & team accounts</small>
                </button>
              ) : (
                <button
                  type="button"
                  className="onboarding-launch-btn report-launch"
                  onClick={() => handleFinish('reports')}
                >
                  <span className="launch-tag">REPORT</span>
                  <strong>Report Builder</strong>
                  <small>Structured multi-section reports</small>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom Footer Actions */}
        <div className="onboarding-bottom-actions">
          {step > 1 ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => setStep(s => s - 1)}
            >
              Previous
            </button>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => handleFinish('home')}
            >
              Skip tour
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {step < totalSteps ? (
              <button
                type="button"
                className="button"
                onClick={() => setStep(s => s + 1)}
              >
                Next Step
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => handleFinish('home')}
              >
                Enter Workspace
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
