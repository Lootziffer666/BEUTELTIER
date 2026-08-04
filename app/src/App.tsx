import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadDataset, type Dataset } from './data/load';
import { store } from './data/store';
import { buildSearch, type SearchHit } from './features/search';
import { MapPanel } from './ui/MapPanel';
import { EpixHub } from './ui/EpixHub';
import { Funkwache } from './ui/Funkwache';
import { RegistryPanel } from './ui/RegistryPanel';
import { SiteScene, type CameraPreset } from './scene/SiteScene';
import { findRoute, planTour, type Route } from './routing/route';
import type { EdgeState } from './routing/graph';

type Tab = 'karte' | 'epix' | 'funkwache' | 'register';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'karte', label: 'Karte', hint: 'Wege, Sperren, Beutezug' },
  { id: 'epix', label: 'Epix', hint: 'Quests und SteamGifts-Export' },
  { id: 'funkwache', label: 'Funkwache', hint: 'Meldungen aus Quellen' },
  { id: 'register', label: 'Register', hint: 'Aussteller und Stände' },
];

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('karte');

  const [upperOpacity, setUpperOpacity] = useState(0.85);
  const [preset, setPreset] = useState<CameraPreset>('uebersicht');
  const [selectedStandId, setSelectedStandId] = useState<string | null>(null);
  const [focusHallKey, setFocusHallKey] = useState<string | null>(null);

  const [startStandId, setStartStandId] = useState<string | null>(null);
  const [tourStandIds, setTourStandIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Map<string, EdgeState>>(new Map());
  const [avoidUnconfirmed, setAvoidUnconfirmed] = useState(false);
  const [stepFree, setStepFree] = useState(false);

  useEffect(() => {
    loadDataset()
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
    store.edgeOverrides().then(setOverrides);
  }, []);

  const search = useMemo(() => (data ? buildSearch(data) : null), [data]);

  const routeOptions = useMemo(
    () => ({ stateOverrides: overrides, avoidUnconfirmed, stepFree }),
    [overrides, avoidUnconfirmed, stepFree],
  );

  const route: Route | null = useMemo(() => {
    if (!data || !startStandId || !selectedStandId || startStandId === selectedStandId) return null;
    return findRoute(
      data.graph,
      data.graph.standNodeId(startStandId),
      data.graph.standNodeId(selectedStandId),
      routeOptions,
    );
  }, [data, startStandId, selectedStandId, routeOptions]);

  const tour = useMemo(() => {
    if (!data || !startStandId || tourStandIds.length === 0) return null;
    return planTour(
      data.graph,
      data.graph.standNodeId(startStandId),
      tourStandIds.map((id) => data.graph.standNodeId(id)),
      routeOptions,
    );
  }, [data, startStandId, tourStandIds, routeOptions]);

  const setEdgeState = useCallback(async (edgeId: string, state: EdgeState) => {
    await store.setEdgeState(edgeId, state);
    setOverrides(await store.edgeOverrides());
  }, []);

  const clearEdgeState = useCallback(async (edgeId: string) => {
    await store.clearEdgeState(edgeId);
    setOverrides(await store.edgeOverrides());
  }, []);

  const pickHit = useCallback((hit: SearchHit) => {
    if (hit.standIds.length > 0) setSelectedStandId(hit.standIds[0]);
    if (hit.hallKey) {
      setFocusHallKey(hit.hallKey);
      setPreset('halle');
    }
  }, []);

  if (error) {
    return (
      <div className="boot boot--error">
        <h1>BEUTELTIER</h1>
        <p>{error}</p>
        <p className="muted">
          Die aufbereiteten Daten fehlen. <code>python3 tools/build_all.py</code> laufen lassen
          und die Ergebnisse nach <code>app/public/data/</code> kopieren.
        </p>
      </div>
    );
  }

  if (!data) {
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

  return (
    <div className="app">
      <div className="stage">
        <SiteScene
          data={data}
          upperOpacity={upperOpacity}
          selectedStandId={selectedStandId}
          routeStandIds={routeStandIds}
          route={route}
          preset={preset}
          focusHallKey={focusHallKey}
          onSelectStand={setSelectedStandId}
        />

        <div className="stage__controls">
          <div className="segmented" role="group" aria-label="Kameraansicht">
            {(['uebersicht', 'halle', 'laufmodus'] as CameraPreset[]).map((option) => (
              <button
                key={option}
                type="button"
                className={preset === option ? 'is-active' : ''}
                onClick={() => setPreset(option)}
              >
                {option === 'uebersicht' ? 'Übersicht' : option === 'halle' ? 'Halle' : 'Laufmodus'}
              </button>
            ))}
          </div>
          <label className="slider">
            <span>Obergeschoss</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={upperOpacity}
              onChange={(event) => setUpperOpacity(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      <aside className="panel">
        <header className="panel__head">
          <img
            className="panel__logo"
            src={`${import.meta.env.BASE_URL}brand/lootzy-head.png`}
            alt="Lootzy"
          />
          <div>
            <h1>BEUTELTIER</h1>
            <p className="claim">Finde Beute. Finde den Weg.</p>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? 'is-active' : ''}
              onClick={() => setTab(entry.id)}
              title={entry.hint}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="panel__body">
          {tab === 'karte' && (
            <MapPanel
              data={data}
              search={search}
              onPick={pickHit}
              selectedStandId={selectedStandId}
              startStandId={startStandId}
              onSetStart={setStartStandId}
              route={route}
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
          )}
          {tab === 'epix' && <EpixHub />}
          {tab === 'funkwache' && (
            <Funkwache data={data} onGoToStand={setSelectedStandId} />
          )}
          {tab === 'register' && <RegistryPanel data={data} search={search} onPick={pickHit} />}
        </div>
      </aside>
    </div>
  );
}
