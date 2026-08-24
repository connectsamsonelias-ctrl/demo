"""
Task 1 — Setup
Prepare the environment, load Fashion-MNIST, and build a visualisation
helper. Each `# %%` block below is one subtask — in VS Code (Python
extension), click "Run Cell" above a block, or Shift+Enter, to run it
on its own and see its output inline.
"""

# %% [1.1] Enable GPU
# In Colab: Runtime -> Change runtime type -> GPU.
# Locally / here: device is auto-detected below; the rest of the project
# runs unchanged on CPU or GPU.
import os
import math
import random

import numpy as np
import torch
import torchvision
import torchvision.transforms as T
from torch.utils.data import DataLoader
import matplotlib.pyplot as plt

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Using device:", DEVICE)

RESULTS_DIR = "results"
os.makedirs(RESULTS_DIR, exist_ok=True)

CLASS_NAMES = [
    "T-shirt/top", "Trouser", "Pullover", "Dress", "Coat",
    "Sandal", "Shirt", "Sneaker", "Bag", "Ankle boot",
]

# %% [1.2] Install and Import Libraries
# pip install torch torchvision matplotlib tqdm
# (all imports needed by this task are already above; later tasks import
# their own extra libraries the same way)
print("torch", torch.__version__, "| torchvision", torchvision.__version__)

# %% [1.3] Load Fashion-MNIST: train/test DataLoaders, batch size ~128
BATCH_SIZE = 128

transform = T.Compose([T.ToTensor()])  # -> [0, 1], shape (1, 28, 28)

train_full = torchvision.datasets.FashionMNIST(
    root="./data", train=True, download=True, transform=transform
)
test_full = torchvision.datasets.FashionMNIST(
    root="./data", train=False, download=True, transform=transform
)

train_loader = DataLoader(
    train_full, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, drop_last=True
)
test_loader = DataLoader(
    test_full, batch_size=BATCH_SIZE, shuffle=False, num_workers=2
)

print(f"train: {len(train_full)} images, test: {len(test_full)} images")

# %% [1.4] Create Visualisation Helper: show_grid(...)
def show_grid(images, nrow=6, title=None, save_path=None, figsize=None):
    """Display (and optionally save) a batch of images.

    images: tensor (N, 1, 28, 28) in [0, 1], or a list/tuple of such tensors
            (concatenated) to show as stacked row-blocks for comparisons.
    """
    if isinstance(images, (list, tuple)):
        images = torch.cat(images, dim=0)
    images = images.detach().cpu().clamp(0, 1)
    n = images.shape[0]
    ncol = nrow
    nrow_grid = math.ceil(n / ncol)
    fig, axes = plt.subplots(
        nrow_grid, ncol, figsize=figsize or (ncol * 1.2, nrow_grid * 1.2)
    )
    axes = np.array(axes).reshape(-1)
    for i, ax in enumerate(axes):
        ax.axis("off")
        if i < n:
            ax.imshow(images[i, 0], cmap="gray", vmin=0, vmax=1)
    if title:
        fig.suptitle(title)
    fig.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.show()
    return fig


sample_batch, sample_labels = next(iter(train_loader))
show_grid(
    sample_batch[:12],
    nrow=6,
    title="Fashion-MNIST sample batch",
    save_path=os.path.join(RESULTS_DIR, "task1_sample_batch.png"),
)
print("Sample labels:", [CLASS_NAMES[i] for i in sample_labels[:12].tolist()])
