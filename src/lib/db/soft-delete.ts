import { writeAudit } from '$lib/db/audit';
import { supabase } from '$lib/db/supabase';

async function revokeNodeShares(nodeId: string, orgId: string | null) {
	const now = new Date().toISOString();
	const { data: links } = await supabase
		.from('share_links')
		.select('id')
		.eq('node_id', nodeId)
		.is('revoked_at', null);
	const { data: grants } = await supabase
		.from('share_grants')
		.select('id')
		.eq('node_id', nodeId)
		.is('revoked_at', null);
	if (!links?.length && !grants?.length) return;

	await supabase
		.from('share_links')
		.update({ revoked_at: now })
		.eq('node_id', nodeId)
		.is('revoked_at', null);
	await supabase
		.from('share_grants')
		.update({ revoked_at: now })
		.eq('node_id', nodeId)
		.is('revoked_at', null);
	await writeAudit({
		action: 'share_revoke',
		entity_type: 'solve_node',
		entity_id: nodeId,
		org_id: orgId
	});
}

/** Soft-delete a root solve_node (revokes active shares when present). */
export async function softDeleteSolveNode(input: {
	id: string;
	org_id?: string | null;
}): Promise<{ error?: string }> {
	const now = new Date().toISOString();
	await revokeNodeShares(input.id, input.org_id ?? null);
	const { error } = await supabase
		.from('solve_nodes')
		.update({ deleted_at: now })
		.eq('id', input.id);
	if (error) return { error: error.message };
	await writeAudit({
		action: 'soft_delete',
		entity_type: 'solve_node',
		entity_id: input.id,
		org_id: input.org_id ?? null
	});
	return {};
}

/** Restore a soft-deleted solve_node (org nodes become private). */
export async function restoreSolveNode(input: {
	id: string;
	org_id?: string | null;
}): Promise<{ error?: string }> {
	const patch: Record<string, unknown> = {
		deleted_at: null,
		deleted_by_org_owner: false
	};
	if (input.org_id) {
		patch.org_visibility = 'private';
	} else {
		patch.org_visibility = null;
	}
	const { error } = await supabase.from('solve_nodes').update(patch).eq('id', input.id);
	if (error) return { error: error.message };
	await writeAudit({
		action: 'restore',
		entity_type: 'solve_node',
		entity_id: input.id,
		org_id: input.org_id ?? null
	});
	return {};
}

export async function softDeleteTemplate(id: string): Promise<{ error?: string }> {
	const now = new Date().toISOString();
	const { error } = await supabase.from('templates').update({ deleted_at: now }).eq('id', id);
	if (error) return { error: error.message };
	await writeAudit({
		action: 'soft_delete',
		entity_type: 'template',
		entity_id: id
	});
	return {};
}

export async function restoreTemplate(id: string): Promise<{ error?: string }> {
	const { error } = await supabase.from('templates').update({ deleted_at: null }).eq('id', id);
	if (error) return { error: error.message };
	await writeAudit({
		action: 'restore',
		entity_type: 'template',
		entity_id: id
	});
	return {};
}
