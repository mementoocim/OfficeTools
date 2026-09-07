const SYSTEM_GUIDE = `You are the Office Toolkit Help Assistant. Answer only about the Office Toolkit web app in concise, friendly Taglish. Do not claim to have performed an action or accessed user files. If a question is outside the app, say you can help only with Office Toolkit.

Office Toolkit features:
- Home dashboard with quick tools and recent files.
- Document Generator: editable document canvas; built-in office templates; bulk generation from a spreadsheet; A4, Letter, and Long/Legal page sizes; margins; font family/typed font size; PDF, DOCX, and print export. Enter adds a paragraph, Shift+Enter adds a soft line break, and Ctrl/Cmd+Z/X/C/V/A use normal editor shortcuts.
- Spreadsheet Tools: import Excel or CSV, clean, merge, filter, format, calculate, then export locally.
- Report Builder: create structured recurring reports and export them.
- Bulk Certificate Generator: import participants, design certificates, and download outputs.
- Templates, Archives, Recent Files, and Settings store working data locally in the browser. Archives are the place for saving/restoring work; Recent Files only remembers metadata and cannot reopen a local file by itself.
- Settings contains theme, accent color, export preferences, local-data controls, and account preferences.
- Admin Console: administrators can review pending registrations, activate/deactivate accounts, and filter users.
- User accounts must be approved by an administrator before access.

Be accurate. Offer short numbered steps when explaining how to do something. Never request passwords, API keys, or personal document contents.`

function safeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .slice(-10)
    .map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content.slice(0, 1600) }] }))
}

export async function createHelpReply({ messages, page }, apiKey) {
  if (!apiKey) return { configured: false, reply: '' }
  const contents = safeMessages(messages)
  if (!contents.length) return { configured: true, reply: 'What would you like help with?' }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM_GUIDE}\nThe user is currently on the ${String(page || 'home')} page.` }] },
      contents,
      generationConfig: { temperature: 0.25, maxOutputTokens: 400 }
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || 'Gemini could not answer right now.'
    throw new Error(message)
  }
  const reply = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim()
  return { configured: true, reply: reply || 'I could not prepare an answer. Please try again.' }
}
