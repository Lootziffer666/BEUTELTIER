/**
 * Aussteller-, Spiele- und Standregister.
 *
 * Der Ausgangspunkt ist die Beziehung, nicht der Ort: ein Aussteller kann an
 * mehreren Ständen stehen, ein Stand mehrere Aussteller tragen. Beides wird
 * hier gezeigt, samt der Stelle, an der die Datenlage aufhört.
 */

import { useMemo, useState } from 'react';
import type { Dataset } from '../data/load';
import type { SearchHit, buildSearch } from '../features/search';

interface Props {
  data: Dataset;
  search: ReturnType<typeof buildSearch> | null;
  onPick: (hit: SearchHit) => void;
}

export function RegistryPanel({ data, search, onPick }: Props) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => (search ? search.search(query, 60) : []), [search, query]);

  const byHall = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exhibitor of data.registry.exhibitors) {
      for (const placement of exhibitor.placements) {
        if (!placement.standId) continue;
        const hall = placement.standId.split(':')[0];
        counts.set(hall, (counts.get(hall) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const compound = data.registry.compounds[0];

  return (
    <div className="stack">
      <section>
        <input
          className="search"
          type="search"
          value={query}
          placeholder="Aussteller oder Stand suchen"
          onChange={(event) => setQuery(event.target.value)}
        />
        {hits.length > 0 && (
          <ul className="hits">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" onClick={() => onPick(hit)}>
                  <span className={`kind kind--${hit.kind}`}>
                    {hit.kind === 'exhibitor' ? 'Aussteller' : hit.kind === 'stand' ? 'Stand' : 'Bereich'}
                  </span>
                  <strong>{hit.title}</strong>
                  <small>{hit.subtitle}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {compound && (
        <section className="card">
          <h2>{compound.name}</h2>
          <p className="muted">{compound.handover}</p>
          <div className="row">
            <button
              type="button"
              onClick={() =>
                onPick({
                  kind: 'compound',
                  id: compound.id,
                  title: compound.name,
                  subtitle: '',
                  standIds: compound.standIds,
                  hallKey: compound.hallKey,
                })
              }
            >
              Auf der Karte zeigen
            </button>
            {compound.app.web && (
              <a className="button" href={compound.app.web} target="_blank" rel="noopener noreferrer">
                Indie Arena Booth App
              </a>
            )}
          </div>
          {!compound.confirmed && (
            <p className="warn">
              Welche Flächen genau zum Bereich gehören, ist für {data.registry.year} noch nicht
              bestätigt — die Karte führt bis Halle {compound.hallKey}.
            </p>
          )}
          <p className="muted">{compound.credit}</p>
        </section>
      )}

      <section className="card">
        <h2>Bestand</h2>
        <p className="figures">
          <strong>{data.registry.exhibitors.length}</strong>
          <span>Aussteller</span>
          <strong>{Object.keys(data.registry.occupancy).length}</strong>
          <span>belegte Flächen</span>
        </p>
        <ul className="halls">
          {byHall.map(([hall, count]) => {
            const info = data.hallsByKey.get(hall);
            return (
              <li key={hall}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      kind: 'hall',
                      id: `hall:${hall}`,
                      title: info?.name ?? hall,
                      subtitle: '',
                      standIds: [],
                      hallKey: hall,
                    })
                  }
                >
                  <strong>{info?.name ?? hall}</strong>
                  <small>{count} Belegungen</small>
                  {info?.placement.source === 'geschaetzt' && (
                    <span className="badge badge--warn">Lage geschätzt</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {data.registry.unmatched.length > 0 && (
        <section className="card card--quiet">
          <h2>Ohne Lage</h2>
          <p className="muted">
            Für diese Belegungen gibt es keine Standgeometrie — die Halle liefert keinen Plan.
          </p>
          <ul>
            {data.registry.unmatched.map((entry) => (
              <li key={`${entry.exhibitor}:${entry.stand}`}>
                {entry.exhibitor} — Halle {entry.hall} {entry.stand}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card card--quiet">
        <p className="muted">
          Aussteller und Stände aus dem offiziellen gamescom-Verzeichnis, Stand{' '}
          {new Date(data.registry.collectedAt).toLocaleDateString('de-DE')}.
        </p>
      </section>
    </div>
  );
}
