import { t, type RuKey } from '$lib/i18n';

/** Map GoTrue auth errors to end-user Russian copy. */
export function authErrorMessage(
  raw: string | null | undefined,
  fallback: Extract<RuKey, 'loginFailed' | 'registerFailed'> = 'loginFailed',
): string {
  const msg = raw?.trim() ?? '';
  if (!msg) return t(fallback);
  if (/invalid login credentials/i.test(msg)) return t('loginInvalidCredentials');
  if (/user already registered/i.test(msg)) return t('registerAlreadyRegistered');
  return t(fallback);
}
