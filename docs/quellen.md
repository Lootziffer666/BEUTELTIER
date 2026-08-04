# Quellen und Credits

> **Quellen verbinden, nicht enteignen. Credits bleiben sichtbar.**
> — BEUTELTIER-PRD, Leitprinzip 1

BEUTELTIER erzeugt keine eigenen Daten über die Gamescom. Es verbindet, was
andere zusammengetragen haben. Diese Seite hält fest, wem was gehört.

## Karte und Gelände

| Quelle | Was daraus kommt | Verwendung |
|---|---|---|
| **Koelnmesse / gamescom — Hallenplan-Schnittstelle**<br>`backends.koelnmesse.io`, verlinkt von `exhibitors.gamescom.global` | Standflächen als Polygone in Metern, Hallenmaße, Strukturblöcke, Durchgangstabelle | Die gesamte Karte. Als Schnappschuss unter `data/raw/hallplan/` eingecheckt und offline gelesen — die App fragt die Schnittstelle im Betrieb nie an. |
| **gamescom — Hallenplan 2025** (PDF) | Lage der Hallen zueinander auf dem Gelände | Georeferenz. Über die Standcodes werden die Hallen eingemessen. |
| **Koelnmesse — Barrierefreier Messeaufenthalt** (PDF) | Übersicht beider Ebenen, Aufzüge, behindertengerechte WCs, Sanitätsstationen, Eingänge | Lage der Hallen ohne 2025er Belegung (1, 3, 11). |
| **Koelnmesse — Hallendaten** | Fläche, lichte Höhe und Bodenbelastung je Halle | Validierung der Umrisse und Grundlage des Höhenmodells. Gepflegt in `data/curated/hall-metadata.json`. |
| **Koelnmesse — Technische Richtlinien** | Verortete Aufzüge und Tore, lichte Höhen, örtliche Höhenbeschränkungen | Lage der Hallen ohne 2025er Belegung (±7 m, genauer als der Barrierefrei-Plan) und Standorte der Ebenenwechsel. |
| **Koelnmesse — Werbeflächen-Kataloge**<br>gelände­weit sowie FIBO 2022/2024/2025 | Treppen und Rolltreppen: Stufenzahl, Breite, Steigung; die Regel „Jeder Aufgang verfügt über zwei Rolltreppen" | Die **einzige** Quelle im Projekt, die Rolltreppen belegt. Kein Kartenwerk führt sie. Gepflegt in `data/curated/vertical-access.json`, jede Angabe mit Wortlaut und Seitenzahl. |
| **pc games / GamesWirtschaft — historische Hallenpläne** | Hallen-Innenleben früherer Jahre | Referenzmaterial für Eingänge, Rolltreppen und Treppen. Nicht in den Daten. |

## Aussteller

| Quelle | Was daraus kommt |
|---|---|
| **gamescom — offizielle Ausstellersuche**<br>`exhibitors.gamescom.global` | 1.520 Aussteller mit Ländern, Hallen und Standnummern. Erhoben mit dem BEUTELTIER-Collector, Schnappschuss unter `data/raw/`. |

## Inhalte, die andere pflegen

| Quelle | Rolle in BEUTELTIER |
|---|---|
| **GamingPartys** | Epix-Quests, Termine und Lösungen. BEUTELTIER führt sie aus und exportiert sie — es erfindet keine Quests und beansprucht keine Urheberschaft. Der Epix Hub ist eine Ausführungsschicht. |
| **Goodie Guide / Farbklecks** | Goodie- und Aktionsmeldungen. Werden eingelesen, einem Stand zugeordnet und in eine Route überführt. Jede Meldung behält Quelle, Zeit und Status. |
| **Indie Arena Booth** | Eigener Bereich mit eigener App. BEUTELTIER führt bis zum Block und übergibt dann. Die IAB-Karte wird ausdrücklich **nicht** ersetzt (PRD 5.7, 8). |
| **OpenStreetMap-Mitwirkende** | Grundlage der Kartenansichten in den Referenz-Screenshots. |

## Was BEUTELTIER nicht tut

- Es schreibt nichts im Namen des Nutzers — nicht auf Discord, nirgends.
- Es betreibt keinen Bot mit Schreib- oder Moderationsrechten.
- Es umgeht keine CAPTCHAs oder Schutzmechanismen.
- Es behauptet nicht, ein unbestätigter Weg sei sicher offen.
- Es ersetzt keine Spezial-App, sondern bindet sie an.

## Marke

**BEUTELTIER** und das Maskottchen **Lootzy** gehören zum Projekt. Die
Bildmarke liegt unter `app/public/brand/`.
