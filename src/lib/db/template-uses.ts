import { supabase } from '$lib/db/supabase';

/** Upsert last_used_at for a public_repo template (no-op if not signed in / not public). */
export async function recordPublicTemplateUse(templateId: string): Promise<void> {
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return;

	const { data: tpl } = await supabase
		.from('templates')
		.select('id, system_kind')
		.eq('id', templateId)
		.is('deleted_at', null)
		.maybeSingle();
	if (!tpl || tpl.system_kind !== 'public_repo') return;

	const now = new Date().toISOString();
	await supabase.from('template_uses').upsert(
		{
			user_id: user.id,
			template_id: templateId,
			last_used_at: now
		},
		{ onConflict: 'user_id,template_id' }
	);
}
