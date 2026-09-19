import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.prepare_cv_dataset import (  # noqa: E402
    DEFECT_CLASSES,
    normalize_label,
    remap_label_file,
    split_dataset,
)


def test_normalize_label_handles_casing_and_separators():
    assert normalize_label("Crack") == "crack"
    assert normalize_label("PAINT_PEEL_OFF") == "paint-peel-off"
    assert normalize_label("paint peeling") == "paint-peel-off"
    assert normalize_label("Missing_Fastener_Head") == "missing-head"
    assert normalize_label("Rust") == "corrosion"


def test_normalize_label_returns_none_for_unmapped():
    assert normalize_label("some-unrelated-class") is None


def test_remap_label_file_rewrites_class_ids(tmp_path):
    # Source dataset's own class order: 0=dent, 1=crack
    label_file = tmp_path / "img1.txt"
    label_file.write_text("1 0.5 0.5 0.2 0.2\n0 0.1 0.1 0.05 0.05\n")

    remapped = remap_label_file(label_file, source_class_names=["dent", "crack"])

    assert remapped is not None
    # crack (source id 1) -> canonical index
    assert remapped[0].split()[0] == str(DEFECT_CLASSES.index("crack"))
    # dent (source id 0) -> canonical index
    assert remapped[1].split()[0] == str(DEFECT_CLASSES.index("dent"))


def test_remap_label_file_skips_file_with_unrecognized_class(tmp_path):
    label_file = tmp_path / "img2.txt"
    label_file.write_text("0 0.5 0.5 0.2 0.2\n")

    remapped = remap_label_file(label_file, source_class_names=["totally-unknown-defect"])

    assert remapped is None


def test_split_dataset_respects_fractions_and_uses_all_pairs():
    pairs = [(Path(f"img{i}.jpg"), Path(f"img{i}.txt")) for i in range(100)]

    splits = split_dataset(pairs, train_frac=0.7, val_frac=0.2)

    assert len(splits["train"]) == 70
    assert len(splits["val"]) == 20
    assert len(splits["test"]) == 10
    assert sum(len(v) for v in splits.values()) == 100

    # every original pair appears exactly once across the three splits
    all_split_pairs = splits["train"] + splits["val"] + splits["test"]
    assert sorted(all_split_pairs) == sorted(pairs)


def test_split_dataset_is_deterministic_given_same_seed():
    pairs = [(Path(f"img{i}.jpg"), Path(f"img{i}.txt")) for i in range(20)]

    splits_a = split_dataset(pairs, train_frac=0.7, val_frac=0.2, seed=1)
    splits_b = split_dataset(pairs, train_frac=0.7, val_frac=0.2, seed=1)

    assert splits_a == splits_b
