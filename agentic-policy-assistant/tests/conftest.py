import os
import sys
from pathlib import Path

import pytest

# make the project modules importable and force the deterministic offline model
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["POLICY_ASSISTANT_OFFLINE"] = "1"


@pytest.fixture
def settings(tmp_path):
    from models import get_settings
    return get_settings(memory_dir=tmp_path / "memory", log_dir=tmp_path / "logs",
                        results_dir=tmp_path / "results")
