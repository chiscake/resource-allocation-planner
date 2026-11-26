import { describe, expect, it } from 'vitest';
import {
  mutationForkProvenance,
  mutationForkTitle,
  resultZ,
  taskForkProvenance,
} from './fork-provenance';

describe('fork-provenance', () => {
  it('composes mutation title with middle dot', () => {
    expect(mutationForkTitle('Task', 'Mut')).toBe('Task · Mut');
  });

  it('builds task provenance snapshot', () => {
    expect(taskForkProvenance('rid', 'T', { Z: 42 })).toEqual({
      forked_from_id: 'rid',
      fork_kind: 'task',
      fork_source_title: 'T',
      fork_source_z: 42,
    });
  });

  it('builds mutation provenance snapshot', () => {
    expect(mutationForkProvenance('sid', 'T', 'M', { Z: 1 })).toEqual({
      forked_from_id: 'sid',
      fork_kind: 'mutation',
      fork_source_title: 'T · M',
      fork_source_z: 1,
    });
  });

  it('resultZ rejects non-finite', () => {
    expect(resultZ(null)).toBeNull();
    expect(resultZ({ Z: Number.NaN })).toBeNull();
  });
});
