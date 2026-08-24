# Recovery State — SHADED + BEUTELTIER

Stand: 2026-08-24. Harte Grenze: 2026-08-26 07:00 Europe/Berlin.

Autoritative Ausgangsstaende:

- SHADED `origin/main`: `732c24b98e304f3278b76e82dd164467497e60c3`
- BEUTELTIER `origin/main`: `963251a004090450055c27454c175d744f58547b`
- SHADED Recovery: PR [#73](https://github.com/Lootziffer666/SHADED/pull/73)
- BEUTELTIER Recovery: Branch `recovery/wednesday-corridor`, PR
  [#43](https://github.com/Lootziffer666/BEUTELTIER/pull/43)

## NOW

PR #43 wird aus dem roten Zustand zurueckgeholt. Der alte Actions-Cache hatte
nur vier Rohdatenkacheln und liess die neuen Fetcher trotzdem aus; die
World-Builder-Akzeptanz verlangte zugleich eine Gizmo-Groesse, der der aktive
Editor absichtlich widerspricht. Beide Vertraege sind lokal korrigiert. Der
vollstaendige 21+21-Kachel-Bau, 146 Python-Tests, 303 Frontendtests,
TypeScript und beide Produktionsbuilds sind gruen. Remote-Checks und ein
WebGL-Sichttest des neuen Deployments stehen noch aus.

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
  (amtliche 1-m-Quelle), 40,92 bis 81,58 m NHN. Der WCS liefert Nord zuerst;
  der Generator dreht die Zeilen jetzt genau einmal auf einen Suedwest-Ursprung.
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
  Touch-Begehen besitzt getrennte Bewegungs- und Blickbereiche. Das ist durch
  Komponenten-/Logiktests, noch nicht durch den ausstehenden Mobilbildnachweis
  belegt.
- 303 Frontend-Tests, 146 Python-Pipeline-Tests, TypeScript und beide
  Produktionsbuilds bestehen. Die gebauten kritischen Assets antworten lokal
  mit HTTP 200 und exakt ihren erwarteten Dateigroessen.
- Das 8,75-MB-Luftbild und GLBs blockieren die PWA-Installation nicht. Der
  erzeugte Service Worker nutzt fuer Weltassets `NetworkFirst` und neue
  v2-Caches: online gewinnt das aktuelle Deployment, offline nur der letzte
  erfolgreiche Abruf. Vorher wird keine Offline-Verfuegbarkeit behauptet.

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

- Die neue Szene hat noch keinen WebGL-Bild-PASS. Der lokale Build ist gruen,
  aber der externe Browser darf den lokalen HTTP-Port nicht oeffnen. Ein
  Build-PASS wird nicht als Sichtnachweis ausgegeben; geprueft wird das neue
  oeffentliche Preview nach dem Push.
- Die bereits beschafften weiteren LoD2-Gebaeude westlich des Rheins und bis
  A3 sind noch nicht in die mobilen Runtimepakete uebernommen. Der aktive
  LoD2-Ausschnitt bleibt `[357700,5645200,358900,5646500]`.
- Reale DGM-Hoehe und LoD2-Gebaeudeunterkante widersprechen sich lokal, z. B.
  bei Halle 10 um rund 7,5 m. Deshalb wird DGM dort nicht gerendert; es wird
  keine erfundene Sockelfassade zwischen den Quellen erzeugt.
- Boulevard, bekannte Aussenflaechen und Ego-Steuerung wurden korrigiert, sind
  nach den letzten Nutzerbildern aber bis zur neuen Mobilpruefung weiterhin
  `UNKNOWN`, nicht `PROVEN WORKING`.
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

1. PR #43 pushen und beide zuvor roten GitHub-Checks gruen belegen.
2. Neuen PR-Preview auf einem WebGL-faehigen Browser pruefen: kein weisser
   Bildschirm; Luftbild bis Rhein/A3; Hallen nicht im/unter Terrain; keine
   Fake-Kontur; Kamera verschiebbar; Presets und Touch-Begehen reagieren.
3. Nur beobachtete Restfehler korrigieren. Keine weitere Forschungs- oder
   Providerarbeit beginnen.
4. PR #43 bei gruenen Checks und bestandenem Sichttest mergen; danach nur den
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
