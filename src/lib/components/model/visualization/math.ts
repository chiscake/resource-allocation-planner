import type { VecN } from "./types";

const EPS = 1e-9;

export function dot(a: VecN, b: VecN): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function sub(a: VecN, b: VecN): VecN {
  return a.map((v, i) => v - (b[i] ?? 0));
}

export function add(a: VecN, b: VecN): VecN {
  return a.map((v, i) => v + (b[i] ?? 0));
}

export function scale(a: VecN, s: number): VecN {
  return a.map((v) => v * s);
}

export function norm(a: VecN): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: VecN): VecN {
  const n = norm(a);
  if (n < EPS) return a.map(() => 0);
  return scale(a, 1 / n);
}

/** Perspective project 3D → 2D screen-ish coords (y up). */
export function project3to2(
  p: VecN,
  d3: number,
  scalePx: number,
  cx: number,
  cy: number,
): { x: number; y: number; depth: number } {
  const [x, y, z] = p;
  const f = d3 / Math.max(EPS, d3 - z);
  return { x: cx + x * f * scalePx, y: cy - y * f * scalePx, depth: z };
}

/**
 * Dimetric orthographic axonometry (school / ГОСТ-like simplified).
 * Screen angles between projected axes: 105° (Y–X), 105° (Y–Z), 150° (X–Z).
 * Y vertical; X down-right; Z down-left. α = 15° from horizontal.
 *
 * Kept for tests / reference. Live 3D view uses {@link projectViewOrtho}.
 */
export const DIMETRIC_ALPHA = Math.PI / 12;

export function projectDimetricOrtho(
  p: VecN,
  scalePx: number,
  cx: number,
  cy: number,
  alpha: number = DIMETRIC_ALPHA,
): { x: number; y: number; depth: number } {
  const [X, Y, Z] = p;
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const sx = (X - Z) * c;
  const sy = Y - (X + Z) * s;
  return {
    x: cx + sx * scalePx,
    y: cy - sy * scalePx,
    // Farther first when sorting ascending (view from +octant).
    depth: -(X + Y + Z),
  };
}

/** Inverse of dimetric on the Z=0 plane → rotated model coords. */
export function unprojectDimetricOrthoZ0(
  nx: number,
  ny: number,
  alpha: number = DIMETRIC_ALPHA,
): VecN {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const X = nx / Math.max(EPS, c);
  const Y = ny + X * s;
  return [X, Y, 0];
}

/**
 * True orthographic view after camera rotation.
 * Convention: +Z toward the camera (look down −Z); +Y screen-up; +X screen-right.
 * A unit square in a plane ⊥ look direction projects to a square.
 */
export function projectViewOrtho(
  p: VecN,
  scalePx: number,
  cx: number,
  cy: number,
): { x: number; y: number; depth: number } {
  const [X, Y, Z] = p;
  return {
    x: cx + (X ?? 0) * scalePx,
    y: cy - (Y ?? 0) * scalePx,
    // Ascending sort → far first: smaller Z is farther.
    depth: Z ?? 0,
  };
}

/** Screen-normalized (nx,ny) on the view Z=0 plane. */
export function unprojectViewOrthoZ0(nx: number, ny: number): VecN {
  return [nx, ny, 0];
}

export function project4to3(p: VecN, d4: number): VecN {
  const [x, y, z, w] = p;
  const f = d4 / Math.max(EPS, d4 - w);
  return [x * f, y * f, z * f];
}

export type Angles3 = { xy: number; xz: number; yz: number };
export type Angles4 = Angles3 & { xw: number; yw: number; zw: number };

/** Default mild 4D tilt for project4d / gizmo. */
export const DEFAULT_ANGLES4: Angles4 = {
  xy: 0.3,
  xz: 0.5,
  xw: 0.4,
  yz: 0.2,
  yw: 0.6,
  zw: 0.35,
};

export const ANGLES4_KEYS: (keyof Angles4)[] = [
  "xy",
  "xz",
  "yz",
  "xw",
  "yw",
  "zw",
];

function cs(theta: number) {
  return { c: Math.cos(theta), s: Math.sin(theta) };
}

export function rotate3D(p: VecN, ang: Angles3): VecN {
  let [x, y, z] = p;
  {
    const { c, s } = cs(ang.xy);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }
  {
    const { c, s } = cs(ang.xz);
    const nx = x * c - z * s;
    const nz = x * s + z * c;
    x = nx;
    z = nz;
  }
  {
    const { c, s } = cs(ang.yz);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  return [x, y, z];
}

export function rotate4D(p: VecN, ang: Angles4): VecN {
  let [x, y, z, w] = p;
  {
    const { c, s } = cs(ang.xy);
    const nx = x * c - y * s,
      ny = x * s + y * c;
    x = nx;
    y = ny;
  }
  {
    const { c, s } = cs(ang.xz);
    const nx = x * c - z * s,
      nz = x * s + z * c;
    x = nx;
    z = nz;
  }
  {
    const { c, s } = cs(ang.xw);
    const nx = x * c - w * s,
      nw = x * s + w * c;
    x = nx;
    w = nw;
  }
  {
    const { c, s } = cs(ang.yz);
    const ny = y * c - z * s,
      nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  {
    const { c, s } = cs(ang.yw);
    const ny = y * c - w * s,
      nw = y * s + w * c;
    y = ny;
    w = nw;
  }
  {
    const { c, s } = cs(ang.zw);
    const nz = z * c - w * s,
      nw = z * s + w * c;
    z = nz;
    w = nw;
  }
  return [x, y, z, w];
}

export function boundingCenterScale(points: VecN[], targetRadius: number) {
  const dim = points[0]?.length || 2;
  const mins = new Array(dim).fill(Infinity);
  const maxs = new Array(dim).fill(-Infinity);
  for (const p of points) {
    for (let i = 0; i < dim; i++) {
      mins[i] = Math.min(mins[i], p[i]);
      maxs[i] = Math.max(maxs[i], p[i]);
    }
  }
  const center = mins.map((mn, i) => (mn + maxs[i]) / 2);
  let extent = 0;
  for (let i = 0; i < dim; i++)
    extent = Math.max(extent, (maxs[i] - mins[i]) / 2);
  if (extent < 1e-6) extent = 1;
  return { center, scale: targetRadius / extent };
}

export function normalizePoint(p: VecN, center: VecN, scale: number): VecN {
  return p.map((v, i) => (v - center[i]) * scale);
}

/** Pick 2 or 3 coordinates; pad with zeros for 3D pipeline. */
export function selectAxes(p: VecN, axes: number[]): VecN {
  return axes.map((ai) => p[ai] ?? 0);
}

/**
 * PCA on rows (samples × dim). Returns top-k orthonormal loading vectors.
 * Basis is fixed for a whole trace when computed once on pooled points.
 */
export function computePcaBasis(samples: VecN[], k = 2): VecN[] {
  if (samples.length === 0) return [];
  const dim = samples[0].length;
  const mean = new Array(dim).fill(0);
  for (const s of samples) for (let i = 0; i < dim; i++) mean[i] += s[i];
  for (let i = 0; i < dim; i++) mean[i] /= samples.length;

  // Covariance (dim × dim)
  const cov: number[][] = Array.from({ length: dim }, () =>
    new Array(dim).fill(0),
  );
  for (const s of samples) {
    for (let i = 0; i < dim; i++) {
      for (let j = i; j < dim; j++) {
        const v = (s[i] - mean[i]) * (s[j] - mean[j]);
        cov[i][j] += v;
        if (i !== j) cov[j][i] += v;
      }
    }
  }
  const denom = Math.max(1, samples.length - 1);
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) cov[i][j] /= denom;

  // Power iteration for top-k eigenvectors (Gram-Schmidt).
  const basis: VecN[] = [];
  for (let comp = 0; comp < Math.min(k, dim); comp++) {
    let v = new Array(dim).fill(0).map(() => Math.random() - 0.5);
    v = normalize(v);
    for (let iter = 0; iter < 40; iter++) {
      let w = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) w[i] += cov[i][j] * v[j];
      }
      for (const b of basis) {
        const proj = dot(w, b);
        w = sub(w, scale(b, proj));
      }
      v = normalize(w);
    }
    basis.push(v);
  }
  return basis;
}

export function projectPca(p: VecN, basis: VecN[], mean: VecN): VecN {
  const centered = sub(p, mean);
  return basis.map((b) => dot(centered, b));
}

export function meanVec(samples: VecN[]): VecN {
  if (samples.length === 0) return [];
  const dim = samples[0].length;
  const m = new Array(dim).fill(0);
  for (const s of samples) for (let i = 0; i < dim; i++) m[i] += s[i];
  return m.map((v) => v / samples.length);
}

/** Unit quaternion [w, x, y, z]. */
export type Quat = [number, number, number, number];

export function quatIdentity(): Quat {
  return [1, 0, 0, 0];
}

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (n < EPS) return quatIdentity();
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function quatFromAxisAngle(axis: VecN, angle: number): Quat {
  const [x, y, z] = normalize(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return quatNormalize([Math.cos(half), x * s, y * s, z * s]);
}

export function rotateByQuat(p: VecN, q: Quat): VecN {
  const [w, x, y, z] = q;
  const [px, py, pz] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  // q * p * q^-1
  const ix = w * px + y * pz - z * py;
  const iy = w * py + z * px - x * pz;
  const iz = w * pz + x * py - y * px;
  const iw = -x * px - y * py - z * pz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

/** Map canvas delta to arcball quaternion delta (screen-space sphere). */
export function arcballDelta(
  last: { x: number; y: number },
  next: { x: number; y: number },
  W: number,
  H: number,
): Quat {
  const toBall = (x: number, y: number): VecN => {
    const nx = (2 * x) / Math.max(1, W) - 1;
    const ny = 1 - (2 * y) / Math.max(1, H);
    const r2 = nx * nx + ny * ny;
    if (r2 <= 1) return [nx, ny, Math.sqrt(1 - r2)];
    const inv = 1 / Math.sqrt(r2);
    return [nx * inv, ny * inv, 0];
  };
  const a = toBall(last.x, last.y);
  const b = toBall(next.x, next.y);
  const axis = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLen < 1e-8) return quatIdentity();
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  return quatFromAxisAngle(axis, angle);
}

export function cross(a: VecN, b: VecN): VecN {
  return [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ];
}

export function quatConjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Shortest-path spherical linear interpolation of unit quaternions. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let dotAb = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let b2: Quat = b;
  if (dotAb < 0) {
    b2 = [-b[0], -b[1], -b[2], -b[3]];
    dotAb = -dotAb;
  }
  if (dotAb > 0.9995) {
    return quatNormalize([
      a[0] + t * (b2[0] - a[0]),
      a[1] + t * (b2[1] - a[1]),
      a[2] + t * (b2[2] - a[2]),
      a[3] + t * (b2[3] - a[3]),
    ]);
  }
  const theta0 = Math.acos(Math.min(1, dotAb));
  const theta = theta0 * t;
  const s0 = Math.sin(theta0 - theta) / Math.sin(theta0);
  const s1 = Math.sin(theta) / Math.sin(theta0);
  return quatNormalize([
    s0 * a[0] + s1 * b2[0],
    s0 * a[1] + s1 * b2[1],
    s0 * a[2] + s1 * b2[2],
    s0 * a[3] + s1 * b2[3],
  ]);
}

/**
 * Camera looks down −Z; this vector points from the origin toward the camera
 * (out of the screen). Axis snaps map `lookFrom` onto this direction.
 */
export const VIEW_TOWARD_CAMERA: VecN = [0, 0, 1];

/** @deprecated Alias — live camera is orthographic, not dimetric. */
export const DIMETRIC_VIEW_DIR: VecN = VIEW_TOWARD_CAMERA;

/** Blender-style world up for turntable (Z upright). */
export const WORLD_UP: VecN = [0, 0, 1];

/** Rotate `from` onto `to` (unit vectors). */
export function quatFromTo(from: VecN, to: VecN): Quat {
  const f = normalize(from);
  const tvec = normalize(to);
  const d = dot(f, tvec);
  if (d > 1 - 1e-8) return quatIdentity();
  if (d < -1 + 1e-8) {
    let axis = cross([1, 0, 0], f);
    if (norm(axis) < 1e-6) axis = cross([0, 1, 0], f);
    return quatFromAxisAngle(axis, Math.PI);
  }
  const axis = cross(f, tvec);
  return quatNormalize([1 + d, axis[0] ?? 0, axis[1] ?? 0, axis[2] ?? 0]);
}

/**
 * View orientation so `lookFrom` (world) points toward the camera (+Z view),
 * with world Z kept upright (Blender turntable / axis-snap convention).
 */
export function quatForViewFrom(
  lookFrom: VecN,
  worldUp: VecN = WORLD_UP,
): Quat {
  const cam = VIEW_TOWARD_CAMERA;
  const from = normalize(lookFrom);
  let q = quatFromTo(from, cam);

  const upView = rotateByQuat(worldUp, q);
  const viewY: VecN = [0, 1, 0];
  let desired = sub(viewY, scale(cam, dot(viewY, cam)));
  if (norm(desired) < 1e-6) {
    // Looking along ± world Z: prefer world +Y as screen-up.
    desired = sub([0, 1, 0], scale(cam, dot([0, 1, 0] as VecN, cam)));
    if (norm(desired) < 1e-6) {
      desired = sub([1, 0, 0], scale(cam, dot([1, 0, 0] as VecN, cam)));
    }
  }
  desired = normalize(desired);

  let current = sub(upView, scale(cam, dot(upView, cam)));
  if (norm(current) < 1e-6) {
    const side: VecN = Math.abs(from[0] ?? 0) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    current = normalize(cross(from, side));
    current = rotateByQuat(current, q);
    current = sub(current, scale(cam, dot(current, cam)));
  }
  if (norm(current) < 1e-6) return q;
  current = normalize(current);

  const roll = quatFromTo(current, desired);
  return quatNormalize(quatMultiply(roll, q));
}

/**
 * Blender Orbit Method = Turntable: yaw around world Z, pitch around view X.
 * Incremental (no per-frame Z-up rebuild) so orbiting through the ±Z poles is
 * continuous — no axis flip / snap-back. After crossing a pole the view can go
 * upside-down; that is intentional for a full 360° pitch.
 */
export function applyTurntableOrbit(
  q: Quat,
  dx: number,
  dy: number,
  sens = 0.01,
): Quat {
  // Pitch in view space around local X — continuous through poles.
  let next = q;
  if (dy !== 0) {
    const pitch = quatFromAxisAngle([1, 0, 0], -dy * sens);
    next = quatNormalize(quatMultiply(pitch, next));
  }
  // Yaw around world Z (model/world): camera orbits the upright axis.
  if (dx !== 0) {
    const yaw = quatFromAxisAngle(WORLD_UP, -dx * sens);
    next = quatNormalize(quatMultiply(next, yaw));
  }
  return next;
}

/** Blender Orbit Method = Trackball: free screen-space arcball delta. */
export function applyTrackballOrbit(q: Quat, delta: Quat): Quat {
  return quatNormalize(quatMultiply(delta, q));
}

export type ViewSnapId =
  | "px"
  | "nx"
  | "py"
  | "ny"
  | "pz"
  | "nz"
  | "ppp"
  | "ppn"
  | "pnp"
  | "pnn"
  | "npp"
  | "npn"
  | "nnp"
  | "nnn";

const CORNER_SIGN: Record<
  Exclude<ViewSnapId, "px" | "nx" | "py" | "ny" | "pz" | "nz">,
  [number, number, number]
> = {
  ppp: [1, 1, 1],
  ppn: [1, 1, -1],
  pnp: [1, -1, 1],
  pnn: [1, -1, -1],
  npp: [-1, 1, 1],
  npn: [-1, 1, -1],
  nnp: [-1, -1, 1],
  nnn: [-1, -1, -1],
};

export function snapLookFrom(id: ViewSnapId): VecN {
  switch (id) {
    case "px":
      return [1, 0, 0];
    case "nx":
      return [-1, 0, 0];
    case "py":
      return [0, 1, 0];
    case "ny":
      return [0, -1, 0];
    case "pz":
      return [0, 0, 1];
    case "nz":
      return [0, 0, -1];
    default:
      return normalize([...CORNER_SIGN[id]]);
  }
}

export function quatForSnap(id: ViewSnapId): Quat {
  return quatForViewFrom(snapLookFrom(id), WORLD_UP);
}

export const VIEW_SNAP_AXIS_IDS: ViewSnapId[] = [
  "px",
  "nx",
  "py",
  "ny",
  "pz",
  "nz",
];

export const VIEW_SNAP_CORNER_IDS: ViewSnapId[] = [
  "ppp",
  "ppn",
  "pnp",
  "pnn",
  "npp",
  "npn",
  "nnp",
  "nnn",
];

/** Row-major 4×4; viewVec = M · worldVec (Claude-style 4D gizmo). */
export type Mat4 = number[];

export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat4Mul(A: Mat4, B: Mat4): Mat4 {
  const C = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[r * 4 + k]! * B[k * 4 + c]!;
      C[r * 4 + c] = s;
    }
  }
  return C;
}

export function mat4Col(M: Mat4, i: number): VecN {
  return [M[i]!, M[4 + i]!, M[8 + i]!, M[12 + i]!];
}

export function mat4Apply(M: Mat4, v: VecN): VecN {
  const x = v[0] ?? 0;
  const y = v[1] ?? 0;
  const z = v[2] ?? 0;
  const w = v[3] ?? 0;
  return [0, 1, 2, 3].map(
    (r) =>
      M[r * 4]! * x + M[r * 4 + 1]! * y + M[r * 4 + 2]! * z + M[r * 4 + 3]! * w,
  );
}

/** Rotation in coordinate plane (i,j): e_i → cos e_i + sin e_j. */
export function mat4PlaneRot(i: number, j: number, t: number): Mat4 {
  const M = mat4Identity();
  const c = Math.cos(t);
  const s = Math.sin(t);
  M[i * 4 + i] = c;
  M[j * 4 + j] = c;
  M[j * 4 + i] = s;
  M[i * 4 + j] = -s;
  return M;
}

export function mat4Orthonormalize(M: Mat4): Mat4 {
  const out: VecN[] = [];
  for (let i = 0; i < 4; i++) {
    let u = mat4Col(M, i);
    for (const o of out) {
      const d = dot(u, o);
      u = u.map((x, k) => x - d * (o[k] ?? 0));
    }
    out.push(normalize(u));
  }
  const R = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let r = 0; r < 4; r++) R[r * 4 + i] = out[i]![r];
  }
  return R;
}

type Arc4 = { a: VecN; b: VecN; th: number };

/** Plane rotation that carries â toward q̂. */
export function mat4Arc(p: VecN, q: VecN): Arc4 | null {
  const a = normalize(p);
  const qn = normalize(q);
  const d = Math.max(-1, Math.min(1, dot(a, qn)));
  let b = qn.map((x, k) => x - d * (a[k] ?? 0));
  if (norm(b) < 1e-6) {
    if (d > 0) return null;
    b = [0, 1, 0, 0].map((x, k) => x - (a[1] ?? 0) * (a[k] ?? 0));
    if (norm(b) < 1e-6) {
      b = [1, 0, 0, 0].map((x, k) => x - (a[0] ?? 0) * (a[k] ?? 0));
    }
  }
  return { a, b: normalize(b), th: Math.acos(d) };
}

/** G = I + sinθ (b aᵀ − a bᵀ) + (cosθ − 1)(a aᵀ + b bᵀ). */
export function mat4ArcMat(arc: Arc4, f = 1): Mat4 {
  const t = arc.th * f;
  const sn = Math.sin(t);
  const cs = Math.cos(t);
  const M = mat4Identity();
  const { a, b } = arc;
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) {
      M[r * 4 + k]! +=
        sn * ((b[r] ?? 0) * (a[k] ?? 0) - (a[r] ?? 0) * (b[k] ?? 0)) +
        (cs - 1) * ((a[r] ?? 0) * (a[k] ?? 0) + (b[r] ?? 0) * (b[k] ?? 0));
    }
  }
  return M;
}

/**
 * Build view←world Mat4 matching {@link rotate4D} plane order
 * (xy → xz → xw → yz → yw → zw).
 */
export function mat4FromAngles4(ang: Angles4): Mat4 {
  return [
    mat4PlaneRot(0, 1, ang.xy),
    mat4PlaneRot(0, 2, ang.xz),
    mat4PlaneRot(0, 3, ang.xw),
    mat4PlaneRot(1, 2, ang.yz),
    mat4PlaneRot(1, 3, ang.yw),
    mat4PlaneRot(2, 3, ang.zw),
  ].reduce((acc, m) => mat4Mul(m, acc), mat4Identity());
}

/** Default 4D view from {@link DEFAULT_ANGLES4}. */
export function defaultRot4(): Mat4 {
  return mat4FromAngles4(DEFAULT_ANGLES4);
}

/** Left-multiply G onto R and re-orthonormalize. */
export function mat4Rotate(R: Mat4, G: Mat4): Mat4 {
  return mat4Orthonormalize(mat4Mul(G, R));
}

/**
 * 4D orbit: drag orbits in view xz/yz; with shiftKey — view xw/yw.
 */
export function applyOrbit4(
  R: Mat4,
  dx: number,
  dy: number,
  shift: boolean,
  k = 0.01,
): Mat4 {
  if (shift) {
    return mat4Rotate(
      R,
      mat4Mul(mat4PlaneRot(0, 3, dx * k), mat4PlaneRot(1, 3, -dy * k)),
    );
  }
  return mat4Rotate(
    R,
    mat4Mul(mat4PlaneRot(2, 0, dx * k), mat4PlaneRot(2, 1, -dy * k)),
  );
}

/** Drag an axis tip toward a new direction in view space. */
export function dragAxisTip4(
  R: Mat4,
  axis: number,
  sign: 1 | -1,
  dx: number,
  dy: number,
  shift: boolean,
  tipScale: number,
): Mat4 {
  const p = mat4Col(R, axis).map((x) => x * sign);
  const k = 1 / Math.max(EPS, tipScale);
  const q = shift
    ? [p[0]!, p[1]!, p[2]! + dx * k, p[3]! - dy * k]
    : [p[0]! + dx * k, p[1]! - dy * k, p[2]!, p[3]!];
  const A = mat4Arc(p, q);
  if (!A) return R;
  return mat4Rotate(R, mat4ArcMat(A));
}

/** Snap signed world axis toward view +Z (toward camera). */
export function snapAxisTowardCamera4(
  R: Mat4,
  axis: number,
  sign: 1 | -1,
): Arc4 | null {
  const p = mat4Col(R, axis).map((x) => x * sign);
  return mat4Arc(p, [0, 0, 1, 0]);
}
