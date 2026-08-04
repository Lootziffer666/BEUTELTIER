#!/usr/bin/env python3
"""Build a neutral, browser-based 3D node editor from JSON.

The editor deliberately does not interpret the graph. Nodes are objects;
edges are typed relationships. Domain-specific analysis belongs in optional
modules or adapters, not in the editor core.

Usage:
    python3 build_editor.py examples/relationship-space.editor.json
    python3 build_editor.py input.json -o editor.html
"""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any

TEMPLATE_PATH = Path(__file__).parent / "editor_template.html"

DEFAULT_GROUPS = {
    "default": {"label": "Standard", "color": "#5b8def"},
}

DEFAULT_RELATION_TYPES = {
    "related": {
        "label": "steht in Beziehung zu",
        "color": "#8b97a7",
        "width": 1.4,
        "particles": 0,
        "directed": True,
    }
}


def _normalise_named_styles(raw: dict[str, Any], defaults: dict[str, Any]) -> dict[str, dict[str, Any]]:
    source = raw or defaults
    out: dict[str, dict[str, Any]] = {}
    for key, value in source.items():
        if isinstance(value, str):
            out[key] = {"label": key, "color": value}
        elif isinstance(value, dict):
            item = dict(value)
            item.setdefault("label", key)
            item.setdefault("color", "#8b97a7")
            out[key] = item
        else:
            raise ValueError(f"Style {key!r} must be a color string or object")
    return out


def normalise(spec: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ValueError("The root JSON value must be an object")

    nodes = spec.get("nodes")
    edges = spec.get("edges", spec.get("links"))
    if not isinstance(nodes, list):
        raise ValueError("spec.nodes must be an array")
    if not isinstance(edges, list):
        raise ValueError("spec.edges must be an array")

    groups = _normalise_named_styles(spec.get("groups", {}), DEFAULT_GROUPS)
    relation_types = _normalise_named_styles(
        spec.get("relation_types", spec.get("edge_types", {})),
        DEFAULT_RELATION_TYPES,
    )

    group_ids = set(groups)
    relation_ids = set(relation_types)
    node_ids: set[str] = set()
    clean_nodes: list[dict[str, Any]] = []

    first_group = next(iter(groups))
    for index, raw_node in enumerate(nodes, start=1):
        if not isinstance(raw_node, dict):
            raise ValueError(f"nodes[{index - 1}] must be an object")
        node = dict(raw_node)
        node_id = str(node.get("id", "")).strip()
        if not node_id:
            raise ValueError(f"nodes[{index - 1}].id is required")
        if node_id in node_ids:
            raise ValueError(f"Duplicate node id: {node_id}")
        node_ids.add(node_id)
        node["id"] = node_id
        node.setdefault("label", node_id)
        node.setdefault("description", "")
        node.setdefault("group", first_group)
        node.setdefault("shape", "box")
        if node["group"] not in group_ids:
            raise ValueError(f"Node {node_id!r} uses unknown group {node['group']!r}")
        clean_nodes.append(node)

    first_relation = next(iter(relation_types))
    clean_edges: list[dict[str, Any]] = []
    edge_ids: set[str] = set()
    for index, raw_edge in enumerate(edges, start=1):
        if not isinstance(raw_edge, dict):
            raise ValueError(f"edges[{index - 1}] must be an object")
        edge = dict(raw_edge)
        source = str(edge.get("source", "")).strip()
        target = str(edge.get("target", "")).strip()
        if source not in node_ids or target not in node_ids:
            raise ValueError(
                f"Edge {index} references unknown nodes: {source!r} -> {target!r}"
            )
        edge_id = str(edge.get("id") or f"edge-{index}")
        if edge_id in edge_ids:
            raise ValueError(f"Duplicate edge id: {edge_id}")
        edge_ids.add(edge_id)
        edge["id"] = edge_id
        edge["source"] = source
        edge["target"] = target
        edge.setdefault("type", first_relation)
        edge.setdefault("label", "")
        edge.setdefault("description", "")
        if edge["type"] not in relation_ids:
            raise ValueError(f"Edge {edge_id!r} uses unknown relation type {edge['type']!r}")
        clean_edges.append(edge)

    meta = dict(spec.get("meta") or {})
    meta.setdefault("title", "3D Node Editor")
    meta.setdefault("subtitle", "Objekte und Beziehungen in einem räumlichen Graphen bearbeiten")

    return {
        "meta": meta,
        "groups": groups,
        "relation_types": relation_types,
        "nodes": clean_nodes,
        "edges": clean_edges,
    }


def build(spec: dict[str, Any]) -> str:
    model = normalise(spec)
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    payload = json.dumps(model, ensure_ascii=False, indent=2).replace("</", "<\\/")

    replacements = {
        "__DOCUMENT_TITLE__": html.escape(str(model["meta"]["title"]), quote=True),
        "/*__MODEL_JSON__*/": payload,
    }
    output = template
    for token, value in replacements.items():
        if token not in output:
            raise ValueError(f"Template token missing: {token}")
        output = output.replace(token, value)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a neutral 3D node editor from JSON")
    parser.add_argument("spec", type=Path, help="Path to an *.editor.json file")
    parser.add_argument("-o", "--output", type=Path, default=None, help="Output HTML path")
    args = parser.parse_args()

    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    output = args.output or args.spec.with_suffix(".html")
    output.write_text(build(spec), encoding="utf-8")
    print(f"Written: {output}")


if __name__ == "__main__":
    main()
