export type DeviceOsFamily = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other';
export type DevicePlatform = 'web' | 'tauri';

export type DeviceSessionRow = {
  id: string;
  user_id: string;
  auth_session_id: string;
  platform: DevicePlatform;
  os_family: DeviceOsFamily;
  label: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
};

const OS_LABEL_RU: Record<DeviceOsFamily, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  other: 'другое устройство',
};

export function detectOsFamily(userAgent: string): DeviceOsFamily {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'other';
}

/** Coarse product label: «Windows · веб» / «Windows · приложение». */
export function buildDeviceLabel(osFamily: DeviceOsFamily, platform: DevicePlatform): string {
  const os = OS_LABEL_RU[osFamily];
  const channel = platform === 'tauri' ? 'приложение' : 'веб';
  return `${os} · ${channel}`;
}

export function describeDeviceFromUa(
  userAgent: string,
  platform: DevicePlatform,
): { os_family: DeviceOsFamily; label: string } {
  const os_family = detectOsFamily(userAgent);
  return { os_family, label: buildDeviceLabel(os_family, platform) };
}

/** Current session first; then newest last_seen_at. */
export function sortDeviceSessions<T extends { auth_session_id: string; last_seen_at: string }>(
  rows: T[],
  currentAuthSessionId: string | null,
): T[] {
  return [...rows].sort((a, b) => {
    const aCur = currentAuthSessionId != null && a.auth_session_id === currentAuthSessionId;
    const bCur = currentAuthSessionId != null && b.auth_session_id === currentAuthSessionId;
    if (aCur !== bCur) return aCur ? -1 : 1;
    return Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at);
  });
}

export function sessionIdFromAccessToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const jsonStr =
      typeof atob === 'function'
        ? atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const claims = JSON.parse(jsonStr) as { session_id?: unknown };
    return typeof claims.session_id === 'string' && claims.session_id.trim()
      ? claims.session_id.trim()
      : null;
  } catch {
    return null;
  }
}
