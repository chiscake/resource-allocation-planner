import { t } from '$lib/i18n';

export function formatDateTimeRu(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** «Сохранено: …» or null when iso is missing/invalid. */
export function formatSavedAt(iso: string | null | undefined): string | null {
  const when = formatDateTimeRu(iso);
  return when ? t('savedAt', { when }) : null;
}
