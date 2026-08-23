# Recovery State — SHADED + BEUTELTIER

Stand: 2026-08-24. Harte Grenze: 2026-08-26 07:00 Europe/Berlin.

Autoritative Ausgangsstaende:

- SHADED `origin/main`: `732c24b98e304f3278b76e82dd164467497e60c3`
- BEUTELTIER `origin/main`: `963251a004090450055c27454c175d744f58547b`
- SHADED Recovery-Branch: `recovery/honest-spatial-path`, Remote-Commit
  `e4062a1`, PR [SHADED #73](https://github.com/Lootziffer666/SHADED/pull/73)
  (lokal inhaltlich gleicher Tree: `ec3235a`)
- BEUTELTIER Recovery-Branch: `recovery/wednesday-corridor`, PR
  [BEUTELTIER #43](https://github.com/Lootziffer666/BEUTELTIER/pull/43)

## NOW

PR #43 erhaelt die kleinste sichtbare Korrektur aus der mobilen Sichtpruefung:
Die registrierten Weltpakete sind in jeder Ansicht massiv, Standkoerper sind
standardmaessig aus und zuschaltbar, die Auswahl markiert das zugeordnete
amtliche Gebaeudefeature. Das reale DGM1 wird in seiner belegten Hoehe
gerendert; das registrierte Orthofoto liegt auf dem Terrain und auf den
amtlichen Dachflaechen im Bildausschnitt. Die Vercel-Vorschau des PR-Branches
ist `Ready`; offen ist die mobile WebGL-Sichtpruefung. Ein fehlender
Bildnachweis wird nicht als bestanden ausgegeben.

## PROVEN WORKING

### BEUTELTIER

- 140 Python-Pipeline-Tests bestehen in einer frischen Umgebung.
- 297 Frontend-Tests bestehen; App- und World-Builder-Produktionsbuild
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
- Registrierte amtliche Render-GLBs stehen in allen Presets bei 100 %
  Deckkraft; transparente Legacy-Hallen werden dort nie gerendert. Stände
  beginnen ausgeschaltet und koennen als eigene Ebene zugeschaltet werden.
  Nur der demonstrative Korridor darf als Kartenband vor Geometrie liegen.
- Das eingecheckte `terrain.glb` enthaelt 329.221 reale DGM1-Messpunkte mit
  relativen Hoehen von -1,28 bis 10,54 m. Sein alter Index enthielt 1.203
  ungueltige Referenzen; der aktive Renderer baut daraus nun deterministisch
  1.968.000 gueltige Indizes bis maximal 329.220. Der Generator ist ebenfalls
  korrigiert und bricht ohne DGM1 ab, statt ein Flachraster vorzutäuschen.
- Das reale Geobasis-NRW-Orthofoto wird affine in denselben registrierten
  Szenenraum projiziert. Der Asset-Nachweis ergibt 104.716 ueberdeckte
  Terrain-Dreiecke; Daecher innerhalb desselben Ausschnitts erhalten dieselbe
  reale Bildquelle. Die Wandmaterialien bleiben ehrlich prozedural, weil die
  vorhandenen sogenannten Fassadenbilder keine belastbaren Hallenfassaden
  zeigen.
- Die binaere Hoehenabfrage liest den belegten 48-Byte-Header und denselben
  DGM-Raster wie das GLB. Lade- und Formatfehler werden sichtbar gemeldet,
  nicht mehr auf eine behauptete flache Hoehe reduziert.
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
| BEUTELTIER DGM1 + Orthofoto | REAL + ACTIVE auf Recovery-Branch | gemessene Hoehen; gueltig repariertes Raster; registrierte Bildprojektion auf Terrain/Daecher |
| BEUTELTIER angebliche Fassadenfotos | BROKEN + UNUSED | vorhandene JPGs zeigen nicht belastbar die bezeichneten Hallen und bleiben isoliert |
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
- Das eingecheckte alte `terrain.glb` hat einen kaputten Index. Der aktive
  Branch repariert ihn beim Laden aus der belegten Rasterordnung; ein spaeter
  neu gebautes Asset kommt aus dem korrigierten Generator. Das binaere Asset
  selbst wird nicht heimlich als generierte PR-Beilage ersetzt.
- `app/public/models/facades/*.jpg` und die entsprechenden Texturatlanten sind
  keine belastbaren Bilder der so bezeichneten Hallen. Sie bleiben unbenutzt;
  echte Fassadentexturierung ist damit noch nicht belegt.
- Die oeffentliche Vercel-Seite laedt im Cloud-Browser, dessen sandboxed Chrome
  kann jedoch keinen WebGL-Kontext erzeugen. Die PR-Vorschau ist zusaetzlich
  durch Vercel-Login geschuetzt. Deshalb existiert hier kein Bild-PASS.

## WEDNESDAY PATH

1. Den neuen Build von PR #43 in einem WebGL-faehigen Browser oeffnen und
   pruefen: massive Welt bereits beim Start, Stände aus und zuschaltbar,
   sichtbares Orthofoto auf reliefiertem Terrain und Daechern, ausgewaehlte
   Halle gelb markiert, Demokorridor weiterhin lesbar.
2. PR #43 und PR #73 reviewen; nur bei weiterhin gruenen Checks und nach der
   Sichtpruefung mergen.
3. Genau diesen Korridor zeigen. Keine weitere Halle und keinen neuen
   SHADED-Provider vor Mittwoch einbauen.

## PARKED

- Integration und Operator-Zerlegung des grossen SHADED-Provider-/Paper-Katalogs.
- Neue Rekonstruktionsprovider oder Modellinstallationen.
- Vollstaendige Koelnmesse-Rekonstruktion jenseits des Demo-Korridors.
- Erweiterung der Welt von Bahnhof bis A3/Parkhaeuser sowie ostwaerts und
  westwaerts ueber den Rhein einschliesslich vollstaendiger Skyline.
- Ausbau von `Can THEY Run It?`; vorhandene Benchmarkdaten bleiben erhalten.
- Aktivierung/Pruefung eines Mesh-Renderers fuer SHADED.
- Ausbau der SHADED-Weltgesetze. Nach Gamescom kehrt die Arbeit zu World,
  Operatoren und belastbaren Benchmarks zurueck.
- Aufraeumen aller toten SHADED-Spatial-Generationen.

## DECISIONS NEEDED

Keine fuer den Mittwochskorridor. Fuer 2027 ist zu entscheiden, ob der
Abschnitt Eingang Sued -> Piazza vor Ort vermessen oder dauerhaft nur als
beobachteter, unbestaetigter Korridor gefuehrt wird.
