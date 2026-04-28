import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Ensure `.env*` values are available to dev-server middleware via `process.env`.
  // Vite loads env for client usage, but plugins/middleware should explicitly load them.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (typeof process.env[k] === 'undefined') process.env[k] = v
  }

  return {
  plugins: [
    react(),
    {
      name: 'local-openai-proxy',
      configureServer(server) {
        server.middlewares.use('/api/chat', async (req, res) => {
          try {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Method not allowed' } }))
              return
            }

            const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
            if (!apiKey || apiKey === 'your_openai_api_key_here') {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'OpenAI API key not configured on dev server. Set OPENAI_API_KEY (preferred) or VITE_OPENAI_API_KEY in .env.local, then restart Vite.' } }))
              return
            }

            const chunks = []
            await new Promise((resolve, reject) => {
              req.on('data', (c) => chunks.push(c))
              req.on('end', resolve)
              req.on('error', reject)
            })
            const raw = Buffer.concat(chunks).toString('utf-8')
            const body = raw ? JSON.parse(raw) : {}

            const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
            })

            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
            res.end(text)
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: { message: String(e?.message || e) } }))
          }
        })

        // Chatbot orchestrator endpoint (dev-only).
        // NOTE: This codebase has no auth/session/router/ORM yet; the client must pass tenantId/userId.
        server.middlewares.use('/api/chatbot/chat', async (req, res) => {
          try {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Method not allowed' } }))
              return
            }

            const chunks = []
            await new Promise((resolve, reject) => {
              req.on('data', (c) => chunks.push(c))
              req.on('end', resolve)
              req.on('error', reject)
            })
            const raw = Buffer.concat(chunks).toString('utf-8')
            const body = raw ? JSON.parse(raw) : {}

            const tenantId = String(body?.tenantId || '')
            const userId = String(body?.userId || '')
            const conversationId = body?.conversationId ? String(body.conversationId) : null
            const userMessage = String(body?.userMessage || '')
            const history = Array.isArray(body?.history) ? body.history : []

            if (!tenantId || !userId || !userMessage) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Missing required fields: tenantId, userId, userMessage' } }))
              return
            }

            // Simple rate limit: 20 req/user/min
            const key = `chatbot_rl:${userId}`
            const now = Date.now()
            globalThis.__chatbotRl = globalThis.__chatbotRl || new Map()
            const m = globalThis.__chatbotRl
            const arr = m.get(key) || []
            const recent = arr.filter((t) => now - t < 60_000)
            if (recent.length >= 20) {
              m.set(key, recent)
              res.statusCode = 429
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Rate limit exceeded. Please try again in a moment.' } }))
              return
            }
            recent.push(now)
            m.set(key, recent)

            // Delegate orchestration to the browser module? Not available server-side.
            // For now, reuse the existing /api/chat proxy with a minimal prompt.
            const messages = [
              { role: 'system', content: 'You are Sand Intelligence Assistant. Answer concisely.' },
              ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage },
            ]

            const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
            if (!apiKey || apiKey === 'your_openai_api_key_here') {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'OpenAI API key not configured on dev server.' } }))
              return
            }

            const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.2,
                max_tokens: 700,
              }),
            })

            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
            res.end(text)
            void conversationId
            void tenantId
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: { message: String(e?.message || e) } }))
          }
        })
      },
    },
  ],
  json: {
    stringify: false // Allow importing JSON as objects
  }
  }
})
