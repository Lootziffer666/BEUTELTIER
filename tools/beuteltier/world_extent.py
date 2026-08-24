"""Verbindlicher amtlicher Ausschnitt fuer die BEUTELTIER-Aussenwelt.

Die Grenze ist auf volle UTM-Kilometerkacheln gerundet. Sie umfasst westlich
die Koelner Innenstadt jenseits des Rheins, den Bahnhof Koeln Messe/Deutz und
das Messegelaende sowie oestlich die Messeparkhaeuser und die A3. DOP, DGM
und spaeter die weitere LoD2-Umgebung muessen dieselbe Grenze verwenden,
damit keine Ebene optisch gestreckt oder gegen eine andere Abdeckung gelegt
wird.
"""
from __future__ import annotations

WORLD_BOUNDS = (355000.0, 5644000.0, 362000.0, 5647000.0)
# Der aktuell ausgelieferte LoD2-Messebau ist noch bewusst enger als die
# beschaffte Welt. Terrain darf nur dort unter Gebaeuden ausgespart werden,
# wo dieselben amtlichen LoD2-Flaechen auch wirklich gerendert werden.
ACTIVE_LOD2_BOUNDS = (357700.0, 5645200.0, 358900.0, 5646500.0)
TILE_SIZE_M = 1000
DOP_VINTAGE = "2025"


def kilometre_tiles(
    bounds: tuple[float, float, float, float] = WORLD_BOUNDS,
) -> tuple[tuple[int, int], ...]:
    """Gibt die halb-offenen 1-km-Kacheln einer gerundeten Grenze zurueck."""
    min_x, min_y, max_x, max_y = bounds
    values = (min_x, min_y, max_x, max_y)
    if any(value % TILE_SIZE_M for value in values):
        raise ValueError(f"Weltausschnitt liegt nicht auf 1-km-Grenzen: {bounds}")
    if min_x >= max_x or min_y >= max_y:
        raise ValueError(f"Weltausschnitt ist leer: {bounds}")
    return tuple(
        (x // TILE_SIZE_M, y // TILE_SIZE_M)
        for y in range(int(min_y), int(max_y), TILE_SIZE_M)
        for x in range(int(min_x), int(max_x), TILE_SIZE_M)
    )
