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
  import { startConnectivityTracking } from '$lib/connectivity.svelte';

  let { children }: { children: Snippet } = $props();

  let userEmail = $state('');
  let userDisplayName = $state('');
  let authUserId = $state<string | null>(null);
  let userRole = $state<'admin' | 'mod' | 'user' | null>(null);
  let isAdmin = $state(false);
  let isMod = $state(false);
  let signedIn = $state(false);

  const showQuickLogin = isDevQuickLoginEnabled(env.PUBLIC_DEV_QUICK_LOGIN);

  /** At top → chain for native pull-to-refresh; else contain so body/header stay put. */
  function mainOverscroll(node: HTMLElement) {
    const sync = () => {
      node.style.overscrollBehaviorY = node.scrollTop <= 0 ? 'auto' : 'contain';
    };
    sync();
    node.addEventListener('scroll', sync, { passive: true });
    node.addEventListener('touchstart', sync, { passive: true });
    return {
      destroy() {
        node.removeEventListener('scroll', sync);
        node.removeEventListener('touchstart', sync);
        node.style.removeProperty('overscroll-behavior-y');
      },
    };
  }

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
    const stopConnectivity = startConnectivityTracking();
    void loadAuth();
    const stopPresence = startDevicePresenceTracking();

    // Pinch-zoom + pan can scroll the document (not <main>). The header lives in
    // normal flow inside the shell, so body scrollY hides it under the top edge
    // until a top overscroll snaps it back. Keep the document pinned at 0 so
    // only <main> scrolls — native pull-to-refresh still works via overscroll
    // chaining at main's top (scrollY stays 0).
    const clampDocScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    clampDocScroll();
    window.addEventListener('scroll', clampDocScroll, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener('scroll', clampDocScroll, { passive: true });
    vv?.addEventListener('resize', clampDocScroll, { passive: true });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null);
    });
    return () => {
      stopConnectivity();
      stopPresence();
      subscription.unsubscribe();
      window.removeEventListener('scroll', clampDocScroll);
      vv?.removeEventListener('scroll', clampDocScroll);
      vv?.removeEventListener('resize', clampDocScroll);
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

    <main use:mainOverscroll class="min-w-0 flex-1 overflow-y-auto p-6">
      {@render children()}
    </main>
  </div>
  <NotificationsDrawer />
  {#if showQuickLogin}
    <DevQuickLoginBar currentEmail={userEmail} />
  {/if}
</div>
