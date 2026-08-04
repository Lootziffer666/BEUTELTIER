# Was vor Ort gemessen werden muss

Erzeugt von `tools/build_accuracy_report.py` aus dem verbleibenden Fehler
des letzten Baus. Die Reihenfolge ist die Reihenfolge des Nutzens.

## 1. Hallenlagen einmessen

Diese Hallen stehen auf **±7.0 m** genau. Das ist der groesste verbleibende Fehler der Karte.

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

- **Durchgang H1 H5 (1.2 ↔ 5.1)** (1.2 ↔ 5.1) — derzeit 374 m Anschlussweite
- **Durchgang H1 H5 (1.2 ↔ 5.2)** (1.2 ↔ 5.2) — derzeit 374 m Anschlussweite
- **Durchgang H1 H4 (1.2 ↔ 4.2)** (1.2 ↔ 4.2) — derzeit 330 m Anschlussweite
- **Durchgang H1 H4 (1.2 ↔ 4.1)** (1.2 ↔ 4.1) — derzeit 330 m Anschlussweite
- **Passage 2-4 (2.1 ↔ 4.1)** (2.1 ↔ 4.1) — derzeit 76 m Anschlussweite
- **Durchgang Halle 3 zu 4 (3.2 ↔ 4.1)** (3.2 ↔ 4.1) — derzeit 70 m Anschlussweite
- **Durchgang Halle 3 zu 4 (3.2 ↔ 4.2)** (3.2 ↔ 4.2) — derzeit 70 m Anschlussweite
- **Passage 2-4 (2.2 ↔ 4.2)** (2.2 ↔ 4.2) — derzeit 70 m Anschlussweite

## 3. Ebenenwechsel verorten

Gebraucht wird je Anlage:

- die **untere** Landung, benannt ueber den naechsten Standcode
- die **obere** Landung, ebenso
- bei Rolltreppen die **Richtung** und ob sie tageszeitabhaengig wechselt

Diese sitzen noch rechnerisch in der Hallenmitte, weil ihr Standort
in keiner Quelle steht:

- **Aufzug 2.1 ↔ 2.2** (2.1 ↔ 2.2)
- **Rolltreppe 2.1 ↔ 2.2 (West der Treppe)** (2.1 ↔ 2.2)
- **Treppe 2.1 ↔ 2.2** (2.1 ↔ 2.2)
- **Rolltreppe 2.1 ↔ 2.2 (Ost der Treppe)** (2.1 ↔ 2.2)
- **Aufzug 4.1 ↔ 4.2** (4.1 ↔ 4.2)
- **Rolltreppe 4.1 ↔ 4.2 (West der Treppe)** (4.1 ↔ 4.2)
- **Treppe 4.1 ↔ 4.2** (4.1 ↔ 4.2)
- **Rolltreppe 4.1 ↔ 4.2 (Ost der Treppe)** (4.1 ↔ 4.2)
- **Aufzug 5.1 ↔ 5.2** (5.1 ↔ 5.2)
- **Rolltreppe 5.1 ↔ 5.2 (West der Treppe)** (5.1 ↔ 5.2)
- **Treppe 5.1 ↔ 5.2** (5.1 ↔ 5.2)
- **Rolltreppe 5.1 ↔ 5.2 (Ost der Treppe)** (5.1 ↔ 5.2)
- **Aufzug 10.1 ↔ 10.2** (10.1 ↔ 10.2)

Diese haengen an einer Beobachtung und einem verorteten Tor. Sie
brauchen keine Neuvermessung, sondern eine Bestaetigung:

- **Rolltreppe 10.1 ↔ 10.2 (West der Treppe)** (10.1 ↔ 10.2)
- **Treppe 10.1 ↔ 10.2** (10.1 ↔ 10.2)
- **Rolltreppe 10.1 ↔ 10.2 (Ost der Treppe)** (10.1 ↔ 10.2)

## 3b. Offene Fragen, die eine Antwort sofort aufloest

Diese Punkte haengen an einer einzigen Angabe. Solange sie offen sind,
bleibt die betroffene Lage stehen, wie sie ist -- geraten wird nicht.

- **Ist das dieselbe Anlage wie an der Nordwestecke bei Tor P?**
  - loest sich mit: Eine Angabe, ob es eine oder zwei Rolltreppenanlagen an Halle 10 gibt.
  - Beobachtung: `rolltreppe-verbindet-10.1-und-10.2`

## 3c. Anlagen, die es gibt, deren Lage aber fehlt

Beschilderung vor Ort nennt mehr, als die Technischen Richtlinien
fuehren. Gebraucht wird je Anlage ein Foto, auf dem das Torschild und
ein benennbarer Punkt gleichzeitig zu sehen sind.

| Halle | Anlage | Bekannt | Fehlt |
|---|---|---|---|
| 10.2 | gate R | existiert | Lage und Mass |
| 10.2 | gate S | existiert | Lage und Mass |
| 10.2 | gate U | existiert | Lage und Mass |
| 9 | gate A | Seite: sued | Lage |

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

