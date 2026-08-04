/**
 * Alles, was der Nutzer selbst erzeugt -- lokal, aber nicht für immer lokal.
 *
 * Es gibt keinen Server und keine Konten. Trotzdem läuft jede Änderung durch
 * ein Ereignisprotokoll: wer später Sperren oder Goodie-Meldungen zwischen
 * Geräten abgleichen will, braucht genau das und nicht den letzten Zustand.
 * Nachträglich ließe sich das nicht mehr rekonstruieren, deshalb steht es von
 * Anfang an da.
 *
 * Meldungen kommen nicht aus der App. Goodies werden auf fremden Servern
 * gepostet und hier eingelesen -- der Weg dafür ist `ingest`, nicht ein
 * Eingabeformular.
 */

import Dexie, { type Table } from 'dexie';
import type { EdgeState } from '../routing/graph';
import type { Availability, FindStatus } from '../routing/lootziffer';

export interface EdgeOverride {
  edgeId: string;
  state: EdgeState;
  note?: string;
  changedAt: number;
}

export interface EpixEntry {
  id: string;
  year: number;
  /** Veranstaltungstag, 0 = kampagnenweit. */
  day: number;
  title: string;
  url: string;
  kind: 'digital' | 'vor_ort';
  reward: string;
  action: string;
  solution: string;
  answer: string;
  status: 'offen' | 'erledigt' | 'manuell';
  openedAt?: number;
  updatedAt: number;
}

export interface Report {
  id: string;
  title: string;
  body: string;
  /** Woher die Meldung stammt -- bleibt sichtbar (PRD-Leitprinzip 1). */
  source: string;
  sourceUrl?: string;
  reportedAt: number;
  status: FindStatus;
  availability: Availability;
  worth?: number;
  /** Zuordnung, sobald sie eindeutig ist. */
  exhibitorId?: string;
  standId?: string;
  /** Mehrere mögliche Ziele, wenn die Meldung nicht eindeutig ist. */
  candidateStandIds?: string[];
  year: number;
  day?: number;
  updatedAt: number;
}

export interface ChangeEvent {
  id?: number;
  at: number;
  entity: 'edge' | 'epix' | 'report' | 'pouch';
  entityId: string;
  action: 'put' | 'delete';
  payload?: unknown;
}

export interface Setting {
  key: string;
  value: unknown;
}

class BeuteltierDb extends Dexie {
  edges!: Table<EdgeOverride, string>;
  epix!: Table<EpixEntry, string>;
  reports!: Table<Report, string>;
  events!: Table<ChangeEvent, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('beuteltier');
    this.version(1).stores({
      edges: 'edgeId, state, changedAt',
      epix: 'id, year, day, status, kind',
      reports: 'id, status, reportedAt, exhibitorId, standId, year',
      events: '++id, at, entity, entityId',
      settings: 'key',
    });
  }
}

export const db = new BeuteltierDb();

async function record(
  entity: ChangeEvent['entity'],
  entityId: string,
  action: ChangeEvent['action'],
  payload?: unknown,
): Promise<void> {
  await db.events.add({ at: Date.now(), entity, entityId, action, payload });
}

export const store = {
  async setEdgeState(edgeId: string, state: EdgeState, note?: string): Promise<void> {
    const entry: EdgeOverride = { edgeId, state, note, changedAt: Date.now() };
    await db.edges.put(entry);
    await record('edge', edgeId, 'put', entry);
  },

  async clearEdgeState(edgeId: string): Promise<void> {
    await db.edges.delete(edgeId);
    await record('edge', edgeId, 'delete');
  },

  async edgeOverrides(): Promise<Map<string, EdgeState>> {
    const rows = await db.edges.toArray();
    return new Map(rows.map((row) => [row.edgeId, row.state]));
  },

  async putEpix(entry: EpixEntry): Promise<void> {
    const stamped = { ...entry, updatedAt: Date.now() };
    await db.epix.put(stamped);
    await record('epix', entry.id, 'put', stamped);
  },

  async deleteEpix(id: string): Promise<void> {
    await db.epix.delete(id);
    await record('epix', id, 'delete');
  },

  async epixForYear(year: number): Promise<EpixEntry[]> {
    const rows = await db.epix.where('year').equals(year).toArray();
    return rows.sort((a, b) => a.day - b.day || a.title.localeCompare(b.title));
  },

  async putReport(report: Report): Promise<void> {
    const stamped = { ...report, updatedAt: Date.now() };
    await db.reports.put(stamped);
    await record('report', report.id, 'put', stamped);
  },

  async deleteReport(id: string): Promise<void> {
    await db.reports.delete(id);
    await record('report', id, 'delete');
  },

  async reports(): Promise<Report[]> {
    const rows = await db.reports.toArray();
    return rows.sort((a, b) => b.reportedAt - a.reportedAt);
  },

  async setting<T>(key: string, fallback: T): Promise<T> {
    const row = await db.settings.get(key);
    return row ? (row.value as T) : fallback;
  },

  async setSetting(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value });
  },

  /** Für einen späteren Abgleich: alles, was seit einem Zeitpunkt passiert ist. */
  async changesSince(at: number): Promise<ChangeEvent[]> {
    return db.events.where('at').above(at).toArray();
  },
};
