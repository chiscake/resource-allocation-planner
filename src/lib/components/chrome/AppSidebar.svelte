<script lang="ts">
  import type { Component } from 'svelte';
  import { page } from '$app/state';
  import {
    Home,
    Plus,
    ListTodo,
    LayoutTemplate,
    Globe2,
    GitCompareArrows,
    GitFork,
    Trash2,
    Building2,
    Shield,
    ClipboardCheck,
    Lock,
  } from '@lucide/svelte';
  import { env } from '$env/dynamic/public';
  import { t, type RuKey } from '$lib/i18n';
  import { chrome, closeMobileNav } from '$lib/chrome/chrome.svelte';
  import { isOrgsUiEnabled } from '$lib/features';

  let {
    isAdmin = false,
    isMod = false,
    signedIn = false,
  }: {
    isAdmin?: boolean;
    isMod?: boolean;
    signedIn?: boolean;
  } = $props();

  type NavItem = {
    href: string;
    label: RuKey;
    icon: Component;
    adminOnly?: boolean;
    modStaff?: boolean;
  };

  const publicItems: NavItem[] = [
    { href: '/app', label: 'home', icon: Home },
    { href: '/app/public-templates', label: 'publicTemplates', icon: Globe2 },
  ];

  const signedInPrimary: NavItem[] = [
    { href: '/app', label: 'home', icon: Home },
    { href: '/app/create', label: 'newTask', icon: Plus },
    { href: '/app/tasks', label: 'myTasks', icon: ListTodo },
    { href: '/app/templates', label: 'templates', icon: LayoutTemplate },
    { href: '/app/public-templates', label: 'publicTemplates', icon: Globe2 },
    { href: '/app/compare', label: 'compare', icon: GitCompareArrows },
    { href: '/app/graph', label: 'lineageGraph', icon: GitFork },
    { href: '/app/trash', label: 'trash', icon: Trash2 },
    { href: '/app/org', label: 'org', icon: Building2 },
    {
      href: '/app/moderation',
      label: 'moderation',
      icon: ClipboardCheck,
      modStaff: true,
    },
    { href: '/app/admin', label: 'admin', icon: Shield, adminOnly: true },
  ];

  const authOnlyItems: NavItem[] = [
    { href: '/app/tasks', label: 'myTasks', icon: ListTodo },
    { href: '/app/templates', label: 'templates', icon: LayoutTemplate },
    { href: '/app/compare', label: 'compare', icon: GitCompareArrows },
    { href: '/app/graph', label: 'lineageGraph', icon: GitFork },
    { href: '/app/trash', label: 'trash', icon: Trash2 },
    { href: '/app/org', label: 'org', icon: Building2 },
    {
      href: '/app/moderation',
      label: 'moderation',
      icon: ClipboardCheck,
      modStaff: true,
    },
    { href: '/app/admin', label: 'admin', icon: Shield, adminOnly: true },
  ];

  const showOrgs = isOrgsUiEnabled(env.PUBLIC_SHOW_ORGS);
  const isStaff = $derived(isAdmin || isMod);

  function visible(item: NavItem): boolean {
    return showOrgs || item.href !== '/app/org';
  }

  function staffVisible(item: NavItem): boolean {
    if (item.adminOnly && !isAdmin) return false;
    if (item.modStaff && !isStaff) return false;
    return true;
  }

  const primary = $derived(
    signedIn ? signedInPrimary.filter((item) => visible(item) && staffVisible(item)) : publicItems,
  );

  const locked = $derived(
    signedIn
      ? []
      : authOnlyItems.filter((item) => visible(item) && !item.adminOnly && !item.modStaff),
  );

  function isActive(href: string) {
    const path = page.url.pathname;
    if (href === '/app') {
      return (
        path === '/app' ||
        path === '/app/' ||
        path === '/app/guest' ||
        path.startsWith('/app/guest/')
      );
    }
    return path === href || path.startsWith(`${href}/`);
  }

  function onNavClick() {
    closeMobileNav();
  }
</script>

<aside
  id="app-sidebar"
  class={[
    'z-30 flex flex-col overflow-hidden border-border bg-bg',
    /* Mobile: top sheet under header — parent overflow + header z keep close slide from painting into header */
    'max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:border-b',
    'max-md:transition-[transform,opacity] max-md:duration-200 max-md:ease-[cubic-bezier(0.4,0,0.2,1)]',
    chrome.mobileNavOpen
      ? 'max-md:pointer-events-auto max-md:translate-y-0 max-md:opacity-100'
      : 'max-md:pointer-events-none max-md:-translate-y-full max-md:opacity-0',
    /* Desktop: left column — overflow clips labels while width animates */
    'md:relative md:h-full md:shrink-0 md:border-r md:translate-y-0 md:opacity-100 md:pointer-events-auto md:transition-[width] md:duration-200 md:ease-[cubic-bezier(0.4,0,0.2,1)]',
    chrome.navCollapsed
      ? 'md:w-[calc(var(--chrome-pad-x)*2+var(--chrome-control-size))]'
      : 'md:w-56',
  ]}
  aria-label={t('toggleNav')}
>
  <nav class="flex flex-1 flex-col gap-0.5 py-2" style="padding-inline: var(--chrome-pad-x)">
    {#each primary as item (item.href)}
      {@const Icon = item.icon}
      {@const active = isActive(item.href)}
      <a
        href={item.href}
        class={[
          'flex items-center rounded-md text-sm font-medium transition-colors duration-200',
          active ? 'bg-selected-bg text-brand' : 'text-text hover:bg-surface',
          'max-md:gap-1',
          chrome.navCollapsed ? 'md:gap-0' : 'md:gap-1',
        ]}
        title={chrome.navCollapsed ? t(item.label) : undefined}
        aria-current={active ? 'page' : undefined}
        onclick={onNavClick}
      >
        <span
          class="inline-flex shrink-0 items-center justify-center"
          style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span
          class={[
            'truncate pr-2',
            'max-md:inline',
            chrome.navCollapsed ? 'md:hidden' : 'md:inline',
          ]}
        >
          {t(item.label)}
        </span>
      </a>
    {/each}

    {#if locked.length}
      <div class={['mt-3 mb-1', chrome.navCollapsed ? 'md:mx-auto md:w-full' : '']}>
        <p
          class={[
            'px-2 text-[10px] font-medium tracking-wide text-text-faint uppercase text-nowrap',
            chrome.navCollapsed ? 'md:hidden' : '',
          ]}
        >
          {t('navAfterLogin')}
        </p>
        {#if chrome.navCollapsed}
          <div class="mx-auto hidden h-px w-6 bg-border md:block my-1.75" aria-hidden="true"></div>
        {/if}
      </div>
      {#each locked as item (item.href)}
        {@const Icon = item.icon}
        <a
          href="/login"
          class={[
            'flex items-center rounded-md text-sm font-medium text-text-faint transition-colors duration-200 hover:bg-surface hover:text-text-soft',
            'max-md:gap-1',
            chrome.navCollapsed ? 'md:gap-0' : 'md:gap-1',
          ]}
          title="{t(item.label)} — {t('login')}"
          onclick={onNavClick}
        >
          <span
            class="inline-flex shrink-0 items-center justify-center"
            style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span
            class={[
              'min-w-0 flex-1 truncate pr-1',
              'max-md:inline',
              chrome.navCollapsed ? 'md:hidden' : 'md:inline',
            ]}
          >
            {t(item.label)}
          </span>
          <span
            class={[
              'inline-flex shrink-0 items-center justify-center pr-2 text-text-faint',
              'max-md:inline',
              chrome.navCollapsed ? 'md:hidden' : 'md:inline',
            ]}
            aria-hidden="true"
          >
            <Lock size={14} strokeWidth={1.75} />
          </span>
        </a>
      {/each}
    {/if}
  </nav>
</aside>
