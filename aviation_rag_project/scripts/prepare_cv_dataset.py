"""
Downloads and merges the two Roboflow aircraft-defect datasets into one
normalized YOLO-format dataset, ready for scripts/train_defect_model.py.

**This script needs to run on a machine that can reach Roboflow** -
universe.roboflow.com is blocked by this development sandbox's own
network policy (confirmed directly, not assumed), so downloading and
running this step happened outside the environment these files were
authored in. Run it wherever you're doing the actual fine-tuning.

Requires a free Roboflow account and API key (roboflow.com -> Settings ->
API Keys) - set ROBOFLOW_API_KEY before running, even for these public
datasets; that's a Roboflow platform requirement, not something this
project adds.

Usage:
    export ROBOFLOW_API_KEY=your_key_here
    python scripts/prepare_cv_dataset.py --out data/cv_dataset

What this does:
    1. Downloads both datasets in YOLO format via the `roboflow` package.
    2. Normalizes class labels to the canonical 6-class list in
       cv_service/inference.py::DEFECT_CLASSES (the two source datasets
       use their own label spellings/casing - see LABEL_MAP below).
    3. Merges both into one dataset directory with a combined data.yaml.
    4. Re-splits the merged set into train/val/test (default 70/20/10).

**Important - verify LABEL_MAP before trusting the merge.** The exact
class name strings each dataset actually uses (casing, separators, e.g.
"Crack" vs "crack" vs "CRACK") could not be confirmed from this
environment - Roboflow was unreachable, so this map is a best-effort
placeholder based on the class descriptions given in the integration
brief, not verified against each dataset's real data.yaml. After running
step 1 above, open each downloaded dataset's data.yaml, compare its
`names:` list against LABEL_MAP's keys below, and correct any mismatch
before proceeding - a silent label-mapping bug here would poison the
whole fine-tuning run without any visible error.
"""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path

# Canonical classes - must match cv_service/inference.py::DEFECT_CLASSES.
DEFECT_CLASSES = [
    "crack",
    "dent",
    "scratch",
    "paint-peel-off",
    "missing-head",
    "corrosion",
]

# Maps a source dataset's raw label (lowercased, whitespace/underscores
# collapsed to hyphens) to a canonical class above. VERIFY against each
# dataset's actual data.yaml after downloading - see module docstring.
LABEL_MAP: dict[str, str] = {
    "crack": "crack",
    "dent": "dent",
    "scratch": "scratch",
    "paint-peel-off": "paint-peel-off",
    "paint-peeling": "paint-peel-off",
    "missing-head": "missing-head",
    "missing-fastener-head": "missing-head",
    "corrosion": "corrosion",
    "rust": "corrosion",
}

DATASETS = [
    {
        "workspace": "ddiisc",
        "project": "aircraft_skin_defects",
        "version": 1,  # VERIFY: confirm the actual version number on Roboflow
    },
    {
        "workspace": "lemi-debele",
        "project": "aircraft-surface-damage",
        "version": 1,  # VERIFY: confirm the actual version number on Roboflow
    },
]


def normalize_label(raw_label: str) -> str | None:
    """Returns the canonical class name, or None if unrecognized (logged,
    not silently dropped, by the caller)."""
    key = raw_label.strip().lower().replace("_", "-").replace(" ", "-")
    return LABEL_MAP.get(key)


def download_datasets(api_key: str, staging_dir: Path) -> list[Path]:
    """
    Downloads both datasets in YOLO format via the roboflow package.
    Returns the list of local dataset directories.
    """
    from roboflow import Roboflow  # deferred: only needed on the machine

    # actually running this step, not wherever this file is imported for
    # its label-merging logic (see tests/test_prepare_cv_dataset.py).
    rf = Roboflow(api_key=api_key)
    local_dirs = []
    for ds in DATASETS:
        print(f"Downloading {ds['workspace']}/{ds['project']} v{ds['version']}...")
        project = rf.workspace(ds["workspace"]).project(ds["project"])
        dataset = project.version(ds["version"]).download(
            "yolov8", location=str(staging_dir / ds["project"])
        )
        local_dirs.append(Path(dataset.location))
    return local_dirs


def collect_labeled_pairs(dataset_dirs: list[Path]) -> list[tuple[Path, Path, str]]:
    """
    Walks each downloaded YOLO-format dataset directory and returns
    (image_path, label_path, split) tuples for every image that has a
    corresponding label file. `split` is the source dataset's own
    train/valid/test folder name.
    """
    pairs = []
    for ds_dir in dataset_dirs:
        for split_dir in ds_dir.glob("*"):
            if not split_dir.is_dir() or split_dir.name not in ("train", "valid", "test"):
                continue
            images_dir = split_dir / "images"
            labels_dir = split_dir / "labels"
            if not images_dir.is_dir():
                continue
            for image_path in images_dir.glob("*"):
                label_path = labels_dir / (image_path.stem + ".txt")
                if label_path.exists():
                    pairs.append((image_path, label_path, split_dir.name))
    return pairs


def remap_label_file(
    src_label_path: Path, source_class_names: list[str]
) -> list[str] | None:
    """
    Reads one YOLO label file (class_id x y w h per line, using the
    source dataset's own class index order) and rewrites the class ids
    against the canonical DEFECT_CLASSES order. Returns None (skip this
    file) if any line references a class not in LABEL_MAP, rather than
    silently mislabeling it.
    """
    out_lines = []
    for line in src_label_path.read_text().splitlines():
        if not line.strip():
            continue
        parts = line.split()
        class_id = int(parts[0])
        if class_id >= len(source_class_names):
            return None
        raw_label = source_class_names[class_id]
        canonical = normalize_label(raw_label)
        if canonical is None:
            return None
        new_id = DEFECT_CLASSES.index(canonical)
        out_lines.append(" ".join([str(new_id), *parts[1:]]))
    return out_lines


def split_dataset(
    pairs: list[tuple[Path, Path]], train_frac: float, val_frac: float, seed: int = 42
) -> dict[str, list[tuple[Path, Path]]]:
    """Re-splits a flat list of (image, label) pairs into train/val/test,
    ignoring whatever split each source dataset originally used - the two
    datasets' own splits aren't comparable once merged."""
    shuffled = list(pairs)
    random.Random(seed).shuffle(shuffled)
    n = len(shuffled)
    n_train = int(n * train_frac)
    n_val = int(n * val_frac)
    return {
        "train": shuffled[:n_train],
        "val": shuffled[n_train : n_train + n_val],
        "test": shuffled[n_train + n_val :],
    }


def write_merged_dataset(splits: dict[str, list[tuple[Path, Path]]], out_dir: Path) -> None:
    for split_name, pairs in splits.items():
        images_out = out_dir / split_name / "images"
        labels_out = out_dir / split_name / "labels"
        images_out.mkdir(parents=True, exist_ok=True)
        labels_out.mkdir(parents=True, exist_ok=True)
        for i, (image_path, label_lines_path) in enumerate(pairs):
            dest_stem = f"{split_name}_{i:05d}"
            shutil.copy(image_path, images_out / f"{dest_stem}{image_path.suffix}")
            shutil.copy(label_lines_path, labels_out / f"{dest_stem}.txt")

    data_yaml = out_dir / "data.yaml"
    data_yaml.write_text(
        "train: train/images\n"
        "val: val/images\n"
        "test: test/images\n"
        f"nc: {len(DEFECT_CLASSES)}\n"
        f"names: {DEFECT_CLASSES}\n"
    )
    print(f"Wrote merged dataset to {out_dir} ({sum(len(p) for p in splits.values())} images)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="data/cv_dataset")
    parser.add_argument("--staging", default="data/cv_dataset_staging")
    parser.add_argument("--api-key", default=None, help="Defaults to $ROBOFLOW_API_KEY")
    parser.add_argument("--train-frac", type=float, default=0.7)
    parser.add_argument("--val-frac", type=float, default=0.2)
    args = parser.parse_args()

    import os

    api_key = args.api_key or os.environ.get("ROBOFLOW_API_KEY")
    if not api_key:
        raise SystemExit(
            "Set ROBOFLOW_API_KEY (or pass --api-key). Get one free at "
            "roboflow.com -> Settings -> API Keys."
        )

    staging_dir = Path(args.staging)
    dataset_dirs = download_datasets(api_key, staging_dir)

    print(
        "\nDatasets downloaded. VERIFY each dataset's data.yaml `names:` "
        "list against LABEL_MAP in this script before continuing - see "
        "the module docstring. Press Enter to continue with the merge, "
        "or Ctrl+C to stop and fix LABEL_MAP first.\n"
    )
    input()

    all_pairs = []
    skipped = 0
    for ds_dir in dataset_dirs:
        import yaml

        data_yaml = yaml.safe_load((ds_dir / "data.yaml").read_text())
        source_class_names = data_yaml["names"]

        for image_path, label_path, _split in collect_labeled_pairs([ds_dir]):
            remapped_lines = remap_label_file(label_path, source_class_names)
            if remapped_lines is None:
                skipped += 1
                continue
            # Write remapped labels to a temp file alongside, so
            # write_merged_dataset can copy them like any other pair.
            tmp_label = label_path.with_suffix(".remapped.txt")
            tmp_label.write_text("\n".join(remapped_lines))
            all_pairs.append((image_path, tmp_label))

    if skipped:
        print(f"WARNING: skipped {skipped} label file(s) with unrecognized classes.")

    splits = split_dataset(all_pairs, args.train_frac, args.val_frac)
    write_merged_dataset(splits, Path(args.out))


if __name__ == "__main__":
    main()
