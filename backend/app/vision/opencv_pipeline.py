"""
Sesión 04 — Pipeline de Preprocesamiento de Imágenes con OpenCV (cv2).
Implementa los fundamentos matemáticos vistos en clase:
1. Conversión de espacio de color BGR -> Escala de Grises (Y = 0.299R + 0.587G + 0.114B)
   reduciendo el volumen de datos en un 66.6%.
2. Filtrado espacial con Suavizado Gaussiano (cv2.GaussianBlur) para eliminar ruido de alta frecuencia.
3. Cálculo de gradientes mediante Operador Sobel (cv2.Sobel) y detector de bordes Canny (cv2.Canny).
4. Binarización y Umbralización estricta (cv2.threshold: THRESH_BINARY / THRESH_BINARY_INV).
5. Álgebra de Transformaciones Geométricas: Recorte de Región de Interés (ROI), Escalado (cv2.resize
   con INTER_AREA) y Rotación afín (cv2.getRotationMatrix2D + cv2.warpAffine).
"""

from __future__ import annotations
import base64
from typing import Tuple
import cv2
import numpy as np


def decode_image(raw_bytes: bytes) -> np.ndarray:
    """Decodifica bytes JPG/PNG en una matriz tensor BGR de forma (Alto, Ancho, 3)."""
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar la imagen con OpenCV.")
    return img


def decode_data_url(data_url: str) -> np.ndarray:
    """Decodifica un data URL (data:image/jpeg;base64,...) en una matriz BGR de OpenCV."""
    if "," in data_url:
        _, b64 = data_url.split(",", 1)
    else:
        b64 = data_url
    return decode_image(base64.b64decode(b64))


def encode_jpeg_bytes(bgr: np.ndarray, quality: int = 85) -> bytes:
    """Codifica una matriz BGR de OpenCV a bytes JPEG."""
    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("Error al codificar fotograma JPEG.")
    return buf.tobytes()


def encode_jpeg_data_url(bgr: np.ndarray, quality: int = 82) -> str:
    """Codifica una matriz BGR de OpenCV a data URL base64."""
    jpg = encode_jpeg_bytes(bgr, quality=quality)
    return f"data:image/jpeg;base64,{base64.b64encode(jpg).decode('ascii')}"


def to_grayscale(bgr: np.ndarray) -> np.ndarray:
    """
    Sesión 04: Conversión inmediata a Escala de Grises (cv2.cvtColor).
    Aplica Y = 0.299R + 0.587G + 0.114B, pasando de un tensor 3D (H, W, 3) a una matriz 2D (H, W).
    """
    if bgr.ndim == 2:
        return bgr
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


def gaussian_smooth(gray: np.ndarray, ksize: int = 5) -> np.ndarray:
    """
    Sesión 04: Filtro Gaussiano (cv2.GaussianBlur) de paso bajo para disolver ruido electrónico
    y variaciones bruscas del sensor antes de calcular derivadas/gradientes.
    """
    k = ksize if ksize % 2 == 1 else ksize + 1
    return cv2.GaussianBlur(gray, (k, k), 0)


def sobel_gradients(gray: np.ndarray) -> np.ndarray:
    """
    Sesión 04: Operador Sobel (cv2.Sobel).
    Aproxima las derivadas parciales horizontales (Gx) y verticales (Gy) de la intensidad luminosa
    y devuelve la magnitud del gradiente normalizada en [0, 255].
    """
    smoothed = gaussian_smooth(gray, 3)
    gx = cv2.Sobel(smoothed, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(smoothed, cv2.CV_64F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    max_val = float(np.max(mag)) if mag.size > 0 else 1.0
    if max_val > 1e-6:
        mag = (mag / max_val) * 255.0
    return np.clip(mag, 0, 255).astype(np.uint8)


def canny_edges(gray: np.ndarray, low_threshold: int = 50, high_threshold: int = 150) -> np.ndarray:
    """
    Sesión 04: Algoritmo Canny (cv2.Canny) de 4 etapas:
    Suavizado -> Magnitud de gradiente -> Supresión de no máximos -> Umbralización por histéresis.
    """
    smoothed = gaussian_smooth(gray, 5)
    return cv2.Canny(smoothed, low_threshold, high_threshold)


def strict_threshold(gray: np.ndarray, thresh: int = 60, invert: bool = False) -> np.ndarray:
    """
    Sesión 04: Segmentación por Umbralización Estricta (cv2.threshold).
    Transforma la imagen continua en una matriz puramente binaria (0 = Fondo, 255 = Objeto).
    """
    mode = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
    _, binary = cv2.threshold(gray, thresh, 255, mode)
    return binary


def align_rotation(bgr: np.ndarray, angle_deg: float) -> np.ndarray:
    """
    Sesión 04: Transformación Geométrica Afín (cv2.getRotationMatrix2D + cv2.warpAffine)
    para corregir desviaciones angulares o inclinación de la cámara.
    """
    h, w = bgr.shape[:2]
    center = (w / 2.0, h / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    return cv2.warpAffine(bgr, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def extract_roi(
    bgr: np.ndarray,
    box_norm: Tuple[float, float, float, float],
) -> np.ndarray:
    """
    Sesión 04: Recorte (Crop) de la Región de Interés (ROI) usando indexación directa de NumPy.
    box_norm = (x, y, width, height) en coordenadas normalizadas [0, 1].
    """
    h, w = bgr.shape[:2]
    nx, ny, nw, nh = box_norm
    x1 = max(0, min(w - 1, int(round(nx * w))))
    y1 = max(0, min(h - 1, int(round(ny * h))))
    x2 = max(x1 + 1, min(w, int(round((nx + nw) * w))))
    y2 = max(y1 + 1, min(h, int(round((ny + nh) * h))))
    return bgr[y1:y2, x1:x2]


def extract_roi_tensor(
    bgr: np.ndarray,
    box_norm: Tuple[float, float, float, float],
    target_size: Tuple[int, int] = (64, 64),
) -> np.ndarray:
    """
    Sesiones 01, 03 y 04:
    1. Extrae el ROI del objeto detectado.
    2. Normaliza su resolución espacial con cv2.resize (INTER_AREA) a (64, 64).
    3. Convierte BGR -> RGB y escala los píxeles al rango [0, 1] (MinMaxScaler)
       devolviendo un Tensor 4D de forma (1, 64, 64, 3) listo para la Red Neuronal Convolucional (CNN).
    """
    roi = extract_roi(bgr, box_norm)
    resized = cv2.resize(roi, target_size, interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    tensor = rgb.astype(np.float32) / 255.0
    return np.expand_dims(tensor, axis=0)
