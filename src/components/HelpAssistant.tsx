import { FormEvent, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import type { Page } from '../types'
import { getSupabaseClient } from '../lib/supabase'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const welcome: ChatMessage = { role: 'assistant', content: 'Hi! I’m the Office Toolkit Help assistant. Ask me how to use a feature, find a setting, or work with documents, spreadsheets, reports, and certificates.' }

function offlineAnswer(question: string, page: Page) {
  const normalized = question.toLowerCase()
  if (normalized.includes('archive')) return 'Archives are for saving and restoring your work locally. Open Archives from the sidebar, then select Restore on the item you need.'
  if (normalized.includes('template')) return 'Open the relevant workspace, then select Templates. In Documents, you can choose a built-in office template or load one that you previously saved locally.'
  if (normalized.includes('document') || page === 'documents') return 'In Document Generator, click directly on the white paper to edit. Use Page setup for paper size and margins; use the toolbar for font, size, paragraph style, and alignment.'
  if (normalized.includes('spreadsheet') || normalized.includes('excel') || normalized.includes('csv')) return 'Open Spreadsheet Tools, choose Browse files, and import an Excel or CSV file. The tools above the table let you clean, filter, format, and export it locally.'
  if (normalized.includes('certificate')) return 'Open Bulk Certificate Generator, import your participant spreadsheet, choose the certificate design, then generate the outputs.'
  if (normalized.includes('admin') || normalized.includes('approve') || normalized.includes('pending')) return 'Admins can open Admin Console, select the Pending filter beside search, then activate an account after reviewing it.'
  if (normalized.includes('theme') || normalized.includes('dark') || normalized.includes('light')) return 'Open Settings and choose your preferred theme and accent color. The sidebar follows the active theme too.'
  return 'Gemini is not connected yet, but I can still help with common Office Toolkit tasks. Ask about Documents, Spreadsheets, Reports, Certificates, Templates, Archives, Settings, or Admin Console.'
}

export function HelpAssistant({ page }: { page: Page }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([welcome])
  const [loading, setLoading] = useState(false)
  const [usingOfflineHelp, setUsingOfflineHelp] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || loading) return
    const nextMessages = [...messages, { role: 'user' as const, content: prompt }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    try {
      const { data: sessionData } = await getSupabaseClient()?.auth.getSession() || { data: { session: null } }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessionData.session?.access_token) headers.Authorization = `Bearer ${sessionData.session.access_token}`
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: nextMessages, page })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The assistant is unavailable.')
      if (!data.configured) {
        setUsingOfflineHelp(true)
        setMessages(current => [...current, { role: 'assistant', content: offlineAnswer(prompt, page) }])
      } else {
        setUsingOfflineHelp(false)
        setMessages(current => [...current, { role: 'assistant', content: data.reply || 'I could not prepare an answer. Please try again.' }])
      }
    } catch {
      setUsingOfflineHelp(true)
      setMessages(current => [...current, { role: 'assistant', content: offlineAnswer(prompt, page) }])
    } finally {
      setLoading(false)
    }
  }

  return <aside className={`help-assistant ${open ? 'open' : ''}`} aria-label="Office Toolkit Help">
    {open && <section className="help-panel">
      <header>
        <div><strong>Office Toolkit Help</strong><small>{usingOfflineHelp ? 'Offline help' : 'Gemini 3.6 Flash'}</small></div>
        <button className="icon-button" type="button" title="Close help" aria-label="Close help" onClick={() => setOpen(false)}><X size={17} /></button>
      </header>
      <div className="help-messages" ref={scrollRef} aria-live="polite">
        {messages.map((message, index) => <p key={`${message.role}-${index}`} className={message.role}>{message.content}</p>)}
        {loading && <p className="assistant help-typing">Thinking…</p>}
      </div>
      <form onSubmit={send} className="help-composer">
        <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about Office Toolkit" aria-label="Ask the help assistant" maxLength={1600} />
        <button className="icon-button" type="submit" title="Send" aria-label="Send" disabled={!input.trim() || loading}><Send size={16} /></button>
      </form>
    </section>}
    <button className="help-launcher" type="button" title="Open Office Toolkit Help" aria-label="Open Office Toolkit Help" onClick={() => setOpen(current => !current)}><MessageCircle size={21} /></button>
  </aside>
}
