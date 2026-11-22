# Модель данных (черновик)

Источник: согласованная схема (исторически grill R0–R5d). Не DDL-миграция. Статус продукта: [`../ROADMAP.md`](../ROADMAP.md); жёсткие правила: [`../AGENTS.md`](../AGENTS.md).

---

## Термины ролей (закреплено)

| Термин          | Где                     | Смысл                                                                  |
| --------------- | ----------------------- | ---------------------------------------------------------------------- |
| **`admin`**     | уровень **приложения**  | Пользователи платформы, системные шаблоны, каталог + модерация         |
| **`mod`**       | уровень **приложения**  | Публичный каталог шаблонов + очередь модерации (без create-user)       |
| **`org_owner`** | уровень **организации** | Привилегии org (корзина org, hide чужих публичных задач, audit org, …) |
| **`member`**    | организация             | Обычный участник                                                       |
| **`org_mod`**   | later                   | Модератор внутри org                                                   |

В MVP в `profiles.role` / JWT `app_metadata.role`: **`admin` \| `mod` \| `user`**.  
В MVP в `organization_members.role`: **`org_owner` \| `member`**. Отдельной org-роли `admin` нет (`org_owner` закрывает этот контур).  
App-`admin` ≠ `org_owner`. App-`mod` делит с admin управление публичным каталогом.

---

## Принципы

- `model` jsonb + обязательный **`schema_version`**.
- При create из шаблона в `model` копируется **`what_if_defaults`** ← `templates.what_if` (без живой связи).
- Дерево `solve_nodes`, depth ≤ 1.
- Soft-delete + корзина **30 дней** → hard purge **`pg_cron`**.
- `comparisons` — hard delete only.
- Create расчёта всегда **личный** (`org_id` null) → явное «В организацию».
- **`what_if` → UI defaults → `mutation`** на child (см. ниже).

### `what_if` ↔ `mutation`

1. Template: `what_if`.
2. Create корня → `model.what_if_defaults` = копия.
3. UI sensitivity читает defaults, юзер правит %.
4. Per generation: child `kind=what_if_base` (снимок исходных `model`/`result`/`solver_meta`) + children `kind=sensitivity` (`mutation` + model после apply), общий `what_if_generation`.
5. Корень: `active_what_if_generation` — какой шаг «Текущий» (`null` = анализ на текущем шаге не делался; виртуальный слот пейджера + empty copy).
6. Re-run with sensitivity: soft-delete live `sensitivity` + `what_if_base`, новый gen, `active` → новый.
7. Restore из «Прошлый»: корень ← base-снимок; undelete kids+base выбранного gen; soft-delete прочих live; `active` → этот gen.
8. Interactive explorer (UI tab): one `Mutation` + `solve`; **«В таблицу»** appends a `sensitivity` child to the **active** gen, or creates gen 1 (`what_if_base` + one child) when `active` was null. Duplicates by `kind+target+delta` rejected. Past steps: interactive write disabled.

### AGENTS / `schema_version`

Пока в AGENTS правило «не бампить / без compat» — breaking → **`db reset`**, версию не бампить.

### AGENTS / миграции Supabase

Файлы: **`NNN_name.sql`** (3 цифры). Крупные полки с **шагом 10**; внутри полки `011`, `012`, … Шкала полок — в START/ROADMAP при freeze.

---

## Организации

### `organizations` / `organization_members`

| `organization_members.role` | MVP   |
| --------------------------- | ----- |
| `org_owner`                 | Да    |
| `member`                    | Да    |
| `org_mod`                   | Later |

### Привязка и видимость (`org_id` + `org_visibility`)

| `org_id` | `org_visibility` | Смысл                                                                            |
| -------- | ---------------- | -------------------------------------------------------------------------------- |
| `NULL`   | `NULL`           | Чисто личная задача                                                              |
| set      | `private`        | В контексте org, **видит только `owner_id` узла** (и не org_owner чужие private) |
| set      | `org`            | Публично **внутри** организации (все members)                                    |

**UI списки:** личные · мои org-`private` · org-`org` (общая лента).

**«В организацию»:** кнопка + **чекбокс** «сделать публичным внутри организации»:

- чекбокс off → `org_id` + `org_visibility=private`
- чекбокс on → `org_id` + `org_visibility=org`

**Уже в организации (владелец задачи):** кнопки **скрыть / показать** (`private` ↔ `org`).

**`org_owner`:** может **только скрыть** чужую задачу с `org_visibility=org` → `private`.  
**Не может** принудительно показать (`private` → `org`) чужую задачу.

Children **наследуют** `org_id` + `org_visibility` родителя; при смене у корня — каскад на детей.

### Soft-delete публичных org-задач (`org_visibility=org`)

- Soft-delete по-прежнему возможен (кто именно — node `owner_id` или `org_owner`, см. корзины).
- Если удаляет **`org_owner`** (не владелец узла) → notification владельцу задачи, тип вроде **`org_owner_deleted_node`**: «Владелец организации удалил ваш сценарий».
- Владелец задачи может **восстановить** из своей корзины → узел жив, но **`org_visibility` принудительно `private`**.

### Корзины (раздельные)

| Корзина        | Содержимое                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **User trash** | Soft-deleted узлы, где `owner_id = me` (в т.ч. удалённые org_owner’ом — с **меткой** «удалено организацией» / аналог) |
| **Org trash**  | Soft-deleted узлы этой org, видимые **`org_owner`**                                                                   |

Восстановление пользователем — по п. выше (после restore от org-delete → всегда `private`).  
Детали restore из org trash самим `org_owner` — только если понадобится позже; канон restore владельцем задачи описан.

### RLS (solve_nodes, чтение)

```text
owner_id = auth.uid()                                    -- свои, в т.ч. private
OR (org_id IN membership AND org_visibility = 'org')     -- общая лента
-- org_owner НЕ видит чужие org_visibility=private
```

Write/delete: владелец узла; `org_owner` — hide чужих public + soft-delete (с notify); не unhide чужих.

---

## `templates`

Без `source_id`. `system_kind`: `signup_seed` \| `public_repo` \| null.  
`publish_status`: `null` \| `pending` \| `approved`.

| Состояние     | `system_kind` | `publish_status` | Кто видит в каталоге |
| ------------- | ------------- | ---------------- | -------------------- |
| Личный        | `null`        | `null`           | —                    |
| Заявка        | `null`        | `pending`        | очередь admin/mod    |
| В каталоге    | `public_repo` | `approved`       | все (+ anon)         |
| `signup_seed` | `signup_seed` | `null`           | seed / admin         |

Переходы (RPC): `request_template_publish` → pending; `withdraw` / reject → личный; `moderate … approve` / `publish_template_direct` → каталог; `unpublish_template` (user-owned) → личный. Platform (`owner_id` null) из каталога — soft-delete admin/mod.  
Правка model: личный и pending; approved — сначала unpublish.  
App-`admin` и app-`mod` управляют каталогом. `owner_id` / `org_id` для user/org копий.

### `template_uses`

Per-user last use of a **`public_repo`** template (home «Последние шаблоны»).

| Поле                      | Смысл                                            |
| ------------------------- | ------------------------------------------------ |
| `user_id` + `template_id` | PK; CASCADE on user/template delete              |
| `last_used_at`            | upsert on «Использовать» (даже до первого solve) |

Личные шаблоны в миксе на главной — по `templates.updated_at` / optional use; public — только через эту таблицу.

---

## `solve_nodes`

Поля: `owner_id`, `org_id`, `org_visibility`, `parent_id`, `kind`, `title`, `model` (+ `schema_version`, `what_if_defaults`), `mutation`, `result`, `solver_meta`, `what_if_generation`, `active_what_if_generation` (корень), `is_favorite`, timestamps, `deleted_at`.

`kind` (app): `root` \| `sensitivity` \| `what_if_base` (и зарезервированный в доках `revision` — пока не пишется).

**CHECK:** `is_favorite = false OR parent_id IS NULL`.  
**CHECK (логика):** `org_id IS NULL ⇒ org_visibility IS NULL`; `org_id IS NOT NULL ⇒ org_visibility IN ('private','org')`.

Допустимый update: title, favorite, org attach/visibility, soft-delete — не перепись model/result корня.  
**Title** можно менять и после расчёта (UI: inline rename).

---

## `node_comments`

Комментарии к узлу: план и/или результат. Ревизии — отдельные `solve_nodes` (`kind=revision`), комментарии живут на их `node_id`.

| Поле        | Смысл                       |
| ----------- | --------------------------- |
| `node_id`   | узел (корень / ревизия / …) |
| `author_id` | автор                       |
| `scope`     | `plan` \| `result`          |
| `body`      | текст (trim, non-empty)     |
| timestamps  | `created_at`, `updated_at`  |

**RLS:** select как у видимости `solve_nodes`; insert — кто видит живой узел; update/delete — автор (или app-`admin`).

---

## `comparisons`

`owner_id`, `org_id`, `node_ids`, timestamps. Без soft-delete.

---

## Sharing

| Ресурс                 | Unshare                                                  |
| ---------------------- | -------------------------------------------------------- |
| Личный (`org_id` null) | Дубль + soft-delete старого корня                        |
| Org                    | Только revoke link / remove grants — **узел не удалять** |

Share-link на org-корнях **разрешён** + **UI warning**.

Direct grant: UI принимает **email или UUID**; серверный RPC `share_grant_by_identifier` резолвит получателя, пишет `share_grants` + notification + audit. Ответ при валидном формате обезличен (нет «пользователь не найден»).

Fork: корень+дети; при org у источника — модалка личное | в org.

При soft-delete корня с активным share: **в одной транзакции** revoke links/grants + audit + delete.

---

## `solver_mismatch_events`

Узкий лог расхождений native vs library (без jsonb). Пишется клиентом после фоновой сверки.

| Поле                                    | Смысл                    |
| --------------------------------------- | ------------------------ |
| `actor_id`                              | кто считал               |
| `solve_node_id`                         | корень (nullable)        |
| `method`                                | обычно `lp`              |
| `label`                                 | `root` или label мутации |
| `native_z` / `library_z` / `max_abs_dx` | числа                    |

RLS: select/insert своих; app-admin — все. UI-браузера нет (alert + console).

---

## `audit_events` (без jsonb)

Фиксированные колонки, **без `payload jsonb`**, чтобы не раздувать БД.

| Поле                                | Смысл                                             |
| ----------------------------------- | ------------------------------------------------- |
| `id`                                | uuid                                              |
| `created_at`                        | timestamptz                                       |
| `actor_id`                          | uuid                                              |
| `org_id`                            | uuid null — для org-scoped событий                |
| `action`                            | text/enum (см. ниже)                              |
| `entity_type`                       | text (`solve_nodes`, `share_links`, …)            |
| `entity_id`                         | uuid                                              |
| `target_user_id`                    | uuid null (владельц узла / получатель grant)      |
| `visibility_from` / `visibility_to` | text null (`private`/`org`/…)                     |
| …                                   | при необходимости ещё 1–2 узких колонки, не jsonb |

**MVP actions (основные):** create/delete решений; visibility/attach; share link/grant create/revoke.  
Фильтры на UI — у app-`admin` и `org_owner` later/потом.

**RLS для `org_owner`:** видит строки audit **только** с `org_id` ∈ своих org, где он `org_owner`.  
App-`admin` — по политике платформы (шире), отдельно.

---

## `notifications`

| type (MVP+)                 | Когда                                              |
| --------------------------- | -------------------------------------------------- |
| `share_incoming`            | grant                                              |
| `template_publish_pending`  | user отправил шаблон на модерацию (всем admin/mod) |
| `template_publish_approved` | модератор одобрил заявку (автору)                  |
| `template_publish_rejected` | модератор отклонил заявку (автору)                 |
| `org_owner_deleted_node`    | org_owner soft-delete чужого сценария              |
| `org_invite`                | later (см. [`TODO-later.md`](TODO-later.md))       |

**Доставка в UI (закреплено):**

| Фаза      | Механизм                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| **MVP**   | **Poll** таблицы `notifications` раз в **60 с** (допустимо дополнительно: при навигации / focus окна) |
| **Later** | Supabase **Realtime** — см. [`TODO-later.md`](TODO-later.md)                                          |

---

## Auth / admin (app)

Публичный email signup (`auth.signUp`); seed (в т.ч. `mod@example.com`); Edge `admin-create-user` + `admin-users` (list / ban / delete); app-`admin`: users; app-`admin`/`mod`: публичный каталог + модерация.

---

## Гость / API solve

localStorage / SQLite; upload при логине; `solve` + `run_mutations`; лимиты START; проверка `schema_version`.

---

## Later / не MVP

Канон-список отложенного: **[`TODO-later.md`](TODO-later.md)** (не дублировать сюда длинный backlog).
