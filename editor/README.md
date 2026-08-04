# 3D Node Editor

Ein neutraler, node-basierter 3D-Editor für **Objekte und ihre Beziehungen**.

Dieser Stand ist bewusst ein neutraler Editor und kein fachliches Analysewerkzeug. Er kennt keine „guten“ oder „schlechten“ Beziehungen und keine fest eingebauten Rollen. Der Editor zeigt und bearbeitet ausschließlich das, was im Modell steht:

- **Nodes** sind Objekte.
- **Edges** sind gerichtete oder ungerichtete Beziehungen.
- **Groups** bestimmen die visuelle Gruppierung der Nodes.
- **Relation Types** bestimmen Darstellung und Bedeutung der Edges.

Prozessdarstellung, Wissensgraphen, Codeanalyse und andere Aufgaben können später über eigene Datenadapter und optionale Module auf diesen neutralen Kern aufsetzen.

## Enthalten

- interaktiver Force-Graph in 3D
- verschiedene Node-Formen
- frei konfigurierbare Gruppen und Beziehungstypen
- Node-Inspector mit ein- und ausgehenden Beziehungen
- Edge-Inspector zum Bearbeiten einzelner Beziehungen
- Nodes und Beziehungen im Browser hinzufügen und löschen
- JSON importieren, bearbeiten und exportieren
- Fokusansicht: ausgewähltes Objekt und direkte Nachbarn werden hervorgehoben

## Nicht enthalten

- automatische Interpretation von Schleifen oder Fehlern
- fest eingebaute Prozesslogik
- getrennte fachliche Wahrheitsschichten
- fest eingebaute Domänenbegriffe
- statischer Diagrammrenderer

## Start

```bash
python3 build_editor.py examples/relationship-space.editor.json
```

Danach `examples/relationship-space.editor.html` im Browser öffnen.

Die erzeugte HTML-Datei lädt Three.js und 3d-force-graph über ein CDN. Für die Darstellung ist daher eine Internetverbindung erforderlich; die Modelldaten selbst bleiben in der HTML-Datei.

## Datenmodell

```json
{
  "meta": {
    "title": "Beziehungsraum",
    "subtitle": "Ein neutrales Beispiel"
  },
  "groups": {
    "concept": { "label": "Konzept", "color": "#5b8def" },
    "data": { "label": "Daten", "color": "#43b581" }
  },
  "relation_types": {
    "depends": {
      "label": "hängt ab von",
      "color": "#8b7cf6",
      "width": 1.8,
      "particles": 2,
      "directed": true
    }
  },
  "nodes": [
    {
      "id": "view",
      "label": "Ansicht",
      "description": "Eine mögliche Darstellung des Modells",
      "group": "concept",
      "shape": "box"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "view",
      "target": "data",
      "type": "depends",
      "label": "liest"
    }
  ]
}
```

### Node-Felder

| Feld | Bedeutung |
|---|---|
| `id` | stabile, eindeutige ID |
| `label` | sichtbarer Name |
| `description` | optionale Beschreibung |
| `group` | visuelle Gruppe |
| `shape` | `box`, `sphere`, `diamond`, `pill`, `cylinder`, `octagon` |

### Edge-Felder

| Feld | Bedeutung |
|---|---|
| `id` | stabile, eindeutige ID |
| `source` | Quell-Node |
| `target` | Ziel-Node |
| `type` | Beziehungstyp |
| `label` | optionale konkrete Beschriftung |
| `description` | optionale Erläuterung |

### Relation-Type-Felder

| Feld | Bedeutung |
|---|---|
| `label` | Name des Beziehungstyps |
| `color` | Linienfarbe |
| `width` | Linienstärke |
| `particles` | Anzahl animierter Richtungspartikel |
| `directed` | zeigt einen Richtungspfeil, wenn `true` |

## Architekturgrenze

Der Editor ist die **Darstellungs- und Bearbeitungsschicht**. Er entscheidet nicht, was ein Graph bedeutet.

Spätere Erweiterungen sollten deshalb außerhalb des Kerns bleiben:

```text
Domänenmodell / Analyse / Adapter
                ↓
neutrales Node-Edge-Modell
                ↓
3D Node Editor
```
