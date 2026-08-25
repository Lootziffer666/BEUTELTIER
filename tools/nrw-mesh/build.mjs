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
import { parseGeometry, transformPositions, flipV, fetchWithRetry, geometryExceedsDeclaredObb } from './i3s-transform.mjs';

const BASE = 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
// Knoten, deren eigene OBB in X oder Y groesser als das hier ist, sind grobe
// Hintergrund-Kacheln, die das ROI nur am Rand streifen -- fuers ROI selbst
// ohne Nutzen, aber gross im Download. Verwerfen.
const MAX_HALFSIZE_M = 700;

async function fetchBuffer(url) {
  const res = await fetchWithRetry(url, { headers: { 'Accept-Encoding': 'gzip' } });
  return Buffer.from(await res.arrayBuffer());
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
      if (geometryExceedsDeclaredObb(positions, node.obb.halfSize)) {
        failed++;
        console.error(`node ${node.index}: REJECTED - geometry extent inconsistent with its own declared OBB (bad source data for this node)`);
        continue;
      }

      const scenePositions = transformPositions(positions, node.obb);
      const flippedUvs = flipV(uvs);

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
