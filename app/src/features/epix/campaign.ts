/**
 * Das Epix-Kampagnenfenster und der SteamGifts-Export.
 *
 * Die gamescom-Epix-Kampagne läuft 28 Tage und endet am letzten Sonntag im
 * August. Der Start liegt dadurch regelmäßig noch im Juli -- wer stattdessen
 * „August" annimmt, verliert die erste Woche (PRD 5.1).
 */

import type { EpixEntry } from '../../data/store';

export interface CampaignWindow {
  year: number;
  start: Date;
  end: Date;
  days: number;
}

/** Der letzte Sonntag im August des gegebenen Jahres. */
export function lastSundayOfAugust(year: number): Date {
  const date = new Date(Date.UTC(year, 7, 31));
  while (date.getUTCDay() !== 0) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

export function campaignWindow(year: number, days = 28): CampaignWindow {
  const end = lastSundayOfAugust(year);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { year, start, end, days };
}

/** Der wievielte Kampagnentag ein Datum ist; 0, wenn es außerhalb liegt. */
export function campaignDay(window: CampaignWindow, when: Date): number {
  const day = Math.floor((when.getTime() - window.start.getTime()) / 86400000) + 1;
  return day >= 1 && day <= window.days ? day : 0;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Erzeugt den SteamGifts-Beitrag als Markdown.
 *
 * Aufgeteilt nach Kampagnentag, gelöste Aufgaben mit Lösung, offene ohne --
 * so, wie ein Beitrag dort tatsächlich aussieht.
 */
export function toSteamGiftsMarkdown(entries: EpixEntry[], window: CampaignWindow): string {
  const lines: string[] = [];
  lines.push(`## gamescom epix ${window.year}`);
  lines.push('');
  lines.push(
    `Kampagne ${formatDate(window.start)} bis ${formatDate(window.end)} (${window.days} Tage).`,
  );
  lines.push('');

  const byDay = new Map<number, EpixEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.day);
    if (list) list.push(entry);
    else byDay.set(entry.day, [entry]);
  }

  const done = entries.filter((entry) => entry.status === 'erledigt').length;
  lines.push(`**${done} von ${entries.length} erledigt.**`);
  lines.push('');

  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    lines.push(day === 0 ? '### Kampagnenweit' : `### Tag ${day}`);
    lines.push('');
    for (const entry of byDay.get(day)!) {
      const mark = entry.status === 'erledigt' ? 'x' : ' ';
      const title = entry.url ? `[${entry.title}](${entry.url})` : entry.title;
      const place = entry.kind === 'vor_ort' ? ' *(vor Ort)*' : '';
      lines.push(`- [${mark}] ${title}${place}`);
      if (entry.reward) lines.push(`  - Reward: ${entry.reward}`);
      if (entry.action) lines.push(`  - Aktion: ${entry.action}`);
      if (entry.solution) lines.push(`  - Lösung: ${entry.solution}`);
      if (entry.answer) lines.push(`  - Antwort: ${entry.answer}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Zusammengestellt mit BEUTELTIER. Quests und Lösungen von GamingPartys.');
  return lines.join('\n');
}

/**
 * Öffnet Links nacheinander mit Verzögerung.
 *
 * Der Epix Hub ist kein unsichtbarer Account-Bot (PRD 5.1). Er arbeitet im
 * normalen, eingeloggten Browser, sichtbar, und hält an, sobald eine Aufgabe
 * echte Interaktion braucht.
 *
 * Popup-Blocker lassen nur Fenster durch, die aus einer Nutzeraktion stammen.
 * Wird eines abgewiesen, bricht der Lauf ab, statt stillschweigend die
 * Hälfte der Links zu verschlucken.
 */
export interface OpenerHandle {
  stop: () => void;
  done: Promise<{ opened: number; blocked: boolean }>;
}

export function openSequentially(
  urls: string[],
  delayMs: number,
  onOpen?: (url: string, index: number) => void,
): OpenerHandle {
  let cancelled = false;
  let timer: number | undefined;

  const done = new Promise<{ opened: number; blocked: boolean }>((resolve) => {
    let index = 0;
    let opened = 0;

    const step = () => {
      if (cancelled || index >= urls.length) {
        resolve({ opened, blocked: false });
        return;
      }
      const url = urls[index];
      const handle = window.open(url, '_blank', 'noopener,noreferrer');
      if (!handle) {
        resolve({ opened, blocked: true });
        return;
      }
      opened += 1;
      onOpen?.(url, index);
      index += 1;
      timer = window.setTimeout(step, delayMs);
    };

    step();
  });

  return {
    stop: () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    },
    done,
  };
}
