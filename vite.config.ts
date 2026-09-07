import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error This shared server module is also used by the Vercel function.
import { createHelpReply } from './server/help-chat-core.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      {
        name: 'office-toolkit-help-api',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (request, response) => {
            if (request.method !== 'POST') {
              response.statusCode = 405
              response.setHeader('Allow', 'POST')
              response.end(JSON.stringify({ error: 'Method not allowed.' }))
              return
            }
            let raw = ''
            for await (const chunk of request) raw += chunk
            try {
              const result = await createHelpReply(JSON.parse(raw || '{}'), env.GEMINI_API_KEY)
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify(result))
            } catch (error) {
              response.statusCode = 502
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'The assistant is temporarily unavailable.' }))
            }
          })
        }
      }
    ]
  }
})
