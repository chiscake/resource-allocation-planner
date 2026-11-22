import { toast } from 'svelte-sonner';
import { t } from '$lib/i18n';

/** Soft-delete toast with Undo action (Russian UI). */
export function toastDeletedWithUndo(onUndo: () => void | Promise<void>) {
  toast(t('cardDeleted'), {
    action: {
      label: t('undo'),
      onClick: () => {
        void onUndo();
      },
    },
  });
}
