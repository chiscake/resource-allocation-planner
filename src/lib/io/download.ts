export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** UTF-8 BOM so Excel opens Cyrillic CSV correctly. */
export function downloadCsv(text: string, filename: string): void {
	downloadBlob(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }), filename);
}

export function safeFilename(title: string, ext: string, fallback = 'model'): string {
	const base =
		title
			.trim()
			.replace(/[^\p{L}\p{N}_-]+/gu, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 60) || fallback;
	return `${base}.${ext}`;
}
