# Automatisch erzeugte Viewer-Screenshots

Der Workflow `Viewer-Screenshots` startet die bestehende PWA, spielt ihren
Browser-Akzeptanzablauf durch und schreibt die dabei erzeugten PNG-Dateien in
dieses Verzeichnis. Die Bilddateien werden ausschließlich in GitHub Actions
erzeugt und von dessen Bot eingecheckt; lokale Änderungen enthalten daher
keine neu erzeugten Binärdateien.

Der Workflow kann manuell gestartet werden und läuft außerdem bei Änderungen
an der App. Sein Bot-Commit löst keinen weiteren Screenshot-Lauf aus.
