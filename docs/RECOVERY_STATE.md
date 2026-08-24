# Recovery State — SHADED + BEUTELTIER

Stand: 2026-08-24. Harte Grenze: 2026-08-26 07:00 Europe/Berlin.

Autoritative Ausgangsstaende:

- SHADED `origin/main`: `732c24b98e304f3278b76e82dd164467497e60c3`
- BEUTELTIER `origin/main`: `963251a004090450055c27454c175d744f58547b`
- SHADED Recovery: PR [#73](https://github.com/Lootziffer666/SHADED/pull/73)
- BEUTELTIER Recovery: Branch `recovery/wednesday-corridor`, PR
  [#43](https://github.com/Lootziffer666/BEUTELTIER/pull/43)

## NOW

Die Android-Bilder des letzten Previews widerlegen dessen visuelle Freigabe:
Ego startete unbenutzbar in der groesseren Halle 10.2, Touch wurde vom Browser
mitbehandelt, bekannte Aussenflaechen waren ausserhalb Ego ausgeblendet und das
Weitbereichs-DGM enthielt trotz plausibler Werte falsche Pixel. Der lokale
Reparaturkandidat basiert auf PR-Head `0d522cb`: native DGM1-Kacheln,
Eingangsebenen-Start, exklusive Touch-Steuerung sowie sichtbare gemessene
Piazza-/Boulevard-/9-10-Flaechen. Vollaufbereitung, 150 Python-Tests,
304 Frontendtests, TypeScript und beide Produktionsbuilds sind gruen. Ein
neuer Vercel-/Android-Sichttest steht noch aus; vorher ist nichts visuell
freigegeben.

## PROVEN WORKING

### BEUTELTIER

- `origin/main` wurde vor der Schreibphase erneut geprueft und steht weiterhin
  auf `963251a004090450055c27454c175d744f58547b`.
- 21 amtliche DOP-Kacheln (2025), 21 amtliche LoD2-Kacheln und DGM1 fuer
  `EPSG:25832`-Bounds `[355000,5644000,362000,5647000]` wurden real geladen.
  Rohdaten bleiben wegen zusammen ueber 1 GB ausserhalb normaler Code-PRs;
  Fetcher, Quellenmetadaten und Webprodukte sind reproduzierbar im Branch.
- Das nordgerichtete Orthofoto ist 8192 x 3511 px, 8.747.765 Byte und deckt
  7 x 3 km ohne quadratische Streckung ab (0,854 m/px Webprodukt). Sichtpruefung
  des Bildes belegt Rhein, Innenstadt, Bahnhof/Deutz, Messe und A3 im selben
  Mosaik.
- Das Terrain enthaelt 211.001 reale DGM-Samples im 10-m-Mobilraster
  (amtliche 1-m-Quelle), 37,43 bis 81,46 m NHN. Der Generator ruft 21
  1-km-Kacheln in nativer 1-m-Aufloesung ab und nimmt erst lokal jeden zehnten
  Punkt. Alle gemeinsamen Randpunkte werden auf 5 cm geprueft. Kontrollwerte:
  Piazza 45,961 m NHN, Eingang Sued 45,993 m NHN.
- Das erzeugte Terrain besitzt 403.996 gueltige Dreiecke. 8.002 Rasterzellen
  sind nur dort entfernt, wo 2.567 amtliche LoD2-`GroundSurface`-Flaechen des
  aktiven Messeausschnitts liegen. Quelle, Bounds, Verfahren und Anzahl stehen
  in `terrain-wide.json` und im GLB; der Browser erhaelt diese Maske unter dem
  bestehenden Laufzeitnamen `data/terrain.json` unveraendert.
- Das vorherige 5-m-Kernartefakt `data/build/terrain.json` ist bytegenau auf
  `origin/main` zurueckgestellt. Es bleibt als historisches Buildprodukt
  erhalten und wird nicht als aktive oder korrigierte Laufzeitquelle
  ausgegeben. Der Weitbereichsbau kann es nicht mehr ueberschreiben.
- Registrierte Orthofoto-, OSM- und ALKIS-Layer werden nicht ein zweites Mal
  transformiert. Registriertes Orthofoto ohne belegte Szenenecken bricht ab.
- Die Fake-Skyline war ein unvollstaendiger hartcodierter Zylinder/Stub und
  ist aus Runtime, Manifest und Build entfernt. Es wird keine Fernkulisse als
  vermessen ausgegeben.
- Der bestehende reale Korridor Bahnhofsausgang Ottoplatz -> Eingang Sued
  besteht aus dem eingecheckten OSM-Snapshot (33 Knoten, 479,3 m). Der weitere
  Graph erreicht Halle 10.1; unbestaetigte Venue-Verbindungen bleiben gelb
  und als unbestaetigt bezeichnet.
- Registrierte Weltpakete sind undurchsichtig; Staende starten ausgeschaltet
  und sind zuschaltbar. Eine gewaehlte Halle kann ueber ihre amtlichen
  Feature-IDs hervorgehoben werden. Der Standard-Cel-Look und seine schwarze
  Invert-Hull-Kontur sind deaktiviert.
- Kartenkamera kann verschoben werden; Presets setzen Kamera und Ziel neu.
  Der Reparaturkandidat startet Ego ohne Ziel auf Ebene 1 und setzt fuer den
  Canvas `touch-action: none`. Das ist durch Komponenten-/Logiktests, noch
  nicht durch den ausstehenden Mobilbildnachweis belegt.
- 304 Frontend-Tests, 150 Python-Pipeline-Tests, TypeScript und beide
  Produktionsbuilds bestehen. Die gebauten kritischen Assets antworten lokal
  mit HTTP 200 und exakt ihren erwarteten Dateigroessen.
- Das 8,75-MB-Luftbild und GLBs blockieren die PWA-Installation nicht. Der
  erzeugte Service Worker nutzt fuer Weltassets `NetworkFirst` und neue
  v2-Caches: online gewinnt das aktuelle Deployment, offline nur der letzte
  erfolgreiche Abruf. Vorher wird keine Offline-Verfuegbarkeit behauptet.
- Das bisherige Vercel-Preview startet ohne weissen Bildschirm. Korridor-Schalter,
  Route (901 m / 16 min) und Begehen-Schalter reagieren; die ausgelieferte
  Terrain-Metadatei belegt das 701-x-301-Weitraster und die 8.002 maskierten
  Zellen. Das ist ein DOM-/Daten-PASS, kein WebGL-Bild-PASS.

### SHADED

- Der belegte aktive Pfad bleibt: bereitgestelltes RGB plus relative
  8-Bit-Companion-Tiefe -> `POINTS`; Quell-RGB erreicht die Punkte.
- Tiefe bleibt relativ/nichtmetrisch, Kamera bleibt angegeben oder sichtbar
  angenommen, Zuverlaessigkeit bleibt `UNKNOWN`, wenn die Quelle keine liefert.
- Registrierung und Fusion melden `performed:false`; es gibt keinen falschen
  Erfolg. Die aktive Darstellung nennt `VIEW POINTS · STATE VOXELS`.
- Regen, Naesse, Pfuetzen, Wind, Feuer, Schnee, Vegetation und persistenter
  Weltzustand bleiben in ihren aktiven Aufruf-/Shaderpfaden erhalten.

## CAPABILITY MAP

| Faehigkeit | Status | Autoritativer Beleg |
|---|---|---|
| SHADED Bild + Weltgesetze | REAL + ACTIVE | `index.html -> runtime/shaded-engine.mjs` |
| SHADED RGB + Companion-Tiefe -> Punkte | PARTIAL | echte RGB-Punkte; keine metrische Tiefe/Provider-Kalibrierung |
| SHADED Registrierung / Fusion | DEAD | im Hauptweg `performed:false` |
| SHADED Voxelzustand | REAL + ACTIVE | `spatial-navigation.mjs -> sparse-voxel-world.mjs` |
| SHADED Mesh-Extraktion | REAL + UNUSED | getestet, aktiver Viewer zeichnet keine Dreiecke |
| SHADED Providerkatalog | REAL + UNUSED / SIMULATION / STUB gemischt | Bibliothek, nicht Mittwoch-Backlog |
| BEUTELTIER registrierte Hallenwelt | REAL + ACTIVE | `registered-site.json`, amtliche Weltpakete |
| Bahnhof -> Eingang Sued | REAL + ACTIVE | Dijkstra aus OSM-Snapshot |
| Eingang Sued -> Halle 10.1 | PARTIAL | durchgaengiger Graph; Venue-Abschnitt unbestaetigt |
| DOP-Aussenwelt 7 x 3 km | REAL + ACTIVE auf Recovery-Branch | 21 DOP-Kacheln, registriertes 8192-x-3511-Webprodukt |
| DGM-Aussenwelt 7 x 3 km | REAL + ACTIVE auf Recovery-Branch | 211.001 Samples, reale LoD2-Gebaeudemaske |
| LoD2-Daten 7 x 3 km | REAL + UNUSED ausserhalb Kern | 21 Kacheln beschafft; Runtimepakete noch Kernbereich |
| Fassadenbilder | BROKEN + UNUSED | vorhandene Dateien sind nicht belastbar den Hallen zugeordnet |
| Browserdarstellung dieses Builds | UNKNOWN | Build/HTTP gruen; lokaler Chromium-Download blockiert |

## BROKEN / FAKE / DEAD

- Die neue Szene hat noch keinen WebGL-Bild-PASS. Die letzten Android-Bilder
  sind ein echter FAIL fuer Ego-Start und Aussenhoehen. Der lokale Browserlauf
  kann nicht ersetzen: kein Chromium vorhanden, und der Browserdownload wird
  in dieser Laufzeit als leeres/abgeschnittenes Archiv geliefert.
- Der alte einzelne 7-x-3-km-WCS-Abruf war BROKEN: an der Piazza lieferte er
  rund 66 m NHN statt rund 46 m. Zusaetzlich konnte der alte Multipart-Parser
  TIFF-Nutzdaten an einem zufaelligen `--` abschneiden. Beide Pfade sind durch
  native Kacheln, echten TIFF-Decoder, Randpruefung und Abbruchtests ersetzt.
- Die bereits beschafften weiteren LoD2-Gebaeude westlich des Rheins und bis
  A3 sind noch nicht in die mobilen Runtimepakete uebernommen. Der aktive
  LoD2-Ausschnitt bleibt `[357700,5645200,358900,5646500]`.
- Reale DGM-Hoehe und LoD2-Gebaeudeunterkante widersprechen sich lokal, z. B.
  bei Halle 10 um rund 7,5 m. Deshalb wird DGM dort nicht gerendert; es wird
  keine erfundene Sockelfassade zwischen den Quellen erzeugt.
- Boulevard, gemessene Piazza-Plattform, Aussenflaechen 9/10 und Ego-Steuerung
  wurden im Reparaturkandidaten korrigiert, sind bis zur neuen Mobilpruefung
  weiterhin `UNKNOWN`, nicht `PROVEN WORKING`.
- Waende besitzen keine belastbaren Fototexturen. Daecher und Terrain duerfen
  das reale Senkrechtluftbild tragen; eine Wandtextur daraus waere falsch.
- SHADED besitzt im Haupt-UI keinen ausfuehrbaren Tiefenprovider und keinen
  ehrlichen metrischen Rekonstruktions-, Registrierungs- oder Fusionspfad.
- Der gemischte SHADED-Provider-/Benchmarkbestand enthaelt Simulationen,
  `would do` und falsche PASS-Logik; er bleibt ausserhalb des Produktpfads.
- Der volle 21-Kachel-Diagnosebau sieht 5.892 LoD2-Features ohne semantische
  Flaechen, die nicht raeumlich gefiltert werden koennen. Die dadurch auf
  mehrere MB anwachsenden Sichtbarkeitsdiagnosen werden nicht in den
  Mittwoch-PR gezogen und nicht als verortete Welt ausgegeben.

## WEDNESDAY PATH

1. Neuen PR-Preview auf einem WebGL-faehigen Mobilgeraet pruefen: kein weisser
   Bildschirm; Luftbild bis Rhein/A3; Hallen nicht im/unter Terrain; keine
   Fake-Kontur; Kamera verschiebbar; Presets und Touch-Begehen reagieren.
2. Nur beobachtete Restfehler korrigieren. Keine weitere Forschungs- oder
   Providerarbeit beginnen.
3. PR #43 bei gruenen Checks und bestandenem Sichttest mergen; danach nur den
   Bahnhof -> Eingang Sued -> Halle-10.1-Korridor demonstrieren.

## PARKED

- Vollstaendige mobile Paketierung aller 21 beschafften LoD2-Kacheln und echte
  Fassaden-/Skyline-Rekonstruktion.
- Integration des SHADED-Provider-/Paper-Katalogs und neue Provider.
- Ausbau von `Can THEY Run It?`; vorhandene Benchmarkdaten bleiben erhalten.
- SHADED-Mesh-Viewer, weitere Weltgesetze und Aufraeumen toter Spatial-Pfade.

## DECISIONS NEEDED

Keine fuer den aktuellen Korridor. Fuer 2027 muss entschieden werden, ob der
Abschnitt Eingang Sued -> Piazza vor Ort vermessen oder dauerhaft als
beobachteter, unbestaetigter Korridor gefuehrt wird.
