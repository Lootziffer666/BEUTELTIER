# Amtliche Messewelt: Bestandsanalyse und Umsetzungsplan

Stand: 6. August 2026. Dieses Dokument ist das Ergebnis von **Etappe 1**. Es
ist bewusst kein Fertigstellungsnachweis: Die amtliche Weltregistrierung und
die Außenbegehbarkeit sind im aktuellen Code noch nicht umgesetzt.

## 1. Bestandsanalyse

### Laufende Anwendung und Datenfluss

BEUTELTIER ist bereits eine React-/TypeScript-PWA mit React Three Fiber. Der
Viewer lädt lokale JSON-Snapshots, erzeugt daraus Routing und WalkGrid und lädt
das Gelände als lokales GLB. Vite erzeugt den Service Worker. Die Android-Hülle
wird nicht berührt.

Der aktuelle Build enthält:

| Produkt | Bestand |
|---|---:|
| Hallenebenen | 17 |
| Standpolygone | 1.027 |
| LoD2-Baukörper im Ausschnitt | 456 |
| ALKIS-Grundrisse | 537 |
| OSM-Wege / Marker | 4.183 / 2.512 |
| Gelände-GLB | 2,7 MiB, monolithisch |
| Orthofoto | 3,5 MiB |

Die heutigen Szenenkoordinaten sind **Hallenplan-Geländemeter**. Die
CityGML-Daten werden mit einer globalen Ähnlichkeitstransformation in dieses
System zurückgerechnet. Genau diese Richtung muss umgekehrt werden: UTM/NHN
bleibt künftig Master; pro Hallenebene wird nur der lokale Hallenplan in die
amtliche Welt registriert.

### CityGML-Bestand

Eine vollständige Tag-Zählung der vier vorhandenen GML-Kacheln ergibt:

| Typ | Anzahl |
|---|---:|
| `bldg:Building` | 1.129 |
| `bldg:BuildingPart` | 1.135 |
| `bldg:WallSurface` | 17.206 |
| `bldg:RoofSurface` | 3.968 |
| `bldg:ClosureSurface` | 2.950 |
| `bldg:GroundSurface` | 1.945 |

In diesen vier Kacheln wurden keine eigenständigen Bridge-, Tunnel-,
CityFurniture- oder GenericCityObject-Tags gefunden. Das ist ein Befund des
lokalen Datenbestands, keine Annahme über NRW insgesamt. Verbindungen und
aufgeständerte Bereiche können als BuildingPart beziehungsweise
ClosureSurface modelliert sein und dürfen daher nicht über das Vorhandensein
einer GroundSurface gefiltert werden.

### Fünf konkret problematische Fälle

1. **BuildingPart-Identität geht verloren.** Der Reader traversiert Teile zwar
   unterhalb eines Building, führt sie aber weder als eigene Feature-ID noch
   mit eigener Klasse und Funktion im Ergebnis.
2. **Objekte ohne GroundSurface fallen heraus.** `footprint()` liefert leer;
   der nachgelagerte Mindestflächenfilter entfernt damit oberflächenhaltige
   Verbindungs- oder aufgeständerte Teile.
3. **ClosureSurface wird geometrisch übernommen, aber nicht semantisch
   ausgewertet.** Eine Abschlussfläche kann deshalb weder als Übergang noch
   als gesperrte Unterseite diagnostiziert werden.
4. **Globale Registrierung in der falschen Richtung.** `build_buildings.py`
   passt das amtliche Modell an die abgeleitete Hallenplanwelt an. Relative
   CityGML-Anordnung und Höhen sind im GLB zwar untereinander erhalten, aber
   Stände, Routing und Portale bleiben nicht hallenweise an amtliche Features
   gebunden.
5. **Monolith und fehlender Offline-Cache.** Die Szene lädt nur
   `models/messe.glb`; die PWA-Globmuster umfassen derzeit weder `glb` noch
   `jpg`. Damit sind gerade Gelände-GLB und Orthofoto nicht nachweislich Teil
   des precache, obwohl Offline-First gefordert ist.

## 2. Unverändert zu erhaltende Systeme

Diese Komponenten werden erweitert, nicht ersetzt:

- `SiteScene` mit Übersicht, Hallenansicht, Laufmodus und Ego-Steuerung;
- `WalkGrid`, Layout-Patches, Gleitbewegung und Kollisionsabfrage;
- Hallenplan-Parser, Standpolygone und Ausstellerregister;
- Routinggraph, Portal- und Ebenenlogik;
- Vermessungsmodus und Kamera-Snapshots;
- lokale Datenladung und Fehler-Fallbacks;
- Orthofoto als Karte, Boden-Fallback und niedrige Qualitätsstufe;
- Vite-PWA und die bestehende Android-APK-Hülle.

Bestehende IDs für Hallen, Stände und Aussteller bleiben stabil. Die
Registrierung transformiert alle Inhalte einer Ebene gemeinsam; sie verändert
niemals Standformen relativ zueinander.

## 3. Räumlich fehlerhafte oder unvollständige Systeme

| System | Ist-Zustand | Zielzustand |
|---|---|---|
| Weltkoordinaten | globale Hallenplanwelt | lokales UTM/NHN-System mit gespeichertem Ursprung |
| Hallenregistrierung | PDF-/Plan-Fit, teils geerbt/geschätzt | je Hallenebene gegen amtliche Feature-IDs, eigener Restfehler |
| LoD2-Inventar | nur Building-Ausgabe; Parts verschmolzen | Feature-/Surface-Inventar ohne stilles Verwerfen |
| Höhen | Hallen-Metadaten und Annahmen für Ebenen | amtliche Z-Spannen plus explizit belegte Geschossflächen |
| Außenkollision | außerhalb des Grids offen bei z=0 | SurfaceProvider; unbekannt bedeutet blockiert |
| Portale | aus Layoutnähe an Hallen angebunden | semantische Verbindung zwischen expliziten Flächen |
| Umgebung | Orthofoto plus OSM-Linien/ALKIS-Flächen | Zonen A/B/C, Sichtbarkeitsklassen und mobile LODs |
| Materialien | wenige flächenweite Materialtypen | metrische, konfigurierbare Materialklassen |
| Asset-Laden | ein `messe.glb` | Manifest und räumlich getrennte Pakete |
| Diagnose | Kamera-/Vermessungshilfe | Feature-, Surface-, Material-, Sicht- und Kollisionsdiagnose |
| Offline | JSON/PNG im precache | Manifest, GLB, JPG/KTX2 und alle notwendigen lokalen Pakete |

Die gefährlichste aktuelle Regel steht in `walk.ts`: findet `footingAt` keine
Hallenebene, wird ein offener Boden auf Höhe null geliefert. Diese Regel wird
erst entfernt, wenn explizite Außen- und Übergangsflächen vorhanden sind;
andernfalls würden wir funktionierende Hallenausgänge ohne Ersatz sperren.

## 4. Konkreter Dateiplan

### Bestehende Dateien, die gezielt geändert werden

| Datei | Änderung |
|---|---|
| `tools/beuteltier/lod2.py` | generisches Feature-/Surface-Modell, BuildingPart-IDs, Attribute und z-Spannen |
| `tools/build_buildings.py` | amtlicher Ursprung statt globalem Rück-Fit; Paketbau nach Zone/Feature |
| `tools/beuteltier/gltf.py` | mehrere Pakete, Diagnose-Extras, getrennte Render-/Kollisionsausgabe |
| `tools/build_site.py` | Registrierungsausgabe je Hallenebene statt endgültiger globaler Wahrheit |
| `tools/build_graph.py` | registrierte Koordinaten und explizite Surface-/Portal-IDs |
| `tools/build_all.py` | neue Schritte und messbare Mindestwerte |
| `app/src/data/load.ts` | WorldManifest, Registrierungen, Flächen und Portale laden |
| `app/src/scene/SiteScene.tsx` | paketweises Laden, Diagnose-Layer, Qualitätszonen |
| `app/src/scene/walk.ts` | `SurfaceProvider` und blockierter Außen-Fallback |
| `app/vite.config.ts` | lokale Weltassets nach Größenprüfung precachen |

### Neue Buildmodule

- `tools/inventory_lod2.py`: vollständiges Inventar, Verlustbericht und fünf
  reale Problemfeatures.
- `tools/build_world_origin.py`: stabiler UTM/NHN-Ursprung und
  Transformationsmetadaten.
- `tools/register_halls.py`: Feature-Zuordnung, robuste hallenweise Fits,
  Anker und Restfehler.
- `tools/build_surfaces.py`: begehbare, gesperrte und Übergangsflächen.
- `tools/build_portals.py`: semantische Portale ohne Verwendung als Fit-Anker.
- `tools/analyse_visibility.py`: Sichtproben und Klassifikation
  critical/secondary/hidden.
- `tools/build_world_packages.py`: Core/Surroundings/Distant/Collision-Pakete
  und Manifest.
- `app/src/scene/surfaces.ts`: kombinierter Hallen-/Außen-SurfaceProvider.
- `app/src/scene/diagnostics.tsx`: Filter, Auswahlmarker und Metadatenpanel.

### Verbindliche Datenprodukte

Alle angeforderten JSON-Produkte werden unter `data/build/` erzeugt:

`lod2-inventory.json`, `world-origin.json`, `hall-registrations.json`,
`surface-classification.json`, `visibility-analysis.json`,
`material-classes.json`, `walkable-surfaces.json`, `portals.json` und
`world-manifest.json`.

GLBs landen paketiert unter `app/public/models/world/{core,surroundings,distant,collision}`.
Kollisionspakete enthalten keine Renderdetails. Kein Reality-Mesh-Original
wird ausgeliefert oder zur Laufzeit angefordert.

## 5. Etappenplan mit prüfbaren Zwischenergebnissen

### Etappe 1 – Bestand prüfen (dieses Dokument)

**Ergebnis:** laufende PWA, Datenfluss, zu erhaltende Systeme, bekannte
Fehler, Dateiplan und Baseline sind dokumentiert.

**Gate:** `npm run build`, `pytest`, Browserstart und Screenshots funktionieren.

### Etappe 2 – vollständiges CityGML-Inventar

**Implementierung:** Feature- und Surface-Reader generalisieren; Feature-ID,
Klasse, Funktion, z-Min/z-Max, Polygon- und Dreieckzahl ausgeben. Unsupported
Features werden mit Grund protokolliert, nie still verworfen.

**Gate:** Zählwerte stimmen mit der XML-Tag-Baseline überein; mindestens fünf
reale Problemfeatures besitzen ID und Diagnosegrund; Parser-Tests decken
Building, BuildingPart, fehlende GroundSurface und ClosureSurface ab.

### Etappe 3 – amtliches Weltmodell

**Implementierung:** stabilen Ursprung nahe Messekern festlegen und alle
LoD2-Punkte ausschließlich mit
`(X-originX, Z-originZ, -(Y-originY))` ausgeben. Diagnose-GLB und
`world-origin.json` erzeugen.

**Gate:** Stichprobenabstände und z-Spannen sind vor/nach Translation bis auf
Millimeter gleich; keine globale Hallenplantransformation steckt im GLB.

### Etappe 4 – hallenweise Registrierung

**Implementierung:** jede Ebene separat amtlichen Zielfeatures zuordnen;
Anker, Transform, `floorZ`, Status und Restfehler speichern. Danach Stände,
Grids, Graphknoten, Spawns, Labels und POIs gemeinsam transformieren.

**Gate:** jede produktive Ebene hat einen Datensatz; Abweichungen sind pro
Halle messbar; relative Distanzen innerhalb einer Halle bleiben invariant;
`draft` bleibt sichtbar und wird nicht als amtlich exakt ausgegeben.

### Etappe 5 – begehbare Kernwelt

**Implementierung:** explizite Hallen-, Piazza-, Boulevard- und
Übergangsflächen; kombinierter SurfaceProvider; Portale verbinden Surface-IDs.
Erst danach wird der offene z=0-Fallback entfernt.

**Gate:** automatisierte Laufpfade führen Halle→Ausgang→Boulevard→Eingang;
unbekannte Fläche ist blockiert; Rampen/Treppen ändern z stetig oder über ein
explizites Portal; Dächer sind nicht begehbar.

### Etappe 6 – Umgebungs- und Reality-Mesh-Analyse

**Implementierung:** lokale Analysequelle inventarisieren, Sichtproben
festlegen, LoD2-Flächen auf critical/secondary/hidden klassifizieren und
Materialreferenzen dokumentieren. Keine Laufzeit-URL entsteht.

**Gate:** jede Zone-A/B-Fläche hat Sicht- und Materialklasse samt Herleitung;
fehlende Reality-Mesh-Datei blockiert weder Build noch App.

### Etappe 7 – optimierte Umgebung

**Implementierung:** Zone-B-Sichtseiten, vereinfachte Rückseiten, Zone-C-LOD,
metrisch gekachelte Materialklassen und getrennte Kollision.

**Gate:** Silhouettenvergleich aus definierten Kameras; Dreiecke/Draw Calls
sinken gegenüber Diagnosemodell; keine uniform über alle Fassaden gestreckte
Textur.

### Etappe 8 – mobile und Offline-Optimierung

**Implementierung:** Pakete/LODs, Atlas-/KTX2-Entscheidung, Meshopt-Prüfung,
Precache und Qualitätsstufen.

**Gate:** Kaltstart offline; keine Netzanforderung für statische Welt;
Speicher-, Paketgrößen- und Draw-Call-Bericht für eine definierte
Mittelklasse-Android-Konfiguration; bestehende PWA-/APK-Schnittstelle bleibt.

## Entscheidungsregeln für alle Folgeetappen

1. Ein Datenprodukt mit `draft`, Unsicherheit oder unbekannter Klassifikation
   bleibt genau so gekennzeichnet.
2. Keine synthetische Höhe, kein Portal und keine begehbare Fläche wird aus
   visueller Plausibilität erfunden.
3. Portalzahlen und Portalpositionen sind niemals Registrierungsanker.
4. Eine Etappe wird erst als erledigt markiert, wenn Build, Tests, Viewer und
   ihr eigenes Gate bestanden sind.
5. Binäre Weltpakete werden erst eingecheckt, wenn Herkunft, reproduzierbarer
   Builder, mobile Größenmessung und Offline-Manifest gemeinsam vorliegen.
