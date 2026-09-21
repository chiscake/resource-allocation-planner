# ROADMAP — resource-allocation-planner

Course project: client-server **Resource Allocation Planner** (UI: «Планировщик распределения ресурсов»).

Decisions: `.tmp/START.md`. Schema: `docs/data-model.md`. Agent rules: `AGENTS.md`. Map: `docs/AGENT_NAV.md`.

**Ports:** Vite **5400**, HMR **5401** (block 5400–5409 reserved in `Labs/AGENTS.md`).

---

## Target tree (approximate)

```
resource-allocation-planner/
├── AGENTS.md
├── ROADMAP.md
├── package.json                 # pnpm
├── svelte.config.js             # dual build profiles (app static / web)
├── vite.config.ts               # port 5400 / hmr 5401
├── src/
│   ├── app.html
│   ├── routes/
│   │   ├── (app)/               # authenticated / guest shell
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte     # home: create / favorites / recent / templates
│   │   │   ├── nodes/[id]/
│   │   │   ├── compare/
│   │   │   ├── templates/
│   │   │   ├── public-templates/
│   │   │   ├── trash/
│   │   │   ├── org/
│   │   │   ├── admin/
│   │   │   └── notifications/
│   │   ├── (auth)/
│   │   ├── (marketing)/         # web profile: home + download CTA
│   │   └── share/[token]/
│   ├── lib/
│   │   ├── domain/              # model types, schema_version, what_if helpers
│   │   ├── solver/              # shared solve + run_mutations (local impl)
│   │   ├── api/                 # Edge client wrappers
│   │   ├── db/                  # supabase client, local guest store adapters
│   │   ├── i18n/                # ru resources (+ config for more locales)
│   │   └── platform/            # tauri vs web gates
│   └── ...
├── src-tauri/                   # installer target
├── supabase/
│   ├── migrations/              # NNN_name.sql step-10 shelves
│   ├── functions/               # solve, run_mutations, admin-create-user, …
│   └── seed.sql
├── tests/                       # or src/**/*.test.ts — pick one in scaffold
├── docs/
│   ├── AGENT_NAV.md
│   ├── data-model.md
│   └── course/
│       ├── assignment.md
│       └── requirements.md
└── .tmp/                        # scratch: START, golden LP, DESIGN, 4D demo
```

Refine `docs/AGENT_NAV.md` when folders actually appear.

---

## Phases

### P0 — Scaffold & contracts

- SvelteKit + pnpm + Tauri skeleton; dual adapter profiles (app: onboarding→app; web: home+download).
- Ports 5400/5401; titles; i18n resource layout (ru).
- Shared TS: `SolveRequest` / `SolveResponse`, model + `schema_version`, limits config.
- Spike LP library on Edge + local parity path.
- Supabase project wiring; migration shelves starting `000_base`.

**Done when:** empty app runs web+tauri; types compile; `pnpm check` clean.

### P1 — Domain DB + auth

- Migrations: base → RLS → auth/admin helpers → org → domain tables (`templates`, `solve_nodes`, …).
- Seed admin+2 from `.env`; Edge `admin-create-user`.
- Signup_seed copy on user create; public_repo readable; Create = blank.
- Guest slot: localStorage / SQLite; always upload on login.

**Done when:** login works; create personal root node; RLS smoke-tested.

### P2 — Solver MVP

- Edge `solve` + `run_mutations`; duals always; size/time gates; reject statuses.
- Local solver same contract (offline / oversize).
- UI: edit model → solve → results (plan, Z, duals, critical resources).
- What-if: defaults from `model.what_if_defaults`; replace children on re-run.
- Golden tests from `.tmp/task13_*` (LP Edge ≡ local).

**Done when:** Task 13 base + a/b/c sensitivity match golden within float tol; tests green.

### P3 — Product surfaces

- Home lists; favorites; sensitivity screen; compare table (N ids, UI=2).
- Org attach + checkbox public; hide/show; org_owner hide-only; dual trash; notify on org delete.
- Share link + grant + fork (root+children); unshare rules; audit_events (no jsonb); UI warning on org links.
- First-run wizard; Register disabled.
- Admin UI: users + system templates.

**Done when:** demo path for defense: login → task 13 → solve → what-if → org/share story.

### P4 — Ship

- Placeholders: GA tab, 4D viz (from `.tmp` later).
- Tauri **installer** build; optional Vercel static/web profile.
- `pnpm check` + `pnpm test`; purge via `pg_cron`.
- Update `docs/AGENT_NAV.md` to match reality.

**Done when:** installer artifact + reproducible demo; AGENT_NAV accurate.

---

## Out of scope (until asked) — O1.3 draft

Derived from START “later” list; refine anytime:

- Course report / PDF / presentation authoring by agents
- Public self-signup / OAuth / 2FA
- User-driven public repo + moderation (`mod`)
- `org_mod` ACL; billing/quotas
- Heavy async compute worker (`accepted` job) beyond contract stub
- SSE/WebSocket what-if streaming
- `source_id`, `batch_id`, live template↔node links
- schema_version bump / backward-compat layers
- Full DESIGN.md / Cartesia application to every screen (spec lives in `docs/DESIGN.md`; apply incrementally on UI work)

---

## Suggested build order (first week)

1. Scaffold + ports + AGENTS/ROADMAP already here
2. `000`–`040` migrations + seed
3. Solver spike + golden test
4. Minimal solve UI for task 13
5. Auth + guest upload
6. What-if children
7. Org/share only after 1–6 solid

---

## References

| Doc                           | Role                                            |
| ----------------------------- | ----------------------------------------------- |
| `.tmp/START.md`               | Decision log                                    |
| `docs/data-model.md`          | Schema canon                                    |
| `docs/course/assignment.md`   | Task 13                                         |
| `docs/course/requirements.md` | Course deliverables                             |
| `Labs/ИБМЗКИ/lab1`            | Admin Edge Function pattern (read-only example) |
