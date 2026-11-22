import { t } from '$lib/i18n';

/** Map GoTrue MFA errors to end-user Russian copy. */
export function mfaErrorMessage(raw?: string | null): string {
  const msg = raw?.trim() ?? '';
  if (!msg) return t('mfaVerifyFailed');
  if (/invalid totp/i.test(msg) || /invalid.*code/i.test(msg)) {
    return t('mfaInvalidCode');
  }
  return msg;
}
