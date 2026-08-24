import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadDataset, type Dataset } from './data/load';
import { store } from './data/store';
import { buildSearch, type SearchHit } from './features/search';
import { MapPanel } from './ui/MapPanel';
import { DemoCorridorCard } from './ui/DemoCorridorCard';
import { SiteScene, type CameraPreset } from './scene/SiteScene';
import { findRoute, planTour, type Route } from './routing/route';
import type { EdgeState } from './routing/graph';
import { ProceduralStagingNotice } from './scene/ProceduralStagingNotice';
import { loadLayoutPatches } from './scene/survey';
import type { LayoutPatch } from './scene/walk';

const CAMERA_PRESETS: CameraPreset[] = ['uebersicht', 'halle', 'laufmodus', 'ego'];

const PRESET_META: Record<CameraPreset, { icon: string; label: string }> = {
  uebersicht: { icon: '▦', label: 'Übersicht' },
  halle: { icon: '▣', label: 'Halle' },
  laufmodus: { icon: '↗', label: 'Laufmodus' },
  ego: { icon: '◎', label: 'Begehen' },
};

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upperOpacity, setUpperOpacity] = useState(0.85);
  const [preset, setPreset] = useState<CameraPreset>('uebersicht');
  const [selectedStandId, setSelectedStandId] = useState<string | null>(null);
  const [focusHallKey, setFocusHallKey] = useState<string | null>(null);
  const [stagingObjectCount, setStagingObjectCount] = useState(0);
  const [previewSafe, setPreviewSafe] = useState(true);
  const [cel, setCel] = useState(false);
  const [showStands, setShowStands] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 901px)').matches,
  );

  const [startStandId, setStartStandId] = useState<string | null>(null);
  const [tourStandIds, setTourStandIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Map<string, EdgeState>>(new Map());
  const [avoidUnconfirmed, setAvoidUnconfirmed] = useState(false);
  const [stepFree, setStepFree] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [layoutPatches] = useState<LayoutPatch[]>(() => loadLayoutPatches());

  useEffect(() => {
    loadDataset()
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
    store.edgeOverrides().then(setOverrides);
  }, []);

  const patchedData = useMemo(() => {
    if (!data) return null;
    return { ...data, walk: data.walk.withLayoutPatches(layoutPatches) };
  }, [data, layoutPatches]);

  const search = useMemo(() => (patchedData ? buildSearch(patchedData) : null), [patchedData]);

  const routeOptions = useMemo(
    () => ({ stateOverrides: overrides, avoidUnconfirmed, stepFree }),
    [overrides, avoidUnconfirmed, stepFree],
  );

  const standRoute: Route | null = useMemo(() => {
    if (!patchedData || !startStandId || !selectedStandId || startStandId === selectedStandId) return null;
    return findRoute(
      patchedData.graph,
      patchedData.graph.standNodeId(startStandId),
      patchedData.graph.standNodeId(selectedStandId),
      routeOptions,
    );
  }, [patchedData, startStandId, selectedStandId, routeOptions]);

  const demoRoute: Route | null = useMemo(() => {
    if (!patchedData || !demoActive || !patchedData.demoCorridor) return null;
    return findRoute(
      patchedData.graph,
      patchedData.demoCorridor.startNodeId,
      patchedData.demoCorridor.goalNodeId,
      {
        stateOverrides: overrides,
        // Der belegte Korridor enthaelt bewusst markierte Unsicherheit. Sie zu
        // verstecken waere keine strengere Route, sondern eine leere Demo.
        avoidUnconfirmed: false,
        stepFree: false,
      },
    );
  }, [patchedData, demoActive, overrides]);

  const route = demoActive ? demoRoute : standRoute;

  const tour = useMemo(() => {
    if (!patchedData || !startStandId || tourStandIds.length === 0) return null;
    return planTour(
      patchedData.graph,
      patchedData.graph.standNodeId(startStandId),
      tourStandIds.map((id) => patchedData.graph.standNodeId(id)),
      routeOptions,
    );
  }, [patchedData, startStandId, tourStandIds, routeOptions]);

  const setEdgeState = useCallback(async (edgeId: string, state: EdgeState) => {
    await store.setEdgeState(edgeId, state);
    setOverrides(await store.edgeOverrides());
  }, []);

  const clearEdgeState = useCallback(async (edgeId: string) => {
    await store.clearEdgeState(edgeId);
    setOverrides(await store.edgeOverrides());
  }, []);

  const pickHit = useCallback((hit: SearchHit) => {
    setDemoActive(false);
    if (hit.standIds.length > 0) setSelectedStandId(hit.standIds[0]);
    if (hit.hallKey) {
      setFocusHallKey(hit.hallKey);
      setPreset('halle');
    }
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoActive((active) => {
      const next = !active;
      if (next) {
        setSelectedStandId(null);
        setStartStandId(null);
        setFocusHallKey(null);
        setPreset('uebersicht');
        setPanelOpen(true);
      }
      return next;
    });
  }, []);

  if (error) {
    return (
      <div className="boot boot--error">
        <h1>BEUTELTIER</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!patchedData) {
    return (
      <div className="boot">
        <img src={`${import.meta.env.BASE_URL}brand/lootzy-head.png`} alt="" width={72} />
        <h1>BEUTELTIER</h1>
        <p className="muted">Gelände wird geladen …</p>
      </div>
    );
  }

  const routeStandIds = [
    ...(startStandId ? [startStandId] : []),
    ...(selectedStandId ? [selectedStandId] : []),
    ...tourStandIds,
  ];

  const toggleMapView = () => {
    setPreset((current) => (current === 'uebersicht' ? 'halle' : 'uebersicht'));
  };

  return (
    <div className={`app compact-shell ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      <div className="stage">
        <SiteScene
          data={patchedData}
          upperOpacity={upperOpacity}
          selectedStandId={selectedStandId}
          routeStandIds={routeStandIds}
          route={route}
          preset={preset}
          focusHallKey={focusHallKey}
          highlightHallKey={demoActive ? patchedData.demoCorridor?.target.hallKey ?? null : focusHallKey}
          showStands={showStands}
          routeOnTop={demoActive}
          previewSafe={previewSafe}
          cel={cel}
          onSelectStand={(standId) => {
            setDemoActive(false);
            setSelectedStandId(standId);
            if (standId) {
              setFocusHallKey(patchedData.standsById.get(standId)?.hallKey ?? null);
            }
          }}
          onLeaveEgo={() => setPreset('uebersicht')}
          onStagingObjectCount={setStagingObjectCount}
        />

        <ProceduralStagingNotice
          visible={
            showStands &&
            Boolean(focusHallKey) &&
            (preset === 'halle' || preset === 'ego') &&
            stagingObjectCount > 0
          }
        />

        <div className="map-toolbar" aria-label="Kartenwerkzeuge">
          <button
            type="button"
            className="icon-button view-toggle"
            onClick={toggleMapView}
            title={`Ansicht: ${PRESET_META[preset].label}. Tippen zum Umschalten.`}
            aria-label={`Ansicht ${PRESET_META[preset].label}`}
          >
            {PRESET_META[preset].icon}
          </button>
          <button
            type="button"
            className={`icon-button ${toolboxOpen ? 'is-active' : ''}`}
            onClick={() => setToolboxOpen((value) => !value)}
            title="Werkzeuge"
            aria-label="Werkzeuge"
            aria-expanded={toolboxOpen}
          >
            ⚙
          </button>
          <a
            className="icon-button world-builder-icon"
            href={`${import.meta.env.BASE_URL}world-builder.html`}
            title="World Builder"
            aria-label="World Builder öffnen"
          >
            🧱
          </a>
        </div>

        {toolboxOpen && (
          <div className="map-toolbox">
            <details open>
              <summary>Ansicht</summary>
              <div className="icon-grid" role="group" aria-label="Kameraansicht">
                {CAMERA_PRESETS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`icon-choice ${preset === option ? 'is-active' : ''}`}
                    onClick={() => setPreset(option)}
                    title={PRESET_META[option].label}
                    aria-label={PRESET_META[option].label}
                  >
                    <span aria-hidden="true">{PRESET_META[option].icon}</span>
                  </button>
                ))}
              </div>
            </details>

            <details>
              <summary>Darstellung</summary>
              <div className="icon-grid icon-grid--three" role="group" aria-label="Darstellung">
                <button
                  type="button"
                  className={`icon-choice ${cel ? 'is-active' : ''}`}
                  onClick={() => setCel((value) => !value)}
                  title={cel ? 'Cel-Look aktiv' : 'Standard-Look aktiv'}
                  aria-label="Look umschalten"
                >
                  ◐
                </button>
                <button
                  type="button"
                  className={`icon-choice ${previewSafe ? '' : 'is-active'}`}
                  onClick={() => setPreviewSafe((value) => !value)}
                  title={previewSafe ? 'Sparsames Glas' : 'Echtes Glas'}
                  aria-label="Glasmodus umschalten"
                >
                  ◇
                </button>
                <button
                  type="button"
                  className={`icon-choice ${showStands ? 'is-active' : ''}`}
                  onClick={() => setShowStands((value) => !value)}
                  title={showStands ? 'Stände ausblenden' : 'Stände einblenden'}
                  aria-label={showStands ? 'Stände ausblenden' : 'Stände einblenden'}
                  aria-pressed={showStands}
                >
                  ▥
                </button>
              </div>
            </details>

            <details>
              <summary>Ebene</summary>
              <label className="compact-slider">
                <span>⇧</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={upperOpacity}
                  onChange={(event) => setUpperOpacity(Number(event.target.value))}
                  aria-label="Sichtbarkeit Obergeschoss"
                />
              </label>
            </details>
          </div>
        )}
      </div>

      <aside className="panel compact-panel">
        <header className="compact-panel__bar">
          <button
            type="button"
            className="panel-grab"
            onClick={() => setPanelOpen((value) => !value)}
            aria-expanded={panelOpen}
            title={panelOpen ? 'Panel einklappen' : 'Panel ausklappen'}
          >
            {panelOpen ? '⌄' : '⌃'}
          </button>
          <img
            className="compact-panel__logo"
            src={`${import.meta.env.BASE_URL}brand/lootzy-head.png`}
            alt="Lootzy"
          />
          <strong>BEUTELTIER</strong>
          <span className="compact-panel__status">
            {demoActive ? 'Demokorridor aktiv' : selectedStandId ? 'Ziel gewählt' : 'Suche & Route'}
          </span>
        </header>

        {panelOpen && (
          <div className="panel__body compact-panel__body">
            {patchedData.demoCorridor && (
              <DemoCorridorCard
                corridor={patchedData.demoCorridor}
                active={demoActive}
                route={demoRoute}
                onToggle={toggleDemo}
              />
            )}
            <MapPanel
              data={patchedData}
              search={search}
              onPick={pickHit}
              selectedStandId={selectedStandId}
              startStandId={startStandId}
              onSetStart={(standId) => {
                setDemoActive(false);
                setStartStandId(standId);
              }}
              route={route}
              routeContext={demoActive && patchedData.demoCorridor ? {
                startLabel: patchedData.demoCorridor.start.label,
                targetLabel: patchedData.demoCorridor.target.label,
              } : null}
              tour={tour}
              tourStandIds={tourStandIds}
              onToggleTour={(standId) =>
                setTourStandIds((current) =>
                  current.includes(standId)
                    ? current.filter((id) => id !== standId)
                    : [...current, standId],
                )
              }
              overrides={overrides}
              onSetEdgeState={setEdgeState}
              onClearEdgeState={clearEdgeState}
              avoidUnconfirmed={avoidUnconfirmed}
              onAvoidUnconfirmed={setAvoidUnconfirmed}
              stepFree={stepFree}
              onStepFree={setStepFree}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
