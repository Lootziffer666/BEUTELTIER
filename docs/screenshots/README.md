# Automatisch erzeugte Viewer-Screenshots

Der Workflow `Viewer-Screenshots` startet die bestehende PWA, spielt ihren
Browser-Akzeptanzablauf durch und schreibt die dabei erzeugten PNG-Dateien in
dieses Verzeichnis. Die Bilddateien werden ausschließlich in GitHub Actions
erzeugt und von dessen Bot eingecheckt; lokale Änderungen enthalten daher
keine neu erzeugten Binärdateien.

Der Workflow wird ausschließlich manuell über `workflow_dispatch` gestartet.
Dadurch erzeugen normale App-Commits weder kostspielige Browserläufe noch
ungeplante Bot-Commits.

Die ersten drei Aufnahmen zeigen das Gelände aus reproduzierbar gedrehten und
gezoomten Nordost-, Südost- und Westperspektiven. Die weiteren Bilder halten
die Stationen des Browser-Akzeptanzablaufs fest.

Jeder Lauf lädt die PNG-Dateien zusätzlich als Workflow-Artefakt hoch. Sind
die Bildinhalte gegenüber dem Repository unverändert, ist der Commit-Schritt
erfolgreich, erzeugt aber absichtlich keinen leeren Commit. Ein fehlgeschlagener
Akzeptanzlauf wird direkt am E2E-Schritt rot angezeigt; die bis dahin erzeugten
Bilder werden durch die nachfolgenden `if: always()`-Schritte trotzdem gesichert.
