# TODO — deferred past MVP

**English.** Single backlog of work **not** in MVP. Prefer editing this file over scattering new “later” bullets across START / ROADMAP / data-model.

MVP still delivers: dual solver, what-if children, share/trash/audit, notifications **table + UI**, guest slot, compare, installer, admin create-user, LP tests, CSV import, Excel/PDF export, units. Organizations stay in schema/RLS but the UI is hidden behind `PUBLIC_SHOW_ORGS` (off by default).

---

## Notifications (delivery)

| Phase     | Mechanism                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- |
| **MVP**   | Client **poll** of `notifications` every **60s** (plus refresh on navigate / focus — optional) |
| **Later** | Supabase **Realtime** on `notifications` (replace or supplement poll)                          |

- [ ] Realtime subscription for inbox / unread badge

---

## Auth & accounts

- [x] Public self-signup
- [ ] OAuth / social login
- [ ] 2FA
- [ ] Invite-code productization beyond seed / Dashboard create (if needed)

---

## Roles & public catalog

- [x] App role / flow **`mod`** — user-driven public repo + moderation
- [ ] Org role **`org_mod`**
- [ ] Notification type **`org_invite`**
- [ ] Richer audit UI filters (app-`admin` / `org_owner`)

---

## Data model & sharing extras

- [ ] Live template ↔ node link (today: snapshot only)
- [ ] `source_id` on templates (explicitly rejected for MVP)
- [ ] `batch_id` for grouped what-if / runs
- [ ] Share **sensitivity-child** nodes (MVP: root + children fork as decided; no child-only share productization)
- [ ] `jsonb` payloads on `audit_events` (MVP: typed columns only)
- [ ] Full write-ACL beyond hide / soft-delete rules already fixed
- [ ] Org-trash restore UX by `org_owner` (canon restore = task owner → forced `private`)

---

## Solver / compute

- [ ] SSE / WebSocket streaming for what-if progress (MVP: `solve` then `run_mutations`)
- [ ] Heavy async job worker (`accepted` / queue) beyond reject gates
- [x] Evolutionary / GA solver as real method — shipped (presets, traces, compare)
- [ ] Richer 4D visualization beyond the shipped LP geometry panel (2D/3D/4D projections); prototype under `.tmp/`

---

## schema_version / migrations policy

- [ ] Lift AGENTS “no bump / no backward-compat” rule when user asks
- [ ] Dual readers / compat migrations for old `model` shapes

---

## Product / UX polish

- [ ] Re-enable organizations UI (`PUBLIC_SHOW_ORGS=true`) once org flows are productized (admin org CRUD, invites)
- [ ] Excel (`.xlsx`) model import — today CSV only

- [ ] Locales beyond **ru** (i18n layout exists; more locales later)
- [ ] Full Cartesia application to every screen (spec: `DESIGN.md`; apply incrementally)
- [ ] Billing / quotas
- [ ] Compare UI for N ≫ 2 (MVP table may support N ids; default UI focus = 2)

---

## Course / agent scope (do not do unless asked)

- [ ] Course report / PDF / presentation authored by agents
- [ ] Fine-grained Cursor hooks beyond current `.cursor/rules` (optional later)

---

## Shipping extras (optional after P4 core)

- [ ] Vercel (or other) hosted web profile — optional, not blocking installer
- [ ] Extra ports in 5402–5409 for second Vite profile if needed

---

## How to use

1. When grilling defers something → **add a checkbox here**.
2. Keep one-line pointers in `ROADMAP.md` / `data-model.md` (“see TODO-later”), do not fork the list.
3. Moving an item into MVP → tick/remove here and update ROADMAP phase text.
