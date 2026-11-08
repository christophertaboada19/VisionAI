import { sanitizeFileName, sniffImageMime, validateUpload } from "@/core/application/validation";

export interface LoadedImage {
  fileName: string;
  mime: string;
  size: number;
  dataUrl: string;
  width: number;
  height: number;
}

/** Valida extensión, MIME declarado, firma real del contenido, tamaño y que la imagen decodifique. */
export async function readImageFile(file: File, maxMb: number): Promise<LoadedImage> {
  const v = validateUpload(file, maxMb);
  if (!v.ok) throw new Error(v.error);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const real = sniffImageMime(head);
  if (!real) throw new Error("El contenido del archivo no corresponde a una imagen JPG o PNG (firma inválida).");
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    throw new Error("La imagen está dañada o no se puede decodificar.");
  }
  return { fileName: sanitizeFileName(file.name), mime: real, size: file.size, dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}
