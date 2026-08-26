/**
 * Deckelt gleichzeitig aktive dynamische Punktlichter auf die kameranächsten.
 *
 * Three.js filtert Lichter nicht nach Sichtdistanz aus dem Fragment-Shader
 * jedes Objekts -- jedes aktive Licht der Szene steckt in jedem beleuchteten
 * Pixel, egal wie weit weg. `Hallenlicht` in `interior.tsx` hat das schon
 * einmal am eigenen Leib erfahren (12 -> 6 Punktlichter je Halle, siehe
 * Kommentar dort): Desktop-GPUs stecken zwei Dutzend gleichzeitige
 * Punktlichter mit ihrer Rechenleistung weg, mobile GPUs (begrenzte
 * ALU/Register, kein Early-Out fuer ungenutzte Lichter) fallen genau dabei
 * von "läuft" auf 0,6 fps oder Absturz.
 *
 * `Ausstattung` reduzierte pro Halle nur auf "jedes dritte Lichtband" --
 * unabhaengig von der Hallengroesse blieb das bei einer grossen Halle
 * trotzdem ein Dutzend gleichzeitiger Lichter, alle immer aktiv, egal wo die
 * Kamera gerade steht. Dieser Hook begrenzt zusaetzlich auf ein festes
 * Budget der kameranächsten Positionen -- der Rest bleibt unbemountet (nicht
 * bloss unsichtbar; ein React-Element gar nicht erst zu rendern nimmt es aus
 * Three.js' Lichtliste heraus, `visible={false}` allein aendert daran
 * nichts an der Anzahl der Lichter, die three.js pro Objekt in den Shader
 * einrechnet).
 */
import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** Wie oft pro Sekunde neu sortiert wird -- Licht bewegt sich nie schlagartig. */
const AKTUALISIERUNG_HZ = 4;

export function useLightBudget(
  positionen: readonly (readonly [number, number, number])[],
  budget: number,
): boolean[] {
  const { camera } = useThree();
  const [aktiv, setAktiv] = useState<boolean[]>(() => positionen.map(() => true));
  const letzte = useRef(-Infinity);
  const vorherigeAnzahl = useRef(positionen.length);

  useFrame((state) => {
    // Ein Hallenwechsel aendert die Anzahl der Punkte schlagartig -- dann
    // sofort neu einordnen, statt bis zu 250 ms auf veralteten Indizes
    // sitzenzubleiben (z. B. ein Punkt, der eben noch ausserhalb des
    // Budgets lag, jetzt aber der einzige seiner neuen, kleineren Halle ist).
    const hallenwechsel = positionen.length !== vorherigeAnzahl.current;
    vorherigeAnzahl.current = positionen.length;
    if (positionen.length <= budget) {
      if (hallenwechsel) setAktiv(positionen.map(() => true));
      return;
    }
    if (!hallenwechsel && state.clock.elapsedTime - letzte.current < 1 / AKTUALISIERUNG_HZ) return;
    letzte.current = state.clock.elapsedTime;

    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const distanzen = positionen.map((p, i) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const dz = p[2] - cz;
      return { i, d: dx * dx + dy * dy + dz * dz };
    });
    distanzen.sort((a, b) => a.d - b.d);
    const naechste = new Set(distanzen.slice(0, budget).map((e) => e.i));
    setAktiv((bisher) => {
      const neu = positionen.map((_, i) => naechste.has(i));
      // Nur ein neues Array committen, wenn sich wirklich etwas geaendert
      // hat -- sonst rendert jede Sortierung neu, auch wenn dieselben
      // Lichter gewinnen.
      if (bisher.length === neu.length && bisher.every((v, i) => v === neu[i])) return bisher;
      return neu;
    });
  });

  return aktiv;
}
