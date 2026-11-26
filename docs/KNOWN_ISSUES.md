# KNOWN_ISSUES — resource-allocation-planner

**English.** Open product/engineering gaps that are **not** fixed yet. Prefer a short entry here over burying notes in chat. Post-MVP backlog that is intentionally deferred stays in [`TODO-later.md`](TODO-later.md).

When you fix an item, delete or strike it and update call sites if needed.

---

## Offline / multi-device sync

### Stale local overwrite vs newer cloud (tasks)

**Symptom / risk:** Device A and Device B both hold a task that was last synced at T0 (e.g. 00:00). Web (A) edits and saves successfully at T1 (00:10). Desktop (B) still shows the T0 snapshot (no refresh), the user edits that stale copy and saves at T2 (00:20). Today a blind save can overwrite the newer cloud version without warning.

**Desired fix:** Before persisting a dirty/local save to the cloud, do a **probe** (e.g. fetch `updated_at` / etag for the row). If cloud `updated_at` is newer than the local baseline the editor started from, show a conflict UI that surfaces **local vs cloud** timestamps (and ideally enough context to choose keep-local / take-cloud / merge later). Same idea may apply to personal templates once they support multi-device dirty saves.

**Related:** Conflict modal already exists for some dirty-cache vs server-load cases on `/app/task/[id]`; this issue is specifically **save-time** comparison against a fresher cloud revision when the local client never reloaded.

---
