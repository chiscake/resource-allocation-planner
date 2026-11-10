<script lang="ts">
	import { untrack } from 'svelte';
	import type { MatrixModel } from './matrix-model.svelte';
	import type { CellInputValidator, CellStyle } from './types';
	import { validators } from './validators';

	/** Subtle gray for locked diagonal when no explicit background is set. */
	const DIAGONAL_BG = 'var(--color-surface-strong, #e5e5e5)';
	const HEADER_BG = 'var(--color-brand-faint, #eff6ff)';

	/** Floor / cap for auto-fit from header labels (px). Long labels wrap inside the cap. */
	const MIN_DATA_PX = 56; // 3.5rem
	const MAX_DATA_PX = 160; // 10rem
	const MIN_LABEL_PX = 88; // ~5.5rem — room for «Ресурсы \ Продукция»
	const MAX_LABEL_PX = 240; // 15rem
	/** Cell borders (1px×2) + subpixel slack so nowrap measure matches border-box td. */
	const CELL_BOX_SLACK_PX = 8;
	const MIN_ROW_PX = 32; // 2rem

	let {
		model,
		readonly = false,
		/** When true, data diagonal cells are not editable. Defaults to `model.diagonalLocked`. */
		lockDiagonal,
		/**
		 * Custom draft validator. Wins over `integerOnly` and `model.inputValidator`.
		 * Return `false` to reject the keystroke / paste (previous draft kept).
		 */
		validateInput,
		/**
		 * Convenience: non-negative integer drafts (`/^\d*$/`, empty OK while editing).
		 * Ignored when `validateInput` is set.
		 */
		integerOnly = false,
		/**
		 * Override which cells are UI-editable (still respects `readonly`).
		 * Use for LP name headers, non-square layouts, etc.
		 */
		canEditCell,
		/**
		 * Body cells holding free text (e.g. units): skip the draft validator,
		 * may be committed empty, excluded from Tab navigation.
		 */
		isTextCell,
		/** Faint hint shown in an empty cell (display only). */
		cellPlaceholder,
		class: className = '',
		maxHeight = '24rem'
	}: {
		model: MatrixModel;
		/** When true, data cells are not editable. */
		readonly?: boolean;
		/**
		 * Lock data diagonal (`row === col`, both > 0) against UI edits.
		 * Defaults to `model.diagonalLocked` (true). Set `false` for non-TSP matrices.
		 */
		lockDiagonal?: boolean;
		validateInput?: CellInputValidator;
		integerOnly?: boolean;
		canEditCell?: (row: number, col: number) => boolean;
		isTextCell?: (row: number, col: number) => boolean;
		cellPlaceholder?: (row: number, col: number) => string | undefined;
		class?: string;
		/** Max height of the scroll container (CSS length). */
		maxHeight?: string;
	} = $props();

	const diagonalLocked = $derived(lockDiagonal ?? model.diagonalLocked);

	/** Prop `validateInput` > `integerOnly` > `model.inputValidator` > none. */
	const resolvedValidator = $derived.by((): CellInputValidator | undefined => {
		if (validateInput) return validateInput;
		if (integerOnly) return validators.nonNegativeInteger;
		return model.inputValidator;
	});

	let editing = $state<{ row: number; col: number } | null>(null);
	let draft = $state('');
	/** Ignore blur commit when Tab moves focus to another cell (input unmounts). */
	let suppressBlurCommit = false;

	let scrollEl: HTMLDivElement | undefined = $state();

	/** Uniform sizes derived from header labels (px). */
	let labelWidthPx = $state(MIN_LABEL_PX);
	let dataWidthPx = $state(MIN_DATA_PX);
	let headerRowHeightPx = $state(MIN_ROW_PX);
	let bodyRowHeightPx = $state(MIN_ROW_PX);

	function isFreeText(row: number, col: number): boolean {
		return row > 0 && col > 0 && (isTextCell?.(row, col) ?? false);
	}

	const editingIsHeader = $derived(
		editing != null &&
			(editing.row === 0 || editing.col === 0 || isFreeText(editing.row, editing.col))
	);

	const numericInputMode = $derived(
		!editingIsHeader &&
			(integerOnly ||
				resolvedValidator === validators.nonNegativeInteger ||
				resolvedValidator === validators.integer ||
				resolvedValidator === validators.decimal)
	);

	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function canEdit(row: number, col: number): boolean {
		if (readonly) return false;
		if (canEditCell) return canEditCell(row, col);
		if (row <= 0 || col <= 0) return false;
		if (diagonalLocked && row === col) return false;
		return true;
	}

	/** Tab navigation stays in numeric data cells (not name headers). */
	function canTabTo(row: number, col: number): boolean {
		if (!canEdit(row, col)) return false;
		if (row === 0 || col === 0) return false;
		return !isFreeText(row, col);
	}

	/** Next/prev editable data cell: left→right, wrap to next/prev row (skip locked diagonal). */
	function findNeighbor(
		row: number,
		col: number,
		dir: 1 | -1
	): { row: number; col: number } | null {
		const maxR = model.rows - 1;
		const maxC = model.cols - 1;
		if (maxR < 1 || maxC < 1) return null;

		let r = row;
		let c = col;
		const guard = maxR * maxC;
		for (let i = 0; i < guard; i++) {
			c += dir;
			if (c > maxC) {
				c = 1;
				r += 1;
			} else if (c < 1) {
				c = maxC;
				r -= 1;
			}
			if (r > maxR) r = 1;
			else if (r < 1) r = maxR;

			if (canTabTo(r, c)) return { row: r, col: c };
		}
		return null;
	}

	function isHeaderCell(row: number, col: number): boolean {
		return row === 0 || col === 0;
	}

	function acceptsDraft(raw: string, row: number, col: number): boolean {
		if (isHeaderCell(row, col) || isFreeText(row, col)) return true;
		const validator = resolvedValidator;
		if (!validator) return true;
		return validator(raw, { row, col });
	}

	/**
	 * Commit requires a non-empty, complete draft that still passes the draft validator.
	 * Empty and a lone `-` (incomplete signed int) revert to the last committed value.
	 * Header names: non-empty after trim.
	 */
	function acceptsCommit(raw: string, row: number, col: number): boolean {
		if (isHeaderCell(row, col)) return raw.trim().length > 0;
		if (isFreeText(row, col)) return true;
		if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return false;
		return acceptsDraft(raw, row, col);
	}

	function cellClass(row: number, col: number, style: CellStyle): string {
		const parts = [
			'matrix-cell border border-border text-center align-middle'
		];

		if (col === 0) {
			parts.push('matrix-cell-label');
		} else {
			parts.push('matrix-cell-data');
		}

		if (row === 0) {
			parts.push('matrix-cell-colhead');
		} else {
			parts.push('matrix-cell-body');
		}

		if (row === 0 || col === 0) {
			parts.push('matrix-cell-wrap font-medium');
		} else {
			parts.push('matrix-cell-numeric');
		}

		if (style.bold) {
			parts.push('font-medium');
		}

		// Low sticky z kept inside `.matrix-scroll` isolation so chrome (sidebar z-30, drawer z-40/50) stays above.
		if (row === 0) {
			parts.push('sticky top-0 z-[2]');
		}
		if (col === 0) {
			parts.push('sticky left-0 z-[1]');
		}
		if (row === 0 && col === 0) {
			parts.push('z-[3]');
		}

		if (editing?.row === row && editing?.col === col) {
			parts.push('matrix-cell-editing');
		} else if (canEdit(row, col)) {
			parts.push('cursor-text hover:bg-surface-hover');
		}

		return parts.join(' ');
	}

	function cellStyleAttr(row: number, col: number, style: CellStyle): string {
		// Precedence: explicit cell/row/col background > header default > locked diagonal gray
		let bg = style.background;
		if (!bg) {
			if (row === 0 || col === 0) {
				bg = HEADER_BG;
			} else if (diagonalLocked && row === col) {
				bg = DIAGONAL_BG;
			}
		}
		return bg ? `background-color: ${bg}` : '';
	}

	function startEdit(row: number, col: number): void {
		if (!canEdit(row, col)) return;
		editing = { row, col };
		draft = model.getValue(row, col);
	}

	function commitEdit(): void {
		if (suppressBlurCommit) return;
		if (!editing) return;
		const { row, col } = editing;
		if (canEdit(row, col) && acceptsCommit(draft, row, col)) {
			const value = isHeaderCell(row, col) || isFreeText(row, col) ? draft.trim() : draft;
			model.setValue(row, col, value);
		}
		// Invalid or empty draft → leave cell at last committed value (no write).
		editing = null;
	}

	function cancelEdit(): void {
		editing = null;
	}

	function moveEdit(dir: 1 | -1): void {
		if (!editing) return;
		const { row, col } = editing;
		if (canEdit(row, col) && acceptsCommit(draft, row, col)) {
			const value = isHeaderCell(row, col) || isFreeText(row, col) ? draft.trim() : draft;
			model.setValue(row, col, value);
		}
		const next = findNeighbor(row, col, dir);
		if (!next) {
			editing = null;
			return;
		}
		suppressBlurCommit = true;
		editing = next;
		draft = model.getValue(next.row, next.col);
		queueMicrotask(() => {
			suppressBlurCommit = false;
		});
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Tab') {
			e.preventDefault();
			moveEdit(e.shiftKey ? -1 : 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}

	function getDraft(): string {
		return draft;
	}

	function setDraft(next: string): void {
		if (!editing) return;
		if (acceptsDraft(next, editing.row, editing.col)) {
			draft = next;
		}
	}

	function clamp(n: number, lo: number, hi: number): number {
		return Math.min(hi, Math.max(lo, n));
	}

	/**
	 * Measure header labels → one label-col width, one shared data-col width,
	 * header-row height (may wrap), uniform body-row height.
	 */
	function measureLayout(cells: string[][], font: string): {
		labelW: number;
		dataW: number;
		headerH: number;
		bodyH: number;
	} {
		const probe = document.createElement('div');
		probe.setAttribute('aria-hidden', 'true');
		probe.style.cssText = [
			'position:absolute',
			'visibility:hidden',
			'left:-9999px',
			'top:0',
			'box-sizing:border-box',
			'padding:0 0.35rem',
			'line-height:1.25',
			'font:' + font,
			'font-weight:500'
		].join(';');
		document.body.appendChild(probe);

		const measureLine = (text: string): number => {
			probe.style.width = 'auto';
			probe.style.whiteSpace = 'nowrap';
			probe.textContent = text.length > 0 ? text : '\u00a0';
			return Math.ceil(probe.offsetWidth);
		};

		const measureBlock = (text: string, widthPx: number): number => {
			probe.style.width = `${widthPx}px`;
			probe.style.whiteSpace = 'normal';
			probe.style.overflowWrap = 'break';
			probe.style.wordBreak = 'normal';
			probe.textContent = text.length > 0 ? text : '\u00a0';
			return Math.ceil(probe.offsetHeight);
		};

		try {
			const rows = cells.length;
			const cols = cells[0]?.length ?? 0;
			if (rows === 0 || cols === 0) {
				return {
					labelW: MIN_LABEL_PX,
					dataW: MIN_DATA_PX,
					headerH: MIN_ROW_PX,
					bodyH: MIN_ROW_PX
				};
			}

			let maxLabelLine = 0;
			for (let r = 0; r < rows; r++) {
				maxLabelLine = Math.max(maxLabelLine, measureLine(cells[r]?.[0] ?? ''));
			}
			const labelW = clamp(maxLabelLine + CELL_BOX_SLACK_PX, MIN_LABEL_PX, MAX_LABEL_PX);

			let maxDataLine = 0;
			for (let c = 1; c < cols; c++) {
				maxDataLine = Math.max(maxDataLine, measureLine(cells[0]?.[c] ?? ''));
			}
			if (isTextCell) {
				for (let r = 1; r < rows; r++) {
					for (let c = 1; c < cols; c++) {
						if (isTextCell(r, c)) {
							maxDataLine = Math.max(maxDataLine, measureLine(cells[r]?.[c] ?? ''));
						}
					}
				}
			}
			// Numeric floor so short headers don't crush Aij / stock values.
			const dataW = clamp(
				Math.max(maxDataLine + CELL_BOX_SLACK_PX, MIN_DATA_PX),
				MIN_DATA_PX,
				MAX_DATA_PX
			);

			let headerH = MIN_ROW_PX;
			headerH = Math.max(headerH, measureBlock(cells[0]?.[0] ?? '', labelW));
			for (let c = 1; c < cols; c++) {
				headerH = Math.max(headerH, measureBlock(cells[0]?.[c] ?? '', dataW));
			}

			let bodyH = MIN_ROW_PX;
			for (let r = 1; r < rows; r++) {
				bodyH = Math.max(bodyH, measureBlock(cells[r]?.[0] ?? '', labelW));
			}

			return { labelW, dataW, headerH, bodyH };
		} finally {
			probe.remove();
		}
	}

	$effect(() => {
		void model.version;
		const cells = model.cells;
		const host = scrollEl;
		if (!host) return;

		const sample =
			host.querySelector('.matrix-table') ?? host;
		const cs = getComputedStyle(sample);
		const font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;

		const next = measureLayout(cells, font);
		untrack(() => {
			if (labelWidthPx !== next.labelW) labelWidthPx = next.labelW;
			if (dataWidthPx !== next.dataW) dataWidthPx = next.dataW;
			if (headerRowHeightPx !== next.headerH) headerRowHeightPx = next.headerH;
			if (bodyRowHeightPx !== next.bodyH) bodyRowHeightPx = next.bodyH;
		});
	});
</script>

<div
	bind:this={scrollEl}
	class="matrix-scroll w-fit max-w-full overflow-auto border border-border bg-bg {className}"
	style:max-height={maxHeight}
	style:--matrix-label-width="{labelWidthPx}px"
	style:--matrix-data-width="{dataWidthPx}px"
	style:--matrix-header-row-height="{headerRowHeightPx}px"
	style:--matrix-body-row-height="{bodyRowHeightPx}px"
	data-version={model.version}
	data-style-version={model.styleVersion}
>
	<table class="matrix-table border-collapse font-mono text-sm">
		<tbody>
			{#each model.cells as row, r (r)}
				<tr>
					{#each row as value, c (`${r}-${c}`)}
						{@const style = model.getResolvedStyle(r, c)}
						<td
							class={cellClass(r, c, style)}
							style={cellStyleAttr(r, c, style)}
							onclick={() => startEdit(r, c)}
							ondblclick={() => startEdit(r, c)}
						>
							{#if editing?.row === r && editing?.col === c}
								<input
									{@attach autofocus}
									bind:value={getDraft, setDraft}
									class="matrix-input"
									inputmode={numericInputMode ? 'decimal' : undefined}
									onblur={commitEdit}
									onkeydown={onKeydown}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								{@const hint = value === '' ? cellPlaceholder?.(r, c) : undefined}
								{#if hint}
									<span class="matrix-display text-text-faint">{hint}</span>
								{:else}
									<span class="matrix-display">{value}</span>
								{/if}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.matrix-scroll {
		width: fit-content;
		max-width: 100%;
		/* Contain sticky cell stacking so z-[1–3] never compete with app chrome. */
		isolation: isolate;
	}

	.matrix-table {
		font-variant-numeric: tabular-nums;
		table-layout: fixed;
		width: max-content;
		border-collapse: collapse;
	}

	.matrix-cell {
		box-sizing: border-box;
		overflow: hidden;
		padding: 0;
		line-height: 1.25;
		vertical-align: middle;
	}

	.matrix-cell-label {
		width: var(--matrix-label-width, 4.5rem);
		min-width: var(--matrix-label-width, 4.5rem);
		max-width: var(--matrix-label-width, 4.5rem);
	}

	.matrix-cell-data {
		width: var(--matrix-data-width, 3.5rem);
		min-width: var(--matrix-data-width, 3.5rem);
		max-width: var(--matrix-data-width, 3.5rem);
	}

	.matrix-cell-colhead {
		height: var(--matrix-header-row-height, 2rem);
	}

	.matrix-cell-body {
		height: var(--matrix-body-row-height, 2rem);
	}

	.matrix-cell-wrap .matrix-display {
		white-space: normal;
		overflow-wrap: normal;
		word-break: normal;
	}

	/* Corner / axis labels: keep on one line when column width allows. */
	.matrix-cell-label.matrix-cell-colhead .matrix-display {
		white-space: nowrap;
	}

	.matrix-cell-numeric .matrix-display {
		white-space: nowrap;
	}

	.matrix-cell-editing {
		position: relative;
	}

	.matrix-display,
	.matrix-input {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		min-width: 0;
		max-width: 100%;
		margin: 0;
		padding: 0.15rem 0.35rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		font: inherit;
		font-size: inherit;
		line-height: 1.25;
		text-align: center;
		color: inherit;
	}

	.matrix-display {
		display: grid;
		place-items: center;
	}

	.matrix-input {
		display: block;
		outline: none;
		appearance: none;
		-webkit-appearance: none;
		white-space: nowrap;
	}

	.matrix-input:focus {
		outline: 2px solid var(--color-border-focus);
		outline-offset: -2px;
	}
</style>
