/**
 * Karte, Route, Sperren – bewusst als kompakter Accordion-Stack.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

type SectionId = 'search' | 'selection' | 'route' | 'passages' | 'tour' | 'source';

interface AccordionProps {
  id: SectionId;
  icon: string;
  title: string;
  badge?: string;
  openSection: SectionId | null;
  onOpen: (id: SectionId | null) => void;
  children: ReactNode;
}

function AccordionSection(props: AccordionProps) {
  const open = props.openSection === props.id;
  return (
    <section className={`map-accordion ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="map-accordion__head"
        onClick={() => props.onOpen(open ? null : props.id)}
        aria-expanded={open}
      >
        <span className="map-accordion__icon" aria-hidden="true">{props.icon}</span>
        <span>{props.title}</span>
        {props.badge && <small>{props.badge}</small>}
        <span className="map-accordion__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="map-accordion__body">{props.children}</div>}
    </section>
  );
}

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
  const [openSection, setOpenSection] = useState<SectionId | null>('search');

  useEffect(() => {
    if (props.selectedStandId) setOpenSection('selection');
  }, [props.selectedStandId]);

  const hits = useMemo(
    () => (props.search ? props.search.search(query) : []),
    [props.search, query],
  );

  const switchable = useMemo(() => {
    if (!route) return [];
    const groups = new Map<string, { label: string; edgeIds: string[]; state: EdgeState }>();
    for (const step of route.steps) {
      if (!['portal', 'elevator', 'escalator', 'stairs'].includes(step.edge.kind)) continue;
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

  const setPassageState = (edgeIds: string[], state: EdgeState) => {
    for (const edgeId of edgeIds) props.onSetEdgeState(edgeId, state);
  };

  const routeBadge = route ? `${Math.round(route.distanceM)} m · ${Math.round(route.minutes)} min` : undefined;

  return (
    <div className="map-accordion-stack">
      <AccordionSection
        id="search"
        icon="⌕"
        title="Suchen"
        badge={query && hits.length ? `${hits.length}` : undefined}
        openSection={openSection}
        onOpen={setOpenSection}
      >
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
      </AccordionSection>

      <AccordionSection
        id="selection"
        icon="◎"
        title="Auswahl"
        badge={props.selectedStandId ?? undefined}
        openSection={openSection}
        onOpen={setOpenSection}
      >
        <StandCard
          data={data}
          standId={props.selectedStandId}
          startStandId={props.startStandId}
          onSetStart={props.onSetStart}
          inTour={props.selectedStandId ? props.tourStandIds.includes(props.selectedStandId) : false}
          onToggleTour={props.onToggleTour}
        />
        {!props.selectedStandId && <p className="muted">Stand oder Halle auf der Karte antippen.</p>}
      </AccordionSection>

      <AccordionSection
        id="route"
        icon="↝"
        title="Route"
        badge={routeBadge}
        openSection={openSection}
        onOpen={setOpenSection}
      >
        {!props.startStandId && <p className="muted">Erst einen Startstand setzen.</p>}
        {props.startStandId && !props.selectedStandId && (
          <p className="muted">Ziel auf der Karte oder über die Suche wählen.</p>
        )}
        {props.startStandId && props.selectedStandId && !route && (
          <p className="warn">Kein Weg unter den aktuellen Zuständen.</p>
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
              <p className="warn">{route.unconfirmed.length} unbestätigte Abschnitte.</p>
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
            stufenfrei
          </label>
        </div>
      </AccordionSection>

      {switchable.length > 0 && (
        <AccordionSection
          id="passages"
          icon="⇄"
          title="Übergänge"
          badge={`${switchable.length}`}
          openSection={openSection}
          onOpen={setOpenSection}
        >
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
                        onClick={() => passage.edgeIds.forEach((id) => props.onClearEdgeState(id))}
                      >
                        zurücksetzen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </AccordionSection>
      )}

      {props.tourStandIds.length > 0 && (
        <AccordionSection
          id="tour"
          icon="✦"
          title="Beutezug"
          badge={props.tour ? `${Math.round(props.tour.totalM)} m` : `${props.tourStandIds.length}`}
          openSection={openSection}
          onOpen={setOpenSection}
        >
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
        </AccordionSection>
      )}

      <AccordionSection
        id="source"
        icon="ⓘ"
        title="Kartendaten"
        openSection={openSection}
        onOpen={setOpenSection}
      >
        <p className="muted">
          Standflächen metrisch aus dem offiziellen Hallenplan, {data.registry.coverage.withGeometry}{' '}
          von {data.registry.coverage.placements} Belegungen mit exakter Lage. Hallenlagen aus dem
          gamescom-Plan eingemessen; {data.site.halls.filter((h) => h.placement.source === 'geschaetzt').length}{' '}
          Hallen stehen nur geschätzt.
        </p>
        <p className="muted">
          Gebäude aus dem amtlichen LoD2-Modell von Geobasis NRW; Halleninnenflächen bleiben modelliert.
        </p>
      </AccordionSection>
    </div>
  );
}
