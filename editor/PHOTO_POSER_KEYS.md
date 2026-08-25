# Photo Poser — feste Bedienlogik

- `0` — Ghosts aus / nur GLB
- `1` — normales Foto
- `2` — Alpha-Ghost
- `3` — Kanten-Ghost
- `4` — Frustum/Ray-Ghost
- `5` — Difference/Overlap
- Mausrad — aktives Foto wechseln
- Linksklick — aktives Foto aufnehmen / ablegen
- Rechts ziehen — Ansicht um das Modell drehen
- Mittlere Maustaste ziehen — Ansicht verschieben
- `Tab` — Photo-Menü öffnen/schließen; 3D-Steuerung wird dabei pausiert
- `Ctrl/Cmd+Z` — Undo
- `Ctrl/Cmd+Y` oder `Ctrl/Cmd+Shift+Z` — Redo
- `Enter` — aktuelle Pose speichern

Die Zahlenreihe ist bewusst von normal nach diagnostisch geordnet: sehen → überblenden → Kanten prüfen → Strahlen/Frustum prüfen → Ansichten gegeneinander vergleichen.
