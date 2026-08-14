# LunchLedger AI

Natural-language expense splitting for friend groups. You say what happened; the
ledger updates itself.

```
you ▸ Ali paid 2500. Everyone except Hamza.
 🤖   Got it — Ali paid 2500. Each of 4 pays 625.

you ▸ who owes what?
 🤖   Balances for Office Friends:
        • Ali: is owed 1875
        • Ahmed: owes 625
        • Usman: owes 625
        • Faizan: owes 625
        • Hamza: settled up
```

No forms, no dropdowns, no "select participants". One sentence in, correct rows in
Postgres out.

**The core idea: the AI never does arithmetic.** It reads language and produces a
structured interpretation — intent plus entities — and that is the whole of its job.
Every number is computed by deterministic TypeScript that a model cannot reach. See
[ARCHITECTURE.md](ARCHITECTURE.md) for how that boundary is enforced.

---

## Status

This repo is the **backend vertical slice**: a LangGraph agent, the business layer
beneath it, an HTTP endpoint, and a terminal REPL. There is no frontend yet.

**Working end to end**

- Adding expenses with an equal split and exact remainder distribution
- Running balances derived from the ledger
- Settlements between members
- Expense history, scoped to a requested period
- Adding and removing members, creating groups
- "Who should pay next?"
- Clarifying questions when a name, amount, or payer is missing or unrecognised
- Full offline mode — the graph, business logic, tests and demo run with no API key

**Not built yet**

- Any web UI (`apps/web` does not exist)
- Conversation memory — every message is an independent graph run, so the agent can
  ask *"add Bilal temporarily or permanently?"* but has nowhere to receive your answer.
  This is the single biggest gap, and it blocks the temporary-guest flow below.
- Temporary guests. The table, the service logic and the split arithmetic all exist and
  are correct, but nothing populates them — they are waiting on conversation memory.
- Naming a group in the message ("in Office Friends, Ali paid…"). Group comes from
  config or the request body.
- Analytics-style questions: "how much do I owe Ali?", "who spent the most this month?"
- Auth, multi-tenancy, voice

---

## Stack

TypeScript (strict, no `any`) · pnpm workspaces · Fastify · LangGraph JS ·
LangChain JS · Prisma + PostgreSQL · Zod · Node's built-in test runner

---

## Quickstart

Requires Node ≥ 20, pnpm, and Docker.

```bash
# 1. Postgres (host port 5433, to avoid clashing with a local install on 5432)
pnpm db:up

# 2. Dependencies
pnpm install

# 3. Environment — copy the example into the three places that read it
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example packages/db/.env

# 4. Database: generate the client, create the schema, seed a demo group
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Talk to it
pnpm chat
```

`pnpm db:seed` creates "Office Friends" (Ali, Ahmed, Hamza, Usman, Faizan) and prints a
`GROUP_ID` and `CURRENT_USER_ID`. Paste them into `apps/api/.env` as `SEED_GROUP_ID` and
`SEED_USER_ID` — they become the default context for requests that don't specify one.

### Why three `.env` files

`dotenv` resolves `.env` against the **working directory**, and pnpm runs each package's
scripts from that package's root. So:

| File | Read by |
| --- | --- |
| `apps/api/.env` | `pnpm dev:api`, `pnpm chat`, `pnpm smoke` — **the runtime**; your API key goes here |
| `packages/db/.env` | `pnpm db:generate`, `db:migrate`, `db:seed`, `db:studio` |
| `.env` | Prisma CLI invoked from the repo root |

Keep `DATABASE_URL` identical in all three. All are git-ignored.

---

## Using it

### Terminal

```bash
pnpm chat
```

Drives the real database. Built-in commands: `/help` `/members` `/balance` `/history`
`/group <id>` `/whoami` `/quit`. Works interactively or piped:
`echo "who owes what?" | pnpm chat`.

### HTTP

```bash
pnpm dev:api    # http://localhost:3001
```

```bash
curl -s -X POST localhost:3001/ai/message \
  -H 'content-type: application/json' \
  -d '{"message":"Ali paid 2500. Everyone except Hamza."}'
```

**`POST /ai/message`**

```jsonc
// request
{ "message": "string", "groupId": "optional", "userId": "optional" }

// response
{
  "success": true,              // false when the agent needs a clarification
  "reply": "Got it — Ali paid 2500. Each of 4 pays 625.",
  "data": {
    "intent": "ADD_EXPENSE",
    "clarification": null,      // the question, when success is false
    "result": { }               // typed per intent
  }
}
```

**`GET /health`** returns `{ status, llm }`, where `llm` is the active provider —
the quickest way to check your key was picked up.

### What it understands

```
Ali paid 2400.                        Ahmed paid Ali 500.
Only Ali and Ahmed went today.        I gave Hamza 700.
Everyone except Hamza.                Show today's expenses.
Me, Ali and Bilal had lunch.          Show last week's lunches.
Ahmed paid for everyone.              Who owes what?
Ali paid 1800 for himself and me.     Who should pay next?
I paid 900 today.                     Add Bilal permanently.
```

Dates: `today`, `yesterday`, `N days ago`, ISO dates. History periods additionally
accept `this/last week`, `this/last month`, `this year`, `last N days`.

---

## LLM provider

Chosen from the environment, in priority order:

1. **OpenRouter** — `OPENROUTER_API_KEY`. OpenAI-compatible gateway with free models.
2. **Google Gemini** — `GOOGLE_API_KEY`. Default `gemini-3.5-flash`.
3. **Mock** — neither key set. A deterministic offline parser.

The mock is not a stub: it is a real heuristic parser producing the same `Extraction`
shape as the models, so the entire graph, all business logic, the test suite and the
demo run with no network and no quota. That is the default, and CI never needs a key.

> Google retires older Gemini models for **newly created** keys — the whole 2.x flash
> family now 404s with *"no longer available to new users"*. To see what yours can reach:
>
> ```bash
> curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY" \
>   | grep '"name"'
> ```
>
> Hit a quota limit? Blank the key and keep working — `GOOGLE_API_KEY="" pnpm chat`.

---

## Tests

```bash
pnpm test        # 45 unit tests — no DB, no network, no API key
pnpm smoke       # full agent → DB → balances assertions (needs Postgres)
pnpm typecheck   # strict tsc across every package
```

`pnpm test` covers the deterministic core — money splitting, participant resolution,
natural-date and range resolution — plus the offline extractor against every
natural-language example in the spec, so the demo script itself is regression-tested.

`pnpm smoke` is hermetic: it builds its own isolated group, asserts real balances
through the real graph, and cleans up after itself.

---

## Layout

```
apps/api            Fastify HTTP layer, terminal REPL, smoke test
packages/ai         LangGraph agent: understand → resolve → execute → respond
packages/core       Deterministic business services + DI composition root
packages/db         Prisma schema, client, repositories, seed
packages/shared     Domain types, Zod schemas, money utilities
```

Dependencies flow one way: `api → ai → core → db → shared`.

[ARCHITECTURE.md](ARCHITECTURE.md) explains the design — why the AI is fenced off from
arithmetic, how the graph is wired, how money stays exact, and where to add things.

---

## Roadmap

Ordered by leverage:

1. **Conversation memory** — a LangGraph checkpointer plus a thread id. Unlocks the
   guest flow, multi-turn clarification, and follow-up questions in one change.
2. **`apps/web`** — Next.js dashboard: conversation, live balances, history.
3. **Analytics intents** — pairwise debts, monthly spend leaders.
4. Group named in the message · auth · voice pipeline (STT → agent → TTS).

The original product spec lives in [`readme`](readme).
