from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def slugify(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    cleaned = re.sub(r"[\\/:*?\"<>|]", "-", cleaned)
    return cleaned.strip()


def split_sections(text: str) -> tuple[str, list[str]]:
    summary = ""
    takeaways: list[str] = []
    summary_match = re.search(r"# Summary\s+(.*?)(# Takeaways|\Z)", text, re.S | re.I)
    if summary_match:
        summary = summary_match.group(1).strip()
    takeaways_match = re.search(r"# Takeaways\s+(.*)", text, re.S | re.I)
    if takeaways_match:
        takeaways_text = takeaways_match.group(1)
        takeaways = [
            re.sub(r"^[-*]\s+", "", line).strip()
            for line in takeaways_text.splitlines()
            if line.strip()
        ]
    return summary, takeaways


def build_canvas(title: str, summary: str, takeaways: list[str]) -> dict:
    nodes = []
    edges = []

    root_id = "root"
    nodes.append(
        {
            "id": root_id,
            "type": "text",
            "text": title,
            "x": 0,
            "y": 0,
            "width": 320,
            "height": 80,
        }
    )

    summary_id = "summary"
    summary_text = summary if summary else "Summary"
    nodes.append(
        {
            "id": summary_id,
            "type": "text",
            "text": summary_text,
            "x": 400,
            "y": -160,
            "width": 420,
            "height": 200,
        }
    )
    edges.append({"id": "edge-root-summary", "fromNode": root_id, "toNode": summary_id})

    start_y = 140
    for index, takeaway in enumerate(takeaways[:8], start=1):
        node_id = f"takeaway-{index}"
        nodes.append(
            {
                "id": node_id,
                "type": "text",
                "text": takeaway,
                "x": 400,
                "y": start_y + (index - 1) * 120,
                "width": 420,
                "height": 100,
            }
        )
        edges.append(
            {"id": f"edge-root-{node_id}", "fromNode": root_id, "toNode": node_id}
        )

    return {"nodes": nodes, "edges": edges}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build mindmap canvas from summary.md")
    parser.add_argument("title", type=str, help="Video title")
    parser.add_argument("summary", type=Path, help="summary.md path")
    parser.add_argument("output", type=Path, help="output .canvas path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary_text = args.summary.read_text(encoding="utf-8")
    summary, takeaways = split_sections(summary_text)
    canvas = build_canvas(slugify(args.title), summary, takeaways)
    args.output.write_text(
        json.dumps(canvas, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
