# Datenaudit: Herkunft, Einheiten und Unsicherheit

Stand: 04.08.2026 · Ausgangspunkt: Tag `stand-vor-genauigkeitsarbeit`

Dieses Dokument beantwortet für jede räumliche Quelle: was steht drin, in
welchen Einheiten, wie wird sie verwendet, und wie weit darf man ihr trauen.

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
- **11 Aufzüge** offiziell verortet (2.1, 3.1, 5.1, 11.1) — die Ebenenwechsel
  in 2.1↔2.2 und 5.1↔5.2 stehen damit nicht mehr rechnerisch in der Hallenmitte
- **17 Tore** offiziell verortet, ±14,1 m
- **Örtliche Höhenbeschränkung: 4,50 m unter Verteilerkanälen** — und zwar in
  **sechs** Hallenebenen (4.1, 4.2, 5.1, 5.2, 10.1, 10.2), nicht nur in 10.2.
  Dazu 10,80 m unter der Kanaltrennwand in Halle 1.1.

#### Ein Widerspruch zwischen zwei offiziellen Quellen

Für Halle 10 nennt die Flächentabelle **5,70 m** lichte Höhe, die Technischen
Richtlinien **5,80 m** (10.1) und **5,85 m** (10.2). Beide sind offiziell. Der
Widerspruch wird ausgewiesen und nicht aufgelöst — das Höhenmodell rechnet
weiter mit der Flächentabelle, weil sie die neuere und einheitlichere Quelle
ist, aber wer nachrechnet, findet die Abweichung dokumentiert.

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
