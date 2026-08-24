import type { DemoCorridor } from '../data/load';
import type { Route } from '../routing/route';

const STATUS_LABELS: Record<DemoCorridor['stages'][number]['status'], string> = {
  'source-recorded': 'Quellpunkt',
  'source-derived': 'aus Quelle berechnet',
  'observed-unconfirmed': 'beobachtet · unbestätigt',
  'registered-unconfirmed-access': 'registriert · Zugang unbestätigt',
};

interface Props {
  corridor: DemoCorridor;
  active: boolean;
  route: Route | null;
  onToggle: () => void;
}

export function DemoCorridorCard({ corridor, active, route, onToggle }: Props) {
  const uncertainty = corridor.uncertainties[0];
  return (
    <section className={`demo-corridor ${active ? 'is-active' : ''}`}>
      <div className="demo-corridor__head">
        <div>
          <small>Gamescom-Demokorridor</small>
          <strong>{corridor.start.label} → {corridor.target.label}</strong>
        </div>
        <button
          type="button"
          className={active ? 'is-active' : ''}
          data-testid="demo-corridor-toggle"
          aria-pressed={active}
          onClick={onToggle}
        >
          {active ? 'Korridor aktiv' : 'Korridor zeigen'}
        </button>
      </div>

      <ol className="demo-corridor__stages">
        {corridor.stages.map((stage) => (
          <li key={stage.id}>
            <span aria-hidden="true" />
            <div>
              <strong>{stage.label}</strong>
              <small>{STATUS_LABELS[stage.status]}</small>
            </div>
          </li>
        ))}
      </ol>

      <p className="demo-corridor__source">
        Außenweg: {corridor.osm.distanceM.toLocaleString('de-DE')} m aus dem eingecheckten
        OSM-Snapshot ({corridor.osm.nodeIds.length} Wegpunkte). Darstellung: RouteGraph-Polylinie.
      </p>
      {uncertainty && <p className="warn">Unbestätigter Anschluss: {uncertainty.reason}</p>}
      {active && route && (
        <p className="notice">
          Durchgängiger Graphpfad: {Math.round(route.distanceM)} m · {Math.round(route.minutes)} min.
        </p>
      )}
      {active && !route && (
        <p className="demo-corridor__failed">
          FAILED — Der Korridor ist unter den aktuellen Wegzuständen nicht durchgängig.
        </p>
      )}
    </section>
  );
}
