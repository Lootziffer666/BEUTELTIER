# PRD · BEUTELTIER

**Stand:** 04.08.2026  
**Status:** MVP im Aufbau  
**Produktname:** **BEUTELTIER**  
**Maskottchen:** **Lootzy** – ein Rucksack in Känguru-Optik, dessen Rückseite im Profil ein **B** bildet  
**Claim:** *Finde Beute. Finde den Weg.*

---

## 1. Kurzbeschreibung

**BEUTELTIER** ist eine mobile Gamescom-Begleitapp, die bisher getrennte Informationen in einen nutzbaren Ablauf verbindet:

- Gamescom-Epix-Quests, Lösungen und Rewards
- Goodie- und Aktionsmeldungen aus Community-Quellen
- Aussteller, Spiele, Hallen und Standnummern
- eine brauchbare Karte des Koelnmesse-Geländes
- Routing über Hallen, Ebenen, Passagen und wechselnde Absperrungen
- Übergaben an Spezialangebote wie die Indie Arena Booth App

Die App beantwortet nicht nur **„Wo ist etwas?“**, sondern vor allem:

> **Was ist neu, wo befindet es sich, wie komme ich unter den aktuellen Bedingungen dorthin und lohnt sich der Weg noch?**

---

## 2. Ausgangsproblem

Die für einen Gamescom-Besuch nötigen Informationen sind über mehrere Orte verteilt:

- Epix-Quests und Lösungen bei GamingPartys und im Discord
- Goodies und kurzfristige Aktionen bei Goodie Guide/Farbklecks und Community-Servern
- Aussteller und Stände im offiziellen Gamescom-Verzeichnis
- Hallenpläne bei Gamescom, GamesWirtschaft und Koelnmesse
- Detailkarten einzelner Bereiche in eigenen Apps, etwa der Indie Arena Booth App

Die offiziellen Karten zeigen die Gebäude, aber die tatsächlichen Laufwege sind häufig unklar oder ändern sich durch:

- gesperrte Übergänge
- reine Ein- oder Ausgänge
- Einbahnführung
- wechselnde Rolltreppenrichtungen
- unterschiedliche Consumer-, Business- und Pressezugänge
- temporäre Umleitungen und Überfüllung

BEUTELTIER wird deshalb kein weiterer statischer Hallenplan, sondern ein **verknüpftes Informations- und Wegenetz**.

---

## 3. Zielgruppen

### Primär

- Gamescom-Besucher, die Goodies, Quests, Spiele und Aktionen gezielt abarbeiten möchten
- wiederkehrende Besucher, die die absurden Laufwege kennen und effizienter navigieren wollen
- Besucher, die nicht ständig mehrere Webseiten, Discords und Apps beobachten möchten

### Sekundär

- Community-Betreiber wie GamingPartys und Goodie Guide
- Aussteller und Spezialbereiche wie Indie Arena Booth
- Helfer, die Wege, Sperren und neue Funde bestätigen

---

## 4. Produktziele

1. Epix-Quests eines Jahres schnell erfassen, abarbeiten und als SteamGifts-Post exportieren.
2. Goodie- und Aktionsmeldungen mit konkreten Ausstellern und Standorten verbinden.
3. Spiele und Aussteller über alle ihre Standorte hinweg auffindbar machen.
4. Besucher über tatsächlich nutzbare Wege zwischen Hallen und Ebenen führen.
5. Sperren, Einbahnrichtungen und Umleitungen ohne Neubau der Karte schaltbar machen.
6. Bestehende Spezial-Apps nicht kopieren, sondern sinnvoll anbinden.
7. Quellen und Credits sichtbar erhalten.

---

## 5. Kernmodule

## 5.1 Epix Hub

Der Epix-Bereich verwaltet Gamescom-Epix-Inhalte nach **Jahr**, **Tag** und **Typ**.

### Funktionen

- Links von GamingPartys erfassen, die zu `gamescom.global` führen
- Questtitel, Datum, Reward, Aktion und Lösung speichern
- zwischen **digital** und **vor Ort** unterscheiden
- Kampagnenfenster als 28-Tage-Zeitraum bis zum letzten Sonntag im August abbilden; der Start kann dadurch im Juli liegen
- aktuelle Links nacheinander mit einstellbarer Verzögerung in Tabs öffnen
- erledigte, offene und manuelle Aufgaben markieren
- Quizantworten direkt beim jeweiligen Eintrag speichern
- Gamescom-Links im eingeloggten Browser abarbeiten
- vollständigen SteamGifts-Markdown exportieren
- ältere Jahre weiter einsehbar halten

### Wichtig

Der Epix Hub ist kein unsichtbarer Account-Bot. Er arbeitet sichtbar im normalen Browser und pausiert bei Aufgaben, die echte Nutzerinteraktion benötigen.

---

## 5.2 Live- und Quellenfeed

BEUTELTIER sammelt Hinweise aus autorisierten oder öffentlich sichtbaren Quellen in einem gemeinsamen Feed.

### Geplante Quellen

- GamingPartys-Webseite und Bot-Meldungen
- GamingPartys-Discord, insbesondere neue Epix-Quests und Lösungen
- Goodie Guide/Farbklecks
- Gamescom-Community-Server
- manuell eingetragene oder geteilte Funde

### Prinzip

- zunächst read-only beziehungsweise durch manuelles Einfügen
- keine Kontrolle über fremde Discord-Server
- keine automatischen Nachrichten im Namen des Nutzers
- jede Meldung behält Quelle, Zeit, Status und Vertrauensgrad

---

## 5.3 Aussteller-, Spiele- und Standregister

Ein Aussteller ist **kein einzelner Ort**. Derselbe Aussteller kann mehrere Consumer- und Business-Stände besitzen. Gleichzeitig können Gemeinschaftsstände viele Aussteller enthalten.

### Grundbeziehung

```text
Aussteller ← Standbelegung → Standfläche
```

### Aktueller Datenstand

Der Gamescom-Collector hat aus der offiziellen Ausstellersuche bereits einen Editor-Graphen mit folgenden Metadaten erzeugt:

- **1.520 Aussteller**
- **447 erkannte Stände**
- Hallen und Hallenebenen als eigene Nodes
- gerichtete Beziehungen `Halle enthält Stand` und `Aussteller belegt Stand`

Quelle im Projekt: `gamescom-2026-aussteller.editor.json`

### Noch zu bereinigen

Einige gekoppelte Standangaben werden noch zusammengezogen, zum Beispiel:

```text
C030aD029a → C030a + D029a
B030gC031g → B030g + C031g
```

Der Collector bleibt als jährlicher Importweg erhalten.

---

## 5.4 Goodie- und Aktionskarte

Goodies, Gewinnspiele, Stempelaktionen, Meetups und begrenzte Rewards werden an konkrete Stand-Placements gehängt.

### Ein Goodie-Eintrag enthält mindestens

- Titel
- Beschreibung oder Bild
- Quelle
- Zeitpunkt
- Jahr und Veranstaltungstag
- Aussteller oder Bereich
- Halle und Stand, falls bekannt
- Status: unbestätigt, bestätigt, veraltet, beendet
- Verfügbarkeit: digital, vor Ort oder beides

### Verhalten

- Bei eindeutigem Stand wird direkt dorthin geroutet.
- Bei mehreren Placements wird der passende Consumer-/Business-Stand gewählt.
- Bei unklarer Meldung zeigt die App mehrere mögliche Ziele statt zu raten.
- Ein Fund kann später mit Restbestand, Wartezeit und Nutzerbestätigungen ergänzt werden.

---

## 5.5 Karte und Routing

Die Karte besteht aus einem räumlichen Gesamtgraphen und Hallen-Subgraphen.

### Feste Geometrie

- Gelände und Hallenpositionen
- Hallenebenen
- Boulevard, Piazza und Außenwege
- Haupteingänge Nord, Ost, Süd, West und Confex
- physisch vorhandene Hallenübergänge
- Aufzüge
- Treppen und Rolltreppen, sobald bestätigt
- Standflächen und Standcodes

### Dynamische Zustände

Jeder relevante Übergang kann mindestens folgende Zustände besitzen:

- offen
- geschlossen
- nur Eingang
- nur Ausgang
- Einbahnrichtung
- links herum geführt
- rechts herum geführt
- überfüllt
- unbestätigt
- nur bestimmte Zugangsgruppe

### Architektur

Eine Halle ist im Gesamtgraphen ein Container, intern aber ein eigener Subgraph:

```text
Geländegraph
└── Halle 10.2
    ├── Portale
    ├── Wege und Kreuzungen
    ├── Treppen / Rolltreppen / Aufzüge
    ├── Standzugänge
    └── Spezialbereiche
```

Stände werden nicht direkt an einen Hallen-Node gehängt, sondern an den nächstgelegenen erreichbaren Gang beziehungsweise Standzugang.

### Erste Routing-Demo

Der erste belastbare vertikale Schnitt umfasst:

- Halle 5.2
- Halle 6
- Halle 10.2
- Indie Arena Booth als Zielbereich
- mindestens zwei alternative Übergänge
- mindestens einen Ebenenwechsel
- mindestens eine schaltbare Sperre oder Einbahnregel
- Neuberechnung der Route nach einer Zustandsänderung

---

## 5.6 3D-Node-Editor

Als Unterbau existiert bereits ein neutraler 3D-Node-Editor auf Basis von Three.js und `3d-force-graph`.

### Bereits vorhanden

- Nodes und Beziehungen im 3D-Raum
- unterschiedliche Gruppen, Formen und Beziehungstypen
- gerichtete Kanten
- JSON-Import und -Export
- feste `x/y/z`- beziehungsweise `fx/fy/fz`-Koordinaten
- Bearbeitung von Nodes und Kanten

### Für BEUTELTIER zu ergänzen

- persistente Speicherung verschobener Positionen
- Start- und Zielauswahl
- Routing über erlaubte Kanten
- Kantengewichte für Strecke, Gedränge und Umwege
- Schalter für offene, gesperrte und gerichtete Verbindungen
- Hallen- und Ebenenfilter
- vereinfachte mobile Kartenansicht

Quellen im Projekt:

- `relationship-space.editor.html`
- `node-editor-3d-clean.zip`
- `markDown1785789480351.md` als früher Graphgenerator/Prototyp

---

## 5.7 Indie Arena Booth

Die Indie Arena Booth wird räumlich als **ein Compound-Stand** behandelt, nicht als über hundert einzelne Routingziele.

### In BEUTELTIER

- IAB als großer Block in Halle 10.2
- alle dort gezeigten Spiele und Studios bleiben suchbar
- jede Suche führt zunächst zum IAB-Block
- ein Klick öffnet anschließend die Indie Arena Booth App
- falls die App fehlt, wird der Play Store geöffnet

### Später mit Kooperation

- Deep Link zu einem konkreten Spiel
- Übergabe der internen Spiel-ID
- Rücksprung von der IAB-App zur Gamescom-Route
- mögliche offizielle Vorstellung oder Partnerschaft

BEUTELTIER ersetzt die interne IAB-Karte ausdrücklich nicht.

---

## 6. Produktsprache und Branding

### Marke

- **BEUTELTIER** – App und Produkt
- **Lootzy** – Maskottchen und Guide

Lootzy ist ein **Rucksack in Känguru-Optik**. Die rechte Rückseite beziehungsweise Seitenansicht bildet ein stilisiertes **B**. Das Maskottchen soll nicht wie ein generisches Känguru mit Rucksack wirken; der Rucksack selbst ist das Beuteltier.

### Funktionsbegriffe

- **Loot-Ziffer** – bewertet, wie lohnend ein Ziel aktuell ist
- **Beutezug** – optimierte Route über mehrere Ziele
- **Pouch-Ouch** – Taschenfüllstand und Belastung
- **Hoarder Border** – Grenze, ab der sich ein Weg für einen Fund nicht mehr lohnt
- **Funkwache** – neue Meldungen aus Quellen und Community
- **Lutzi-Modus** – maximale Beute, minimale Vernunft; humorvoller optionaler Modus

---

## 7. MVP-Umfang

Der erste vorzeigbare MVP muss nicht die gesamte Koelnmesse vollständig modellieren.

### Muss enthalten

1. Epix-Links und Lösungen importieren oder eintragen
2. Epix-Links zeitversetzt nacheinander öffnen
3. Aufgabenstatus speichern
4. SteamGifts-Markdown erzeugen
5. Aussteller und Stände aus dem Collector durchsuchen
6. Goodie oder Spiel mit einem Stand verbinden
7. Routing zwischen drei Hallen demonstrieren
8. einen Zugang sperren und die Route neu berechnen
9. IAB als Compound-Stand anzeigen und deren App öffnen
10. mobil als PWA oder browserbasierte App nutzbar sein

### Darf zunächst manuell sein

- Wege und Portale einer Halle einzeichnen
- Sperren melden
- Goodie-Meldungen einfügen
- Treppen und Rolltreppen bestätigen
- unsichere Wege als `remembered` oder `unconfirmed` markieren

---

## 8. Nicht-Ziele des ersten MVP

- keine vollständige Indoor-GPS-Navigation
- keine garantierte Zentimeterposition innerhalb einer Halle
- kein Ersatz für die Indie Arena Booth App
- kein Bot mit Schreib- oder Moderationsrechten auf Discord
- keine CAPTCHA- oder Schutzmechanismus-Umgehung
- keine Behauptung, unbestätigte Wege seien sicher offen
- keine manuelle Screenshot-Erfassung aller 75 Ausstellerseiten

---

## 9. Erfolgskriterien

Der MVP gilt als bewiesen, wenn ein Nutzer folgenden Ablauf durchführen kann:

```text
Neue Epix- oder Goodie-Meldung
        ↓
Eintrag in BEUTELTIER
        ↓
Aussteller / Stand automatisch oder manuell zugeordnet
        ↓
Route vom aktuellen Hallenpunkt berechnet
        ↓
Sperre wird eingeschaltet
        ↓
Alternative Route erscheint
        ↓
Fortschritt oder SteamGifts-Post wird exportiert
```

Zusätzlicher Erfolg:

- Justin/GamingPartys erkennt die App als sinnvolle Ausführungsschicht für Epix.
- Farbklecks/Goodie Guide erkennt sie als Karten- und Routing-Erweiterung für Goodie-Daten.
- Indie Arena Booth sieht sie als Zubringer statt als Konkurrenz.

---

## 10. Aktueller Stand

### Erledigt oder bewiesen

- Produktname **BEUTELTIER**
- Maskottchenname **Lootzy**
- Grundidee und Produktsprache
- 3D-Node-Editor als technischer Unterbau
- erster Hallen- und Passagegraph als Prototyp
- offizielle und historische Kartenquellen identifiziert
- Aussteller-Collector erstellt und erfolgreich ausgeführt
- 2026er Ausstellergraph mit 1.520 Ausstellern und 447 Ständen erzeugt
- Viele-zu-viele-Modell zwischen Ausstellern und Standflächen bestätigt
- Indie Arena Booth als Compound-Stand festgelegt

### Nächste konkrete Schritte

1. Parser für gekoppelte Standcodes bereinigen
2. Epix-Modul mit Import, Status und SteamGifts-Export fertigstellen
3. Geländegraph für Halle 5.2, 6 und 10.2 aufbauen
4. reale Portale und Ebenenwechsel eintragen
5. Routing und Kantenzustände ergänzen
6. erste Goodie-Meldung an einen echten Stand hängen
7. mobile Demo veröffentlichen und Justin sowie Farbklecks schicken

---

## 11. Leitprinzipien

1. **Quellen verbinden, nicht enteignen.** Credits bleiben sichtbar.
2. **Keine falsche Präzision.** Unsicherheit wird ausdrücklich angezeigt.
3. **Geometrie und Topologie gehören zusammen.** Ein Weg muss räumlich und operativ stimmen.
4. **Spezial-Apps werden angebunden statt kopiert.**
5. **Der Nutzer kann jederzeit korrigieren.** Live-Realität schlägt importierte Annahmen.
6. **Eine Meldung soll zu einer Handlung führen.** Nicht nur anzeigen, sondern öffnen, routen, priorisieren oder exportieren.

---

## 12. Ein-Satz-Pitch

> **BEUTELTIER verbindet Epix, Goodies, Aussteller und die tatsächlich nutzbaren Gamescom-Wege zu einer App, die sagt, was sich gerade lohnt und wie man wirklich hinkommt.**
