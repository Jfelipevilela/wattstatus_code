import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Small procedural textures drawn once on a canvas: nothing to download.
// Each covers a known real-world size so floors can repeat them by metres.

const canvas = (size: number) => {
  const node = document.createElement("canvas");
  node.width = size;
  node.height = size;
  return [node, node.getContext("2d")!] as const;
};

// Deterministic pseudo-random, so the pattern is identical on every load.
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const finish = (texture: CanvasTexture, srgb = true) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
};

/** Oak planks, 1.44 m square (eight 18 cm planks). */
export const WOOD_TILE_METRES = 1.44;
export const woodTexture = () => {
  const [node, ctx] = canvas(512);
  const random = rng(7);
  const plank = 512 / 8;
  for (let row = 0; row < 8; row++) {
    let x = -random() * 200;
    while (x < 512) {
      const length = 160 + random() * 220;
      const tone = 0.86 + random() * 0.22;
      ctx.fillStyle = `rgb(${Math.round(150 * tone)}, ${Math.round(108 * tone)}, ${Math.round(74 * tone)})`;
      ctx.fillRect(x, row * plank, length, plank);
      // Grain: a few long, faint strokes.
      ctx.strokeStyle = "rgba(60, 38, 22, 0.12)";
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const y = row * plank + 6 + random() * (plank - 12);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + length * 0.3, y + 3, x + length * 0.6, y - 3, x + length, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(40, 24, 14, 0.55)";
      ctx.fillRect(x, row * plank, 1.5, plank);
      x += length;
    }
    ctx.fillStyle = "rgba(40, 24, 14, 0.5)";
    ctx.fillRect(0, row * plank, 512, 1.5);
  }
  return finish(new CanvasTexture(node));
};

/** Large-format porcelain, 1.2 m square (two 60 cm tiles). */
export const TILE_METRES = 1.2;
export const tileTexture = () => {
  const [node, ctx] = canvas(256);
  const random = rng(3);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const tone = 0.95 + random() * 0.05;
      ctx.fillStyle = `rgb(${Math.round(196 * tone)}, ${Math.round(192 * tone)}, ${Math.round(182 * tone)})`;
      ctx.fillRect(i * 128, j * 128, 128, 128);
    }
  ctx.fillStyle = "rgba(70, 72, 66, 0.55)";
  ctx.fillRect(0, 0, 256, 2);
  ctx.fillRect(0, 128, 256, 2);
  ctx.fillRect(0, 0, 2, 256);
  ctx.fillRect(128, 0, 2, 256);
  return finish(new CanvasTexture(node));
};

/** Soft radial halo laid under the house to blend it into the page. */
export const haloTexture = () => {
  const [node, ctx] = canvas(256);
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(38, 120, 88, 0.55)");
  gradient.addColorStop(0.45, "rgba(24, 77, 58, 0.28)");
  gradient.addColorStop(1, "rgba(7, 20, 17, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(node);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};
