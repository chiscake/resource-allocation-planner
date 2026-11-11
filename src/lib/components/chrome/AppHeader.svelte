<script lang="ts">
  import { Menu, Bell, LogOut, LogIn } from "@lucide/svelte";
  import { page } from "$app/state";
  import { t } from "$lib/i18n";
  import {
    chrome,
    toggleNav,
    openNotifications,
  } from "$lib/chrome/chrome.svelte";

  let {
    userEmail = "",
    onLogout,
  }: {
    userEmail?: string;
    onLogout?: () => void;
  } = $props();

  const unreadLabel = $derived(
    chrome.unread > 99 ? "99+" : chrome.unread > 0 ? String(chrome.unread) : "",
  );

  const navExpanded = $derived(
    chrome.isMobile ? chrome.mobileNavOpen : !chrome.navCollapsed,
  );

  const navAriaLabel = $derived(
    chrome.isMobile
      ? chrome.mobileNavOpen
        ? t("closeNav")
        : t("openNav")
      : chrome.navCollapsed
        ? t("expandNav")
        : t("collapseNav"),
  );

  const listBack = $derived.by(() => {
    const routeId = page.route.id;
    if (routeId === "/app/task/[id]") {
      return { href: "/app/tasks", label: t("allTasks") };
    }
    if (routeId === "/app/templates/[id]") {
      return { href: "/app/templates", label: t("allTemplates") };
    }
    return null;
  });
</script>

<header
  class="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg"
  style="padding-inline: var(--chrome-pad-x)"
>
  <button
    type="button"
    class="inline-flex shrink-0 items-center justify-center rounded-[6px] text-text hover:bg-surface"
    style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
    aria-label={navAriaLabel}
    aria-expanded={navExpanded}
    aria-controls="app-sidebar"
    onclick={toggleNav}
  >
    <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
  </button>

  {#if listBack}
    <a
      href={listBack.href}
      class="truncate rounded-[6px] px-2 py-1.5 text-sm font-medium text-text-muted hover:bg-surface hover:text-text"
    >
      {listBack.label}
    </a>
  {/if}

  <div class="ml-auto flex items-center gap-1">
    <button
      id="chrome-notifications-trigger"
      type="button"
      class="relative inline-flex items-center justify-center rounded-[6px] text-text hover:bg-surface"
      style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
      aria-label={t("openNotifications")}
      aria-expanded={chrome.notificationsOpen}
      aria-haspopup="dialog"
      onclick={openNotifications}
    >
      <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
      {#if chrome.unread > 0}
        <span
          class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-medium text-white"
        >
          {unreadLabel}
        </span>
      {/if}
    </button>

    {#if userEmail}
      <span
        class="hidden max-w-[12rem] truncate px-2 text-sm text-text-muted sm:inline"
        >{userEmail}</span
      >
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-[6px] text-text hover:bg-surface"
        style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
        aria-label={t("logout")}
        onclick={() => onLogout?.()}
      >
        <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {:else}
      <a
        href="/login"
        class="inline-flex items-center justify-center rounded-[6px] text-text hover:bg-surface"
        style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
        aria-label={t("login")}
      >
        <LogIn size={20} strokeWidth={1.75} aria-hidden="true" />
      </a>
    {/if}
  </div>
</header>
