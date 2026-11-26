import type { User } from '@supabase/supabase-js';
import { supabase } from '$lib/db/supabase';

/**
 * Signed-in user from the local session store (no Auth HTTP round-trip).
 * Use this for offline-safe UI gates; reserve `getUser()` for online writes that need server validation.
 */
export async function getLocalUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}
