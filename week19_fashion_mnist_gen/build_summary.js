const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require("docx");

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, bold: true })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 }, children: [new TextRun({ text, bold: true, size: 22 })] });
}
function body(text) {
  return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, size: 20 })] });
}

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Fashion-MNIST Generative Modelling — Analysis & Short Report", bold: true, size: 28 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "Samson Elias — Week 19 Graded Mini Project", italics: true, size: 20 })] }),

  h1("Comparisons"),
  h2("AE vs VAE (deterministic vs probabilistic)"),
  body("The Task 2 Denoising Autoencoder (DAE) learns a single deterministic code per image and is optimised purely for reconstruction (MSE); its latent space has no enforced structure, so sampling or interpolating in it is unreliable. The Task 3 VAE instead learns a distribution q(z|x) = N(mu, sigma^2) per image and is regularised (via the KL term) toward a standard normal prior, at the cost of blurrier reconstructions. That regularisation is exactly what buys the VAE the ability to sample from scratch and interpolate smoothly between real images — capabilities the DAE's latent space does not reliably support."),

  h2("VAE vs cGAN (likelihood vs adversarial)"),
  body("The VAE is trained to maximise a tractable lower bound on data likelihood (ELBO); its pixel-wise reconstruction term rewards “safe” averaged pixel values under uncertainty, producing systematically blurrier samples. The cGAN never computes a likelihood at all — the generator is trained purely to fool a discriminator, so there is no pixel-averaging pressure, and its outputs are visibly sharper. The tradeoff is optimisation stability: the VAE's loss is a single well-behaved objective that improves monotonically, while the cGAN's adversarial min-max game needed label smoothing and careful learning-rate/beta tuning to avoid the discriminator overpowering the generator."),

  h2("Why labels improve control in cGAN"),
  body("An unconditional GAN can sample a garment but gives no lever to request which garment. Concatenating a label embedding into the generator's input, and a label map into the discriminator's input, turns the single unconditional data distribution into 10 class-conditional sub-distributions the discriminator can hold the generator accountable to per class — “this doesn't look like a real sandal” is a strictly stronger training signal than “this doesn't look like a real image.” That is what makes explicit per-class sampling possible at all, which is not available to the plain VAE or DAE without retrofitting a similar conditioning mechanism."),

  h1("Takeaways"),
  h2("What each model captures well or poorly"),
  body("The DAE is the strongest pure compressor/denoiser but the weakest generator, since its latent space is not meant for sampling. The VAE is the best-behaved generative model to train and gives a genuinely useful, interpolable latent space, at the cost of blur. The cGAN gives the sharpest, most controllable samples but is the most finicky to train and offers no direct latent-interpolation guarantee the way the VAE does. AdaIN-based style mixing (Task 5) is not a generator on its own — it is a mechanism for recombining representations from an existing encoder/decoder, and its quality is capped by how well that encoder/decoder was trained in the first place."),

  h2("Practical notes (learning rate, noise, batch size, etc.)"),
  body("Gaussian noise sigma≈0.3 was strong enough to force the DAE to genuinely denoise rather than pass an easy identity mapping through. The VAE's higher learning rate (2e-3 vs the DAE's 1e-3) trained stably only because the small bottleneck (20-dim) and BCE+KL objective are both well-conditioned; a larger latent dimension would likely need a lower rate or KL warm-up to avoid posterior collapse. For the cGAN, real-label smoothing (0.9 instead of 1.0) and the lower, momentum-adjusted Adam betas (0.5, 0.999) were both necessary in practice — without them the discriminator tends to converge too quickly early in training and starve the generator's gradient signal. Batch size 128 was a good stability/throughput tradeoff for all three trained models on this dataset size. All training for this submission ran on CPU; the identical code is GPU-ready via automatic device detection and would train substantially faster on a Colab GPU runtime."),
];

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(__dirname, "Week 19_Analysis_Summary_Elias.docx"), buf);
  console.log("Wrote summary docx");
});
