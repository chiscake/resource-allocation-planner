const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type ShareIdentifierKind = 'uuid' | 'email' | 'invalid';

export function classifyShareIdentifier(raw: string): ShareIdentifierKind {
  const value = raw.trim();
  if (!value) return 'invalid';
  if (UUID_RE.test(value)) return 'uuid';
  if (EMAIL_RE.test(value)) return 'email';
  return 'invalid';
}

export function isSelfShareIdentifier(
  raw: string,
  self: { id: string; email: string | null | undefined },
): boolean {
  const value = raw.trim();
  const kind = classifyShareIdentifier(value);
  if (kind === 'uuid') return value.toLowerCase() === self.id.toLowerCase();
  if (kind === 'email') {
    const email = self.email?.trim().toLowerCase() ?? '';
    return email !== '' && value.toLowerCase() === email;
  }
  return false;
}
