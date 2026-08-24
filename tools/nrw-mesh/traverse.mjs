#!/usr/bin/env node
/**
 * Findet die Knoten des amtlichen NRW 3D-Mesh (I3S SceneServer), deren
 * eigener Gueltigkeitsbereich das Koelnmesse-ROI ueberdeckt -- Halle 9,
 * Halle 10, Boulevard, Piazza/Eingang Sued.
 *
 * Quelle: Geobasis NRW, 3D-Mesh (seit 2023 aus Luftbildern erzeugt), Datenlizenz
 * Deutschland - Zero - Version 2.0 (dl-de/zero-2-0). SceneServer:
 * https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer -- I3S Version 1.7,
 * EPSG:25832 (dieselbe CRS wie der Rest dieses Repos), Draco- und
 * unkomprimierte Geometrie beide verfuegbar, JPEG-Texturen.
 *
 * Das Format ist eine "mesh pyramid" (node-switching LOD): JEDER Knoten hat
 * ein eigenes vollstaendiges Mesh, nicht nur die Blaetter. Kinder existieren
 * nur dort, wo eine feinere Darstellung verfuegbar ist -- und Kinder decken
 * NICHT zuverlaessig genau die Flaeche des Elternknotens ab (durch Probieren
 * bestaetigt: ein Knoten, dessen eigene OBB das ROI schneidet, kann Kinder
 * haben, deren OBB es nicht mehr tut). Behalten wird deshalb pro Ast der
 * TIEFSTE Knoten, dessen eigene OBB das ROI noch schneidet -- nicht "hat
 * keine Kinder".
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
const NODES_PER_PAGE = 64;

const pageCache = new Map();
const pageInflight = new Map();

async function fetchPage(pageIndex) {
  if (pageCache.has(pageIndex)) return pageCache.get(pageIndex);
  if (pageInflight.has(pageIndex)) return pageInflight.get(pageIndex);
  const p = (async () => {
    const url = `${BASE}/nodepages/${pageIndex}?f=json`;
    const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    if (!res.ok) throw new Error(`nodepage ${pageIndex} -> HTTP ${res.status}`);
    const data = await res.json();
    pageCache.set(pageIndex, data);
    return data;
  })();
  pageInflight.set(pageIndex, p);
  return p;
}

async function getNode(index) {
  const page = await fetchPage(Math.floor(index / NODES_PER_PAGE));
  const offset = index % NODES_PER_PAGE;
  if (page.nodes[offset]?.index === index) return page.nodes[offset];
  const found = page.nodes.find((n) => n.index === index);
  if (!found) throw new Error(`node ${index} not found in its page`);
  return found;
}

function obbIntersectsRoi(obb, roi) {
  const [cx, cy] = obb.center;
  const [hx, hy, hz] = obb.halfSize;
  // Konservativ: die OBB als Kugel behandeln (Radius = Laenge des
  // halfSize-Vektors). Manche Knoten tragen ein nicht-identisches
  // Quaternion (rotierte OBB an schraegen/steilen Stellen) -- ein reiner
  // achsenparalleler Test dagegen liess ganze Aeste faelschlich leer
  // durchfallen. Nur Ueber-, nie Unterinklusion, das ist bei einem kleinen
  // ROI unschaedlich.
  const radius = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const nx = Math.min(Math.max(cx, roi.xmin), roi.xmax);
  const ny = Math.min(Math.max(cy, roi.ymin), roi.ymax);
  const dist = Math.hypot(cx - nx, cy - ny);
  return dist <= radius;
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

export async function traverse(roi) {
  const root = await getNode(0);
  let frontier = [root];
  const picked = [];
  let visited = 0;
  let depth = 0;
  while (frontier.length) {
    visited += frontier.length;
    console.error(`depth ${depth}: exploring ${frontier.length} nodes (pages cached: ${pageCache.size})`);
    const results = await mapConcurrent(frontier, 24, async (node) => {
      const children = node.children ?? [];
      if (!children.length) return { node, matchedChildren: [] };
      const fetched = await mapConcurrent(children, 24, async (idx) => {
        try {
          return await getNode(idx);
        } catch (err) {
          console.error(`  warn: child ${idx} fetch failed: ${err.message}`);
          return null;
        }
      });
      const matchedChildren = fetched.filter((c) => c && obbIntersectsRoi(c.obb, roi));
      return { node, matchedChildren };
    });
    const nextFrontier = [];
    for (const { node, matchedChildren } of results) {
      if (!matchedChildren.length) {
        if (node.mesh) picked.push(node);
        continue;
      }
      nextFrontier.push(...matchedChildren);
    }
    frontier = nextFrontier;
    depth++;
  }
  console.error(`visited ${visited} nodes, ${pageCache.size} pages fetched, ${picked.length} nodes picked in ROI`);
  return picked;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // ROI in EPSG:25832: grosszuegige Box um Halle 9/10, Boulevard, Piazza,
  // Eingang Sued (siehe app/public/data/world-origin.json fuer den
  // Szenen-Ursprung [358300, 5645800, 40], auf dem diese Box beruht).
  const roi = {
    xmin: 357800.0, xmax: 358550.0,
    ymin: 5645650.0, ymax: 5646450.0,
  };
  const picked = await traverse(roi);
  const outPath = process.argv[2] ?? 'leaves.json';
  writeFileSync(outPath, JSON.stringify(picked));
  console.log(`wrote ${picked.length} node records to ${outPath}`);
}
