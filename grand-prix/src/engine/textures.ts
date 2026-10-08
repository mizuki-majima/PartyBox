import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Canvas 2D で描いた絵をテクスチャにする小さなヘルパー */
export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeat?: boolean; pixelated?: boolean } = {},
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, width, height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  if (opts.pixelated) {
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
  }
  tex.anisotropy = 4;
  return tex;
}

export function checkerTexture(cols: number, rows: number, a = '#ffffff', b = '#222222'): Texture {
  return canvasTexture(
    cols,
    rows,
    (ctx) => {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? a : b;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    },
    { pixelated: true },
  );
}
