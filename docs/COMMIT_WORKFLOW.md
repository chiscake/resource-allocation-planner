# COMMIT_WORKFLOW — resource-allocation-planner

**English only.** Agent playbook for commits, pushes, and cloud sync (Git + Vercel + Supabase).

Load this file when committing, pushing, merging `dev`↔`main`, deploying, or applying cloud migrations / Edge Functions.

---

## Branch contract

| Branch | Role                                         | Cloud effect (current)                                                                                                                               |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`  | Day-to-day integration. Default work branch. | **Vercel Production** tracks `dev` (observed: `target: production`, `githubCommitRef: dev`). Domain: `resource-allocation-planner-taupe.vercel.app`. |
| `main` | Release / promote-only. Not for feature WIP. | Currently **behind** `dev` (scaffold tip). No Production deploys from `main` yet.                                                                    |

**Default for agents:** commit and push on `dev` unless the user explicitly asks for `main` / a release promote.

**Promote to** `main`**:** merge (or PR) `dev` → `main` only after `pnpm preflight:main` passes and cloud side effects for that release are done (migrations + Edge if needed).

**Future alignment (optional, user-driven):** move Vercel Production branch to `main` and keep `dev` as Preview. Until then, treat a push to `dev` as a Production deploy.

IDs (stable):

| System           | Value                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Git remote       | `https://github.com/chiscake/resource-allocation-planner.git`                                                                         |
| Vercel project   | `resource-allocation-planner` · `prj_FEfptnBOPciinOXeJWH2kVa0YMBZ` · team `team_ckOvirT02aXnOIlmcftan5Jt` / slug `chiscakes-projects` |
| Supabase project | `ktdxdqnhjitolfpcztds` (RAP MCP: `user-supabase RAP`)                                                                                 |

Never commit: `.env*`, `.env.cloud`, `.vercel/`, `supabase/.temp/`.

---

## Tool map (MCP vs CLI)

Prefer **MCP** for inspect / status / advisors. Prefer **CLI** for local stack and file-backed deploys that match repo layout.

### Git / GitHub / Origin

| Need                              | Prefer                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Status, commit, push              | Shell `git` (user must ask to commit)                                                                                      |
| Watch PR comments / CI after push | MCP `cursor-subscriptions` → `subscribe_github_pr` / `subscribe_github_ci` / `subscribe_origin_pr` / `subscribe_origin_ci` |
| Open PR                           | Shell `gh` when available; else report URL manually                                                                        |

After push: subscribe to the **pushed branch** (not only `main`). Default-branch CI subscriptions are one-shot.

### Vercel — MCP `user-vercel`

| Need                                      | Tool                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Project / domains                         | `get_project` (`idOrName`: project id or name, `teamId`)             |
| Deploy list by branch/sha                 | `list_deployments` (`projectId`, `branch`, `sha`, `target`, `state`) |
| One deploy                                | `get_deployment`                                                     |
| Build/runtime failure                     | `get_runtime_logs`, `get_runtime_errors`, `list_deployment_events`   |
| Env names (no secret values unless asked) | `get_project_env` / `filter_project_envs`                            |

### Vercel — CLI `vercel`

| Need                                           | Command                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| Link check                                     | `vercel link` (already linked → `.vercel/`)         |
| Who am I / project                             | `vercel whoami`, `vercel project ls`                |
| Manual deploy (rare; Git integration is canon) | `vercel deploy` / `vercel --prod` only if user asks |
| Env pull (local)                               | `vercel env pull` — do not commit the file          |

Canon path: **push to Git → Vercel auto-build**. Do not dual-deploy the same SHA via CLI unless the user wants a one-off.

### Supabase — MCP `user-supabase RAP` (project-scoped)

| Need                         | Tool                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| Migration inventory on cloud | `list_migrations`                                                          |
| Apply DDL (careful)          | `apply_migration` — prefer repo files + CLI `db push` for numbered shelves |
| Tables / advisors / logs     | `list_tables`, `get_advisors`, `get_logs`                                  |
| Edge list / deploy           | `list_edge_functions`, `deploy_edge_function`                              |
| Branching (unused today)     | `list_branches`, `create_branch`, `merge_branch`, … — empty until enabled  |

### Supabase — CLI `supabase`

| Need                                    | Command                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Local                                   | `pnpm db:start` / `pnpm db:reset` / `pnpm db:fn:serve` / `pnpm db:fn:stop` |
| Diff cloud vs local migrations          | `supabase migration list`                                                  |
| Push migrations to linked project       | `supabase db push`                                                         |
| Deploy Edge from `supabase/functions/*` | `supabase functions deploy <name>`                                         |
| Link                                    | `supabase link --project-ref ktdxdqnhjitolfpcztds`                         |

**Migration canon:** author SQL under `supabase/migrations/NNN_name.sql` (see `AGENTS.md`), verify locally with `db reset`, then push. Prefer CLI `db push` over MCP `apply_migration` so filenames stay the source of truth. MCP `apply_migration` is for hotfixes when the user explicitly wants MCP DDL — then still add the matching `NNN_*.sql` file in the same change set.

**Edge canon:** edit under `supabase/functions/`, test with `pnpm db:fn:serve`, deploy with CLI `supabase functions deploy` (or MCP `deploy_edge_function` with the same source). Always keep `verify_jwt: true` unless the user overrides.

---

## Change-class matrix

Detect from the diff what class(es) apply, then run the matching gates.

| Class                   | Paths (examples)                            | Before commit on `dev`                                                                                                                        | Before promote / `main`                                                                                   |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **A — app only**        | `src/`**, `static/**`, CSS                  | `pnpm preflight`                                                                                                                              | `pnpm preflight:main`                                                                                     |
| **B — schema**          | `supabase/migrations/`\*\*                  | Local `db reset` (or equivalent) green + `pnpm preflight`; **do not push migrations to cloud until user OK** unless they asked to ship schema | Cloud `list_migrations` / `supabase migration list` matches repo; `supabase db push` done; advisors clean |
| **C — Edge**            | `supabase/functions/`\*\*                   | Local `functions serve` smoke if changed; `pnpm preflight`                                                                                    | `supabase functions deploy` for each changed function                                                     |
| **D — seed / env docs** | `scripts/seed-users.mjs`, `.env.example`    | `pnpm preflight`; never stage real secrets                                                                                                    | Cloud seed only if user asks (`pnpm seed:users:cloud`)                                                    |
| **E — agent docs**      | `AGENTS.md`, `docs/AGENT_NAV.md`, this file | Update AGENT_NAV if tree/entrypoints changed                                                                                                  | Same                                                                                                      |

Completion criterion for any class: staged set contains no ignored secret paths; Conventional Commit message ready; preflight exit 0.

---

## Sequence — commit / push on `dev`

1. **Confirm branch:** `git branch --show-current` → expect `dev` (or a short-lived feature branch that will merge into `dev`).
2. **Classify** the diff (matrix above). Update `docs/AGENT_NAV.md` if routes/scripts/Edge/migrations shelves changed.
3. **Local gates:** `pnpm preflight` (runs `check` + `test` + secret-path scan). Fix until green.
4. **Schema/Edge (if B/C):** prove locally (`pnpm db:reset` / serve). **Cloud push/deploy only when the user asked to ship backend** — not every app commit.
5. **Commit** (only if the user asked): Conventional Commits, e.g. `feat(ui): …`, `fix(solver): …`, `chore(db): …`.
6. **Push** `origin dev` (or feature → open PR into `dev`).
7. **Verify Vercel:** MCP `list_deployments` with `projectId=prj_FEfptnBOPciinOXeJWH2kVa0YMBZ`, `branch=dev`, `teamId=team_ckOvirT02aXnOIlmcftan5Jt` — wait for `READY` (or diagnose `ERROR` via runtime logs). Optional: `subscribe_github_ci` / `subscribe_origin_ci` on that branch if checks exist.
8. **If B/C were shipped:** MCP `list_migrations` / `list_edge_functions` + `get_advisors` to confirm cloud matches the commit.

Done when: commit is on remote, Production deploy for that SHA is `READY` (or user accepted a non-deploy commit), and any requested cloud DB/Edge steps are confirmed.

---

## Sequence — promote / commit on `main`

Use when the user asks to release, freeze, or land on `main`.

1. **Start from clean** `dev` **tip** that already passed the `dev` sequence (including cloud B/C if this release needs them).
2. **Run** `pnpm preflight:main` (stricter: preflight + migration filename lint + reminds cloud sync).
3. **Cloud parity checklist** (must be true or explicitly waived by user):

- `supabase migration list` / MCP `list_migrations` ≡ files in `supabase/migrations/`
- Changed Edge functions deployed
- `get_advisors` has no new critical issues from this release
- Latest Vercel Production for the release SHA is `READY`

4. **Merge** `dev` → `main` (ff or PR). Prefer PR if review/CI is desired.
5. **Push** `main`. Do not force-push `main`.
6. **Post-merge:** if Production still tracks `dev`, note that `main` is the git freeze only. If Production was switched to `main`, confirm deploy via `list_deployments` (`branch=main`, `target=production`).

Done when: `main` points at the intended SHA and the cloud checklist for that release is satisfied or waived.

---

## Hooks — where they belong

### A. Agent script (always) — `pnpm preflight`

Canon gate agents run before commit. Implemented in `scripts/preflight.mjs`. No install step beyond `pnpm install`.

**Order:** `git add` relevant paths **then** `pnpm preflight` — the secret-path scan uses `git diff --cached`; running preflight before staging skips that check.

### B. Cursor hooks (project) — `.cursor/hooks.json`

| Event                  | Purpose                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beforeShellExecution` | Deny staging/committing secret paths; **ask** on `git push` to `main`, `git push --force`, `supabase db push`, `supabase functions deploy`, `vercel --prod` / `vercel deploy --prod` |
| `beforeMCPExecution`   | **Ask** on MCP `apply_migration`, `deploy_edge_function`, destructive branch merge/reset                                                                                             |

These gate agents in Cursor; they do not replace `pnpm preflight`.

### C. Git hooks (optional, humans + any tool)

If you want the same gates outside Cursor, add `simple-git-hooks` (or husky):

| Hook         | Command                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `pre-commit` | `node scripts/preflight.mjs --quick` (secret scan only)                                               |
| `pre-push`   | `node scripts/preflight.mjs` (full) on `dev`; `node scripts/preflight.mjs --main` when pushing `main` |

Install only when the user asks — keeps agent-only workflows light.

### D. Subscriptions (post-push, not hooks)

After a push you care about: `subscribe_github_ci` / `subscribe_origin_ci` on that branch, or poll Vercel `list_deployments` by `sha`. End the turn and wait for the notification when using subscriptions.

---

## Anti-patterns

- Pushing to `main` for routine UI work while Production still tracks `dev`.
- Applying cloud migrations via MCP without a matching `supabase/migrations/NNN_*.sql` file.
- Committing `.env.cloud` / service role keys.
- Treating Labs root “skip tests” as applying here — tests are required (`AGENTS.md` Overrides).
- Manual `vercel --prod` for the same SHA Git already builds, unless debugging the Git integration.
