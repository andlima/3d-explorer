#!/usr/bin/env node
// gen-wildlife.mjs — one-time authoring tool for the 3d-explorer wildlife
// (creature capture target) assets.
//
// Like tools/gen-models.mjs, this script is NOT part of the running site (no
// build step, no runtime dependency). It deterministically authors the
// low-poly animal GLBs committed under assets/models/wildlife/. The resulting
// .glb files are original work created for this project and released into the
// public domain (CC0 1.0); see assets/CREDITS.md. Re-run with
// `node tools/gen-wildlife.mjs` to regenerate byte-identical output.
//
// Why authored here instead of fetched: identical constraint to
// tools/gen-models.mjs — the implementing sandbox can only reach github.com /
// the npm registries, not the CC0 asset CDNs (poly.pizza / kenney.nl /
// quaternius.com), and no reliably-licensed low-poly animal GLB set is
// reachable through the allowed hosts. Authoring originals and dedicating
// them CC0 is the cleanest reachable public-domain source and exercises the
// exact same GLB loading pipeline the props use.
//
// The GLB writer below is a self-contained copy of the one in
// tools/gen-models.mjs (kept separate so that build-free authoring tool stays
// byte-for-byte untouched). Creature materials are emitted doubleSided so the
// low-poly soups render regardless of triangle winding.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'models',
  'wildlife',
);

// --- tiny vec helpers -------------------------------------------------------
const v = (x, y, z) => [x, y, z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// Apply a transform { rot:{x,y,z}, scale:[sx,sy,sz], translate:[tx,ty,tz] }
// to every vertex of a triangle soup (array of [p0,p1,p2]).
function transformSoup(tris, { rot = {}, scale = [1, 1, 1], translate = [0, 0, 0] } = {}) {
  const rx = rot.x || 0, ry = rot.y || 0, rz = rot.z || 0;
  const [sx, sy, sz] = scale;
  const [tx, ty, tz] = translate;
  const tp = (p) => {
    let [x, y, z] = [p[0] * sx, p[1] * sy, p[2] * sz];
    if (rx) {
      const c = Math.cos(rx), s = Math.sin(rx);
      [y, z] = [y * c - z * s, y * s + z * c];
    }
    if (ry) {
      const c = Math.cos(ry), s = Math.sin(ry);
      [x, z] = [x * c + z * s, -x * s + z * c];
    }
    if (rz) {
      const c = Math.cos(rz), s = Math.sin(rz);
      [x, y] = [x * c - y * s, x * s + y * c];
    }
    return [x + tx, y + ty, z + tz];
  };
  return tris.map(([a, b, c]) => [tp(a), tp(b), tp(c)]);
}

const merge = (...soups) => soups.flat();

// --- primitive triangle-soup builders --------------------------------------
// Axis-aligned box centred on origin (full extents w,h,d).
function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const p = [
    v(-x, -y, -z), v(x, -y, -z), v(x, y, -z), v(-x, y, -z),
    v(-x, -y, z), v(x, -y, z), v(x, y, z), v(-x, y, z),
  ];
  const q = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  const tris = [];
  for (const [a, b, c, dd] of q) {
    tris.push([p[a], p[b], p[c]], [p[a], p[c], p[dd]]);
  }
  return tris;
}

// UV sphere of radius r (segs around, rings top→bottom). Pole quads collapse
// to near-degenerate triangles which are harmless (zero-area, culled).
function sphere(r, segs, rings) {
  const tris = [];
  const pt = (phi, th) => v(
    r * Math.sin(phi) * Math.cos(th),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(th),
  );
  for (let iy = 0; iy < rings; iy++) {
    const phi0 = (iy / rings) * Math.PI;
    const phi1 = ((iy + 1) / rings) * Math.PI;
    for (let ix = 0; ix < segs; ix++) {
      const th0 = (ix / segs) * Math.PI * 2;
      const th1 = ((ix + 1) / segs) * Math.PI * 2;
      const a = pt(phi0, th0);
      const b = pt(phi1, th0);
      const c = pt(phi1, th1);
      const d = pt(phi0, th1);
      tris.push([a, b, c], [a, c, d]);
    }
  }
  return tris;
}

// Cylinder/cone along +Y centred on origin (y in [-h/2,+h/2]).
function cylinder(rBottom, rTop, h, segs, { capBottom = true, capTop = true } = {}) {
  const tris = [];
  const yb = -h / 2, yt = h / 2;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const b = ((i + 1) / segs) * Math.PI * 2;
    const p0 = v(rBottom * Math.cos(a), yb, rBottom * Math.sin(a));
    const p1 = v(rBottom * Math.cos(b), yb, rBottom * Math.sin(b));
    const p2 = v(rTop * Math.cos(b), yt, rTop * Math.sin(b));
    const p3 = v(rTop * Math.cos(a), yt, rTop * Math.sin(a));
    if (rBottom > 0 || rTop > 0) tris.push([p0, p1, p2], [p0, p2, p3]);
  }
  if (capBottom && rBottom > 0) {
    const c = v(0, yb, 0);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const b = ((i + 1) / segs) * Math.PI * 2;
      tris.push([c, v(rBottom * Math.cos(b), yb, rBottom * Math.sin(b)),
        v(rBottom * Math.cos(a), yb, rBottom * Math.sin(a))]);
    }
  }
  if (capTop && rTop > 0) {
    const c = v(0, yt, 0);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const b = ((i + 1) / segs) * Math.PI * 2;
      tris.push([c, v(rTop * Math.cos(a), yt, rTop * Math.sin(a)),
        v(rTop * Math.cos(b), yt, rTop * Math.sin(b))]);
    }
  }
  return tris;
}

const ellipsoid = (sx, sy, sz, translate, segs = 8, rings = 5) =>
  transformSoup(sphere(1, segs, rings), { scale: [sx, sy, sz], translate });

// A simple straight leg: a thin tapered cylinder standing on y=0.
const leg = (rTop, rBot, h, x, z) =>
  transformSoup(cylinder(rBot, rTop, h, 6, {}), { translate: [x, h / 2, z] });

// --- creature model definitions --------------------------------------------
// Each model is a list of named, materialled nodes. Colors are linear-ish
// sRGB triplets in [0,1]; metallic 0, matte roughness; emitted doubleSided.
const FUR_DARK = [0.24, 0.16, 0.10];

const MODELS = {
  deer: [
    { name: 'deer-legs', color: FUR_DARK, rough: 0.9, tris: merge(
      leg(0.045, 0.05, 0.74, 0.22, 0.20), leg(0.045, 0.05, 0.74, 0.22, -0.20),
      leg(0.045, 0.05, 0.74, -0.22, 0.20), leg(0.045, 0.05, 0.74, -0.22, -0.20)) },
    { name: 'deer-body', color: [0.57, 0.40, 0.24], rough: 0.85,
      tris: ellipsoid(0.50, 0.32, 0.28, [0, 0.98, 0]) },
    { name: 'deer-neck', color: [0.57, 0.40, 0.24], rough: 0.85,
      tris: transformSoup(cylinder(0.13, 0.09, 0.46, 8, {}),
        { rot: { z: -0.7 }, translate: [0.42, 1.18, 0] }) },
    { name: 'deer-head', color: [0.60, 0.43, 0.27], rough: 0.85, tris: merge(
      ellipsoid(0.20, 0.15, 0.13, [0.68, 1.40, 0], 8, 6),
      transformSoup(box(0.05, 0.13, 0.02), { rot: { z: 0.3 }, translate: [0.66, 1.56, 0.10] }),
      transformSoup(box(0.05, 0.13, 0.02), { rot: { z: 0.3 }, translate: [0.66, 1.56, -0.10] })) },
    { name: 'deer-antlers', color: [0.78, 0.70, 0.54], rough: 0.7, tris: merge(
      transformSoup(cylinder(0.018, 0.012, 0.36, 5, {}), { rot: { z: 0.25 }, translate: [0.70, 1.66, 0.08] }),
      transformSoup(cylinder(0.014, 0.010, 0.22, 5, {}), { rot: { z: -0.5 }, translate: [0.62, 1.78, 0.10] }),
      transformSoup(cylinder(0.018, 0.012, 0.36, 5, {}), { rot: { z: 0.25 }, translate: [0.70, 1.66, -0.08] }),
      transformSoup(cylinder(0.014, 0.010, 0.22, 5, {}), { rot: { z: -0.5 }, translate: [0.62, 1.78, -0.10] })) },
    { name: 'deer-tail', color: [0.72, 0.58, 0.40], rough: 0.85,
      tris: ellipsoid(0.06, 0.10, 0.05, [-0.48, 1.02, 0], 6, 5) },
  ],
  fox: [
    { name: 'fox-legs', color: FUR_DARK, rough: 0.9, tris: merge(
      leg(0.035, 0.04, 0.30, 0.18, 0.11), leg(0.035, 0.04, 0.30, 0.18, -0.11),
      leg(0.035, 0.04, 0.30, -0.18, 0.11), leg(0.035, 0.04, 0.30, -0.18, -0.11)) },
    { name: 'fox-body', color: [0.80, 0.36, 0.11], rough: 0.8,
      tris: ellipsoid(0.40, 0.21, 0.19, [0, 0.44, 0]) },
    { name: 'fox-belly', color: [0.93, 0.89, 0.82], rough: 0.8,
      tris: ellipsoid(0.30, 0.13, 0.15, [0.04, 0.34, 0], 8, 6) },
    { name: 'fox-head', color: [0.82, 0.38, 0.13], rough: 0.8, tris: merge(
      ellipsoid(0.18, 0.16, 0.17, [0.44, 0.50, 0], 8, 6),
      transformSoup(cylinder(0.07, 0.0, 0.16, 6, {}), { translate: [0.46, 0.66, 0.10] }),
      transformSoup(cylinder(0.07, 0.0, 0.16, 6, {}), { translate: [0.46, 0.66, -0.10] })) },
    { name: 'fox-snout', color: [0.95, 0.92, 0.86], rough: 0.8,
      tris: transformSoup(cylinder(0.085, 0.02, 0.16, 6, {}), { rot: { z: -Math.PI / 2 }, translate: [0.62, 0.47, 0] }) },
    { name: 'fox-tail', color: [0.80, 0.36, 0.11], rough: 0.8,
      tris: transformSoup(cylinder(0.0, 0.15, 0.52, 8, {}), { rot: { z: Math.PI / 2 + 0.25 }, translate: [-0.42, 0.50, 0] }) },
    { name: 'fox-tailtip', color: [0.95, 0.93, 0.88], rough: 0.8,
      tris: ellipsoid(0.10, 0.09, 0.09, [-0.66, 0.62, 0], 7, 5) },
  ],
  rabbit: [
    { name: 'rabbit-feet', color: [0.55, 0.53, 0.51], rough: 0.85, tris: merge(
      transformSoup(box(0.18, 0.05, 0.07), { translate: [-0.04, 0.03, 0.10] }),
      transformSoup(box(0.18, 0.05, 0.07), { translate: [-0.04, 0.03, -0.10] })) },
    { name: 'rabbit-body', color: [0.63, 0.61, 0.59], rough: 0.85,
      tris: ellipsoid(0.21, 0.23, 0.20, [0, 0.24, 0]) },
    { name: 'rabbit-head', color: [0.66, 0.64, 0.62], rough: 0.85,
      tris: ellipsoid(0.15, 0.15, 0.14, [0.17, 0.38, 0], 8, 6) },
    { name: 'rabbit-ears', color: [0.66, 0.64, 0.62], rough: 0.85, tris: merge(
      transformSoup(box(0.05, 0.28, 0.02), { rot: { z: -0.18 }, translate: [0.16, 0.58, 0.06] }),
      transformSoup(box(0.05, 0.28, 0.02), { rot: { z: -0.18 }, translate: [0.16, 0.58, -0.06] })) },
    { name: 'rabbit-tail', color: [0.95, 0.95, 0.95], rough: 0.85,
      tris: ellipsoid(0.08, 0.08, 0.08, [-0.20, 0.24, 0], 6, 5) },
  ],
  bird: [
    { name: 'bird-legs', color: [0.92, 0.62, 0.16], rough: 0.7, tris: merge(
      leg(0.012, 0.012, 0.12, 0.02, 0.045), leg(0.012, 0.012, 0.12, 0.02, -0.045)) },
    { name: 'bird-body', color: [0.16, 0.40, 0.78], rough: 0.6,
      tris: ellipsoid(0.17, 0.15, 0.14, [0, 0.21, 0]) },
    { name: 'bird-head', color: [0.20, 0.46, 0.84], rough: 0.6,
      tris: ellipsoid(0.10, 0.10, 0.10, [0.16, 0.31, 0], 8, 6) },
    { name: 'bird-beak', color: [0.95, 0.66, 0.16], rough: 0.6,
      tris: transformSoup(cylinder(0.05, 0.0, 0.11, 6, {}), { rot: { z: -Math.PI / 2 }, translate: [0.28, 0.30, 0] }) },
    { name: 'bird-wings', color: [0.10, 0.28, 0.58], rough: 0.6, tris: merge(
      ellipsoid(0.12, 0.03, 0.10, [-0.02, 0.23, 0.13], 7, 5),
      ellipsoid(0.12, 0.03, 0.10, [-0.02, 0.23, -0.13], 7, 5)) },
    { name: 'bird-tail', color: [0.10, 0.28, 0.58], rough: 0.6,
      tris: transformSoup(box(0.20, 0.02, 0.11), { translate: [-0.21, 0.22, 0] }) },
  ],
  frog: [
    { name: 'frog-legs', color: [0.20, 0.48, 0.18], rough: 0.6, tris: merge(
      transformSoup(box(0.22, 0.05, 0.06), { rot: { y: -0.45 }, translate: [-0.09, 0.05, 0.13] }),
      transformSoup(box(0.22, 0.05, 0.06), { rot: { y: 0.45 }, translate: [-0.09, 0.05, -0.13] }),
      transformSoup(box(0.16, 0.04, 0.04), { rot: { y: 0.30 }, translate: [0.17, 0.04, 0.09] }),
      transformSoup(box(0.16, 0.04, 0.04), { rot: { y: -0.30 }, translate: [0.17, 0.04, -0.09] })) },
    { name: 'frog-body', color: [0.24, 0.55, 0.20], rough: 0.55,
      tris: ellipsoid(0.23, 0.16, 0.21, [0, 0.14, 0]) },
    { name: 'frog-belly', color: [0.82, 0.86, 0.56], rough: 0.55,
      tris: ellipsoid(0.16, 0.09, 0.15, [0.05, 0.07, 0], 8, 6) },
    { name: 'frog-eyes', color: [0.42, 0.72, 0.30], rough: 0.5, tris: merge(
      ellipsoid(0.06, 0.06, 0.06, [0.15, 0.25, 0.09], 6, 5),
      ellipsoid(0.06, 0.06, 0.06, [0.15, 0.25, -0.09], 6, 5)) },
    { name: 'frog-pupils', color: [0.05, 0.05, 0.05], rough: 0.5, tris: merge(
      ellipsoid(0.025, 0.025, 0.025, [0.20, 0.27, 0.09], 5, 4),
      ellipsoid(0.025, 0.025, 0.025, [0.20, 0.27, -0.09], 5, 4)) },
  ],
};

// --- GLB writer (glTF 2.0, no external deps) -------------------------------
const COMP_FLOAT = 5126;
const COMP_USHORT = 5123;
const TARGET_ARRAY = 34962;
const TARGET_ELEMENT = 34963;

function buildGlb(nodes) {
  const json = {
    asset: { version: '2.0', generator: '3d-explorer tools/gen-wildlife.mjs' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const chunks = [];
  let binLen = 0;
  const align4 = () => {
    while (binLen % 4 !== 0) { chunks.push(Buffer.from([0])); binLen += 1; }
  };
  const pushView = (buf, target) => {
    align4();
    const byteOffset = binLen;
    chunks.push(buf);
    binLen += buf.length;
    json.bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, target });
    return json.bufferViews.length - 1;
  };

  nodes.forEach((node) => {
    const T = node.tris.length;
    const pos = new Float32Array(T * 9);
    const nrm = new Float32Array(T * 9);
    const idx = new Uint16Array(T * 3);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    node.tris.forEach((tri, ti) => {
      const fn = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
      for (let k = 0; k < 3; k++) {
        const o = (ti * 3 + k) * 3;
        pos[o] = tri[k][0]; pos[o + 1] = tri[k][1]; pos[o + 2] = tri[k][2];
        nrm[o] = fn[0]; nrm[o + 1] = fn[1]; nrm[o + 2] = fn[2];
        for (let c = 0; c < 3; c++) {
          if (tri[k][c] < min[c]) min[c] = tri[k][c];
          if (tri[k][c] > max[c]) max[c] = tri[k][c];
        }
      }
      idx[ti * 3] = ti * 3;
      idx[ti * 3 + 1] = ti * 3 + 1;
      idx[ti * 3 + 2] = ti * 3 + 2;
    });

    const posView = pushView(Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength), TARGET_ARRAY);
    json.accessors.push({
      bufferView: posView, componentType: COMP_FLOAT, count: T * 3,
      type: 'VEC3', min, max,
    });
    const posAcc = json.accessors.length - 1;

    const nrmView = pushView(Buffer.from(nrm.buffer, nrm.byteOffset, nrm.byteLength), TARGET_ARRAY);
    json.accessors.push({
      bufferView: nrmView, componentType: COMP_FLOAT, count: T * 3, type: 'VEC3',
    });
    const nrmAcc = json.accessors.length - 1;

    const idxView = pushView(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength), TARGET_ELEMENT);
    json.accessors.push({
      bufferView: idxView, componentType: COMP_USHORT, count: T * 3, type: 'SCALAR',
    });
    const idxAcc = json.accessors.length - 1;

    json.materials.push({
      name: node.name + '-mat',
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [node.color[0], node.color[1], node.color[2], 1],
        metallicFactor: 0,
        roughnessFactor: node.rough,
      },
    });
    const matIdx = json.materials.length - 1;

    json.meshes.push({
      name: node.name,
      primitives: [{
        attributes: { POSITION: posAcc, NORMAL: nrmAcc },
        indices: idxAcc,
        material: matIdx,
      }],
    });
    const meshIdx = json.meshes.length - 1;

    json.nodes.push({ name: node.name, mesh: meshIdx });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  });

  align4();
  json.buffers.push({ byteLength: binLen });
  const bin = Buffer.concat(chunks);

  let jsonStr = JSON.stringify(json);
  while (jsonStr.length % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, bin]);
}

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [key, nodes] of Object.entries(MODELS)) {
  const glb = buildGlb(nodes);
  const file = join(OUT_DIR, `${key}.glb`);
  writeFileSync(file, glb);
  total += glb.length;
  console.log(`wrote wildlife/${key}.glb  ${(glb.length / 1024).toFixed(1)} KB  (${nodes.length} node${nodes.length > 1 ? 's' : ''})`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB across ${Object.keys(MODELS).length} creatures`);
