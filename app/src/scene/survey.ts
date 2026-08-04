/**
 * Was beim Begehen als „falsch" markiert wird — mit Kamerazustand statt
 * Beschreibung.
 *
 * Wer im No-Clip-Modus ein Referenzfoto ausrichtet und dann markiert, soll
 * das nicht in Worten nachreichen müssen: Standpunkt, Blickrichtung und
 * Halle stehen schon in der Notiz, gelesen aus der laufenden Szene, nicht
 * erfragt. Die Fotos selbst gehören nicht hierher — sie bleiben im Browser
 * (Object-URL) und werden nie automatisch exportiert oder kopiert.
 */

import type { LayoutPatch } from './walk';

export interface CameraSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hallKey: string | null;
}

export interface Annotation {
  id: string;
  createdAt: string;
  note: string;
  camera: CameraSnapshot;
}

const STORAGE_KEY = 'beuteltier.survey.v1';

export function loadAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Annotation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAnnotations(annotations: Annotation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  } catch {
    // localStorage kann im privaten Modus fehlen -- die Notiz bleibt dann
    // nur für die laufende Sitzung erhalten. Kein Grund, den Rundgang zu
    // unterbrechen.
  }
}

export function exportAnnotations(annotations: Annotation[]): string {
  return JSON.stringify(
    { schema: 'beuteltier.survey.v1', exportedAt: new Date().toISOString(), annotations },
    null,
    2,
  );
}

export function downloadAnnotations(annotations: Annotation[]): void {
  const blob = new Blob([exportAnnotations(annotations)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `beuteltier-notizen-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Kompakte Textform für einen Blick auf einen Eintrag, ohne die volle JSON-Struktur. */
export function describeSnapshot(camera: CameraSnapshot): string {
  const deg = Math.round(((camera.yaw * 180) / Math.PI + 360) % 360);
  const halle = camera.hallKey ?? 'im Freien';
  return `${halle} · x=${camera.x.toFixed(1)} y=${camera.y.toFixed(1)} z=${camera.z.toFixed(1)} · Blick ${deg}°`;
}

const LAYOUT_STORAGE_KEY = 'beuteltier.layout-patches.v1';

export function loadLayoutPatches(): LayoutPatch[] {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LayoutPatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLayoutPatches(patches: LayoutPatch[]): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(patches));
  } catch {
    // Wie bei Notizen: im privaten Modus bleibt der Patch wenigstens bis zum Reload
    // im React-State erhalten.
  }
}

export function exportLayoutPatches(patches: LayoutPatch[]): string {
  return JSON.stringify(
    { schema: 'beuteltier.layout-patches.v1', exportedAt: new Date().toISOString(), patches },
    null,
    2,
  );
}

export function downloadLayoutPatches(patches: LayoutPatch[]): void {
  const blob = new Blob([exportLayoutPatches(patches)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `beuteltier-layout-patches-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
