<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import type { User } from '@supabase/supabase-js';
  import { supabase } from '$lib/db/supabase';
  import { startDevicePresenceTracking } from '$lib/db/device-sessions';
  import AppHeader from '$lib/components/chrome/AppHeader.svelte';
  import AppSidebar from '$lib/components/chrome/AppSidebar.svelte';
  import DevQuickLoginBar from '$lib/components/chrome/DevQuickLoginBar.svelte';
  import NotificationsDrawer from '$lib/components/chrome/NotificationsDrawer.svelte';
  import { isDevQuickLoginEnabled } from '$lib/devQuickLogin';
  import { t } from '$lib/i18n';
  import { chrome, initChromeNav, closeMobileNav } from '$lib/chrome/chrome.svelte';

  let { children }: { children: Snippet } = $props();

  let userEmail = $state('');
  let userDisplayName = $state('');
  let authUserId = $state<string | null>(null);
  let userRole = $state<'admin' | 'mod' | 'user' | null>(null);
  let isAdmin = $state(false);
  let isMod = $state(false);
  let signedIn = $state(false);

  const showQuickLogin = isDevQuickLoginEnabled(env.PUBLIC_DEV_QUICK_LOGIN);

  function metaDisplayName(user: User): string {
    return typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name.trim()
      : '';
  }

  async function applyUser(user: User | null) {
    signedIn = !!user;
    userEmail = user?.email ?? '';
    authUserId = user?.id ?? null;
    const role = user?.app_metadata?.role;
    isAdmin = role === 'admin';
    isMod = role === 'mod';
    userRole = role === 'admin' || role === 'mod' || role === 'user' ? role : null;

    if (!user) {
      userDisplayName = '';
      return;
    }

    const metaName = metaDisplayName(user);
    userDisplayName = metaName;
    const uid = user.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', uid)
      .maybeSingle();
    if (authUserId !== uid) return;
    userDisplayName = profile?.display_name?.trim() || metaName || '';
  }

  async function loadAuth() {
    const { data } = await supabase.auth.getSession();
    await applyUser(data.session?.user ?? null);
  }

  async function logout() {
    await supabase.auth.signOut({ scope: 'local' });
    location.href = '/app';
  }

  onMount(() => {
    initChromeNav();
    void loadAuth();
    const stopPresence = startDevicePresenceTracking();

    // App chrome owns scrolling via <main>. Lock the document so overscroll
    // at the end of main cannot chain into body (header slides away while
    // position:fixed SectionNav stays → empty gap ≈ header height).
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null);
    });
    return () => {
      stopPresence();
      subscription.unsubscribe();
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.height = prev.htmlHeight;
      body.style.height = prev.bodyHeight;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  });

  afterNavigate(() => {
    closeMobileNav();
  });
</script>

<div class={['flex h-dvh flex-col overflow-hidden bg-bg', showQuickLogin && 'pb-13']}>
  <AppHeader {userEmail} {userDisplayName} {userRole} onLogout={logout} />
  <div class="relative flex min-h-0 flex-1 overflow-hidden">
    <AppSidebar {isAdmin} {isMod} {signedIn} />

    {#if chrome.mobileNavOpen}
      <button
        type="button"
        class="absolute inset-0 z-20 cursor-default border-0 bg-[rgba(10,10,10,0.35)] p-0 md:hidden"
        aria-label={t('closeNav')}
        onclick={closeMobileNav}
      ></button>
    {/if}

    <main class="min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-6">
      {@render children()}
    </main>
  </div>
  <NotificationsDrawer />
  {#if showQuickLogin}
    <DevQuickLoginBar currentEmail={userEmail} />
  {/if}
</div>
