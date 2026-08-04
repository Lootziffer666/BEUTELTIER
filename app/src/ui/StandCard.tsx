/**
 * Was an einem Stand steht.
 *
 * Ein Stand ist kein Aussteller: auf einer Fläche können viele sitzen, und
 * derselbe Aussteller kann an mehreren Stellen stehen. Beide Richtungen sind
 * hier sichtbar.
 */

import type { Dataset } from '../data/load';

interface Props {
  data: Dataset;
  standId: string | null;
  startStandId: string | null;
  onSetStart: (standId: string | null) => void;
  inTour: boolean;
  onToggleTour: (standId: string) => void;
}

export function StandCard({ data, standId, startStandId, onSetStart, inTour, onToggleTour }: Props) {
  if (!standId) {
    return (
      <section className="card card--quiet">
        <p className="muted">Einen Stand auf der Karte antippen oder suchen.</p>
      </section>
    );
  }

  const stand = data.standsById.get(standId);
  if (!stand) return null;

  const hall = data.hallsByKey.get(stand.hallKey);
  const occupants = (data.registry.occupancy[standId] ?? [])
    .map((id) => data.exhibitorsById.get(id))
    .filter((one): one is NonNullable<typeof one> => Boolean(one));

  const compound = data.registry.compounds.find(
    (entry) => entry.standIds.includes(standId) || entry.hallKey === stand.hallKey,
  );

  return (
    <section className="card">
      <h2>
        {stand.hallKey} · {stand.code}
      </h2>
      <p className="figures">
        <span>{Math.round(stand.areaSqm)} m²</span>
        <span>Ebene {stand.level}</span>
        {hall?.placement.source === 'geschaetzt' && (
          <span
            className="badge badge--warn"
            title="Die Halle selbst ist nur geschätzt platziert; die Stände darin liegen zueinander exakt."
          >
            Hallenlage ±{Math.round(hall.placement.residualM ?? 0)} m
          </span>
        )}
        {hall && hall.height.heightSource === 'derived' && (
          <span
            className="badge badge--warn"
            title={
              `Boden ${hall.height.floorElevationMinM}–${hall.height.floorElevationMaxM} m über Grund. ` +
              `Gerechnet aus der lichten Höhe der Ebene darunter plus Geschossdecke — die Decke ist geschätzt.`
            }
          >
            Bodenhöhe gerechnet ±{hall.height.heightUncertaintyM} m
          </span>
        )}
      </p>

      {occupants.length > 0 ? (
        <ul className="occupants">
          {occupants.map((one) => (
            <li key={one.id}>
              <strong>{one.name}</strong>
              {one.country && <small>{one.country}</small>}
              {one.placements.length > 1 && (
                <small className="muted">
                  steht außerdem an{' '}
                  {one.placements
                    .filter((placement) => placement.standId !== standId)
                    .map((placement) => `${placement.hall} ${placement.stand}`)
                    .join(', ')}
                </small>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Für diese Fläche ist kein Aussteller verzeichnet.</p>
      )}

      {compound && !compound.confirmed && compound.hallKey === stand.hallKey && (
        <p className="muted">
          In dieser Halle liegt der Bereich <strong>{compound.name}</strong>. Welche Flächen genau
          dazugehören, ist noch nicht bestätigt.
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className={startStandId === standId ? 'is-active' : ''}
          onClick={() => onSetStart(startStandId === standId ? null : standId)}
        >
          {startStandId === standId ? 'Start aufheben' : 'Als Start setzen'}
        </button>
        <button type="button" onClick={() => onToggleTour(standId)}>
          {inTour ? 'Aus Beutezug' : 'In Beutezug'}
        </button>
      </div>
    </section>
  );
}
