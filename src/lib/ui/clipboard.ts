import { toast } from 'svelte-sonner';
import { t } from '$lib/i18n';

/** Copy text to clipboard and show a short success toast. */
export async function copyToClipboard(text: string): Promise<boolean> {
	const value = text.trim();
	if (!value) return false;
	try {
		await navigator.clipboard.writeText(value);
		toast.success(t('copied'));
		return true;
	} catch {
		toast.error(t('copyFailed'));
		return false;
	}
}
