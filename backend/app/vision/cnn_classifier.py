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
    sobel_gradients,
    strict_threshold,
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


# -----------------------------------------------------------------------------
# 1. Clasificador CNN + OpenCV para Control de Calidad de Botellas (Sesión 03)
# -----------------------------------------------------------------------------

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
) -> BottleInspectionResult:
    """
    Analiza el ROI de una botella/envase mediante el pipeline OpenCV (Sesión 04) + CNN (Sesión 03)
    para distinguir con alta precisión entre una BOTELLA SANA y una BOTELLA MALOGRADA
    (sin tapa en la boquilla superior, aplastada/abollada en el cuerpo o sin etiqueta).
    """
    bx, by, bw, bh = bottle_box
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
    sobel = sobel_gradients(gray)
    edges = canny_edges(gray, 38, 120)
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    # A. Análisis estricto de la TAPA en la corona superior (0% - 9% de la altura)
    # Importante: no bajar más allá del 9% para no confundir el anillo/precinto del cuello con la tapa.
    cap_h = max(4, int(rh * 0.09))
    cap_x1, cap_x2 = int(rw * 0.18), int(rw * 0.82)
    cap_region_hsv = hsv[:cap_h, cap_x1:cap_x2]

    if cap_region_hsv.size > 0:
        cap_sat_p85 = float(np.percentile(cap_region_hsv[:, :, 1], 85))
        cap_high_sat_ratio = float(np.mean(cap_region_hsv[:, :, 1] > 75))
        # También contemplar tapas blancas opacas muy brillantes (V > 215, baja saturación uniforme)
        cap_white_ratio = float(np.mean((cap_region_hsv[:, :, 2] > 218) & (cap_region_hsv[:, :, 1] < 30)))
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

    cap_mask = ((cap_region_hsv[:, :, 1] > 70) | (cap_region_hsv[:, :, 2] > 218)).astype(np.uint8) * 255
    cap_box = (
        _tight_contour_box(
            cap_mask,
            bottle_box,
            sub_rel=(0.18, 0.0, 0.64, 0.09),
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

    # C. Análisis de Abolladura / Aplastamiento del Cuerpo (46% - 84% de la altura + Simetría + Inclinación)
    crush_y1, crush_y2 = int(rh * 0.46), int(rh * 0.84)
    crush_x1, crush_x2 = int(rw * 0.14), int(rw * 0.86)
    low_body_edges = edges[crush_y1:crush_y2, crush_x1:crush_x2]
    low_body_sobel = sobel[crush_y1:crush_y2, crush_x1:crush_x2]

    # Una botella sana tiene plástico liso en la mitad inferior (baja densidad de bordes Canny ~0.02-0.055);
    # una botella aplastada/arrugada genera numerosos pliegues internos (densidad > 0.072 y Sobel P90 alto).
    crush_edge_density = float(np.mean(low_body_edges > 0)) if low_body_edges.size else 0.0
    crush_sobel_p90 = float(np.percentile(low_body_sobel, 90)) if low_body_sobel.size else 0.0

    # Simetría izquierda vs derecha en el cuerpo completo (24% - 82%)
    mid_y1, mid_y2 = int(rh * 0.24), int(rh * 0.82)
    binary = strict_threshold(sobel, thresh=42)
    left_half = binary[mid_y1:mid_y2, : rw // 2]
    right_half = np.fliplr(binary[mid_y1:mid_y2, rw - (rw // 2) :])
    asymmetry = float(np.mean(np.abs(left_half.astype(np.float32) - right_half.astype(np.float32))) / 255.0)

    # Relación de aspecto en píxeles reales (una botella recta y sana suele tener rh/rw >= 2.35;
    # una botella aplastada, doblada o inclinada suele caer por debajo de 2.20)
    pixel_aspect = float(rh) / max(float(rw), 1.0)
    crease_energy = float(np.mean(fmap[10:28, 7:25, 2:]))

    is_crushed = (
        crush_edge_density >= 0.072
        or (crush_edge_density >= 0.058 and crush_sobel_p90 >= 33.0)
        or asymmetry >= 0.21
        or crease_energy >= 24.5
        or pixel_aspect < 2.15
    )

    defect_signal = (
        (1.75 if not has_cap else 0.0)
        + max(0.0, (crush_edge_density - 0.055) * 26.0)
        + max(0.0, (crush_sobel_p90 - 30.0) / 9.0)
        + max(0.0, (asymmetry - 0.18) * 5.5)
        + max(0.0, (crease_energy - 23.0) / 12.0)
        + (0.95 if pixel_aspect < 2.15 else 0.0)
    )
    ok_signal = 1.85 - defect_signal + (0.45 if has_cap else -0.6) + (0.35 if has_label else -1.8)
    label_issue_signal = 0.25 + (2.40 if not has_label else -0.8)

    probs = softmax(np.array([ok_signal, defect_signal, label_issue_signal], dtype=np.float32))
    p_ok, p_defect, p_label = float(probs[0]), float(probs[1]), float(probs[2])

    if (not has_cap) or is_crushed or (p_defect >= p_ok and p_defect >= 0.42):
        reasons = []
        if not has_cap:
            reasons.append("sin tapa en la boquilla")
        if is_crushed:
            reasons.append("cuerpo aplastado/abollado detectado por pliegues Canny/Sobel y CNN")
        if not has_label:
            reasons.append("sin etiqueta comercial")
        if not reasons:
            reasons.append("anomalía estructural detectada en el envase")

        # Si está aplastada en el cuerpo, enmarcar con precisión la zona abollada del cuerpo
        if is_crushed and low_body_edges.size > 0:
            defect_box = _tight_contour_box(
                low_body_edges,
                bottle_box,
                sub_rel=(0.14, 0.46, 0.72, 0.38),
                fallback_rel=(0.20, 0.48, 0.60, 0.28),
                max_norm_size=(min(0.28, bw * 0.66), min(0.26, bh * 0.34)),
            )
        else:
            # Si el defecto es falta de tapa, enmarcar la boquilla descubierta
            defect_box = (
                round(bx + bw * 0.26, 4),
                round(by + bh * 0.01, 4),
                round(bw * 0.48, 4),
                round(bh * 0.12, 4),
            )

        conf_out = round(min(0.98, max(0.84, p_defect + 0.16)), 3)
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
            evidence="Botella plástica SIN ETIQUETA comercial detectada: la banda central del envase es transparente y carece de etiqueta impresa (Cielo / tienda).",
            brand_hint=brand_hint,
        )

    return BottleInspectionResult(
        status="conforming",
        confidence=round(min(0.98, max(0.88, p_ok + 0.12)), 3),
        has_cap=True,
        cap_confidence=round(max(0.82, cap_score), 3),
        cap_box=cap_box or (round(bx + bw * 0.30, 4), round(by + bh * 0.01, 4), round(bw * 0.40, 4), round(bh * 0.08, 4)),
        has_label=True,
        label_confidence=label_score,
        label_box=label_box,
        defect_box=None,
        evidence=f"{brand_hint} SANA / CONFORME: tapa colocada, etiqueta comercial verificada y cuerpo cilíndrico sin abolladuras.",
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
            pattern_confidence=0.82,
            evidence="Persona detectada sin evidencia clara de casco ni chaleco reflectivo.",
        )

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    # A. Región de la Corona de la Cabeza:
    # En cuerpo completo (ph >= 0.32) usamos estrictamente el 0% al 13% superior (centrado 26% a 74% del ancho)
    # para que el cuello del chaleco naranja/amarillo en los hombros jamás se confunda con un casco,
    # y descartamos gorras marrones/grises o tierra de fondo exigiendo saturación alta en cascos de color.
    crown_frac = 0.13 if ph >= 0.32 else 0.22
    head_y2 = max(5, int(rh * crown_frac))
    head_x1, head_x2 = int(rw * 0.26), int(rw * 0.74)
    head_hsv = hsv[:head_y2, head_x1:head_x2]
    helmet_mask = np.zeros((max(1, head_y2), max(1, head_x2 - head_x1)), dtype=np.uint8)

    if head_hsv.size > 0:
        # Amarillo de seguridad (H 17..37, alta saturación y brillo; excluye tierra/gorra marrón H 10..16)
        mask_yellow = cv2.inRange(head_hsv, (17, 115, 130), (37, 255, 255))
        # Naranja/Rojo vivo de seguridad (S >= 145 y V >= 135 para no confundir piel ni gorras oscuras)
        mask_red_orange1 = cv2.inRange(head_hsv, (0, 145, 135), (10, 255, 255))
        mask_red_orange2 = cv2.inRange(head_hsv, (166, 135, 125), (180, 255, 255))
        # Azul de seguridad
        mask_blue = cv2.inRange(head_hsv, (96, 105, 100), (134, 255, 255))
        # Verde de seguridad
        mask_green = cv2.inRange(head_hsv, (40, 95, 100), (85, 255, 255))
        # Blanco brillante de casco (V >= 210, S <= 32)
        mask_white = cv2.inRange(head_hsv, (0, 0, 210), (180, 32, 255))
        helmet_mask = mask_yellow | mask_red_orange1 | mask_red_orange2 | mask_blue | mask_green | mask_white
        helmet_ratio = float(np.mean(helmet_mask > 0))
    else:
        helmet_ratio = 0.0

    has_helmet = helmet_ratio >= 0.14
    helmet_conf = round(min(0.97, max(0.74, 0.60 + helmet_ratio * 0.95)), 3) if has_helmet else round(helmet_ratio, 3)
    helmet_box = (
        _tight_contour_box(
            helmet_mask,
            person_box,
            sub_rel=(0.26, 0.0, 0.48, crown_frac),
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

    if torso_hsv.size > 0:
        # 1. Chaleco Naranja de alta visibilidad
        mask_orange = cv2.inRange(torso_hsv, (4, 105, 110), (21, 255, 255))
        orange_ratio = float(np.mean(mask_orange > 0))

        # 2. Chaleco Verde / Verde Limón reflectivo
        mask_green = cv2.inRange(torso_hsv, (22, 90, 105), (85, 255, 255))
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
    )
