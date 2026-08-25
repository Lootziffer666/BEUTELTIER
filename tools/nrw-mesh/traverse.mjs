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
 * haben, deren OBB es nicht mehr tut).
 *
 * Deshalb reicht "hat keine passenden Kinder mehr -> Blatt behalten" allein
 * nicht: wenn NUR EIN TEIL der Kinder das ROI schneidet, kann der Rest der
 * Elternflaeche innerhalb des ROI unabgedeckt bleiben (echtes Loch, nicht nur
 * Rand ausserhalb des ROI). Deshalb wird die Flaechenabdeckung tatsaechlich
 * geprueft (Rasterraster ueber die ROI-geschnittene XY-Footprint des Knotens,
 * siehe coversFootprint()): nur wenn die passenden Kinder die eigene Flaeche
 * des Knotens (innerhalb des ROI) vollstaendig abdecken, wird ausschliesslich
 * in die Kinder abgestiegen. Andernfalls wird der Knoten selbst zusaetzlich
 * behalten (bewusste Ueberinklusion an der Lueckenstelle -- lieber doppelte
 * Geometrie an einer LOD-Naht als ein Loch im ROI).
 *
 * Sowohl Fuellung als auch die normale "keine passenden Kinder mehr"-Aufnahme
 * unterliegen derselben Grosse-Sperre (eligibleForPick()/LOCAL_HALFSIZE_CAP_M):
 * ein Knoten ist ein eigenstaendiges Mesh ueber seine GESAMTE OBB, nicht nur
 * den ROI-Ausschnitt -- ihn ungeprueft zu behalten kann eine riesige, weit
 * ueber das ROI hinausragende Flaeche hereinziehen (in diesem Datensatz real
 * beobachtet: Randknoten mit halfSize bis ~460m, nur an einer Ecke ins ROI
 * hineinragend).
 */
import { writeFileSync } from 'node:fs';
import { xyFootprint, fetchWithRetry } from './i3s-transform.mjs';

const BASE = 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
const NODES_PER_PAGE = 64;

const pageCache = new Map();
const pageInflight = new Map();

async function fetchPage(pageIndex) {
  if (pageCache.has(pageIndex)) return pageCache.get(pageIndex);
  if (pageInflight.has(pageIndex)) return pageInflight.get(pageIndex);
  const p = (async () => {
    const url = `${BASE}/nodepages/${pageIndex}?f=json`;
    const res = await fetchWithRetry(url, { headers: { 'Accept-Encoding': 'gzip' } });
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

function clipRect(rect, roi) {
  const minX = Math.max(rect.minX, roi.xmin);
  const maxX = Math.min(rect.maxX, roi.xmax);
  const minY = Math.max(rect.minY, roi.ymin);
  const maxY = Math.min(rect.maxY, roi.ymax);
  if (maxX <= minX || maxY <= minY) return null;
  return { minX, maxX, minY, maxY };
}

// 48x48-Raster ueber die ROI-geschnittene Elternflaeche: billig (<=2304
// Punktproben je Knoten) und aufloesungsunabhaengig vom absoluten Massstab
// des Knotens (grobe Wurzelnaehe-Knoten wie tiefe Blaetter gleich schnell).
const COVERAGE_GRID_N = 48;
const COVERAGE_TOLERANCE = 0.01;

// Ein Knoten ist ein vollstaendiges, eigenstaendiges Mesh ueber seine GESAMTE
// eigene OBB, nicht nur ueber den ROI-Ausschnitt -- ihn zu behalten heisst,
// seine ganze Flaeche zu importieren, egal wie klein der tatsaechliche
// Ueberlappungsanteil mit dem ROI ist. Zwei Faelle brauchen deshalb eine
// Grosse-Sperre, sonst wird flaechenmaessig weit mehr importiert als das ROI:
//   1) Fuellung (kein Kind deckt die Elternflaeche voll ab): grobe Knoten in
//      Wurzelnaehe haben fast immer "unvollstaendige" Kinderabdeckung (normal
//      fuer eine featuregetriebene Pyramide, keine echte Luecke).
//   2) "keine passenden Kinder mehr": ein riesiger, nur am Rand ins ROI
//      hineinragender Knoten (echte Beispiele aus diesem Datensatz: halfSize
//      bis ~460m, einer davon mit einer Rotation, die die grosse lokale
//      Z-Achse auf die Welt-Hoehe abbildet -- absurde Elevation im Export)
//      hat seine "Kinder" evtl. schlicht in einem Nachbargebiet, das unser
//      ROI nicht schneidet.
// Echte Blattgroessen in diesem Datensatz liegen bei halfSize ~10-50m.
const LOCAL_HALFSIZE_CAP_M = 100;
// Groessere Knoten sind nur zulaessig, wenn ein wesentlicher Teil ihrer
// EIGENEN Flaeche tatsaechlich im ROI liegt (nicht nur eine Ecke).
const MIN_OVERLAP_FRACTION = 0.3;

function footprintOverlapFraction(obb, roi) {
  const rect = xyFootprint(obb);
  const totalArea = (rect.maxX - rect.minX) * (rect.maxY - rect.minY);
  if (totalArea <= 0) return 0;
  const clipped = clipRect(rect, roi);
  if (!clipped) return 0;
  const clippedArea = (clipped.maxX - clipped.minX) * (clipped.maxY - clipped.minY);
  return clippedArea / totalArea;
}

function eligibleForPick(obb, roi) {
  if (Math.max(obb.halfSize[0], obb.halfSize[1]) <= LOCAL_HALFSIZE_CAP_M) return true;
  return footprintOverlapFraction(obb, roi) >= MIN_OVERLAP_FRACTION;
}

function coversFootprint(parentObb, childObbs, roi) {
  const parentRect = clipRect(xyFootprint(parentObb), roi);
  if (!parentRect) return true;
  const w = parentRect.maxX - parentRect.minX;
  const h = parentRect.maxY - parentRect.minY;
  if (w <= 0 || h <= 0) return true;
  const childRects = childObbs.map((o) => clipRect(xyFootprint(o), roi)).filter(Boolean);
  if (!childRects.length) return false;
  let uncovered = 0;
  const total = COVERAGE_GRID_N * COVERAGE_GRID_N;
  for (let iy = 0; iy < COVERAGE_GRID_N; iy++) {
    const cy = parentRect.minY + ((iy + 0.5) / COVERAGE_GRID_N) * h;
    for (let ix = 0; ix < COVERAGE_GRID_N; ix++) {
      const cx = parentRect.minX + ((ix + 0.5) / COVERAGE_GRID_N) * w;
      const covered = childRects.some(
        (r) => cx >= r.minX && cx <= r.maxX && cy >= r.minY && cy <= r.maxY,
      );
      if (!covered) uncovered++;
    }
  }
  return uncovered / total <= COVERAGE_TOLERANCE;
}

function obbIntersectsRoi(obb, roi) {
  // xyFootprint() projiziert alle 8 rotierten Ecken und nimmt Min/Max -- das
  // beruecksichtigt Rotation korrekt (der Grund, warum ein reiner
  // achsenparalleler Test auf den rohen halfSize-Werten frueher ganze Aeste
  // faelschlich leer durchfallen liess), ist aber weit enger als eine
  // Kugel mit Radius = halfSize-Diagonale. Die Kugel-Variante erlaubte
  // grossen, laenglichen Knoten mit Zentrum weit ausserhalb des ROI trotzdem
  // als "im ROI" zu gelten (ihr Radius allein reichte hinein) -- das zog
  // Flaechen weit ausserhalb von Halle 9/10/Boulevard/Piazza in den Export.
  return clipRect(xyFootprint(obb), roi) !== null;
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
    const results = await mapConcurrent(frontier, 12, async (node) => {
      const children = node.children ?? [];
      if (!children.length) return { node, matchedChildren: [] };
      const fetched = await mapConcurrent(children, 12, async (idx) => {
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
    let gapFills = 0;
    let droppedLarge = 0;
    for (const { node, matchedChildren } of results) {
      if (!matchedChildren.length) {
        if (node.mesh) {
          if (eligibleForPick(node.obb, roi)) picked.push(node);
          else droppedLarge++;
        }
        continue;
      }
      if (node.mesh && eligibleForPick(node.obb, roi) && !coversFootprint(node.obb, matchedChildren.map((c) => c.obb), roi)) {
        picked.push(node);
        gapFills++;
      }
      nextFrontier.push(...matchedChildren);
    }
    if (gapFills) console.error(`  depth ${depth}: kept ${gapFills} parent node(s) whose children don't fully cover their ROI footprint (gap fill)`);
    if (droppedLarge) console.error(`  depth ${depth}: dropped ${droppedLarge} large node(s) whose own footprint is mostly outside the ROI (boundary-grazing, no matching children)`);
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
