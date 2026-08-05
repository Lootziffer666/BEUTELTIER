# BEUTELTIER

Prozedurale Gamescom / Koelnmesse Three.js-Pipeline. Generiert komplette Messehallen inkl. Architektur, Outdoor, Crowd-Control, Möblierung, Sicherheit, Messe-Tech, Stände, F&B, Atmosphäre — und jetzt auch **Behavior-Tree-gesteuerte Crowd-Agenten** mit absurden Gag-Ständen und einem trockenen Meta-Erzähler.

## Struktur

```
src/
├── behavior/
│   ├── BehaviorTree.js         # Core BT Engine (Sequence, Selector, Parallel, Action, Condition)
│   ├── Blackboard.js           # Agenten-Gedächtnis (Bedürfnisse, Inventar, Zustand)
│   ├── MesseNodes.js           # Alle Verhaltensweisen (Toilette, Queue, Merch, AGB, Petting, ...)
│   └── AbsurdStands.js         # Interaktive Gag-Stände (Lootbox-Toilette, Exit-Simulator, AGB-Boss, ...)
├── generators/
│   ├── ArchitectureGenerator.js
│   ├── OutdoorGenerator.js
│   ├── CrowdControlGenerator.js
│   ├── FurnitureGenerator.js
│   ├── SafetyGenerator.js
│   ├── TechGenerator.js
│   ├── BoothGenerator.js
│   └── FnbGenerator.js
├── materials/
│   ├── KoelnmesseMaterials.js
│   └── ProceduralTextures.js
├── systems/
│   ├── AtmosphereSystem.js
│   ├── LightingRig.js
│   ├── PostProcessingStack.js
│   ├── CollisionSystem.js
│   ├── NavMeshGenerator.js
│   ├── NarratorSystem.js       # 40+ generische + 15 reaktive Zeilen
│   └── PlayerObserver.js       # Spieler-Tracking für den Erzähler
├── integration/
│   └── CrowdBehavior.js        # BT + Crowd + Animation
├── data/
│   └── PressKitLoader.js
└── main.js                     # Vollständige Integration + Game-Loop
```

## Features

- **Behavior Trees**: Sequence, Selector, Parallel, Condition, Action, Inverter
- **Agenten-Bedürfnisse**: Blase, Hunger, Energie, Geduld, Neugier
- **Lootbox-Toilette**: 3 Kabinen mit zufälliger Seltenheit
- **AGB-Bosskampf**: 30-Sekunden-Scroll-Action
- **Exit-Simulator**: Agenten laufen 8 Sekunden im Kreis
- **NPC-Streichelzoo**: Dialog-Platzhalter zum Streicheln
- **Meta-Erzähler**: Trockene Kommentare auf Spieleraktionen (Springen, Rückwärtslaufen, Idle, Sturz, ...)
- **500 Crowd-Agenten** mit InstancedMesh, RVO-Kollisionsvermeidung, Geh-Animation

## Starten

```bash
npm install
npm run dev
```

## Steuerung

- `WASD` — Bewegung
- `Maus` — Umschauen (Klick für Pointer Lock)
- Der Erzähler kommentiert live im unteren Bildschirmbereich
