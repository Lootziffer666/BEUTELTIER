/**
 * Treppen und Rolltreppen als Geometrie, nicht nur als Routing-Knoten.
 *
 * Der Wegegraph kennt jeden Ebenenwechsel längst -- als Punkt mit Herkunft,
 * Quelle und Unsicherheit (siehe `data/build/graph.json`). Nur gezeichnet
 * wurde er nie: eine Route sprang von einer Ebene zur anderen, ohne dass in
 * der Ego-Perspektive irgendetwas stand. Das hier schließt genau diese Lücke,
 * mit denselben Knoten, die auch das Routing benutzt.
 *
 * Die Richtung ist real, nicht geraten: sie kommt aus den beiden Rasterzellen,
 * an die der Verbinder beim Bau gekoppelt wurde (`ends[].cell`) -- verfügbar,
 * weil sie im Graphen als Nachbarknoten existieren. Die Lauflänge dagegen ist
 * schematisch: eine Standardsteigung (0,175 m) auf den echten Höhenunterschied
 * angewendet, nicht vermessen. Das Ausmaß der Unsicherheit steht schon im
 * Knoten selbst (`meta.uncertaintyM`, `meta.source`) und bestimmt hier nur die
 * Opazität -- ein Aufzug mit `source: 'placeholder'` wird durchscheinend
 * gezeichnet, keine erfundene Position als sicher ausgegeben.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Dataset } from '../data/load';
import type { GraphNode } from '../routing/graph';
import { drehungNachX } from './geometry';

const STEP_RISE_M = 0.175;
const STEP_RUN_M = 0.29;
/** Deckt die Spanne der echten Aufgänge ab (1,8–3,0 m laut Werbeflächen-Katalog). */
const STAIR_WIDTH_M = 2.2;
const ESCALATOR_WIDTH_M = 1.0;
const RAIL_HEIGHT_M = 0.9;
/** Eine einzelne Rolltreppe traegt keinen Ebenenwechsel von 40 m Laenge --
 *  reale Anlagen brechen ihn in Läufe mit Podest. Hier wird nur der obere
 *  Lauf gezeichnet, damit die Szene nicht mit einer unrealistisch langen
 *  Rampe endet. */
const MAX_RISE_PER_FLIGHT_M = 8.5;

interface Flight {
  id: string;
  kind: 'stairs' | 'escalator' | 'elevator';
  base: THREE.Vector3;
  dirX: number;
  dirY: number;
  riseM: number;
  opacity: number;
}

function unitDirection(a: GraphNode, b: GraphNode): [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return [0, 1];
  return [dx / len, dy / len];
}

function buildFlights(data: Dataset, centre: [number, number]): Flight[] {
  const flights: Flight[] = [];

  for (const node of data.graph.nodes.values()) {
    if (node.kind !== 'vertical') continue;
    const sub = (node.meta?.kind as Flight['kind']) ?? 'elevator';

    const neighbours = data.graph
      .neighbours(node.id)
      .map((entry) => data.graph.nodes.get(entry.other))
      .filter((entry): entry is GraphNode => Boolean(entry));
    if (neighbours.length < 2) continue;
    const [lower, upper] = [...neighbours].sort((a, b) => a.z - b.z);

    const connects = node.meta?.connects as [string, string] | undefined;
    const lowerHall = connects ? data.hallsByKey.get(connects[0]) : undefined;
    const upperHall = connects ? data.hallsByKey.get(connects[1]) : undefined;
    const riseM = upperHall && lowerHall ? upperHall.baseY - lowerHall.baseY : upper.z - lower.z;
    if (riseM < 1.5) continue;

    const [dirX, dirY] = unitDirection(lower, upper);
    const source = node.meta?.source as string | undefined;

    flights.push({
      id: node.id,
      kind: sub,
      base: new THREE.Vector3(node.x - centre[0], lower.z, node.y - centre[1]),
      dirX,
      dirY,
      riseM: Math.min(riseM, MAX_RISE_PER_FLIGHT_M),
      opacity: source === 'placeholder' ? 0.35 : 1,
    });
  }

  return flights;
}

/** Massive Stufenkontur, wie vor Ort gegossener Beton -- keine einzelnen Tritte. */
function buildStairsGeometry(riseM: number): THREE.BufferGeometry {
  const steps = Math.max(2, Math.round(riseM / STEP_RISE_M));
  const riser = riseM / steps;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < steps; i += 1) {
    const height = riser * (i + 1);
    const geometry = new THREE.BoxGeometry(STEP_RUN_M, height, STAIR_WIDTH_M);
    geometry.translate(i * STEP_RUN_M + STEP_RUN_M / 2, height / 2, 0);
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  parts.forEach((part) => part.dispose());
  merged.computeVertexNormals();
  return merged;
}

function StairsFlight({ flight }: { flight: Flight }) {
  const geometry = useMemo(() => buildStairsGeometry(flight.riseM), [flight.riseM]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Lokal +X ist die Lauf-Richtung; nach R_y(yaw) landet sie in der Szene bei
  // (cos yaw, 0, -sin yaw). Damit das der echten Richtung (dirX, -dirY) in
  // Szenenkoordinaten entspricht, muss cos yaw = dirX und sin yaw = dirY
  // gelten -- also atan2(dirY, dirX), nicht andersherum. Vertauscht war das
  // hier zuvor der Fehler: eine Nord-Süd-Treppe landete Ost-West.
  const yaw = drehungNachX(flight.dirX, flight.dirY);
  return (
    <group position={flight.base} rotation={[0, yaw, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#c9c9cb" roughness={0.85} metalness={0.05} />
      </mesh>
    </group>
  );
}

/**
 * Rolltreppe: geneigte Bahn mit Glasbrüstung -- das prägende Bild an jedem
 * Aufgang des Südgeländes. Kein Antrieb, keine Stufenkette: die Bewegung
 * würde in einem statischen GLB ohnehin nicht ankommen, das Erscheinungsbild
 * aber schon.
 */
function EscalatorFlight({ flight }: { flight: Flight }) {
  const runM = (flight.riseM / STEP_RISE_M) * STEP_RUN_M;
  const length = Math.hypot(runM, flight.riseM);
  const angle = Math.atan2(flight.riseM, runM);
  // Gleiche Herleitung wie bei StairsFlight: atan2(dirY, dirX), nicht (dirX, dirY).
  const yaw = drehungNachX(flight.dirX, flight.dirY);

  return (
    <group position={flight.base} rotation={[0, yaw, 0]}>
      <group rotation={[0, 0, angle]}>
        <mesh position={[length / 2, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[length, 0.08, ESCALATOR_WIDTH_M]} />
          <meshStandardMaterial color="#2c2e33" roughness={0.4} metalness={0.35} />
        </mesh>
        {/* Kammplatten-Andeutung an den Enden. */}
        <mesh position={[0.05, 0.09, 0]}>
          <boxGeometry args={[0.1, 0.02, ESCALATOR_WIDTH_M]} />
          <meshStandardMaterial color="#f2c744" roughness={0.5} />
        </mesh>
        <mesh position={[length - 0.05, 0.09, 0]}>
          <boxGeometry args={[0.1, 0.02, ESCALATOR_WIDTH_M]} />
          <meshStandardMaterial color="#f2c744" roughness={0.5} />
        </mesh>
        {/* Einfaches transparentes Glas statt echter Transmission: die
            zusätzliche Renderpass-Kamera für Transmission ist auf
            Software-GL (Messegelände-Tablets, CI-Sandbox) zu teuer, ohne
            dass der Unterschied auf einer 3-cm-Scheibe sichtbar würde. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[length / 2, RAIL_HEIGHT_M / 2 + 0.08, (side * ESCALATOR_WIDTH_M) / 2]}>
            <boxGeometry args={[length, RAIL_HEIGHT_M, 0.03]} />
            <meshStandardMaterial
              color="#dceaf5"
              roughness={0.08}
              metalness={0.1}
              transparent
              opacity={0.35}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Aufzugsschacht -- schematisch, mit reduzierter Deckkraft, wenn seine Lage
 * laut Quelle nur ein Platzhalter ist. Lastenaufzüge aus den Technischen
 * Richtlinien sind amtlich verortet, ihre Nutzbarkeit für Besucher ist es
 * nicht -- deshalb steht das hier nie als bestätigter Weg, nur als Objekt.
 */
function ElevatorShaft({ flight }: { flight: Flight }) {
  return (
    <mesh position={[flight.base.x, flight.base.y + flight.riseM / 2, flight.base.z]} castShadow>
      <boxGeometry args={[1.6, flight.riseM, 1.6]} />
      <meshStandardMaterial
        color="#8b8f96"
        roughness={0.5}
        metalness={0.3}
        transparent={flight.opacity < 1}
        opacity={flight.opacity}
      />
    </mesh>
  );
}

export function Vertikalverbindungen({ data, centre }: { data: Dataset; centre: [number, number] }) {
  const flights = useMemo(() => buildFlights(data, centre), [data, centre]);

  return (
    <group>
      {flights.map((flight) => {
        if (flight.kind === 'stairs') return <StairsFlight key={flight.id} flight={flight} />;
        if (flight.kind === 'escalator') return <EscalatorFlight key={flight.id} flight={flight} />;
        return <ElevatorShaft key={flight.id} flight={flight} />;
      })}
    </group>
  );
}
