# Datenaudit: Herkunft, Einheiten und Unsicherheit

Stand: 04.08.2026 · Ausgangspunkt: Tag `stand-vor-genauigkeitsarbeit`

Dieses Dokument beantwortet für jede räumliche Quelle: was steht drin, in
welchen Einheiten, wie wird sie verwendet, und wie weit darf man ihr trauen.

## LoD2 CityGML und SLPK

| | CityGML | SLPK/I3S-Spike |
|---|---|---|
| Herkunft | Geobasis NRW, vier 1-km-Kacheln | Geobasis NRW, Produktionsblock Teil 16 |
| Einheit / CRS | Meter, EPSG:25832; Höhen DHHN2016 NH | Meter, EPSG:25832 |
| Verwendung | Baukörper, Grundrisse, Höhen und Dachformen | geprüft, nicht als zweite Materialquelle übernommen |
| Lizenz | Datenlizenz Deutschland Zero 2.0 | Datenlizenz Deutschland Zero 2.0 |

CityGML bleibt die maßgebliche 3D-Quelle. Grundrisse ab **2 m²** werden
übernommen; die frühere Grenze von 60 m² entfernte nicht nur Artefakte, sondern
reale kleine Nebenbauten. Die Grenze ist weiterhin rein technisch und sagt
nichts über die Gebäudefunktion aus.

Der SLPK-Spike wurde am realen, 242.364.284 Byte großen Paket
`LOD2_NRW_Teil16.slpk` durchgeführt. Dessen Extent (E 353.266–361.105) enthält
die Koelnmesse. Die reproduzierbare Inspektion fand 19.912 Archiveinträge und
1.243 I3S-`sharedResource`-Dateien, aber **keine Bilddatei, keine referenzierte
Textur und kein texturiertes Material**. Das Paket liefert I3S-Geometrie,
Attribute und Vertexfarben, jedoch keine Fassaden- oder Dachfototexturen.
Darum wäre ein eigener I3S-Parser lediglich ein zweiter Weg zu derselben
Geometrie; er wird bewusst nicht gebaut. Der maschinenlesbare Befund steht in
`data/raw/slpk/inspection.json`, Herkunft und Lizenz in `QUELLE.json`.

## Digitale Orthophotos

| | |
|---|---|
| Herkunft | Digitale Orthophotos 2025, Geobasis NRW |
| Quellauflösung | 0,10 m/Pixel |
| Verwendung | entzerrte Dach- und Geländetextur; niemals als Wandbild |
| Lizenz | Datenlizenz Deutschland Zero 2.0 |

Die bisherige Webtextur mit 4.096 Pixeln nutzte auf dem etwa 1,3-km-Ausschnitt
nur rund 32 cm/Pixel. Die Ausgabe wird nun mit 5.120 Pixeln (rund 25 cm/Pixel)
erzeugt. Das bleibt deutlich unter der nativen Datenmenge, erhält aber mehr
Details; progressive JPEG-Ausgabe und Qualitätsstufe bleiben unverändert.

## ALKIS-Grundrisse

| | |
|---|---|
| Herkunft | Grundrissdaten vereinfacht, Stadt Köln, Stand Januar 2026 |
| Format / CRS | GeoPackage (SQLite), EPSG:25832 |
| Verwendung | Kreuzkontrolle der LoD2-Grundrisse und markierte Lückenfüller |
| Lizenz | Datenlizenz Deutschland Zero 2.0 |

Der Bauschritt liest GeoPackage-Header und WKB direkt mit Python-Bordmitteln.
Im Messeausschnitt liegen 537 ALKIS-Grundrisse. 407 werden am Schwerpunkt von
einem LoD2-Grundriss abgedeckt; **130** bleiben als mögliche LoD2-Lücken
markiert und werden flach als Katasterumriss gezeigt. Die fehlende Höhe wird
nicht erfunden. Der Schwerpunkt-Test ist ein Audit-Indikator, kein Beweis für
geometrische Gleichheit; Überhänge und geteilte Baukörper können abweichen.

## OpenStreetMap

| | |
|---|---|
| Herkunft | OpenStreetMap-Mitwirkende, Overpass-Schnappschuss |
| Quellkoordinaten | WGS84; beim Bau nach UTM32 und mit dem gemessenen LoD2-Fit transformiert |
| Verwendung | Straßen, Fußwege, POIs und benannte Eingänge im Umfeld |
| Lizenz | ODbL 1.0; Attribution wird im Build-Datensatz mitgeführt |

OSM ersetzt keine amtlichen Gebäudekörper. Es ergänzt ausschließlich die
Informationen, die LoD2 und ALKIS nicht liefern. Der eingecheckte Snapshot
enthält echte OSM-Elemente; der Abruf findet nicht zur Laufzeit statt.

## PDF-Hallenplan-Abgleich

`tools/audit_hallplans.py` vergleicht Hallenbezeichnungen aus Gamescom-Plan
und Technischen Richtlinien mit den 17 Hallenplan-Snapshots sowie den bereits
gebauten Aufzügen und Ebenenverbindungen. Alle 17 modellierten Bereiche haben
einen Snapshot. Der Gesamtplan erwähnt zusätzlich nicht für die gamescom
modellierte Ebenen (unter anderem 2.3, 4.3 und 7.2); sie werden nicht als
vermeintliche Messebereiche importiert. 16 amtlich verortete Lastenaufzüge und
die vorhandenen Ebenenverbindungen bleiben mit ihrer Unsicherheit sichtbar.

---

## Der wichtigste Befund vorab

**Die offizielle Karte platziert ihre Hallen absichtlich nicht maßstäblich.
Ihre Transformationskette zu übernehmen würde die Karte verschlechtern.**

Die interaktive Geländekarte führt je Halle `dx`, `dy` und `rot`. Nach dem
Quelltext der Seite sind `dx`/`dy` **keine Feinversätze**, sondern
**achsenweise Skalierungsfaktoren** — und zwar nur als Rückfallebene, wenn die
Hallenplan-Schnittstelle keine eigenen `scalex`/`scaley` liefert:

```js
// buildLatLangs(), exhibitors.gamescom.global
x = px - minmax.minx - minmax.w/2 + minmax.dw;
x = x * f * (minmax.scalex ?? dx);      // f = 0.6, fester Faktor
y = y * f * (minmax.scaley ?? dy);
// danach Drehung um (rot + 180), Verschiebung auf die Mitte des coord-Polygons
```

Die tatsächlichen Werte aus den Schnappschüssen:

| Halle | scalex | scaley | Wirkung |
|---|---|---|---|
| 10.1 | −0,88 | 1,17 | gespiegelt, y um 17 % gestreckt |
| 4.1 | −1,04 | 0,75 | gespiegelt, y um 25 % gestaucht |
| F8 | −0,94 | 0,53 | gespiegelt, y **halbiert** |
| F2 | −1,04 | 1,57 | gespiegelt, y um 57 % gestreckt |
| 8.1 | — | — | Rückfall auf dx = −1,0 / dy = 0,8 |

`scalex` ist bei **jeder** Halle negativ, `scaley` schwankt zwischen 0,53 und
1,57. Das ist keine Georeferenz, sondern eine Anzeigeanpassung: metrisch
korrekte Hallenpläne werden verzerrt, damit sie in handgezeichnete
Klickpolygone passen.

**Konsequenz:** Der bestehende Ansatz — Einpassung über Standcodes, die in zwei
unabhängigen Quellen vorkommen — bleibt maßgeblich. Er erreicht Restfehler
unter einem Meter; die offizielle Kette würde bis ±57 % verzerren. `dx`/`dy`
werden bewusst **nicht** angewandt und sind hiermit geklärt, nicht ignoriert.

---

## Quellen im Einzelnen

### 1. Hallenplan-Schnittstelle (maßgeblich)

| | |
|---|---|
| Herkunft | `backends.koelnmesse.io/global/asdb.php?route=hallenplan2/api`, verlinkt von `exhibitors.gamescom.global` |
| Schnappschuss | `data/raw/hallplan/<halle>_<ebene>.json`, 17 Dateien |
| Einheit | **Meter**, lokal je Hallenebene |
| Art | metrisch, vektorbasiert |
| Verwendung | Standpolygone, Strukturblöcke, Hallenausdehnung |
| Unsicherheit | keine bekannte; die Polygone sind die Primärquelle |

**Genutzte Felder:** `pl` (Polygon), `standnr`, `standnr2`, `hsnr`, `area`,
`kunden`, `minmax.{minx,miny,w,h}`.

**Bewusst nicht genutzt:** `scalex`, `scaley`, `dw`, `dh`, `rotation` — sie
gehören zur Anzeigekette oben. `dw`/`dh` (bis 13 m) verschieben die Inhalte
innerhalb der Halle; da die Einpassung aus denselben Standmittelpunkten
gerechnet wird, absorbiert ihre Translation einen konstanten Versatz
vollständig. `rotation` ist in allen Schnappschüssen 0.

**Wichtige Einschränkung:** `minmax` umschließt die **gezeichneten Inhalte**,
nicht das Gebäude. Das erzeugte einen systematischen Fehler, siehe unten.

### 2. gamescom-Hallenplan 2025 (Georeferenz)

| | |
|---|---|
| Schnappschuss | `data/raw/pdf/gamescom-2025-hallenplan.pdf` |
| Einheit | PDF-Punkte; der Fit ergibt Maßstab ≈ 1,00 → **1 Einheit ≈ 1 m** |
| Art | vektorbasiert, geometrisch treu |
| Verwendung | Lage der Hallen zueinander, über Standcodes eingepasst |
| Unsicherheit | Restfehler 0,00–0,94 m bei 8 Hallen |

Nur Ebene 1. Halle 3 und 11 waren 2025 nicht mit gamescom-Ständen belegt.

### 3. Technische Richtlinien (bessere Ersatzquelle, neu erschlossen)

| | |
|---|---|
| Schnappschuss | `data/raw/pdf/technische-richtlinien-2022.pdf` |
| Einheit | Zeichnungseinheiten, Fit ergibt ≈ 1,84 m je Einheit |
| Art | schematischer Übersichtsplan mit **verorteten Marken** |
| Verwendung | Lage von 1.2 und 3.2, Aufzüge, Tore, lichte Höhen |
| Unsicherheit | **7,0 m** kreuzvalidiert (Aufzugsplan), 14,1 m (Torplan) |

Das Dokument ist überwiegend Recht und Logistik. Übersehen worden war, dass es
drei Tabellen mit Bauangaben führt — und dazu **Pläne, auf denen jeder Aufzug
und jedes Tor als Marke eingezeichnet ist** (`5.1F`, `10.2Q`, `11.1A`).

Der Aufzugsplan passt sich mit **7,0 m** kreuzvalidiertem Fehler ins Gelände —
fast viermal genauer als der Barrierefrei-Plan. Beide Pläne werden jetzt gegen
die eingemessenen Hallen geprüft und der genauere genommen; das ist eine
Messung, keine Geschmacksfrage.

Daraus gewonnen:

- **Halle 1.2 und 3.2: ±27 m → ±7 m**
- **16 Aufzüge** offiziell verortet (1.1, 2.1, 3.1, 4.1, 5.1, 11.1) — die
  Ebenenwechsel in 2.1↔2.2 und 5.1↔5.2 stehen damit nicht mehr rechnerisch in
  der Hallenmitte
- **28 Tore** offiziell verortet, ±14,1 m
- **Abmessungen zu jeder Anlage** aus den Tabellen 3.1.c und 3.1.e: Kabine und
  Tragfähigkeit je Aufzug, Breite × Höhe je Tor
- **Örtliche Höhenbeschränkung: 4,50 m unter Verteilerkanälen** — und zwar in
  **sechs** Hallenebenen (4.1, 4.2, 5.1, 5.2, 10.1, 10.2), nicht nur in 10.2.
  Dazu 10,80 m unter der Kanaltrennwand in Halle 1.1.

#### Marken werden uneinheitlich gesetzt

Zuerst wurden nur 11 Aufzüge und 17 Tore gefunden. Der Grund war der Satz des
Dokuments: es schreibt mal `5.1F`, mal `4.1 E` mit Leerzeichen, und im Torplan
stehen Hallenebene und Kennbuchstabe als **zwei getrennte Textobjekte**
nebeneinander (`4.1` und daneben `H`). Getrennte Hälften werden jetzt wieder
zusammengefügt, wenn sie höchstens 12 Punkte auseinanderstehen — gemessen sind
es 8 bis 10, die nächste fremde Beschriftung ist dreimal so weit weg. Halle 4.1
Aufzug E kam erst dadurch überhaupt zum Vorschein.

#### Die Marke ist nicht die Anlage

Im Plan steht `4.1 E` **neben** der Halle, nicht auf dem Schacht. Wo die Marke
außerhalb des belegten Umrisses liegt und die nächste Kante höchstens 35 m
entfernt ist, wird sie auf diese Kante gezogen — Tore und Aufzugsschächte sitzen
in der Hallenhülle. Die Sprungweite steht als `snapM` am Eintrag und geht zur
Hälfte in die Unsicherheit ein. Liegt die Marke schon **innerhalb** des
Umrisses, bleibt sie liegen: dann wäre die nächste Wand geraten, nicht gemessen.
Deshalb tragen `4.1A`, `4.1H`, `4.1L` und `4.2O` weiter `plan-beschriftung`.

#### Plan und Tabelle widersprechen sich bei Halle 1.2

Der Torplan zeichnet für Halle 1.2 die Tore **A–F**, die Tabelle führt
**A–E und H**. Da alle sechs dieselbe Zeile teilen (5,50 × 4,50 m), bekommt das
sechste Tor deren Maße mit dem Vermerk `matchedBy: "hallenzeile"`. Geraten wird
nichts, aber der Fall bleibt sichtbar.

#### Halle 10 hat keinen Aufzug im Dokument

Weder die Tabelle 3.1.c noch der Aufzugsplan führen für Halle 10 eine Anlage.
Der Ebenenwechsel 10.1↔10.2 steht deshalb weiter als `placeholder` in der
Hallenmitte. Das ist kein Fehler der Auswertung, sondern der Kenntnisstand.

#### Es sind Lastenaufzüge

Die Tabelle nennt Tragfähigkeiten von 30 bis 100 kN — drei bis zehn Tonnen, bei
Kabinen bis 2,30 × 5,40 m. Das sind Aufzüge für den Standbau, keine
Besucheraufzüge. Ihre **Lage** ist amtlich, ihre **Benutzbarkeit für Besucher**
steht nirgends. Alle Ebenenwechsel bleiben daher `unbestaetigt`; die App führt
sie mit Strafgewicht und weist sie aus, statt sie als offenen Weg zu verkaufen.

#### Ein Widerspruch zwischen zwei offiziellen Quellen

Für Halle 10 nennt die Flächentabelle **5,70 m** lichte Höhe, die Technischen
Richtlinien **5,80 m** (10.1) und **5,85 m** (10.2). Beide sind offiziell. Der
Widerspruch wird ausgewiesen und nicht aufgelöst — das Höhenmodell rechnet
weiter mit der Flächentabelle, weil sie die neuere und einheitlichere Quelle
ist, aber wer nachrechnet, findet die Abweichung dokumentiert.

### 3b. Werbeflächen-Kataloge (die einzige Quelle für Rolltreppen)

| | |
|---|---|
| Quellen | Koelnmesse geländeweit (2013), FIBO 2022, FIBO 2024, FIBO 2025 |
| Art | Verkaufsunterlage, keine Karte |
| Verwendung | Treppen, Rolltreppen, Stufenmaße |
| Gepflegt in | `data/curated/vertical-access.json` |

Kein Kartenwerk der Koelnmesse zeichnet Rolltreppen — weder die Hallenplan-
Schnittstelle noch der Barrierefrei-Plan noch die Technischen Richtlinien.
Belegt sind sie an einer unerwarteten Stelle: **wer eine Treppenstufe bekleben
will, bekommt sie vermaßt.**

Die Regel steht wörtlich in FIBO 2022, Seite 34:

> Die Treppenaufgänge im Südgelände verbindet die oberen Messehallen mit den
> Passagen. **Jeder Aufgang verfügt über zwei Rolltreppen**, die einzeln zu
> belegen sind.

Das ist die einzige Stelle in allen ausgewerteten Quellen, an der die
Koelnmesse eine *Regel* zu Rolltreppen ausspricht statt einen Einzelfall. Sie
gilt für 2.2, 3.2, 4.2, 5.2, 10.2 und 11.2 — und ausdrücklich **nicht** für den
Nordboulevard, wo derselbe Katalog *eine* Rolltreppe neben der Treppe führt.

Vermaßt sind nur zwei Aufgänge:

| Aufgang | Stufen | Breite | Steigung | Ergibt |
|---|---|---|---|---|
| Halle 4.2 | 20 | 1,80 m | 0,14 m | 2,80 m |
| Halle 10.2 | 20 | 1,80 m | 0,14 m | 2,80 m |
| Passage 10/4 → Mittelboulevard | 20 | 7,00 m | 0,14 m | 2,80 m |
| Nordboulevard → Mittelboulevard | 45 | 3,00 m | 0,11 m | 4,95 m |
| Eingang West, EG → 1. OG | 32 | 2,30 m | 0,14 m | 4,48 m |
| Eingang Süd (geländeweiter Katalog) | 24 | — | — | — |

Wo die Stufenzahl fehlt, wird sie nicht erfunden: die Ebenenwechsel in 2.2 und
5.2 tragen `dimensionSource: "unbekannt"`.

#### Die 20 Stufen gehören nicht zum Ebenenwechsel

Das hat zwei Korrekturrunden gebraucht, und beide gingen von einer Beobachtung
vor Ort aus (`data/curated/field-notes.json`).

20 Stufen à 0,14 m sind **2,80 m**. Zwischen 10.1 und 10.2 liegen aber über
sieben Meter — Halle 10.1 hat allein 5,70 m lichte Höhe, dazu die Decke. Die
Treppe kann der Geschosswechsel also nicht sein.

*Erster Versuch:* Dann beginnt sie eben am Mittelboulevard, der 2,80 m unter
Ebene 2 läge. **Falsch.** Der Boulevard liegt im Südteil **exakt auf Ebene 2** —
oben geht man keine Stufen, die oberen Hallen liegen flach daran. Erst zwischen
Halle 9 und Halle 10 fällt er nach Norden ab.

*Was übrig bleibt:* eine dritte Stelle, die der Katalog selbst nennt —
„Beklebung Treppe Passage 10/4, Position: **zum Mittelboulevard**, 20 Stufen".
Die Passagen liegen also rund 2,80 m unter dem Boulevard, bei etwa 4,65 m.
**Diese Zwischenebene modelliert BEUTELTIER nicht.**

Konsequenz: die Stufenmaße sind wieder aus dem Ebenenwechsel heraus. Die
Verbindung bleibt belegt (die Zwei-Rolltreppen-Regel gilt weiter), ihr Maß
trägt `dimensionSource: "unbekannt"` und bei 4.1 und 10.1 eine Notiz, wohin
die Katalogzahlen tatsächlich gehören.

#### Beschilderung kennt mehr Tore als die Richtlinien

An der nordwestlichen Durchfahrt unter dem Deck von Halle 10.2 hängt das
Koelnmesse-Torgruppenschild **„10.2 P – U"**. Die Tortabelle der Technischen
Richtlinien führt für Halle 10.2 aber nur **N, P, Q und T**. Es gibt also auch
R, S und U — ohne Maß und ohne Lage.

Ebenso an der Südfassade von Halle 9: dort hängt das Torschild **A**. Für die
eingeschossigen Nordhallen ordnet mein Markenleser bewusst keine Buchstaben zu
(sie stehen zu weit von der Hallennummer entfernt, siehe oben), deshalb hat
Halle 9 im Modell **kein einziges verortetes Tor**. Jetzt ist wenigstens die
Seite eines Tores bekannt.

Beides landet in `site.json` unter `facilityGaps`: was existiert, was fehlt,
und aus welcher Beobachtung es stammt. Es wird nicht verortet.

| Halle | Tor | Bekannt | Fehlt |
|---|---|---|---|
| 10.2 | R, S, U | existiert | Lage und Maß |
| 9 | A | Seite: Süd | Lage |

Dasselbe Schild bestätigt nebenbei den Anker: Tor **P** hängt genau an der
Durchfahrt, an der der Besucherstrom läuft.

#### Und was daran richtig war

Die begleitende Beobachtung steht: Halle 10.2 kragt als Betondeck auf Stützen
über eine offene Fläche auf Bodenniveau aus; die Südseite von Halle 9 und der
ebenerdige Zugang zu Halle 10.1 liegen auf **derselben** Fläche, und eine
asphaltierte Auffahrt führt vom Boulevard dorthin hinunter. Meine ursprüngliche
Vermutung, das Gelände steige nach Norden, ist damit erledigt.

#### Eine Handskizze bestätigt die Korridorbreite

Eine Skizze mit Schrittmaß gibt den Boulevard mit 15 m an und die Freifläche
zwischen Boulevard und Halle 10.2 mit weiteren 15 m — zusammen 30 m. BEUTELTIER
misst zwischen Halle 5.2 (Ost) und Halle 10.2 (West) **26,6 m**, auf Höhe Halle
4.2 sind es **23,4 m**. Drei bis sieben Meter Abweichung zwischen Schrittmaß und
eingemessener Geometrie: das ist eine Bestätigung, keine Korrektur. Geändert
wird nichts.

#### Und eine Korrektur, die eine Beobachtung nötig machte

„Nach Osten geht ein Tor raus" hatte ich als Tor in der **Ostwand** von Halle
10.2 gelesen — dort gibt es genau eines, T. Die Skizze zeigt aber, dass der
Boulevard **westlich** an Halle 10 vorbeiläuft und die Freifläche
**nordwestlich von Halle 10, südlich von Halle 9** liegt. Der Aufgang sitzt
also an der Nordwestecke, nicht an der Ostwand. Anker ist jetzt Tor **P**, das
westlichste der Nordwand. Der Fehler betrug 175 m.

Die Freifläche selbst trägt jetzt eine Beobachtung am Durchgang 10.2 ↔ 9.1:
im Freien, abfallend nach Norden, **reiner Transitweg** — kein Stand, keine
Gastronomie. Das weiß keine Datenquelle; das weiß nur, wer dort gelaufen ist.

#### Und eine Bestätigung

Der geländeweite Katalog kalkuliert eine Regeltreppe mit **56 Stufen à 0,14 m
= 7,84 m**. BEUTELTIER leitet aus lichter Höhe plus angenommener Deckenstärke
7,45 m (Halle 10) und 7,60 m (Halle 4) ab, Spanne 7,20 bis 7,85 m. 7,84 m
liegt am oberen Rand dieser Spanne — die Deckenstärke dürfte eher bei 2,0 m
liegen als bei 1,5 m. Geändert wird nichts, ein Kalkulationsbeispiel ist keine
Bauangabe. Aber die Annahme hält.

### 4. Barrierefrei-Plan (Ersatzquelle, jetzt zweite Wahl)

| | |
|---|---|
| Schnappschuss | `data/raw/pdf/koelnmesse-barrierefrei.pdf` |
| Einheit | Zeichnungseinheiten, Fit ergibt ≈ 2,93 m je Einheit |
| Art | **schematisch** — Hallen als gleichförmige Blöcke |
| Verwendung | Aufzüge, WCs, Sanitätsstationen, Eingänge |
| Unsicherheit | **27,0 m**, kreuzvalidiert gegen die 7 exakt bekannten Hallen |

Für Hallenlagen inzwischen abgelöst durch die Technischen Richtlinien (7,0 m).

Ebene 1 und 2 sind zwei getrennte Diagramme auf einer Seite und müssen einzeln
gefittet werden.

### 5. Layout-Tabelle der interaktiven Karte (nur Topologie)

| | |
|---|---|
| Schnappschuss | `data/raw/hall-layout.json` |
| Einheit | SVG-Zeichenraum 1172 × 903, gegenüber dem Gelände **gespiegelt** |
| Art | handgezeichnete Klickflächen, nicht maßstäblich (0,45–1,14 Einheiten/m) |
| Verwendung | **welche** Hallen verbunden sind, Drehung je Halle |
| Unsicherheit | 46,8 m kreuzvalidiert — nur für Topologie brauchbar |

Die Kommentare benennen die Durchgänge im Klartext; wo sie fehlen, trägt der
Schlüssel dieselbe Information (`D78` = Durchgang 7↔8).

Bestätigt: die `rot`-Werte stimmen mit den eingemessenen Drehungen überein
(Halle 10: 90 gegen 89,96°; Halle 4: 0 gegen −0,00°). Deshalb wird `rot`
verwendet, `dx`/`dy` und `coord`-Maßstab nicht.

### 6. Offizielle Hallendaten

| | |
|---|---|
| Schnappschuss | `data/curated/hall-metadata.json` |
| Einheit | m², Meter, kN/m² |
| Art | **offiziell** für Fläche, lichte Höhe und Bodenlast |
| Verwendung | Validierung der Umrisse, Grundlage des Höhenmodells |

Zur Nummerierung: die Quelle führt „Halle 1" ohne Ebenenziffer, der Hallenplan
kennt `1.2`. Beide meinen dasselbe eingeschossige Bauwerk — die „2" bezeichnet
die **Geländeebene**, auf der Halle 1 liegt, nicht ein zweites Geschoss. Die
offizielle Fläche gilt daher für 1.2 als Ganzes. Ebenso bei 6, 7, 8, 9.

---

## Zwei behobene Fehler

### Umrisse waren Bounding-Boxen, nicht Gebäude

Die Umgrenzung kam aus `minmax` — der Bounding-Box der gezeichneten Inhalte.
Bei L-förmigen Hallen greift die weit über das Gebäude hinaus. Die offiziellen
Flächen deckten das auf; die konvexe Hülle der Inhalte behebt es:

| Halle | vorher | nachher |
|---|---|---|
| 10.1 | +31,2 % | **+0,9 %** |
| 2.1 | +29,2 % | **+3,4 %** |
| 2.2 | +27,1 % | **+1,2 %** |
| 5.1 | +18,1 % | **−0,7 %** |
| Mittel | 18,5 % | **9,1 %** |

Nebeneffekt: 2.704 begehbare Rasterzellen außerhalb der Gebäude sind
verschwunden, ohne dass ein Stand die Anbindung verlor (1027 von 1027).

**Bleibt offen:** 10.2 (+18,7 %) und 5.2 (+15,6 %) — die konvexe Hülle
überbrückt die einspringende Ecke L-förmiger Hallen. Eine konkave Hülle bräuchte
einen Glättungsparameter und damit eine Stellschraube, die sich an die Daten
anpassen ließe; das wäre keine Messung mehr.

**Kein Fehler:** 6.1, 7.1, 8.1, 9.1 (−14 bis −17 %) und 1.2 (−15 %). Dort
belegt gamescom nur einen Teil des Gebäudes. Der Umriss ist der belegte
Bereich, und genau so heißt er jetzt in den Daten und in der Oberfläche.

### Zweite Ebenen lagen pauschal auf 11 m

`LEVEL_HEIGHT_M = 11.0` galt für jede obere Ebene. Ersetzt durch ein Modell aus
offiziellen lichten Höhen plus **einer** benannten Annahme (Geschossdecke
1,5–2,0 m):

| Ebene | vorher | jetzt | Abweichung |
|---|---|---|---|
| 3.2 | 11,00 m | **6,50 m** | −4,50 m |
| 11.2 | 11,00 m | 6,75 m | −4,25 m |
| 10.2 | 11,00 m | 7,45 m | −3,55 m |
| 4.2 / 5.2 | 11,00 m | 7,60 m | −3,40 m |
| 2.2 | 11,00 m | 7,75 m | −3,25 m |

Jeder Wert trägt `heightSource`, `heightConfidence` und `heightUncertaintyM`.
Die Bodenhöhen sind `derived` — nie `official`, auch wenn die lichte Höhe
darunter amtlich ist, denn die Deckenstärke bleibt Annahme.

Die Wandhöhe ist jetzt die lichte Höhe der Ebene statt konstanter 9,5 m. Halle
8 hat damit 15 m lichte Höhe; für die Übersicht wird die *Darstellung* bei 12 m
gekappt, der Datenwert bleibt 15,00 m.

---

## Was weiterhin geschätzt ist

| Gegenstand | Unsicherheit | Bessere Quelle |
|---|---|---|
| Lage Halle 3.2 | ±7 m | drei Kontrollpunkte vor Ort |
| Lage Halle 1.2 | ±7 m | drei Kontrollpunkte vor Ort |
| Lage F2 / F8 / FB | ±25 m | Kontrollpunkte an den Hallenkanten |
| Durchgangsanschlüsse | 5–372 m Anschlussweite | Messung der Portalmitten |
| Ebenenwechsel 2.1↔2.2, 5.1↔5.2 | ±7 m, offiziell verortet | bestätigen |
| Ebenenwechsel 4.1↔4.2, 10.1↔10.2 | Hallenmitte, `placeholder` | Aufzugsstandorte |
| Rolltreppen | alle `placeholder` | Standorte und Richtungen |
| Verlauf der Verteilerkanäle | 4,50 m gilt, Lage unbekannt | Hallenpläne |
| Deckenstärke | ±0,25 m | Bauunterlagen |
| Außenhüllen | nicht vermessen | Bauunterlagen |
| Halle 11.3 | Höhe **bewusst offen** | Nutzung und Erreichbarkeit klären |

Halle 11.3 ist mit Fläche, lichter Höhe und Bodenlast erfasst, aber
`routable: false`. Ihre vertikale Beziehung zu 11.1/11.2 ist nicht belegt und
wird nicht geraten.

---

## Was in diesem Durchgang bewusst unterblieb

- **`dx`/`dy` anwenden** — sie sind Skalierungsfaktoren einer verzerrenden
  Anzeigekette, siehe oben. Anwenden hieße die Karte verschlechtern.
- **Freie Skalierung durch starre Transformation ersetzen** — geprüft und
  verworfen: der gefittete Maßstab liegt bereits bei 0,977–1,002. Die Freiheit
  wird also nicht ausgenutzt, und ihr Wert bestätigt unabhängig, dass beide
  Quellen denselben Maßstab haben. Als Prüfgröße ist sie nützlicher denn als
  Fehlerquelle.
- **Fotoauswertung** — ohne zugeordnete Bilder und Messpunkte liefert sie keine
  Meterkoordinaten. Siehe `docs/field-survey.md` für das, was sie liefern
  müsste, um zu helfen.
