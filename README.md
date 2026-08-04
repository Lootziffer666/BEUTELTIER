<img src="app/public/brand/lootzy-full.png" width="88" align="right" alt="Lootzy">

# BEUTELTIER

**Finde Beute. Finde den Weg.**

Gamescom-Begleitapp. Sie beantwortet nicht nur „Wo ist etwas?", sondern:
*Was ist neu, wo ist es, wie komme ich unter den aktuellen Bedingungen dorthin
und lohnt sich der Weg noch?*

Das Produktkonzept steht in [`docs/PRD.md`](docs/PRD.md), die Herkunft aller
Daten in [`docs/quellen.md`](docs/quellen.md).

---

## Warum die Karte 3D ist

Die Koelnmesse geht über zwei Ebenen, und die Laufwege ändern sich stündlich.
Eine flache Karte mit Ebenenumschalter zerreißt genau die Information, auf die
es ankommt — den Ebenenwechsel als Teil der Route. In BEUTELTIER ist er ein
sichtbares senkrechtes Stück im Weg.

Die flache Ansicht geht dabei nicht verloren: **Laufmodus** ist eine
Kameraposition von oben, kein zweiter Renderer.

## Was die Karte weiß — und was nicht

Alles ist metrisch, nichts ist geraten, und wo es unsicher wird, steht es dran.

| | |
|---|---|
| Standflächen | **1.027**, als Polygone in echten Metern aus dem offiziellen Hallenplan |
| Belegungen mit exakter Lage | **909 von 910** (99,9 %) |
| Hallenebenen | **17**, davon 8 eingemessen (Restfehler **0,27 m** im Mittel) |
| Hallen mit geschätzter Lage | **5** (1.2, 3.2 und die Freiflächen), rund **±27 m** |
| Umrisse gegen offizielle Flächen | **9,1 %** mittlere Abweichung |
| Wegenetz | 12.139 Knoten, 19 Durchgänge, 8 Ebenenwechsel |

Die Genauigkeit ist gemessen, nicht behauptet: Hallen werden über Standcodes
eingepasst, die in zwei unabhängigen Quellen vorkommen, und die geschätzten
Lagen tragen ihren kreuzvalidierten Fehler bis in die Oberfläche.

Höhen kommen aus den offiziellen lichten Höhen. Die Bodenhöhe der oberen
Ebenen ist daraus **gerechnet** — lichte Höhe darunter plus Geschossdecke von
1,5–2,0 m — und trägt Herkunft, Konfidenz und Unsicherheit mit. Die Umrisse
sind der **belegte Bereich**, nicht der Gebäudeumriss: wo gamescom nur einen
Teil einer Halle nutzt, endet der Umriss dort.

Details in [`docs/accuracy-report.md`](docs/accuracy-report.md) (erzeugt) und
[`docs/data-accuracy-audit.md`](docs/data-accuracy-audit.md).

Was in **keiner** Quelle steht, startet als `unbestaetigt`: Rolltreppen­richtungen,
ob ein Durchgang gerade Einbahn oder nur Ausgang ist, welche Zugangsgruppe
wo durchdarf. Die App ist der Ort, an dem das korrigiert wird — sie behauptet
nie, ein unbestätigter Weg sei offen.

## Module

- **Karte** — Suche, Route in Metern und Gehminuten, Übergänge schalten, Beutezug über mehrere Ziele
- **Epix Hub** — Kampagnenfenster (28 Tage bis zum letzten Sonntag im August), Quests übernehmen, Links zeitversetzt im normalen Browser öffnen, SteamGifts-Markdown exportieren
- **Funkwache** — Goodie-Meldungen aus fremden Quellen einlesen, Aussteller und Stand erkennen, bei Mehrdeutigkeit alle Kandidaten zeigen statt zu raten
- **Register** — 1.520 Aussteller, Viele-zu-viele zwischen Ausstellern und Standflächen, Indie Arena Booth als Compound

## Bauen

```bash
pip install -r requirements.txt

python3 tools/fetch_hallplan.py       # Standflächen je Hallenebene
python3 tools/fetch_hall_layout.py    # Hallenlagen und Durchgänge
python3 tools/build_all.py            # Gelände, Wegenetz, Register, Genauigkeitsbericht

cd app && npm install && npm run dev
```

`build_all.py` prüft am Ende Untergrenzen, die einmal erreicht waren, und
schlägt fehl, wenn eine Quelle kaputtgeht. Die Ergebnisse landen zugleich in
`app/public/data/`, damit Oberfläche und Aufbereitung nicht auseinanderlaufen.

Die App liest ausschließlich diese eingecheckten Schnappschüsse — auf dem
Messegelände bricht das Netz genau dann zusammen, wenn alle es brauchen.

## Prüfen

```bash
cd app
npm test                              # Routing und Meldungserkennung
npm run build && npx vite preview --port 4173
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e.mjs
```

`e2e.mjs` spielt den Erfolgsablauf aus PRD §9 durch einen echten Browser:
Meldung → Zuordnung → Route → Sperre → Alternativroute → Export.

## Aufbau

```
tools/      Datenaufbereitung (Python)
  beuteltier/   PDF-Vektorleser, Hallenplan, Georeferenz, Wegenetz
data/
  raw/      Schnappschüsse der Quellen, eingecheckt
  curated/  Von Hand gepflegtes, wo keine Quelle existiert
  build/    Erzeugt
app/        PWA (Vite, React, TypeScript, React Three Fiber)
editor/     3D-Node-Editor zum Bearbeiten des Wegenetzes
```

## Nicht-Ziele

Kein Indoor-GPS, kein Discord-Bot mit Schreibrechten, keine Umgehung von
Schutzmechanismen, kein Ersatz für die Indie Arena Booth App.
