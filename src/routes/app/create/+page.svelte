<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/db/supabase';
	import {
		createSolveNode,
		modelFromTemplate
	} from '$lib/db/create-solve-node';
	import {
		blankTaskDraft,
		clearTaskDraft,
		loadTaskDraft,
		saveTaskDraft,
		type TaskDraft
	} from '$lib/db/task-draft';
	import { recordPublicTemplateUse } from '$lib/db/template-uses';
	import { solveModel, runMutations } from '$lib/api/solve';
	import { cloneModel, type Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import SolveWorkspace from '$lib/components/model/SolveWorkspace.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import {
		createSolveSession,
		type SolveTransport
	} from '$lib/components/model/solve-session.svelte';

	let title = $state(t('newTask'));
	let draftHint = $state(true);
	let ready = $state(false);
	const session = createSolveSession();

	const cloudTransport: SolveTransport = {
		solve: (model, method) => solveModel(model, method),
		runMutations: (model, mutations, method) => runMutations(model, mutations, method)
	};

	function persistLocal() {
		if (!session.model) return;
		const draft: TaskDraft = {
			title: title.trim() || t('newTask'),
			model: cloneModel(session.model),
			templateId: page.url.searchParams.get('template'),
			activeTab: session.activeTab,
			includeSensitivity: session.includeSensitivity,
			updated_at: new Date().toISOString()
		};
		saveTaskDraft(draft);
	}

	function applyDraft(draft: TaskDraft) {
		title = draft.title || t('newTask');
		session.hydrate({
			model: draft.model,
			result: null,
			activeTab: draft.activeTab ?? 'plan',
			includeSensitivity: draft.includeSensitivity ?? false,
			whatIfItems: []
		});
	}

	async function loadTemplateIntoDraft(templateId: string): Promise<boolean> {
		const { data, error: qErr } = await supabase
			.from('templates')
			.select('id, title, model, what_if, system_kind')
			.eq('id', templateId)
			.is('deleted_at', null)
			.single();
		if (qErr || !data) {
			session.error = qErr?.message ?? t('notFound');
			return false;
		}
		await recordPublicTemplateUse(templateId);
		applyDraft({
			title: data.title,
			model: modelFromTemplate(data),
			templateId,
			activeTab: 'plan',
			includeSensitivity: false,
			updated_at: new Date().toISOString()
		});
		persistLocal();
		return true;
	}

	onMount(() => {
		void (async () => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) {
				await goto('/login');
				return;
			}
			session.loadRoundPref();
			const templateId = page.url.searchParams.get('template');
			if (templateId) {
				const ok = await loadTemplateIntoDraft(templateId);
				if (!ok) {
					const existing = loadTaskDraft();
					applyDraft(existing ?? blankTaskDraft());
				}
			} else {
				const existing = loadTaskDraft();
				applyDraft(existing ?? blankTaskDraft());
				persistLocal();
			}
			ready = true;
		})();
	});

	function onModelChange(next: Model) {
		session.replaceModel(next);
		persistLocal();
	}

	function onWhatIfChange(
		field: Parameters<typeof session.updateWhatIf>[0],
		raw: string
	) {
		session.updateWhatIf(field, raw);
		persistLocal();
	}

	function renameDraft(nextTitle: string) {
		const trimmed = nextTitle.trim();
		if (!trimmed) return;
		title = trimmed;
		persistLocal();
	}

	async function doSolve() {
		let createdId: string | null = null;
		const cycle = await session.runSolveCycle(cloudTransport, {
			afterSolve: async ({ model, result, response }) => {
				const created = await createSolveNode(model, title.trim() || t('newTask'), {
					result: result ?? null,
					solver_meta: response.solver_meta ?? null
				});
				if ('error' in created) {
					session.error = created.error;
					persistLocal();
					return false;
				}
				createdId = created.id;
				return true;
			}
		});
		if (!cycle || !createdId) return;

		if (cycle.mutationsResponse?.status === 'done') {
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (user) {
				const rows = cycle.mutationsResponse.items.map((item) => ({
					owner_id: user.id,
					parent_id: createdId,
					kind: 'sensitivity',
					title: item.mutation.label ?? item.mutation.kind,
					model: item.model,
					mutation: item.mutation,
					result: item.response.result ?? null,
					solver_meta: item.response.solver_meta,
					what_if_generation: 1
				}));
				await supabase.from('solve_nodes').insert(rows);
			}
		}

		clearTaskDraft();
		await goto(`/app/task/${createdId}`, { replaceState: true });
	}
</script>

{#if !ready || !session.model}
	<p class="text-sm text-text-muted">…</p>
{:else}
	<section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
		<PageHeader
			title={title}
			editable
			ontitlecommit={renameDraft}
			description={draftHint ? t('draftNotSavedHint') : undefined}
		/>

		<SolveWorkspace
			{session}
			{onModelChange}
			{onWhatIfChange}
			onSolve={doSolve}
		>
			{#snippet matrixFooter()}
				<p class="mt-3 text-xs text-text-soft">{t('draftPersistOnSolve')}</p>
			{/snippet}
		</SolveWorkspace>
	</section>
{/if}
