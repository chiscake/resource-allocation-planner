<script lang="ts">
	import { untrack } from 'svelte';
	import { Undo2 } from '@lucide/svelte';
	import type { Model } from '$lib/domain';
	import { cloneModel } from '$lib/domain';
	import { t } from '$lib/i18n';
	import { Matrix } from '$lib/components/ui/matrix';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		clampLpDimensions,
		createLpMatrixModel,
		isLpEditableCell,
		isLpUnitCell,
		loadLpMatrixModel,
		LP_DIM_MAX_PRODUCTS,
		LP_DIM_MAX_RESOURCES,
		LP_DIM_MIN,
		modelSourceKey,
		resizeModelDimensions,
		tableauToModel
	} from './lp-tableau';

	let {
		model,
		readonly = false,
		onchange,
		class: className = '',
		maxHeight = '28rem'
	}: {
		model: Model;
		readonly?: boolean;
		onchange?: (next: Model) => void;
		class?: string;
		maxHeight?: string;
	} = $props();

	// Seed with the current model so the first paint already has the full tableau
	// (avoid empty 1×1 until a post-paint $effect runs — that looked like a “missing” matrix).
	const matrix = untrack(() => createLpMatrixModel(model));
	let lastKey = untrack(() => modelSourceKey(model));
	let applyingExternal = false;
	let skipNextVersion = true;
	/** True while we push a dimension resize via `onchange` (so we don't clear the undo cache). */
	let applyingDimensions = false;

	let resourceCount = $state(untrack(() => model.resources?.length ?? LP_DIM_MIN));
	let productCount = $state(untrack(() => model.products?.length ?? LP_DIM_MIN));

	/**
	 * In-memory undo for dimension changes only (not localStorage).
	 * Captured once when leaving the session baseline; cleared on revert / remount.
	 */
	let pendingUndo = $state.raw<Model | null>(null);
	const canRevert = $derived(pendingUndo != null && !readonly);

	$effect.pre(() => {
		const key = modelSourceKey(model);
		if (key === lastKey) return;
		lastKey = key;
		applyingExternal = true;
		skipNextVersion = true;

		const m = model.resources?.length ?? LP_DIM_MIN;
		const n = model.products?.length ?? LP_DIM_MIN;

		if (applyingDimensions) {
			applyingDimensions = false;
			resourceCount = m;
			productCount = n;
		} else if (m !== resourceCount || n !== productCount) {
			// External model with different shape (navigation / reload) — drop undo cache.
			pendingUndo = null;
			resourceCount = m;
			productCount = n;
		}

		loadLpMatrixModel(matrix, model);
		applyingExternal = false;
	});

	$effect(() => {
		void matrix.version;
		if (skipNextVersion) {
			skipNextVersion = false;
			return;
		}
		if (readonly || applyingExternal) return;
		const next = tableauToModel(matrix, model);
		const key = modelSourceKey(next);
		if (key === lastKey) return;
		lastKey = key;
		onchange?.(next);
	});

	function canEditCell(row: number, col: number): boolean {
		const m = model.resources?.length ?? 0;
		const n = model.products?.length ?? 0;
		return isLpEditableCell(row, col, m, n);
	}

	function isUnitCell(row: number, col: number): boolean {
		return isLpUnitCell(row, col, model.resources?.length ?? 0, model.products?.length ?? 0);
	}

	function unitPlaceholder(row: number, col: number): string | undefined {
		return !readonly && isUnitCell(row, col) ? t('matrixUnitPlaceholder') : undefined;
	}

	function parseDimInput(raw: string | number, fallback: number): number {
		const n = typeof raw === 'number' ? raw : Number(raw);
		return Number.isFinite(n) ? n : fallback;
	}

	function applyDimensions(nextM: number, nextN: number) {
		if (readonly) return;
		const { m, n } = clampLpDimensions(nextM, nextN);
		resourceCount = m;
		productCount = n;

		const current = tableauToModel(matrix, model);
		const curM = current.resources.length;
		const curN = current.products.length;
		if (m === curM && n === curN) return;

		if (pendingUndo == null) {
			pendingUndo = cloneModel(current);
		}

		const next = resizeModelDimensions(current, m, n);
		applyingDimensions = true;
		// Do not set lastKey here — $effect.pre must reload the tableau for the new shape.
		onchange?.(next);
	}

	function onResourceInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		applyDimensions(parseDimInput(el.value, resourceCount), productCount);
	}

	function onProductInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		applyDimensions(resourceCount, parseDimInput(el.value, productCount));
	}

	function revertDimensions() {
		if (readonly || pendingUndo == null) return;
		const restored = cloneModel(pendingUndo);
		pendingUndo = null;
		resourceCount = restored.resources.length;
		productCount = restored.products.length;
		applyingDimensions = true;
		onchange?.(restored);
	}
</script>

<div class="lp-model-matrix w-full min-w-0 {className}">
	{#if !readonly}
		<div class="mb-3 flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1">
				<span class="text-sm text-text-muted">{t('matrixResources')}</span>
				<input
					type="number"
					class="w-20 rounded-[8px] border border-border bg-bg px-2.5 py-2 text-[15px] text-text focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
					min={LP_DIM_MIN}
					max={LP_DIM_MAX_RESOURCES}
					value={resourceCount}
					onchange={onResourceInput}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm text-text-muted">{t('matrixProducts')}</span>
				<input
					type="number"
					class="w-20 rounded-[8px] border border-border bg-bg px-2.5 py-2 text-[15px] text-text focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
					min={LP_DIM_MIN}
					max={LP_DIM_MAX_PRODUCTS}
					value={productCount}
					onchange={onProductInput}
				/>
			</label>
			{#if canRevert}
				<Button
					variant="ghost"
					class="mb-0.5 px-2"
					title={t('matrixRevertDimensions')}
					aria-label={t('matrixRevertDimensions')}
					onclick={revertDimensions}
				>
					<Undo2 size={18} strokeWidth={1.75} aria-hidden="true" />
				</Button>
			{/if}
		</div>
	{/if}
	<div class="w-full min-w-0 overflow-x-auto">
		<Matrix
			model={matrix}
			{readonly}
			lockDiagonal={false}
			{maxHeight}
			{canEditCell}
			isTextCell={isUnitCell}
			cellPlaceholder={unitPlaceholder}
		/>
	</div>
</div>
