import { supabase } from './supabase';

export async function writeAudit(input: {
	action: string;
	entity_type: string;
	entity_id?: string | null;
	org_id?: string | null;
	target_user_id?: string | null;
	visibility_from?: string | null;
	visibility_to?: string | null;
}) {
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return;
	await supabase.from('audit_events').insert({
		actor_id: user.id,
		action: input.action,
		entity_type: input.entity_type,
		entity_id: input.entity_id ?? null,
		org_id: input.org_id ?? null,
		target_user_id: input.target_user_id ?? null,
		visibility_from: input.visibility_from ?? null,
		visibility_to: input.visibility_to ?? null
	});
}
