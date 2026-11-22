export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function editionLabel(): string {
  return isTauri() ? 'Desktop версия' : 'Web версия';
}

const ONBOARDING_KEY = 'rap_onboarding_done';

export function isOnboardingDone(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(ONBOARDING_KEY) === '1';
}

export function completeOnboarding(): void {
  localStorage.setItem(ONBOARDING_KEY, '1');
}
