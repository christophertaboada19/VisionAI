// Validación de archivos de entrada: tipo MIME, extensión y tamaño (no confiar solo en el nombre).

export const ALLOWED_MIME = ["image/jpeg", "image/png"] as const;
export const ALLOWED_EXT = [".jpg", ".jpeg", ".png"] as const;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateUpload(file: { name: string; type: string; size: number }, maxMb: number): ValidationResult {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((e) => name.endsWith(e))) {
    return { ok: false, error: `Formato no permitido (${file.name}). Use una imagen JPG o PNG.` };
  }
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: `El contenido del archivo no es una imagen JPG/PNG válida (tipo: ${file.type || "desconocido"}).` };
  }
  if (file.size <= 0) return { ok: false, error: "El archivo está vacío." };
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${maxMb} MB.` };
  }
  return { ok: true };
}

/** Verifica la "firma mágica" del archivo: el contenido real debe ser JPG o PNG. */
export function sniffImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

/** Sanitiza un nombre de archivo para mostrarlo y guardarlo. */
export const sanitizeFileName = (n: string) => n.replace(/[^\w.\-() áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 120);
