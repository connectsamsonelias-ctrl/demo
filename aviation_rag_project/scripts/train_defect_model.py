"""
Fine-tunes a pretrained YOLO-nano checkpoint on the merged aircraft-defect
dataset (see scripts/prepare_cv_dataset.py) and reports real measured
precision/recall/mAP - not just that the model runs.

**Where to run this:** wherever you have real compute for training - this
project's own dev sandbox has no GPU (confirmed directly: no nvidia-smi,
CPU-only, 4 vCPU) and the two reference deployment laptops are known,
from earlier testing in this project, to struggle even with small-model
*inference* - training would be far worse. Your own machine (if it has a
GPU), Google Colab, or another cloud GPU instance are all reasonable
choices; this script doesn't assume which.

Usage:
    python scripts/train_defect_model.py \
        --data data/cv_dataset/data.yaml \
        --model yolov8n.pt \
        --epochs 100 \
        --out models/defect_yolo.pt

The pretrained base checkpoint (yolov8n.pt / yolo11n.pt) downloads
automatically from Ultralytics' GitHub releases on first use - unlike
Roboflow, that host was directly confirmed reachable from this project's
dev sandbox, so this step likely works wherever you run it; if it
doesn't, download the checkpoint manually and pass its local path via
--model instead.

After training, the fine-tuned weights need to be copied to
models/defect_yolo.pt in this repo before `docker build` for
docker/Dockerfile.cv will bake them in (see that Dockerfile's comments).
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def train(
    data_yaml: str,
    base_model: str,
    epochs: int,
    imgsz: int,
    out_path: str,
) -> dict:
    from ultralytics import YOLO

    model = YOLO(base_model)
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        # nano models are already CPU-friendly; keep batch modest so this
        # also runs (slowly) on a machine without a GPU as a fallback.
        batch=16,
    )

    # Validate on the held-out val split to get real, reported metrics -
    # not just "training finished without crashing."
    metrics = model.val()

    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(best_weights, out_path)

    report = {
        "base_model": base_model,
        "epochs": epochs,
        "imgsz": imgsz,
        "precision": float(metrics.box.mp),  # mean precision across classes
        "recall": float(metrics.box.mr),  # mean recall across classes
        "mAP50": float(metrics.box.map50),
        "mAP50-95": float(metrics.box.map),
        "per_class": {
            name: {
                "precision": float(metrics.box.p[i]) if i < len(metrics.box.p) else None,
                "recall": float(metrics.box.r[i]) if i < len(metrics.box.r) else None,
                "ap50": float(metrics.box.ap50[i]) if i < len(metrics.box.ap50) else None,
            }
            for i, name in metrics.names.items()
        },
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="data/cv_dataset/data.yaml")
    parser.add_argument(
        "--model", default="yolov8n.pt", help="Base checkpoint - yolov8n.pt or yolo11n.pt"
    )
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--out", default="models/defect_yolo.pt")
    parser.add_argument(
        "--report", default="docs/cv-training-report.json",
        help="Where to write the measured metrics, for docs/evaluation.md",
    )
    args = parser.parse_args()

    report = train(args.data, args.model, args.epochs, args.imgsz, args.out)

    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, indent=2))

    print(f"\nFine-tuned weights written to: {args.out}")
    print(f"Metrics report written to: {args.report}")
    print(f"\nOverall: precision={report['precision']:.3f} recall={report['recall']:.3f} "
          f"mAP50={report['mAP50']:.3f} mAP50-95={report['mAP50-95']:.3f}")
    print(
        "\nAdd these numbers to docs/evaluation.md's results log before "
        "considering this model ready to bake into docker/Dockerfile.cv - "
        "per this project's documentation policy, don't skip that step."
    )


if __name__ == "__main__":
    main()
