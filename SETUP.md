# LunchLedger AI — Setup & Architecture (MVP backend slice)

Voice-first / natural-language expense tracking for friend groups. This repo currently
implements the **backend vertical slice**: a LangGraph agent that turns messages like
_"Ali paid 2500. Everyone except Hamza."_ into deterministic database updates, exposed
over `POST /ai/message`.

## What works today

- **Intents:** `ADD_EXPENSE`, `SHOW_BALANCE` (fully), plus working `SETTLE_PAYMENT`,
  `SHOW_HISTORY`, `WHO_SHOULD_PAY`, `ADD_MEMBER`, `REMOVE_MEMBER`, `CREATE_GROUP`.
- **Natural language:** payer / participants / amount / date extraction, `me`/`myself`,
  `everyone`, `everyone except X`, `only X and Y`, and unknown-name clarification
  ("Bilal is not a member — add temporarily or permanently?").
- **Deterministic money:** equal split with exact remainder distribution, running
  balances derived from the ledger. **No AI touches arithmetic.**

## Tech

TypeScript (strict, no `any`) · pnpm workspaces · Fastify · LangGraph JS · LangChain +
Google Gemini · Prisma + PostgreSQL · Zod.

## Architecture

```
apps/api            Fastify HTTP layer (POST /ai/message)
packages/ai         LangGraph agent: understand → resolve → execute → respond
packages/core       Deterministic business services + repositories wiring (DI)
packages/db         Prisma schema, client, repositories, seed
packages/shared     Domain types, Zod schemas, money utilities
```

Dependency direction (clean architecture): `api → ai → core → db → shared`.
AI nodes call the **Tool Layer** (`packages/ai/src/tools`), which calls **services**,
which call **repositories**. AI nodes never touch Prisma.

### The graph (`packages/ai/src/graph/buildGraph.ts`)

```
START → understand ─(UNKNOWN)────────────────→ respond → END
                   └→ resolve ─(needs clarification)→ respond
                              └→ execute → respond
```

- **understand** — the ONLY LLM call. Structured output (Zod `ExtractionSchema`):
  intent + entities. Never does math.
- **resolve** — deterministic: maps names→member ids, resolves `me`, parses dates,
  decides if clarification is needed.
- **execute** — deterministic: dispatches the resolved intent to the Tool Layer.
- **respond** — deterministic reply templates.

### LLM provider

The provider is chosen from the environment, in priority order:

1. **OpenRouter** (`OPENROUTER_API_KEY`) — OpenAI-compatible gateway with free models.
   Default model: `openai/gpt-oss-20b:free` (supports tool calling). Via `@langchain/openai`.
2. **Google Gemini** (`GOOGLE_API_KEY`) — via `@langchain/google-genai`.
3. **Mock** (neither set) — a deterministic offline parser so the graph, business
   logic, tests, and demo run fully offline (no network, no quota).

All real providers share one code path through LangChain's `withStructuredOutput`, so
adding another is a few lines in `packages/ai/src/llm/provider.ts`. The Zod extraction
schema is deliberately tolerant of small free-model quirks (empty strings coerced to
null; a bare/comma string coerced to an array).

## Getting started

```bash
# 1. Start Postgres (Docker) — host port 5433
docker compose up -d db

# 2. Install
pnpm install

# 3. DB: generate client, migrate, seed
pnpm db:generate
pnpm db:migrate      # first run: creates the schema
pnpm db:seed         # seeds "Office Friends" (Ali, Ahmed, Hamza, Usman, Faizan)

# 4. (optional) Use real Gemini: put your key in .env / apps/api/.env
#    GOOGLE_API_KEY="..."      GEMINI_MODEL="gemini-2.5-flash"

# 5. Run the end-to-end smoke test (offline mock by default)
pnpm smoke

# 6. Run the API
pnpm dev:api
```

The seed prints `GROUP_ID` and `CURRENT_USER_ID`; put them in `apps/api/.env` as
`SEED_GROUP_ID` / `SEED_USER_ID` to use as the default request context (already wired).

## Terminal chat (no server needed)

Talk to the agent directly from the terminal — it drives the database live:

```bash
pnpm chat
```

```
  you ▸ Ali paid 2500. Everyone except Hamza.
  🤖 Got it — Ali paid 2500. Each of 5 pays 500.
  you ▸ who owes what?
  🤖 Balances for Office Friends:
       • Ali: is owed 2000
       ...
```

Built-in commands: `/help` `/members` `/balance` `/history` `/whoami` `/quit`.
Works interactively or piped (`echo "..." | pnpm chat`). Uses the `SEED_GROUP_ID` /
`SEED_USER_ID` context from `apps/api/.env`.

> **Gemini free tier = 20 requests/day.** If you hit `429 quota exceeded`, either wait
> for the daily reset or run offline (deterministic mock parser, no quota, no network):
>
> ```bash
> GOOGLE_API_KEY="" pnpm chat
> ```

## Try it over HTTP

```bash
curl -s -X POST localhost:3001/ai/message \
  -H 'content-type: application/json' \
  -d '{"message":"Ali paid 2500. Everyone except Hamza."}'

curl -s -X POST localhost:3001/ai/message \
  -H 'content-type: application/json' \
  -d '{"message":"who owes what?"}'
```

`POST /ai/message` body: `{ "message": string, "groupId"?: string, "userId"?: string }`.
Response: `{ success, reply, data: { intent, clarification, result } }`.

## Tests

```bash
pnpm --filter @lunchledger/core test   # deterministic split + participant resolution
pnpm smoke                             # full agent → DB → balances assertions
```

## Notes / deviations from the spec

- Added `packages/core` (service layer) beyond the spec's `db`/`ai`/`shared` so data
  access and business logic stay separated (Clean Architecture / SOLID).
- Money is stored as **integer minor units** (paisa/cents) for deterministic math.
- Balances are **derived from the ledger** (never a mutable column) so they can't drift.
- Response generation is currently **deterministic templates** (reliable + offline). An
  optional LLM polish pass is a straightforward future enhancement.

## Next steps (not in this slice)

Next.js dashboard (conversation + balances + history) · guest persistence flow after
clarification · richer history date-range parsing · auth · voice pipeline.
