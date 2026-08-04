/**
 * Karte, Route, Sperren.
 *
 * Der Ablauf, den PRD 9 verlangt, ist hier vollständig: Ziel wählen, Route
 * sehen, einen Übergang sperren und die Alternative bekommen. Die Sperre wirkt
 * sofort, weil die Zustände auf den Kanten liegen und nicht in der Geometrie.
 */

import { useMemo, useState } from 'react';
import type { Dataset } from '../data/load';
import type { EdgeState } from '../routing/graph';
import type { Route } from '../routing/route';
import type { SearchHit, buildSearch } from '../features/search';
import { StandCard } from './StandCard';

const STATE_LABELS: Record<EdgeState, string> = {
  offen: 'offen',
  geschlossen: 'gesperrt',
  nur_eingang: 'nur Eingang',
  nur_ausgang: 'nur Ausgang',
  einbahn: 'Einbahn',
  links_herum: 'links herum',
  rechts_herum: 'rechts herum',
  ueberfuellt: 'überfüllt',
  unbestaetigt: 'unbestätigt',
};

const SWITCHABLE: EdgeState[] = [
  'offen',
  'geschlossen',
  'nur_eingang',
  'nur_ausgang',
  'einbahn',
  'ueberfuellt',
];

interface Props {
  data: Dataset;
  search: ReturnType<typeof buildSearch> | null;
  onPick: (hit: SearchHit) => void;
  selectedStandId: string | null;
  startStandId: string | null;
  onSetStart: (standId: string | null) => void;
  route: Route | null;
  tour: { order: string[]; totalM: number; minutes: number } | null;
  tourStandIds: string[];
  onToggleTour: (standId: string) => void;
  overrides: Map<string, EdgeState>;
  onSetEdgeState: (edgeId: string, state: EdgeState) => void;
  onClearEdgeState: (edgeId: string) => void;
  avoidUnconfirmed: boolean;
  onAvoidUnconfirmed: (value: boolean) => void;
  stepFree: boolean;
  onStepFree: (value: boolean) => void;
}

export function MapPanel(props: Props) {
  const { data, route } = props;
  const [query, setQuery] = useState('');

  const hits = useMemo(
    () => (props.search ? props.search.search(query) : []),
    [props.search, query],
  );

  /**
   * Die Übergänge auf der aktuellen Route.
   *
   * Ein Durchgang besteht im Netz aus zwei Kanten -- einer in jede Halle. Für
   * den Nutzer ist er trotzdem eine Sache: „diese Passage ist zu" schaltet
   * beide. Zwei gleich benannte Schalter, von denen nur einer wirkt, wären
   * nur verwirrend.
   */
  const switchable = useMemo(() => {
    if (!route) return [];
    const groups = new Map<string, { label: string; edgeIds: string[]; state: EdgeState }>();
    for (const step of route.steps) {
      if (!['portal', 'elevator', 'escalator', 'stairs'].includes(step.edge.kind)) continue;
      // Die Kanten eines Übergangs hängen alle an seinem Knoten.
      const key = step.edge.a.startsWith('a:') ? step.edge.b : step.edge.a;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.edgeIds.includes(step.edge.id)) existing.edgeIds.push(step.edge.id);
      } else {
        groups.set(key, {
          label: step.edge.label || step.edge.kind,
          edgeIds: [step.edge.id],
          state: props.overrides.get(step.edge.id) ?? step.edge.state,
        });
      }
    }
    return [...groups.entries()].map(([id, entry]) => ({ id, ...entry }));
  }, [route, props.overrides]);

  /** Alle Kanten eines Übergangs mitschalten. */
  const setPassageState = (edgeIds: string[], state: EdgeState) => {
    for (const edgeId of edgeIds) props.onSetEdgeState(edgeId, state);
  };

  return (
    <div className="stack">
      <section>
        <input
          className="search"
          type="search"
          value={query}
          placeholder="Aussteller, Spiel, Stand oder Halle"
          onChange={(event) => setQuery(event.target.value)}
        />
        {hits.length > 0 && (
          <ul className="hits">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" onClick={() => props.onPick(hit)}>
                  <span className={`kind kind--${hit.kind}`}>
                    {hit.kind === 'exhibitor'
                      ? 'Aussteller'
                      : hit.kind === 'stand'
                        ? 'Stand'
                        : hit.kind === 'hall'
                          ? 'Halle'
                          : 'Bereich'}
                  </span>
                  <strong>{hit.title}</strong>
                  <small>{hit.subtitle}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StandCard
        data={data}
        standId={props.selectedStandId}
        startStandId={props.startStandId}
        onSetStart={props.onSetStart}
        inTour={props.selectedStandId ? props.tourStandIds.includes(props.selectedStandId) : false}
        onToggleTour={props.onToggleTour}
      />

      <section className="card">
        <h2>Route</h2>
        {!props.startStandId && <p className="muted">Erst einen Startstand setzen.</p>}
        {props.startStandId && !props.selectedStandId && (
          <p className="muted">Ziel auf der Karte oder über die Suche wählen.</p>
        )}
        {props.startStandId && props.selectedStandId && !route && (
          <p className="warn">
            Kein Weg unter den aktuellen Zuständen. Eine Sperre zurücknehmen oder unbestätigte
            Wege zulassen.
          </p>
        )}
        {route && (
          <>
            <p className="figures">
              <strong>{Math.round(route.distanceM)} m</strong>
              <span>{Math.round(route.minutes)} min</span>
              <span>{route.portals} Übergänge</span>
              <span>{route.levelChanges} Ebenenwechsel</span>
            </p>
            {route.unconfirmed.length > 0 && (
              <p className="warn">
                {route.unconfirmed.length} Abschnitt
                {route.unconfirmed.length === 1 ? '' : 'e'} unbestätigt — ob dort offen ist, weiß
                niemand sicher.
              </p>
            )}
          </>
        )}

        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={props.avoidUnconfirmed}
              onChange={(event) => props.onAvoidUnconfirmed(event.target.checked)}
            />
            nur bestätigte Wege
          </label>
          <label>
            <input
              type="checkbox"
              checked={props.stepFree}
              onChange={(event) => props.onStepFree(event.target.checked)}
            />
            stufenfrei (Aufzug bevorzugen)
          </label>
        </div>
      </section>

      {switchable.length > 0 && (
        <section className="card">
          <h2>Übergänge auf dieser Route</h2>
          <p className="muted">
            Was hier gerade gilt, steht in keiner Quelle. Umschalten, und die Route rechnet neu.
          </p>
          <ul className="edges">
            {switchable.map((passage) => {
              const overridden = passage.edgeIds.some((id) => props.overrides.has(id));
              return (
                <li key={passage.id}>
                  <div className="edges__head">
                    <strong>{passage.label}</strong>
                    <span className={`state state--${passage.state}`}>
                      {STATE_LABELS[passage.state]}
                    </span>
                  </div>
                  <div className="edges__states">
                    {SWITCHABLE.map((state) => (
                      <button
                        key={state}
                        type="button"
                        className={passage.state === state ? 'is-active' : ''}
                        onClick={() => setPassageState(passage.edgeIds, state)}
                      >
                        {STATE_LABELS[state]}
                      </button>
                    ))}
                    {overridden && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          passage.edgeIds.forEach((id) => props.onClearEdgeState(id))
                        }
                      >
                        zurücksetzen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {props.tourStandIds.length > 0 && (
        <section className="card">
          <h2>Beutezug</h2>
          {props.tour ? (
            <>
              <p className="figures">
                <strong>{Math.round(props.tour.totalM)} m</strong>
                <span>{Math.round(props.tour.minutes)} min</span>
                <span>{props.tour.order.length} Ziele</span>
              </p>
              <ol className="tour">
                {props.tour.order.map((nodeId) => {
                  const standId = nodeId.replace(/^s:/, '');
                  const stand = data.standsById.get(standId);
                  return (
                    <li key={nodeId}>
                      {stand ? `${stand.hallKey} · ${stand.code}` : standId}
                      <button type="button" className="ghost" onClick={() => props.onToggleTour(standId)}>
                        entfernen
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="muted">Startstand setzen, dann wird die Reihenfolge optimiert.</p>
          )}
        </section>
      )}

      <section className="card card--quiet">
        <h2>Woher die Karte kommt</h2>
        <p className="muted">
          Standflächen metrisch aus dem offiziellen Hallenplan, {data.registry.coverage.withGeometry}{' '}
          von {data.registry.coverage.placements} Belegungen mit exakter Lage. Hallenlagen aus dem
          gamescom-Plan 2025 eingemessen; {data.site.halls.filter((h) => h.placement.source === 'geschaetzt').length}{' '}
          Hallen stehen nur geschätzt (rund {Math.round(data.site.referenceFit.crossValidatedM)} m).
        </p>
        <p className="muted">
          Lichte Höhen sind offizielle Hallendaten. Die Bodenhöhe der oberen Ebenen ist daraus
          gerechnet — lichte Höhe darunter plus Geschossdecke von{' '}
          {data.site.slabAssumptionM[0]}–{data.site.slabAssumptionM[1]} m. Die Deckenstärke ist
          die einzige Annahme darin und nicht vermessen.
        </p>
        <p className="muted">
          Die gezeichneten Hallenumrisse sind der <em>belegte Bereich</em>, nicht der
          Gebäudeumriss: wo gamescom nur einen Teil einer Halle nutzt, endet der Umriss dort.
        </p>
        <p className="muted">
          Die Gebäude selbst kommen aus dem amtlichen 3D-Modell LoD2 von Geobasis NRW.
          Der Boden draußen und die Dächer tragen das <strong>Senkrechtluftbild</strong> von
          2025, 10 cm aufgelöst — ein Foto des Geländes.{' '}
          <strong>Wände, Hallenböden und Decken sind erfunden</strong>: ein Luftbild zeigt
          sie nicht, und für sie gibt es keine freie Aufnahme. Sie werden aus Fugen,
          Abnutzung und Rauschen erzeugt — plausibel, aber nicht gemessen.
        </p>
      </section>
    </div>
  );
}
