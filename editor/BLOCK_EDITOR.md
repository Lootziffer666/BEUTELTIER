# BEUTELTIER Block Editor 5

`BEUTELTIER_Block_Editor_v5.html` ist der Blockeditor aus Version 4, erweitert
um eine Sache: **er lädt, was die App gebaut hat.**

Datei im Browser öffnen — mehr ist nicht nötig. Der Bauplan ist in der HTML
eingetragen und wird beim Start geladen. Three.js kommt weiterhin über ein CDN,
dafür braucht es eine Internetverbindung.

## Was geladen wird

| Gruppe | Inhalt |
|---|---|
| `Hallenplatten` | Boden- und Deckenplatte jeder Halle, aus den eingemessenen Umrissen |
| `Marken Halle 6.1` … `9.1` | die Markenstände als Quader in Hausfarbe, dazu die Hängebanner |
| `Boulevard Nord` | Boden, Dach, Oberlicht, massive Wandabschnitte, Glasflächen, Südwand mit zwei Doppeltüren, vier Wegweiser, drei Treppenläufe mit Podesten, zwei Rolltreppen |

Alles sind **echte Editierobjekte**: verschieben, drehen, skalieren, färben,
löschen, duplizieren. Kein importiertes GLB, das man nur als Ganzes anfassen
kann.

- **Alles laden** ersetzt die Szene durch den kompletten Bauplan.
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
  `BEUTELTIER_Block_Editor_v5.html`

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
- **Halle 5 und 10** liegen jenseits der 235 m Boulevard und sind dort nicht
  gebaut; ihre Hallenplatten sind trotzdem enthalten.
