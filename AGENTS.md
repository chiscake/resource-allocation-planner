# AGENTS.md — resource-allocation-planner

Agent instructions for this project. **This file overrides** `Labs/AGENTS.md` where they conflict (see [Overrides](#overrides)).

---

## schema_version rule (hard) — find/delete here

`model` JSON documents include `schema_version`.

**While this rule exists in AGENTS.md** (project is pre-prod; full local **and cloud** `db reset` is allowed):

1. Do **not** bump `schema_version`.
2. Do **not** implement backward-compatible migrations or dual readers for old model shapes.
3. Breaking schema/model/DB changes → **`supabase db reset`** (local and/or cloud when the user asks) and recreate guest/seed data. Remove or rewrite this rule only when the user explicitly changes compatibility policy.

---

Human product copy / UI strings: Russian (see [UI copy](#ui-copy-russian)). **Agent docs in this repo (`AGENTS.md`, `docs/AGENT_NAV.md`, `ROADMAP.md`, `COMMIT_WORKFLOW.md`): English only.**

Canonical status / shipped scope: [`ROADMAP.md`](ROADMAP.md). Schema: [`docs/data-model.md`](docs/data-model.md). Navigation map: [`docs/AGENT_NAV.md`](docs/AGENT_NAV.md) — **update AGENT_NAV when the tree or entrypoints change**.

**Commits / push / Vercel / Supabase cloud ship:** follow [`docs/COMMIT_WORKFLOW.md`](docs/COMMIT_WORKFLOW.md). Run `pnpm preflight` **after staging** before committing on `dev`; `pnpm preflight:main` before promote/`main`. Default work branch is `dev` (also current Vercel Production).

---

## Overrides

Relative to workspace root `Labs/AGENTS.md`:

| Topic                        | Labs root               | This project                                                                                               |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tests                        | Do not run unless asked | **Ignore Labs skip-tests.** Run `pnpm test` after non-trivial **solver** changes (see [Testing](#testing)) |
| schema / model compatibility | (none)                  | **No backward-compat** while the schema_version rule above exists; breaking → `db reset`                   |
| Ports                        | Discipline formula      | **5400–5409** reserved (Vite/HMR default **5400**/**5401**) — see root AGENTS reserved table               |
| App canvas `#f3f3f3`         | Labs default            | **Cartesia** via `docs/DESIGN.md` (bg tokens) when styling UI                                              |
| Write scope                  | Target lab folder       | `resource-allocation-planner/` (+ root AGENTS only when user asks, already done for ports)                 |
| Report writing               | —                       | Do **not** write the course report unless the user explicitly asks                                         |

---

## Product

- **Name:** Resource Allocation Planner / UI title «Планировщик распределения ресурсов»
- **Stack:** SvelteKit + Supabase (Auth, Postgres, RLS, Edge Functions) + Tauri installer; dual adapters (static/Tauri app shell vs Vercel web entry)
- **Core domain:** LP resource-allocation templates + `solve_nodes` tree (depth ≤ 1) + what-if + orgs + sharing
- **Default case:** Task 13 as `signup_seed` template; blank via Create

---

## UI copy (Russian)

All user-visible strings go through `$lib/i18n` (`ru.ts` + `t()`). Do not leave hardcoded Russian (or English) in routes for headers, empty states, hints, or toasts when a key can exist.

**Audience:** end user of the planner — **never** the developer working the ticket.

Two tones:

| Surface                                            | Tone                                          | Examples                                         |
| -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Home / marketing leads, login upsell               | Product: what the user gets                   | `homeGuestHint`, `homeLoginUpsellBody`           |
| Method blurbs, control hints, page secondary lines | Instrument: what the control/page does, short | `methodPlanHint`, page `PageHeader` descriptions |

**Forbidden in UI copy:** `pnpm` / CLI, file paths, `Math.*`, schema jargon (`soft-delete`, `корневые`, `прогоны` as eng-calque), raw `UUID`, `/app/...` routes, seed scripts, implementation notes aimed at the assignee.

Established product lexicon may stay (e.g. «Форкнуть», «Z max») — do not invent new EN jargon. Details + before/after: `.cursor/rules/ui-copy.mdc`.

**Visual vs voice:** Cartesia tokens from `docs/DESIGN.md` + `app.css`. **Ignore DESIGN §11 English marketing voice** for app strings. Prefer `src/lib/components/ui/*` over one-off controls.

---

## Supabase migrations

- Files: `supabase/migrations/NNN_name.sql` — **exactly three digits**, then underscore, then name.
- Major shelves use **step 10**; use `011`, `012`, … for same-shelf refinements.

| Prefix | Shelf                                     |
| ------ | ----------------------------------------- |
| `000`  | base tables                               |
| `010`  | RLS baseline                              |
| `011+` | specific RLS refinements                  |
| `020`  | auth / profiles / admin helpers           |
| `030`  | organizations + membership                |
| `040`  | domain (`templates`, `solve_nodes`, …)    |
| `011`  | RLS helpers (`is_mod`, `is_admin_or_mod`) |
| `021`  | profiles role `mod`                       |
| `042`  | template publish_status + moderation RPCs |
| `050`  | sharing + notifications + audit           |
| `060`  | trash / `pg_cron` purge                   |
| `070+` | spare                                     |

Follow [`docs/data-model.md`](docs/data-model.md); do not invent parallel ownership models.

---

## Ports & titles

- Vite: **5400**, HMR: **5401**, `strictPort: true`
- Window / document title: **Планировщик распределения ресурсов** (or agreed short form if space-constrained — prefer full title)
- **Visual design:** Cartesia canon in [`docs/DESIGN.md`](docs/DESIGN.md). Apply on UI work (see `.cursor/rules/design-system.mdc`). Overrides Labs canvas `#f3f3f3` in favor of DESIGN background tokens.

---

## Dev commands

Prefer scripts from `package.json`:

- `pnpm install` / `pnpm dev` / `pnpm check` / `pnpm test` / `pnpm tauri:dev` / `pnpm tauri:build`
- Local backend one-shot: **`pnpm db:reset`** (`start` + `db reset` + `seed:users` + `db:fn:serve`) — there is no `supabase:local` script. Edge serve: `pnpm db:fn:serve` / stop: `pnpm db:fn:stop`
- Pre-commit gates: `pnpm preflight` · `pnpm preflight:quick` · `pnpm preflight:main` — see [`docs/COMMIT_WORKFLOW.md`](docs/COMMIT_WORKFLOW.md). Secret scan uses the **index**; stage files before `preflight`.

---

## Architecture pointers (do not duplicate full model here)

| Need                                     | Read                 |
| ---------------------------------------- | -------------------- |
| Tables, RLS intent, orgs, sharing, trash | `docs/data-model.md` |
| Post-MVP / deferred backlog              | `docs/TODO-later.md` |
| Visual design / theme tokens (Cartesia)  | `docs/DESIGN.md`     |
| Shipped status / scope                   | `ROADMAP.md`         |
| Assignment / course requirements         | `docs/course/`       |
| Where code lives                         | `docs/AGENT_NAV.md`  |

**Solve contract:** shared TS types; Edge + local dual solver; `solve` then `run_mutations`; statuses `done | rejected_too_large | accepted`.

**Roles:** app `admin` ≠ `org_owner`; org members `org_owner | member`.

---

## Testing

- Canon: `pnpm test` (Vitest under `src/**/*.test.ts`).
- **Required:** new or changed **solver method** ⇒ unit tests for it. After non-trivial solver edits → `pnpm test`.
- **UI / routes:** `pnpm check` after non-trivial Svelte work (Labs “analyzer” habit applies here as check).
- **RLS / domain DB / Edge:** no automated suite yet — verify manually or via `pnpm db:reset`; do not invent ad-hoc test harnesses unless asked.
- **Edge ≡ local parity:** **deferred** — local Vitest only for now; do not claim or implement Edge golden parity until explicitly requested.
- GA/heuristic: feasibility / gap vs LP — **not** equality to simplex.

---

## Security / auth

- No public self-signup; Register control disabled in UI.
- Seed users via `.env` + script after db reset; admin creates users via Edge Function (ИБМЗКИ lab1 style).
- RLS from day one; size gates on solve; audit_events **without jsonb**.

---

## Tauri build

- `src-tauri/.cargo/config.toml` sets `rustc-wrapper = "sccache"` (same as Labs Tauri labs). Keep it when touching Cargo config.

---

## Propose new agent rules (when useful)

When you notice a **recurring** constraint, convention, or footgun that is not already covered by `AGENTS.md`, `docs/AGENT_NAV.md`, or `.cursor/rules/`, **propose** a new rule to the user before adding it.

Include in the proposal:

1. **What** — short rule text (or `.mdc` sketch: alwaysApply vs globs).
2. **Why** — the failure mode / token or bug cost it prevents.
3. **Where** — `AGENTS.md` (project-wide) vs `.cursor/rules/*.mdc` (glob-scoped) vs AGENT_NAV pointer only.
4. **Cost** — whether it should be always-loaded (expensive) or path-triggered (cheap).

Do **not** silently grow alwaysApply rules. Prefer glob-scoped `.mdc` or a one-line pointer in AGENTS. Wait for user OK unless they already asked you to add that rule.

---

## Do not

- Write the explanatory report / PDF unless asked.
- Treat Labs root “skip tests” as applying here.
- Add `source_id` on templates, `batch_id` what-if, or live template↔node links.
- Use Kit `+server` for solve logic (Edge + client lib); keep Tauri/`adapter-static` viable.
