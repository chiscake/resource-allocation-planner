# AGENT_NAV — resource-allocation-planner

**English only.** Keep this file current when you add/rename routes, packages, or Supabase entrypoints.

Purpose: fast orientation for coding agents. Prefer pointers over copying rules — details live in `AGENTS.md`, `docs/data-model.md`, `ROADMAP.md`.

---

## Read first

| If you need…                                         | Open                                               |
| ---------------------------------------------------- | -------------------------------------------------- |
| Hard rules / overrides / migrations / schema_version | [`../AGENTS.md`](../AGENTS.md)                     |
| Tables, org/share/trash, RLS intent                  | [`data-model.md`](data-model.md)                   |
| Design tokens / Cartesia UI                          | [`DESIGN.md`](DESIGN.md)                           |
| Phases + intended folder tree                        | [`../ROADMAP.md`](../ROADMAP.md)                   |
| Why / grill decisions                                | [`../.tmp/START.md`](../.tmp/START.md)             |
| Task 13 text                                         | [`course/assignment.md`](course/assignment.md)     |
| Course formal requirements                           | [`course/requirements.md`](course/requirements.md) |

Scratch (do not treat as production): `.tmp/task13_*.py/json`, `LP4DVisualizer.jsx`. Design canon is **`docs/DESIGN.md`**, not `.tmp`.

---

## Repo layout (update as scaffolded)

```
resource-allocation-planner/
├── AGENTS.md
├── ROADMAP.md
├── .env.example / .env.local   ← local secrets; never commit .env.local
├── .cursor/rules/              ← thin glob rules (token-cheap)
├── docs/                       ← AGENT_NAV, data-model, DESIGN (Cartesia), course/
├── src/                        ← SvelteKit SPA (ssr=false)
│   ├── routes/                 ← `/` app, `/onboarding` (Tauri only)
│   └── lib/platform.ts
├── src-tauri/                  ← Tauri v2 (ports via vite 5400)
├── supabase/                   ← config + seed.sql (migrations TBD)
└── .tmp/                       ← START + fixtures/demos
```

**Dev:** `pnpm dev` → http://127.0.0.1:5400 (HMR 5401). **Tauri:** `pnpm tauri:dev`.

_Update this section whenever routes or packages change._

---

## Entrypoints

| Concern      | Path / command                                          |
| ------------ | ------------------------------------------------------- |
| Dev server   | `pnpm dev` — http://127.0.0.1:**5400** (HMR **5401\*\*) |
| Tauri        | `pnpm tauri:dev` / `pnpm tauri:build`                   |
| Types check  | `pnpm check`                                            |
| Static build | `pnpm build` → `build/`                                 |
| Env          | `.env.local` (gitignored); template `.env.example`      |
| Migrations   | `supabase/migrations/NNN_*.sql` (TBD)                   |
| Cursor rules | `.cursor/rules/*.mdc` (thin, glob-scoped)               |

---

## Domain map (stable)

| Concept                                          | Where it should live                        |
| ------------------------------------------------ | ------------------------------------------- |
| LP model + `schema_version` + `what_if_defaults` | `src/lib/domain/` + jsonb in DB             |
| `solve` / `run_mutations`                        | `src/lib/solver/` + Edge mirror             |
| Guest persistence                                | `src/lib/db/` (localStorage / Tauri SQLite) |
| Supabase client                                  | `src/lib/db/`                               |
| Platform gates (web vs tauri)                    | `src/lib/platform/`                         |
| i18n                                             | `src/lib/i18n/`                             |

---

## Maintenance rule

When you:

- add a top-level folder or major route group, **or**
- add an Edge Function / migration shelf, **or**
- change default ports or package scripts,

→ update **this file** in the same change set.
