/**
 * Suche über Aussteller, Stände und Hallen.
 *
 * Ein Aussteller ist kein Ort: derselbe Name kann an mehreren Ständen stehen,
 * und ein Gemeinschaftsstand trägt viele Aussteller. Ein Treffer führt deshalb
 * nicht auf „den" Ort, sondern auf alle, die dazu gehören.
 */

import MiniSearch from 'minisearch';
import type { Dataset } from '../data/load';

export interface SearchHit {
  kind: 'exhibitor' | 'stand' | 'hall' | 'compound';
  id: string;
  title: string;
  subtitle: string;
  standIds: string[];
  hallKey?: string;
}

interface IndexedDoc {
  id: string;
  kind: SearchHit['kind'];
  title: string;
  subtitle: string;
  terms: string;
  standIds: string[];
  hallKey?: string;
}

export function buildSearch(data: Dataset): {
  search: (query: string, limit?: number) => SearchHit[];
} {
  const docs: IndexedDoc[] = [];

  for (const exhibitor of data.registry.exhibitors) {
    const standIds = exhibitor.placements
      .map((placement) => placement.standId)
      .filter((id): id is string => Boolean(id));
    const where = exhibitor.placements
      .map((placement) => `Halle ${placement.hall} ${placement.stand}`)
      .join(' · ');
    docs.push({
      id: `exhibitor:${exhibitor.id}`,
      kind: 'exhibitor',
      title: exhibitor.name,
      subtitle: where || 'ohne Standangabe',
      terms: `${exhibitor.name} ${exhibitor.country} ${where}`,
      standIds,
      hallKey: standIds[0]?.split(':')[0],
    });
  }

  for (const stand of data.site.stands) {
    const occupants = data.registry.occupancy[stand.id] ?? [];
    const names = occupants
      .map((id) => data.exhibitorsById.get(id)?.name)
      .filter(Boolean)
      .join(' ');
    docs.push({
      id: `stand:${stand.id}`,
      kind: 'stand',
      title: `${stand.hallKey} · ${stand.code}`,
      subtitle: occupants.length
        ? `${occupants.length} Aussteller · ${Math.round(stand.areaSqm)} m²`
        : `frei · ${Math.round(stand.areaSqm)} m²`,
      terms: `${stand.hallKey} ${stand.codes.join(' ')} ${names}`,
      standIds: [stand.id],
      hallKey: stand.hallKey,
    });
  }

  for (const hall of data.site.halls) {
    docs.push({
      id: `hall:${hall.key}`,
      kind: 'hall',
      title: hall.name,
      subtitle: `${Math.round(hall.widthM)} × ${Math.round(hall.depthM)} m · Ebene ${hall.level}`,
      terms: `${hall.name} ${hall.key} Halle`,
      standIds: [],
      hallKey: hall.key,
    });
  }

  for (const compound of data.registry.compounds) {
    docs.push({
      id: `compound:${compound.id}`,
      kind: 'compound',
      title: compound.name,
      subtitle: `Halle ${compound.hallKey} · eigener Bereich`,
      terms: `${compound.name} ${compound.hallKey}`,
      standIds: compound.standIds,
      hallKey: compound.hallKey,
    });
  }

  const index = new MiniSearch<IndexedDoc>({
    fields: ['title', 'terms'],
    storeFields: ['kind', 'title', 'subtitle', 'standIds', 'hallKey'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } },
  });
  index.addAll(docs);

  return {
    search(query, limit = 24) {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      return index.search(trimmed).slice(0, limit).map((result) => ({
        kind: result.kind as SearchHit['kind'],
        id: String(result.id),
        title: result.title as string,
        subtitle: result.subtitle as string,
        standIds: result.standIds as string[],
        hallKey: result.hallKey as string | undefined,
      }));
    },
  };
}
