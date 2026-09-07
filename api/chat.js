import { createHelpReply } from '../server/help-chat-core.js'

async function hasValidUser(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!token || !supabaseUrl || !supabaseKey) return false
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` }
  })
  return userResponse.ok
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    if (!await hasValidUser(request)) return response.status(401).json({ error: 'Sign in is required to use the help assistant.' })
    const result = await createHelpReply(request.body || {}, process.env.GEMINI_API_KEY)
    return response.status(200).json(result)
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'The assistant is temporarily unavailable.' })
  }
}
