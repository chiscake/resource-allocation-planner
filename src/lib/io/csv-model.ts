import { SCHEMA_VERSION, type Model } from '$lib/domain';
import type { RuKey } from '$lib/i18n';
import { SOLVE_LIMITS } from '$lib/solver/limits';

export type CsvDelimiter = ',' | ';';

export type CsvParseResult =
	| { ok: true; model: Model; delimiter: CsvDelimiter }
	| { ok: false; error: RuKey; vars?: Record<string, string> };

const CORNER_LABEL = 'Ресурсы \\ Продукция';
const STOCK_LABEL = 'Запас';
const PRICE_LABEL = 'Цена';
const UNIT_LABEL = 'Ед. изм.';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const STOCK_HEADERS = new Set(['запас', 'запасы', 'rhs', 'stock']);
const PRICE_HEADERS = new Set(['цена', 'цены', 'прибыль', 'price', 'objective']);
const UNIT_HEADERS = new Set(['ед. изм.', 'ед.изм.', 'ед. изм', 'ед.', 'ед', 'единицы', 'unit', 'units']);

/** Count delimiters outside quotes on the first non-empty line; tie → `;` (RU Excel). */
export function detectCsvDelimiter(text: string): CsvDelimiter {
	const firstLine = stripBom(text).split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
	let commas = 0;
	let semis = 0;
	let inQuotes = false;
	for (const ch of firstLine) {
		if (ch === '"') inQuotes = !inQuotes;
		else if (!inQuotes && ch === ',') commas += 1;
		else if (!inQuotes && ch === ';') semis += 1;
	}
	return commas > semis ? ',' : ';';
}

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvLine(line: string, delimiter: CsvDelimiter): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				cur += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === delimiter && !inQuotes) {
			out.push(cur.trim());
			cur = '';
		} else {
			cur += ch;
		}
	}
	out.push(cur.trim());
	return out;
}

function splitRows(text: string, delimiter: CsvDelimiter): string[][] {
	return stripBom(text)
		.split(/\r?\n/)
		.map((l) => parseCsvLine(l, delimiter))
		.filter((cells) => cells.some((c) => c.length > 0));
}

/** Accepts `1 234,5`, `1234.5`, `-3`; empty → null. */
function parseNumber(raw: string): number | null {
	const v = raw.replace(/[\s\u00a0]/g, '').replace(',', '.');
	if (v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : Number.NaN;
}

function isNumeric(raw: string): boolean {
	const n = parseNumber(raw);
	return n !== null && Number.isFinite(n);
}

/**
 * Parse an LP tableau CSV (same layout as the on-screen matrix):
 *
 * ```
 * Ресурсы \ Продукция;Продукт 1;Продукт 2;Запас;Ед. изм.
 * Ед. изм.;шт;шт;;
 * Ресурс 1;1;2;10;кг
 * Цена;3;4;;
 * ```
 *
 * The units row and units column are optional. Empty numeric cells read as 0.
 */
export function parseModelCsv(text: string, delimiter?: CsvDelimiter): CsvParseResult {
	const delim = delimiter ?? detectCsvDelimiter(text);
	const rows = splitRows(text, delim);
	if (rows.length < 3) return { ok: false, error: 'csvTooFewRows' };

	const header = [...rows[0]!];
	while (header.length > 1 && header[header.length - 1] === '') header.pop();

	let stockCol = header.findLastIndex((h, i) => i > 0 && STOCK_HEADERS.has(norm(h)));
	let unitCol = -1;
	if (stockCol < 0) {
		const last = header.length - 1;
		stockCol = UNIT_HEADERS.has(norm(header[last] ?? '')) ? last - 1 : last;
	}
	if (stockCol + 1 < header.length) unitCol = stockCol + 1;

	const n = stockCol - 1;
	if (n < 1) return { ok: false, error: 'csvNoProducts' };
	const products = header.slice(1, stockCol).map((p, j) => p || `Продукт ${j + 1}`);

	let r = 1;
	let productUnits: string[] | undefined;
	const second = rows[r]!;
	if (UNIT_HEADERS.has(norm(second[0] ?? ''))) {
		productUnits = Array.from({ length: n }, (_, j) => second[j + 1] ?? '');
		r += 1;
	}

	const resources: string[] = [];
	const resourceUnits: string[] = [];
	const A: number[][] = [];
	const b: number[] = [];
	let c: number[] | null = null;

	const readNumber = (row: string[], col: number, rowIdx: number): number | CsvParseResult => {
		const v = parseNumber(row[col] ?? '');
		if (v === null) return 0;
		if (Number.isNaN(v)) {
			return {
				ok: false,
				error: 'csvBadNumber',
				vars: { row: String(rowIdx + 1), col: String(col + 1), value: row[col] ?? '' }
			};
		}
		return v;
	};

	for (; r < rows.length; r++) {
		const row = rows[r]!;
		const name = row[0] ?? '';
		const isPrice = PRICE_HEADERS.has(norm(name));
		const values: number[] = [];
		for (let j = 0; j < n; j++) {
			const v = readNumber(row, j + 1, r);
			if (typeof v !== 'number') return v;
			values.push(v);
		}
		if (isPrice) {
			c = values;
			break;
		}
		const stock = readNumber(row, stockCol, r);
		if (typeof stock !== 'number') return stock;
		resources.push(name || `Ресурс ${resources.length + 1}`);
		A.push(values);
		b.push(stock);
		resourceUnits.push(unitCol >= 0 && !isNumeric(row[unitCol] ?? '') ? (row[unitCol] ?? '') : '');
	}

	const m = resources.length;
	if (m < 1) return { ok: false, error: 'csvNoResources' };
	if (!c) return { ok: false, error: 'csvMissingPrice' };
	if (
		m > SOLVE_LIMITS.maxConstraints ||
		n > SOLVE_LIMITS.maxVariables ||
		m * n > SOLVE_LIMITS.maxDenseCells
	) {
		return {
			ok: false,
			error: 'csvTooLarge',
			vars: {
				m: String(m),
				n: String(n),
				maxM: String(SOLVE_LIMITS.maxConstraints),
				maxN: String(SOLVE_LIMITS.maxVariables)
			}
		};
	}

	const model: Model = {
		schema_version: SCHEMA_VERSION,
		resources,
		products,
		A,
		b,
		c,
		resource_units: resourceUnits,
		product_units: productUnits ?? products.map(() => '')
	};
	return { ok: true, model, delimiter: delim };
}

/** Serialize a model in the tableau layout (`;` by default for RU Excel). */
export function serializeModelCsv(model: Model, delimiter: CsvDelimiter = ';'): string {
	const n = model.products.length;
	const m = model.resources.length;
	const productUnits = Array.from({ length: n }, (_, j) => model.product_units?.[j] ?? '');
	const resourceUnits = Array.from({ length: m }, (_, i) => model.resource_units?.[i] ?? '');

	const esc = (v: string | number) => {
		const s = typeof v === 'number' && delimiter === ';' ? String(v).replace('.', ',') : String(v);
		return /["\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const line = (cells: (string | number)[]) => cells.map(esc).join(delimiter);

	const lines = [
		line([CORNER_LABEL, ...model.products, STOCK_LABEL, UNIT_LABEL]),
		line([UNIT_LABEL, ...productUnits, '', '']),
		...model.resources.map((name, i) =>
			line([name, ...Array.from({ length: n }, (_, j) => model.A[i]?.[j] ?? 0), model.b[i] ?? 0, resourceUnits[i]!])
		),
		line([PRICE_LABEL, ...Array.from({ length: n }, (_, j) => model.c[j] ?? 0), '', ''])
	];
	return `${lines.join('\r\n')}\r\n`;
}

/** Starter template: 2 resources × 3 products with unit slots. */
export function csvModelTemplate(delimiter: CsvDelimiter = ';'): string {
	return serializeModelCsv(
		{
			schema_version: SCHEMA_VERSION,
			resources: ['Ресурс 1', 'Ресурс 2'],
			products: ['Продукт 1', 'Продукт 2', 'Продукт 3'],
			A: [
				[1, 2, 1],
				[3, 1, 2]
			],
			b: [100, 150],
			c: [4, 5, 3],
			resource_units: ['кг', 'ч'],
			product_units: ['шт', 'шт', 'шт']
		},
		delimiter
	);
}
