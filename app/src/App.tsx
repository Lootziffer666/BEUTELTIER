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
import {
  downloadAnnotations,
  downloadLayoutPatches,
  exportAnnotations,
  exportLayoutPatches,
  loadAnnotations,
  loadLayoutPatches,
  saveAnnotations,
  saveLayoutPatches,
  type Annotation,
  type CameraSnapshot,
} from './scene/survey';
import { buildLayoutAssistantPrompt, parseLayoutAssistantPatches } from './scene/layoutAssistant';
import type { LayoutPatch, LayoutPatchState } from './scene/walk';
import { Vermessung } from './ui/Vermessung';
import { ProceduralMesse } from './ui/ProceduralMesse';
import { WorldDiagnostics } from './ui/WorldDiagnostics';

type Tab = 'karte' | 'epix' | 'funkwache' | 'register' | 'diagnose' | 'messe';

const PRESET_LABELS: Record<CameraPreset, string> = {
  uebersicht: 'Übersicht',
  halle: 'Halle',
  laufmodus: 'Laufmodus',
  ego: 'Begehen',
};

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'karte', label: 'Karte', hint: 'Wege, Sperren, Beutezug' },
  { id: 'epix', label: 'Epix', hint: 'Quests und SteamGifts-Export' },
  { id: 'funkwache', label: 'Funkwache', hint: 'Meldungen aus Quellen' },
  { id: 'register', label: 'Register', hint: 'Aussteller und Stände' },
  { id: 'diagnose', label: 'Diagnose', hint: 'Amtliche Welt und Begehbarkeit' },
  { id: 'messe', label: 'Messe-Lab', hint: 'Prozedurale Halle und Crowd' },
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

  // Vermessungsmodus: Kamerazustand statt Beschreibung, siehe scene/survey.ts.
  const [noClip, setNoClip] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [viewfinderOpen, setViewfinderOpen] = useState(false);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [pendingMark, setPendingMark] = useState<CameraSnapshot | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>(() => loadAnnotations());
  const [layoutPatches, setLayoutPatches] = useState<LayoutPatch[]>(() => loadLayoutPatches());
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot | null>(null);
  const [measureStart, setMeasureStart] = useState<CameraSnapshot | null>(null);

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

  const route: Route | null = useMemo(() => {
    if (!patchedData || !startStandId || !selectedStandId || startStandId === selectedStandId) return null;
    return findRoute(
      patchedData.graph,
      patchedData.graph.standNodeId(startStandId),
      patchedData.graph.standNodeId(selectedStandId),
      routeOptions,
    );
  }, [patchedData, startStandId, selectedStandId, routeOptions]);

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
    if (hit.standIds.length > 0) setSelectedStandId(hit.standIds[0]);
    if (hit.hallKey) {
      setFocusHallKey(hit.hallKey);
      setPreset('halle');
    }
  }, []);

  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  useEffect(() => {
    saveLayoutPatches(layoutPatches);
  }, [layoutPatches]);

  // Der Vermessungsmodus gehört zur Ego-Perspektive -- verlässt man sie,
  // sollen No-Clip und ein offener Viewfinder nicht in der Übersicht hängen
  // bleiben.
  useEffect(() => {
    if (preset === 'ego') return;
    setNoClip(false);
    setFrozen(false);
    setViewfinderOpen(false);
    setPendingMark(null);
  }, [preset]);

  const handleMark = useCallback((snapshot: CameraSnapshot) => {
    setFrozen(true);
    setPendingMark(snapshot);
  }, []);

  const commitNote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (pendingMark && trimmed) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: `note-${Date.now().toString(36)}`,
            createdAt: new Date().toISOString(),
            note: trimmed,
            camera: pendingMark,
          },
        ]);
      }
      setPendingMark(null);
      setFrozen(false);
    },
    [pendingMark],
  );

  const cancelNote = useCallback(() => {
    setPendingMark(null);
    setFrozen(false);
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const setOverlayImageUrl = useCallback((url: string | null) => {
    setOverlayImage((prev) => {
      if (prev && prev !== url) URL.revokeObjectURL(prev);
      return url;
    });
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

  if (!patchedData) {
    return (
      <div className="boot">
        <img src={`${import.meta.env.BASE_URL}brand/lootzy-head.png`} alt="" width={72} />
        <h1>BEUTELTIER</h1>
        <p className="muted">Gelände wird geladen …</p>
      </div>
    );
  }

  const editLayout = (state: LayoutPatchState) => {
    if (!cameraSnapshot || !patchedData) return;
    const patch = patchedData.walk.patchAt(
      cameraSnapshot.x,
      cameraSnapshot.y,
      cameraSnapshot.z,
      state,
      state === 'open' ? 'Vor Ort als Durchgang freigemessen' : 'Vor Ort als Wand/Sperre freigemessen',
    );
    if (!patch) return;
    setLayoutPatches((current) => [
      ...current.filter((entry) => entry.id !== patch.id),
      patch,
    ]);
  };

  const mergeLayoutPatches = (patches: LayoutPatch[]) => {
    setLayoutPatches((current) => {
      const next = new Map(current.map((entry) => [entry.id, entry]));
      patches.forEach((patch) => next.set(patch.id, patch));
      return Array.from(next.values());
    });
  };

  const copyLayoutAssistantPrompt = (note?: string) => {
    const prompt = buildLayoutAssistantPrompt({
      snapshot: cameraSnapshot,
      currentCell: currentWalkCell,
      existingPatches: layoutPatches,
      note,
    });
    void navigator.clipboard.writeText(prompt);
  };

  const applyLayoutAssistantJson = (raw: string) => {
    mergeLayoutPatches(parseLayoutAssistantPatches(raw));
  };

  const applyMeasuredCorridor = (distanceM: number, widthM: number) => {
    if (!measureStart || !cameraSnapshot || !patchedData) return;
    const drawnDistance = Math.hypot(cameraSnapshot.x - measureStart.x, cameraSnapshot.y - measureStart.y);
    const note = `Messstrecke: ${distanceM.toFixed(2)} m echt, ${drawnDistance.toFixed(2)} m Karte, ${widthM.toFixed(2)} m breit`;
    mergeLayoutPatches(patchedData.walk.patchesAlong(measureStart, cameraSnapshot, widthM, 'open', note));
  };

  const clearCurrentLayoutPatch = () => {
    if (!cameraSnapshot || !patchedData) return;
    const cell = patchedData.walk.cellAt(cameraSnapshot.x, cameraSnapshot.y, cameraSnapshot.z);
    if (!cell) return;
    setLayoutPatches((current) => current.filter((entry) => entry.id !== `${cell.hallKey}:${cell.ix}:${cell.iy}`));
  };

  const currentWalkCell = cameraSnapshot && patchedData
    ? patchedData.walk.cellAt(cameraSnapshot.x, cameraSnapshot.y, cameraSnapshot.z)
    : null;

  const routeStandIds = [
    ...(startStandId ? [startStandId] : []),
    ...(selectedStandId ? [selectedStandId] : []),
    ...tourStandIds,
  ];

  return (
    <div className="app">
      <div className="stage">
        <SiteScene
          data={patchedData}
          upperOpacity={upperOpacity}
          selectedStandId={selectedStandId}
          routeStandIds={routeStandIds}
          route={route}
          preset={preset}
          focusHallKey={focusHallKey}
          onSelectStand={setSelectedStandId}
          onLeaveEgo={() => setPreset('uebersicht')}
          noClip={noClip}
          frozen={frozen}
          viewfinderOpen={viewfinderOpen}
          onToggleNoClip={() => setNoClip((v) => !v)}
          onToggleFreeze={() => setFrozen((v) => !v)}
          onToggleViewfinder={() => setViewfinderOpen((v) => !v)}
          onMark={handleMark}
          onCameraSnapshot={setCameraSnapshot}
        />

        {preset === 'ego' && !pendingMark && (
          <p className="stage__hint">
            Klicken zum Umsehen · <strong>W A S D</strong> laufen ·{' '}
            <strong>Shift</strong> schneller ·{' '}
            {viewfinderOpen ? (
              <>
                <strong>V</strong> Referenzfoto zu
              </>
            ) : (
              <>
                <strong>N</strong> No-Clip · <strong>F</strong> einfrieren ·{' '}
                <strong>V</strong> Referenzfoto · <strong>M</strong> markieren
              </>
            )}{' '}
            · <strong>Esc</strong> zurück
          </p>
        )}

        {preset === 'ego' && (
          <Vermessung
            noClip={noClip}
            frozen={frozen}
            viewfinderOpen={viewfinderOpen}
            onToggleNoClip={() => setNoClip((v) => !v)}
            onToggleFreeze={() => setFrozen((v) => !v)}
            onToggleViewfinder={() => setViewfinderOpen((v) => !v)}
            overlayImage={overlayImage}
            onOverlayImage={setOverlayImageUrl}
            overlayOpacity={overlayOpacity}
            onOverlayOpacity={setOverlayOpacity}
            pendingMark={pendingMark}
            onCommitNote={commitNote}
            onCancelNote={cancelNote}
            annotations={annotations}
            layoutPatches={layoutPatches}
            currentWalkCell={currentWalkCell}
            onOpenCell={() => editLayout('open')}
            onBlockCell={() => editLayout('blocked')}
            onClearCell={clearCurrentLayoutPatch}
            onExportLayout={() => downloadLayoutPatches(layoutPatches)}
            onCopyLayout={() => void navigator.clipboard.writeText(exportLayoutPatches(layoutPatches))}
            onCopyAssistantPrompt={copyLayoutAssistantPrompt}
            measureStart={measureStart}
            onSetMeasureStart={() => { if (cameraSnapshot) setMeasureStart(cameraSnapshot); }}
            onClearMeasureStart={() => setMeasureStart(null)}
            onApplyMeasuredCorridor={applyMeasuredCorridor}
            onApplyAssistantJson={applyLayoutAssistantJson}
            onExport={() => downloadAnnotations(annotations)}
            onCopy={() => void navigator.clipboard.writeText(exportAnnotations(annotations))}
            onDeleteAnnotation={deleteAnnotation}
          />
        )}

        <div className="stage__controls">
          <div className="segmented" role="group" aria-label="Kameraansicht">
            {(['uebersicht', 'halle', 'laufmodus', 'ego'] as CameraPreset[]).map((option) => (
              <button
                key={option}
                type="button"
                className={preset === option ? 'is-active' : ''}
                onClick={() => setPreset(option)}
              >
                {PRESET_LABELS[option]}
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
              data={patchedData}
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
          {tab === 'diagnose' && <WorldDiagnostics world={patchedData.world} spatialMode={patchedData.spatialMode} />}
          {tab === 'epix' && <EpixHub />}
          {tab === 'funkwache' && (
            <Funkwache data={patchedData} onGoToStand={setSelectedStandId} />
          )}
          {tab === 'register' && <RegistryPanel data={patchedData} search={search} onPick={pickHit} />}
          {tab === 'messe' && <ProceduralMesse />}
        </div>
      </aside>
    </div>
  );
}
