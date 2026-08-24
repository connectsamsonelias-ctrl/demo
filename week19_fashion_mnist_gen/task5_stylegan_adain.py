"""
Task 5 — StyleGAN-lite: AdaIN Demo
Each `# %%` block is one subtask (5.1-5.2) — run cells independently in
VS Code's Interactive Window to see output per subtask.

Requires task1_setup.py and task2_denoising_autoencoder.py to have been
run first in the same kernel (reuses DEVICE, test_loader, show_grid, and
the trained `dae` encoder/decoder).
"""

# %% [5.0] Imports + shared setup
import os
import torch
import matplotlib.pyplot as plt

from task1_setup import DEVICE, RESULTS_DIR, test_loader

# %% [5.1] Implement StyleGAN-lite (AdaIN)
# AdaIN(content, style) = std(style) * (content - mean(content)) / std(content) + mean(style)
# Reuses the trained DAE's encoder/decoder from Task 2 as feature extractor / reconstructor.
def adain(content_feat, style_feat, eps=1e-5):
    c_mean = content_feat.mean(dim=[2, 3], keepdim=True)
    c_std = content_feat.std(dim=[2, 3], keepdim=True) + eps
    s_mean = style_feat.mean(dim=[2, 3], keepdim=True)
    s_std = style_feat.std(dim=[2, 3], keepdim=True) + eps
    normalized = (content_feat - c_mean) / c_std
    return normalized * s_std + s_mean


N_STYLE_PAIRS = 8
dae.eval()
with torch.no_grad():
    x_all, y_all = next(iter(test_loader))
    content_imgs = x_all[:N_STYLE_PAIRS].to(DEVICE)
    style_imgs = x_all[N_STYLE_PAIRS:2 * N_STYLE_PAIRS].to(DEVICE)

    content_feat = dae.encoder.features(content_imgs)
    style_feat = dae.encoder.features(style_imgs)
    mixed_feat = adain(content_feat, style_feat)
    mixed_imgs = dae.decoder.from_features(mixed_feat)

print("content_feat shape:", content_feat.shape)
print("mixed_imgs shape:", mixed_imgs.shape)

# %% [5.2] Generate Samples — Figure 7: content | style | mixed
fig, axes = plt.subplots(N_STYLE_PAIRS, 3, figsize=(4, N_STYLE_PAIRS * 1.3))
for i in range(N_STYLE_PAIRS):
    axes[i, 0].imshow(content_imgs[i, 0].cpu(), cmap="gray", vmin=0, vmax=1)
    axes[i, 1].imshow(style_imgs[i, 0].cpu(), cmap="gray", vmin=0, vmax=1)
    axes[i, 2].imshow(mixed_imgs[i, 0].detach().cpu(), cmap="gray", vmin=0, vmax=1)
    for j in range(3):
        axes[i, j].axis("off")
axes[0, 0].set_title("content", fontsize=9)
axes[0, 1].set_title("style", fontsize=9)
axes[0, 2].set_title("mixed (AdaIN)", fontsize=9)
fig.suptitle("Figure 7 — content | style | mixed")
fig.tight_layout()
fig.savefig(os.path.join(RESULTS_DIR, "figure7_adain_content_style_mixed.png"), dpi=150, bbox_inches="tight")
plt.show()

print("""
Observations:
- AdaIN transfers "style" statistics (mostly overall shading level and
  contrast/texture intensity encoded in the feature map's per-channel
  mean/std) onto the content image's spatial layout, while the decoder
  reconstructs the mixed feature map back into an image that keeps the
  content image's silhouette.
- Because the DAE's bottleneck is small and was never trained for style
  mixing specifically, the effect reads as "content garment shape, style
  image's brightness/contrast" rather than rich texture transfer.
- The mixing is visible even across different garment classes: shape
  stays with content, tone shifts with style, confirming AdaIN does
  exactly what it is defined to do (match feature statistics).
""")
