import type { Model } from '$lib/domain';
import { MatrixModel } from '$lib/components/ui/matrix';
import { validators } from '$lib/components/ui/matrix';
import { t } from '$lib/i18n/ru';

function fmt(n: number | undefined): string {
	if (n == null || !Number.isFinite(n)) return '0';
	// Keep compact display; preserve decimals when present.
	const rounded = Math.round(n * 1e6) / 1e6;
	return String(rounded);
}

function parseCell(raw: string, fallback: number): number {
	const n = Number(raw);
	return Number.isFinite(n) ? n : fallback;
}

function normalizeName(raw: string, fallback: string): string {
	const name = raw.trim();
	return name.length > 0 ? name : fallback;
}

/**
 * Build a full LP source tableau:
 *
 * ```
 * Ресурсы \ Продукция | p1 | p2 | … | Запас
 * r1                  | A  | A  | … | b1
 * r2                  | A  | A  | … | b2
 * Цена                | c1 | c2 | … |
 * ```
 */
export function modelToTableauCells(model: Model): string[][] {
	const resources = model.resources ?? [];
	const products = model.products ?? [];
	const A = model.A ?? [];
	const b = model.b ?? [];
	const c = model.c ?? [];
	const m = resources.length;
	const n = products.length;
	const rows = m + 2; // header + resources + prices
	const cols = n + 2; // header + products + stock
	const cells: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));

	cells[0][0] = t('matrixCorner');
	for (let j = 0; j < n; j++) {
		cells[0][j + 1] = products[j] ?? `x${j + 1}`;
	}
	cells[0][n + 1] = t('matrixStock');

	for (let i = 0; i < m; i++) {
		cells[i + 1][0] = resources[i] ?? `r${i + 1}`;
		for (let j = 0; j < n; j++) {
			cells[i + 1][j + 1] = fmt(A[i]?.[j]);
		}
		cells[i + 1][n + 1] = fmt(b[i]);
	}

	cells[m + 1][0] = t('matrixPrice');
	for (let j = 0; j < n; j++) {
		cells[m + 1][j + 1] = fmt(c[j]);
	}
	cells[m + 1][n + 1] = '';

	return cells;
}

/** Product name headers: row 0, cols 1..n. Resource name headers: col 0, rows 1..m. */
export function isLpNameHeader(row: number, col: number, m: number, n: number): boolean {
	if (row === 0 && col >= 1 && col <= n) return true;
	if (col === 0 && row >= 1 && row <= m) return true;
	return false;
}

/** Editable numeric cells: A, stock column, price row (not the muted price×stock corner). */
export function isLpNumericCell(row: number, col: number, m: number, n: number): boolean {
	if (row >= 1 && row <= m && col >= 1 && col <= n) return true;
	if (row >= 1 && row <= m && col === n + 1) return true;
	if (row === m + 1 && col >= 1 && col <= n) return true;
	return false;
}

export function isLpEditableCell(
	row: number,
	col: number,
	m: number,
	n: number
): boolean {
	return isLpNameHeader(row, col, m, n) || isLpNumericCell(row, col, m, n);
}

/**
 * Read A, b, c and resource/product names from a tableau matrix into a Model clone.
 */
export function tableauToModel(matrix: MatrixModel, base: Model): Model {
	const next = structuredClone(base);
	const m = next.resources.length;
	const n = next.products.length;

	for (let i = 0; i < m; i++) {
		next.resources[i] = normalizeName(
			matrix.getValue(i + 1, 0),
			next.resources[i] || `r${i + 1}`
		);
		for (let j = 0; j < n; j++) {
			const raw = matrix.getValue(i + 1, j + 1);
			next.A[i][j] = parseCell(raw, next.A[i]?.[j] ?? 0);
		}
		next.b[i] = parseCell(matrix.getValue(i + 1, n + 1), next.b[i] ?? 0);
	}

	for (let j = 0; j < n; j++) {
		next.products[j] = normalizeName(
			matrix.getValue(0, j + 1),
			next.products[j] || `x${j + 1}`
		);
		next.c[j] = parseCell(matrix.getValue(m + 1, j + 1), next.c[j] ?? 0);
	}

	return next;
}

/** Fingerprint of editable numeric source data (for external reload detection). */
export function modelSourceKey(model: Model): string {
	return JSON.stringify({
		A: model.A,
		b: model.b,
		c: model.c,
		resources: model.resources,
		products: model.products
	});
}

export function createLpMatrixModel(model: Model): MatrixModel {
	const mm = MatrixModel.fromArray(modelToTableauCells(model));
	mm.diagonalLocked = false;
	mm.inputValidator = validators.decimal;
	styleLpTableau(mm, model);
	return mm;
}

export function loadLpMatrixModel(mm: MatrixModel, model: Model): void {
	mm.diagonalLocked = false;
	mm.inputValidator = validators.decimal;
	mm.load(modelToTableauCells(model));
	styleLpTableau(mm, model);
}

function styleLpTableau(mm: MatrixModel, model: Model): void {
	mm.clearStyles();
	const m = model.resources?.length ?? 0;
	const n = model.products?.length ?? 0;
	const bCol = n + 1;
	const cRow = m + 1;

	mm.setColStyle(bCol, { background: 'var(--color-bg-soft)' });
	mm.setRowStyle(cRow, { background: 'var(--color-bg-soft)' });
	// Corner of price×stock is not meaningful — mute it.
	mm.setCellStyle(cRow, bCol, { background: 'var(--color-surface)' });
}

/**
 * Compact LP tableau for thumbnails — same layout as the full matrix
 * (product/resource headers + stock/price), with capped data size.
 */
export function modelThumbCells(
	model: Model,
	maxRows = 4,
	maxCols = 4
): { cells: string[][]; truncated: boolean } {
	const mFull = model.resources?.length ?? 0;
	const nFull = model.products?.length ?? 0;
	if (mFull === 0 || nFull === 0) {
		return { cells: [['—']], truncated: false };
	}

	const m = Math.min(mFull, maxRows);
	const n = Math.min(nFull, maxCols);
	const truncated = mFull > maxRows || nFull > maxCols;

	const slice: Model = {
		...model,
		resources: model.resources.slice(0, m),
		products: model.products.slice(0, n),
		A: model.A.slice(0, m).map((row) => row.slice(0, n)),
		b: model.b.slice(0, m),
		c: model.c.slice(0, n)
	};

	return { cells: modelToTableauCells(slice), truncated };
}
