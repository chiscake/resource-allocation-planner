# ROADMAP — resource-allocation-planner

Course project: client-server **Resource Allocation Planner** (UI: «Планировщик распределения ресурсов»).

**Canon for shipped status / scope.** Schema: `docs/data-model.md`. Agent rules: `AGENTS.md`. Map: `docs/AGENT_NAV.md`. Backlog: `docs/TODO-later.md`.

**Ports:** Vite **5400**, HMR **5401** (block 5400–5409 reserved in `Labs/AGENTS.md`).

**Production (web):** https://resource-allocation-planner-taupe.vercel.app · Vercel Production tracks branch **`dev`**.

---

## Shipped (current)

- SvelteKit + pnpm + Tauri shell; static adapter; Cartesia tokens in `src/app.css`.
- Auth (no public signup); guest local slot → upload on login; draft create → persist on first solve.
- Domain DB + RLS shelves `000`–`080` (incl. template uses, share notify RPC, `pg_cron` purge).
- Solver: LP (simplex) + IPM + GA + DLN locally and on Edge; what-if children; plan rounding UI; venue cloud/local.
- Product surfaces: home, tasks, task editor, templates / public catalog, compare, trash, notifications (poll 60s), admin, share-by-token.
- Data I/O: CSV model import (tableau layout, `;`/`,`, units) + model CSV download/template; Excel / PDF result export (plan, resources, what-if).
- Units of measure: editable units row/column in the LP matrix; shown in results and exports.
- UI flags (`src/lib/features.ts`): `PUBLIC_SHOW_DLN`, `PUBLIC_SHOW_ORGS` — both off by default; organizations remain in schema/RLS but are hidden in the UI.
- UI kit under `src/lib/components/ui/` + model controls (`LpModelMatrix`, `PlanSolveControls`, `SolveResultPanel`).
- Preflight gates + Cursor hooks for cloud mutate; seed via `pnpm seed:users` / `seed:users:cloud`.

**Not shipped / deferred:** Realtime notifications, full Edge≡local golden parity in CI, desktop installer artifact in CI (`pnpm tauri:build` local). Geometry panel (2D/3D/4D projections) ships for LP results. See `docs/TODO-later.md`.

**Pre-prod compatibility:** while the `schema_version` rule lives at the top of `AGENTS.md`, breaking changes → `db reset` (no dual readers).

---

## Tree (as built)

Keep in sync with `docs/AGENT_NAV.md` when this drifts.

```
resource-allocation-planner/
├── AGENTS.md
├── ROADMAP.md
├── package.json                 # pnpm: dev, check, test, preflight*, db:*, seed:*, tauri:*
├── scripts/preflight.mjs
├── scripts/seed-users.mjs
├── src/
│   ├── app.css                  # Tailwind v4 + Cartesia @theme
│   ├── lib/
│   │   ├── domain/
│   │   ├── solver/              # contract/registry + methods × engine (+ tests)
│   │   ├── display/             # roundPlan / roundPref (UI post-process)
│   │   ├── api/                 # Edge transport
│   │   ├── db/                  # supabase, guest, soft-delete, drafts, …
│   │   ├── components/          # chrome/, model/, ui/, …
│   │   ├── i18n/                # ru
│   │   ├── io/                  # CSV import, Excel/PDF export
│   │   └── …
│   └── routes/
│       ├── +page.svelte         # marketing + guest CTA
│       ├── login/, onboarding/, share/[token]/
│       └── app/                 # authenticated shell
│           ├── create/, tasks/, task/[id]/
│           ├── templates/, public-templates/
│           ├── compare/, trash/, org/ (flagged), notifications/, admin/
├── supabase/
│   ├── migrations/000…080
│   ├── functions/               # solve, run_mutations, admin-create-user
│   └── seed.sql                 # noop; users via seed:users
├── src-tauri/
└── docs/                        # AGENT_NAV, data-model, DESIGN, COMMIT_WORKFLOW, TODO-later, course/
```

Local backend one-shot: **`pnpm db:reset`**.

---

## Phase history (done)

Abbreviated; do not treat as a build queue.

| Phase | Outcome |
| ----- | ------- |
| **P0** Scaffold & contracts | Kit + ports + types + migration shelves + dual adapter path |
| **P1** Domain DB + auth | RLS/org/domain; seed users; guest upload; signup_seed |
| **P2** Solver MVP | Edge + local solve/mutations; what-if; Task 13 local tests |
| **P3** Product surfaces | Home/lists, org/share/fork, notifications poll, admin, compare |
| **P4** Ship | UI kit + purge cron + Vercel web; GA/IPM beyond placeholders; Tauri build local |

---

## Out of scope / post-MVP

Canon backlog: **[`docs/TODO-later.md`](docs/TODO-later.md)**. Edit that file, not a second list here.

---

## References

| Doc                           | Role                          |
| ----------------------------- | ----------------------------- |
| `docs/data-model.md`          | Schema canon                  |
| `docs/TODO-later.md`          | Post-MVP backlog              |
| `docs/AGENT_NAV.md`           | Paths / entrypoints           |
| `docs/COMMIT_WORKFLOW.md`     | Git / Vercel / Supabase ship  |
| `docs/DESIGN.md`              | Cartesia visual tokens        |
| `docs/course/assignment.md`   | Task 13                       |
| `docs/course/requirements.md` | Course deliverables           |
| `Labs/ИБМЗКИ/lab1`            | Admin Edge pattern (read-only)|
