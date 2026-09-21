import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';

/* ============================================================================
   МАТЕМАТИЧЕСКОЕ ЯДРО
   ========================================================================== */

const EPS = 1e-6;

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// Решение системы линейных уравнений методом Гаусса с выбором главного элемента
function solveLinear(Amat, bvec) {
  const n = Amat.length;
  const M = Amat.map((row, i) => [...row, bvec[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxVal) { maxVal = Math.abs(M[r][col]); pivotRow = r; }
    }
    if (maxVal < 1e-9) return null; // вырожденная система
    if (pivotRow !== col) { const tmp = M[col]; M[col] = M[pivotRow]; M[pivotRow] = tmp; }
    const pv = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r !== col) {
        const f = M[r][col];
        if (Math.abs(f) > 1e-12) for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
      }
    }
  }
  return M.map((row) => row[n]);
}

function kCombinations(arr, k) {
  const results = [];
  const combo = [];
  (function backtrack(start) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1);
      combo.pop();
    }
  })(0);
  return results;
}

// Все полупространства a·x <= b, включая неотрицательность координат
function getAllConstraints(userConstraints, dim) {
  const all = userConstraints.map((c) => ({ a: c.a.slice(0, dim), b: c.b, kind: 'user' }));
  for (let i = 0; i < dim; i++) {
    const a = new Array(dim).fill(0);
    a[i] = -1;
    all.push({ a, b: 0, kind: 'nonneg', axis: i });
  }
  return all;
}

// Перечисление вершин политопа: пересечение всех наборов из dim гиперплоскостей,
// прошедших проверку на допустимость относительно всех ограничений
function computeVertices(allConstraints, dim) {
  const idxs = allConstraints.map((_, i) => i);
  const combos = kCombinations(idxs, dim);
  const vertices = [];
  for (const combo of combos) {
    const A = combo.map((i) => allConstraints[i].a);
    const b = combo.map((i) => allConstraints[i].b);
    const sol = solveLinear(A, b);
    if (!sol) continue;
    let feasible = true;
    const active = [];
    for (let i = 0; i < allConstraints.length; i++) {
      const { a, b: bi } = allConstraints[i];
      const val = dot(a, sol);
      if (val > bi + 1e-5) { feasible = false; break; }
      if (Math.abs(val - bi) < 1e-4) active.push(i);
    }
    if (!feasible) continue;
    const dup = vertices.find((v) => v.point.every((p, k) => Math.abs(p - sol[k]) < 1e-4));
    if (!dup) vertices.push({ point: sol, active });
  }
  return vertices;
}

// Рёбра: две вершины соединены, если у них не менее (dim-1) общих активных ограничений
function computeEdges(vertices, dim) {
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const common = vertices[i].active.filter((x) => vertices[j].active.includes(x));
      if (common.length >= dim - 1) edges.push([i, j]);
    }
  }
  return edges;
}

// Пересечения гиперплоскости c·x = target с рёбрами политопа (для визуализации среза Z)
function computeCrossings(vertices, edges, coeffs, target) {
  const pts = [];
  for (const [i, j] of edges) {
    const vi = vertices[i].point, vj = vertices[j].point;
    const di = dot(coeffs, vi) - target;
    const dj = dot(coeffs, vj) - target;
    if (Math.abs(di) < 1e-7 && Math.abs(dj) < 1e-7) continue;
    if ((di >= -1e-7 && dj <= 1e-7) || (di <= 1e-7 && dj >= -1e-7)) {
      if (Math.abs(di - dj) < 1e-9) continue;
      let t = di / (di - dj);
      t = Math.min(1, Math.max(0, t));
      pts.push(vi.map((v, k) => v + (vj[k] - v) * t));
    }
  }
  return pts;
}

/* --------------------------- Симплекс-метод -------------------------------- */

function varLabel(idx, n) { return idx < n ? `x${idx + 1}` : `s${idx - n + 1}`; }

function simplexSolve(cInput, userConstraints, type, maxIter = 30) {
  const n = 4, m = userConstraints.length;
  const c = type === 'max' ? cInput.slice() : cInput.map((v) => -v);
  let tableau = userConstraints.map((con, i) => {
    const row = new Array(n + m + 1).fill(0);
    for (let j = 0; j < n; j++) row[j] = con.a[j];
    row[n + i] = 1;
    row[n + m] = con.b;
    return row;
  });
  let objRow = new Array(n + m + 1).fill(0);
  for (let j = 0; j < n; j++) objRow[j] = -c[j];
  let basis = userConstraints.map((_, i) => n + i);

  const history = [];
  const snap = (status, pivot) => {
    const x = new Array(n).fill(0);
    for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = tableau[i][n + m];
    const zInt = objRow[n + m];
    const z = type === 'max' ? zInt : -zInt;
    return { tableau: tableau.map((r) => r.slice()), objRow: objRow.slice(), basis: basis.slice(), x, z, status, pivot, n, m };
  };
  history.push(snap('initial', null));

  let iter = 0;
  while (iter < maxIter) {
    let pivotCol = -1, minVal = -1e-7;
    for (let j = 0; j < n + m; j++) if (objRow[j] < minVal) { minVal = objRow[j]; pivotCol = j; }
    if (pivotCol === -1) { history[history.length - 1].status = 'optimal'; break; }

    let pivotRow = -1, minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      if (tableau[i][pivotCol] > 1e-7) {
        const ratio = tableau[i][n + m] / tableau[i][pivotCol];
        if (ratio < minRatio - 1e-9 || (Math.abs(ratio - minRatio) < 1e-9 && (pivotRow === -1 || basis[i] < basis[pivotRow]))) {
          minRatio = ratio; pivotRow = i;
        }
      }
    }
    if (pivotRow === -1) {
      history.push(snap('unbounded', { row: null, col: pivotCol, entering: pivotCol, leaving: null }));
      break;
    }
    const leaving = basis[pivotRow];
    const pv = tableau[pivotRow][pivotCol];
    for (let j = 0; j < n + m + 1; j++) tableau[pivotRow][j] /= pv;
    for (let i = 0; i < m; i++) {
      if (i !== pivotRow) {
        const f = tableau[i][pivotCol];
        if (Math.abs(f) > 1e-12) for (let j = 0; j < n + m + 1; j++) tableau[i][j] -= f * tableau[pivotRow][j];
      }
    }
    const fo = objRow[pivotCol];
    for (let j = 0; j < n + m + 1; j++) objRow[j] -= fo * tableau[pivotRow][j];
    basis[pivotRow] = pivotCol;
    history.push(snap('in-progress', { row: pivotRow, col: pivotCol, entering: pivotCol, leaving }));
    iter++;
  }
  if (iter >= maxIter && history[history.length - 1].status === 'in-progress') {
    history[history.length - 1].status = 'max-iter';
  }
  return history;
}

/* --------------------------- 4D-геометрия ----------------------------------- */

const cs = (theta) => ({ c: Math.cos(theta), s: Math.sin(theta) });

// Приводит угол к диапазону (-π, π], чтобы значение не "убегало" за пределы слайдера
const wrapAngle = (a) => {
  const twoPi = Math.PI * 2;
  let r = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return r;
};

function rotate4D(p, ang) {
  let [x, y, z, w] = p;
  { const { c, s } = cs(ang.xy); const nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny; }
  { const { c, s } = cs(ang.xz); const nx = x * c - z * s, nz = x * s + z * c; x = nx; z = nz; }
  { const { c, s } = cs(ang.xw); const nx = x * c - w * s, nw = x * s + w * c; x = nx; w = nw; }
  { const { c, s } = cs(ang.yz); const ny = y * c - z * s, nz = y * s + z * c; y = ny; z = nz; }
  { const { c, s } = cs(ang.yw); const ny = y * c - w * s, nw = y * s + w * c; y = ny; w = nw; }
  { const { c, s } = cs(ang.zw); const nz = z * c - w * s, nw = z * s + w * c; z = nz; w = nw; }
  return [x, y, z, w];
}

function rotate3D(p, ang) {
  let [x, y, z] = p;
  { const { c, s } = cs(ang.xy); const nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny; }
  { const { c, s } = cs(ang.xz); const nx = x * c - z * s, nz = x * s + z * c; x = nx; z = nz; }
  { const { c, s } = cs(ang.yz); const ny = y * c - z * s, nz = y * s + z * c; y = ny; z = nz; }
  return [x, y, z];
}

const project4to3 = (p, d4) => { const [x, y, z, w] = p; const f = d4 / (d4 - w); return [x * f, y * f, z * f]; };
const project3to2 = (p, d3, scale, cx, cy) => {
  const [x, y, z] = p; const f = d3 / (d3 - z);
  return { x: cx + x * f * scale, y: cy - y * f * scale, depth: z };
};

function boundingCenterScale(points, targetRadius) {
  const dim = points[0]?.length || 4;
  const mins = new Array(dim).fill(Infinity), maxs = new Array(dim).fill(-Infinity);
  for (const p of points) for (let i = 0; i < dim; i++) { mins[i] = Math.min(mins[i], p[i]); maxs[i] = Math.max(maxs[i], p[i]); }
  const center = mins.map((mn, i) => (mn + maxs[i]) / 2);
  let extent = 0;
  for (let i = 0; i < dim; i++) extent = Math.max(extent, (maxs[i] - mins[i]) / 2);
  if (extent < 1e-6) extent = 1;
  const scale = targetRadius / extent;
  return { center, scale };
}

const normalize = (p, center, scale) => p.map((v, i) => (v - center[i]) * scale);

/* ============================================================================
   ПРЕСЕТЫ
   ========================================================================== */

const PRESETS = [
  {
    name: 'Гиперусечённый политоп (4 ограничения)',
    type: 'max',
    c: [3, 2, 4, 1],
    constraints: [
      { a: [1, 1, 1, 1], b: 10 },
      { a: [2, 1, 3, 0], b: 15 },
      { a: [1, 3, 0, 1], b: 12 },
      { a: [0, 1, 1, 2], b: 8 },
    ],
  },
  {
    name: 'Симметричный тессеракт-политоп',
    type: 'max',
    c: [1, 1, 1, 1],
    constraints: [
      { a: [1, 1, 0, 0], b: 6 },
      { a: [0, 0, 1, 1], b: 6 },
      { a: [1, 0, 1, 0], b: 6 },
      { a: [0, 1, 0, 1], b: 6 },
      { a: [1, 1, 1, 1], b: 10 },
    ],
  },
];

/* ============================================================================
   МЕЛКИЕ УТИЛИТЫ UI
   ========================================================================== */

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function IconPlay() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>); }
function IconPause() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>); }
function IconPrev() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>); }
function IconNext() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>); }
function IconReset() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2L7 7l5 5V8c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>); }

/* ============================================================================
   ГЛАВНЫЙ КОМПОНЕНТ
   ========================================================================== */

export default function LP4DVisualizer() {
  const [objType, setObjType] = useState(PRESETS[0].type);
  const [c, setC] = useState(PRESETS[0].c);
  const [constraints, setConstraints] = useState(PRESETS[0].constraints);
  const [activePreset, setActivePreset] = useState(0);

  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [vizMode, setVizMode] = useState('full4d'); // 'full4d' | 'section'
  const [angles, setAngles] = useState({ xy: 0.3, xz: 0.5, xw: 0.4, yz: 0.2, yw: 0.6, zw: 0.35 });
  const [autoRotate, setAutoRotate] = useState(true);
  const [kValue, setKValue] = useState(0);
  const [showObjPlane, setShowObjPlane] = useState(true);

  const canvasRef = useRef(null);

  /* ---------------- валидация ---------------- */
  const validation = useMemo(() => {
    const errs = [];
    if (constraints.length < 3 || constraints.length > 5) errs.push('Число ограничений должно быть от 3 до 5.');
    constraints.forEach((con, i) => { if (con.b < 0) errs.push(`Ограничение №${i + 1}: требуется b ≥ 0 (двухфазный метод не используется).`); });
    return errs;
  }, [constraints]);

  /* ---------------- симплекс ---------------- */
  const simplexHistory = useMemo(() => {
    if (validation.length > 0) return null;
    try { return simplexSolve(c, constraints, objType); } catch { return null; }
  }, [c, constraints, objType, validation.length]);

  useEffect(() => { setCurrentStep(0); setIsPlaying(false); }, [c, constraints, objType]);

  useEffect(() => {
    if (!simplexHistory) return;
    if (currentStep > simplexHistory.length - 1) setCurrentStep(simplexHistory.length - 1);
  }, [simplexHistory, currentStep]);

  useEffect(() => {
    if (!isPlaying || !simplexHistory) return;
    if (currentStep >= simplexHistory.length - 1) { setIsPlaying(false); return; }
    const t = setTimeout(() => setCurrentStep((s) => Math.min(s + 1, simplexHistory.length - 1)), 950);
    return () => clearTimeout(t);
  }, [isPlaying, currentStep, simplexHistory]);

  const step = simplexHistory ? simplexHistory[Math.min(currentStep, simplexHistory.length - 1)] : null;

  /* ---------------- 4D-политоп ---------------- */
  const allConstraints4D = useMemo(() => getAllConstraints(constraints, 4), [constraints]);
  const vertices4D = useMemo(() => {
    if (validation.length > 0) return [];
    return computeVertices(allConstraints4D, 4);
  }, [allConstraints4D, validation.length]);
  const edges4D = useMemo(() => computeEdges(vertices4D, 4), [vertices4D]);

  const kMax = useMemo(() => {
    if (vertices4D.length === 0) return 10;
    return Math.max(1, ...vertices4D.map((v) => v.point[3]));
  }, [vertices4D]);

  useEffect(() => { if (kValue > kMax) setKValue(kMax); }, [kMax, kValue]);

  /* ---------------- срез x4 = k (3D) ---------------- */
  const section3D = useMemo(() => {
    if (vizMode !== 'section') return null;
    const all = [];
    let feasibleK = true;
    for (const con of constraints) {
      const a3 = [con.a[0], con.a[1], con.a[2]];
      const rhs = con.b - con.a[3] * kValue;
      if (Math.abs(a3[0]) < 1e-9 && Math.abs(a3[1]) < 1e-9 && Math.abs(a3[2]) < 1e-9) {
        if (rhs < -1e-6) feasibleK = false;
        continue;
      }
      all.push({ a: a3, b: rhs });
    }
    for (let i = 0; i < 3; i++) { const a = [0, 0, 0]; a[i] = -1; all.push({ a, b: 0 }); }
    if (!feasibleK) return { vertices: [], edges: [] };
    const verts = computeVertices(all, 3);
    const edges = computeEdges(verts, 3);
    return { vertices: verts, edges };
  }, [vizMode, constraints, kValue]);

  /* ---------------- авто-вращение ---------------- */
  useEffect(() => {
    if (!autoRotate) return;
    let raf;
    const loop = () => {
      setAngles((a) => ({
        ...a,
        xw: wrapAngle(a.xw + 0.006),
        yw: wrapAngle(a.yw + 0.0042),
        zw: wrapAngle(a.zw + 0.0035),
        xy: vizMode === 'section' ? wrapAngle(a.xy + 0.005) : a.xy,
      }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, vizMode]);

  /* ---------------- проекция + отрисовка ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);

    const gridColor = 'rgba(139,147,167,0.08)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy <= H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    const scale2D = Math.min(W, H) * 0.30;

    if (vizMode === 'full4d') {
      if (vertices4D.length === 0) return;
      const rawPts = vertices4D.map((v) => v.point);
      const { center, scale } = boundingCenterScale(rawPts, 1.3);
      const d4 = 3.4, d3 = 3.4;

      const projectPoint = (p4) => {
        const n = normalize(p4, center, scale);
        const r = rotate4D(n, angles);
        const p3 = project4to3(r, d4);
        return project3to2(p3, d3, scale2D, cx, cy);
      };

      const projVerts = vertices4D.map((v) => projectPoint(v.point));

      // рёбра (сортировка по глубине для псевдо-прозрачности)
      const edgeData = edges4D.map(([i, j]) => ({ i, j, depth: (projVerts[i].depth + projVerts[j].depth) / 2 }));
      edgeData.sort((a, b) => a.depth - b.depth);
      for (const e of edgeData) {
        const p1 = projVerts[e.i], p2 = projVerts[e.j];
        const alpha = 0.18 + 0.35 * ((e.depth + d4) / (2 * d4));
        ctx.strokeStyle = `rgba(79,209,197,${Math.max(0.12, Math.min(0.6, alpha))})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }

      // вершины
      projVerts.forEach((p) => {
        const r = 2.6 + 1.4 * ((p.depth + d4) / (2 * d4));
        ctx.fillStyle = 'rgba(139,147,167,0.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      });

      // сечение гиперплоскостью цели c·x = Z
      if (showObjPlane && step) {
        const crossings = computeCrossings(vertices4D, edges4D, c, dot(c, step.x));
        if (crossings.length >= 3) {
          const proj = crossings.map(projectPoint);
          const pcx = proj.reduce((s, p) => s + p.x, 0) / proj.length;
          const pcy = proj.reduce((s, p) => s + p.y, 0) / proj.length;
          proj.sort((a, b) => Math.atan2(a.y - pcy, a.x - pcx) - Math.atan2(b.y - pcy, b.x - pcx));
          ctx.beginPath();
          proj.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.closePath();
          ctx.fillStyle = 'rgba(232,163,61,0.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(232,163,61,0.75)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }

      // траектория симплекс-метода
      if (simplexHistory) {
        const upto = simplexHistory.slice(0, currentStep + 1);
        const trajProj = upto.map((s) => projectPoint(s.x));
        ctx.strokeStyle = 'rgba(242,103,156,0.85)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        trajProj.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        trajProj.forEach((p, idx) => {
          const isCurrent = idx === trajProj.length - 1;
          ctx.beginPath();
          ctx.fillStyle = isCurrent ? '#f2679c' : 'rgba(242,103,156,0.45)';
          if (isCurrent) { ctx.shadowColor = '#f2679c'; ctx.shadowBlur = 14; }
          ctx.arc(p.x, p.y, isCurrent ? 6.5 : 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      }
    } else {
      // ---- режим 3D-сечения x4 = k ----
      const verts = section3D?.vertices || [];
      const edges = section3D?.edges || [];
      if (verts.length === 0) {
        ctx.fillStyle = 'rgba(224,82,96,0.85)';
        ctx.font = '13px "IBM Plex Mono", monospace';
        ctx.fillText('Сечение пусто при данном k', cx - 90, cy);
        return;
      }
      const rawPts = verts.map((v) => v.point);
      const { center, scale } = boundingCenterScale(rawPts, 1.3);
      const d3 = 3.4;
      const projectPoint = (p3raw) => {
        const n = normalize(p3raw, center, scale);
        const r = rotate3D(n, angles);
        return project3to2(r, d3, scale2D, cx, cy);
      };
      const projVerts = verts.map((v) => projectPoint(v.point));

      const edgeData = edges.map(([i, j]) => ({ i, j, depth: (projVerts[i].depth + projVerts[j].depth) / 2 }));
      edgeData.sort((a, b) => a.depth - b.depth);
      for (const e of edgeData) {
        const p1 = projVerts[e.i], p2 = projVerts[e.j];
        const alpha = 0.25 + 0.45 * ((e.depth + d3) / (2 * d3));
        ctx.strokeStyle = `rgba(79,209,197,${Math.max(0.15, Math.min(0.75, alpha))})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      projVerts.forEach((p) => {
        ctx.fillStyle = 'rgba(139,147,167,0.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      });

      if (showObjPlane && step) {
        const c3 = [c[0], c[1], c[2]];
        const target = dot(c, step.x) - c[3] * kValue;
        const crossings = computeCrossings(verts, edges, c3, target);
        if (crossings.length >= 2) {
          const proj = crossings.map(projectPoint);
          const pcx = proj.reduce((s, p) => s + p.x, 0) / proj.length;
          const pcy = proj.reduce((s, p) => s + p.y, 0) / proj.length;
          proj.sort((a, b) => Math.atan2(a.y - pcy, a.x - pcx) - Math.atan2(b.y - pcy, b.x - pcx));
          ctx.beginPath();
          proj.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          if (proj.length > 2) ctx.closePath();
          ctx.strokeStyle = 'rgba(232,163,61,0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();
          if (proj.length > 2) { ctx.fillStyle = 'rgba(232,163,61,0.12)'; ctx.fill(); }
        }
      }

      // проекция текущей точки симплекса на срез (если x4 близко к k)
      if (step && Math.abs(step.x[3] - kValue) < Math.max(0.5, kMax * 0.06)) {
        const p = projectPoint([step.x[0], step.x[1], step.x[2]]);
        ctx.beginPath();
        ctx.fillStyle = '#f2679c';
        ctx.shadowColor = '#f2679c'; ctx.shadowBlur = 14;
        ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }, [vizMode, angles, vertices4D, edges4D, section3D, kValue, step, simplexHistory, currentStep, c, showObjPlane, kMax]);

  /* ---------------- обработчики UI ---------------- */

  const loadPreset = (idx) => {
    const p = PRESETS[idx];
    setActivePreset(idx);
    setObjType(p.type);
    setC(p.c.slice());
    setConstraints(p.constraints.map((con) => ({ a: con.a.slice(), b: con.b })));
    setKValue(0);
  };

  const updateC = (i, val) => setC((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  const updateConstraintA = (row, i, val) => setConstraints((prev) => prev.map((con, r) => (r === row ? { ...con, a: con.a.map((v, idx) => (idx === i ? val : v)) } : con)));
  const updateConstraintB = (row, val) => setConstraints((prev) => prev.map((con, r) => (r === row ? { ...con, b: val } : con)));
  const addConstraint = () => { if (constraints.length < 5) setConstraints((prev) => [...prev, { a: [1, 1, 1, 1], b: 10 }]); };
  const removeConstraint = (row) => { if (constraints.length > 3) setConstraints((prev) => prev.filter((_, r) => r !== row)); };

  const statusMeta = {
    initial: { label: 'Начальный базис', color: '#8b93a7' },
    'in-progress': { label: 'В процессе', color: '#e8a33d' },
    optimal: { label: 'Оптимум найден', color: '#4fd1c5' },
    unbounded: { label: 'Функция неограничена', color: '#e05260' },
    'max-iter': { label: 'Превышен лимит итераций', color: '#e05260' },
  };
  const curStatus = step ? statusMeta[step.status] : null;

  const n = 4, m = constraints.length;

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        .lp4d-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lp4d-scroll::-webkit-scrollbar-thumb { background: #2a3040; border-radius: 4px; }
        .lp4d-num::-webkit-inner-spin-button { opacity: 0.5; }
        .lp4d-btn { transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease; }
        .lp4d-btn:hover { border-color: #4fd1c5 !important; }
        .lp4d-btn:active { transform: scale(0.96); }
        input[type=range].lp4d-slider { -webkit-appearance: none; height: 4px; border-radius: 2px; background: #2a3040; }
        input[type=range].lp4d-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #4fd1c5; cursor: pointer; box-shadow: 0 0 0 3px rgba(79,209,197,0.15); }
      `}</style>

      <div style={styles.header}>
        <div>
          <div style={styles.title}>ЗЛП · 4 переменные</div>
          <div style={styles.subtitle}>Симплекс-метод и проекция 4D-политопа допустимых решений</div>
        </div>
        {curStatus && (
          <div style={{ ...styles.statusBadge, borderColor: curStatus.color, color: curStatus.color }}>
            <span style={{ ...styles.statusDot, background: curStatus.color }} />
            {curStatus.label}
          </div>
        )}
      </div>

      <div style={styles.grid}>
        {/* ============================= ЛЕВАЯ ПАНЕЛЬ ============================= */}
        <div className="lp4d-scroll" style={styles.leftPanel}>

          {/* Пресеты */}
          <Section title="Пресеты задач">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRESETS.map((p, i) => (
                <button key={i} className="lp4d-btn" onClick={() => loadPreset(i)}
                  style={{ ...styles.presetBtn, borderColor: activePreset === i ? '#4fd1c5' : '#2a3040', color: activePreset === i ? '#4fd1c5' : '#c7cdda' }}>
                  {p.name}
                </button>
              ))}
            </div>
          </Section>

          {/* Целевая функция */}
          <Section title="Целевая функция">
            <div style={styles.objRow}>
              <span style={styles.mono}>Z =</span>
              {c.map((val, i) => (
                <React.Fragment key={i}>
                  <NumInput value={val} onChange={(v) => updateC(i, v)} width={54} />
                  <span style={styles.mono}>x{i + 1}{i < 3 ? ' +' : ''}</span>
                </React.Fragment>
              ))}
              <select value={objType} onChange={(e) => setObjType(e.target.value)} style={styles.select}>
                <option value="max">→ max</option>
                <option value="min">→ min</option>
              </select>
            </div>
          </Section>

          {/* Ограничения */}
          <Section title={`Ограничения A·x ≤ b  (${m}/5)`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {constraints.map((con, row) => (
                <div key={row} style={styles.conRow}>
                  {con.a.map((val, i) => (
                    <React.Fragment key={i}>
                      <NumInput value={val} onChange={(v) => updateConstraintA(row, i, v)} width={40} />
                      <span style={styles.monoSm}>x{i + 1}{i < 3 ? '+' : ''}</span>
                    </React.Fragment>
                  ))}
                  <span style={styles.monoSm}>≤</span>
                  <NumInput value={con.b} onChange={(v) => updateConstraintB(row, v)} width={48} />
                  <button className="lp4d-btn" onClick={() => removeConstraint(row)} disabled={constraints.length <= 3}
                    style={{ ...styles.miniBtn, opacity: constraints.length <= 3 ? 0.3 : 1 }}>✕</button>
                </div>
              ))}
            </div>
            <button className="lp4d-btn" onClick={addConstraint} disabled={constraints.length >= 5}
              style={{ ...styles.addBtn, opacity: constraints.length >= 5 ? 0.4 : 1, marginTop: 8 }}>
              + добавить ограничение
            </button>
            {validation.length > 0 && (
              <div style={styles.warnBox}>{validation.map((e, i) => <div key={i}>{e}</div>)}</div>
            )}
          </Section>

          {/* Плеер итераций */}
          <Section title="Итерации симплекс-метода">
            <div style={styles.playerRow}>
              <IconBtn onClick={() => { setIsPlaying(false); setCurrentStep((s) => Math.max(0, s - 1)); }} disabled={!step || currentStep === 0}><IconPrev /></IconBtn>
              <IconBtn onClick={() => setIsPlaying((p) => !p)} disabled={!simplexHistory || currentStep >= (simplexHistory?.length ?? 1) - 1} primary>
                {isPlaying ? <IconPause /> : <IconPlay />}
              </IconBtn>
              <IconBtn onClick={() => { setIsPlaying(false); setCurrentStep((s) => Math.min((simplexHistory?.length ?? 1) - 1, s + 1)); }} disabled={!simplexHistory || currentStep >= (simplexHistory?.length ?? 1) - 1}><IconNext /></IconBtn>
              <IconBtn onClick={() => { setIsPlaying(false); setCurrentStep(0); }}><IconReset /></IconBtn>
              <span style={styles.stepCounter}>{simplexHistory ? `шаг ${currentStep} / ${simplexHistory.length - 1}` : '—'}</span>
            </div>

            {step && (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>базис</th>
                      {Array.from({ length: n }, (_, i) => <th key={i} style={styles.th}>x{i + 1}</th>)}
                      {Array.from({ length: m }, (_, i) => <th key={i} style={styles.th}>s{i + 1}</th>)}
                      <th style={styles.th}>b</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.tableau.map((row, r) => (
                      <tr key={r} style={{ background: step.pivot?.row === r ? 'rgba(232,163,61,0.12)' : 'transparent' }}>
                        <td style={styles.tdLabel}>{varLabel(step.basis[r], n)}</td>
                        {row.slice(0, n + m).map((val, cIdx) => (
                          <td key={cIdx} style={{ ...styles.td, color: step.pivot?.col === cIdx ? '#e8a33d' : '#c7cdda', fontWeight: step.pivot?.col === cIdx ? 700 : 400 }}>
                            {fmt(val)}
                          </td>
                        ))}
                        <td style={{ ...styles.td, color: '#4fd1c5' }}>{fmt(row[n + m])}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid #2a3040' }}>
                      <td style={styles.tdLabel}>Z</td>
                      {step.objRow.slice(0, n + m).map((val, cIdx) => <td key={cIdx} style={styles.td}>{fmt(val)}</td>)}
                      <td style={{ ...styles.td, color: '#f2679c', fontWeight: 700 }}>{fmt(step.z)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {step && (
              <div style={styles.xVector}>
                x = ({step.x.map((v) => fmt(v, 2)).join(', ')}) &nbsp; Z = {fmt(step.z)}
                {step.pivot?.entering != null && step.status !== 'unbounded' && (
                  <div style={styles.pivotNote}>ввод: {varLabel(step.pivot.entering, n)} · вывод: {step.pivot.leaving != null ? varLabel(step.pivot.leaving, n) : '—'}</div>
                )}
              </div>
            )}
          </Section>

          {/* Контроллеры 4D */}
          <Section title="Визуализация 4D">
            <div style={styles.modeToggle}>
              <button className="lp4d-btn" onClick={() => setVizMode('full4d')} style={{ ...styles.modeBtn, ...(vizMode === 'full4d' ? styles.modeBtnActive : {}) }}>Полная 4D-проекция</button>
              <button className="lp4d-btn" onClick={() => setVizMode('section')} style={{ ...styles.modeBtn, ...(vizMode === 'section' ? styles.modeBtnActive : {}) }}>3D-сечение (x₄ = k)</button>
            </div>

            {vizMode === 'section' && (
              <div style={{ marginTop: 10 }}>
                <div style={styles.sliderLabel}><span>k (x₄)</span><span style={styles.mono}>{fmt(kValue, 2)}</span></div>
                <input className="lp4d-slider" type="range" min={0} max={kMax} step={kMax / 200} value={kValue} onChange={(e) => setKValue(parseFloat(e.target.value))} style={{ width: '100%' }} />
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Checkbox label="Авто-вращение" checked={autoRotate} onChange={setAutoRotate} />
              <Checkbox label="Сечение Z = c·x" checked={showObjPlane} onChange={setShowObjPlane} />
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(vizMode === 'full4d' ? ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'] : ['xy', 'xz', 'yz']).map((plane) => (
                <div key={plane}>
                  <div style={styles.sliderLabel}><span>Плоскость {plane.toUpperCase()}</span><span style={styles.mono}>{fmt(angles[plane], 2)}</span></div>
                  <input className="lp4d-slider" type="range" min={-Math.PI} max={Math.PI} step={0.01} value={wrapAngle(angles[plane])}
                    onChange={(e) => setAngles((a) => ({ ...a, [plane]: wrapAngle(parseFloat(e.target.value)) }))} style={{ width: '100%' }} />
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ============================= ПРАВАЯ ПАНЕЛЬ (CANVAS) ============================= */}
        <div style={styles.rightPanel}>
          <div style={styles.canvasHeader}>
            <span style={styles.canvasTitle}>{vizMode === 'full4d' ? 'Тессеракт-проекция политопа' : `Сечение гиперплоскостью x₄ = ${fmt(kValue, 2)}`}</span>
            <div style={styles.legend}>
              <LegendItem color="#4fd1c5" label="рёбра / вершины" />
              <LegendItem color="#e8a33d" label="Z = c·x" />
              <LegendItem color="#f2679c" label="траектория" />
            </div>
          </div>
          <canvas ref={canvasRef} width={860} height={640} style={styles.canvas} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ
   ========================================================================== */

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, width }) {
  return (
    <input className="lp4d-num" type="number" value={value} step="1"
      onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
      style={{ ...styles.numInput, width }} />
  );
}

function IconBtn({ children, onClick, disabled, primary }) {
  return (
    <button className="lp4d-btn" onClick={onClick} disabled={disabled}
      style={{ ...styles.iconBtn, ...(primary ? styles.iconBtnPrimary : {}), opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label style={styles.checkboxLabel}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: '#4fd1c5' }} />
      {label}
    </label>
  );
}

function LegendItem({ color, label }) {
  return (
    <span style={styles.legendItem}>
      <span style={{ ...styles.legendDot, background: color }} />
      {label}
    </span>
  );
}

/* ============================================================================
   СТИЛИ
   ========================================================================== */

const styles = {
  root: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: '#12151c',
    color: '#e8eaf0',
    minHeight: '100vh',
    padding: '22px 26px 32px',
    boxSizing: 'border-box',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 10 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' },
  subtitle: { fontSize: 13, color: '#8b93a7', marginTop: 3 },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 20, border: '1px solid', fontSize: 12.5, fontWeight: 600, background: '#181c26' },
  statusDot: { width: 7, height: 7, borderRadius: '50%' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(340px, 400px) 1fr', gap: 18, alignItems: 'start' },
  leftPanel: { display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', paddingRight: 4 },
  rightPanel: { background: '#181c26', border: '1px solid #232838', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 22 },
  canvasHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  canvasTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, fontWeight: 600, color: '#c7cdda' },
  legend: { display: 'flex', gap: 14 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#8b93a7' },
  legendDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  canvas: { width: '100%', height: 'auto', aspectRatio: '860 / 640', background: '#0e1117', borderRadius: 8, border: '1px solid #232838' },
  section: { background: '#181c26', border: '1px solid #232838', borderRadius: 12, padding: 14 },
  sectionTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, fontWeight: 600, color: '#8b93a7', marginBottom: 10, textTransform: 'none' },
  presetBtn: { textAlign: 'left', background: '#1f2430', border: '1px solid', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer' },
  objRow: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  conRow: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  mono: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#c7cdda' },
  monoSm: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#8b93a7' },
  numInput: { background: '#0e1117', border: '1px solid #2a3040', borderRadius: 6, color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, padding: '5px 6px', textAlign: 'center' },
  select: { background: '#0e1117', border: '1px solid #2a3040', borderRadius: 6, color: '#4fd1c5', fontSize: 12.5, padding: '5px 8px', marginLeft: 4 },
  miniBtn: { background: 'transparent', border: 'none', color: '#e05260', cursor: 'pointer', fontSize: 12, padding: '2px 6px' },
  addBtn: { width: '100%', background: '#1f2430', border: '1px dashed #2a3040', borderRadius: 8, color: '#8b93a7', fontSize: 12, padding: '7px 0', cursor: 'pointer' },
  warnBox: { marginTop: 10, background: 'rgba(224,82,96,0.1)', border: '1px solid rgba(224,82,96,0.35)', borderRadius: 8, padding: '8px 10px', color: '#e0899b', fontSize: 11.5, lineHeight: 1.5 },
  playerRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: '#1f2430', border: '1px solid #2a3040', color: '#c7cdda' },
  iconBtnPrimary: { background: 'rgba(79,209,197,0.15)', borderColor: '#4fd1c5', color: '#4fd1c5' },
  stepCounter: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#8b93a7', marginLeft: 4 },
  tableWrap: { overflowX: 'auto', border: '1px solid #232838', borderRadius: 8 },
  table: { borderCollapse: 'collapse', width: '100%', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 },
  th: { textAlign: 'right', padding: '6px 8px', color: '#8b93a7', borderBottom: '1px solid #232838', fontWeight: 500 },
  td: { textAlign: 'right', padding: '5px 8px', color: '#c7cdda' },
  tdLabel: { textAlign: 'left', padding: '5px 8px', color: '#4fd1c5', fontWeight: 600 },
  xVector: { marginTop: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#c7cdda', background: '#0e1117', border: '1px solid #232838', borderRadius: 8, padding: '8px 10px' },
  pivotNote: { marginTop: 4, fontSize: 11, color: '#8b93a7' },
  modeToggle: { display: 'flex', gap: 6 },
  modeBtn: { flex: 1, background: '#1f2430', border: '1px solid #2a3040', borderRadius: 8, color: '#8b93a7', fontSize: 11.5, padding: '8px 6px', cursor: 'pointer' },
  modeBtnActive: { borderColor: '#4fd1c5', color: '#4fd1c5', background: 'rgba(79,209,197,0.1)' },
  sliderLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8b93a7', marginBottom: 3 },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c7cdda', cursor: 'pointer' },
};
