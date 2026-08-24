#!/usr/bin/env node
/**
 * Laedt Geometrie und Textur fuer jeden von `traverse.mjs` gefundenen Knoten
 * und baut daraus eine einzelne GLB -- das amtliche NRW 3D-Mesh (Terrain,
 * Gebaeude, Vegetation, alles fotografisch texturiert), nicht nachgebaut aus
 * DGM+DOP+LoD2, sondern das Originalprodukt.
 *
 * Geometrie kommt aus dem *unkomprimierten* Puffer (geometries/0), nicht dem
 * Draco-Puffer (geometries/1) -- beide existieren, aber das unkomprimierte
 * Layout ist selbstbeschreibend (Header: vertexCount, featureCount; danach
 * Position Float32x3 * vertexCount, danach uv0 Float32x2 * vertexCount) und
 * brauchte keinen zusaetzlichen Decoder.
 *
 * Weltposition = obb.center + rotate(lokal, obb.quaternion). Szenenposition
 * (dieselbe Konvention wie der Rest von BEUTELTIER) = Welt minus
 * world-origin.json-Ursprung [358300, 5645800, 40].
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';

const BASE = 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
const ORIGIN = [358300.0, 5645800.0, 40.0];
// Knoten, deren eigene OBB in X oder Y groesser als das hier ist, sind grobe
// Hintergrund-Kacheln, die das ROI nur am Rand streifen -- fuers ROI selbst
// ohne Nutzen, aber gross im Download. Verwerfen.
const MAX_HALFSIZE_M = 700;

function rotateByQuat([x, y, z], [qx, qy, qz, qw]) {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseGeometry(buf) {
  const vertexCount = buf.readUInt32LE(0);
  const featureCount = buf.readUInt32LE(4);
  let off = 8;
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount * 3; i++) {
    positions[i] = buf.readFloatLE(off);
    off += 4;
  }
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount * 2; i++) {
    uvs[i] = buf.readFloatLE(off);
    off += 4;
  }
  return { vertexCount, featureCount, positions, uvs };
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const allLeaves = JSON.parse(readFileSync(process.argv[2] ?? 'leaves.json', 'utf8'));
  const outPath = process.argv[3] ?? 'koelnmesse-nrw-mesh.glb';
  const leaves = allLeaves.filter(
    (n) => Math.max(n.obb.halfSize[0], n.obb.halfSize[1]) < MAX_HALFSIZE_M,
  );
  console.log(`${leaves.length}/${allLeaves.length} nodes kept after dropping coarse background tiles`);

  console.log(`fetching geometry+texture for ${leaves.length} nodes...`);
  const fetched = await mapConcurrent(leaves, 16, async (node, i) => {
    const resource = node.mesh?.geometry?.resource;
    if (resource === undefined) return null;
    try {
      const [geomBuf, texBuf] = await Promise.all([
        fetchBuffer(`${BASE}/nodes/${resource}/geometries/0`),
        fetchBuffer(`${BASE}/nodes/${resource}/textures/0`),
      ]);
      if ((i + 1) % 50 === 0) console.log(`  fetched ${i + 1}/${leaves.length}`);
      return { node, geomBuf, texBuf };
    } catch (err) {
      console.error(`  node ${node.index}: fetch failed - ${err.message}`);
      return null;
    }
  });
  console.log('fetch phase done, assembling glTF...');

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('koelnmesse-nrw-mesh');
  doc.getRoot().setDefaultScene(scene);

  let ok = 0;
  let failed = 0;
  let totalVerts = 0;

  for (const entry of fetched) {
    if (!entry) { failed++; continue; }
    const { node, geomBuf, texBuf } = entry;
    try {
      const { vertexCount, positions, uvs } = parseGeometry(geomBuf);
      if (vertexCount === 0) { failed++; continue; }

      const scenePositions = new Float32Array(vertexCount * 3);
      const [cx, cy, cz] = node.obb.center;
      const quat = node.obb.quaternion;
      const identity = quat[0] === 0 && quat[1] === 0 && quat[2] === 0 && quat[3] === 1;
      for (let v = 0; v < vertexCount; v++) {
        let lx = positions[v * 3];
        let ly = positions[v * 3 + 1];
        let lz = positions[v * 3 + 2];
        if (!identity) [lx, ly, lz] = rotateByQuat([lx, ly, lz], quat);
        const wx = cx + lx;
        const wy = cy + ly;
        const wz = cz + lz;
        // three.js ist Y-up: Weltelevation -> glTF Y, Welt-Y (BEUTELTIERs
        // "y"/Szenen-Z) -> glTF Z.
        scenePositions[v * 3] = wx - ORIGIN[0];
        scenePositions[v * 3 + 1] = wz - ORIGIN[2];
        scenePositions[v * 3 + 2] = wy - ORIGIN[1];
      }
      const flippedUvs = new Float32Array(vertexCount * 2);
      for (let v = 0; v < vertexCount; v++) {
        flippedUvs[v * 2] = uvs[v * 2];
        flippedUvs[v * 2 + 1] = 1 - uvs[v * 2 + 1];
      }

      const posAccessor = doc.createAccessor().setType('VEC3').setArray(scenePositions).setBuffer(buffer);
      const uvAccessor = doc.createAccessor().setType('VEC2').setArray(flippedUvs).setBuffer(buffer);

      const texture = doc.createTexture(`tex-${node.index}`).setImage(texBuf).setMimeType('image/jpeg');
      const material = doc.createMaterial(`mat-${node.index}`)
        .setBaseColorTexture(texture)
        .setRoughnessFactor(1)
        .setMetallicFactor(0);

      const prim = doc.createPrimitive()
        .setAttribute('POSITION', posAccessor)
        .setAttribute('TEXCOORD_0', uvAccessor)
        .setMaterial(material);
      const mesh = doc.createMesh(`mesh-${node.index}`).addPrimitive(prim);
      const gltfNode = doc.createNode(`node-${node.index}`).setMesh(mesh);
      scene.addChild(gltfNode);
      ok++;
      totalVerts += vertexCount;
    } catch (err) {
      failed++;
      console.error(`node ${node.index}: FAILED - ${err.message}`);
    }
  }

  console.log(`ok=${ok} failed=${failed} totalVerts=${totalVerts}`);

  const io = new NodeIO();
  await io.write(outPath, doc);
  console.log('wrote', outPath);
}

main();
