@AGENTS.md


## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Commands

```bash
pnpm dev        # start dev server on port 3000
pnpm build      # production build (type-checks + compiles)
pnpm start      # serve production build
```

There are no test or lint scripts. TypeScript strict mode is on — `pnpm build` is the primary correctness check.

## Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # admin client only — never exposed to browser
OPENAI_API_KEY
CRON_SECRET                 # bearer token checked by /api/cron/publish and /api/reddit/monitor
SIGNUP_INVITE_CODE          # required to create new accounts (email or Google)
REDDIT_USER_AGENT           # optional — User-Agent for public RSS fetches
```

## Architecture overview

**Next.js 16 App Router** with the following route groups:
- `app/(auth)/` — unauthenticated pages (login)
- `app/(dashboard)/[companyId]/` — all authenticated dashboard pages; the layout at `app/(dashboard)/[companyId]/layout.tsx` enforces auth, loads all companies, and redirects if the `companyId` param is not owned by the user
- `app/api/` — API routes (all server-side)
- `app/companies/new/` — company creation flow

**Multi-tenant model:** every resource (posts, brand profiles, knowledge chunks) is scoped to a `company_id`. Users own companies via `companies.owner_id`. The `[companyId]` URL segment drives all dashboard data fetching.

### Supabase clients

Three distinct clients — use the right one:

| File | Client | When to use |
|---|---|---|
| `lib/supabase/server.ts` | `createClient()` | Server Components and API routes — respects the logged-in user's session via cookies |
| `lib/supabase/client.ts` | `createBrowserClient()` | Client Components only |
| `lib/supabase/admin.ts` | `createAdminClient()` | Background jobs (ingest, scrape) that need to bypass RLS — never call from user-facing routes |

### Two content generation paths

There are two separate generation pipelines that coexist:

1. **Agent pipeline** (`app/api/generate/content/route.ts` → `agents/`)
   - Uses `@openai/agents` SDK with per-channel agents (LinkedIn, X, Reddit, Facebook)
   - Each agent is built by `agents/<channel>-agent.ts`, which calls `buildBaseSystemPrompt` from `agents/base-agent.ts`
   - Supports streaming (`stream: true` in request body) via `generatePostReadableStream`
   - Channel-specific output parsing: Reddit expects JSON `{title, body}`, X may return `{thread: [...]}`, both others plain text
   - Image prompt is always appended after `\n--\nIMAGE_PROMPT:` and stripped by `parseImagePrompt`

2. **Simple pipeline** (`app/api/generate/route.ts`)
   - Calls OpenAI chat completions directly (no agents SDK)
   - Accepts multiple `channels[]` in one request, fans out with `Promise.allSettled`
   - Saves drafts to Supabase immediately
   - Used by the bulk/calendar generate flow

### RAG pipeline

Knowledge is stored as vector embeddings in the `knowledge_chunks` table.

- **Ingest:** `lib/rag/ingest.ts` — chunks pages into ~800-token segments (sentence-aware), embeds in batches of 100 via `text-embedding-3-small`, stores with `pgvector`
- **Scrape:** `lib/rag/scraper.ts` — BFS crawler, respects robots.txt, runs as a background job tracked in `scrape_jobs` table; status polled by `ScrapeForm.tsx`
- **Retrieve:** `lib/rag/retrieve.ts` — embeds the query, calls the `search_knowledge` Supabase RPC (pgvector cosine similarity), returns top-K chunks above a similarity threshold

The `search_knowledge` Supabase function must exist in the database — it's not auto-created.

### Publishing

`lib/publishing/index.ts` dispatches to per-channel adapters (`linkedin.ts`, `x.ts`, `reddit.ts`, `facebook.ts`). Each adapter reads `post.content` and `post.content_variants` to handle channel-specific formats (e.g. Reddit needs title + body separately).

Cron routes are GET handlers protected by `Authorization: Bearer <CRON_SECRET>`:
- `/api/cron/tick` — combined publish-due + Reddit monitor (preferred for external crontab)
- `/api/cron/publish` — publish overdue scheduled posts/articles only
- `/api/reddit/monitor` — Reddit RSS scan only

Vercel Hobby only allows **once-per-day** built-in crons; use `scripts/cron-tick.sh` from system crontab on a VPS or dev box instead (`vercel.json` crons array is empty). Overdue publishes also run when users open Calendar, Posts, or Blog.

### Media generation

`lib/media/gpt-image.ts` — generates images via OpenAI image API, uploads to Supabase Storage, returns a public URL. `lib/media/canva.ts` — OAuth flow for Canva design imports (`/api/canva/connect` → `/api/canva/callback`).

### Key types

All domain types live in `types/database.ts`:
- `Channel` — `'linkedin' | 'x' | 'reddit' | 'facebook'`
- `PostStatus` — `'draft' | 'scheduled' | 'published' | 'archived'`
- `Post`, `BrandProfile`, `KnowledgeChunk`, `ScrapeJob`, `Company`

Agent-specific types (request/response shapes) are in `types/agents.ts`.

### Path alias

`@/` maps to the repo root (not `src/`). All imports use this alias.
