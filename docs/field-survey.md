# Was vor Ort gemessen werden muss

Erzeugt von `tools/build_accuracy_report.py` aus dem verbleibenden Fehler
des letzten Baus. Die Reihenfolge ist die Reihenfolge des Nutzens.

## 1. Hallenlagen einmessen

Diese Hallen stehen auf **±27.0 m** genau. Das ist der groesste verbleibende Fehler der Karte.

Gebraucht werden je Halle **drei bis vier Punkte**, deren Lage sich
eindeutig benennen laesst -- Gebaeudeecken oder Standecken mit Standcode.
Drei Punkte legen Drehung und Verschiebung fest, der vierte prueft nach.

- **1.2** — Ecken des belegten Bereichs, moeglichst weit auseinander. Der belegte Bereich weicht um -15.0 % von der offiziellen Flaeche ab.
- **3.2** — Ecken des belegten Bereichs, moeglichst weit auseinander. Der belegte Bereich weicht um -2.2 % von der offiziellen Flaeche ab.
- **F2** — Ecken des belegten Bereichs, moeglichst weit auseinander.
- **F8** — Ecken des belegten Bereichs, moeglichst weit auseinander.
- **FB** — Ecken des belegten Bereichs, moeglichst weit auseinander.

## 2. Durchgaenge einmessen

Bei diesen Verbindungen liegt die Lage aus der Layout-Tabelle weit vom
naechsten Gangpunkt entfernt. Dass es sie gibt, ist belegt; wo genau,
nicht. Gebraucht wird **je Seite ein Punkt**: wo man die eine Halle
verlaesst und wo man die andere betritt.

- **Durchgang H1 H5 (1.2 ↔ 5.1)** (1.2 ↔ 5.1) — derzeit 372 m Anschlussweite
- **Durchgang H1 H5 (1.2 ↔ 5.2)** (1.2 ↔ 5.2) — derzeit 372 m Anschlussweite
- **Durchgang H1 H4 (1.2 ↔ 4.2)** (1.2 ↔ 4.2) — derzeit 330 m Anschlussweite
- **Durchgang H1 H4 (1.2 ↔ 4.1)** (1.2 ↔ 4.1) — derzeit 330 m Anschlussweite
- **Durchgang Halle 3 zu 4 (3.2 ↔ 4.1)** (3.2 ↔ 4.1) — derzeit 85 m Anschlussweite
- **Durchgang Halle 3 zu 4 (3.2 ↔ 4.2)** (3.2 ↔ 4.2) — derzeit 85 m Anschlussweite
- **Passage 2-4 (2.1 ↔ 4.1)** (2.1 ↔ 4.1) — derzeit 76 m Anschlussweite
- **Passage 2-4 (2.2 ↔ 4.2)** (2.2 ↔ 4.2) — derzeit 70 m Anschlussweite

## 3. Ebenenwechsel verorten

Aufzuege und Rolltreppen sitzen derzeit rechnerisch in der Hallenmitte,
weil ihre Standorte in keiner Quelle stehen. Gebraucht wird je Anlage:

- die **untere** Landung, benannt ueber den naechsten Standcode
- die **obere** Landung, ebenso
- bei Rolltreppen die **Richtung** und ob sie tageszeitabhaengig wechselt

- **Aufzug 2.1 ↔ 2.2** (2.1 ↔ 2.2)
- **Rolltreppe 2.1 ↔ 2.2** (2.1 ↔ 2.2)
- **Aufzug 4.1 ↔ 4.2** (4.1 ↔ 4.2)
- **Rolltreppe 4.1 ↔ 4.2** (4.1 ↔ 4.2)
- **Aufzug 5.1 ↔ 5.2** (5.1 ↔ 5.2)
- **Rolltreppe 5.1 ↔ 5.2** (5.1 ↔ 5.2)
- **Aufzug 10.1 ↔ 10.2** (10.1 ↔ 10.2)
- **Rolltreppe 10.1 ↔ 10.2** (10.1 ↔ 10.2)

## 4. Betriebszustaende, die in keiner Quelle stehen

Diese Angaben lassen sich nicht aus Plaenen ableiten und aendern sich
waehrend der Messe. Sie sind der Grund, warum jede Verbindung als
`unbestaetigt` startet:

- Rolltreppenrichtungen je Tageszeit
- welche Durchgaenge Einbahn, nur Eingang oder nur Ausgang sind
- Treppen, die der Barrierefrei-Plan nicht zeigt (er kennt nur Aufzuege)
- Consumer-, Business- und Pressezugaenge

## Was ein Foto leisten muss, um zu helfen

Ein Bild wird erst zur Messung, wenn sich daraus ein **benennbarer Punkt**
ergibt. Brauchbar ist deshalb ein Foto, auf dem gleichzeitig zu sehen ist:

- ein Standschild mit Code, eine Hallennummer oder eine Tuerbeschriftung
- und das gesuchte Bauteil -- Durchgang, Rolltreppe, Aufzug, Treppe

Ein Foto ohne lesbare Beschriftung zeigt, **dass** es etwas gibt, aber nicht
**wo**. Es hilft beim Bestaetigen, nicht beim Einmessen.

