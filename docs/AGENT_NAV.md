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
├── package.json                 # pnpm: dev, check, test, seed:users, supabase:local, tauri:*
├── scripts/seed-users.mjs       # Auth Admin API (not SQL users)
├── vitest.config.ts
├── src/
│   ├── app.css                  # Tailwind v4 + Cartesia @theme
│   ├── lib/
│   │   ├── domain/              # Model, mutations, task13
│   │   ├── solver/              # local LP + venue + limits
│   │   ├── api/solve.ts         # Edge or local transport (+ local fallback)
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
│           ├── nodes/[id]/     # solve, what-if ←i/N→, share/fork/org
│           ├── templates/, public-templates/
│           ├── compare/, trash/, org/, notifications/, admin/
├── supabase/
│   ├── migrations/000…072
│   ├── functions/solve, run_mutations, admin-create-user
│   └── seed.sql                 # noop; users via seed:users
└── src-tauri/
```

**Dev:** `pnpm dev` → http://127.0.0.1:5400 (HMR 5401).  
**Backend local (one shot):** `pnpm supabase:local` → `supabase start` + `db reset` + `seed:users` + `functions serve`.

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
| Seed        | `pnpm seed:users` — admin@rap.local, demo1/2@rap.local / password123 |
| Local stack | `pnpm supabase:local` — start + reset + seed + Edge serve            |
| Edge        | `solve`, `run_mutations`, `admin-create-user`                        |
| Venue       | Web = cloud when online (fallback local); Tauri UI toggle            |

---

## Domain map

| Concept                   | Where                     |
| ------------------------- | ------------------------- |
| LP model + schema_version | `src/lib/domain/`         |
| solve / run_mutations     | `src/lib/solver/` + Edge  |
| Compute venue             | `src/lib/solver/venue.ts` |
| Guest slot                | `src/lib/db/guest.ts`     |
| Audit writes              | `src/lib/db/audit.ts`     |
| Cartesia tokens           | `src/app.css` `@theme`    |

---

## Maintenance rule

When you add routes, Edge functions, migration shelves, or scripts → update **this file** in the same change set.
