import { describe, expect, it } from 'vitest';
import { classifyShareIdentifier, isSelfShareIdentifier } from './share-grant';

describe('classifyShareIdentifier', () => {
  it('accepts uuid and email', () => {
    expect(classifyShareIdentifier('550e8400-e29b-41d4-a716-446655440000')).toBe('uuid');
    expect(classifyShareIdentifier('user@example.com')).toBe('email');
  });

  it('rejects empty and junk', () => {
    expect(classifyShareIdentifier('')).toBe('invalid');
    expect(classifyShareIdentifier('  ')).toBe('invalid');
    expect(classifyShareIdentifier('not-an-email')).toBe('invalid');
  });
});

describe('isSelfShareIdentifier', () => {
  const self = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'me@example.com',
  };

  it('detects self by uuid or email', () => {
    expect(isSelfShareIdentifier(self.id, self)).toBe(true);
    expect(isSelfShareIdentifier('ME@example.com', self)).toBe(true);
  });

  it('allows other users', () => {
    expect(isSelfShareIdentifier('660e8400-e29b-41d4-a716-446655440000', self)).toBe(false);
    expect(isSelfShareIdentifier('other@example.com', self)).toBe(false);
  });
});
