<script lang="ts">
  import type { Component } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { completeOnboarding, isTauri } from '$lib/platform';
  import { t, type RuKey } from '$lib/i18n';
  import { onMount } from 'svelte';
  import {
    Cloud,
    FileSpreadsheet,
    GitCompareArrows,
    HardDrive,
    LayoutTemplate,
    Calculator,
    UploadCloud,
  } from '@lucide/svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  type Feature = { icon: Component; label: RuKey };

  const guestFeatures: Feature[] = [
    { icon: HardDrive, label: 'onboardingGuestFeat1' },
    { icon: Calculator, label: 'onboardingGuestFeat2' },
    { icon: LayoutTemplate, label: 'onboardingGuestFeat3' },
    { icon: FileSpreadsheet, label: 'onboardingGuestFeat4' },
  ];

  const accountFeatures: Feature[] = [
    { icon: Cloud, label: 'onboardingAccountFeat1' },
    { icon: LayoutTemplate, label: 'onboardingAccountFeat2' },
    { icon: GitCompareArrows, label: 'onboardingAccountFeat3' },
    { icon: UploadCloud, label: 'onboardingAccountFeat4' },
  ];

  onMount(() => {
    if (!browser) return;
    if (!isTauri()) void goto('/', { replaceState: true });
  });

  function goLogin() {
    completeOnboarding();
    void goto('/login');
  }

  function goGuest() {
    completeOnboarding();
    void goto('/app');
  }
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-8">
  <header class="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
    <img
      src="/android-chrome-192x192.png"
      alt=""
      width="72"
      height="72"
      class="size-[72px] shrink-0 rounded-[14px] shadow-sm"
    />
    <div class="min-w-0">
      <p class="text-sm font-medium tracking-wide text-text-soft uppercase">
        {t('desktopEdition')}
      </p>
      <h1 class="mt-1 text-3xl font-medium tracking-tight text-text-strong sm:text-4xl">
        {t('appTitle')}
      </h1>
      <p class="mt-2 max-w-xl text-base text-text-muted">{t('onboardingTagline')}</p>
    </div>
  </header>

  <div class="grid gap-4 sm:grid-cols-2">
    <Card variant="soft" class="flex flex-col gap-4">
      <h2 class="text-lg font-medium text-text">{t('onboardingGuestTitle')}</h2>
      <ul class="flex flex-col gap-3">
        {#each guestFeatures as item (item.label)}
          {@const Icon = item.icon}
          <li class="flex items-start gap-2.5 text-sm text-text-muted">
            <span
              class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-bg text-text-soft"
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span>{t(item.label)}</span>
          </li>
        {/each}
      </ul>
    </Card>

    <Card class="flex flex-col gap-4 border-brand/25 bg-brand-faint/40">
      <h2 class="text-lg font-medium text-brand">{t('onboardingAccountTitle')}</h2>
      <ul class="flex flex-col gap-3">
        {#each accountFeatures as item (item.label)}
          {@const Icon = item.icon}
          <li class="flex items-start gap-2.5 text-sm text-text-muted">
            <span
              class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-bg text-brand"
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span>{t(item.label)}</span>
          </li>
        {/each}
      </ul>
    </Card>
  </div>

  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <Button class="w-full sm:w-auto sm:min-w-[14rem]" onclick={goLogin}>
      {t('onboardingLoginRegister')}
    </Button>
    <Button variant="secondary" class="w-full sm:w-auto sm:min-w-[14rem]" onclick={goGuest}>
      {t('onboardingContinueGuest')}
    </Button>
  </div>
</main>
