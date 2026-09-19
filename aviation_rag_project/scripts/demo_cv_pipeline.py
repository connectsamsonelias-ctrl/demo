"""
End-to-end demo runner for the CV defect-check pipeline: sends a handful
of sample images through the live /query/image endpoint and prints a
readable summary - built for the FSID pitch demo, not for automated
testing (see tests/test_cv_inference.py and tests/test_query_image.py
for that).

Requires the full stack already running:
    docker compose -f docker/docker-compose.yml --env-file .env \
        --profile cv up --build

Usage:
    python scripts/demo_cv_pipeline.py \
        --images-dir data/cv_dataset/test/images \
        --count 8 \
        --tail-number VT-IAF01 \
        --ata-chapter 53
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import httpx


def run_demo(
    base_url: str,
    api_key: str,
    images_dir: Path,
    count: int,
    tail_number: str,
    ata_chapter: str,
    aircraft_type: str,
) -> None:
    image_paths = sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.png"))
    if not image_paths:
        raise SystemExit(f"No .jpg/.png images found in {images_dir}")

    sample = random.sample(image_paths, min(count, len(image_paths)))

    print(f"Running {len(sample)} images through {base_url}/query/image\n")
    print("=" * 78)

    for i, image_path in enumerate(sample, 1):
        with open(image_path, "rb") as f:
            response = httpx.post(
                f"{base_url}/query/image",
                headers={"X-API-Key": api_key},
                data={
                    "wonum": f"DEMO-{i}",
                    "tail_number": tail_number,
                    "ata_chapter": ata_chapter,
                    "aircraft_type": aircraft_type,
                },
                files={"image": (image_path.name, f, "image/jpeg")},
                timeout=60.0,
            )

        print(f"[{i}/{len(sample)}] {image_path.name}")
        if response.status_code != 200:
            print(f"  ERROR {response.status_code}: {response.text}")
            print("-" * 78)
            continue

        body = response.json()
        top_detections = body["cv_detections"][:3]
        if top_detections:
            print("  Detected:", ", ".join(
                f"{d['defect_type']} ({d['confidence']:.2f})" for d in top_detections
            ))
        else:
            print("  Detected: nothing above confidence threshold")

        if body["found"]:
            print(f"  Retrieved manual section: found (see full dossier via API)")
        else:
            print(f"  Result: {body['message']}")

        print("-" * 78)

    print(
        "\nReminder for the pitch: every result above carries "
        "TRIAGE AID ONLY / NOT A CERTIFIED INSPECTION DECISION - say this "
        "out loud when presenting, don't just let the disclaimer sit in "
        "the JSON."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--images-dir", required=True, type=Path)
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument("--tail-number", default="VT-IAF01")
    parser.add_argument("--ata-chapter", default="53")
    parser.add_argument("--aircraft-type", default="Airbus-A320")
    args = parser.parse_args()

    run_demo(
        args.base_url,
        args.api_key,
        args.images_dir,
        args.count,
        args.tail_number,
        args.ata_chapter,
        args.aircraft_type,
    )


if __name__ == "__main__":
    main()
