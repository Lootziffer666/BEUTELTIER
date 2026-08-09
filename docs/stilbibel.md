# BEUTELTIER — Stilbibel v1

*Stilisierte Erinnerungsarchitektur: Kölnmesse im Cel-Shading-Look, räumlich
treu, visuell bereinigt.*

Dieses Dokument ist die Vorgabe. Der Code setzt sie um, nicht umgekehrt —
`app/src/scene/stil.ts` führt die Materialfamilien und Konturstufen als
Register, und `app/src/scene/stil.test.ts` prüft, dass sie zu dem passen, was
hier steht.

## Leitidee

BEUTELTIER soll **nicht** aussehen wie ein GIS-Viewer, eine sterile
Archviz-Demo, ein fotorealistisches Messemodell mit tausend halbrichtigen
Details oder ein abstrahiertes Low-Poly-Spielzeug.

Es soll aussehen wie eine **begehbare, stilisierte, glaubwürdige
Erinnerungswelt der Kölnmesse**: Architektur und Wege bleiben treu, visuelles
Rauschen wird entfernt, wichtige Merkmale werden betont, der Raum ist lesbar.

## Die fünf Kernprinzipien

1. **Raumwahrheit vor Oberflächenwahrheit.** Proportion, Höhenbezug,
   Blickachsen, Wegeführung, Landmarken, Hallenbeziehungen und
   Innen-/Außen-Übergänge zählen mehr als fotoreale Materialien. Wenn ein Ort
   räumlich stimmt, darf die Oberfläche stilisiert sein.
2. **Wiedererkennbarkeit durch Silhouette und Struktur.** Eine Halle erkennt
   man an Masse, Fassade, Fensterbändern, Eingängen, Rampen, Vordächern und
   Beschilderung — nicht an tausend Texturdetails.
3. **Bereinigte Realität.** Weg: zufällige Menschenmengen, Messedreck ohne
   Orientierungswert, temporäre Absperrbänder, Standgewimmel, Werbeflut.
   Bleibt: dauerhafte Architektur, dauerhafte Leitsysteme, räumliche Marker,
   echte Ein- und Ausgänge, Geländegrenzen, Zäune, Baumgruppen, Treppen.
4. **Grafische Lesbarkeit vor Realismus.** Klare Flächen, klare Kanten, klare
   Kontraste, wenige starke Materialfamilien — besonders auf Mobile.
5. **Spielbare Architektur.** Die Welt ist Werkzeug, nicht Kulisse. Der Stil
   muss Orientierung, Editieren, Markieren, Ergänzen und Vergleichen erlauben.

## Was „Borderlands-artig" heißt

Inspiration, keine Kopie.

**Übernommen:** Cel Shading mit gestuften Lichtwerten, dunkle prägnante
Konturen, sichtbare Materialzeichnung, klare Formtrennung, leicht „inkige"
Oberfläche, glaubwürdige aber stilisierte Tiefe.

**Nicht übernommen:** Schrottplatzästhetik, chaotische Oberflächen,
Kritzelstrukturen, hyperaggressiver Comic-Noise, Verformung der Architektur,
permanente Überinszenierung.

Kurz: weniger Mad-Max-Exzess, mehr präzise Comic-Architektur.

## Geometrie

**Muss treu bleiben:** Hallenabmessungen, Gebäudehöhen, Rampenverläufe,
Treppen- und Rolltreppenlagen, Öffnungen und Portale, Unterführungen, Brücken
und Decks, Boulevardbezüge, markante Dachformen, Außenkanten.

**Darf stilisiert werden:** Fugenrhythmus, Fassadenfeinheiten,
Montagedetails, Mikroarchitektur, kleinere technische Anbauten,
Oberflächenunregelmäßigkeiten.

**Darf vereinfacht werden:** Deckenraster, sekundäre Glasunterteilungen,
unwichtige Türserien, wiederholte Fassadenmodule, generische Innenwände.

## Shading

Zwei bis drei Hauptlichtstufen pro Material, sauber getrennte Schattenzonen,
dunkle Konturlinien, keine superweichen PBR-Verläufe als Hauptsprache.

Schatten sollen Form erklären, nicht schmutzig machen. Innen klarere
Kontraste, außen sonnige, gut lesbare Flächenteilung.

### Konturstufen

Linien sind **nicht überall gleich dick**. Umgesetzt als `KONTUR_M` in
`stil.ts`, in Metern Hüllenabstand:

| Stufe | Meter | Für |
|---|---|---|
| stark | 0,12 | Türen, Treppen, Rolltreppen, Geländer, Zäune, Baumkanten, Schilder, Hallenkanten, Öffnungen, Plattformkanten |
| mittel | 0,05 | Wände, Bodenplatten, Fassadensegmente, Fensterrahmen |
| schwach | 0,02 | große glatte Flächen, entfernte Nebengebäude, sekundäre Details |
| keine | 0 | ausdrücklich linienlos |

Die Stärke ist Weltmaß und kein Pixelwert: eine Tür behält ihre Linie beim
Herangehen, und ab 150 m nimmt sie ab, ab 400 m ist sie weg
(`konturStaerke()`).

## Materialfamilien

Keine hundert Einzelmaterialien, sondern zehn Familien. Jede hat Grundton,
zwei bis drei Helligkeitsstufen, Konturstärke und eine Glanzregel. Umgesetzt
als `FAMILIEN` in `stil.ts`.

| ID | Name | Für |
|---|---|---|
| M01 | WALL_LIGHT | helle Hallen- und Foyerwände, Boulevard, Innenwände |
| M02 | STRUCTURE_DARK | Stützen, Deckenträger, dunkle Hallenstruktur |
| M03 | FLOOR_DARK | dunkle Messehallenböden |
| M04 | FLOOR_LIGHT | Foyer- und Boulevardböden |
| M05 | OUTDOOR_CONCRETE | Plätze, Vorflächen, Außengelände |
| M06 | WOOD_DECK | Terrassen, Aufenthaltsdecks, Pflanzinseleinfassungen |
| M07 | GLASS_COOL | Fassaden, Glasgeländer, Rolltreppenseiten |
| M08 | METAL | Handläufe, Geländer, Rolltreppenkanten |
| M09 | VEGETATION | Baumkronen und Sträucher |
| M10 | SIGNAGE | Hallennummern, Leitsystem, Wegweiser, Editormarker |

Wer eine elfte Familie braucht, hat meistens eine der zehn nicht gefunden.
Nachbargebäude sind keine Familie — sie sind Hintergrund und bleiben gedeckt.

## Farbdramaturgie

Die Architektur bleibt überwiegend ruhig und neutral: Beton- und Steintöne,
dunkle Böden, Glasblau, Stahl, warme Holzdecks.

Farbe wird **bewusst** eingesetzt für Hallenkennzeichnung, Leitsysteme,
wichtige Ziele, Editierobjekte und interaktive Marker. Verboten: viele
knallige Farben gleichzeitig, zufällige Buntheit, aggressive Sättigung auf
großen Flächen.

## Innenräume

Geräumig, funktional, leicht roh, klar strukturiert, glaubwürdig entschlackt.
Wichtig sind dunkle Böden, Stützenraster, Deckenraster und Lichtbänder,
Fluchtwegzeichen, Rolltreppen und Zugänge.

Innenräume dürfen leerer sein als in echt. Das ist kein Fehler, sondern
Methode: Leere macht Achsen, Breiten, Wege und Größenordnung sichtbar.

## Außenräume

Erkennbar machen: Platzgröße, Hallenzuschnitte, Aufenthaltsflächen, Übergänge,
Zäune, Brücken und Unterführungen, Baumgruppen, Eingänge.

Saubere große Flächen, klare Kanten, deutliche Pflanzinseln, Holzdecks warm
und grafisch, Himmel stilisiert aber nicht kitschig.

## Vegetation, Glas, Beschilderung

**Vegetation** ist Landmarke, nicht Botanik-Simulation: markante
Kronensilhouette, klare dunkle Außenkante, innen flächig gestuft.

**Glas** ist wichtig, weil die Messe viel über Glasräume funktioniert: leicht
bläulich, kontrollierte Reflexion, deutlich lesbare Rahmen, erkennbare
Raumtiefe. Nicht spiegelnd wie Sci-Fi, nicht milchig und tot.

**Beschilderung** ist Navigationsanker, nicht Deko. Hallennummern,
Richtungsweiser und Ausgänge bleiben klar und typografisch lesbar.
Hallennummern gehören als Objekte in die Welt, nicht in die Textur.

## Detailhierarchie

- **A (hoch):** Eingänge, Türen, Rolltreppen, Treppen, Beschilderung,
  Geländer, Zäune, Hallennummern, wichtige Bäume.
- **B (mittel):** Fassaden, Fensterbänder, Stützen, Plätze, Böden, Vordächer,
  Kioske.
- **C (niedrig):** ferne Nebengebäude, generische Dachtechnik, monotone
  Hallenrückseiten, unwichtige Wiederholungen.

## Licht

Nicht realistisch, sondern räumlich erklärend. Innen klare Lichtbänder,
starke Bodenreflexe, Tiefe durch Hell-Dunkel-Achsen. Außen klare
Tageslichtsituation mit definierten Schlagschatten — kein graues Matschlicht.

## Menschen

Standard: keine oder sehr wenige stilisierte Platzhalter. Menschen erzeugen
Unruhe, verdecken Raum und verschlechtern die Orientierung. Sie gehören in
Promo-Szenen und Showcase-Bilder, nicht in die Kernwelt.

## Edit-Modus

Der Stil muss mit dem Edit-Modus harmonieren: klare Kanten, sichtbare
Kontaktpunkte, „snapbar" wirkende Böden und Wände. Aktive Objekte bekommen
einen Kontrastschub — als hellere und dickere Kontur (`EDIT_KONTUR`), nicht
als eigene Farbe auf der Fläche. Der Edit-Modus ist kein Fremdkörper, sondern
dieselbe Sprache eine Stufe lauter.

## Das Stilgesetz

> Räumlich ehrlich. Visuell entschlackt. Grafisch kraftvoll. Immer lesbar.
