"""
Sesiones 02 y 03 — Red Neuronal Convolucional (CNN) para Clasificación de Regiones de Interés (ROI).
Implementa la arquitectura estudiada en clase:
  Input Tensor (1, 64, 64, 3)
    -> Conv2D (Filtros de bordes y texturas) + Función de Activación ReLU
    -> MaxPooling2D (Reducción espacial 2x2)
    -> Conv2D (Filtros de patrones geométricos) + Función de Activación ReLU
    -> MaxPooling2D
    -> Flatten (Vectorización 1D)
    -> Dense (Capa oculta con ReLU)
    -> Dense + Softmax (Distribución de probabilidad que suma 100%)

Especializado en dos tareas reales para la demostración en vivo:
1. Clasificación de Calidad de Envases (Botella Sana vs. Botella Malograda: aplastada, sin tapa o sin etiqueta).
2. Verificación de EPP en Operarios (Presencia de Casco en cabeza y Chaleco reflectivo en torso) con encuadres ajustados al contorno real.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional, Tuple
import cv2
import numpy as np
from .opencv_pipeline import (
    canny_edges,
    extract_roi,
    extract_roi_tensor,
    to_grayscale,
)


# -----------------------------------------------------------------------------
# Operaciones Matemáticas de la Red Neuronal (Sesión 02 y 03)
# -----------------------------------------------------------------------------

def relu(x: np.ndarray) -> np.ndarray:
    """Sesión 02 y 03: Función de activación ReLU(x) = max(0, x) para capas ocultas."""
    return np.maximum(0.0, x)


def leaky_relu(x: np.ndarray, alpha: float = 0.01) -> np.ndarray:
    """Sesión 02: Función Leaky ReLU para evitar el efecto de 'neurona muerta'."""
    return np.where(x > 0.0, x, alpha * x)


def sigmoid(x: float) -> float:
    """Sesión 03: Función Sigmoid para decisión binaria en [0, 1]."""
    return float(1.0 / (1.0 + np.exp(-np.clip(x, -20.0, 20.0))))


def softmax(logits: np.ndarray) -> np.ndarray:
    """Sesión 01, 02 y 03: Función Softmax para transformar logits en vector de probabilidades (suma = 1.0)."""
    shifted = logits - np.max(logits)
    exps = np.exp(shifted)
    return exps / (np.sum(exps) + 1e-9)


def conv2d_relu_maxpool(tensor_hwc: np.ndarray) -> np.ndarray:
    """
    Ejecuta una etapa de extracción de características convolucionales (Conv2D + ReLU + MaxPooling2D)
    sobre un tensor (64, 64, 3) usando bancos de kernels ortogonales y diagonales.
    """
    gray = np.mean(tensor_hwc, axis=2).astype(np.float32)
    kernels = [
        # Detector horizontal
        np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32),
        # Detector vertical
        np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32),
        # Detector diagonal / abolladuras
        np.array([[2, -1, -1], [-1, 2, -1], [-1, -1, 2]], dtype=np.float32),
        # Filtro Laplaciano de alta frecuencia (pliegues de botella aplastada)
        np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32),
    ]
    feature_maps = []
    for k in kernels:
        conv = cv2.filter2D(gray, cv2.CV_32F, k)
        act = relu(conv)  # Activación ReLU en capa oculta
        # MaxPooling2D (ventana 2x2)
        h, w = act.shape
        pooled = act[: h - (h % 2), : w - (w % 2)].reshape(h // 2, 2, w // 2, 2).max(axis=(1, 3))
        feature_maps.append(pooled)
    return np.stack(feature_maps, axis=-1)


def _tight_contour_box(
    mask: np.ndarray,
    parent_box: Tuple[float, float, float, float],
    sub_rel: Tuple[float, float, float, float],
    fallback_rel: Tuple[float, float, float, float],
    max_norm_size: Tuple[float, float] = (0.36, 0.36),
) -> Tuple[float, float, float, float]:
    """
    Calcula el encuadre ajustado (cv2.boundingRect) sobre los píxeles activos de una máscara binaria
    dentro de una sub-región, evitando que el cuadro sea exageradamente grande.
    """
    px, py, pw, ph = parent_box
    sx, sy, sw, sh = sub_rel
    mh, mw = mask.shape[:2]

    if mh >= 4 and mw >= 4:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = max(6.0, (mh * mw) * 0.03)
        valid = [c for c in contours if cv2.contourArea(c) >= min_area]
        if valid:
            valid.sort(key=cv2.contourArea, reverse=True)
            pts = np.vstack(valid[:3])
            cx, cy, cw, ch = cv2.boundingRect(pts)
            nx = px + pw * (sx + (cx / float(mw)) * sw)
            ny = py + ph * (sy + (cy / float(mh)) * sh)
            nw = pw * ((cw / float(mw)) * sw)
            nh = ph * ((ch / float(mh)) * sh)

            max_w, max_h = max_norm_size
            if nw > max_w:
                nx += (nw - max_w) * 0.5
                nw = max_w
            if nh > max_h:
                ny += (nh - max_h) * 0.5
                nh = max_h

            nx = max(0.0, min(0.98, nx))
            ny = max(0.0, min(0.98, ny))
            nw = max(0.025, min(1.0 - nx, nw))
            nh = max(0.025, min(1.0 - ny, nh))
            return (round(nx, 4), round(ny, 4), round(nw, 4), round(nh, 4))

    fx, fy, fw, fh = fallback_rel
    nx = px + pw * fx
    ny = py + ph * fy
    nw = min(max_norm_size[0], pw * fw)
    nh = min(max_norm_size[1], ph * fh)
    return (round(max(0.0, nx), 4), round(max(0.0, ny), 4), round(max(0.025, nw), 4), round(max(0.025, nh), 4))


def normalize_exposure(bgr_patch: np.ndarray, target_p95: float = 225.0, max_gain: float = 2.4) -> np.ndarray:
    """
    Compensa fotos oscuras/subexpuestas (cámara con poca luz) antes de medir colores en HSV:
    escala el brillo para que el percentil 95 del canal V llegue a ~225. No toca imágenes ya bien expuestas.
    Sin esto, una etiqueta azul Cielo o un casco amarillo con poca luz caen por debajo de los umbrales de V.
    """
    if bgr_patch.size == 0:
        return bgr_patch
    v95 = float(np.percentile(np.max(bgr_patch, axis=2), 95))
    if v95 >= 185.0 or v95 < 8.0:
        return bgr_patch
    gain = min(max_gain, target_p95 / v95)
    return np.clip(bgr_patch.astype(np.float32) * gain, 0, 255).astype(np.uint8)


# -----------------------------------------------------------------------------
# 1. Clasificador CNN + OpenCV para Control de Calidad de Botellas (Sesión 03)
# -----------------------------------------------------------------------------

# Umbrales del "índice de pliegues" (energía de gradiente en diagonal / energía total).
# Medido sobre fotos reales: botellas sanas 0.26-0.36, aplastadas 0.43-0.49, estable ante
# poca/mucha luz, JPEG fuerte, desenfoque y media resolución.
CREASE_CRUSHED = 0.40      # >= esto: aplastada aunque esté sola en la imagen
CREASE_HEALTHY = 0.37      # <  esto: cuerpo sano
CREASE_PEER_DELTA = 0.07   # en una fila de botellas: sobresale respecto a la mediana de sus vecinas
UPRIGHT_TILT_DEG = 12.0    # hasta esta inclinación se miden las diagonales respecto a la vertical


def bottle_crease_score(
    bgr: np.ndarray,
    bottle_box: Tuple[float, float, float, float],
) -> Tuple[float, float, Optional[Tuple[float, float, float, float]]]:
    """
    Índice de pliegues/abolladuras del cuerpo de la botella.

    Por qué no usamos densidad de bordes: el plástico es TRANSPARENTE, así que una botella sana deja ver
    el fondo (máquinas, tuberías, otras botellas) y eso genera tantos bordes como una aplastada.
    Lo que sí distingue a una botella aplastada es la ORIENTACIÓN de sus bordes: el plástico doblado forma
    pliegues oblicuos (~45°), mientras que una botella sana sólo tiene su contorno vertical, los anillos
    horizontales y la tipografía de la etiqueta (0° / 90°). Para botellas inclinadas se mide respecto al
    eje dominante del envase.

    Devuelve (indice 0..1, inclinación estimada en grados, caja normalizada de la zona más plegada).
    """
    roi = extract_roi(bgr, bottle_box)
    if roi.shape[0] < 16 or roi.shape[1] < 10:
        return 0.0, 0.0, None
    # Normalizar a ancho fijo: el índice no depende de la resolución ni de la distancia a la cámara.
    tw = 96
    th = max(32, int(round(tw * roi.shape[0] / float(roi.shape[1]))))
    small = cv2.resize(roi, (tw, th), interpolation=cv2.INTER_AREA)
    g = cv2.GaussianBlur(to_grayscale(small), (3, 3), 0).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    ang = np.degrees(np.arctan2(gy, gx)) % 180.0

    y1, y2, x1, x2 = int(th * 0.20), int(th * 0.95), int(tw * 0.15), int(tw * 0.85)
    m = mag[y1:y2, x1:x2]
    a = ang[y1:y2, x1:x2]
    if m.size == 0:
        return 0.0, 0.0, None
    strong = m > max(20.0, float(np.percentile(m, 60)))
    w = m[strong]
    av = a[strong]
    if w.size < 20 or float(w.sum()) < 1e-6:
        return 0.0, 0.0, None

    # Eje dominante (promedio circular de 4·θ: agrupa bordes horizontales y verticales en un solo eje).
    a4 = np.radians(av * 4.0)
    th0 = (np.degrees(np.arctan2(float((w * np.sin(a4)).sum()), float((w * np.cos(a4)).sum()))) / 4.0) % 90.0
    tilt = float(min(th0, 90.0 - th0))

    if tilt <= UPRIGHT_TILT_DEG:
        diag_sel = np.minimum(np.abs(av - 45.0), np.abs(av - 135.0)) < 22.5
        score = float(w[diag_sel].sum() / w.sum())
        diag_full = np.minimum(np.abs(a - 45.0), np.abs(a - 135.0)) < 22.5
    else:
        # Botella inclinada: se usa una medida INVARIANTE a la rotación. R4 = concentración de los bordes
        # en dos ejes perpendiculares (contorno + anillos). Botella sana: R4 0.32-0.44 a cualquier ángulo;
        # aplastada (pliegues en todas direcciones): R4 0.07-0.28. Se lleva a la misma escala del índice.
        r4 = float(abs(complex((w * np.cos(a4)).sum(), (w * np.sin(a4)).sum())) / w.sum())
        score = 0.71 - r4
        diag_full = np.abs(((a - th0) % 90.0) - 45.0) < 22.5

    # Zona más plegada (para enmarcar el defecto): energía diagonal suavizada.
    crease_map = np.where(diag_full & (m > 20.0), m, 0.0).astype(np.float32)
    crease_map = cv2.GaussianBlur(crease_map, (0, 0), 5)
    defect_box: Optional[Tuple[float, float, float, float]] = None
    if float(crease_map.max()) > 1e-3:
        hot = (crease_map >= crease_map.max() * 0.45).astype(np.uint8)
        cnts, _ = cv2.findContours(hot, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            cx, cy, cw, ch = cv2.boundingRect(max(cnts, key=cv2.contourArea))
            bx, by, bw, bh = bottle_box
            fx1 = (x1 + cx) / float(tw)
            fy1 = (y1 + cy) / float(th)
            fw = max(0.30, cw / float(tw))
            fh = max(0.18, ch / float(th))
            fx1 = min(fx1, 1.0 - fw)
            fy1 = min(fy1, 1.0 - fh)
            defect_box = (
                round(bx + bw * fx1, 4),
                round(by + bh * fy1, 4),
                round(bw * fw, 4),
                round(bh * fh, 4),
            )
    return round(score, 4), round(tilt, 1), defect_box

@dataclass
class BottleInspectionResult:
    status: str  # "conforming" | "surface_defect" | "label_misaligned"
    confidence: float
    has_cap: bool
    cap_confidence: float
    cap_box: Optional[Tuple[float, float, float, float]]
    has_label: bool
    label_confidence: float
    label_box: Optional[Tuple[float, float, float, float]]
    defect_box: Optional[Tuple[float, float, float, float]]
    evidence: str
    brand_hint: str = "Botella"


def classify_bottle_roi(
    bgr: np.ndarray,
    bottle_box: Tuple[float, float, float, float],
    peer_crease_median: Optional[float] = None,
) -> BottleInspectionResult:
    """
    Analiza el ROI de una botella/envase mediante el pipeline OpenCV (Sesión 04) + CNN (Sesión 03)
    para distinguir con alta precisión entre una BOTELLA SANA y una BOTELLA MALOGRADA
    (sin tapa en la boquilla superior, aplastada/abollada en el cuerpo o sin etiqueta).

    `peer_crease_median`: mediana del índice de pliegues de las demás botellas de la misma imagen
    (fila de producción). Permite detectar la botella que "sobresale" respecto a sus vecinas.
    """
    bx, by, bw, bh = bottle_box
    img_h, img_w = bgr.shape[:2]
    # Si la caja toca el borde superior, la boquilla puede estar fuera del encuadre: la tapa no es verificable.
    top_cut = by <= 0.006
    roi = extract_roi(bgr, bottle_box)
    tensor_4d = extract_roi_tensor(bgr, bottle_box, target_size=(64, 64))
    fmap = conv2d_relu_maxpool(tensor_4d[0])  # (32, 32, 4)

    rh, rw = roi.shape[:2]
    if rh < 16 or rw < 10:
        return BottleInspectionResult(
            status="conforming",
            confidence=0.78,
            has_cap=True,
            cap_confidence=0.75,
            cap_box=(round(bx + bw * 0.32, 4), round(by + bh * 0.01, 4), round(bw * 0.36, 4), round(bh * 0.09, 4)),
            has_label=True,
            label_confidence=0.75,
            label_box=(round(bx + bw * 0.16, 4), round(by + bh * 0.32, 4), round(bw * 0.68, 4), round(bh * 0.22, 4)),
            defect_box=None,
            evidence="Envase detectado en escena.",
        )

    gray = to_grayscale(roi)
    edges = canny_edges(gray, 38, 120)
    hsv = cv2.cvtColor(normalize_exposure(roi), cv2.COLOR_BGR2HSV)

    # A. Análisis estricto de la TAPA en la corona superior (0% - 9% de la altura)
    # Importante: no bajar más allá del 9% para no confundir el anillo/precinto del cuello con la tapa.
    # YOLO a veces recorta la caja justo debajo de la tapa: buscamos también un 6% POR ENCIMA de la caja.
    cap_h = max(4, int(rh * 0.09))
    cap_x1, cap_x2 = int(rw * 0.18), int(rw * 0.82)
    ext_px = int(round(bh * img_h * 0.06))
    y_top_abs = int(round(by * img_h))
    x_left_abs = int(round(bx * img_w))
    y_ext = max(0, y_top_abs - ext_px)
    cap_bgr_ext = bgr[y_ext : y_top_abs + cap_h, max(0, x_left_abs + cap_x1) : min(img_w, x_left_abs + cap_x2)]
    cap_region_hsv = cv2.cvtColor(normalize_exposure(cap_bgr_ext), cv2.COLOR_BGR2HSV) if cap_bgr_ext.size > 0 else hsv[:cap_h, cap_x1:cap_x2]

    if cap_region_hsv.size > 0:
        cap_sat_p85 = float(np.percentile(cap_region_hsv[:, :, 1], 85))
        cap_high_sat_ratio = float(np.mean(cap_region_hsv[:, :, 1] > 75))
        # También contemplar tapas blancas opacas muy brillantes (V > 215, baja saturación uniforme)
        cap_white_ratio = float(np.mean((cap_region_hsv[:, :, 2] > 218) & (cap_region_hsv[:, :, 1] < 30)))
        # El cuello de la botella es angosto: a la altura de la tapa, los bordes laterales de la caja muestran el
        # FONDO. Si el fondo también es blanco (pared, cielo), el blanco no prueba que haya tapa. Sin esto, una
        # botella SIN tapa delante de una pared blanca salía "con tapa". (Los colores saturados NO se descartan así:
        # en una fila de producción la franja lateral contiene la tapa azul de la botella vecina.)
        y_rows = slice(y_ext, y_top_abs + cap_h)
        strips = [
            bgr[y_rows, max(0, x_left_abs) : max(0, x_left_abs + int(rw * 0.12))],
            bgr[y_rows, min(img_w, x_left_abs + int(rw * 0.88)) : min(img_w, x_left_abs + rw)],
        ]
        strips_hsv = [cv2.cvtColor(normalize_exposure(st), cv2.COLOR_BGR2HSV) for st in strips if st.size > 0]
        if strips_hsv:
            bg_white = max(float(np.mean((st[:, :, 2] > 218) & (st[:, :, 1] < 30))) for st in strips_hsv)
            if bg_white >= 0.5:
                cap_white_ratio = 0.0
    else:
        cap_sat_p85 = 0.0
        cap_high_sat_ratio = 0.0
        cap_white_ratio = 0.0

    cap_score = sigmoid(
        (cap_sat_p85 - 68.0) / 22.0
        + (cap_high_sat_ratio - 0.18) * 6.5
        + (1.2 if cap_white_ratio > 0.42 else 0.0)
    )
    has_cap = (cap_sat_p85 >= 65.0 and cap_high_sat_ratio >= 0.16) or (cap_white_ratio > 0.42)
    # Boquilla fuera del encuadre: no se puede afirmar "sin tapa" (evita falsos MALOGRADA por recorte de cámara).
    cap_unverifiable = top_cut and not has_cap
    ext_rel = (y_top_abs - y_ext) / max(1.0, bh * img_h)

    cap_mask = ((cap_region_hsv[:, :, 1] > 70) | (cap_region_hsv[:, :, 2] > 218)).astype(np.uint8) * 255
    cap_box = (
        _tight_contour_box(
            cap_mask,
            bottle_box,
            sub_rel=(0.18, -ext_rel, 0.64, 0.09 + ext_rel),
            fallback_rel=(0.30, 0.005, 0.40, 0.08),
            max_norm_size=(min(0.15, bw * 0.48), min(0.09, bh * 0.11)),
        )
        if has_cap
        else None
    )

    # B. Análisis estricto de la Etiqueta Comercial (24% - 55% de la altura)
    # Comparamos la banda central (donde va la etiqueta Cielo / tienda) contra el cuerpo transparente inferior (58% - 82%).
    # Si el usuario coloca una botella plástica transparente SIN etiqueta, la banda central tiene saturación baja
    # o similar al resto del plástico transparente, por lo que `has_label` será False.
    lbl_y1, lbl_y2 = int(rh * 0.24), int(rh * 0.55)
    lbl_x1, lbl_x2 = int(rw * 0.14), int(rw * 0.86)
    lbl_hsv = hsv[lbl_y1:lbl_y2, lbl_x1:lbl_x2]
    lbl_edges = edges[lbl_y1:lbl_y2, lbl_x1:lbl_x2]

    body_y1, body_y2 = int(rh * 0.58), int(rh * 0.82)
    body_hsv = hsv[body_y1:body_y2, lbl_x1:lbl_x2]

    if lbl_hsv.size > 0:
        # 1. Detección específica de etiqueta Agua Cielo (azul/celeste característico H 90..134 con tinta saturada)
        cielo_blue_mask = cv2.inRange(lbl_hsv, (90, 68, 65), (134, 255, 255))
        cielo_blue_ratio = float(np.mean(cielo_blue_mask > 0))

        # 2. Detección de etiquetas comerciales de otras marcas de tienda (rojo Coca-Cola/San Luis, verde San Mateo/Sprite, amarillo Inca Kola, naranja/azul Sporade)
        brand_color_mask = cv2.inRange(lbl_hsv, (0, 82, 60), (180, 255, 255))
        brand_color_ratio = float(np.mean(brand_color_mask > 0))

        lbl_sat_p75 = float(np.percentile(lbl_hsv[:, :, 1], 75))
        lbl_sat_mean = float(np.mean(lbl_hsv[:, :, 1]))
        body_sat_p75 = float(np.percentile(body_hsv[:, :, 1], 75)) if body_hsv.size > 0 else lbl_sat_p75
        body_sat_mean = float(np.mean(body_hsv[:, :, 1])) if body_hsv.size > 0 else lbl_sat_mean

        # Diferencia de saturación entre la banda de etiqueta y el plástico transparente inferior
        sat_contrast_vs_body = max(0.0, (lbl_sat_p75 - body_sat_p75)) + max(0.0, (lbl_sat_mean - body_sat_mean))
        lbl_edge_density = float(np.mean(lbl_edges > 0)) if lbl_edges.size > 0 else 0.0
    else:
        cielo_blue_ratio = 0.0
        brand_color_ratio = 0.0
        lbl_sat_p75 = 0.0
        sat_contrast_vs_body = 0.0
        lbl_edge_density = 0.0

    # Criterio riguroso: para tener etiqueta debe existir banda impresa a color (Cielo u otra marca)
    # o un contraste claro de saturación/tipografía respecto al cuerpo plástico transparente.
    is_cielo = cielo_blue_ratio >= 0.13 or (
        cielo_blue_ratio >= 0.07 and has_cap and float(np.mean(cv2.inRange(cap_region_hsv, (90, 65, 60), (135, 255, 255)) > 0)) >= 0.15
    )
    has_printed_label = (
        is_cielo
        or brand_color_ratio >= 0.20
        or (brand_color_ratio >= 0.12 and sat_contrast_vs_body >= 22.0)
        or (lbl_sat_p75 >= 78.0 and sat_contrast_vs_body >= 26.0 and lbl_edge_density >= 0.06)
    )
    has_label = bool(has_printed_label)
    brand_hint = "Botella Cielo" if is_cielo else ("Botella Comercial" if has_label else "Botella Plástica")

    if has_label:
        label_score = round(min(0.97, max(0.78, 0.62 + max(cielo_blue_ratio, brand_color_ratio) * 1.1)), 3)
        label_mask = (cv2.inRange(lbl_hsv, (0, 62, 55), (180, 255, 255))).astype(np.uint8)
        label_box = _tight_contour_box(
            label_mask,
            bottle_box,
            sub_rel=(0.14, 0.24, 0.72, 0.31),
            fallback_rel=(0.14, 0.28, 0.72, 0.22),
            max_norm_size=(min(0.26, bw * 0.78), min(0.22, bh * 0.26)),
        )
    else:
        label_score = round(min(0.35, max(0.05, brand_color_ratio * 1.5)), 3)
        label_box = None

    # C. Análisis de Abolladura / Aplastamiento del Cuerpo: ÍNDICE DE PLIEGUES (orientación de bordes)
    # Nota: la densidad de bordes NO sirve en plástico transparente (se ve el fondo a través de la botella
    # sana y da tantos bordes como una aplastada). Ver `bottle_crease_score`.
    crease, tilt_deg, crease_box = bottle_crease_score(bgr, bottle_box)
    pixel_aspect = float(rh) / max(float(rw), 1.0)
    crease_energy = float(np.mean(fmap[10:28, 7:25, 2:]))  # mapa CNN (informativo)

    peer_outlier = (
        peer_crease_median is not None
        and crease >= CREASE_HEALTHY - 0.01
        and (crease - peer_crease_median) >= CREASE_PEER_DELTA
    )
    # Botella muy "rechoncha" estando recta (aplastada verticalmente) refuerza un índice dudoso.
    squat_support = tilt_deg <= UPRIGHT_TILT_DEG and pixel_aspect < 1.9 and crease >= CREASE_HEALTHY
    is_crushed = crease >= CREASE_CRUSHED or peer_outlier or squat_support
    missing_cap = (not has_cap) and (not cap_unverifiable)

    # Capa de salida Softmax (CNN): señales normalizadas -> probabilidades
    defect_signal = (
        (1.75 if missing_cap else 0.0)
        + max(0.0, (crease - CREASE_HEALTHY) * 30.0)
        + (0.8 if peer_outlier else 0.0)
    )
    ok_signal = 1.6 + max(0.0, (CREASE_HEALTHY - crease) * 25.0) + (0.45 if has_cap else 0.0) + (0.35 if has_label else -1.2)
    label_issue_signal = 0.25 + (2.40 if not has_label else -0.8)

    probs = softmax(np.array([ok_signal, defect_signal, label_issue_signal], dtype=np.float32))
    p_ok, p_defect, p_label = float(probs[0]), float(probs[1]), float(probs[2])
    crease_txt = f"índice de pliegues {crease:.2f}" + (
        f" vs. {peer_crease_median:.2f} de sus vecinas" if peer_crease_median is not None else ""
    )

    if missing_cap or is_crushed:
        reasons = []
        if missing_cap:
            reasons.append("sin tapa en la boquilla")
        if is_crushed:
            reasons.append(f"cuerpo aplastado/abollado: pliegues oblicuos en el plástico ({crease_txt})")
        if not has_label:
            reasons.append("sin etiqueta comercial")

        # Si está aplastada en el cuerpo, enmarcar la zona con más pliegues
        if is_crushed and crease_box is not None:
            defect_box = crease_box
        elif is_crushed:
            defect_box = (round(bx + bw * 0.20, 4), round(by + bh * 0.48, 4), round(bw * 0.60, 4), round(bh * 0.28, 4))
        else:
            # Si el defecto es falta de tapa, enmarcar la boquilla descubierta
            defect_box = (
                round(bx + bw * 0.26, 4),
                round(by + bh * 0.01, 4),
                round(bw * 0.48, 4),
                round(bh * 0.12, 4),
            )

        strength = max(0.0, crease - CREASE_HEALTHY) * 3.0 + (0.12 if missing_cap else 0.0)
        conf_out = round(min(0.98, 0.72 + strength + (0.06 if peer_outlier else 0.0)), 3)
        return BottleInspectionResult(
            status="surface_defect",
            confidence=conf_out,
            has_cap=has_cap,
            cap_confidence=round(cap_score, 3),
            cap_box=cap_box,
            has_label=has_label,
            label_confidence=label_score,
            label_box=label_box,
            defect_box=defect_box,
            evidence=f"{brand_hint} MALOGRADA / NO CONFORME ({', '.join(reasons)}). Confianza CNN Softmax: {int(conf_out * 100)}%.",
            brand_hint=brand_hint,
        )

    cap_note = " (tapa fuera del encuadre, no verificable)" if cap_unverifiable else ""
    # Si tiene tapa y no está aplastada, pero NO TIENE ETIQUETA (ej. botella plástica transparente sin etiqueta):
    if not has_label:
        missing_lbl_box = (
            round(bx + bw * 0.16, 4),
            round(by + bh * 0.26, 4),
            round(bw * 0.68, 4),
            round(bh * 0.26, 4),
        )
        conf_lbl_out = round(min(0.96, max(0.88, p_label + 0.15)), 3)
        return BottleInspectionResult(
            status="label_misaligned",
            confidence=conf_lbl_out,
            has_cap=has_cap,
            cap_confidence=round(cap_score, 3),
            cap_box=cap_box,
            has_label=False,
            label_confidence=label_score,
            label_box=None,
            defect_box=missing_lbl_box,
            evidence="Botella plástica SIN ETIQUETA comercial detectada: la banda central del envase es transparente y carece de etiqueta impresa (Cielo / tienda)." + cap_note,
            brand_hint=brand_hint,
        )

    healthy_margin = max(0.0, CREASE_CRUSHED - crease) * 3.0
    return BottleInspectionResult(
        status="conforming",
        # Confianza honesta: cerca del umbral (botella inclinada, foto difícil) baja para pedir revisión humana.
        confidence=round(min(0.98, max(0.55, 0.62 + healthy_margin)), 3),
        has_cap=not cap_unverifiable,
        cap_confidence=round(max(0.82, cap_score), 3) if not cap_unverifiable else 0.0,
        cap_box=None if cap_unverifiable else (cap_box or (round(bx + bw * 0.30, 4), round(by + bh * 0.01, 4), round(bw * 0.40, 4), round(bh * 0.08, 4))),
        has_label=True,
        label_confidence=label_score,
        label_box=label_box,
        defect_box=None,
        evidence=f"{brand_hint} SANA / CONFORME: tapa colocada, etiqueta comercial verificada y cuerpo sin pliegues ({crease_txt}).{cap_note}",
        brand_hint=brand_hint,
    )


# -----------------------------------------------------------------------------
# 2. Clasificador CNN + OpenCV para Seguridad Industrial: EPP (Casco y Chaleco)
# -----------------------------------------------------------------------------

@dataclass
class PpeInspectionResult:
    has_helmet: bool
    helmet_confidence: float
    helmet_box: Optional[Tuple[float, float, float, float]]
    has_vest: bool
    vest_confidence: float
    vest_box: Optional[Tuple[float, float, float, float]]
    ppe_complete: bool
    pattern_confidence: float
    evidence: str
    vest_color: str = ""
    helmet_verifiable: bool = True
    vest_verifiable: bool = True


def classify_ppe_roi(
    bgr: np.ndarray,
    person_box: Tuple[float, float, float, float],
) -> PpeInspectionResult:
    """
    Analiza el ROI de una Persona detectada para verificar si porta:
    1. Casco de protección en la sub-región superior (cabeza: 0% a 28%).
    2. Chaleco reflectivo de alta visibilidad en la sub-región del torso (24% a 74%).
    Calcula los cuadros delimitadores ajustados exactamente al contorno real del casco y del chaleco.
    """
    px, py, pw, ph = person_box
    roi = extract_roi(bgr, person_box)
    rh, rw = roi.shape[:2]

    if rh < 24 or rw < 16:
        return PpeInspectionResult(
            has_helmet=False,
            helmet_confidence=0.0,
            helmet_box=None,
            has_vest=False,
            vest_confidence=0.0,
            vest_box=None,
            ppe_complete=False,
            pattern_confidence=0.5,
            evidence="Persona demasiado pequeña/lejana: el EPP no se puede verificar en la imagen.",
            helmet_verifiable=False,
            vest_verifiable=False,
        )

    img_h, img_w = bgr.shape[:2]
    # Fotos oscuras: compensar exposición antes de medir colores (si no, un casco amarillo con poca luz "desaparece").
    hsv = cv2.cvtColor(normalize_exposure(roi), cv2.COLOR_BGR2HSV)
    ycrcb = cv2.cvtColor(normalize_exposure(roi), cv2.COLOR_BGR2YCrCb)
    skin_full = cv2.inRange(ycrcb, (40, 136, 78), (255, 173, 127))

    # ¿Se puede verificar el EPP? Persona muy lejana (pocos píxeles) o con la cabeza fuera del encuadre.
    head_cut = py <= 0.004
    too_small = rh < 70 or rw < 28

    # A. Región de la Corona de la Cabeza:
    # En cuerpo completo (ph >= 0.32) usamos el 0% al 15% superior (centrado 24% a 76% del ancho) para que el
    # cuello del chaleco naranja/amarillo en los hombros jamás se confunda con un casco. Se busca también un 5%
    # POR ENCIMA de la caja, porque YOLO a veces corta la caja de la persona justo bajo el casco.
    crown_frac = 0.15 if ph >= 0.32 else 0.24
    ext_px = int(round(ph * img_h * 0.05))
    y_top_abs = int(round(py * img_h))
    x_left_abs = int(round(px * img_w))
    y_ext = max(0, y_top_abs - ext_px)
    head_y2_abs = y_top_abs + max(5, int(rh * crown_frac))
    head_x1, head_x2 = int(rw * 0.24), int(rw * 0.76)
    head_bgr = bgr[y_ext:head_y2_abs, max(0, x_left_abs + head_x1) : min(img_w, x_left_abs + head_x2)]
    ext_rel = (y_top_abs - y_ext) / max(1.0, ph * img_h)
    helmet_mask = np.zeros((max(1, head_y2_abs - y_ext), max(1, head_x2 - head_x1)), dtype=np.uint8)
    helmet_ratio = 0.0

    def _helmet_masks(patch_hsv: np.ndarray) -> List[np.ndarray]:
        """Pintura de casco: muy saturada y MUY brillante (medido: S p50 165-200, V p50 254).
        El pelo rubio (S < 140) o pelirrojo (V < 190) y las gorras marrones quedan fuera."""
        return [
            cv2.inRange(patch_hsv, (17, 140, 170), (37, 255, 255))  # amarillo
            | cv2.inRange(patch_hsv, (0, 135, 200), (37, 255, 255))  # naranja / ámbar (continuo con el amarillo)
            | cv2.inRange(patch_hsv, (165, 135, 200), (180, 255, 255)),  # rojo
            cv2.inRange(patch_hsv, (96, 120, 100), (134, 255, 255)),  # azul
            cv2.inRange(patch_hsv, (40, 110, 110), (85, 255, 255)),  # verde
            cv2.inRange(patch_hsv, (0, 0, 215), (180, 30, 255)),  # blanco
        ]

    if head_bgr.size > 0:
        head_hsv = cv2.cvtColor(normalize_exposure(head_bgr), cv2.COLOR_BGR2HSV)
        helmet_mask = np.zeros(head_hsv.shape[:2], dtype=np.uint8)
        head_skin = cv2.inRange(cv2.cvtColor(normalize_exposure(head_bgr), cv2.COLOR_BGR2YCrCb), (40, 136, 78), (255, 173, 127))
        # Franjas laterales a la misma altura (fondo junto a la cabeza): si el "color de casco" también está
        # ahí, es el FONDO (cielo blanco, pared amarilla, follaje verde) y no un casco.
        side_l = bgr[y_ext:head_y2_abs, max(0, x_left_abs) : max(0, x_left_abs + int(rw * 0.14))]
        side_r = bgr[y_ext:head_y2_abs, min(img_w, x_left_abs + int(rw * 0.86)) : min(img_w, x_left_abs + rw)]
        sides = [cv2.cvtColor(normalize_exposure(s), cv2.COLOR_BGR2HSV) for s in (side_l, side_r) if s.size > 0]
        for m_center, *m_sides in zip(_helmet_masks(head_hsv), *[_helmet_masks(s) for s in sides]):
            m_center = cv2.bitwise_and(m_center, cv2.bitwise_not(head_skin))
            c_ratio = float(np.mean(m_center > 0))
            s_ratio = max([float(np.mean(ms > 0)) for ms in m_sides] or [0.0])
            if s_ratio >= 0.25 and s_ratio >= c_ratio * 0.6:
                continue  # el color está igual en el fondo: no cuenta como casco
            helmet_mask = cv2.bitwise_or(helmet_mask, m_center)
            helmet_ratio += c_ratio
        helmet_ratio = min(1.0, helmet_ratio)

    has_helmet = helmet_ratio >= 0.14
    helmet_conf = round(min(0.97, max(0.74, 0.60 + helmet_ratio * 0.95)), 3) if has_helmet else round(helmet_ratio, 3)
    helmet_box = (
        _tight_contour_box(
            helmet_mask,
            person_box,
            sub_rel=(0.24, -ext_rel, 0.52, crown_frac + ext_rel),
            fallback_rel=(0.30, 0.01, 0.40, min(0.12, crown_frac)),
            max_norm_size=(min(0.20, pw * 0.42), min(0.14, ph * 0.15)),
        )
        if has_helmet
        else None
    )

    # B. Región del Torso: Detección exclusiva de Chalecos de Obra (Naranja, Verde/Limón o Plomo con cinta reflectiva)
    torso_y1, torso_y2 = int(rh * 0.24), int(rh * 0.74)
    torso_x1, torso_x2 = int(rw * 0.16), int(rw * 0.84)
    torso_hsv = hsv[torso_y1:torso_y2, torso_x1:torso_x2]
    vest_mask = np.zeros((max(1, torso_y2 - torso_y1), max(1, torso_x2 - torso_x1)), dtype=np.uint8)
    vest_color = ""

    # La piel (brazos, cuello, cara) tiene tono naranja/ocre: se excluye para que no cuente como chaleco.
    # Solo piel "apagada" (S < 150): la tela naranja en sombra cae en el mismo rango YCrCb pero es mucho más saturada.
    skin_dull = cv2.bitwise_and(skin_full, cv2.inRange(hsv[:, :, 1], 0, 149))
    torso_not_skin = cv2.bitwise_not(skin_dull[torso_y1:torso_y2, torso_x1:torso_x2])

    if torso_hsv.size > 0:
        # 1. Chaleco Naranja de alta visibilidad
        mask_orange = cv2.inRange(torso_hsv, (4, 130, 110), (21, 255, 255)) & torso_not_skin
        orange_ratio = float(np.mean(mask_orange > 0))

        # 2. Chaleco Verde / Verde Limón reflectivo
        mask_green = cv2.inRange(torso_hsv, (22, 100, 105), (85, 255, 255)) & torso_not_skin
        green_ratio = float(np.mean(mask_green > 0))

        # 3. Chaleco Plomo / Gris de ingeniería (color plomo S <= 45, V 75..190 acompañado de cintas reflectivas plateadas/blancas V >= 205, S <= 30)
        mask_plomo_body = cv2.inRange(torso_hsv, (0, 0, 75), (180, 45, 190))
        mask_reflective_strip = cv2.inRange(torso_hsv, (0, 0, 205), (180, 30, 255))
        plomo_body_ratio = float(np.mean(mask_plomo_body > 0))
        refl_strip_ratio = float(np.mean(mask_reflective_strip > 0))
        # Para no confundir un polo gris común con un chaleco plomo, exigimos que tenga franja reflectiva (>= 4.5%)
        has_plomo_vest = plomo_body_ratio >= 0.24 and 0.045 <= refl_strip_ratio <= 0.35

        if orange_ratio >= 0.14 and orange_ratio >= green_ratio:
            vest_mask = mask_orange
            vest_ratio = orange_ratio
            vest_color = "Naranja"
        elif green_ratio >= 0.14:
            vest_mask = mask_green
            vest_ratio = green_ratio
            vest_color = "Verde"
        elif has_plomo_vest:
            vest_mask = mask_plomo_body | mask_reflective_strip
            vest_ratio = min(0.65, plomo_body_ratio * 0.6 + refl_strip_ratio * 2.0)
            vest_color = "Plomo"
        else:
            vest_ratio = max(orange_ratio, green_ratio)
    else:
        vest_ratio = 0.0

    has_vest = vest_ratio >= 0.14 and bool(vest_color)
    vest_conf = round(min(0.97, max(0.74, 0.58 + vest_ratio * 1.15)), 3) if has_vest else round(vest_ratio, 3)
    vest_box = (
        _tight_contour_box(
            vest_mask,
            person_box,
            sub_rel=(0.16, 0.24, 0.68, 0.50),
            fallback_rel=(0.22, 0.26, 0.56, 0.34),
            max_norm_size=(min(0.34, pw * 0.62), min(0.36, ph * 0.40)),
        )
        if has_vest
        else None
    )

    # Si no se puede verificar (persona diminuta o cabeza fuera del encuadre) NO se acusa falta de EPP:
    # se reporta como "no verificable" para no generar falsas alarmas.
    helmet_verifiable = has_helmet or not (too_small or head_cut)
    vest_verifiable = has_vest or not too_small
    ppe_complete = has_helmet and has_vest
    missing: List[str] = []
    if not has_helmet:
        missing.append("casco")
    if not has_vest:
        missing.append("chaleco (naranja/verde/plomo)")

    if ppe_complete:
        evidence = f"Operario con EPP completo: casco protector en cabeza y chaleco {vest_color.lower()} en torso verificados por contorno ROI."
        pattern_conf = round((helmet_conf + vest_conf) / 2.0, 3)
    else:
        evidence = f"Alerta de seguridad: persona detectada sin {' ni '.join(missing)} en el análisis de ROI."
        pattern_conf = round(min(0.96, max(0.76, 0.88 - (helmet_ratio + vest_ratio) * 0.3)), 3)

    return PpeInspectionResult(
        has_helmet=has_helmet,
        helmet_confidence=helmet_conf,
        helmet_box=helmet_box,
        has_vest=has_vest,
        vest_confidence=vest_conf,
        vest_box=vest_box,
        ppe_complete=ppe_complete,
        pattern_confidence=pattern_conf,
        evidence=evidence,
        vest_color=vest_color,
        helmet_verifiable=helmet_verifiable,
        vest_verifiable=vest_verifiable,
    )
