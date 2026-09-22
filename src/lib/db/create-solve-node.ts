import { goto } from '$app/navigation';
import { createBlankModel, type Model } from '$lib/domain';
import { supabase } from '$lib/db/supabase';
import { saveGuestBlank, saveGuestModel } from '$lib/db/guest';
import { t } from '$lib/i18n';

export type CreateSolveNodeOk = { id: string };
export type CreateSolveNodeErr = { error: string };
export type CreateSolveNodeResult = CreateSolveNodeOk | CreateSolveNodeErr;

type TemplateRow = {
	id: string;
	title: string;
	model: Model;
	what_if?: Model['what_if_defaults'] | null;
};

/** Snapshot a template row into a solve_nodes model (copies what_if → what_if_defaults). */
export function modelFromTemplate(row: Pick<TemplateRow, 'model' | 'what_if'>): Model {
	const snapshot = structuredClone(row.model);
	if (row.what_if && typeof row.what_if === 'object') {
		snapshot.what_if_defaults = structuredClone(row.what_if);
	}
	return snapshot;
}

export async function createSolveNode(
	model: Model,
	title: string
): Promise<CreateSolveNodeResult> {
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) {
		return { error: t('noSession') };
	}
	const snapshot = structuredClone(model);
	const { data, error } = await supabase
		.from('solve_nodes')
		.insert({
			owner_id: user.id,
			title,
			kind: 'root',
			model: snapshot
		})
		.select('id')
		.single();
	if (error) {
		return { error: error.message };
	}
	return { id: data.id as string };
}

export async function createEmptySolveNode(): Promise<CreateSolveNodeResult> {
	return createSolveNode(createBlankModel(), t('newTask'));
}

export async function createSolveNodeFromTemplateId(
	templateId: string
): Promise<CreateSolveNodeResult> {
	const { data, error } = await supabase
		.from('templates')
		.select('id, title, model, what_if')
		.eq('id', templateId)
		.is('deleted_at', null)
		.single();
	if (error || !data) {
		return { error: error?.message ?? t('notFound') };
	}
	const row = data as TemplateRow;
	return createSolveNode(modelFromTemplate(row), row.title);
}

async function openGuestFromModel(model: Model, title: string): Promise<null> {
	saveGuestModel(title, model);
	await goto('/app', { replaceState: true });
	return null;
}

/** Create a root node and navigate to it (replaceState so Back skips the helper route). */
export async function createSolveNodeAndOpen(
	model: Model,
	title: string
): Promise<CreateSolveNodeErr | null> {
	const result = await createSolveNode(model, title);
	if ('error' in result) {
		if (result.error === t('noSession')) {
			return openGuestFromModel(model, title);
		}
		return result;
	}
	await goto(`/app/nodes/${result.id}`, { replaceState: true });
	return null;
}

export async function createEmptySolveNodeAndOpen(): Promise<CreateSolveNodeErr | null> {
	const result = await createEmptySolveNode();
	if ('error' in result) {
		if (result.error === t('noSession')) {
			saveGuestBlank(t('newTask'));
			await goto('/app', { replaceState: true });
			return null;
		}
		return result;
	}
	await goto(`/app/nodes/${result.id}`, { replaceState: true });
	return null;
}

export async function useTemplateAndOpen(
	templateId: string
): Promise<CreateSolveNodeErr | null> {
	const { data, error } = await supabase
		.from('templates')
		.select('id, title, model, what_if')
		.eq('id', templateId)
		.is('deleted_at', null)
		.single();
	if (error || !data) {
		return { error: error?.message ?? t('notFound') };
	}
	const row = data as TemplateRow;
	const model = modelFromTemplate(row);
	const result = await createSolveNode(model, row.title);
	if ('error' in result) {
		if (result.error === t('noSession')) {
			return openGuestFromModel(model, row.title);
		}
		return result;
	}
	await goto(`/app/nodes/${result.id}`, { replaceState: true });
	return null;
}
