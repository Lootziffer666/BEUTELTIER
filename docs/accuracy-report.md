# Genauigkeitsbericht

Erzeugt von `tools/build_accuracy_report.py`. Nicht von Hand pflegen --
die Zahlen kommen aus dem jeweils letzten Bau.

- Hallenebenen: **17**, davon 8 eingemessen und 5 geschaetzt
- Restfehler der eingemessenen Hallen: **0.268 m** im Mittel, maximal 1.46 m
- Lage der geschaetzten Hallen: **±7.0 m** (kreuzvalidiert)
- Flaechenabweichung gegen die offiziellen Hallenflaechen: **9.1 %** im Mittel, 9.2 % im Median
- Angenommene Geschossdecke: 1.5–2.0 m

## Hallenebenen

| Ebene | Lage aus | Stützen | Rest (m) | max (m) | Umriss | belegt m² | offiziell m² | Abw. | Boden (m) | lichte H (m) | Höhe aus |
|---|---|--:|--:|--:|---|--:|--:|--:|--:|--:|---|
| 1.2 | geschaetzt | — | 6.98 | 6.98 | inhaltshuelle | 8939 | 10512 | -15.0 % | 0.00 | 11.10 | official |
| 10.1 | eingemessen | 37 | 0.34 | 0.77 | inhaltshuelle | 22526 | 22332 | +0.9 % | 0.00 | 5.70 | official |
| 10.2 | von der Ebene darunter uebernommen | 37 | 0.34 | 0.77 | inhaltshuelle | 26605 | 22415 | +18.7 % | 7.45 | 5.70 | derived |
| 2.1 | eingemessen | 15 | 0.18 | 0.44 | inhaltshuelle | 9907 | 9580 | +3.4 % | 0.00 | 6.00 | official |
| 2.2 | von der Ebene darunter uebernommen | 15 | 0.18 | 0.44 | inhaltshuelle | 9856 | 9736 | +1.2 % | 7.75 | 6.00 | derived |
| 3.2 | geschaetzt | — | 6.98 | 6.98 | inhaltshuelle | 8384 | 8574 | -2.2 % | 6.50 | 6.45 | derived |
| 4.1 | eingemessen | 6 | 0.00 | 0.00 | inhaltshuelle | 14756 | 14123 | +4.5 % | 0.00 | 5.85 | official |
| 4.2 | von der Ebene darunter uebernommen | 6 | 0.00 | 0.00 | inhaltshuelle | 14805 | 14390 | +2.9 % | 7.60 | 5.85 | derived |
| 5.1 | eingemessen | 39 | 0.94 | 1.46 | inhaltshuelle | 12134 | 12225 | -0.7 % | 0.00 | 5.85 | official |
| 5.2 | von der Ebene darunter uebernommen | 39 | 0.94 | 1.46 | inhaltshuelle | 13811 | 11949 | +15.6 % | 7.60 | 5.85 | derived |
| 6.1 | eingemessen | 4 | 0.04 | 0.05 | inhaltshuelle | 17960 | 20846 | -13.8 % | 0.00 | 11.00 | official |
| 7.1 | eingemessen | 4 | 0.00 | 0.00 | inhaltshuelle | 14268 | 16830 | -15.2 % | 0.00 | 11.00 | official |
| 8.1 | eingemessen | 6 | 0.64 | 1.06 | inhaltshuelle | 14178 | 16830 | -15.8 % | 0.00 | 15.00 | official |
| 9.1 | eingemessen | 4 | 0.00 | 0.00 | inhaltshuelle | 11140 | 13470 | -17.3 % | 0.00 | 11.00 | official |
| F2 | geschaetzt | — | 25.00 | 25.00 | inhaltshuelle | 5434 | — | — | 0.00 | 6.00 | estimated |
| F8 | geschaetzt | — | 25.00 | 25.00 | inhaltshuelle | 12042 | — | — | 0.00 | 6.00 | estimated |
| FB | geschaetzt | — | 25.00 | 25.00 | inhaltshuelle | 6445 | — | — | 0.00 | 6.00 | estimated |

## Verbindungen

Die Anschlussweite ist der Abstand zwischen der Lage aus der Layout-Tabelle
und dem naechsten begehbaren Gangpunkt. Grosse Werte heissen nicht, dass es
den Durchgang nicht gibt -- nur, dass seine Lage grob bekannt ist.

| Verbindung | Art | verbindet | Anschluss (m) |
|---|---|---|--:|
| Durchgang H1 H5 (1.2 ↔ 5.1) | portal | 1.2 ↔ 5.1 | 374 |
| Durchgang H1 H5 (1.2 ↔ 5.2) | portal | 1.2 ↔ 5.2 | 374 |
| Durchgang H1 H4 (1.2 ↔ 4.2) | portal | 1.2 ↔ 4.2 | 330 |
| Durchgang H1 H4 (1.2 ↔ 4.1) | portal | 1.2 ↔ 4.1 | 330 |
| Passage 2-4 (2.1 ↔ 4.1) | portal | 2.1 ↔ 4.1 | 76 |
| Durchgang Halle 3 zu 4 (3.2 ↔ 4.1) | portal | 3.2 ↔ 4.1 | 70 |
| Durchgang Halle 3 zu 4 (3.2 ↔ 4.2) | portal | 3.2 ↔ 4.2 | 70 |
| Passage 2-4 (2.2 ↔ 4.2) | portal | 2.2 ↔ 4.2 | 70 |
| Durchgang Halle 10 zu 9 (10.1 ↔ 9.1) | portal | 10.1 ↔ 9.1 | 59 |
| Durchgang Halle 10 zu 9 (10.2 ↔ 9.1) | portal | 10.2 ↔ 9.1 | 59 |
| Durchgang zwischen Halle 1 und 6 (1.2 ↔ 6.1) | portal | 1.2 ↔ 6.1 | 53 |
| Passage 5-10 (5.1 ↔ 10.1) | portal | 5.1 ↔ 10.1 | 50 |
| Passage 5-10 (5.2 ↔ 10.2) | portal | 5.2 ↔ 10.2 | 50 |
| Passage 4-5 (4.1 ↔ 5.1) | portal | 4.1 ↔ 5.1 | 38 |
| Passage 4-5 (4.2 ↔ 5.2) | portal | 4.2 ↔ 5.2 | 38 |
| Durchgang halle 6 zu 7 (6.1 ↔ 7.1) | portal | 6.1 ↔ 7.1 | 34 |
| Durchgang 7 zu 8 (7.1 ↔ 8.1) | portal | 7.1 ↔ 8.1 | 34 |
| Passage 2-3 (2.2 ↔ 3.2) | portal | 2.2 ↔ 3.2 | 17 |
| Passage 2-3 (2.1 ↔ 3.2) | portal | 2.1 ↔ 3.2 | 12 |
| Zugang Freiflaeche Halle 6 Nord | outdoor | F2 ↔ 6.1 | — |
| Zugang Freiflaeche Halle 8 Nord | outdoor | F8 ↔ 8.1 | — |
| Zugang Freiflaeche Halle 5 Nord | outdoor | FB ↔ 5.1 | — |
| Aufzug 2.1 ↔ 2.2 | vertical | 2.1 ↔ 2.2 | — |
| Rolltreppe 2.1 ↔ 2.2 (West der Treppe) | vertical | 2.1 ↔ 2.2 | — |
| Treppe 2.1 ↔ 2.2 | vertical | 2.1 ↔ 2.2 | — |
| Rolltreppe 2.1 ↔ 2.2 (Ost der Treppe) | vertical | 2.1 ↔ 2.2 | — |
| Aufzug 4.1 ↔ 4.2 | vertical | 4.1 ↔ 4.2 | — |
| Rolltreppe 4.1 ↔ 4.2 (West der Treppe) | vertical | 4.1 ↔ 4.2 | — |
| Treppe 4.1 ↔ 4.2 (20 Stufen) | vertical | 4.1 ↔ 4.2 | — |
| Rolltreppe 4.1 ↔ 4.2 (Ost der Treppe) | vertical | 4.1 ↔ 4.2 | — |
| Aufzug 5.1 ↔ 5.2 | vertical | 5.1 ↔ 5.2 | — |
| Rolltreppe 5.1 ↔ 5.2 (West der Treppe) | vertical | 5.1 ↔ 5.2 | — |
| Treppe 5.1 ↔ 5.2 | vertical | 5.1 ↔ 5.2 | — |
| Rolltreppe 5.1 ↔ 5.2 (Ost der Treppe) | vertical | 5.1 ↔ 5.2 | — |
| Aufzug 10.1 ↔ 10.2 | vertical | 10.1 ↔ 10.2 | — |
| Rolltreppe 10.1 ↔ 10.2 (West der Treppe) | vertical | 10.1 ↔ 10.2 | — |
| Treppe 10.1 ↔ 10.2 (20 Stufen) | vertical | 10.1 ↔ 10.2 | — |
| Rolltreppe 10.1 ↔ 10.2 (Ost der Treppe) | vertical | 10.1 ↔ 10.2 | — |

