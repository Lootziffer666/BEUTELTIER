/**
 * Der Epix Hub.
 *
 * Kein unsichtbarer Account-Bot (PRD 5.1): Links gehen im normalen,
 * eingeloggten Browser auf, sichtbar, mit einstellbarer Verzögerung. Wo eine
 * Aufgabe echte Interaktion braucht, hält der Lauf an -- der Nutzer erledigt
 * sie und setzt fort.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store, type EpixEntry } from '../data/store';
import {
  campaignDay,
  campaignWindow,
  formatDate,
  openSequentially,
  toSteamGiftsMarkdown,
  type OpenerHandle,
} from '../features/epix/campaign';

const CURRENT_YEAR = new Date().getUTCFullYear();

function emptyEntry(year: number, day: number): EpixEntry {
  return {
    id: `epix:${year}:${Date.now()}`,
    year,
    day,
    title: '',
    url: '',
    kind: 'digital',
    reward: '',
    action: '',
    solution: '',
    answer: '',
    status: 'offen',
    updatedAt: Date.now(),
  };
}

export function EpixHub() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [entries, setEntries] = useState<EpixEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(4);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const opener = useRef<OpenerHandle | null>(null);

  const window_ = useMemo(() => campaignWindow(year), [year]);

  const refresh = useCallback(async () => {
    setEntries(await store.epixForYear(year));
  }, [year]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => opener.current?.stop(), []);

  /**
   * Nimmt eingefügte Links entgegen -- eine Zeile je Quest, optional mit Titel.
   * Das ist der Weg, auf dem die Quests tatsächlich ankommen: als Liste aus
   * dem Discord oder von der GamingPartys-Seite.
   */
  const importDraft = async () => {
    const lines = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    for (const line of lines) {
      const url = /https?:\/\/\S+/.exec(line)?.[0] ?? '';
      const title = line.replace(url, '').replace(/^[-*•\s]+/, '').trim() || url;
      const entry = emptyEntry(year, campaignDay(window_, new Date()));
      await store.putEpix({
        ...entry,
        id: `epix:${year}:${title}:${url}`.slice(0, 180),
        title,
        url,
        kind: /vor ort|halle|stand|booth/i.test(line) ? 'vor_ort' : 'digital',
      });
    }
    setDraft('');
    setNotice(`${lines.length} Einträge übernommen.`);
    refresh();
  };

  const update = async (entry: EpixEntry, patch: Partial<EpixEntry>) => {
    await store.putEpix({ ...entry, ...patch });
    refresh();
  };

  const openOpen = () => {
    const urls = entries.filter((entry) => entry.status === 'offen' && entry.url).map((entry) => entry.url);
    if (urls.length === 0) {
      setNotice('Keine offenen Links.');
      return;
    }
    setRunning(true);
    setNotice(null);
    const handle = openSequentially(urls, delaySeconds * 1000);
    opener.current = handle;
    handle.done.then((result) => {
      setRunning(false);
      setNotice(
        result.blocked
          ? `Nach ${result.opened} Links hat der Browser weitere Fenster blockiert. Popups für diese Seite erlauben und fortsetzen.`
          : `${result.opened} Links geöffnet. Aufgaben, die eine Eingabe brauchen, jetzt von Hand erledigen.`,
      );
    });
  };

  const exportMarkdown = async () => {
    const markdown = toSteamGiftsMarkdown(entries, window_);
    await navigator.clipboard?.writeText(markdown).catch(() => undefined);
    setNotice('SteamGifts-Markdown in der Zwischenablage.');
  };

  const done = entries.filter((entry) => entry.status === 'erledigt').length;

  return (
    <div className="stack">
      <section className="card">
        <h2>Kampagne {year}</h2>
        <p className="muted">
          {formatDate(window_.start)} bis {formatDate(window_.end)} · {window_.days} Tage. Das
          Fenster endet am letzten Sonntag im August, der Start liegt deshalb noch im Juli.
        </p>
        <div className="row">
          <button type="button" onClick={() => setYear((value) => value - 1)}>
            ← {year - 1}
          </button>
          <button type="button" onClick={() => setYear((value) => value + 1)}>
            {year + 1} →
          </button>
        </div>
        <p className="figures">
          <strong>
            {done} / {entries.length}
          </strong>
          <span>erledigt</span>
        </p>
      </section>

      <section className="card">
        <h2>Quests übernehmen</h2>
        <textarea
          rows={4}
          value={draft}
          placeholder={'Eine Zeile je Quest, Link genügt\nhttps://gamescom.global/...'}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="row">
          <button type="button" onClick={importDraft} disabled={!draft.trim()}>
            Übernehmen
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Links abarbeiten</h2>
        <label className="slider">
          <span>Abstand {delaySeconds} s</span>
          <input
            type="range"
            min={1}
            max={20}
            value={delaySeconds}
            onChange={(event) => setDelaySeconds(Number(event.target.value))}
          />
        </label>
        <div className="row">
          <button type="button" onClick={openOpen} disabled={running}>
            {running ? 'läuft …' : 'Offene Links öffnen'}
          </button>
          {running && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                opener.current?.stop();
                setRunning(false);
              }}
            >
              Anhalten
            </button>
          )}
          <button type="button" onClick={exportMarkdown} disabled={entries.length === 0}>
            SteamGifts-Export
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="card">
        <h2>Aufgaben</h2>
        {entries.length === 0 && <p className="muted">Noch nichts übernommen.</p>}
        <ul className="epix">
          {entries.map((entry) => (
            <li key={entry.id} className={`epix__item epix__item--${entry.status}`}>
              <div className="epix__head">
                <strong>{entry.title || '(ohne Titel)'}</strong>
                <span className="badge">{entry.kind === 'vor_ort' ? 'vor Ort' : 'digital'}</span>
                {entry.day > 0 && <span className="badge">Tag {entry.day}</span>}
              </div>
              {entry.url && (
                <a href={entry.url} target="_blank" rel="noopener noreferrer">
                  {entry.url}
                </a>
              )}
              <input
                type="text"
                placeholder="Lösung / Antwort"
                value={entry.solution}
                onChange={(event) => update(entry, { solution: event.target.value })}
              />
              <div className="row">
                {(['offen', 'erledigt', 'manuell'] as EpixEntry['status'][]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={entry.status === status ? 'is-active' : ''}
                    onClick={() => update(entry, { status })}
                  >
                    {status}
                  </button>
                ))}
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    await store.deleteEpix(entry.id);
                    refresh();
                  }}
                >
                  löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card--quiet">
        <p className="muted">
          Quests und Lösungen stammen von GamingPartys. BEUTELTIER führt sie aus, es erfindet sie
          nicht.
        </p>
      </section>
    </div>
  );
}
