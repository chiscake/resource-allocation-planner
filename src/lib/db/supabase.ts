import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

const url = env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const supabase: SupabaseClient = createClient(url, key);
