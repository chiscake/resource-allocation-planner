import { supabase } from '$lib/db/supabase';
import { writeAudit } from '$lib/db/audit';
import { isTauri } from '$lib/platform';
import {
  describeDeviceFromUa,
  sessionIdFromAccessToken,
  sortDeviceSessions,
  type DeviceSessionRow,
} from '$lib/db/device-session-label';

export type {
  DeviceSessionRow,
  DeviceOsFamily,
  DevicePlatform,
} from '$lib/db/device-session-label';
export {
  buildDeviceLabel,
  detectOsFamily,
  describeDeviceFromUa,
  sessionIdFromAccessToken,
  sortDeviceSessions,
} from '$lib/db/device-session-label';

const PRESENCE_THROTTLE_MS = 10 * 60 * 1000;
let lastPresenceAt = 0;

export function resetPresenceThrottleForTests() {
  lastPresenceAt = 0;
}

async function currentAccessContext(): Promise<{
  userId: string;
  accessToken: string;
  authSessionId: string;
} | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user || !session.access_token) return null;
  const authSessionId = sessionIdFromAccessToken(session.access_token);
  if (!authSessionId) return null;
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    authSessionId,
  };
}

export async function upsertDevicePresence(opts?: { force?: boolean }): Promise<void> {
  const now = Date.now();
  if (!opts?.force && lastPresenceAt > 0 && now - lastPresenceAt < PRESENCE_THROTTLE_MS) {
    return;
  }

  const ctx = await currentAccessContext();
  if (!ctx) return;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = isTauri() ? 'tauri' : 'web';
  const { os_family, label } = describeDeviceFromUa(ua, platform);
  const seenAt = new Date().toISOString();

  const { error } = await supabase.from('device_sessions').upsert(
    {
      user_id: ctx.userId,
      auth_session_id: ctx.authSessionId,
      platform,
      os_family,
      label,
      user_agent: ua || null,
      last_seen_at: seenAt,
    },
    { onConflict: 'user_id,auth_session_id' },
  );

  if (!error) lastPresenceAt = now;
}

export async function reconcileDeviceSessions(): Promise<number> {
  const { data, error } = await supabase.rpc('reconcile_device_sessions');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function listDeviceSessions(): Promise<{
  rows: DeviceSessionRow[];
  currentAuthSessionId: string | null;
}> {
  const ctx = await currentAccessContext();
  const currentAuthSessionId = ctx?.authSessionId ?? null;

  const { data, error } = await supabase
    .from('device_sessions')
    .select(
      'id, user_id, auth_session_id, platform, os_family, label, user_agent, created_at, last_seen_at',
    )
    .order('last_seen_at', { ascending: false });

  if (error) throw error;
  const rows = sortDeviceSessions((data ?? []) as DeviceSessionRow[], currentAuthSessionId);
  return { rows, currentAuthSessionId };
}

export async function revokeDeviceSession(authSessionId: string): Promise<void> {
  const ctx = await currentAccessContext();
  if (!ctx) throw new Error('not authenticated');
  if (authSessionId === ctx.authSessionId) {
    throw new Error('cannot_revoke_current');
  }

  const { data, error } = await supabase.functions.invoke('session-revoke', {
    body: { auth_session_id: authSessionId },
  });

  if (error) {
    throw new Error(error.message || 'revoke failed');
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
}

export async function revokeOtherDeviceSessions(): Promise<void> {
  const ctx = await currentAccessContext();
  if (!ctx) throw new Error('not authenticated');

  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw error;

  await supabase
    .from('device_sessions')
    .delete()
    .eq('user_id', ctx.userId)
    .neq('auth_session_id', ctx.authSessionId);

  await writeAudit({
    action: 'session_revoke_others',
    entity_type: 'device_sessions',
    entity_id: null,
    target_user_id: ctx.userId,
  });

  lastPresenceAt = 0;
  await upsertDevicePresence({ force: true });
}

/** Auth events + focus throttle for signed-in shells. */
export function startDevicePresenceTracking(): () => void {
  void upsertDevicePresence({ force: true });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      lastPresenceAt = 0;
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      void upsertDevicePresence({ force: true });
    }
  });

  const onFocus = () => {
    void upsertDevicePresence();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
  }

  return () => {
    subscription.unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
    }
  };
}
