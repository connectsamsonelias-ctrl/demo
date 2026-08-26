"""
Generates a small, fully synthetic aircraft maintenance manual PDF for
testing the ingestion pipeline end to end. All content is made up - not
copied from, or representative of, any real manufacturer manual.

Usage:
    python scripts/generate_synthetic_manual.py --out data/manuals/synthetic_a320_manual.pdf
"""

from __future__ import annotations

import argparse

import pymupdf

PAGES = [
    (
        "ATA 32-21-00 - LANDING GEAR - NOSE GEAR ASSEMBLY",
        [
            "SYNTHETIC TEST DOCUMENT - NOT A REAL MANUAL",
            "",
            "1. Torque Specifications",
            "The nose gear assembly retaining bolt (P/N SYN-32210-01) shall be",
            "torqued to 120 Nm +/- 5 Nm, applied in two stages.",
            "Lubricate threads with approved grease (SYN-LUBE-4) prior to",
            "installation.",
            "",
            "2. Inspection Interval",
            "Inspect nose gear seal integrity every 400 flight hours or 90",
            "days, whichever occurs first.",
            "",
            "3. Safety Warning",
            "WARNING: Ensure aircraft is on jacks and hydraulic pressure is",
            "relieved before removing the retaining bolt.",
        ],
    ),
    (
        "ATA 24-10-00 - ELECTRICAL POWER - MAIN BATTERY BUS",
        [
            "SYNTHETIC TEST DOCUMENT - NOT A REAL MANUAL",
            "",
            "1. Isolation Procedure",
            "Toggle main battery switches to the OFF position before",
            "inspecting any primary electrical bus in the forward",
            "avionics bay.",
            "",
            "2. Reset Procedure",
            "Following a bus trip event (fault code FLT-24-5), reset the",
            "main battery bus switch and confirm nominal voltage",
            "(27.5V DC +/- 1V) before returning aircraft to service.",
        ],
    ),
    (
        "ATA 79-00-00 - ENGINE OIL SYSTEM",
        [
            "SYNTHETIC TEST DOCUMENT - NOT A REAL MANUAL",
            "",
            "1. Oil Specification",
            "Use only approved synthetic turbine oil, specification",
            "SYN-OIL-5606. Do not mix with mineral-based oils.",
            "",
            "2. Servicing Interval",
            "Check oil quantity every 50 flight hours. Top up if below",
            "the MIN mark on the sight gauge; do not exceed MAX.",
        ],
    ),
]


def build_pdf(out_path: str) -> None:
    doc = pymupdf.open()
    for title, body_lines in PAGES:
        page = doc.new_page()
        y = 72
        page.insert_text((72, y), title, fontsize=13, fontname="helv")
        y += 30
        for line in body_lines:
            page.insert_text((72, y), line, fontsize=10, fontname="helv")
            y += 16
    doc.save(out_path)
    doc.close()
    print(f"Wrote synthetic manual with {len(PAGES)} pages -> {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out", default="data/manuals/synthetic_a320_manual.pdf"
    )
    args = parser.parse_args()
    build_pdf(args.out)
