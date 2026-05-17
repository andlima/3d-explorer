#!/usr/bin/env node
// gen-models.mjs — one-time authoring tool for the 3d-explorer prop assets.
//
// This script is NOT part of the running site (no build step, no runtime
// dependency). It deterministically authors the low-poly GLB props committed
// under assets/models/. The resulting .glb files are original work created for
// this project and released into the public domain (CC0 1.0); see
// assets/CREDITS.md. Re-run with `node tools/gen-models.mjs` to regenerate
// byte-identical output.
//
// Why authored here instead of fetched: the implementing sandbox can only
// reach github.com / the npm registries, not the CC0 asset CDNs
// (poly.pizza / kenney.nl / quaternius.com), and no reliably-licensed
// low-poly nature-prop GLB set is reachable through the allowed hosts.
// Authoring originals and dedicating them CC0 is the cleanest reachable
// CC0 source and fully exercises the GLB loading pipeline.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'models');

// --- deterministic PRNG (matches the mulberry32 used in index.html) ---------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// --- primitive triangle-soup builders --------------------------------------
// Cylinder/cone along +Y, centred on origin (y in [-h/2, +h/2]).
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
    if (rBottom > 0 || rTop > 0) {
      tris.push([p0, p1, p2], [p0, p2, p3]);
    }
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

// Hexagonal-ish bipyramid (crystal shard): ring at y=0, apexes up/down.
function shard(r, hUp, hDown, sides) {
  const tris = [];
  const top = v(0, hUp, 0);
  const bot = v(0, -hDown, 0);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    const ra = v(r * Math.cos(a), 0, r * Math.sin(a));
    const rb = v(r * Math.cos(b), 0, r * Math.sin(b));
    tris.push([ra, rb, top], [rb, ra, bot]);
  }
  return tris;
}

// Mushroom-style rounded cap: base ring -> mid ring -> apex, closed underside.
function dome(R, H, segs) {
  const tris = [];
  const ring = (rad, y, i) => {
    const a = (i / segs) * Math.PI * 2;
    return v(rad * Math.cos(a), y, rad * Math.sin(a));
  };
  for (let i = 0; i < segs; i++) {
    const a0 = ring(R, 0, i), a1 = ring(R, 0, i + 1);
    const m0 = ring(R * 0.66, H * 0.55, i), m1 = ring(R * 0.66, H * 0.55, i + 1);
    const apex = v(0, H, 0);
    tris.push([a0, a1, m1], [a0, m1, m0], [m0, m1, apex]);
  }
  // flat underside so the cap is watertight
  const c = v(0, 0, 0);
  for (let i = 0; i < segs; i++) {
    tris.push([c, ring(R, 0, i), ring(R, 0, i + 1)]);
  }
  return tris;
}

// Jittered icosahedron — a chunky low-poly rock.
function rock(radius, seed) {
  const rnd = mulberry32(seed);
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const verts = base.map((p) => {
    const n = norm(p);
    const j = radius * (0.78 + rnd() * 0.42);
    return [n[0] * j, n[1] * j * 0.92, n[2] * j];
  });
  return faces.map(([a, b, c]) => [verts[a], verts[b], verts[c]]);
}

// --- model definitions: each model is a set of named, materialled nodes ----
// Colors are linear-ish sRGB triplets in [0,1]; metallic 0, matte roughness.
const MODELS = {
  rock: [
    { name: 'rock', color: [0.46, 0.47, 0.49], rough: 0.95,
      tris: rock(0.62, 0x52ab) },
  ],
  log: [
    { name: 'log-bark', color: [0.40, 0.27, 0.16], rough: 0.92,
      tris: transformSoup(cylinder(0.34, 0.32, 2.0, 10, { capBottom: false, capTop: false }),
        { rot: { z: Math.PI / 2 } }) },
    { name: 'log-ends', color: [0.70, 0.55, 0.34], rough: 0.85,
      tris: [
        ...transformSoup(cylinder(0.32, 0.32, 0.02, 12, {}), { rot: { z: Math.PI / 2 }, translate: [1.0, 0, 0] }),
        ...transformSoup(cylinder(0.34, 0.34, 0.02, 12, {}), { rot: { z: Math.PI / 2 }, translate: [-1.0, 0, 0] }),
      ] },
  ],
  mushroom: [
    { name: 'mushroom-stem', color: [0.92, 0.89, 0.81], rough: 0.8,
      tris: transformSoup(cylinder(0.10, 0.12, 0.52, 10, {}), { translate: [0, 0.26, 0] }) },
    { name: 'mushroom-cap', color: [0.74, 0.20, 0.16], rough: 0.55,
      tris: transformSoup(dome(0.34, 0.30, 12), { translate: [0, 0.48, 0] }) },
  ],
  stump: [
    { name: 'stump-bark', color: [0.34, 0.22, 0.12], rough: 0.95,
      tris: transformSoup(cylinder(0.46, 0.42, 0.72, 12, { capTop: false }), { translate: [0, 0.36, 0] }) },
    { name: 'stump-rings', color: [0.66, 0.50, 0.30], rough: 0.7,
      tris: transformSoup(cylinder(0.42, 0.40, 0.06, 12, {}), { translate: [0, 0.72, 0] }) },
  ],
  crystal_cluster: [
    { name: 'crystal-main', color: [0.42, 0.36, 0.91], rough: 0.25,
      tris: transformSoup(shard(0.16, 0.78, 0.16, 6), { translate: [0, 0.20, 0] }) },
    { name: 'crystal-side', color: [0.30, 0.82, 0.88], rough: 0.25,
      tris: transformSoup(shard(0.12, 0.54, 0.12, 6), { rot: { z: 0.34 }, translate: [0.20, 0.16, 0.04] }) },
    { name: 'crystal-shoot', color: [0.70, 0.53, 1.0], rough: 0.25,
      tris: transformSoup(shard(0.09, 0.40, 0.09, 6), { rot: { x: -0.42 }, translate: [-0.17, 0.12, 0.13] }) },
  ],
};

// --- GLB writer (glTF 2.0, no external deps) -------------------------------
const COMP_FLOAT = 5126;
const COMP_USHORT = 5123;
const TARGET_ARRAY = 34962;
const TARGET_ELEMENT = 34963;

function buildGlb(nodes) {
  const json = {
    asset: { version: '2.0', generator: '3d-explorer tools/gen-models.mjs' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const chunks = []; // {bytes:Buffer}
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
    // Flat-shaded, non-indexed: one unique vertex trio per triangle.
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

let total = 0;
for (const [key, nodes] of Object.entries(MODELS)) {
  const glb = buildGlb(nodes);
  const file = join(OUT_DIR, `${key}.glb`);
  writeFileSync(file, glb);
  total += glb.length;
  console.log(`wrote ${key}.glb  ${(glb.length / 1024).toFixed(1)} KB  (${nodes.length} node${nodes.length > 1 ? 's' : ''})`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB across ${Object.keys(MODELS).length} models`);
