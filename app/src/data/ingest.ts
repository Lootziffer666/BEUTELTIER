/**
 * Meldungen von außen einlesen -- die Funkwache.
 *
 * Goodies werden nicht in dieser App eingetippt. Sie stehen auf fremden
 * Servern, bei Goodie Guide/Farbklecks und in Community-Kanälen, und werden
 * hier abgefangen und zugeordnet. Die Eingabe ist deshalb ein Parser, kein
 * Formular.
 *
 * Zwei Grenzen, die das PRD (5.2, 8) zieht und die hier baulich gelten:
 * die Quelle bleibt an jeder Meldung erhalten, und es wird nichts im Namen
 * des Nutzers geschrieben -- dieses Modul liest ausschließlich.
 */

import type { Exhibitor, Registry } from './types';
import type { Report } from './store';
import type { Availability, FindStatus } from '../routing/lootziffer';

export interface IngestAdapter {
  id: string;
  label: string;
  /** Woher die Meldungen stammen -- wird an jeder Meldung sichtbar gehalten. */
  credit: string;
  parse: (raw: string, context: IngestContext) => ParsedReport[];
}

export interface IngestContext {
  registry: Registry;
  year: number;
  now?: number;
}

export interface ParsedReport {
  title: string;
  body: string;
  exhibitorId?: string;
  candidateStandIds: string[];
  availability: Availability;
  status: FindStatus;
  sourceUrl?: string;
  reportedAt: number;
}

const HALL_STAND = /Halle\s*([\d.]+)\s*[|,/]?\s*([A-G]\d{2,3}[a-z]?)/i;
const HALL_ONLY = /Halle\s*(\d+(?:\.\d)?)/i;
const URL_PATTERN = /https?:\/\/\S+/i;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Rechtsformen und Füllwörter, die keinen Aussteller unterscheiden.
 *
 * In einer Goodie-Meldung steht „Bandai Namco", nicht „Bandai Namco
 * Entertainment Germany GmbH". Wer auf den vollen Registernamen besteht,
 * erkennt in der Praxis nichts.
 */
const NOISE = new Set([
  'gmbh', 'ag', 'ug', 'kg', 'co', 'ltd', 'limited', 'inc', 'llc', 'bv', 'b',
  'sarl', 'srl', 'sa', 'se', 'spa', 'as', 'ab', 'aps', 'oy', 'sp', 'zoo',
  'the', 'and', 'und', 'of', 'de', 'europe', 'germany', 'deutschland',
  'entertainment', 'interactive', 'studios', 'studio', 'games', 'game',
  'group', 'media', 'digital', 'software', 'international', 'haftungsbeschrankt',
]);

function significantTokens(name: string): string[] {
  return normalise(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !NOISE.has(token));
}

/**
 * Sucht den Aussteller, von dem eine Meldung spricht.
 *
 * Bewertet wird, wie viele der kennzeichnenden Namensbestandteile im Text
 * vorkommen -- und ob der erste dabei ist, denn der trägt die Marke. Ein
 * einzelnes gemeinsames Wort reicht nur, wenn es lang und damit selten ist;
 * sonst würde „Games" die halbe Ausstellerliste treffen.
 */
export function matchExhibitor(text: string, exhibitors: Exhibitor[]): Exhibitor | undefined {
  const haystack = ` ${normalise(text)} `;
  let best: Exhibitor | undefined;
  let bestScore = 0;

  for (const exhibitor of exhibitors) {
    const tokens = significantTokens(exhibitor.name);
    if (tokens.length === 0) continue;

    const present = tokens.filter((token) => haystack.includes(` ${token} `));
    if (present.length === 0) continue;
    if (!present.includes(tokens[0])) continue;
    if (present.length === 1 && tokens[0].length < 6) continue;

    // Länge der Treffer schlägt Anzahl: „Bandai Namco" ist aussagekräftiger
    // als zwei kurze Allerweltswörter.
    const score = present.reduce((sum, token) => sum + token.length, 0) + present.length;
    if (score > bestScore) {
      best = exhibitor;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Bestimmt die möglichen Ziele einer Meldung.
 *
 * Ein Aussteller kann mehrere Stände haben. Steht im Text eine Halle, wird
 * darauf eingeschränkt; sonst bleiben alle Stände als Kandidaten stehen. Die
 * App zeigt dann mehrere Ziele, statt eines zu raten (PRD 5.4).
 */
export function candidateStands(
  text: string,
  exhibitor: Exhibitor | undefined,
  registry: Registry,
): string[] {
  const explicit = HALL_STAND.exec(text);
  if (explicit) {
    const standId = `${explicit[1]}:${explicit[2].toUpperCase()}`;
    if (registry.occupancy[standId]) return [standId];
  }

  if (!exhibitor) return [];
  const withGeometry = exhibitor.placements
    .map((placement) => placement.standId)
    .filter((id): id is string => Boolean(id));

  // Auch ohne Standcode grenzt eine genannte Halle die Möglichkeiten ein:
  // „Nintendo in Halle 6.1" meint nicht den Stand in Halle 9.
  const hall = explicit?.[1] ?? HALL_ONLY.exec(text)?.[1];
  if (hall && withGeometry.length > 1) {
    const inHall = withGeometry.filter((id) => id.startsWith(`${hall}:`));
    if (inHall.length > 0) return inHall;
  }
  return withGeometry;
}

/**
 * Freitext-Adapter für Goodie-Meldungen.
 *
 * Erwartet, was in solchen Kanälen tatsächlich steht: eine Zeile pro Meldung
 * oder durch Leerzeilen getrennte Absätze, irgendwo ein Ausstellername, oft
 * eine Halle und ein Standcode, manchmal ein Link.
 */
export const freeTextAdapter: IngestAdapter = {
  id: 'freitext',
  label: 'Freitext / Zwischenablage',
  credit: 'Quelle wird je Meldung eingetragen',
  parse(raw, context) {
    const now = context.now ?? Date.now();
    const blocks = raw
      .split(/\n\s*\n|\n(?=[-*•]\s)/)
      .map((block) => block.trim())
      .filter((block) => block.length > 3);

    return blocks.map((block) => {
      const exhibitor = matchExhibitor(block, context.registry.exhibitors);
      const stands = candidateStands(block, exhibitor, context.registry);
      const url = URL_PATTERN.exec(block)?.[0];
      const firstLine = block.split('\n')[0].replace(/^[-*•]\s*/, '').trim();
      const digital = /\b(digital|online|code|key)\b/i.test(block);
      const onSite = /\b(stand|halle|booth|vor ort)\b/i.test(block);

      return {
        title: firstLine.slice(0, 120),
        body: block,
        exhibitorId: exhibitor?.id,
        candidateStandIds: stands,
        availability: digital && onSite ? 'beides' : digital ? 'digital' : 'vor_ort',
        // Nichts gilt als bestätigt, nur weil es jemand geschrieben hat.
        status: 'unbestaetigt' as FindStatus,
        sourceUrl: url,
        reportedAt: now,
      };
    });
  },
};

/**
 * Goodie-Guide-Adapter.
 *
 * Dieselbe Erkennung, aber mit fester Quellenangabe -- die Credits bleiben an
 * der Meldung hängen, auch wenn sie später weitergereicht wird.
 */
export const goodieGuideAdapter: IngestAdapter = {
  id: 'goodie-guide',
  label: 'Goodie Guide / Farbklecks',
  credit: 'Goodie Guide (Farbklecks)',
  parse: (raw, context) => freeTextAdapter.parse(raw, context),
};

export const adapters: IngestAdapter[] = [goodieGuideAdapter, freeTextAdapter];

export function toReports(
  parsed: ParsedReport[],
  adapter: IngestAdapter,
  year: number,
): Report[] {
  return parsed.map((item, index) => ({
    id: `report:${adapter.id}:${item.reportedAt}:${index}`,
    title: item.title,
    body: item.body,
    source: adapter.credit,
    sourceUrl: item.sourceUrl,
    reportedAt: item.reportedAt,
    status: item.status,
    availability: item.availability,
    exhibitorId: item.exhibitorId,
    standId: item.candidateStandIds.length === 1 ? item.candidateStandIds[0] : undefined,
    candidateStandIds:
      item.candidateStandIds.length > 1 ? item.candidateStandIds : undefined,
    year,
    updatedAt: item.reportedAt,
  }));
}
