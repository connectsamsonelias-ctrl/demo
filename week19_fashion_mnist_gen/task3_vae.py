"""
Task 3 — Variational Autoencoder
Each `# %%` block is one subtask (3.1-3.4) — run cells independently in
VS Code's Interactive Window to see output per subtask.

Requires task1_setup.py in the same folder (imported for DEVICE,
DataLoaders, show_grid, etc.) — run/import Task 1 first.
Saves a checkpoint to models/vae.pt.
"""

# %% [3.0] Imports + shared setup from Task 1
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

VAE_LATENT_DIM = 20

# %% [3.1] Encoder Outputs: mu and logvar (log sigma^2)
class VAEEncoder(nn.Module):
    def __init__(self, latent_dim=VAE_LATENT_DIM):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, 32, 3, stride=2, padding=1),   # 28 -> 14
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 64, 3, stride=2, padding=1),  # 14 -> 7
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), # 7 -> 4
            nn.ReLU(inplace=True),
        )
        self.fc_mu = nn.Linear(128 * 4 * 4, latent_dim)
        self.fc_logvar = nn.Linear(128 * 4 * 4, latent_dim)

    def forward(self, x):
        h = self.conv(x).flatten(1)
        return self.fc_mu(h), self.fc_logvar(h)


class VAEDecoder(nn.Module):
    def __init__(self, latent_dim=VAE_LATENT_DIM):
        super().__init__()
        self.fc = nn.Linear(latent_dim, 128 * 4 * 4)
        self.deconv = nn.Sequential(
            nn.ConvTranspose2d(128, 64, 3, stride=2, padding=1, output_padding=0),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(64, 32, 3, stride=2, padding=1, output_padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(32, 1, 3, stride=2, padding=1, output_padding=1),
            nn.Sigmoid(),
        )

    def forward(self, z):
        h = self.fc(z).view(-1, 128, 4, 4)
        return self.deconv(h)

# %% [3.2] Reparameterisation: z = mu + exp(0.5*logvar) * eps, eps ~ N(0, I)
class VAE(nn.Module):
    def __init__(self, latent_dim=VAE_LATENT_DIM):
        super().__init__()
        self.encoder = VAEEncoder(latent_dim)
        self.decoder = VAEDecoder(latent_dim)
        self.latent_dim = latent_dim

    def reparameterise(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def forward(self, x):
        mu, logvar = self.encoder(x)
        z = self.reparameterise(mu, logvar)
        recon = self.decoder(z)
        return recon, mu, logvar


vae = VAE(VAE_LATENT_DIM).to(DEVICE)
print("VAE params:", sum(p.numel() for p in vae.parameters()))

# %% [3.3] Training: ELBO = BCE + KL, Adam(2e-3), ~12 epochs
VAE_EPOCHS = 12
vae_opt = torch.optim.Adam(vae.parameters(), lr=2e-3)
vae_losses = {"total": [], "bce": [], "kld": []}

for epoch in range(1, VAE_EPOCHS + 1):
    vae.train()
    tot_run, bce_run, kld_run = 0.0, 0.0, 0.0
    pbar = tqdm(train_loader, desc=f"VAE epoch {epoch}/{VAE_EPOCHS}", leave=False)
    for x, _ in pbar:
        x = x.to(DEVICE)
        recon, mu, logvar = vae(x)

        bce = F.binary_cross_entropy(recon, x, reduction="sum") / x.size(0)
        kld = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp()) / x.size(0)
        loss = bce + kld

        vae_opt.zero_grad()
        loss.backward()
        vae_opt.step()

        tot_run += loss.item() * x.size(0)
        bce_run += bce.item() * x.size(0)
        kld_run += kld.item() * x.size(0)
        pbar.set_postfix(loss=loss.item())

    n = len(train_full)
    vae_losses["total"].append(tot_run / n)
    vae_losses["bce"].append(bce_run / n)
    vae_losses["kld"].append(kld_run / n)
    print(
        f"[VAE] epoch {epoch}/{VAE_EPOCHS}  elbo={vae_losses['total'][-1]:.2f}  "
        f"bce={vae_losses['bce'][-1]:.2f}  kld={vae_losses['kld'][-1]:.2f}"
    )

# %% [3.4a] Generate Samples — Figure 2: random samples (z ~ N(0, I))
vae.eval()
with torch.no_grad():
    z = torch.randn(36, vae.latent_dim, device=DEVICE)
    samples = vae.decoder(z)

show_grid(
    samples, nrow=6, title="Figure 2 — VAE random samples",
    save_path=os.path.join(RESULTS_DIR, "figure2_vae_random_samples.png"),
)

# %% [3.4b] Figure 3: interpolations between pairs of encoded test images
with torch.no_grad():
    x, y = next(iter(test_loader))
    x = x.to(DEVICE)
    mu, logvar = vae.encoder(x)

    n_pairs = 4
    steps = 8
    rows = []
    for i in range(n_pairs):
        za, zb = mu[2 * i], mu[2 * i + 1]
        alphas = torch.linspace(0, 1, steps, device=DEVICE)
        z_interp = torch.stack([(1 - a) * za + a * zb for a in alphas])
        rows.append(vae.decoder(z_interp))
    interp_imgs = torch.cat(rows, dim=0)

show_grid(
    interp_imgs, nrow=steps,
    title="Figure 3 — VAE latent interpolation (each row: image A -> image B)",
    save_path=os.path.join(RESULTS_DIR, "figure3_vae_interpolation.png"),
    figsize=(steps * 1.2, n_pairs * 1.2),
)

# %% [3.4c] Figure 4: single-dimension latent traversals
with torch.no_grad():
    base_z = mu[0:1].clone()
    dims_to_show = list(range(6))
    sweep_vals = torch.linspace(-3, 3, 8, device=DEVICE)

    rows = []
    for d in dims_to_show:
        z_batch = base_z.repeat(len(sweep_vals), 1).clone()
        z_batch[:, d] = sweep_vals
        rows.append(vae.decoder(z_batch))
    traversal_imgs = torch.cat(rows, dim=0)

show_grid(
    traversal_imgs, nrow=len(sweep_vals),
    title="Figure 4 — VAE latent traversals (rows = dims 0-5, cols = value -3..3)",
    save_path=os.path.join(RESULTS_DIR, "figure4_vae_traversals.png"),
    figsize=(len(sweep_vals) * 1.2, len(dims_to_show) * 1.2),
)

print("""
Traversal notes: most individual dimensions encode entangled, low-level
factors (overall brightness/contrast, silhouette width) rather than one
clean semantic attribute -- expected for a plain (non-disentangled) VAE
with an unstructured Gaussian prior.

Observations comparing AE (Task 2's DAE) vs VAE:
- The DAE's plain latent space is not meant for sampling: feeding it
  z ~ N(0, I) (no encoder input) produces noise/garbage, because nothing
  during training pushed its latent codes toward a known, samplable
  distribution.
- The VAE's KL term explicitly regularises q(z|x) toward N(0, I), so
  Figure 2's from-scratch samples are recognisable garments -- the price
  is blurrier reconstructions than a plain autoencoder at the same
  bottleneck size.
- Interpolating between two DAE codes is not guaranteed to pass through
  valid latent points; the VAE's Figure 3 interpolations move smoothly
  and plausibly between garments because its latent space is trained to
  be locally continuous.
- Overall: the DAE is a compression/denoising specialist, the VAE trades
  some of that sharpness for a usable generative and interpolable latent
  space.
""")

# %% [3.5] Save checkpoint
torch.save(vae.state_dict(), os.path.join(MODELS_DIR, "vae.pt"))
print(f"Saved checkpoint to {os.path.join(MODELS_DIR, 'vae.pt')}")
