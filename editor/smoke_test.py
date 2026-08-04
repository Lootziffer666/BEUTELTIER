#!/usr/bin/env python3
"""Small standard-library smoke test for the editor builder."""
from __future__ import annotations

import json
from pathlib import Path

from build_editor import build, normalise

ROOT = Path(__file__).parent
SPEC = ROOT / "examples" / "relationship-space.editor.json"


def main() -> None:
    raw = json.loads(SPEC.read_text(encoding="utf-8"))
    model = normalise(raw)
    assert len(model["nodes"]) == 5
    assert len(model["edges"]) == 6
    assert all(edge["source"] in {node["id"] for node in model["nodes"]} for edge in model["edges"])

    output = build(raw)
    assert "/*__MODEL_JSON__*/" not in output
    assert "__DOCUMENT_TITLE__" not in output
    assert "Fallen-Detektor" not in output
    assert "PayPal" not in output
    assert "3D Node Editor" in output
    print("Smoke test passed")


if __name__ == "__main__":
    main()
