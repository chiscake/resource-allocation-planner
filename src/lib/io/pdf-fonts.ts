import regularUrl from './fonts/NotoSans-Regular.ttf?url';
import boldUrl from './fonts/NotoSans-Bold.ttf?url';
import type { PdfFonts } from './export-result';

let cached: Promise<PdfFonts> | null = null;

function toBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

async function load(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`font ${res.status}`);
	return toBase64(await res.arrayBuffer());
}

export function loadPdfFonts(): Promise<PdfFonts> {
	cached ??= Promise.all([load(regularUrl), load(boldUrl)])
		.then(([regular, bold]) => ({ regular, bold }))
		.catch((e) => {
			cached = null;
			throw e;
		});
	return cached;
}
