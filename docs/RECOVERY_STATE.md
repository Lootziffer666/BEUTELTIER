# Recovery State — SHADED + BEUTELTIER

Stand: 2026-08-23. Harte Grenze: 2026-08-26 07:00 Europe/Berlin.

Autoritative Ausgangsstaende:

- SHADED `origin/main`: `732c24b98e304f3278b76e82dd164467497e60c3`
- BEUTELTIER `origin/main`: `963251a004090450055c27454c175d744f58547b`
- SHADED Recovery-Branch: `recovery/honest-spatial-path`, Remote-Commit
  `e4062a1`, PR [SHADED #73](https://github.com/Lootziffer666/SHADED/pull/73)
  (lokal inhaltlich gleicher Tree: `ec3235a`)
- BEUTELTIER Recovery-Branch: `recovery/wednesday-corridor`, Remote-Commit
  `8dfd219`, PR
  [BEUTELTIER #43](https://github.com/Lootziffer666/BEUTELTIER/pull/43)
  (lokal inhaltlich gleicher Tree: `a5f67bd`)

## NOW

Die kleinsten Mittwoch-Aenderungen sind gebaut, getestet und als zwei PRs
gegen die auditierten `main`-Staende bereitgestellt. Offen ist ein echter
Browserlauf auf einem Rechner mit installiertem Chromium sowie Review/Merge.
Der fehlende Browser wird nicht als bestandene Sichtpruefung ausgegeben.

## PROVEN WORKING

### BEUTELTIER

- 138 Python-Pipeline-Tests bestehen in einer frischen Umgebung.
- 285 Frontend-Tests bestehen; App- und World-Builder-Produktionsbuild
  entstehen.
- Der aktive registrierte Modus fuehrt Hallen, Graph, Orthofoto, OSM-Wege und
  ALKIS-Luecken jetzt im selben `sceneX/sceneZ`-Raum. Der eingecheckte Marker
  `Eingang Sued` landet bei `(-377,35 / 449,48)`; die Transformation bewahrt
  metrische Abstaende. Fehlt die belegende Passung, bricht der Ladevorgang ab.
- Der Aussenweg wird bei jedem Build per Dijkstra aus dem eingecheckten
  OSM-Snapshot gebaut: Bahnhofsausgang Ottoplatz (`node 2019682768`) bis
  Eingang Sued (`node 3063838345`), 33 Knoten, 479,3 m.
- Derselbe bestehende `RouteGraph` enthaelt danach 12.181 Knoten und 19.009
  Kanten. Ein ausgefuehrter Routentest erreicht von dort die Zielzelle in
  Halle 10.1 und durchlaeuft sowohl `outdoor`- als auch `portal`-Kanten.
- Die Oberfläche zeigt Start, Ziel, fuenf Etappen, OSM-Quellenmass,
  Darstellungsart `ROUTE_GRAPH_POLYLINE` und die Unsicherheit gleichzeitig.
  Wird eine benoetigte Verbindung gesperrt, meldet sie `FAILED` statt Erfolg.
- LoD2, DGM1-Terrain, OSM-Snapshot, Hallenplaene, registrierte Halle 10.1,
  Fassadenreferenzen und amtliche Weltpakete bleiben unveraendert erhalten.

### SHADED

- Der aktive Bildoperator ist jetzt separat ausgefuehrt getestet:
  `RGB + bereitgestellte relative 8-Bit-Tiefe -> POINTS`.
- Quell-RGB erreicht die Punkte unveraendert. Tiefengeometrie traegt
  `INFERRED`, Farbe `OBSERVED_SOURCE_RGB`.
- Der Operator gibt sichtbar und maschinenlesbar aus: relative/nichtmetrische
  Skala, unbekannte Zuverlaessigkeit, angenommene 60-Grad-Kamera (wenn keine
  FOV angegeben ist), `registration.performed:false` und
  `fusion.performed:false`.
- Fehlende Tiefenkonfidenz bleibt `null/UNKNOWN`; sie wird nicht mehr aus dem
  Tiefenwert oder aus Konstanten erzeugt. Dasselbe gilt fuer generierte
  Spiegelhuelle, Weltpunkte und prozedurale Begrenzung.
- Provider-Importe ohne XYZ+RGB brechen ab. Es gibt keine grauen
  Platzhalterfarben mehr im sichtbaren Import; ein vorhandener
  Konfidenzkanal wird verwendet, ein fehlender bleibt unbekannt.
- Die aktive Ansicht kennzeichnet `VIEW POINTS · STATE VOXELS`; die API nennt
  `meshRendered:false`. `npm run check` einschliesslich aktivem Operator-,
  Rekonstruktions-, Voxel-, Weltgesetz-, PWA- und Provider-Vertragstest
  besteht.
- Regen, Naesse, Pfuetzen, Wind, Feuer, Schnee, Vegetation und persistenter
  Weltzustand bleiben in ihren aktiven Aufruf-/Shaderpfaden erhalten.

## CAPABILITY MAP

| Projekt / Faehigkeit | Status | Autoritativer Pfad / Beleg |
|---|---|---|
| SHADED Bild + Weltgesetze | REAL + ACTIVE | `index.html -> runtime/shaded-engine.mjs` |
| SHADED RGB + Companion-Tiefe -> Punkte | PARTIAL | `runtime/spatial-point-cloud.mjs`; echte RGB-Ausgabe, aber kein Provider-/Metriknachweis |
| SHADED Kamera | PARTIAL | FOV vom Aufrufer oder sichtbar angenommene 60 Grad; Intrinsics unbekannt |
| SHADED Registrierung / Fusion im Hauptweg | DEAD | `performed:false`; kein aktiver Aufruf |
| SHADED Voxelzustand / Navigation | REAL + ACTIVE | `spatial-viewer.js -> spatial-navigation.mjs -> sparse-voxel-world.mjs` |
| SHADED Mesh-Extraktion | REAL + UNUSED | `extractSurfaceMesh()` ist getestet; der aktive Viewer zeichnet keine Dreiecke |
| SHADED Solid-Mesh-Overlay | DEAD | `spatial-solid-runtime.js` ist nicht von `index.html` geladen |
| SHADED Providerkatalog | REAL + UNUSED / SIMULATION / STUB gemischt | nicht an den Hauptweg angeschlossen |
| SHADED Photo-First-Generation | BROKEN | 20 von 25 Alt-Tests scheitern; nicht Hauptproduktpfad |
| SHADED Benchmark-Floor | TEST-ONLY / STUB | Testhistorie erhalten, kein Rekonstruktionsbenchmark |
| BEUTELTIER registrierte Hallenwelt | REAL + ACTIVE | `registered-site.json` + `registered-graph.json` |
| BEUTELTIER Standrouting | REAL + ACTIVE | bestehender `RouteGraph` und `findRoute()` |
| BEUTELTIER Bahnhof -> Eingang Sued | REAL + ACTIVE auf Recovery-Branch | Dijkstra aus eingechecktem OSM-Snapshot |
| BEUTELTIER Eingang Sued -> Halle 10.1 | PARTIAL | durchgaengiger Graph, aber Venue-Abschnitt sichtbar `unbestaetigt` |
| BEUTELTIER Browserdarstellung | UNKNOWN | Builds/Komponententests bestanden; Chromium in Arbeitsumgebung nicht verfuegbar |

## BROKEN / FAKE / DEAD

- SHADED besitzt keinen im Haupt-UI ausfuehrbaren Tiefenprovider. Die
  Companion-Datei hat keinen belegten Provider, keine Kamerakalibrierung und
  keine metrische Skala. Hier endet der ehrliche Rekonstruktionsnachweis.
- Der aktive SHADED-Viewer zeichnet WebGL-`POINTS`. Eine Mesh-API und ein
  nicht eingebundenes Solid-Overlay existieren, sind aber kein sichtbarer
  Produktnachweis.
- Depth Anything 2/3, VGGT und COLMAP sind in der geprueften Umgebung nicht
  ausfuehrbar. Der Software-Tiefenweg ist eine Heuristik.
- `tools/gpu-providers.all.json` plus `tools/shaded-provider.py` ist eine
  gemischte Simulations-/Proxy-Sammlung. `tools/test-all-providers.mjs`
  meldet selbst fehlende Skripte und gescheiterte Doctors als PASS. Diese
  Zahl ist kein Faehigkeitsnachweis.
- Mehrere alte Spatial-Integratoren enthalten `would do`, Platzhalterfarben
  oder pauschalen Erfolg. Sie sind im Haupt-UI nicht erreichbar und werden
  nicht als Produktpfad gezaehlt.
- BEUTELTIERs Abschnitt Eingang Sued -> Piazza/Boulevard ist beobachtet, aber
  nicht als metrische Innenachse vermessen. Die vorhandene Passage 5-10 traegt
  46,8 m Lageunsicherheit und bleibt `unbestaetigt`.
- Ein Browser-E2E-Lauf ist blockiert: kein Chromium und kein funktionierender
  Browser-Download in dieser Arbeitsumgebung.

## WEDNESDAY PATH

1. Auf einem Rechner mit Chromium BEUTELTIER oeffnen, `Korridor zeigen`
   anklicken und Start, Etappen, gelbe Unsicherheit sowie Ziel Halle 10.1
   visuell pruefen.
2. PR #43 und PR #73 reviewen; nur bei weiterhin gruenen Checks und nach der
   Sichtpruefung mergen.
3. Genau diesen Korridor zeigen. Keine weitere Halle und keinen neuen
   SHADED-Provider vor Mittwoch einbauen.

## PARKED

- Integration und Operator-Zerlegung des grossen SHADED-Provider-/Paper-Katalogs.
- Neue Rekonstruktionsprovider oder Modellinstallationen.
- Vollstaendige Koelnmesse-Rekonstruktion jenseits des Demo-Korridors.
- Ausbau von `Can THEY Run It?`; vorhandene Benchmarkdaten bleiben erhalten.
- Aktivierung/Pruefung eines Mesh-Renderers fuer SHADED.
- Ausbau der SHADED-Weltgesetze. Nach Gamescom kehrt die Arbeit zu World,
  Operatoren und belastbaren Benchmarks zurueck.
- Aufraeumen aller toten SHADED-Spatial-Generationen.

## DECISIONS NEEDED

Keine fuer den Mittwochskorridor. Fuer 2027 ist zu entscheiden, ob der
Abschnitt Eingang Sued -> Piazza vor Ort vermessen oder dauerhaft nur als
beobachteter, unbestaetigter Korridor gefuehrt wird.
