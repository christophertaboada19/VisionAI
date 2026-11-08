// Procesamiento CLÁSICO de imágenes ejecutado de verdad en el navegador (no es IA).
// Reproduce el pipeline de la sesión 04 (OpenCV): escala de grises → suavizado gaussiano
// → gradiente Sobel (bordes) → umbralización binaria.

export type PreprocessView = "original" | "gray" | "edges" | "binary";

export const PREPROCESS_LABEL: Record<PreprocessView, string> = {
  original: "Original",
  gray: "Escala de grises",
  edges: "Bordes (Sobel)",
  binary: "Binarización",
};

/** Y = 0.299 R + 0.587 G + 0.114 B (igual que cv2.cvtColor BGR2GRAY). */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

/** Suavizado gaussiano 3×3 (kernel [1 2 1; 2 4 2; 1 2 1] / 16), como cv2.GaussianBlur. */
export function gaussian3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          const xx = Math.min(w - 1, Math.max(0, x + kx));
          s += src[yy * w + xx] * k[(ky + 1) * 3 + (kx + 1)];
        }
      }
      out[y * w + x] = s / 16;
    }
  }
  return out;
}

/** Magnitud del gradiente Sobel normalizada a 0..255 (como cv2.Sobel en x e y). */
export function sobel(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  let max = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -src[i - w - 1] - 2 * src[i - 1] - src[i + w - 1] + src[i - w + 1] + 2 * src[i + 1] + src[i + w + 1];
      const gy = -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] + src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      const m = Math.hypot(gx, gy);
      out[i] = m;
      if (m > max) max = m;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * 255;
  return out;
}

/** cv2.threshold(..., THRESH_BINARY): > t → 255, si no 0. */
export function threshold(src: Float32Array, t: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] > t ? 255 : 0;
  return out;
}

const cache = new Map<string, string>();

/** Devuelve un data URL con la vista procesada de la imagen. */
export async function renderPreprocessed(src: string, view: PreprocessView, binaryT = 60, maxW = 900): Promise<string> {
  if (view === "original") return src;
  const key = `${view}|${binaryT}|${src.length}|${src.slice(-64)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
  const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || maxW * 0.625) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);

  let plane = toGray(data.data, w, h);
  if (view === "edges" || view === "binary") plane = sobel(gaussian3(plane, w, h), w, h);
  if (view === "binary") plane = threshold(plane, binaryT);

  for (let i = 0, p = 0; i < plane.length; i++, p += 4) {
    const v = plane[i];
    data.data[p] = data.data[p + 1] = data.data[p + 2] = v;
    data.data[p + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (cache.size > 24) cache.clear();
  cache.set(key, url);
  return url;
}
