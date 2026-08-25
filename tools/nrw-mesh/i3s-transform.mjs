/**
 * Gemeinsame I3S-Transform- und Parsing-Logik, von traverse.mjs, build.mjs
 * und verify-single-node.mjs importiert -- ein einziger Ort fuer die
 * EPSG:25832-Weltkoordinate -> BEUTELTIER-Szenenkoordinate Umrechnung, damit
 * der Einzelknoten-Beweis und der Batch-Build garantiert dasselbe rechnen.
 */

// Der SceneServer antwortet unter Last (viele parallele Traversierungen
// dieser Session) gelegentlich mit 503 -- transient, kein echter Fehler.
// Mit kurzem Backoff wiederholen statt den ganzen Lauf abzubrechen.
export async function fetchWithRetry(url, options, retries = 4) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status !== 503 || attempt === retries) {
        throw new Error(`${url} -> HTTP ${res.status}`);
      }
      lastErr = new Error(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw lastErr;
    }
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr;
}

// world-origin.json: Szene = Welt - [358300.0, 5645800.0, 40.0].
export const ORIGIN = [358300.0, 5645800.0, 40.0];

export function rotateByQuat([x, y, z], [qx, qy, qz, qw]) {
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

export function parseGeometry(buf) {
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

// Weltposition = obb.center + rotate(lokal, obb.quaternion). Szenenposition
// (dieselbe Konvention wie der Rest von BEUTELTIER) = Welt minus ORIGIN.
// three.js ist Y-up: Weltelevation -> glTF Y, Welt-Y -> glTF Z.
export function localToScene(local, obb) {
  const [cx, cy, cz] = obb.center;
  const quat = obb.quaternion;
  const identity = quat[0] === 0 && quat[1] === 0 && quat[2] === 0 && quat[3] === 1;
  const [lx, ly, lz] = identity ? local : rotateByQuat(local, quat);
  const wx = cx + lx;
  const wy = cy + ly;
  const wz = cz + lz;
  return [wx - ORIGIN[0], wz - ORIGIN[2], wy - ORIGIN[1]];
}

// Manche Knoten in diesem realen Datensatz haben eine Geometrie, deren
// tatsaechliche lokale Ausdehnung die deklarierte obb.halfSize massiv
// ueberschreitet (beobachtet: ein Knoten mit halfSize.y=40m, dessen echte
// Vertices aber 912m in dieser Achse spannen -- >20x, kein Rundungsfehler).
// Das ist keine Transform-Frage, sondern eine inkonsistente Quellangabe fuer
// diesen einen Knoten -- lieber verwerfen als 900m "Geisterwand" in die
// Szene rechnen. Toleranz grosszuegig (3x), da reale OBBs die Geometrie
// nicht immer eng umschliessen.
const OBB_CONSISTENCY_TOLERANCE = 3;

export function geometryExceedsDeclaredObb(positions, halfSize) {
  const vertexCount = positions.length / 3;
  const maxAbs = [0, 0, 0];
  for (let v = 0; v < vertexCount; v++) {
    for (let a = 0; a < 3; a++) {
      const val = Math.abs(positions[v * 3 + a]);
      if (val > maxAbs[a]) maxAbs[a] = val;
    }
  }
  return maxAbs.some((m, a) => m > halfSize[a] * OBB_CONSISTENCY_TOLERANCE + 1);
}

export function transformPositions(positions, obb) {
  const vertexCount = positions.length / 3;
  const out = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    const [sx, sy, sz] = localToScene(
      [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]],
      obb,
    );
    out[v * 3] = sx;
    out[v * 3 + 1] = sy;
    out[v * 3 + 2] = sz;
  }
  return out;
}

export function flipV(uvs) {
  const vertexCount = uvs.length / 2;
  const out = new Float32Array(vertexCount * 2);
  for (let v = 0; v < vertexCount; v++) {
    out[v * 2] = uvs[v * 2];
    out[v * 2 + 1] = 1 - uvs[v * 2 + 1];
  }
  return out;
}

// Achsenparalleles XY-Footprint einer (moeglicherweise rotierten) OBB in
// Weltkoordinaten -- alle 8 Ecken rotieren+verschieben, Min/Max von X/Y
// nehmen. Konservativ (Ueberinklusion bei rotierten Boxen), wird fuer die
// Kinderabdeckungspruefung in traverse.mjs gebraucht.
export function xyFootprint(obb) {
  const [cx, cy] = obb.center;
  const [hx, hy, hz] = obb.halfSize;
  const quat = obb.quaternion;
  const identity = quat[0] === 0 && quat[1] === 0 && quat[2] === 0 && quat[3] === 1;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const local = [sx * hx, sy * hy, sz * hz];
        const [rx, ry] = identity ? local : rotateByQuat(local, quat);
        const wx = cx + rx;
        const wy = cy + ry;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
      }
    }
  }
  return { minX, maxX, minY, maxY };
}
