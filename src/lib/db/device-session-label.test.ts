import { describe, expect, it } from 'vitest';
import {
  buildDeviceLabel,
  detectOsFamily,
  describeDeviceFromUa,
  sessionIdFromAccessToken,
  sortDeviceSessions,
} from './device-session-label';

describe('detectOsFamily', () => {
  it('detects common families', () => {
    expect(detectOsFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectOsFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('macos');
    expect(detectOsFamily('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectOsFamily('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
    expect(detectOsFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(detectOsFamily('curl/8.0')).toBe('other');
  });
});

describe('buildDeviceLabel', () => {
  it('joins OS and channel', () => {
    expect(buildDeviceLabel('windows', 'web')).toBe('Windows · веб');
    expect(buildDeviceLabel('windows', 'tauri')).toBe('Windows · приложение');
    expect(buildDeviceLabel('android', 'web')).toBe('Android · веб');
  });
});

describe('describeDeviceFromUa', () => {
  it('returns family and label', () => {
    expect(describeDeviceFromUa('Mozilla/5.0 (Windows NT 10.0)', 'web')).toEqual({
      os_family: 'windows',
      label: 'Windows · веб',
    });
  });
});

describe('sortDeviceSessions', () => {
  it('puts current session first then by last_seen desc', () => {
    const rows = [
      { auth_session_id: 'a', last_seen_at: '2026-01-03T00:00:00.000Z' },
      { auth_session_id: 'b', last_seen_at: '2026-01-05T00:00:00.000Z' },
      { auth_session_id: 'c', last_seen_at: '2026-01-04T00:00:00.000Z' },
    ];
    expect(sortDeviceSessions(rows, 'c').map((r) => r.auth_session_id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by last_seen only when current unknown', () => {
    const rows = [
      { auth_session_id: 'a', last_seen_at: '2026-01-01T00:00:00.000Z' },
      { auth_session_id: 'b', last_seen_at: '2026-01-02T00:00:00.000Z' },
    ];
    expect(sortDeviceSessions(rows, null).map((r) => r.auth_session_id)).toEqual(['b', 'a']);
  });
});

describe('sessionIdFromAccessToken', () => {
  it('reads session_id claim', () => {
    const payload = btoa(JSON.stringify({ session_id: '550e8400-e29b-41d4-a716-446655440000' }));
    const token = `hdr.${payload}.sig`;
    expect(sessionIdFromAccessToken(token)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns null for junk', () => {
    expect(sessionIdFromAccessToken(null)).toBeNull();
    expect(sessionIdFromAccessToken('not-a-jwt')).toBeNull();
  });
});
