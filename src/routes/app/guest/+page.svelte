<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGuest, saveGuest, type GuestSnapshot } from '$lib/db/guest';
	import { createTask13Model, type Model, type SolveResult } from '$lib/domain';
	import { solveLocal } from '$lib/solver';
	import { t } from '$lib/i18n';

	let title = $state('');
	let model = $state<Model | null>(null);
	let result = $state<SolveResult | null>(null);
	let error = $state('');
	let busy = $state(false);

	function persist() {
		if (!model) return;
		saveGuest({
			title: title || 'Гостевой сценарий',
			model,
			result: result ?? undefined,
			updated_at: new Date().toISOString()
		});
	}

	function initFromGuest(guest: GuestSnapshot | null) {
		if (guest?.model) {
			title = guest.title || 'Задача 13 (гость)';
			model = structuredClone(guest.model as Model);
			result = (guest.result as SolveResult | undefined) ?? null;
			return;
		}
		title = 'Задача 13 (гость)';
		model = createTask13Model();
		result = null;
		persist();
	}

	onMount(() => {
		initFromGuest(loadGuest());
	});

	function onLimitChange(index: number, raw: string) {
		if (!model) return;
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		model.b[index] = value;
		result = null;
		persist();
	}

	function onPriceChange(index: number, raw: string) {
		if (!model) return;
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		model.c[index] = value;
		result = null;
		persist();
	}

	function doSolve() {
		if (!model) return;
		busy = true;
		error = '';
		try {
			const res = solveLocal(model);
			if (res.status !== 'done' || !res.result) {
				error = res.solver_meta.rejected_reason ?? res.status;
				return;
			}
			result = res.result;
			persist();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if !model}
	<p class="text-text-muted">…</p>
{:else}
	<section class="mx-auto flex max-w-4xl flex-col gap-6">
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-xs text-text-soft">{t('guestMode')}</p>
				<h1 class="text-2xl font-medium">{title}</h1>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="rounded-[8px] bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-text-medium disabled:opacity-50"
					disabled={busy}
					onclick={doSolve}
				>
					{t('solve')}
				</button>
				<a
					href="/login"
					class="rounded-[8px] border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
				>
					{t('loginAndSave')}
				</a>
			</div>
		</header>

		{#if error}
			<p class="rounded-[8px] bg-danger-bg px-3 py-2 text-sm text-danger-text">{error}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<div class="rounded-[12px] border border-border p-4">
				<h2 class="mb-3 text-sm font-medium">{t('guestResources')}</h2>
				<ul class="space-y-1 text-sm text-text-muted">
					{#each model.resources as name, i (name)}
						<li>
							{name}
							{#if model.resource_units?.[i]}
								<span class="text-text-faint">({model.resource_units[i]})</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
			<div class="rounded-[12px] border border-border p-4">
				<h2 class="mb-3 text-sm font-medium">{t('guestProducts')}</h2>
				<ul class="space-y-1 text-sm text-text-muted">
					{#each model.products as name, i (name)}
						<li>
							{name}
							{#if model.product_units?.[i]}
								<span class="text-text-faint">({model.product_units[i]})</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<div class="rounded-[12px] border border-border p-4">
				<h2 class="mb-3 text-sm font-medium">{t('guestLimits')}</h2>
				<ul class="space-y-2">
					{#each model.resources as name, i (name)}
						<li class="flex items-center justify-between gap-3 text-sm">
							<span class="text-text-muted">{name}</span>
							<input
								type="number"
								step="any"
								class="w-28 rounded-[8px] border border-border px-2 py-1 font-mono text-right"
								value={model.b[i]}
								onchange={(e) => onLimitChange(i, e.currentTarget.value)}
							/>
						</li>
					{/each}
				</ul>
			</div>
			<div class="rounded-[12px] border border-border p-4">
				<h2 class="mb-3 text-sm font-medium">{t('guestPrices')}</h2>
				<ul class="space-y-2">
					{#each model.products as name, i (name)}
						<li class="flex items-center justify-between gap-3 text-sm">
							<span class="text-text-muted">{name}</span>
							<input
								type="number"
								step="any"
								class="w-28 rounded-[8px] border border-border px-2 py-1 font-mono text-right"
								value={model.c[i]}
								onchange={(e) => onPriceChange(i, e.currentTarget.value)}
							/>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		{#if result}
			<div class="rounded-[12px] border border-border p-4">
				<p class="font-mono text-sm">Z = {result.Z.toFixed(4)}</p>
				<p class="mt-3 text-xs font-medium text-text-soft">{t('guestPlan')}</p>
				<ul class="mt-1 grid gap-1 font-mono text-sm text-text-muted md:grid-cols-2">
					{#each Object.entries(result.x) as [k, v] (k)}
						<li>{k}: {v.toFixed(4)}</li>
					{/each}
				</ul>
				<p class="mt-3 text-sm text-text-soft">
					{t('guestCritical')}: {result.critical_resources.join(', ') || '—'}
				</p>
			</div>
		{/if}
	</section>
{/if}
