# Chatbot Integration Plan (Codebase Analysis)

This document analyzes the existing codebase and identifies the best integration points to implement a chatbot feature, reusing existing infrastructure where possible.

## Stack & conventions

### Language / framework / runtime
- **Language**: JavaScript (ESM), React
- **Frontend framework**: **React 18** + **Vite 5**
- **Styling**: **Tailwind CSS 3** (+ `clsx`, `tailwind-merge`)
- **Mapping**: **MapLibre GL 4** (also has `mapbox-gl` as a dependency)

Evidence:
- `package.json` uses `"type": "module"`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`.

### API routes structure
- **No backend API routes in this repo** (no Express/Next/FastAPI/Nest routes detected).
- Chat currently calls OpenAI **directly from the browser** using `fetch('https://api.openai.com/v1/chat/completions', ...)` in `src/services/openai-chat.js`.

Implication:
- Any “chatbot API routes” would need to be introduced (e.g., a small server, serverless function, or a separate backend repo), because today this is a **pure client-side Vite app**.

### Folder structure conventions (where logic lives)
- **UI**: `src/components/**`
  - Panels are grouped under `src/components/panels/` (e.g., `WaterOSCopilotPanel.jsx`, `ManageMapLayersPanel.jsx`)
- **State / app-wide logic**: `src/contexts/PanelContext.jsx` (React Context provider with many feature flags/states)
- **Services**: `src/services/*` (e.g., `src/services/openai-chat.js`)
- **Utilities**: `src/utils/*` (e.g., IndexedDB helpers `src/utils/idb.js`)
- **Data**: `src/data/*` (static JSON datasets)
- **Config**: `src/config/*` (e.g., view presets)

### Database / migrations / ORM
- **None present** in this repo.
- No signs of Prisma/Drizzle/Knex/Alembic migration tooling.
- No SQL/schema files found.

### Testing framework
- No first-party test setup found in the app source.
  - The only `*.test.*`/`*.spec.*` files observed are inside `node_modules/`.

### TypeScript config / strict mode / path aliases
- No `tsconfig.json` at the repo root (only in `node_modules`).
- App source is primarily `.jsx` / `.js`.
- No explicit path alias configuration found (Vite config is minimal).

## Existing infrastructure to reuse

### Auth / session / current user / tenant
- **No auth/session system** detected.
- No user model, tenant/org ID concept, or request context exists (because there is no server).

### Rate limiting / logger / error handling
- There is no centralized logging framework (no pino/winston/etc.).
- There is some ad-hoc error handling in services (e.g., OpenAI service maps HTTP status codes to friendly errors).
- There is no reusable “rate limiter” middleware (again, no server). Client-side throttling exists for specific external calls (e.g., Open‑Meteo).

### Existing LLM integration
Yes:
- `src/services/openai-chat.js` integrates with OpenAI Chat Completions.
  - Uses **model**: `gpt-4o-mini`
  - Builds a **system prompt** via `buildSystemPrompt()` and `formatContextForPrompt()`
  - Sends messages via `sendChatMessage(chatMessages, contextData)`

Important security note:
- The OpenAI API key is read from `import.meta.env.VITE_OPENAI_API_KEY`, meaning the key is exposed to the client bundle if configured.

### Vector DB / embeddings / search
- **None present**.
- No embeddings generation, vector store, or semantic search feature detected.

### Admin area / admin role check
- No role/permission system detected.
- No admin routes/guards (no router and no auth).

### Frontend component library
- Tailwind-based custom UI.
- There is a small UI helper at `src/components/ui/card.jsx` (custom component).
- No MUI/Chakra/shadcn detected.

### Frontend state management
- **React Context**: `src/contexts/PanelContext.jsx` is the main store (tons of feature state, panel visibility, city selection, chat state).
- No Redux/Zustand/React Query detected.

### Environment variables loading/validation
- **Vite env vars** (`import.meta.env.*`).
- Minimal validation: OpenAI service checks `VITE_OPENAI_API_KEY` presence and prefix (`sk-`) via `validateApiKey()`.

## Data model context

### Multi-tenancy model
- None present (no server/database).

### User/account model
- None present.

## Integration points

### Where chatbot API routes would most naturally live
Because this is currently a client-only Vite app, you have two realistic options:

1) **Add a backend** (recommended for any real chatbot):
   - A small Node server (Express/Fastify) living in a new `server/` folder or separate repo.
   - The frontend would call `/api/chat` instead of OpenAI directly.

2) **Serverless function** (recommended if you’re deploying to a platform that supports it):
   - e.g., Vercel/Netlify/Cloudflare Workers function.
   - Still exposes an `/api/chat` endpoint but without adding a long-lived server in this repo.

In both cases, you would move the OpenAI call out of `src/services/openai-chat.js` and into the server function, and the client service becomes a thin wrapper that calls your own endpoint.

### Where the admin settings panel fits in UI
- The existing chatbot UI lives in `src/components/panels/WaterOSCopilotPanel.jsx`, driven by state in `src/contexts/PanelContext.jsx`.
- The most consistent place for admin/config UI would be:
  - A new section/tab within the existing “Copilot” panel UI, or
  - A new panel under `src/components/panels/` opened from `TopNav` / existing controls.

### Feature flags / permissions to hook into
- There is no formal feature flag or permissions system.
- The closest analog is the “panel visibility + toggles” pattern in `PanelContext.jsx` (booleans and objects keyed by feature).

## Constraints & gaps (what chatbot needs that doesn’t exist yet)

### Must-have gaps
- **No secure server-side layer**:
  - Current OpenAI integration requires a client-side API key (`VITE_OPENAI_API_KEY`), which is not safe for production.
  - A chatbot feature that supports real users needs a server endpoint to keep secrets safe.

- **No auth / user identity / tenant context**:
  - If you need “current user” and “tenant/org ID”, you’ll need to implement authentication and a user model somewhere (likely server-side).

### Nice-to-have gaps (depending on scope)
- **No vector DB / embeddings**:
  - If you want retrieval over documents/data, you’ll need to add an embeddings pipeline + vector store (or an external service).

- **No audit logging / moderation / rate limiting**:
  - For production, you’ll likely want request logging, abuse/rate limiting, and maybe content filtering at the API layer.

### Conventions to follow (non-obvious)
- Keep shared app state in `src/contexts/PanelContext.jsx` (that’s the established pattern).
- Put external integrations in `src/services/`.
- Put browser persistence helpers in `src/utils/` (IndexedDB helper already exists at `src/utils/idb.js`).

