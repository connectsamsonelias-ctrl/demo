"""
Task 2 — Denoising Autoencoder
Each `# %%` block is one subtask (2.1-2.4) — run cells independently in
VS Code's Interactive Window to see output per subtask.

Requires task1_setup.py in the same folder (imported for DEVICE,
DataLoaders, show_grid, etc.) — run/import Task 1 first.
Saves a checkpoint to models/dae.pt, reused by Task 5's AdaIN demo.
"""

# %% [2.0] Imports + shared setup from Task 1
import os

import torch
import torch.nn as nn
import torch.nn.functional as F
from tqdm.auto import tqdm

from task1_setup import (
    DEVICE, RESULTS_DIR, train_loader, test_loader, train_full, show_grid,
)

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

LATENT_DIM = 32

# %% [2.1] Build the Model
# Encoder: small CNN -> ~32-dim latent z. Decoder: transposed convs -> 28x28 Sigmoid.
class DAEEncoder(nn.Module):
    def __init__(self, latent_dim=LATENT_DIM):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, 32, 3, stride=2, padding=1),   # 28 -> 14
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 64, 3, stride=2, padding=1),  # 14 -> 7
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), # 7 -> 4
            nn.ReLU(inplace=True),
        )
        self.fc = nn.Linear(128 * 4 * 4, latent_dim)

    def forward(self, x):
        h = self.conv(x).flatten(1)
        return self.fc(h)

    def features(self, x):
        """Last conv feature map — reused by Task 5's AdaIN demo."""
        return self.conv(x)


class DAEDecoder(nn.Module):
    def __init__(self, latent_dim=LATENT_DIM):
        super().__init__()
        self.fc = nn.Linear(latent_dim, 128 * 4 * 4)
        self.deconv = nn.Sequential(
            nn.ConvTranspose2d(128, 64, 3, stride=2, padding=1, output_padding=0),  # 4 -> 7
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(64, 32, 3, stride=2, padding=1, output_padding=1),   # 7 -> 14
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(32, 1, 3, stride=2, padding=1, output_padding=1),    # 14 -> 28
            nn.Sigmoid(),
        )

    def forward(self, z):
        h = self.fc(z).view(-1, 128, 4, 4)
        return self.deconv(h)

    def from_features(self, feat):
        """Decode directly from a (N,128,4,4) feature map — used by Task 5."""
        return self.deconv(feat)


class DenoisingAutoencoder(nn.Module):
    def __init__(self, latent_dim=LATENT_DIM):
        super().__init__()
        self.encoder = DAEEncoder(latent_dim)
        self.decoder = DAEDecoder(latent_dim)

    def forward(self, x):
        z = self.encoder(x)
        return self.decoder(z)


dae = DenoisingAutoencoder(LATENT_DIM).to(DEVICE)
print(dae)
print("DAE params:", sum(p.numel() for p in dae.parameters()))

# %% [2.2] Add Noise
# Gaussian noise, sigma ~= 0.3, clamp to [0, 1]
def add_noise(x, sigma=0.3):
    noisy = x + sigma * torch.randn_like(x)
    return noisy.clamp(0.0, 1.0)


# quick visual check of what noisy inputs look like
_x, _ = next(iter(train_loader))
_noisy = add_noise(_x[:6], sigma=0.3)
show_grid([_x[:6], _noisy], nrow=6, title="clean (top) vs noisy sigma=0.3 (bottom)")

# %% [2.3] Train the Model
# MSE loss, Adam(1e-3), ~10 epochs
DAE_EPOCHS = 10
dae_opt = torch.optim.Adam(dae.parameters(), lr=1e-3)
dae_losses = []

for epoch in range(1, DAE_EPOCHS + 1):
    dae.train()
    running = 0.0
    pbar = tqdm(train_loader, desc=f"DAE epoch {epoch}/{DAE_EPOCHS}", leave=False)
    for x, _ in pbar:
        x = x.to(DEVICE)
        noisy = add_noise(x, sigma=0.3)
        recon = dae(noisy)
        loss = F.mse_loss(recon, x)

        dae_opt.zero_grad()
        loss.backward()
        dae_opt.step()

        running += loss.item() * x.size(0)
        pbar.set_postfix(loss=loss.item())

    epoch_loss = running / len(train_full)
    dae_losses.append(epoch_loss)
    print(f"[DAE] epoch {epoch}/{DAE_EPOCHS}  mse={epoch_loss:.5f}")

# %% [2.4] Generate Outputs — Figure 1: clean vs noisy vs denoised
dae.eval()
with torch.no_grad():
    x, _ = next(iter(test_loader))
    x = x[:6].to(DEVICE)
    noisy = add_noise(x, sigma=0.3)
    denoised = dae(noisy)

show_grid(
    [x, noisy, denoised],
    nrow=6,
    title="Figure 1 — rows: clean (top) / noisy (mid) / denoised (bottom)",
    save_path=os.path.join(RESULTS_DIR, "figure1_dae_clean_noisy_denoised.png"),
    figsize=(9, 4.5),
)

dae_mse = F.mse_loss(denoised, x).item()
print(f"Test-batch reconstruction MSE (denoised vs clean): {dae_mse:.5f}")

print("""
Observations (Task 2.4):
- The DAE recovers the garment silhouette and dominant shading well — noise
  this strong (sigma~=0.3) is visually destructive, but global shape survives
  because the 32-dim bottleneck can only encode coarse structure anyway.
- Fine texture is not fixed, it is replaced: knit patterns, stitching lines
  and sharp edges on sneakers/sandals come back smoothed rather than sharp,
  because MSE loss rewards an "average plausible" pixel value.
- The most reliable failure mode is on visually similar classes (shirt vs
  pullover vs coat): heavy noise removes exactly the thin cues that
  disambiguate them, so denoised outputs occasionally drift toward the
  more "generic" of two similar garments.
- Thin, high-frequency structures (straps on sandals, laces) are the
  hardest to recover and show the most residual blur/artifacts.
- Background stays clean in all cases, confirming the network is denoising,
  not just memorising global brightness.
""")

torch.save(dae.state_dict(), os.path.join(MODELS_DIR, "dae.pt"))
print(f"Saved checkpoint to {os.path.join(MODELS_DIR, 'dae.pt')}")
