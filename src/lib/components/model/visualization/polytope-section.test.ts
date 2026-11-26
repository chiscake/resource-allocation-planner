import { describe, expect, it } from 'vitest';
import { createTask13Model } from '$lib/domain/task13';
import {
  computeEdges,
  computeFaces2Skeleton,
  computeSection3d,
  computeVertices,
  getAllConstraints,
} from './polytope';
import { buildGaScene } from './ga-adapter';
import { buildLpScene } from './lp-adapter';
import { pointTooltipCoords, sceneDisplayAxes } from './scene-axes';

describe('computeSection3d', () => {
  it('returns a non-empty slice for Task 13 at mid x4', () => {
    const model = createTask13Model();
    const cons = model.resources.map((_, i) => ({ a: model.A[i], b: model.b[i] }));
    const mid = 5;
    const section = computeSection3d(cons, 4, [0, 1, 2], 3, mid);
    expect(section.feasible).toBe(true);
    expect(section.modelVerts.length).toBeGreaterThan(0);
    for (const v of section.modelVerts) {
      expect(v[3]).toBeCloseTo(mid, 6);
    }
    expect(section.faces.length).toBeGreaterThan(0);
  });

  it('changes geometry when section value changes', () => {
    const model = createTask13Model();
    const cons = model.resources.map((_, i) => ({ a: model.A[i], b: model.b[i] }));
    const a = computeSection3d(cons, 4, [0, 1, 2], 3, 2);
    const b = computeSection3d(cons, 4, [0, 1, 2], 3, 8);
    expect(a.modelVerts.length).toBeGreaterThan(0);
    expect(b.modelVerts.length).toBeGreaterThan(0);
    const key = (verts: number[][]) =>
      verts
        .map((v) =>
          v
            .slice(0, 3)
            .map((x) => x.toFixed(3))
            .join(','),
        )
        .sort()
        .join('|');
    expect(key(a.modelVerts)).not.toEqual(key(b.modelVerts));
  });

  it('rejects overlapping display/section axes', () => {
    const model = createTask13Model();
    const cons = model.resources.map((_, i) => ({ a: model.A[i], b: model.b[i] }));
    const bad = computeSection3d(cons, 4, [0, 1, 3], 3, 2);
    expect(bad.feasible).toBe(false);
    expect(bad.modelVerts).toHaveLength(0);
  });
});

describe('buildLpScene section3d', () => {
  it('rebuilds faces when sectionValue changes (slider)', () => {
    const model = createTask13Model();
    const s1 = buildLpScene(model, null, {
      mode: 'section3d',
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      sectionAxis: 3,
      sectionValue: 2,
    });
    const s2 = buildLpScene(model, null, {
      mode: 'section3d',
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      sectionAxis: 3,
      sectionValue: 8,
    });
    const faces1 = s1.frames[0]?.faces ?? [];
    const faces2 = s2.frames[0]?.faces ?? [];
    expect(faces1.length).toBeGreaterThan(0);
    expect(faces2.length).toBeGreaterThan(0);
    const tip = (faces: typeof faces1) =>
      faces
        .flatMap((f) => f.points)
        .map((p) =>
          p
            .slice(0, 3)
            .map((x) => x.toFixed(3))
            .join(','),
        )
        .sort()
        .join('|');
    expect(tip(faces1)).not.toEqual(tip(faces2));
    expect(s1.sectionValue).toBe(2);
    expect(s2.sectionValue).toBe(8);
  });

  it('embeds exact3d faces on selected axes (not always 0,1,2)', () => {
    const model = createTask13Model();
    const scene = buildLpScene(model, null, {
      mode: 'exact3d',
      axisX: 1,
      axisY: 2,
      axisZ: 3,
    });
    const faces = scene.frames[0]?.faces ?? [];
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      for (const p of face.points) {
        expect(p[0]).toBeCloseTo(0, 6); // unused product pinned to 0
      }
    }
    expect(sceneDisplayAxes(scene)).toEqual([1, 2, 3]);
  });
});

describe('pointTooltipCoords', () => {
  it('lists full vector with scene axes highlighted', () => {
    const rows = pointTooltipCoords([1, 2, 3, 4], ['A', 'B', 'C', 'D'], [0, 2, 3]);
    expect(rows).toEqual([
      { name: 'A', value: 1, highlight: true },
      { name: 'B', value: 2, highlight: false },
      { name: 'C', value: 3, highlight: true },
      { name: 'D', value: 4, highlight: true },
    ]);
  });
});

describe('project4d faces', () => {
  it('enumerates 2-faces for Task 13 4D polytope', () => {
    const model = createTask13Model();
    const cons = model.resources.map((_, i) => ({ a: model.A[i], b: model.b[i] }));
    const all = getAllConstraints(cons, 4);
    const verts = computeVertices(all, 4);
    const edges = computeEdges(verts, 4);
    const faces = computeFaces2Skeleton(verts, all, 4);
    expect(verts.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face.length).toBeGreaterThanOrEqual(3);
      expect(face[0]).toHaveLength(4);
    }
  });

  it('LP and GA project4d scenes include ОДР faces', () => {
    const model = createTask13Model();
    const lp = buildLpScene(model, null, { mode: 'project4d' });
    const ga = buildGaScene(model, null, { mode: 'project4d' });
    expect((lp.frames[0]?.faces ?? []).length).toBeGreaterThan(0);
    expect((lp.frames[0]?.lines ?? []).some((l) => l.kind === 'edge')).toBe(true);
    expect((ga.frames[0]?.faces ?? []).length).toBeGreaterThan(0);
    expect((ga.frames[0]?.lines ?? []).some((l) => l.kind === 'edge')).toBe(true);
  });
});
