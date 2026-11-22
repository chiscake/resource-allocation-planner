<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ArrowLeft } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import { supabase } from '$lib/db/supabase';
  import { clearGuest, isGuestWorthUploading, loadGuest } from '$lib/db/guest';
  import { mfaErrorMessage } from '$lib/db/mfa-errors';
  import { createBlankModel } from '$lib/domain';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

  type Mode = 'login' | 'register' | 'checkEmail' | 'mfa';

  const MIN_PASSWORD_LENGTH = 8;

  let mode = $state<Mode>('login');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  let displayName = $state('');
  let mfaCode = $state('');
  let mfaFactorId = $state('');
  let error = $state('');
  let busy = $state(false);
  let hasGuest = $state(false);

  onMount(() => {
    const guest = loadGuest();
    hasGuest = guest != null && isGuestWorthUploading(guest);
    if (guest && !hasGuest) clearGuest();
  });

  function setMode(next: Mode) {
    mode = next;
    error = '';
  }

  async function uploadGuestIfAny(userId: string) {
    const guest = loadGuest();
    if (!guest) return;
    if (!isGuestWorthUploading(guest)) {
      clearGuest();
      return;
    }
    await supabase.from('solve_nodes').insert({
      owner_id: userId,
      title: guest.title || t('guestScenarioTitle'),
      kind: 'root',
      model: guest.model ?? createBlankModel(),
      result: guest.result ?? null,
    });
    clearGuest();
  }

  async function finishSignedIn(userId: string) {
    await uploadGuestIfAny(userId);
    void goto('/app');
  }

  async function maybeRequireMfa(userId: string): Promise<boolean> {
    const { data, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr || !data) return false;
    if (data.currentLevel === 'aal2' || data.nextLevel !== 'aal2') return false;

    const factors = await supabase.auth.mfa.listFactors();
    const totp =
      factors.data?.totp.find((f) => f.status === 'verified') ??
      factors.data?.all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
    if (!totp) return false;

    mfaFactorId = totp.id;
    mfaCode = '';
    password = '';
    mode = 'mfa';
    return true;
  }

  async function onLogin() {
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err || !data.user) {
      error = err?.message?.trim() || t('loginFailed');
      return;
    }
    if (await maybeRequireMfa(data.user.id)) return;
    await finishSignedIn(data.user.id);
  }

  async function onMfaVerify() {
    const trimmed = mfaCode.trim();
    if (!trimmed || !mfaFactorId) {
      error = t('mfaInvalidCode');
      return;
    }
    const challenge = await supabase.auth.mfa.challenge({
      factorId: mfaFactorId,
    });
    if (challenge.error || !challenge.data) {
      error = mfaErrorMessage(challenge.error?.message);
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.data.id,
      code: trimmed,
    });
    if (verify.error || !verify.data.user) {
      error = mfaErrorMessage(verify.error?.message);
      return;
    }
    await finishSignedIn(verify.data.user.id);
  }

  async function onRegister() {
    const name = displayName.trim();
    if (!name) {
      error = t('displayNameRequired');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      error = t('passwordTooShort');
      return;
    }
    if (password !== passwordConfirm) {
      error = t('passwordMismatch');
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        // Must be listed in Dashboard → Auth → URL Configuration (Redirect URLs).
        emailRedirectTo: `${window.location.origin}/app`,
      },
    });
    if (err) {
      error = err.message?.trim() || t('registerFailed');
      return;
    }

    if (data.session?.user) {
      await finishSignedIn(data.session.user.id);
      return;
    }

    password = '';
    passwordConfirm = '';
    mode = 'checkEmail';
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (mode === 'checkEmail') return;
    busy = true;
    error = '';
    try {
      if (mode === 'login') await onLogin();
      else if (mode === 'mfa') await onMfaVerify();
      else await onRegister();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex min-h-screen flex-col">
  <header
    class="relative z-40 flex h-14 shrink-0 items-center gap-3 bg-bg"
    style="padding-inline: var(--chrome-pad-x)"
  >
    <button
      type="button"
      class="inline-flex shrink-0 items-center justify-center rounded-md text-text hover:bg-surface"
      style="width: var(--chrome-control-size); height: var(--chrome-control-size)"
      aria-label={t('back')}
      onclick={() => void goto('/app')}
    >
      <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  </header>

  <main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
    {#if mode === 'checkEmail'}
      <h1 class="text-2xl font-medium">{t('registerCheckEmailTitle')}</h1>
      <p class="text-sm leading-relaxed text-text-muted">
        {t('registerCheckEmail')}
      </p>
    {:else if mode === 'mfa'}
      <h1 class="text-2xl font-medium">{t('mfaSectionTitle')}</h1>
      <p class="text-sm leading-relaxed text-text-muted">{t('mfaLoginHint')}</p>
      {#if error}
        <InlineAlert>{error}</InlineAlert>
      {/if}
      <form class="flex flex-col gap-3" onsubmit={onSubmit}>
        <label class="flex flex-col gap-1 text-sm">
          <span>{t('mfaCode')}</span>
          <Input
            bind:value={mfaCode}
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
          />
        </label>
        <Button type="submit" disabled={busy}>{t('mfaLoginSubmit')}</Button>
      </form>
    {:else}
      <h1 class="text-2xl font-medium">
        {mode === 'login' ? t('login') : t('register')}
      </h1>
      {#if hasGuest}
        <InlineAlert tone="muted">{t('guestUpload')}</InlineAlert>
      {/if}
      {#if error}
        <InlineAlert>{error}</InlineAlert>
      {/if}
      <form class="flex flex-col gap-3" onsubmit={onSubmit}>
        {#if mode === 'register'}
          <label class="flex flex-col gap-1 text-sm">
            <span>{t('displayName')}</span>
            <Input bind:value={displayName} autocomplete="nickname" />
          </label>
        {/if}
        <label class="flex flex-col gap-1 text-sm">
          <span>{t('email')}</span>
          <Input bind:value={email} type="email" autocomplete="username" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span>{t('password')}</span>
          <Input
            bind:value={password}
            type="password"
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {#if mode === 'register'}
          <label class="flex flex-col gap-1 text-sm">
            <span>{t('passwordConfirm')}</span>
            <Input bind:value={passwordConfirm} type="password" autocomplete="new-password" />
          </label>
        {/if}
        <Button type="submit" disabled={busy}>
          {mode === 'login' ? t('login') : t('register')}
        </Button>
      </form>
      {#if mode === 'login'}
        <Button variant="ghost" type="button" onclick={() => setMode('register')}>
          {t('switchToRegister')}
        </Button>
      {:else}
        <Button variant="ghost" type="button" onclick={() => setMode('login')}>
          {t('switchToLogin')}
        </Button>
      {/if}
    {/if}
  </main>
</div>
