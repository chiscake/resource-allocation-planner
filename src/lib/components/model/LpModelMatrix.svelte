<script lang="ts">
	import { untrack } from 'svelte';
	import type { Model } from '$lib/domain';
	import { Matrix } from '$lib/components/ui/matrix';
	import {
		createLpMatrixModel,
		isLpEditableCell,
		loadLpMatrixModel,
		modelSourceKey,
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

	$effect.pre(() => {
		const key = modelSourceKey(model);
		if (key === lastKey) return;
		lastKey = key;
		applyingExternal = true;
		skipNextVersion = true;
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
</script>

<div class="lp-model-matrix w-full min-w-0 {className}">
	<div class="w-full min-w-0 overflow-x-auto">
		<Matrix
			model={matrix}
			{readonly}
			lockDiagonal={false}
			{maxHeight}
			{canEditCell}
		/>
	</div>
</div>
