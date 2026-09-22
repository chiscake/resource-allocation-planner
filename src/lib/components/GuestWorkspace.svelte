<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGuest, saveGuest, type GuestWhatIfRow } from '$lib/db/guest';
	import { createBlankModel, type Model, type SolveResult } from '$lib/domain';
	import { solveLocal, runMutationsLocal } from '$lib/solver';
	import { t } from '$lib/i18n';
	import SolveWorkspace from '$lib/components/model/SolveWorkspace.svelte';
	import {
		createSolveSession,
		type SolveTransport
	} from '$lib/components/model/solve-session.svelte';

	let {
		showLoginCta = true,
		compact = false
	}: {
		/** Show «Войти и сохранить» next to solve. */
		showLoginCta?: boolean;
		/** Tighter spacing when embedded on home. */
		compact?: boolean;
	} = $props();

	/** Kept for upload-on-login; not shown in guest UI. */
	let title = $state('');
	const session = createSolveSession();

	const localTransport: SolveTransport = {
		solve: async (model, method) => solveLocal(model, 'local', 0, method),
		runMutations: async (model, mutations, method) =>
			runMutationsLocal(model, mutations, 'local', method)
	};

	function persist() {
		if (!session.model) return;
		saveGuest({
			title: title || t('newTask'),
			model: session.model,
			result: session.result ?? undefined,
			what_if_items: session.whatIfItems.length
				? (session.whatIfItems as GuestWhatIfRow[])
				: undefined,
			updated_at: new Date().toISOString()
		});
	}

	function initFromGuest(guest: ReturnType<typeof loadGuest>) {
		if (guest?.model) {
			title = guest.title || t('newTask');
			session.hydrate({
				model: guest.model as Model,
				result: (guest.result as SolveResult | undefined) ?? null,
				whatIfItems: guest.what_if_items ?? []
			});
			return;
		}
		title = t('newTask');
		session.hydrate({ model: createBlankModel(), result: null, whatIfItems: [] });
		persist();
	}

	onMount(() => {
		session.loadRoundPref();
		initFromGuest(loadGuest());
	});

	function onModelChange(next: Model) {
		session.replaceModel(next);
		persist();
	}

	function onWhatIfChange(
		field: Parameters<typeof session.updateWhatIf>[0],
		raw: string
	) {
		session.updateWhatIf(field, raw);
		persist();
	}

	async function doSolve() {
		const cycle = await session.runSolveCycle(localTransport);
		if (cycle) persist();
	}
</script>

{#if !session.model}
	<p class="text-text-muted">…</p>
{:else}
	<SolveWorkspace
		{session}
		{showLoginCta}
		{compact}
		{onModelChange}
		{onWhatIfChange}
		onSolve={doSolve}
	/>
{/if}
