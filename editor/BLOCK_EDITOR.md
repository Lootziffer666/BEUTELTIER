# BEUTELTIER World Builder 6

`app/world-builder.html` ist der World Builder 6. Er startet nicht mehr
mit der gesamten Messe, sondern mit der kleinsten brauchbaren Arbeitswelt:

- 1.132,8 × 1.132,8 m Asphalt (der echte Luftbildausschnitt)
- das entzerrte Geobasis-NRW-Luftbild von 2025 als transparente Bodenfolie
- der Nordboulevard als **eine** gemeinsam bewegliche Baugruppe
- Begehung mit Kollision, Bauen und Abbauen in 1-m-Schritten

Der alte Pfad `editor/BEUTELTIER_Block_Editor_v5.html` leitet weiter, damit
bestehende Links nicht brechen.

Am zuverlässigsten wird das Repository lokal über einen kleinen Webserver
geöffnet, damit das vorhandene Luftbild geladen werden darf. Three.js kommt
weiterhin über ein CDN, dafür braucht es eine Internetverbindung.

```bash
cd app && npm run dev
# dann den World Builder über „🧱 Bauen“ öffnen
```

## Der neue Arbeitsablauf

1. Die Deckkraft der Kartenfolie so einstellen, dass Dachkanten und Bauteile
   gleichzeitig sichtbar sind.
2. `Nordboulevard wählen`, die gesamte Baugruppe verschieben und drehen.
3. `Verankern`. Danach kann weder der Transform-Gizmo noch der Kloppen-Modus
   den Boulevard versehentlich verschieben oder löschen.
4. `Begehen`: WASD/Shift am Desktop, Bildschirmtasten und Wischblick auf Touch.
   Linksklick nutzt das gewählte Werkzeug, Rechtsklick das jeweilige Gegenteil.
5. Mit 1-m-Steinen bauen, mit der Spitzhacke wieder abbauen, Projekt im Browser
   oder als `.beuteltier.json` sichern.

Ein eigenes Kartenbild kann die Standardfolie ersetzen. Position, Außenmaß,
Drehung, Sichtbarkeit und Deckkraft bleiben editierbar und werden im
Projektformat v5 mitgespeichert.

## Was geladen wird

| Gruppe | Inhalt |
|---|---|
| `Hallenplatten` | Boden- und Deckenplatte jeder Halle, aus den eingemessenen Umrissen |
| `Marken Halle 6.1` … `9.1` | die Markenstände als Quader in Hausfarbe, dazu die Hängebanner |
| `Boulevard Nord` | Boden, Dach, Oberlicht, massive Wandabschnitte, Glasflächen, Südwand mit zwei Doppeltüren, vier Wegweiser, drei Treppenläufe mit Podesten, zwei Rolltreppen |

Alles sind **echte Editierobjekte**: verschieben, drehen, skalieren, färben,
löschen, duplizieren. Kein importiertes GLB, das man nur als Ganzes anfassen
kann.

- **Neue Welt** ersetzt die Szene durch den Nordboulevard als Baugruppe.
- **Alles laden** ersetzt die Szene weiterhin durch den kompletten Bauplan.
- **Gruppe dazu** legt eine einzelne Gruppe obendrauf.
- **Bauplan-Datei** lädt eine neu erzeugte `bauplan.json` statt der eingebauten.

Das alte Startmodell (`Startmodell`-Knopf) liegt in einem anderen Nullpunkt und
passt nicht zum Bauplan. Deshalb lädt der Editor beim Start entweder das eine
oder das andere, nie beides.

## Maße und Nullpunkt

Meter, wie in der App. Der Nullpunkt ist die Mitte aller Hallenumrisse
(`siteCentre`), er steht als `centre` in `bauplan.json`. X entspricht Gelände-X,
Z ist Gelände-Y mit umgekehrtem Vorzeichen, Y ist die Höhe über Hallenniveau.
Die Drehung um die Hochachse steht in Grad — das Gelände ist eingemessen, die
Hallen stehen um rund 31° gedreht.

## Bauplan neu erzeugen

Der Bauplan ist erzeugt, nicht gepflegt. Wird an der Szene etwas geändert,
zieht er mit:

```bash
cd app
npm run bauplan
```

Das Skript lädt `src/scene/bauplan.ts` mit Vite direkt in Node — also denselben
Quelltext, mit dem die App rendert — und schreibt zwei Dinge:

- `editor/bauplan.json`
- denselben Inhalt zwischen die Marken `/*BAUPLAN*/ … /*/BAUPLAN*/` in
  `app/world-builder.html`

Der Abschnitt zwischen den Marken ist generiert und wird bei jedem Lauf
überschrieben. Von Hand geändert wird dort nichts.

## Grenzen

- **Vereinfachungen.** Die Treppe steht in der Szene als 45 Stufenquader; im
  Bauplan sind es drei Gefällekörper und zwei Podeste. Die Rolltreppen sind
  Rampen ohne Stufenband, Balustrade und Handlauf. Die Wegweiser sind weiße
  Tafeln ohne Beschriftung, die Markenstände Quader ohne Schriftzug: der Editor
  kennt Farbe und Deckkraft, keine Texturen.
- **Einbahnstraße.** Was im Editor verschoben wird, geht nicht automatisch in
  die App zurück. Der Weg zurück führt über `GLB Hülle` oder `GLB Module` und
  von dort in den Szenenaufbau — von Hand.
- **Begehung bleibt ein Bauprüfer, kein Character-Controller.** Der Spieler
  läuft auf Hallenniveau; Gefälle und Treppen sind sichtbar und kollidieren,
  aber noch nicht als begehbare Höhenprofile ausgewertet.
- **Halle 5 und 10** liegen jenseits der gebauten 285 m Boulevard und sind dort nicht
  gebaut; ihre Hallenplatten sind trotzdem enthalten.

## Woher die Boulevard-Geometrie kommt

Die Wandabschnitte am Nordboulevard sind nicht geschätzt, sondern gemessen:
`tools/build_boulevard.py` projiziert die amtlichen Gebäudeumrisse aus dem
LoD2-Modell der Geobasis NRW auf die Gangachse und schreibt daraus
`app/public/data/boulevard.json`. Wo ein Gebäude an den Gang heranreicht,
steht eine Wand; wo keines steht, ist verglast. Welche Halle welches Gebäude
ist, steht in `hall-registrations.json`; die Namen der übrigen Gebäude kommen
aus OpenStreetMap.

Reihenfolge beim Neuaufbau:

```bash
python3 tools/build_boulevard.py   # misst den Gang neu
cd app && npm run bauplan          # überträgt ihn in den Editor
```
