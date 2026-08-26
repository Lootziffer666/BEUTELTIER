// ==UserScript==
// @name         gamescom Fastlane Autopilot — METRO Emergency
// @namespace    https://github.com/Lootziffer666/BEUTELTIER
// @version      0.3.0
// @description  Emergency booking for METRO 2039 19:00-19:25 on gamescom 2026.
// @match        https://www.gamescom.global/de/fastlanes*
// @match        https://www.gamescom.global/en/fastlanes*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TARGET = /metro\s*:?\s*2039/i;
  const SLOT_RE = /(?:^|\D)19[:.]00(?:\D|$)/;
  const RELEASE = new Date(2026, 7, 26, 17, 0, 0, 0);
  const STORE = 'gcfa-metro-emergency-v3';
  const state = Object.assign({ booked: false, reloadAtRelease: false, secondReload: false }, load());
  let panel;
  let busy = false;
  let statusText = 'Initialisiere…';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); }
    catch { return {}; }
  }
  function save() { localStorage.setItem(STORE, JSON.stringify(state)); render(); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const txt = el => norm(el?.innerText || el?.textContent || el?.getAttribute?.('aria-label') || el?.value || '');
  function vis(el) {
    if (!el || !el.isConnected || panel?.contains(el)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
  }
  function disabled(el) { return !!(el?.disabled || el?.getAttribute?.('aria-disabled') === 'true' || el?.matches?.('[disabled]')); }
  function interactives(root = document) {
    return [...root.querySelectorAll('button,a,[role="button"],[role="checkbox"],input,label,[tabindex]')].filter(vis);
  }
  function status(s) { statusText = s; console.log('[GC METRO]', s); render(); }

  function relevantDialog() {
    const strong = [...document.querySelectorAll('[role="dialog"],dialog,[aria-modal="true"],[class*="modal" i],[class*="dialog" i]')].filter(vis);
    const fixed = [...document.querySelectorAll('body *')].filter(el => {
      if (!vis(el)) return false;
      const s = getComputedStyle(el);
      if (s.position !== 'fixed') return false;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.45 || r.height < innerHeight * 0.25) return false;
      return TARGET.test(txt(el));
    });
    const all = [...new Set([...strong, ...fixed])].filter(el => TARGET.test(txt(el)) || SLOT_RE.test(txt(el)));
    all.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
    return all[0] || null;
  }

  function fireClick(el) {
    if (!el || !vis(el) || disabled(el)) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch {}
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch {}
    try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch {}
    try { el.click(); } catch { try { el.dispatchEvent(new MouseEvent('click', opts)); } catch {} }
    return true;
  }

  function metroNodes() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let el;
    while ((el = walker.nextNode())) {
      if (!vis(el)) continue;
      const own = norm([...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' '));
      const aria = norm(el.getAttribute?.('aria-label') || '');
      if (TARGET.test(own) || TARGET.test(aria)) out.push(el);
    }
    return out;
  }

  function openMetro() {
    if (relevantDialog()) return true;
    const nodes = metroNodes();
    const candidates = [];
    for (const node of nodes) {
      let cur = node;
      for (let i = 0; cur && i < 7; i++, cur = cur.parentElement) {
        if (!vis(cur)) continue;
        if (cur.matches?.('button,a,[role="button"]')) candidates.push(cur);
        for (const c of interactives(cur)) {
          const t = txt(c);
          if (/fastlane|buchen|reserv|slot|details|mehr|öffnen|open/i.test(t)) candidates.push(c);
        }
      }
    }
    const uniq = [...new Set(candidates)].filter(el => !disabled(el));
    uniq.sort((a, b) => {
      const at = txt(a), bt = txt(b);
      const as = (/fastlane|buchen|reserv|slot|details|mehr|öffnen|open/i.test(at) ? 10 : 0) + (TARGET.test(at) ? 5 : 0);
      const bs = (/fastlane|buchen|reserv|slot|details|mehr|öffnen|open/i.test(bt) ? 10 : 0) + (TARGET.test(bt) ? 5 : 0);
      return bs - as;
    });
    if (uniq[0]) {
      status('Öffne METRO 2039…');
      fireClick(uniq[0]);
      return true;
    }
    const node = nodes[0];
    if (node) {
      let card = node;
      for (let i = 0; card.parentElement && i < 5; i++) {
        const p = card.parentElement;
        if (p.getBoundingClientRect().width > card.getBoundingClientRect().width * 1.2) card = p;
        else break;
      }
      status('Öffne METRO-Karte direkt…');
      return fireClick(card);
    }
    status('METRO-Karte noch nicht gefunden');
    return false;
  }

  function exact1900(root) {
    const candidates = [];
    const els = [...root.querySelectorAll('button,a,[role="button"],label,input,[tabindex],div,span,p')];
    for (const el of els) {
      if (!vis(el) || disabled(el)) continue;
      const t = txt(el);
      if (!SLOT_RE.test(t)) continue;
      const click = el.closest?.('button,a,[role="button"],label,[tabindex]') || el;
      if (!vis(click) || disabled(click)) continue;
      const area = click.getBoundingClientRect().width * click.getBoundingClientRect().height;
      const exact = /^\s*19[:.]00(?:\s*[-–]\s*19[:.]25)?\s*$/.test(t) ? 100 : 0;
      candidates.push({ el: click, score: exact - Math.min(area / 1000, 50) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function termsAccepted(root) {
    if ([...root.querySelectorAll('input[type="checkbox"]')].some(cb => cb.checked)) return true;
    return [...root.querySelectorAll('[role="checkbox"],[aria-checked]')].some(el => el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked');
  }

  async function acceptTerms(root) {
    for (let round = 0; round < 4; round++) {
      const checkboxes = [...root.querySelectorAll('input[type="checkbox"]')].filter(cb => !disabled(cb));
      for (const cb of checkboxes) {
        const label = cb.closest('label') || (cb.id ? root.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : null);
        const context = txt(label || cb.parentElement || cb);
        if (!/nutzungsbedingungen|bedingungen|terms|agb|akzeptier|zustimm/i.test(context) && checkboxes.length > 1) continue;
        if (!cb.checked) fireClick(vis(cb) ? cb : (label || cb));
      }
      for (const el of [...root.querySelectorAll('[role="checkbox"],[aria-checked],label,div,p,span')]) {
        if (!vis(el) || disabled(el)) continue;
        if (!/nutzungsbedingungen|bedingungen|terms|agb|akzeptier|zustimm/i.test(txt(el))) continue;
        const cb = el.querySelector?.('input[type="checkbox"],[role="checkbox"],[aria-checked]') || el.closest?.('label')?.querySelector?.('input[type="checkbox"],[role="checkbox"],[aria-checked]') || el;
        if (cb.getAttribute?.('aria-checked') !== 'true' && cb.getAttribute?.('data-state') !== 'checked') fireClick(cb);
      }
      await sleep(120);
      if (termsAccepted(root)) return true;
    }
    return termsAccepted(root);
  }

  function bookButton(root) {
    const good = /(^|\s)(buchen|reservieren|slot sichern|fastlane buchen|jetzt buchen|confirm|book)(\s|$)/i;
    const bad = /storn|cancel|abbrechen|zurück|close|schließ|löschen/i;
    const list = interactives(root).filter(el => !disabled(el) && !bad.test(txt(el)) && /buchen|reserv|confirm|book/i.test(txt(el)));
    return list.find(el => good.test(txt(el))) || list[0] || null;
  }

  function successVisible() {
    const t = txt(document.body);
    return /erfolgreich.{0,70}(gebucht|reserviert)|fastlane.{0,90}(gebucht|bestätigt)|buchung.{0,70}(erfolgreich|bestätigt)/i.test(t);
  }

  async function tryBook() {
    if (state.booked || busy) return;
    busy = true;
    try {
      let dlg = relevantDialog();
      if (!dlg) {
        openMetro();
        const until = Date.now() + 2200;
        while (Date.now() < until && !dlg) { await sleep(80); dlg = relevantDialog(); }
      }
      if (!dlg) { status('METRO-Overlay noch nicht offen'); return; }

      if (Date.now() < +RELEASE) {
        status(`METRO offen. Warte auf 17:00 (${countdown()})`);
        return;
      }

      const slot = exact1900(dlg);
      if (!slot) { status('19:00 noch nicht sichtbar — prüfe weiter'); return; }

      status('19:00 gefunden — wähle exakt diesen Slot');
      fireClick(slot);
      await sleep(180);
      dlg = relevantDialog() || dlg;

      const accepted = await acceptTerms(dlg);
      if (!accepted) { status('Nutzungsbedingungen noch nicht akzeptiert — versuche weiter'); return; }

      let book = null;
      const until = Date.now() + 1800;
      while (Date.now() < until && !book) { book = bookButton(dlg); if (!book) await sleep(100); }
      if (!book) { status('AGB ✓, Buchungsbutton noch nicht aktiv'); return; }

      status('AGB ✓ — BUCHE METRO 19:00–19:25');
      const wasVisible = vis(dlg);
      fireClick(book);
      const confirmUntil = Date.now() + 4500;
      while (Date.now() < confirmUntil) {
        await sleep(150);
        if (successVisible() || (wasVisible && (!dlg.isConnected || !vis(dlg)))) {
          state.booked = true; save(); status('METRO 19:00–19:25 GEBUCHT ✓'); return;
        }
      }
      status('Buchung gesendet — keine Bestätigung erkannt, NICHT blind doppelklicken');
    } finally { busy = false; }
  }

  function countdown() {
    const ms = +RELEASE - Date.now();
    if (ms <= 0) return 'JETZT';
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function render() {
    if (!panel) return;
    panel.innerHTML = `<b>METRO EMERGENCY v0.3</b><div style="margin-top:4px">${state.booked ? '✅ 19:00–19:25 gebucht' : '⏳ 19:00–19:25'}</div><div style="font-size:12px;margin-top:5px">${norm(statusText)}</div><div style="font-size:11px;opacity:.75;margin-top:5px">Freischaltung: ${countdown()}</div>`;
  }

  function makePanel() {
    panel = document.createElement('div');
    Object.assign(panel.style, { position:'fixed', zIndex:'2147483647', right:'8px', bottom:'8px', width:'230px', maxWidth:'calc(100vw - 16px)', padding:'10px', borderRadius:'11px', background:'rgba(6,8,12,.95)', color:'#fff', font:'13px/1.35 system-ui,sans-serif', boxShadow:'0 8px 26px rgba(0,0,0,.4)' });
    document.documentElement.appendChild(panel); render();
  }

  async function main() {
    makePanel();
    status('Emergency Mode aktiv — ausschließlich METRO 19:00');

    if (Date.now() >= +RELEASE && Date.now() < +RELEASE + 15000 && !state.reloadAtRelease) {
      state.reloadAtRelease = true; save();
      location.reload();
      return;
    }

    while (!state.booked) {
      const now = Date.now();
      if (now < +RELEASE) {
        if (!relevantDialog()) openMetro();
        await tryBook();
        render();
        await sleep(now > +RELEASE - 10000 ? 250 : 1500);
        continue;
      }

      await tryBook();

      if (!state.booked && now > +RELEASE + 5000 && now < +RELEASE + 12000 && !state.secondReload) {
        state.secondReload = true; save();
        location.reload();
        return;
      }

      render();
      await sleep(now < +RELEASE + 45000 ? 280 : 1200);
    }
  }

  main().catch(err => status(`Fehler: ${err?.message || err}`));
})();
