import { useMemo, useState } from 'react';

import type { WorldDiagnostics as Diagnostics } from '../data/load';

export function WorldDiagnostics({ world }: { world: Diagnostics | null }) {
  const inventory = world?.lod2Inventory;
  const featureClasses = Object.entries(inventory?.totals.features ?? {});
  const [featureFilter, setFeatureFilter] = useState('all');
  const problems = useMemo(
    () => (inventory?.problemFeatures ?? []).filter(
      (feature) => featureFilter === 'all' || feature.featureClass === featureFilter,
    ),
    [inventory, featureFilter],
  );

  if (!world) {
    return <p className="notice">Dieser Offline-Datenstand enthält noch kein Weltmanifest.</p>;
  }

  const { manifest, walkableSurfaces, portals } = world;
  const registrations = manifest.registrationSummary;
  return (
    <section aria-label="Weltdiagnose">
      <div className="card">
        <div className="card__eyebrow">AMTLICHE WELT · {manifest.modelVersion}</div>
        <h2>{manifest.status === 'ready' ? 'Freigegeben' : 'Migration läuft'}</h2>
        <div className="figures">
          <span><strong>{registrations.registered}/{registrations.total}</strong> registriert</span>
          <span><strong>{registrations.withTargetFeatures}</strong> mit Zielfeatures</span>
          <span><strong>{registrations.draft}</strong> Entwürfe</span>
        </div>
        <p className="muted">
          Ursprung: {manifest.origin.map((value) => value.toFixed(1)).join(' / ')} m
        </p>
      </div>

      <div className="card">
        <div className="card__eyebrow">BEGEHBARKEIT</div>
        <h2>{walkableSurfaces?.outsidePolicy.unknownBlocked ? 'Unbekanntes ist gesperrt' : 'Legacy-Außenraum aktiv'}</h2>
        <ul>
          <li>Orthofoto: {manifest.fallback.walkable ? 'begehbar' : 'nur Fallback'}</li>
          <li>Terrain automatisch offen: {walkableSurfaces?.outsidePolicy.terrainWalkableByDefault ? 'ja' : 'nein'}</li>
          <li>Portale: {portals?.counts.total ?? 0}, davon {portals?.counts.verifiedPhysical ?? 0} baulich geprüft</li>
        </ul>
        {(walkableSurfaces?.gaps.length ?? 0) > 0 && (
          <p className="notice">Offene Datenlücken: {walkableSurfaces?.gaps.join(', ')}</p>
        )}
      </div>

      <div className="card">
        <div className="card__eyebrow">LOD2-INVENTAR</div>
        <div className="figures">
          {featureClasses.map(([name, count]) => <span key={name}><strong>{count}</strong> {name}</span>)}
          <span><strong>{inventory?.totals.trianglesEstimated.toLocaleString('de-DE') ?? 0}</strong> Dreiecke</span>
        </div>
        <label>
          <span>Problemfeatures filtern</span>
          <select value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}>
            <option value="all">Alle Featureklassen</option>
            {featureClasses.map(([name]) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <ul className="diag-features">
          {problems.map((feature) => (
            <li key={feature.featureId}>
              <strong>{feature.featureId}</strong>
              <span>{feature.featureClass} · Funktion {feature.function ?? 'unbekannt'}</span>
              <span>Z {feature.zMin ?? '–'} bis {feature.zMax ?? '–'} · {feature.polygons} Polygone</span>
              <span>{feature.reasons.join(', ')}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
