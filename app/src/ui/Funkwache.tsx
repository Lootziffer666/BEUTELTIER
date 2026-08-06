/**
 * Die Funkwache: Meldungen aus fremden Quellen.
 *
 * Hier wird nichts erfunden und nichts gepostet. Goodie-Meldungen stehen bei
 * Goodie Guide/Farbklecks und in Community-Kanälen; sie werden eingelesen,
 * einem Aussteller zugeordnet und in eine Handlung überführt -- routen,
 * öffnen, priorisieren (PRD-Leitprinzip 6).
 *
 * Ist eine Meldung nicht eindeutig, zeigt die App mehrere mögliche Ziele,
 * statt eines zu raten (PRD 5.4).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dataset } from '../data/load';
import { store, type Report } from '../data/store';
import { adapters, toReports } from '../data/ingest';
import { lootZiffer, type FindStatus } from '../routing/lootziffer';

const STATUS_LABELS: Record<FindStatus, string> = {
  unbestaetigt: 'unbestätigt',
  bestaetigt: 'bestätigt',
  veraltet: 'veraltet',
  beendet: 'beendet',
};

interface Props {
  data: Dataset;
  onGoToStand: (standId: string) => void;
}

export function Funkwache({ data, onGoToStand }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [raw, setRaw] = useState('');
  const [adapterId, setAdapterId] = useState(adapters[0].id);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReports(await store.reports());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const adapter = useMemo(
    () => adapters.find((entry) => entry.id === adapterId) ?? adapters[0],
    [adapterId],
  );

  const ingest = async () => {
    if (!raw.trim()) return;
    const parsed = adapter.parse(raw, { registry: data.registry, year: data.registry.year });
    const created = toReports(parsed, adapter, data.registry.year);
    for (const report of created) await store.putReport(report);
    setRaw('');
    const assigned = created.filter((report) => report.standId).length;
    setNotice(
      `${created.length} Meldungen übernommen, ${assigned} direkt einem Stand zugeordnet.`,
    );
    refresh();
  };

  const update = async (report: Report, patch: Partial<Report>) => {
    await store.putReport({ ...report, ...patch });
    refresh();
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Meldungen einlesen</h2>
        <p className="muted">
          Beitrag aus der Quelle einfügen. BEUTELTIER erkennt Aussteller, Halle und Stand und
          behält die Herkunft bei.
        </p>
        <div className="row">
          {adapters.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={adapterId === entry.id ? 'is-active' : ''}
              onClick={() => setAdapterId(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <textarea
          rows={5}
          value={raw}
          placeholder={'z. B.\n- Bei Bandai Namco in Halle 6.1 gibt es Poster\n- Nintendo Halle 9 | A010 Sticker solange Vorrat'}
          onChange={(event) => setRaw(event.target.value)}
        />
        <div className="row">
          <button type="button" onClick={ingest} disabled={!raw.trim()}>
            Einlesen
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="card">
        <h2>Funde</h2>
        {reports.length === 0 && <p className="muted">Noch keine Meldungen.</p>}
        <ul className="reports">
          {reports.map((report) => {
            // Ohne bekannte Route wird eine Pauschale angesetzt; die Loot-Ziffer
            // gewichtet Status und Alter auch dann schon richtig.
            const score = lootZiffer(report, 8);
            const candidates = report.candidateStandIds ?? [];
            return (
              <li key={report.id} className="report">
                <div className="report__head">
                  <strong>{report.title}</strong>
                  <span
                    className={`ziffer${score.beyondHoarderBorder ? ' ziffer--low' : ''}`}
                    title={score.reasons.join(' · ') || 'frisch und bestätigt'}
                  >
                    {score.value}
                  </span>
                </div>
                <p className="muted">
                  {report.source}
                  {report.sourceUrl && (
                    <>
                      {' · '}
                      <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Quelle
                      </a>
                    </>
                  )}
                </p>

                {report.standId && (
                  <button
                    type="button"
                    data-testid="report-route"
                    onClick={() => onGoToStand(report.standId!)}
                  >
                    Route zu {report.standId.replace(':', ' · ')}
                  </button>
                )}

                {candidates.length > 0 && (
                  <div className="candidates">
                    <p className="muted">
                      Nicht eindeutig — {candidates.length} mögliche Stände:
                    </p>
                    <div className="row">
                      {candidates.map((standId) => (
                        <button
                          key={standId}
                          type="button"
                          onClick={async () => {
                            await update(report, { standId, candidateStandIds: undefined });
                            onGoToStand(standId);
                          }}
                        >
                          {standId.replace(':', ' · ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!report.standId && candidates.length === 0 && (
                  <p className="warn">Kein Stand erkannt — Aussteller steht nicht im Text.</p>
                )}

                <div className="row">
                  {(Object.keys(STATUS_LABELS) as FindStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={report.status === status ? 'is-active' : ''}
                      onClick={() => update(report, { status })}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      await store.deleteReport(report.id);
                      refresh();
                    }}
                  >
                    löschen
                  </button>
                </div>
                {score.reasons.length > 0 && (
                  <p className="muted">Loot-Ziffer: {score.reasons.join(' · ')}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
