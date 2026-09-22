import { toast } from 'svelte-sonner';
import { t } from '$lib/i18n';
import { toastDeletedWithUndo } from './toast-undo';

export type SoftDeleteResult = { error?: string };

/**
 * Optimistic remove → soft-delete → undo toast that restores.
 * Callers own list mutation via remove/restoreOptimistic.
 */
export async function optimisticDeleteWithUndo<T>(opts: {
	item: T;
	removeOptimistic: () => void;
	restoreOptimistic: (item: T) => void;
	softDelete: () => Promise<SoftDeleteResult>;
	restore: () => Promise<SoftDeleteResult>;
}): Promise<boolean> {
	const snapshot = opts.item;
	opts.removeOptimistic();
	const result = await opts.softDelete();
	if (result.error) {
		opts.restoreOptimistic(snapshot);
		toast.error(result.error || t('deleteFailed'));
		return false;
	}
	toastDeletedWithUndo(async () => {
		const restored = await opts.restore();
		if (restored.error) {
			toast.error(restored.error || t('restoreFailed'));
			return;
		}
		opts.restoreOptimistic(snapshot);
	});
	return true;
}
