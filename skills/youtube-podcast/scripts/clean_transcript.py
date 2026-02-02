from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def normalize_text(text: str) -> str:
    """Removes extra whitespace and newlines from a snippet of text."""
    cleaned = text.replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned.strip())
    # Remove some common artifacts from certain extraction sites
    cleaned = cleaned.replace(" >> ", " ").replace(">>", " ")
    return re.sub(r"\s+", " ", cleaned).strip()


def clean_transcript(input_path: Path, output_path: Path) -> None:
    """Reads raw text, handles JSON chunks if present, and formats to timestamp + sentence."""
    raw_content = ""
    try:
        # Some extraction methods save raw chunks as JSON strings
        with input_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    # Attempt to decode as JSON string (handles escaped characters like \n)
                    part = json.loads(line)
                    raw_content += part
                except json.JSONDecodeError:
                    # If not JSON, append as-is
                    raw_content += line
    except Exception as e:
        print(f"Error reading input: {e}")
        return

    # Fix potential escaped newlines that weren't caught
    raw_content = raw_content.replace("\\n", "\n")

    # Split by lines and start processing
    lines = raw_content.split("\n")
    cleaned_lines: list[str] = []
    current_timestamp: str | None = None
    current_text: list[str] = []

    # Regex for standard timestamps (00:00, 0:00, 1:22:33)
    timestamp_pattern = re.compile(r"^(\d{1,2}:)?\d{1,2}:\d{2}$")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if timestamp_pattern.match(line):
            # Save the previous segment before starting a new one
            if current_timestamp and current_text:
                cleaned_lines.append(f"{current_timestamp} {' '.join(current_text)}")
            current_timestamp = line
            current_text = []
        else:
            if current_timestamp:
                current_text.append(line)

    # Add the final segment
    if current_timestamp and current_text:
        cleaned_lines.append(f"{current_timestamp} {' '.join(current_text)}")

    # Repetition check (common when scraping transcripts from sites that repeat from 0:00)
    final_output: list[str] = []
    if cleaned_lines:
        start_ts = cleaned_lines[0].split(" ")[0]
        repetition_index = -1
        # Typically repeat starts at 00:00 or 0:00
        if start_ts in ["00:00", "0:00"]:
            for i in range(1, len(cleaned_lines)):
                # Look for the start timestamp appearing again at the beginning of a line
                if cleaned_lines[i].startswith(start_ts + " "):
                    repetition_index = i
                    break

        if repetition_index != -1:
            print(f"Detected repetition at segment {repetition_index}. Truncating.")
            final_output = cleaned_lines[:repetition_index]
        else:
            final_output = cleaned_lines

    try:
        output_path.write_text("\n".join(final_output) + "\n", encoding="utf-8")
        print(f"Successfully cleaned transcript to: {output_path}")
    except Exception as e:
        print(f"Error writing output: {e}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean transcript to timestamp + sentence lines."
    )
    parser.add_argument("input", type=Path, help="Input transcript text file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        required=True,
        help="Output markdown file path",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    clean_transcript(args.input, args.output)


if __name__ == "__main__":
    main()
