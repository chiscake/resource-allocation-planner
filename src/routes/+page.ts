import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { isOnboardingDone, isTauri } from '$lib/platform';

/**
 * `/app` is the SPA main entry (adapter-static).
 * Client-only redirect: prerender sees `browser === false` and emits a shell.
 */
export function load() {
  if (!browser) return {};

  if (isTauri() && !isOnboardingDone()) {
    throw redirect(307, '/onboarding');
  }

  throw redirect(307, '/app');
}
