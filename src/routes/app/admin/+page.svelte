<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowDown, ArrowUp, Check, EllipsisVertical } from '@lucide/svelte';
  import { supabase } from '$lib/db/supabase';
  import { env } from '$env/dynamic/public';
  import { t } from '$lib/i18n';
  import { copyToClipboard } from '$lib/ui/clipboard';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';
  const PASSWORD_LENGTH = 12;
  const PAGE_SIZE = 50;

  type AdminUser = {
    id: string;
    email: string | null;
    display_name: string | null;
    role: string;
    created_at: string | null;
    last_sign_in_at: string | null;
    blocked: boolean;
  };

  type RoleFilter = 'admin' | 'mod' | 'user';
  type StatusFilter = 'active' | 'blocked';
  type SortKey =
    'display_name' | 'role' | 'email' | 'created_at' | 'last_sign_in_at' | 'blocked' | 'id';
  type SortDir = 'asc' | 'desc';

  type PendingMutation =
    | { kind: 'set_blocked'; user_ids: string[]; blocked: boolean }
    | { kind: 'delete'; user_ids: string[] }
    | { kind: 'set_role'; user_ids: string[]; role: 'user' | 'mod' };

  let isAdmin = $state(false);
  let currentUserId = $state<string | null>(null);
  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let createMsg = $state('');
  let usersMsg = $state('');
  let users = $state<AdminUser[]>([]);
  let selectedIds = $state<string[]>([]);
  let searchQuery = $state('');
  let roleFilters = $state<RoleFilter[]>([]);
  let statusFilters = $state<StatusFilter[]>([]);
  let page = $state(1);
  let sortKey = $state<SortKey>('created_at');
  let sortDir = $state<SortDir>('desc');
  // Hidden for now: system templates admin section.
  // let templates = $state<
  //   { id: string; title: string; system_kind: string | null }[]
  // >([]);
  // let editTitle = $state<Record<string, string>>({});

  let confirmOpen = $state(false);
  let confirmTitle = $state('');
  let confirmBody = $state('');
  let confirmLabel = $state('');
  let pendingMutation = $state<PendingMutation | null>(null);
  let confirming = $state(false);
  let menuOpenId = $state<string | null>(null);

  function sortValue(u: AdminUser, key: SortKey): string | number {
    switch (key) {
      case 'display_name':
        return (u.display_name ?? '').trim().toLowerCase();
      case 'role':
        return normalizedRole(u);
      case 'email':
        return (u.email ?? '').trim().toLowerCase();
      case 'created_at':
        return u.created_at ? Date.parse(u.created_at) || 0 : 0;
      case 'last_sign_in_at':
        return u.last_sign_in_at ? Date.parse(u.last_sign_in_at) || 0 : 0;
      case 'blocked':
        return u.blocked ? 1 : 0;
      case 'id':
        return u.id.toLowerCase();
    }
  }

  function compareUsers(a: AdminUser, b: AdminUser): number {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), 'ru');
    }
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return sortDir === 'asc' ? cmp : -cmp;
  }

  const filteredUsers = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = users.filter((u) => {
      if (q) {
        const name = (u.display_name ?? '').toLowerCase();
        const mail = (u.email ?? '').toLowerCase();
        const id = u.id.toLowerCase();
        if (!name.includes(q) && !mail.includes(q) && !id.includes(q)) {
          return false;
        }
      }
      if (roleFilters.length > 0) {
        const role = normalizedRole(u);
        if (role !== 'admin' && role !== 'mod' && role !== 'user') {
          return false;
        }
        if (!roleFilters.includes(role)) return false;
      }
      if (statusFilters.length > 0) {
        const status: StatusFilter = u.blocked ? 'blocked' : 'active';
        if (!statusFilters.includes(status)) return false;
      }
      return true;
    });
    return [...filtered].sort(compareUsers);
  });

  const pageCount = $derived(Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE)));
  const clampedPage = $derived(Math.min(Math.max(1, page), pageCount));
  const pagedUsers = $derived(
    filteredUsers.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
  );
  const pageRangeFrom = $derived(
    filteredUsers.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1,
  );
  const pageRangeTo = $derived(Math.min(clampedPage * PAGE_SIZE, filteredUsers.length));

  /** Actionable among current page rows only (select-all scope). */
  const actionableUsers = $derived(pagedUsers.filter((u) => isActionable(u)));
  const allActionableSelected = $derived(
    actionableUsers.length > 0 && actionableUsers.every((u) => selectedIds.includes(u.id)),
  );
  const someActionableSelected = $derived(actionableUsers.some((u) => selectedIds.includes(u.id)));

  /** No checkbox / block / unblock / delete for self or any admin (incl. other admins). */
  function isActionable(u: AdminUser): boolean {
    if (u.id === currentUserId) return false;
    if (u.role.trim().toLowerCase() === 'admin') return false;
    return true;
  }

  function userWho(u: AdminUser): string {
    return u.display_name?.trim() || u.email?.trim() || '—';
  }

  function formatDate(iso: string | null): string {
    if (!iso) return t('adminNeverSignedIn');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t('adminNeverSignedIn');
    return d.toLocaleString('ru-RU');
  }

  function shortId(id: string): string {
    if (id.length <= 14) return id;
    return `${id.slice(0, 8)}…${id.slice(-4)}`;
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = key === 'created_at' || key === 'last_sign_in_at' ? 'desc' : 'asc';
    }
    resetPage();
  }

  function sortHeaderClass(key: SortKey): string {
    const active = sortKey === key;
    return [
      'inline-flex cursor-pointer items-center gap-1 rounded-[4px] px-0.5 py-0.5 font-medium transition-colors hover:text-text',
      active ? 'text-text' : 'text-text-muted',
    ].join(' ');
  }

  function ariaSortFor(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  function copyCell(value: string | null | undefined) {
    const text = (value ?? '').trim();
    if (!text) return;
    void copyToClipboard(text);
  }

  function resetPage() {
    page = 1;
  }

  function clearSelection() {
    selectedIds = [];
  }

  function toggleSelected(id: string, checked: boolean) {
    if (checked) {
      if (!selectedIds.includes(id)) selectedIds = [...selectedIds, id];
    } else {
      selectedIds = selectedIds.filter((x) => x !== id);
    }
  }

  function toggleSelectAll(checked: boolean) {
    const pageIds = actionableUsers.map((u) => u.id);
    if (checked) {
      const set = new Set([...selectedIds, ...pageIds]);
      selectedIds = [...set];
    } else {
      selectedIds = selectedIds.filter((id) => !pageIds.includes(id));
    }
  }

  function toggleRoleFilter(role: RoleFilter) {
    if (roleFilters.includes(role)) {
      roleFilters = roleFilters.filter((r) => r !== role);
    } else {
      roleFilters = [...roleFilters, role];
    }
    resetPage();
  }

  function toggleStatusFilter(status: StatusFilter) {
    if (statusFilters.includes(status)) {
      statusFilters = statusFilters.filter((s) => s !== status);
    } else {
      statusFilters = [...statusFilters, status];
    }
    resetPage();
  }

  function filterToggleClass(selected: boolean): string {
    return [
      'inline-flex cursor-pointer items-center gap-1 rounded-[8px] border px-2.5 py-1 text-sm transition-colors',
      selected
        ? 'border-border bg-surface text-text'
        : 'border-border bg-transparent text-text hover:bg-bg-soft',
    ].join(' ');
  }

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: session } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.session?.access_token}`,
      apikey: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    };
  }

  async function callAdminUsers(body: Record<string, unknown>): Promise<{
    ok: boolean;
    status: number;
    data: Record<string, unknown>;
  }> {
    const res = await fetch(`${env.PUBLIC_SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, data: {} };
    }
    return { ok: res.ok, status: res.status, data };
  }

  async function loadUsers() {
    try {
      const { ok, data } = await callAdminUsers({ action: 'list' });
      if (!ok) {
        const err = typeof data.error === 'string' ? data.error.trim() : '';
        usersMsg = err || t('adminUsersUnavailable');
        users = [];
        clearSelection();
        return;
      }
      users = Array.isArray(data.users) ? (data.users as AdminUser[]) : [];
      selectedIds = selectedIds.filter((id) => users.some((u) => u.id === id && isActionable(u)));
    } catch {
      usersMsg = t('adminUsersUnavailable');
      users = [];
      clearSelection();
    }
  }

  // Hidden for now: system templates admin section.
  // async function reloadTemplates() {
  //   const { data: tpls } = await supabase
  //     .from("templates")
  //     .select("id, title, system_kind")
  //     .not("system_kind", "is", null);
  //   templates = (tpls ?? []) as typeof templates;
  //   for (const tpl of templates) editTitle[tpl.id] = tpl.title;
  // }

  onMount(async () => {
    const { data } = await supabase.auth.getUser();
    isAdmin = data.user?.app_metadata?.role === 'admin';
    currentUserId = data.user?.id ?? null;
    // await reloadTemplates();
    if (isAdmin) await loadUsers();
  });

  async function generatePassword() {
    const bytes = new Uint8Array(PASSWORD_LENGTH);
    crypto.getRandomValues(bytes);
    password = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
    try {
      await navigator.clipboard.writeText(password);
      createMsg = t('adminPasswordCopied');
    } catch {
      createMsg = t('adminPasswordGenerated');
    }
  }

  async function createUser() {
    createMsg = '';
    try {
      const res = await fetch(`${env.PUBLIC_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ email, password, display_name: displayName }),
      });

      let body: { email?: string; error?: string } = {};
      try {
        body = await res.json();
      } catch {
        createMsg = t('adminCreateUserUnavailable');
        return;
      }

      if (res.ok) {
        createMsg = t('adminUserCreated', { email: body.email ?? email });
      } else {
        createMsg = body.error?.trim() ? body.error : t('adminCreateUserUnavailable');
      }
      await loadUsers();
    } catch {
      createMsg = t('adminCreateUserUnavailable');
    }
  }

  // Hidden for now: system templates admin section.
  // async function saveTemplate(id: string) {
  //   const title = editTitle[id];
  //   if (!title) return;
  //   await supabase
  //     .from("templates")
  //     .update({ title, updated_at: new Date().toISOString() })
  //     .eq("id", id);
  //   usersMsg = `Шаблон ${id.slice(0, 8)}… обновлён`;
  //   await reloadTemplates();
  // }

  function openConfirm(title: string, body: string, label: string, mutation: PendingMutation) {
    confirmTitle = title;
    confirmBody = body;
    confirmLabel = label;
    pendingMutation = mutation;
    confirmOpen = true;
  }

  function closeConfirm() {
    if (confirming) return;
    confirmOpen = false;
    pendingMutation = null;
  }

  function askBlockOne(u: AdminUser) {
    if (!isActionable(u)) return;
    menuOpenId = null;
    openConfirm(
      t('adminConfirmBlockTitle'),
      t('adminConfirmBlockBody', { who: userWho(u) }),
      t('adminBlock'),
      { kind: 'set_blocked', user_ids: [u.id], blocked: true },
    );
  }

  function askUnblockOne(u: AdminUser) {
    if (!isActionable(u)) return;
    menuOpenId = null;
    openConfirm(
      t('adminConfirmUnblockTitle'),
      t('adminConfirmUnblockBody', { who: userWho(u) }),
      t('adminUnblock'),
      { kind: 'set_blocked', user_ids: [u.id], blocked: false },
    );
  }

  function askDeleteOne(u: AdminUser) {
    if (!isActionable(u)) return;
    menuOpenId = null;
    openConfirm(
      t('adminConfirmDeleteTitle'),
      t('adminConfirmDeleteBody', { who: userWho(u) }),
      t('adminDeleteUser'),
      { kind: 'delete', user_ids: [u.id] },
    );
  }

  function normalizedRole(u: AdminUser): string {
    return u.role.trim().toLowerCase();
  }

  function askPromoteMod(u: AdminUser) {
    if (!isActionable(u) || normalizedRole(u) !== 'user') return;
    menuOpenId = null;
    openConfirm(
      t('adminConfirmPromoteTitle'),
      t('adminConfirmPromoteBody', { who: userWho(u) }),
      t('adminPromoteMod'),
      { kind: 'set_role', user_ids: [u.id], role: 'mod' },
    );
  }

  function askDemoteUser(u: AdminUser) {
    if (!isActionable(u) || normalizedRole(u) !== 'mod') return;
    menuOpenId = null;
    openConfirm(
      t('adminConfirmDemoteTitle'),
      t('adminConfirmDemoteBody', { who: userWho(u) }),
      t('adminDemoteUser'),
      { kind: 'set_role', user_ids: [u.id], role: 'user' },
    );
  }

  function toggleMoreMenu(id: string, event: MouseEvent) {
    event.stopPropagation();
    menuOpenId = menuOpenId === id ? null : id;
  }

  function closeMoreMenu() {
    menuOpenId = null;
  }

  function selectedActionableIds(): string[] {
    return selectedIds.filter((id) => {
      const u = users.find((row) => row.id === id);
      return u ? isActionable(u) : false;
    });
  }

  function askBulkBlock() {
    const ids = selectedActionableIds();
    if (ids.length === 0) {
      usersMsg = t('adminUsersNoneSelected');
      return;
    }
    openConfirm(
      t('adminConfirmBulkBlockTitle'),
      t('adminConfirmBulkBlockBody', { count: String(ids.length) }),
      t('adminBulkBlock'),
      { kind: 'set_blocked', user_ids: ids, blocked: true },
    );
  }

  function askBulkUnblock() {
    const ids = selectedActionableIds();
    if (ids.length === 0) {
      usersMsg = t('adminUsersNoneSelected');
      return;
    }
    openConfirm(
      t('adminConfirmBulkUnblockTitle'),
      t('adminConfirmBulkUnblockBody', { count: String(ids.length) }),
      t('adminBulkUnblock'),
      { kind: 'set_blocked', user_ids: ids, blocked: false },
    );
  }

  function askBulkDelete() {
    const ids = selectedActionableIds();
    if (ids.length === 0) {
      usersMsg = t('adminUsersNoneSelected');
      return;
    }
    openConfirm(
      t('adminConfirmBulkDeleteTitle'),
      t('adminConfirmBulkDeleteBody', { count: String(ids.length) }),
      t('adminBulkDelete'),
      { kind: 'delete', user_ids: ids },
    );
  }

  async function runConfirm() {
    if (!pendingMutation) return;
    confirming = true;
    usersMsg = '';
    const mutation = pendingMutation;
    const total = mutation.user_ids.length;
    try {
      const body =
        mutation.kind === 'set_blocked'
          ? {
              action: 'set_blocked' as const,
              user_ids: mutation.user_ids,
              blocked: mutation.blocked,
            }
          : mutation.kind === 'set_role'
            ? {
                action: 'set_role' as const,
                user_ids: mutation.user_ids,
                role: mutation.role,
              }
            : {
                action: 'delete' as const,
                user_ids: mutation.user_ids,
              };

      const { ok, data } = await callAdminUsers(body);
      if (!ok && typeof data.error === 'string' && data.error.trim()) {
        usersMsg = data.error.trim();
        confirmOpen = false;
        pendingMutation = null;
      } else if (!ok && !Array.isArray(data.results)) {
        usersMsg = t('adminUsersUnavailable');
        confirmOpen = false;
        pendingMutation = null;
      } else {
        const results = Array.isArray(data.results) ? (data.results as { ok?: boolean }[]) : [];
        const okCount = typeof data.ok === 'number' ? data.ok : results.filter((r) => r.ok).length;
        usersMsg = t('adminUsersActionDone', {
          ok: String(okCount),
          total: String(total),
        });
        clearSelection();
        confirmOpen = false;
        pendingMutation = null;
        await loadUsers();
      }
    } catch {
      usersMsg = t('adminUsersUnavailable');
      confirmOpen = false;
      pendingMutation = null;
    } finally {
      confirming = false;
    }
  }
</script>

<svelte:window onclick={closeMoreMenu} />

<section class="mx-auto max-w-6xl space-y-6">
  <PageHeader title={t('admin')} description={t('adminHint')} />

  {#if !isAdmin}
    <Card>
      <p class="text-sm text-text-muted">{t('adminDenied')}</p>
    </Card>
  {:else}
    <Card>
      <h2 class="mb-3 font-medium">{t('adminCreateUser')}</h2>
      <div class="space-y-3">
        <label class="flex flex-col gap-1 text-sm">
          <span>{t('email')}</span>
          <Input bind:value={email} type="email" autocomplete="off" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span>{t('adminDisplayName')}</span>
          <Input bind:value={displayName} autocomplete="off" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span>{t('password')}</span>
          <div class="flex items-center gap-2">
            <Input bind:value={password} type="text" autocomplete="new-password" class="flex-1" />
            <Button variant="secondary" type="button" onclick={generatePassword}>
              {t('adminGeneratePassword')}
            </Button>
          </div>
          <span class="text-xs text-text-muted">{t('adminPasswordOnceHint')}</span>
        </label>
        <div class="flex items-center justify-between gap-3">
          <p class="min-w-0 flex-1 text-sm text-text-muted">{createMsg}</p>
          <Button onclick={createUser}>{t('create')}</Button>
        </div>
      </div>
    </Card>

    <Card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-medium">{t('adminUsers')}</h2>
        {#if selectedIds.length > 0}
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="secondary" class="px-3! py-1.5! text-xs" onclick={askBulkBlock}>
              {t('adminBulkBlock')}
            </Button>
            <Button variant="secondary" class="px-3! py-1.5! text-xs" onclick={askBulkUnblock}>
              {t('adminBulkUnblock')}
            </Button>
            <Button variant="danger" class="px-3! py-1.5! text-xs" onclick={askBulkDelete}>
              {t('adminBulkDelete')}
            </Button>
          </div>
        {/if}
      </div>
      {#if usersMsg}
        <p class="mb-3 text-sm text-text-muted">{usersMsg}</p>
      {/if}

      <div class="mb-3 flex flex-col gap-3">
        <Input
          bind:value={searchQuery}
          type="search"
          placeholder={t('adminUsersSearchPlaceholder')}
          autocomplete="off"
          oninput={resetPage}
        />
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-text-muted">{t('adminFilterRoles')}</span>
            <button
              type="button"
              class={filterToggleClass(roleFilters.includes('admin'))}
              aria-pressed={roleFilters.includes('admin')}
              onclick={() => toggleRoleFilter('admin')}
            >
              {#if roleFilters.includes('admin')}
                <Check class="size-3.5 shrink-0" />
              {/if}
              {t('roleBadgeAdmin')}
            </button>
            <button
              type="button"
              class={filterToggleClass(roleFilters.includes('mod'))}
              aria-pressed={roleFilters.includes('mod')}
              onclick={() => toggleRoleFilter('mod')}
            >
              {#if roleFilters.includes('mod')}
                <Check class="size-3.5 shrink-0" />
              {/if}
              {t('roleBadgeMod')}
            </button>
            <button
              type="button"
              class={filterToggleClass(roleFilters.includes('user'))}
              aria-pressed={roleFilters.includes('user')}
              onclick={() => toggleRoleFilter('user')}
            >
              {#if roleFilters.includes('user')}
                <Check class="size-3.5 shrink-0" />
              {/if}
              {t('adminRoleUser')}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-text-muted">{t('adminFilterStatus')}</span>
            <button
              type="button"
              class={filterToggleClass(statusFilters.includes('active'))}
              aria-pressed={statusFilters.includes('active')}
              onclick={() => toggleStatusFilter('active')}
            >
              {#if statusFilters.includes('active')}
                <Check class="size-3.5 shrink-0" />
              {/if}
              {t('adminStatusActive')}
            </button>
            <button
              type="button"
              class={filterToggleClass(statusFilters.includes('blocked'))}
              aria-pressed={statusFilters.includes('blocked')}
              onclick={() => toggleStatusFilter('blocked')}
            >
              {#if statusFilters.includes('blocked')}
                <Check class="size-3.5 shrink-0" />
              {/if}
              {t('adminStatusBlocked')}
            </button>
          </div>
        </div>
      </div>

      {#if filteredUsers.length === 0}
        {#if users.length > 0}
          <p class="text-sm text-text-muted">{t('adminUsersEmptyFilter')}</p>
        {/if}
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-5xl border-collapse text-left text-sm">
            <thead>
              <tr class="border-b border-border text-text-muted">
                <th class="w-10 px-2 py-2 font-medium">
                  <input
                    type="checkbox"
                    class="accent-brand"
                    aria-label={t('adminSelectAll')}
                    checked={allActionableSelected}
                    indeterminate={someActionableSelected && !allActionableSelected}
                    disabled={actionableUsers.length === 0}
                    onchange={(e) => toggleSelectAll((e.currentTarget as HTMLInputElement).checked)}
                  />
                </th>
                <th class="px-2 py-2" aria-sort={ariaSortFor('display_name')}>
                  <button
                    type="button"
                    class={sortHeaderClass('display_name')}
                    onclick={() => toggleSort('display_name')}
                  >
                    {t('adminColName')}
                    {#if sortKey === 'display_name'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="px-2 py-2" aria-sort={ariaSortFor('role')}>
                  <button
                    type="button"
                    class={sortHeaderClass('role')}
                    onclick={() => toggleSort('role')}
                  >
                    {t('adminColRole')}
                    {#if sortKey === 'role'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="px-2 py-2" aria-sort={ariaSortFor('email')}>
                  <button
                    type="button"
                    class={sortHeaderClass('email')}
                    onclick={() => toggleSort('email')}
                  >
                    {t('adminColEmail')}
                    {#if sortKey === 'email'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="px-2 py-2" aria-sort={ariaSortFor('created_at')}>
                  <button
                    type="button"
                    class={sortHeaderClass('created_at')}
                    onclick={() => toggleSort('created_at')}
                  >
                    {t('adminColCreated')}
                    {#if sortKey === 'created_at'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="px-2 py-2" aria-sort={ariaSortFor('last_sign_in_at')}>
                  <button
                    type="button"
                    class={sortHeaderClass('last_sign_in_at')}
                    onclick={() => toggleSort('last_sign_in_at')}
                  >
                    {t('adminColLastSignIn')}
                    {#if sortKey === 'last_sign_in_at'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="w-38 min-w-38 px-2 py-2" aria-sort={ariaSortFor('blocked')}>
                  <button
                    type="button"
                    class={sortHeaderClass('blocked')}
                    onclick={() => toggleSort('blocked')}
                  >
                    {t('adminColStatus')}
                    {#if sortKey === 'blocked'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="px-2 py-2" aria-sort={ariaSortFor('id')}>
                  <button
                    type="button"
                    class={sortHeaderClass('id')}
                    onclick={() => toggleSort('id')}
                  >
                    {t('adminColId')}
                    {#if sortKey === 'id'}
                      {#if sortDir === 'asc'}
                        <ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
                      {:else}
                        <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
                      {/if}
                    {/if}
                  </button>
                </th>
                <th class="px-2 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {#each pagedUsers as u (u.id)}
                {@const actionable = isActionable(u)}
                {@const role = normalizedRole(u)}
                {@const name = u.display_name?.trim() || ''}
                {@const mail = u.email?.trim() || ''}
                <tr class="border-b border-border/60 align-middle">
                  <td class="px-2 py-2">
                    {#if actionable}
                      <input
                        type="checkbox"
                        class="accent-brand"
                        checked={selectedIds.includes(u.id)}
                        onchange={(e) =>
                          toggleSelected(u.id, (e.currentTarget as HTMLInputElement).checked)}
                      />
                    {/if}
                  </td>
                  <td class="px-2 py-2">
                    {#if name}
                      <button
                        type="button"
                        class="max-w-48 cursor-pointer truncate text-left hover:underline"
                        title={name}
                        aria-label={`${t('copyValue')}: ${name}`}
                        onclick={() => copyCell(name)}
                      >
                        {name}
                      </button>
                    {:else}
                      —
                    {/if}
                  </td>
                  <td class="px-2 py-2">{u.role}</td>
                  <td class="px-2 py-2">
                    {#if mail}
                      <button
                        type="button"
                        class="max-w-[16rem] cursor-pointer truncate text-left hover:underline"
                        title={mail}
                        aria-label={`${t('copyValue')}: ${mail}`}
                        onclick={() => copyCell(mail)}
                      >
                        {mail}
                      </button>
                    {:else}
                      —
                    {/if}
                  </td>
                  <td class="px-2 py-2 whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td class="px-2 py-2 whitespace-nowrap">
                    {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : t('adminNeverSignedIn')}
                  </td>
                  <td class="w-38 min-w-38 px-2 py-2">
                    {#if u.blocked}
                      <Badge variant="danger">{t('adminStatusBlocked')}</Badge>
                    {:else}
                      <Badge variant="success">{t('adminStatusActive')}</Badge>
                    {/if}
                  </td>
                  <td class="px-2 py-2">
                    <button
                      type="button"
                      class="cursor-pointer font-mono text-xs hover:underline"
                      title={u.id}
                      aria-label={`${t('copyValue')}: ${u.id}`}
                      onclick={() => copyCell(u.id)}
                    >
                      {shortId(u.id)}
                    </button>
                  </td>
                  <td class="px-2 py-2 text-right whitespace-nowrap">
                    {#if actionable}
                      <div class="relative inline-flex justify-end">
                        <Button
                          variant="ghost"
                          class="px-1.5! py-1!"
                          title={t('adminMoreActions')}
                          aria-label={t('adminMoreActions')}
                          aria-expanded={menuOpenId === u.id}
                          onclick={(e) => toggleMoreMenu(u.id, e)}
                        >
                          <EllipsisVertical class="size-4" />
                        </Button>
                        {#if menuOpenId === u.id}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div
                            class="absolute right-0 z-20 mt-1 min-w-56 rounded-[8px] border border-border bg-bg py-1 shadow-lg"
                            onpointerdown={(e) => e.stopPropagation()}
                          >
                            {#if role === 'user'}
                              <button
                                type="button"
                                class="block w-full cursor-pointer px-3 py-2 text-left text-sm text-text hover:bg-bg-soft"
                                onclick={() => askPromoteMod(u)}
                              >
                                {t('adminPromoteMod')}
                              </button>
                            {:else if role === 'mod'}
                              <button
                                type="button"
                                class="block w-full cursor-pointer px-3 py-2 text-left text-sm text-text hover:bg-bg-soft"
                                onclick={() => askDemoteUser(u)}
                              >
                                {t('adminDemoteUser')}
                              </button>
                            {/if}
                            {#if u.blocked}
                              <button
                                type="button"
                                class="block w-full cursor-pointer px-3 py-2 text-left text-sm text-text hover:bg-bg-soft"
                                onclick={() => askUnblockOne(u)}
                              >
                                {t('adminUnblock')}
                              </button>
                            {:else}
                              <button
                                type="button"
                                class="block w-full cursor-pointer px-3 py-2 text-left text-sm text-text hover:bg-bg-soft"
                                onclick={() => askBlockOne(u)}
                              >
                                {t('adminBlock')}
                              </button>
                            {/if}
                            <button
                              type="button"
                              class="block w-full cursor-pointer px-3 py-2 text-left text-sm text-danger-text hover:bg-bg-soft"
                              onclick={() => askDeleteOne(u)}
                            >
                              {t('adminDeleteUser')}
                            </button>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
          <span>
            {t('adminPageRange', {
              from: String(pageRangeFrom),
              to: String(pageRangeTo),
              total: String(filteredUsers.length),
            })}
          </span>
          <div class="flex items-center gap-2">
            <Button
              variant="secondary"
              class="px-3! py-1.5! text-xs"
              disabled={clampedPage <= 1}
              onclick={() => {
                page = Math.max(1, clampedPage - 1);
              }}
            >
              {t('adminPagePrev')}
            </Button>
            <Button
              variant="secondary"
              class="px-3! py-1.5! text-xs"
              disabled={clampedPage >= pageCount}
              onclick={() => {
                page = Math.min(pageCount, clampedPage + 1);
              }}
            >
              {t('adminPageNext')}
            </Button>
          </div>
        </div>
      {/if}
    </Card>
  {/if}

  <!-- Hidden for now: system templates admin section.
  <Card>
    <h2 class="mb-3 font-medium">{t("adminSystemTemplates")}</h2>
    <ul class="space-y-3 text-sm">
      {#each templates as tpl (tpl.id)}
        <li class="flex flex-wrap items-center gap-2">
          <span class="text-text-soft">({tpl.system_kind})</span>
          <Input
            class="min-w-48 flex-1"
            bind:value={editTitle[tpl.id]}
            disabled={!isAdmin}
          />
          {#if isAdmin}
            <Button
              variant="secondary"
              class="px-3! py-1.5! text-xs"
              onclick={() => saveTemplate(tpl.id)}
            >
              {t("save")}
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  </Card>
  -->
</section>

<Modal bind:open={confirmOpen} title={confirmTitle} onclose={closeConfirm}>
  <p class="text-sm text-text-muted">{confirmBody}</p>
  <div class="mt-6 flex justify-end gap-2">
    <Button variant="ghost" onclick={closeConfirm} disabled={confirming}>
      {t('cancel')}
    </Button>
    <Button
      variant={pendingMutation?.kind === 'delete' ||
      (pendingMutation?.kind === 'set_blocked' && pendingMutation.blocked)
        ? 'danger'
        : 'primary'}
      onclick={runConfirm}
      disabled={confirming}
    >
      {confirmLabel}
    </Button>
  </div>
</Modal>
