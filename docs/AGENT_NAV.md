# AGENT_NAV — resource-allocation-planner

**English only.** Keep this file current when you add/rename routes, packages, or Supabase entrypoints.

Purpose: fast orientation for coding agents. Prefer pointers over copying rules — details live in `AGENTS.md`, `docs/data-model.md`, `ROADMAP.md`.

---

## Read first

| If you need…                                     | Open                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| Hard rules / migrations / schema_version         | [`../AGENTS.md`](../AGENTS.md) (schema rule at **top**)      |
| Commit / push / Vercel / Supabase cloud workflow | [`COMMIT_WORKFLOW.md`](COMMIT_WORKFLOW.md)                   |
| Tables, org/share/trash, RLS intent              | [`data-model.md`](data-model.md)                             |
| Design tokens / Cartesia UI                      | [`DESIGN.md`](DESIGN.md)                                     |
| Shipped status / scope + tree                    | [`../ROADMAP.md`](../ROADMAP.md)                             |
| Post-MVP / deferred backlog                      | [`TODO-later.md`](TODO-later.md)                             |
| UI copy tone (RU end-user)                       | [`../AGENTS.md`](../AGENTS.md) + `.cursor/rules/ui-copy.mdc` |
| Task 13 text                                     | [`course/assignment.md`](course/assignment.md)               |
| Course formal requirements                       | [`course/requirements.md`](course/requirements.md)           |
| UML diagrams (course graphic part)               | [`uml/`](uml/) — one `.md` per diagram type                  |

Scratch only (not canon): `.tmp/task13_*.py/json`, `LP4DVisualizer.jsx`. Design canon: **`docs/DESIGN.md`**.

**Developer tools:** `tools/md-review/` — multi-LLM Markdown document review via `cursor-agent` CLI (see `tools/md-review/README.md`).

---

## Repo layout

```
resource-allocation-planner/
├── AGENTS.md
├── ROADMAP.md
├── package.json                 # pnpm: dev, check, format*, test, preflight*, seed:users, db:*, tauri:*
├── .prettierrc / .prettierignore / .editorconfig  # Prettier (2 spaces, singleQuote) + editor defaults
├── .vscode/settings.json        # format on save → Prettier (incl. *.svelte)
├── scripts/preflight.mjs        # commit gates (secrets+format:check+check+test); see COMMIT_WORKFLOW.md
├── scripts/seed-users.mjs       # Auth Admin API (not SQL users)
├── .cursor/hooks.json           # Cursor gates for push/cloud mutate
├── vitest.config.ts
├── src/
│   ├── app.css                  # Tailwind v4 + Cartesia @theme
│   ├── lib/
│   │   ├── domain/              # Model, mutations, what-if generations, task13
│   │   ├── solver/              # contract/registry/run + methods/{lp,ipm,ga,dln} × engine
│   │   ├── display/             # roundPlan / roundPref (UI post-process, not solver)
│   │   ├── api/solve.ts         # Edge or local transport (+ method + engine + local fallback)
│   │   ├── db/                  # supabase, guest, upload-guest, audit, soft-delete, task-draft, template-uses
│   │   ├── chrome/              # nav/drawer chrome state
│   │   ├── components/          # chrome/ (AppShell, AppHeader, …) + model/
│   │   ├── i18n/                # ru
│   │   ├── io/                  # CSV model import/export, Excel/PDF result export, PDF fonts (OFL)
│   │   ├── features.ts          # PUBLIC_* UI flags (DLN, orgs)
│   │   ├── devQuickLogin.ts     # seed accounts for bottom quick-login bar
│   │   └── platform.ts
│   └── routes/
│       ├── +page.svelte         # marketing: Web версия + guest CTA
│       ├── login/               # guest upload on success
│       ├── onboarding/          # Tauri wizard
│       ├── share/[token]/      # public link view (Z)
│       └── app/                 # authenticated shell (+ unread badge)
│           ├── +page.svelte     # home: CTA + recent + recent templates
│           ├── create/          # draft editor; persist on first solve
│           ├── tasks/           # all owned roots + search
│           ├── task/[id]/      # solve (lp|ipm|ga|dln), what-if ←i/N→, share/fork (+org when flagged)
│           ├── templates/, public-templates/, moderation/
│           ├── compare/, trash/, org/, notifications/, admin/
│           ├── test/            # scratch sandboxes (viz-3d, …); not product UX
├── supabase/
│   ├── migrations/000…083       # …082_share_grant_access_lock; 083_share_public_comments
│   ├── functions/               # solve, run_mutations, admin-create-user, admin-users
│   │   └── _shared/solver/      # Edge mirror: registry + methods (keep ↔ src/lib/solver)
│   └── seed.sql                 # noop; users via seed:users
├── src-tauri/
└── docs/uml/                    # course UML: deployment, use-case, sequence, classes
```

**Dev:** `pnpm dev` → http://127.0.0.1:5400 (HMR 5401).  
**Backend local (one shot):** `pnpm db:reset` → `supabase start` + `db reset` + `seed:users` + `db:fn:serve`. Edge only: `pnpm db:fn:serve` / `pnpm db:fn:stop`.

**Production (web):** https://resource-allocation-planner-taupe.vercel.app  
**Vercel build:** `vercel.json` → `pnpm build`, output `build/` (static SPA rewrites).

**Cloud link (once per machine):**

- `supabase link --project-ref ktdxdqnhjitolfpcztds` (RAP)
- `vercel link --yes --project resource-allocation-planner --scope chiscakes-projects`
- Ignore: `.vercel/`, `supabase/.temp/`, `.env.local` / `.env.cloud` (never commit)
- Client env canon: `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Vercel env name: publishable key, not anon)
- Vite env file: `vite.env-file` (path, default `.env.local`) or `RAP_ENV_FILE=… pnpm dev`

**Cloud seed:** `pnpm seed:users:cloud` (reads `.env.cloud` — service role + project URL).

**Cloud Auth (signup):** Dashboard → Authentication → Providers → Email:

- Allow new users to sign up = **ON**
- Confirm email = **ON** (hosted default)

**Cloud Auth (URL Configuration)** — Dashboard → Authentication → URL Configuration:

- **Site URL** (default when no `emailRedirectTo`): `https://resource-allocation-planner-taupe.vercel.app`
- **Redirect URLs** allow-list (exact or `/**` wildcards), e.g.:
  - `https://resource-allocation-planner-taupe.vercel.app/**`
  - `http://127.0.0.1:5400/**`
  - `http://localhost:5400/**`

Client signup passes `emailRedirectTo: {origin}/app`. If the URL is not allow-listed, Auth falls back to Site URL (often still `http://localhost:3000`).

Local (`supabase/config.toml`): `enable_signup = true`, `enable_confirmations = false`, `site_url` / redirect URLs on **:5400**. Restart stack after changing Auth config.

**Desktop installer:** `pnpm tauri:build` (slow; not part of CI — run locally for `.msi`/bundle).

---

## Routes

| Path                    | Role                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | Marketing (web) / guest Task 13 → login; Tauri → onboarding or `/app`                                                            |
| `/login`                | Login / register / MFA challenge; guest upload on session                                                                        |
| `/app/settings`         | Account settings; TOTP 2FA enroll (QR / secret) + disable                                                                        |
| `/onboarding`           | Tauri first-run wizard                                                                                                           |
| `/app`                  | Home: new-task CTA, recent (≤6), recent templates mix                                                                            |
| `/app/create`           | Draft editor + CSV import (sessionStorage); DB insert on first solve                                                             |
| `/app/tasks`            | All owned roots; search by title; updated_at desc                                                                                |
| `/app/task/[id]`        | Solve, what-if pager, CSV import, Excel/PDF export, share; org if flag                                                           |
| `/app/notifications`    | Inbox; poll 60s + focus; layout unread badge                                                                                     |
| `/app/trash`            | Soft-deleted roots; restore → private; hard delete                                                                               |
| `/app/org`              | Org ids + feed; redirects to `/app` unless `PUBLIC_SHOW_ORGS` is on                                                              |
| `/app/compare`          | Side-by-side ≤4 nodes (`?ids=` primary-first); picker modal; Δ vs primary; saved hard-delete; task FAB + sensitivity compare CTA |
| `/app/templates`        | Personal templates; create blank → `/app/templates/[id]?edit=1`                                                                  |
| `/app/templates/[id]`   | View (+ publish) / edit modes; staff can review pending + approve/reject                                                         |
| `/app/moderation`       | Pending queue; open template for review                                                                                          |
| `/app/public-templates` | Catalog; admin/mod: direct publish + remove                                                                                      |
| `/app/admin`            | Create users; list/block/unblock/delete (Edge `admin-users`); system tpl titles                                                  |
| `/app/test`             | Scratch hub for control sandboxes (not product UX)                                                                               |
| `/app/test/viz-3d`      | 3D SceneCanvas sandbox (cube-as-ОДР demos, …)                                                                                    |
| `/share/[token]`        | Public share (non-revoked link)                                                                                                  |

---

## Entrypoints

| Concern     | Path / command                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Dev         | `pnpm dev` :5400                                                                                          |
| Test        | `pnpm test`                                                                                               |
| Check       | `pnpm check`                                                                                              |
| Preflight   | `pnpm preflight` / `preflight:main` — before commit / promote                                             |
| Seed        | `pnpm seed:users` — admin@, admin2@, mod@, demo1/2/3@example.com / password123 (demo3: no org)            |
| Quick login | Bottom bar under `/app` (`DevQuickLoginBar`); flag `PUBLIC_DEV_QUICK_LOGIN`                               |
| DLN UI      | Method tab + compare configs; flag `PUBLIC_SHOW_DLN` (UI only; Edge/local still accept dln)               |
| Orgs UI     | Sidebar, task attach, org trash, `/app/org`; flag `PUBLIC_SHOW_ORGS` (UI only; schema/RLS/seed orgs stay) |
| Cloud seed  | `pnpm seed:users:cloud` — same users against linked RAP project                                           |
| Local stack | `pnpm db:reset` — start + reset + seed + `db:fn:serve`; Edge: `db:fn:serve` / `db:fn:stop`                |
| Installer   | `pnpm tauri:build` — desktop bundle (local only)                                                          |
| Edge        | `solve`, `run_mutations`, `admin-create-user`, `admin-users`                                              |
| Venue       | Web = cloud when online (fallback local); Tauri UI toggle                                                 |

---

## Domain map

| Concept                                            | Where                                                                                                                                                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LP model + schema_version                          | `src/lib/domain/`                                                                                                                                                                                                                                   |
| solve / run_mutations                              | `src/lib/solver/` + Edge                                                                                                                                                                                                                            |
| Methods `lp` / `ipm` / `ga` × `engine`             | `src/lib/solver/` (`contract`, `registry`, `run`, `methods/*`); Edge `_shared/solver/`                                                                                                                                                              |
| Native LP (two-phase simplex + traces)             | `src/lib/solver/methods/lp/simplex.ts` + `native.ts` (Edge mirror under `_shared/solver/methods/lp/`)                                                                                                                                               |
| Sensitivity ranges (RHS / cⱼ from B⁻¹) + charts    | `src/lib/solver/shared/sensitivity-ranges.ts`; UI `SensitivityRangesTables`, `WhatIfDeltaZChart` (+ `delta-z-chart.ts` short labels / nice scale), `ResourceParametricChart` in `WhatIfPanel`                                                       |
| Plan rounding (UI post)                            | `src/lib/display/roundPlan.ts` + `roundPref.ts`                                                                                                                                                                                                     |
| Number display (2 decimals)                        | `src/lib/display/formatNumber.ts` (`formatPlanNumber`; re-exported from `components/model/format-plan-number`)                                                                                                                                      |
| Compute venue                                      | `src/lib/solver/venue.ts`                                                                                                                                                                                                                           |
| Guest slot                                         | `src/lib/db/guest.ts`                                                                                                                                                                                                                               |
| Audit writes                                       | `src/lib/db/audit.ts`                                                                                                                                                                                                                               |
| Soft-delete / restore                              | `src/lib/db/soft-delete.ts` (+ toast undo: `src/lib/ui/toast-undo.ts`, optimistic list: `src/lib/ui/optimistic-delete.ts`)                                                                                                                          |
| Share grant by email/UUID                          | RPC `share_grant_by_identifier` (`081_…`); grantee SELECT + soft-lock + comments ACL (`082_share_grant_access_lock`); `src/lib/db/share-grant.ts`; UI `SharePanel` + task page                                                                      |
| Shared result / task viewer                        | `ResultViewer`, `SharedTaskViewer`; `/share/[token]` uses `AppShell` + `get_shared_node` / comment RPCs (`083_share_public_comments`); grantee/locked on `/app/task/[id]`                                                                           |
| Clipboard + copy toast                             | `src/lib/ui/clipboard.ts`                                                                                                                                                                                                                           |
| Task / template cards                              | `TaskPreviewCard`, `TemplatePreviewCard`, `ScenarioCardGrid`                                                                                                                                                                                        |
| Task org / share panels                            | `OrgAttachPanel`, `SharePanel`                                                                                                                                                                                                                      |
| Inline alerts                                      | `src/lib/components/ui/InlineAlert.svelte`                                                                                                                                                                                                          |
| Task draft (pre-solve)                             | `src/lib/db/task-draft.ts` + `/app/create`                                                                                                                                                                                                          |
| Public template uses                               | `src/lib/db/template-uses.ts`                                                                                                                                                                                                                       |
| Template publish / moderation RPCs                 | `src/lib/db/template-publish.ts`                                                                                                                                                                                                                    |
| Create / open solve node + blank personal template | `src/lib/db/create-solve-node.ts` (`createBlankPersonalTemplate`)                                                                                                                                                                                   |
| UI kit (prefer these)                              | `src/lib/components/ui/` — Button, Card, Input, Select, Modal, Tabs, Badge, PageHeader, EmptyState, CardIconButton, `matrix/`                                                                                                                       |
| Model solve controls                               | `src/lib/components/model/` — LpModelMatrix, PlanSolveControls, SolveResultPanel, SolveWorkspace, WhatIfPanel, WhatIfInteractivePanel, `solve-session.svelte.ts`, `interactive-preview.svelte.ts`                                                   |
| Geometry / GA details                              | `src/lib/components/model/visualization/` (GeometryPanel, SceneCanvas, ViewGizmo, adapters); `GaStepsPanel`, `MethodComparisonPanel`                                                                                                                |
| GA presets / compare                               | `src/lib/solver/methods/ga/presets.ts`, `src/lib/solver/compare.ts`, `src/lib/solver/regenerate.ts`                                                                                                                                                 |
| Toasts (`svelte-sonner`)                           | `<Toaster />` in `src/routes/+layout.svelte`                                                                                                                                                                                                        |
| Cartesia tokens                                    | `src/app.css` `@theme`                                                                                                                                                                                                                              |
| Units of measure                                   | `model.resource_units` / `product_units` / `objective_unit`; tableau units row+col + «Ед. прибыли» in `LpModelMatrix`; derived tooltips; results/export `Name (unit)` via `src/lib/display/units.ts`; CSV meta line `Ед. прибыли` in `csv-model.ts` |
| CSV import / template                              | `src/lib/io/csv-model.ts` (tableau layout, `;`/`,` autodetect) + `ModelCsvActions` in `SolveWorkspace`                                                                                                                                              |
| Excel / PDF export                                 | `src/lib/io/export-result.ts` (+ `pdf-fonts.ts`, `fonts/` Noto Sans subset) + `ResultExportActions` in `SolveResultPanel`                                                                                                                           |

---

## Maintenance rule

When you add routes, Edge functions, migration shelves, or scripts → update **this file** in the same change set.
