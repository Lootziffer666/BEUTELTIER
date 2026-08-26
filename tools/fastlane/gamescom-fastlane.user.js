// ==UserScript==
// @name         gamescom Fastlane Autopilot
// @namespace    https://github.com/Lootziffer666/BEUTELTIER
// @version      0.2.0
// @description  Books selected gamescom Fastlane slots automatically while avoiding calendar conflicts.
// @match        https://www.gamescom.global/de/fastlanes*
// @match        https://www.gamescom.global/en/fastlanes*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CFG = {
    targets: [
      { id: 'samsung', label: 'Samsung', match: /samsung/i, wanted: 2 },
      { id: 'sea', label: 'Sea of Remnants', match: /sea\s+of\s+remnants/i, wanted: 1 },
      { id: 'metro', label: 'METRO 2039', match: /metro\s*:?\s*2039/i, wanted: 1 },
    ],
    calendarBusy: [
      ['2026-08-26T09:00:00+02:00', '2026-08-26T10:00:00+02:00'],
      ['2026-08-26T19:30:00+02:00', '2026-08-26T23:30:00+02:00'],
      ['2026-08-27T16:30:00+02:00', '2026-08-27T20:00:00+02:00'],
      ['2026-08-28T19:00:00+02:00', '2026-08-29T00:00:00+02:00'],
    ],
    beforeMinutes: 15,
    afterMinutes: 25,
    normalPollMs: 8000,
    hotPollMs: 1200,
    hotWindowSeconds: 55,
    actionDelayMs: 350,
    dialogLoadMs: 5000,
    dialogTimeoutMs: 5000,
  };

  const STORAGE_KEY = 'gc-fastlane-autopilot-v1';
  const state = loadState();
  let running = state.running !== false;
  let busy = false;
  let currentTarget = null;
  let currentCardSignature = null;
  let botOwnsDialog = false;
  let statusLine = 'Startet…';
  let panel;

  function loadState() {
    try {
      return Object.assign({ running: true, booked: [], attemptedSignatures: {}, manualBusy: [] }, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch {
      return { running: true, booked: [], attemptedSignatures: {}, manualBusy: [] };
    }
  }

  function saveState() {
    state.running = running;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderPanel();
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || 1) !== 0;
  }

  function textOf(el) {
    return norm(el?.innerText || el?.textContent || el?.getAttribute?.('aria-label') || el?.value || '');
  }

  function isDisabled(el) {
    return !!(el.disabled || el.getAttribute?.('aria-disabled') === 'true' || el.matches?.('[disabled]'));
  }

  function allInteractive(root = document) {
    return [...root.querySelectorAll('button, a, [role="button"], input, label, [tabindex]')]
      .filter(el => visible(el) && !panel?.contains(el));
  }

  function relevanceScore(el) {
    const txt = textOf(el);
    let score = 0;
    if (CFG.targets.some(t => t.match.test(txt))) score += 20;
    if (/nutzungsbedingungen|bedingungen|terms|agb|akzeptier|zustimm/i.test(txt)) score += 8;
    if (/\b(?:[01]?\d|2[0-3])[:.]([0-5]\d)\b/.test(txt)) score += 8;
    if (/buchen|reservieren|confirm|book/i.test(txt)) score += 5;
    score += Math.min(allInteractive(el).length, 10);
    return score;
  }

  function activeDialog() {
    const strong = [...document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"], [class*="modal" i], [class*="dialog" i]')]
      .filter(el => visible(el) && !panel?.contains(el));
    const fallback = [...document.querySelectorAll('[class*="overlay" i]')]
      .filter(el => visible(el) && !panel?.contains(el) && relevanceScore(el) > 0);
    const candidates = [...new Set([...strong, ...fallback])].filter(el => relevanceScore(el) > 0);
    candidates.sort((a, b) => {
      const score = relevanceScore(b) - relevanceScore(a);
      if (score) return score;
      const aa = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const ba = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return aa - ba;
    });
    return candidates[0] || null;
  }

  function targetForDialog(root) {
    const txt = textOf(root);
    return CFG.targets.find(t => t.match.test(txt)) || null;
  }

  function clickSafe(el) {
    if (!el || !visible(el) || isDisabled(el)) return false;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    el.click();
    return true;
  }

  function parseTime(text) {
    const m = norm(text).match(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?:\D|$)/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function todayAt(mins) {
    const d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d;
  }

  function configuredBusyIntervals() {
    const all = [...CFG.calendarBusy, ...(state.manualBusy || [])]
      .map(([a, b]) => [new Date(a), new Date(b)])
      .filter(([a, b]) => !Number.isNaN(+a) && !Number.isNaN(+b));
    for (const b of state.booked || []) {
      const t = new Date(b.datetime);
      if (Number.isNaN(+t)) continue;
      all.push([new Date(+t - CFG.beforeMinutes * 60000), new Date(+t + CFG.afterMinutes * 60000)]);
    }
    return all;
  }

  function conflicts(slotDate) {
    const start = new Date(+slotDate - CFG.beforeMinutes * 60000);
    const end = new Date(+slotDate + CFG.afterMinutes * 60000);
    return configuredBusyIntervals().some(([a, b]) => start < b && end > a);
  }

  const bookedCount = targetId => (state.booked || []).filter(b => b.targetId === targetId).length;
  const targetDone = t => bookedCount(t.id) >= t.wanted;
  const allDone = () => CFG.targets.every(targetDone);

  function findTargetCards(target) {
    if (activeDialog()) return [];
    const candidates = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let el;
    while ((el = walker.nextNode())) {
      if (!visible(el) || panel?.contains(el)) continue;
      const own = norm([...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' '));
      const aria = norm(el.getAttribute?.('aria-label') || '');
      if (!target.match.test(own) && !target.match.test(aria)) continue;
      let card = el.closest('article, li, [class*="card" i], [class*="tile" i], [class*="item" i], [role="button"], a, button');
      if (!card) card = el.parentElement;
      if (!card || !visible(card) || panel?.contains(card)) continue;
      const txt = textOf(card);
      if (!target.match.test(txt)) continue;
      candidates.push(card);
    }
    const uniq = [];
    const seen = new Set();
    for (const card of candidates) {
      const sig = norm(textOf(card)).slice(0, 300);
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      uniq.push({ card, sig });
    }
    return uniq;
  }

  function bestOpenControl(card) {
    const controls = allInteractive(card);
    return controls.find(el => /fastlane|buchen|slot|reserv|details|mehr|öffnen|open/i.test(textOf(el)) && !/storn|cancel|löschen/i.test(textOf(el)))
      || (card.matches('button,a,[role="button"]') ? card : controls[0] || card);
  }

  function findTimeOptions(root) {
    const opts = [];
    for (const el of allInteractive(root)) {
      if (isDisabled(el)) continue;
      const txt = textOf(el);
      const mins = parseTime(txt);
      if (mins == null) continue;
      const slotDate = todayAt(mins);
      if (+slotDate < Date.now() - 60000) continue;
      opts.push({ el, mins, slotDate, txt });
    }
    const byTime = new Map();
    for (const o of opts) {
      const old = byTime.get(o.mins);
      const area = o.el.getBoundingClientRect().width * o.el.getBoundingClientRect().height;
      const oldArea = old ? old.el.getBoundingClientRect().width * old.el.getBoundingClientRect().height : Infinity;
      if (!old || area < oldArea) byTime.set(o.mins, o);
    }
    return [...byTime.values()].sort((a, b) => a.mins - b.mins);
  }

  function acceptTerms(root) {
    const checkboxes = [...root.querySelectorAll('input[type="checkbox"]')].filter(visible);
    for (const cb of checkboxes) {
      const context = textOf(cb.closest('label') || cb.parentElement || cb);
      if (!/nutzungsbedingungen|bedingungen|terms|agb|akzeptier|zustimm/i.test(context) && checkboxes.length > 1) continue;
      if (!cb.checked && !isDisabled(cb)) cb.click();
    }
    for (const el of allInteractive(root)) {
      const txt = textOf(el);
      if (!/nutzungsbedingungen|bedingungen|terms|agb|akzeptier|zustimm/i.test(txt)) continue;
      if (/button/i.test(el.tagName) && /buchen|bestät/i.test(txt)) continue;
      if (el.getAttribute?.('aria-checked') === 'false') el.click();
    }
  }

  function findBookButton(root) {
    const good = /(^|\s)(buchen|reservieren|slot sichern|fastlane buchen|jetzt buchen|confirm|book)(\s|$)/i;
    const bad = /storn|cancel|abbrechen|zurück|close|schließ|löschen/i;
    return allInteractive(root).find(el => !isDisabled(el) && !bad.test(textOf(el)) && good.test(textOf(el)))
      || allInteractive(root).find(el => !isDisabled(el) && !bad.test(textOf(el)) && /buchen|reserv|confirm|book/i.test(textOf(el)));
  }

  function successVisible(root = document) {
    const txt = textOf(root).toLowerCase();
    return /erfolgreich.{0,60}(gebucht|reserviert)|fastlane.{0,80}(gebucht|bestätigt)|buchung.{0,60}(erfolgreich|bestätigt)/i.test(txt);
  }

  function explicitlyUnavailable(root) {
    const txt = textOf(root);
    return /keine.{0,40}(slots?|termine|zeiten).{0,30}(verfügbar|frei)|ausgebucht|fully booked|no.{0,30}(slots?|times?).{0,30}available|noch nicht.{0,30}(verfügbar|buchbar)/i.test(txt);
  }

  function closeOwnedDialog(root) {
    if (!botOwnsDialog || !root || !visible(root)) return false;
    const controls = allInteractive(root);
    const close = controls.find(el => /^(×|x)$/.test(textOf(el)))
      || controls.find(el => /schließen|close|zurück/i.test(textOf(el)) && !/buchen/i.test(textOf(el)));
    if (close) return clickSafe(close);
    return false;
  }

  async function waitForTimeOptions(root) {
    const until = Date.now() + CFG.dialogLoadMs;
    let options = [];
    while (Date.now() < until && root?.isConnected && visible(root)) {
      options = findTimeOptions(root);
      if (options.length || explicitlyUnavailable(root)) break;
      await sleep(150);
    }
    return options;
  }

  async function processDialog(root, target, cardSig) {
    status(`Prüfe ${target.label}…`);
    const options = await waitForTimeOptions(root);
    const viable = options.filter(o => !conflicts(o.slotDate));

    if (!options.length) {
      state.attemptedSignatures[cardSig] = Date.now(); saveState();
      if (explicitlyUnavailable(root) && botOwnsDialog) {
        status(`${target.label}: aktuell kein Slot – nächstes Ziel`);
        closeOwnedDialog(root);
        return false;
      }
      status(`${target.label}: Overlay bleibt offen – warte auf Slot/UI`);
      return false;
    }

    if (!viable.length) {
      state.attemptedSignatures[cardSig] = Date.now(); saveState();
      status(`${target.label}: Slots da, aber Terminkonflikt`);
      if (botOwnsDialog) closeOwnedDialog(root);
      return false;
    }

    const pick = viable[0];
    status(`${target.label}: ${pick.txt} wird gewählt`);
    if (!clickSafe(pick.el)) {
      status(`${target.label}: Slot sichtbar, Klick fehlgeschlagen – Overlay bleibt offen`);
      return false;
    }

    await sleep(CFG.actionDelayMs);
    const current = activeDialog() || root;
    acceptTerms(current);

    const bookUntil = Date.now() + 2500;
    let book = null;
    while (Date.now() < bookUntil && current?.isConnected && visible(current)) {
      book = findBookButton(current);
      if (book) break;
      await sleep(150);
    }

    if (!book) {
      status(`${target.label}: Buchungsbutton noch nicht bereit – Overlay bleibt offen`);
      return false;
    }
    if (conflicts(pick.slotDate)) {
      status(`${target.label}: Slot kollidiert inzwischen – nicht gebucht`);
      if (botOwnsDialog) closeOwnedDialog(current);
      return false;
    }

    const successBefore = successVisible(document);
    status(`${target.label}: BUCHEN ${pick.txt}`);
    if (!clickSafe(book)) {
      status(`${target.label}: Buchungsklick fehlgeschlagen – Overlay bleibt offen`);
      return false;
    }

    const until = Date.now() + CFG.dialogTimeoutMs;
    let success = false;
    while (Date.now() < until) {
      await sleep(250);
      if (!successBefore && successVisible(document)) { success = true; break; }
      if (!current.isConnected || !visible(current)) break;
    }

    const disappeared = !current.isConnected || !visible(current);
    if (success || disappeared) {
      state.booked.push({
        targetId: target.id,
        target: target.label,
        datetime: pick.slotDate.toISOString(),
        display: pick.txt,
        cardSignature: cardSig,
        confirmedByPage: success,
        bookedAt: new Date().toISOString(),
      });
      state.attemptedSignatures[cardSig] = Date.now(); saveState();
      status(`${target.label}: ${pick.txt} ${success ? 'gebucht ✓' : 'Buchung abgeschickt ✓'}`);
      botOwnsDialog = false;
      currentTarget = null;
      currentCardSignature = null;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Fastlane: ${target.label}`, { body: `${pick.txt} gebucht` });
      }
      return true;
    }

    status(`${target.label}: keine Bestätigung – Overlay bleibt offen, kein Blind-Reclick`);
    state.attemptedSignatures[cardSig] = Date.now(); saveState();
    return false;
  }

  function priorityTargets() {
    return CFG.targets.filter(t => !targetDone(t))
      .sort((a, b) => (bookedCount(a.id) / a.wanted) - (bookedCount(b.id) / b.wanted));
  }

  function inHotWindow() {
    const d = new Date();
    const secIntoQuarter = (d.getMinutes() % 15) * 60 + d.getSeconds();
    return secIntoQuarter <= CFG.hotWindowSeconds || secIntoQuarter >= 900 - CFG.hotWindowSeconds;
  }

  function nextDelay() { return inHotWindow() ? CFG.hotPollMs : CFG.normalPollMs; }
  function status(s) { statusLine = s; renderPanel(); console.log('[Fastlane Autopilot]', s); }

  async function cycle() {
    if (!running || busy || document.hidden) return;
    if (allDone()) {
      status('Alle gewünschten Fastlanes erledigt ✓');
      running = false; saveState(); return;
    }

    busy = true;
    try {
      const open = activeDialog();
      if (open) {
        const target = targetForDialog(open) || currentTarget;
        if (target && !targetDone(target)) {
          const sig = currentCardSignature || `open-dialog:${target.id}:${norm(textOf(open)).slice(0, 180)}`;
          await processDialog(open, target, sig);
        } else {
          status('Overlay offen – Autopilot fasst unbekannten Dialog nicht an');
        }
        return;
      }

      botOwnsDialog = false;
      currentTarget = null;
      currentCardSignature = null;

      for (const target of priorityTargets()) {
        const cards = findTargetCards(target);
        for (const { card, sig } of cards) {
          if ((state.booked || []).some(b => b.cardSignature === sig)) continue;
          const last = state.attemptedSignatures[sig] || 0;
          const cooldown = inHotWindow() ? CFG.hotPollMs : CFG.normalPollMs;
          if (Date.now() - last < cooldown) continue;

          currentTarget = target;
          currentCardSignature = sig;
          botOwnsDialog = true;
          status(`Öffne ${target.label}…`);
          state.attemptedSignatures[sig] = Date.now(); saveState();

          if (!clickSafe(bestOpenControl(card))) {
            botOwnsDialog = false;
            status(`${target.label}: Öffnen fehlgeschlagen`);
            continue;
          }

          const deadline = Date.now() + 2500;
          let dlg = null;
          while (Date.now() < deadline && !dlg) {
            await sleep(100);
            dlg = activeDialog();
          }

          if (dlg) await processDialog(dlg, target, sig);
          else {
            botOwnsDialog = false;
            status(`${target.label}: Overlay nicht erkannt – nächster Versuch folgt`);
          }
          return;
        }
      }
      status('Warte auf freigegebene Slots…');
    } catch (err) {
      console.error('[Fastlane Autopilot]', err);
      status(`Fehler: ${err?.message || err}`);
    } finally {
      busy = false;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function renderPanel() {
    if (!panel) return;
    const targetHtml = CFG.targets.map(t => {
      const n = bookedCount(t.id);
      return `<div>${n >= t.wanted ? '✅' : '⏳'} ${t.label}: <b>${n}/${t.wanted}</b></div>`;
    }).join('');
    const bookedHtml = (state.booked || []).slice(-6)
      .map(b => `<div style="opacity:.85">↳ ${escapeHtml(b.target)} ${escapeHtml(b.display || '')}</div>`).join('');
    panel.innerHTML = `<div style="font-weight:800;margin-bottom:4px">FASTLANE AUTOPILOT v0.2</div><div style="font-size:12px;margin-bottom:8px">${escapeHtml(statusLine)}</div>${targetHtml}${bookedHtml}<div style="display:flex;gap:6px;margin-top:9px"><button id="gcfa-toggle" style="flex:1;padding:7px;border:0;border-radius:8px;font-weight:700">${running ? 'STOP' : 'START'}</button><button id="gcfa-clear" style="padding:7px;border:0;border-radius:8px">Reset</button></div><div style="font-size:10px;opacity:.72;margin-top:6px">Poll: ${inHotWindow() ? '1,2 s HOT' : '8 s'} · Puffer −${CFG.beforeMinutes}/+${CFG.afterMinutes} min</div>`;
    panel.querySelector('#gcfa-toggle').onclick = () => {
      running = !running;
      status(running ? 'Autopilot gestartet' : 'Autopilot gestoppt');
      saveState();
    };
    panel.querySelector('#gcfa-clear').onclick = () => {
      if (!confirm('Nur den Autopilot-Verlauf zurücksetzen? Bereits echte Gamescom-Buchungen werden dadurch NICHT storniert.')) return;
      state.booked = [];
      state.attemptedSignatures = {};
      saveState();
      status('Lokaler Verlauf zurückgesetzt');
    };
  }

  function makePanel() {
    panel = document.createElement('div');
    panel.id = 'gc-fastlane-autopilot';
    Object.assign(panel.style, {
      position:'fixed', zIndex:'2147483647', right:'10px', bottom:'10px', width:'220px',
      maxWidth:'calc(100vw - 20px)', padding:'10px', borderRadius:'12px',
      background:'rgba(8,10,16,.94)', color:'#fff', font:'13px/1.35 system-ui,-apple-system,sans-serif',
      boxShadow:'0 8px 30px rgba(0,0,0,.38)', backdropFilter:'blur(8px)'
    });
    document.documentElement.appendChild(panel);
    renderPanel();
  }

  async function scheduler() {
    while (true) {
      await cycle();
      await sleep(nextDelay());
    }
  }

  makePanel();
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  status('Autopilot aktiv – suche Samsung ×2, Sea of Remnants, METRO 2039');
  scheduler();
})();
