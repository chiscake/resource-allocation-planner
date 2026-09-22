# AGENT_NAV — resource-allocation-planner

**English only.** Keep this file current when you add/rename routes, packages, or Supabase entrypoints.

Purpose: fast orientation for coding agents. Prefer pointers over copying rules — details live in `AGENTS.md`, `docs/data-model.md`, `ROADMAP.md`.

---

## Read first

| If you need…                                         | Open                                               |
| ---------------------------------------------------- | -------------------------------------------------- |
| Hard rules / overrides / migrations / schema_version | [`../AGENTS.md`](../AGENTS.md)                     |
| Commit / push / Vercel / Supabase cloud workflow     | [`COMMIT_WORKFLOW.md`](COMMIT_WORKFLOW.md)         |
| Tables, org/share/trash, RLS intent                  | [`data-model.md`](data-model.md)                   |
| Design tokens / Cartesia UI                          | [`DESIGN.md`](DESIGN.md)                           |
| Phases + intended folder tree                        | [`../ROADMAP.md`](../ROADMAP.md)                   |
| Post-MVP / deferred backlog                          | [`TODO-later.md`](TODO-later.md)                   |
| Why / grill decisions                                | [`../.tmp/START.md`](../.tmp/START.md)             |
| Task 13 text                                         | [`course/assignment.md`](course/assignment.md)     |
| Course formal requirements                           | [`course/requirements.md`](course/requirements.md) |

Scratch: `.tmp/task13_*.py/json`, `LP4DVisualizer.jsx`. Design canon: **`docs/DESIGN.md`**.

---

## Repo layout

```
resource-allocation-planner/
├── AGENTS.md
├── ROADMAP.md
├── package.json                 # pnpm: dev, check, test, preflight*, seed:users, db:*, tauri:*
├── scripts/preflight.mjs        # commit gates (check+test+secrets); see COMMIT_WORKFLOW.md
├── scripts/seed-users.mjs       # Auth Admin API (not SQL users)
├── .cursor/hooks.json           # Cursor gates for push/cloud mutate
├── vitest.config.ts
├── src/
│   ├── app.css                  # Tailwind v4 + Cartesia @theme
│   ├── lib/
│   │   ├── domain/              # Model, mutations, task13
│   │   ├── solver/              # local LP + IPM + GA + venue + limits
│   │   ├── api/solve.ts         # Edge or local transport (+ method + local fallback)
│   │   ├── db/                  # supabase, guest, audit helpers
│   │   ├── i18n/                # ru
│   │   ├── components/VenueToggle.svelte  # Tauri only
│   │   └── platform.ts
│   └── routes/
│       ├── +page.svelte         # marketing: Web версия + guest CTA
│       ├── login/               # guest upload on success
│       ├── onboarding/          # Tauri wizard
│       ├── share/[token]/      # public link view (Z)
│       └── app/                 # authenticated shell (+ unread badge)
│           ├── +page.svelte     # recent / favorites / personal / org lists
│           ├── create/
│           ├── nodes/[id]/     # solve (lp|ipm|ga), what-if ←i/N→, share/fork/org
│           ├── templates/, public-templates/
│           ├── compare/, trash/, org/, notifications/, admin/
├── supabase/
│   ├── migrations/000…080       # 070_share_notify_rpc (merged 070–073); 080_purge_cron
│   ├── functions/               # solve, run_mutations, admin-create-user
│   │   └── _shared/solver/      # Edge mirror of ipm/ga/resultBuild (keep ↔ src/lib/solver)
│   └── seed.sql                 # noop; users via seed:users
└── src-tauri/
```

**Dev:** `pnpm dev` → http://127.0.0.1:5400 (HMR 5401).  
**Backend local (one shot):** `pnpm supabase:local` → `supabase start` + `db reset` + `seed:users` + `functions serve`.

**Production (web):** https://resource-allocation-planner-taupe.vercel.app  
**Vercel build:** `vercel.json` → `pnpm build`, output `build/` (static SPA rewrites).

**Cloud link (once per machine):**

- `supabase link --project-ref ktdxdqnhjitolfpcztds` (RAP)
- `vercel link --yes --project resource-allocation-planner --scope chiscakes-projects`
- Ignore: `.vercel/`, `supabase/.temp/`, `.env.local` / `.env.cloud` (never commit)
- Client env canon: `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Vercel env name: publishable key, not anon)
- Vite env file: `vite.env-file` (path, default `.env.local`) or `RAP_ENV_FILE=… pnpm dev`

**Cloud seed:** `pnpm seed:users:cloud` (reads `.env.cloud` — service role + project URL).

**Desktop installer:** `pnpm tauri:build` (slow; not part of CI — run locally for `.msi`/bundle).

---

## Routes

| Path                 | Role                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `/`                  | Marketing (web) / guest Task 13 → login; Tauri → onboarding or `/app`   |
| `/login`             | Auth (Register disabled); always upload guest slot on success           |
| `/onboarding`        | Tauri first-run wizard                                                  |
| `/app`               | Home lists (parents only)                                               |
| `/app/create`        | Blank / Task 13 / templates → personal root                             |
| `/app/nodes/[id]`    | Solve, what-if pager, favorite, fork, share link+grant, org attach/hide |
| `/app/notifications` | Inbox; poll 60s + focus; layout unread badge                            |
| `/app/trash`         | Soft-deleted roots; restore → private; hard delete                      |
| `/app/org`           | Org ids + feed; org_owner can hide others                               |
| `/app/compare`       | Side-by-side Z/plan/duals; saved comparisons hard-delete                |
| `/app/admin`         | List/create users (Edge); edit system template titles                   |
| `/share/[token]`     | Public share (non-revoked link)                                         |

---

## Entrypoints

| Concern     | Path / command                                                       |
| ----------- | -------------------------------------------------------------------- |
| Dev         | `pnpm dev` :5400                                                     |
| Test        | `pnpm test`                                                          |
| Check       | `pnpm check`                                                         |
| Preflight   | `pnpm preflight` / `preflight:main` — before commit / promote        |
| Seed        | `pnpm seed:users` — admin@rap.local, demo1/2@rap.local / password123 |
| Cloud seed  | `pnpm seed:users:cloud` — same users against linked RAP project      |
| Local stack | `pnpm supabase:local` — start + reset + seed + Edge serve            |
| Installer   | `pnpm tauri:build` — desktop bundle (local only)                     |
| Edge        | `solve`, `run_mutations`, `admin-create-user`                        |
| Venue       | Web = cloud when online (fallback local); Tauri UI toggle            |

---

## Domain map

| Concept                   | Where                     |
| ------------------------- | ------------------------- |
| LP model + schema_version | `src/lib/domain/`         |
| solve / run_mutations     | `src/lib/solver/` + Edge  |
| Methods `lp` / `ipm` / `ga` | `src/lib/solver/{solve,ipm,ga}.ts`; Edge `_shared/solver/` |
| Plan rounding (UI post)   | `src/lib/solver/roundPlan.ts` + `roundPref.ts` |
| Compute venue             | `src/lib/solver/venue.ts` |
| Guest slot                | `src/lib/db/guest.ts`     |
| Audit writes              | `src/lib/db/audit.ts`     |
| Cartesia tokens           | `src/app.css` `@theme`    |

---

## Maintenance rule

When you add routes, Edge functions, migration shelves, or scripts → update **this file** in the same change set.
