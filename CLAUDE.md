# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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
CRON_SECRET                 # bearer token checked by /api/cron/publish
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

The cron route `app/api/cron/publish/route.ts` is a GET handler protected by `Authorization: Bearer <CRON_SECRET>`. It fetches all posts with `status = 'scheduled'` and `scheduled_for <= now`, publishes up to 50, and marks them `published`. The `vercel.json` cron array is currently empty — scheduling must be triggered externally.

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
