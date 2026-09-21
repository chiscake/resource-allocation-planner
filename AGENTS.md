# AGENTS.md — resource-allocation-planner

Agent instructions for this project. **This file overrides** `Labs/AGENTS.md` where they conflict (see [Overrides](#overrides)).

Human product copy / UI strings: Russian. **Agent docs in this repo (`AGENTS.md`, `docs/AGENT_NAV.md`): English only.**

Canonical decisions: `.tmp/START.md` (grill freeze) + [`docs/data-model.md`](docs/data-model.md). Navigation map: [`docs/AGENT_NAV.md`](docs/AGENT_NAV.md) — **update AGENT_NAV when the tree or entrypoints change**.

---

## Overrides

Relative to workspace root `Labs/AGENTS.md`:

| Topic                        | Labs root               | This project                                                                               |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Tests                        | Do not run unless asked | **Unit tests are required**; run `pnpm test` after non-trivial solver/domain/RLS changes   |
| schema / model compatibility | (none)                  | **No backward-compat** while the schema_version rule below exists; breaking → `db reset`   |
| Ports                        | Discipline formula      | **5400–5409** reserved (Vite/HMR default **5400/5401**) — see root AGENTS reserved table   |
| App canvas `#f3f3f3`         | Labs default            | **Cartesia** via `docs/DESIGN.md` (bg tokens) when styling UI                              |
| Write scope                  | Target lab folder       | `resource-allocation-planner/` (+ root AGENTS only when user asks, already done for ports) |
| Report writing               | —                       | Do **not** write the course report unless the user explicitly asks                         |

Project-specific Cursor hooks / rule packs for Overrides may be added later by the user.

---

## Product

- **Name:** Resource Allocation Planner / UI title «Планировщик распределения ресурсов»
- **Stack:** SvelteKit + Supabase (Auth, Postgres, RLS, Edge Functions) + Tauri installer; dual adapters (static/Tauri app shell vs Vercel web entry)
- **Core domain:** LP resource-allocation templates + `solve_nodes` tree (depth ≤ 1) + what-if + orgs + sharing
- **Default case:** Task 13 as `signup_seed` template; blank via Create

---

## schema_version rule (hard)

`model` JSON documents include `schema_version`.

**While this rule exists in AGENTS.md:**

1. Do **not** bump `schema_version`.
2. Do **not** implement backward-compatible migrations or dual readers for old model shapes.
3. Breaking schema/model/DB changes → **`supabase db reset`** (and recreate local guest data). Remove or rewrite this rule only when the user explicitly changes compatibility policy.

---

## Supabase migrations

- Files: `supabase/migrations/NNN_name.sql` — **exactly three digits**, then underscore, then name.
- Major shelves use **step 10**; use `011`, `012`, … for same-shelf refinements.

| Prefix | Shelf                                  |
| ------ | -------------------------------------- |
| `000`  | base tables                            |
| `010`  | RLS baseline                           |
| `011+` | specific RLS refinements               |
| `020`  | auth / profiles / admin helpers        |
| `030`  | organizations + membership             |
| `040`  | domain (`templates`, `solve_nodes`, …) |
| `050`  | sharing + notifications + audit        |
| `060`  | trash / `pg_cron` purge                |
| `070+` | spare                                  |

Follow [`docs/data-model.md`](docs/data-model.md); do not invent parallel ownership models.

---

## Ports & titles

- Vite: **5400**, HMR: **5401**, `strictPort: true`
- Window / document title: **Планировщик распределения ресурсов** (or agreed short form if space-constrained — prefer full title)
- **Visual design:** Cartesia canon in [`docs/DESIGN.md`](docs/DESIGN.md). Apply on UI work (see `.cursor/rules/design-system.mdc`). Overrides Labs canvas `#f3f3f3` in favor of DESIGN background tokens.

---

## Dev commands (expected after scaffold)

Prefer scripts from `package.json` when present. Typical:

- `pnpm install` / `pnpm dev` / `pnpm check` / `pnpm test` / `pnpm tauri:dev` / `pnpm tauri:build`
- Supabase: local CLI + Edge Functions as in sibling Labs projects (e.g. ИБМЗКИ lab1 patterns for `admin-create-user`)

---

## Architecture pointers (do not duplicate full model here)

| Need                                     | Read                 |
| ---------------------------------------- | -------------------- |
| Tables, RLS intent, orgs, sharing, trash | `docs/data-model.md` |
| Post-MVP / deferred backlog              | `docs/TODO-later.md` |
| Visual design / theme tokens (Cartesia)  | `docs/DESIGN.md`     |
| Decisions / MVP scope                    | `.tmp/START.md`      |
| Assignment / course requirements         | `docs/course/`       |
| Where code lives                         | `docs/AGENT_NAV.md`  |
| Plan / phases / folder tree              | `ROADMAP.md`         |

**Solve contract:** shared TS types; Edge + local dual solver; `solve` then `run_mutations`; statuses `done | rejected_too_large | accepted`.

**Roles:** app `admin` ≠ `org_owner`; org members `org_owner | member`.

---

## Testing

- Canon: `pnpm test` (Vitest or project equivalent once scaffolded).
- LP Edge ≡ local LP on golden fixtures (seed from `.tmp/task13_results.json` / `task13_solve.py` when imported).
- GA/heuristic: feasibility / gap vs LP — **not** equality to simplex.
- New solver method in the app ⇒ tests for it.

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
