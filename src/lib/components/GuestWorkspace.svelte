<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { loadGuest, saveGuest, type GuestSnapshot } from '$lib/db/guest';
	import { createTask13Model, type Model, type SolveResult } from '$lib/domain';
	import { solveLocal } from '$lib/solver';
	import { t } from '$lib/i18n';
	import LpModelMatrix from '$lib/components/model/LpModelMatrix.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	let {
		showLoginCta = true,
		compact = false
	}: {
		/** Show «Войти и сохранить» next to solve. */
		showLoginCta?: boolean;
		/** Tighter spacing when embedded on home. */
		compact?: boolean;
	} = $props();

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

	afterNavigate(() => {
		initFromGuest(loadGuest());
	});

	function onModelChange(next: Model) {
		model = next;
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
	<section class={['flex flex-col', compact ? 'gap-5' : 'gap-6']}>
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-xs text-text-soft">{t('guestLocalLabel')}</p>
				<h2 class={['font-medium tracking-tight text-text', compact ? 'text-xl' : 'text-2xl']}>
					{title}
				</h2>
			</div>
			<div class="flex shrink-0 flex-wrap items-center gap-2">
				<Button disabled={busy} onclick={doSolve}>{t('solve')}</Button>
				{#if showLoginCta}
					<Button variant="secondary" href="/login">{t('loginAndSave')}</Button>
				{/if}
			</div>
		</header>

		{#if error}
			<p class="rounded-[8px] bg-danger-bg px-3 py-2 text-sm text-danger-text">{error}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<Card>
				<h3 class="mb-3 text-sm font-medium">{t('guestResources')}</h3>
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
			</Card>
			<Card>
				<h3 class="mb-3 text-sm font-medium">{t('guestProducts')}</h3>
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
			</Card>
		</div>

		<Card>
			<p class="mb-2 text-sm font-medium">{t('modelMatrix')}</p>
			<LpModelMatrix {model} onchange={onModelChange} />
		</Card>

		{#if result}
			<Card>
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
			</Card>
		{/if}
	</section>
{/if}
