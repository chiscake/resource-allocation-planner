import { supabase } from '$lib/db/supabase';

export type PublishStatus = 'pending' | 'approved' | null;

export type TemplatePublishRow = {
	id: string;
	title: string;
	owner_id: string | null;
	system_kind: string | null;
	publish_status: PublishStatus;
};

function rpcError(error: { message: string } | null): string | undefined {
	return error?.message;
}

export async function requestTemplatePublish(id: string): Promise<{ error?: string }> {
	const { error } = await supabase.rpc('request_template_publish', { p_id: id });
	const msg = rpcError(error);
	return msg ? { error: msg } : {};
}

export async function withdrawTemplatePublish(id: string): Promise<{ error?: string }> {
	const { error } = await supabase.rpc('withdraw_template_publish', { p_id: id });
	const msg = rpcError(error);
	return msg ? { error: msg } : {};
}

export async function unpublishTemplate(id: string): Promise<{ error?: string }> {
	const { error } = await supabase.rpc('unpublish_template', { p_id: id });
	const msg = rpcError(error);
	return msg ? { error: msg } : {};
}

export async function moderateTemplatePublish(
	id: string,
	action: 'approve' | 'reject'
): Promise<{ error?: string }> {
	const { error } = await supabase.rpc('moderate_template_publish', {
		p_id: id,
		p_action: action
	});
	const msg = rpcError(error);
	return msg ? { error: msg } : {};
}

export async function publishTemplateDirect(id: string): Promise<{ error?: string }> {
	const { error } = await supabase.rpc('publish_template_direct', { p_id: id });
	const msg = rpcError(error);
	return msg ? { error: msg } : {};
}

export function isPublishedCatalog(row: {
	system_kind: string | null;
	publish_status: PublishStatus;
}): boolean {
	return row.system_kind === 'public_repo' && row.publish_status === 'approved';
}

export function isPublishPending(row: { publish_status: PublishStatus }): boolean {
	return row.publish_status === 'pending';
}

export function canEditTemplateContent(row: {
	system_kind: string | null;
	publish_status: PublishStatus;
}): boolean {
	return row.system_kind == null && (row.publish_status == null || row.publish_status === 'pending');
}
