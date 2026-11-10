"""
Motor Principal de Inferencia VISION AI (YOLOv8 + OpenCV + Clasificador CNN por ROI + Rastreador IoU).
Produce exactamente el contrato esperado por el Frontend:
  - detections: [{ id, label, classId, confidence, box: { x, y, width, height }, trackId }]
  - masks: [{ id, classId, label, kind, polygon: [[x, y], ...], areaRatio, confidence }]
  - patterns: [{ id, type, label, confidence, evidence, source, relatedDetectionIds }]
"""

from __future__ import annotations
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from .cnn_classifier import bottle_crease_score, classify_bottle_roi, classify_ppe_roi
from .opencv_pipeline import canny_edges, encode_jpeg_data_url, extract_roi, to_grayscale
from .abandoned import BAG_COCO, monitor_for, person_is_near, target_settings

# Mapeo de clases COCO (YOLOv8) al dominio de VISION AI
COCO_TO_DOMAIN: Dict[int, Tuple[str, str]] = {
    0: ("person", "Persona"),
    2: ("car", "Auto"),
    3: ("motorcycle", "Motocicleta"),
    5: ("bus", "Bus"),
    7: ("truck", "Camión"),
    39: ("product", "Botella / Envase"),
    40: ("product", "Botella / Envase"),
    41: ("product", "Botella / Envase"),
    75: ("product", "Botella / Envase"),
}

# Clases de objetos cotidianos que suelen causar falsos positivos de "persona" a baja confianza
CLUTTER_COCO_CLASSES = {
    24: "backpack",   # mochila
    26: "handbag",    # bolso
    28: "suitcase",   # maleta
    56: "chair",      # silla
}

VEHICLE_CLASSES = {"car", "bus", "truck", "motorcycle"}


def compute_iou(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = aw * ah + bw * bh - inter
    return inter / union if union > 1e-6 else 0.0


def box_containment(inner: Tuple[float, float, float, float], outer: Tuple[float, float, float, float]) -> float:
    """Fracción del área de `inner` que está contenida dentro de `outer`."""
    ix, iy, iw, ih = inner
    ox, oy, ow, oh = outer
    x1 = max(ix, ox)
    y1 = max(iy, oy)
    x2 = min(ix + iw, ox + ow)
    y2 = min(iy + ih, oy + oh)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area = iw * ih
    return inter / area if area > 1e-6 else 0.0


def position_Zone_label(box: Tuple[float, float, float, float]) -> str:
    """Devuelve la ubicación espacial legible del sujeto dentro del encuadre (izquierda, centro, derecha)."""
    cx = box[0] + box[2] * 0.5
    if cx < 0.36:
        return "sector izquierdo"
    if cx > 0.64:
        return "sector derecho"
    return "sector central"


def render_annotated_snapshot(bgr: np.ndarray, detections: List[Dict[str, Any]]) -> str:
    """
    Dibuja con OpenCV los recuadros delimitadores y etiquetas identificadoras sobre una copia compacta
    del fotograma para guardarla como captura de evidencia en Alertas e Historial.
    """
    h, w = bgr.shape[:2]
    max_w = 640
    scale = min(1.0, max_w / float(max(w, 1)))
    if scale < 1.0:
        canvas = cv2.resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    else:
        canvas = bgr.copy()
    ch, cw = canvas.shape[:2]

    for d in detections:
        box = d.get("box", {})
        x1 = max(0, min(cw - 1, int(round(float(box.get("x", 0)) * cw))))
        y1 = max(0, min(ch - 1, int(round(float(box.get("y", 0)) * ch))))
        x2 = max(x1 + 2, min(cw, int(round((float(box.get("x", 0)) + float(box.get("width", 0))) * cw))))
        y2 = max(y1 + 2, min(ch, int(round((float(box.get("y", 0)) + float(box.get("height", 0))) * ch))))
        cls_id = d.get("classId", "")
        lbl_raw = str(d.get("label", cls_id))
        conf_pct = int(round(float(d.get("confidence", 0)) * 100))
        lbl_ascii = (
            lbl_raw.replace("á", "a")
            .replace("é", "e")
            .replace("í", "i")
            .replace("ó", "o")
            .replace("ú", "u")
            .replace("Á", "A")
            .replace("É", "E")
            .replace("Í", "I")
            .replace("Ó", "O")
            .replace("Ú", "U")
            .replace("ñ", "n")
            .replace("Ñ", "N")
            .replace("·", "-")
        )
        tag = f"{lbl_ascii} {conf_pct}%"

        if (
            "SIN " in lbl_raw
            or "MALOGRADA" in lbl_raw
            or "RESTRINGIDO" in lbl_raw
            or "DESVÍO" in lbl_raw
            or "DESVIO" in lbl_raw
            or "FUERA DE RUTA" in lbl_raw
            or "DISTANCIA CRÍTICA" in lbl_raw
            or "DISTANCIA CRITICA" in lbl_raw
            or "TRANSPORTE PESADO" in lbl_raw
            or "PEATÓN EN VÍA" in lbl_raw
            or "PEATON EN VIA" in lbl_raw
            or "ABANDONADO" in lbl_raw
            or cls_id == "defect"
        ):
            color = (45, 45, 230)  # Rojo alerta en BGR
        elif "SIN DUEÑO" in lbl_raw:
            color = (0, 160, 245)  # Ámbar: bulto sin persona cerca, contador en curso
        elif "SANA" in lbl_raw or "EPP OK" in lbl_raw or cls_id in ("helmet", "vest", "cap", "label"):
            color = (65, 175, 40)  # Verde conforme en BGR
        else:
            color = (215, 120, 30)  # Azul corporativo en BGR

        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
        tw = min(cw - x1, len(tag) * 7 + 10)
        ty1 = max(0, y1 - 18)
        cv2.rectangle(canvas, (x1, ty1), (x1 + tw, ty1 + 18), color, -1)
        cv2.putText(canvas, tag, (x1 + 4, ty1 + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 255, 255), 1, cv2.LINE_AA)

    return encode_jpeg_data_url(canvas, quality=78)


def box_to_octagon_mask(box: Tuple[float, float, float, float]) -> Tuple[List[List[float]], float]:
    """Genera un polígono octogonal suave normalizado 0..1 alrededor del objeto para la máscara de instancia."""
    x, y, w, h = box
    pts = [
        [round(max(0.0, min(1.0, x + w * 0.18)), 4), round(max(0.0, min(1.0, y)), 4)],
        [round(max(0.0, min(1.0, x + w * 0.82)), 4), round(max(0.0, min(1.0, y)), 4)],
        [round(max(0.0, min(1.0, x + w)), 4), round(max(0.0, min(1.0, y + h * 0.22)), 4)],
        [round(max(0.0, min(1.0, x + w)), 4), round(max(0.0, min(1.0, y + h * 0.78)), 4)],
        [round(max(0.0, min(1.0, x + w * 0.85)), 4), round(max(0.0, min(1.0, y + h)), 4)],
        [round(max(0.0, min(1.0, x + w * 0.15)), 4), round(max(0.0, min(1.0, y + h)), 4)],
        [round(max(0.0, min(1.0, x)), 4), round(max(0.0, min(1.0, y + h * 0.78)), 4)],
        [round(max(0.0, min(1.0, x)), 4), round(max(0.0, min(1.0, y + h * 0.22)), 4)],
    ]
    area = round(max(0.0005, w * h * 0.86), 4)
    return pts, area


def deduplicate_detections(
    dets: List[Tuple[str, str, float, Tuple[float, float, float, float]]],
    iou_threshold: float = 0.46,
) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
    """Elimina cajas duplicadas o superpuestas del mismo objeto conservando la de mayor confianza."""
    sorted_dets = sorted(dets, key=lambda x: x[2], reverse=True)
    kept: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
    for cid, label, conf, box in sorted_dets:
        duplicate = False
        for k_cid, _, _, k_box in kept:
            same_group = (cid == k_cid) or (cid in VEHICLE_CLASSES and k_cid in VEHICLE_CLASSES)
            if same_group and (compute_iou(box, k_box) >= iou_threshold or box_containment(box, k_box) >= 0.78):
                duplicate = True
                break
        if not duplicate:
            kept.append((cid, label, conf, box))
    # Ordenar de izquierda a derecha (por coordenada X) para que B1/T1/V1 sea siempre el de la izquierda
    kept.sort(key=lambda item: item[3][0])
    return kept


# Carril restringido configurado en el escenario "Monitoreo vial" (mismo polígono que el frontend).
RESTRICTED_LANE_POLYGON: List[Tuple[float, float]] = [(0.58, 0.48), (0.94, 0.48), (0.96, 0.88), (0.54, 0.88)]


DEFAULT_MAX_OCCUPANCY = 3  # aforo por defecto: alerta a partir de 4 personas


def parse_max_occupancy(alert_target: str) -> int:
    """Aforo máximo configurado por el usuario: alertTarget = "capacity:N" (N personas permitidas)."""
    if isinstance(alert_target, str) and alert_target.startswith("capacity:"):
        try:
            return max(1, min(10000, int(alert_target.split(":", 1)[1])))
        except ValueError:
            pass
    return DEFAULT_MAX_OCCUPANCY


def point_in_polygon(pt: Tuple[float, float], poly: List[Tuple[float, float]]) -> bool:
    contour = np.array([[int(x * 10000), int(y * 10000)] for x, y in poly], dtype=np.int32)
    return cv2.pointPolygonTest(contour, (float(pt[0] * 10000), float(pt[1] * 10000)), False) >= 0


def clean_bottle_boxes(
    dets: List[Tuple[str, str, float, Tuple[float, float, float, float]]],
) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
    """
    Control de calidad: elimina cajas de botella espurias antes de clasificar.
    - Cajas pequeñas dentro/encima de otra botella (una tapa o un cuello detectado como "botella").
    - Cajas mucho más bajas que la fila (botella del fondo, reflejo) cuando hay 3+ botellas.
    """
    prods = [d for d in dets if d[0] == "product"]
    if len(prods) < 2:
        return dets
    heights = sorted(d[3][3] for d in prods)
    med_h = heights[len(heights) // 2]
    kept: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
    for d in dets:
        if d[0] != "product":
            kept.append(d)
            continue
        box = d[3]
        inside_other = any(
            o is not d and o[3][2] * o[3][3] > box[2] * box[3] * 1.8 and box_containment(box, o[3]) >= 0.55
            for o in prods
        )
        too_short = len(prods) >= 3 and box[3] < med_h * 0.45 and d[2] < 0.5
        if inside_other or too_short:
            continue
        kept.append(d)
    return kept


def bottle_is_partial(
    box: Tuple[float, float, float, float],
    all_boxes: List[Tuple[float, float, float, float]],
) -> bool:
    """Botella cortada por el borde izquierdo/derecho del encuadre (no se puede juzgar su forma)."""
    x, _, w, _ = box
    if not (x <= 0.004 or x + w >= 0.996):
        return False
    widths = sorted(b[2] for b in all_boxes)
    med_w = widths[len(widths) // 2] if widths else w
    return len(all_boxes) >= 2 and w < med_w * 0.6


class SimpleByteTracker:
    """Rastreador multi-objeto por IoU para mantener trackId estable entre fotogramas en vivo."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tracks: Dict[str, Tuple[str, Tuple[float, float, float, float], float]] = {}
        self._counters: Dict[str, int] = {}

    def assign(
        self,
        class_id: str,
        box: Tuple[float, float, float, float],
        exclude: Optional[set] = None,
    ) -> str:
        """Asigna un trackId. `exclude` contiene los tracks ya usados en el fotograma actual,
        para que dos objetos distintos del mismo fotograma nunca compartan ID."""
        with self._lock:
            now = time.time()
            expired = [tid for tid, (_, _, ts) in self._tracks.items() if now - ts > 2.5]
            for tid in expired:
                del self._tracks[tid]

            best_tid: Optional[str] = None
            best_iou = 0.28
            for tid, (cid, prev_box, _) in self._tracks.items():
                if cid != class_id or (exclude and tid in exclude):
                    continue
                ov = compute_iou(box, prev_box)
                if ov > best_iou:
                    best_iou = ov
                    best_tid = tid

            if best_tid is None:
                prefix = {
                    "person": "T",
                    "product": "B",
                    "car": "V",
                    "bus": "V",
                    "truck": "V",
                    "motorcycle": "M",
                }.get(class_id, "O")
                cnt = self._counters.get(prefix, 0) + 1
                self._counters[prefix] = cnt
                best_tid = f"{prefix}{cnt}"

            self._tracks[best_tid] = (class_id, box, now)
            return best_tid


def _load_yolo_engine() -> Any:
    """
    Elige el motor YOLOv8n:
      - VISION_ENGINE=onnx  -> ONNX Runtime (producción / Docker / Render gratis: liviano, sin PyTorch)
      - VISION_ENGINE=ultralytics -> Ultralytics + PyTorch (desarrollo local)
      - sin variable: Ultralytics si está instalado; si no, ONNX.
    """
    import os
    from pathlib import Path

    base = Path(__file__).resolve().parents[2]
    engine = os.getenv("VISION_ENGINE", "auto").lower()
    onnx_path = os.getenv("YOLO_ONNX_PATH", str(base / "yolov8n.onnx"))
    if engine in ("auto", "ultralytics"):
        try:
            from ultralytics import YOLO

            model = YOLO(str(base / "yolov8n.pt"))
            print("[VISION AI] Motor YOLOv8n: Ultralytics (PyTorch)")
            return model
        except Exception as exc:
            if engine == "ultralytics":
                print(f"[VISION AI] No se pudo cargar Ultralytics: {exc}")
                return None
    try:
        from .onnx_yolo import OnnxYolo

        model = OnnxYolo(onnx_path)
        print(f"[VISION AI] Motor YOLOv8n: ONNX Runtime ({onnx_path})")
        return model
    except Exception as exc:
        print(f"[VISION AI] Aviso: YOLOv8n no disponible, se usa solo OpenCV + CNN: {exc}")
        return None


class RealVisionDetector:
    """Motor real combinando YOLOv8 + OpenCV (Sesión 04) + Clasificador CNN por ROI (Sesión 03)."""

    def __init__(self) -> None:
        self._infer_lock = threading.Lock()
        self._yolo: Any = None
        self._yolo_attempted = False
        # Un rastreador por cámara/fuente: los IDs de una cámara no se mezclan con los de otra.
        self._trackers: Dict[str, SimpleByteTracker] = {}
        self._trackers_lock = threading.Lock()
        cascade_cls = getattr(cv2, "CascadeClassifier", None)
        data_dir = getattr(getattr(cv2, "data", None), "haarcascades", "")
        self._face_cascade = (
            cascade_cls(data_dir + "haarcascade_frontalface_default.xml")
            if cascade_cls and data_dir
            else None
        )

    def _get_yolo(self) -> Any:
        with self._infer_lock:
            if not self._yolo_attempted:
                self._yolo_attempted = True
                self._yolo = _load_yolo_engine()
            return self._yolo

    def _detect_faces_safe(
        self,
        gray: np.ndarray,
        scale_factor: float = 1.15,
        min_neighbors: int = 5,
        min_size: Tuple[int, int] = (28, 28),
    ) -> Any:
        if self._face_cascade is None or gray.size == 0:
            return ()
        with self._infer_lock:
            try:
                return self._face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=scale_factor,
                    minNeighbors=min_neighbors,
                    minSize=min_size,
                )
            except Exception:
                return ()

    def _has_human_skin_or_face(self, crop_bgr: np.ndarray) -> bool:
        """
        Verifica si un recorte contiene rasgos humanos reales (rostro o tono de piel en cabeza/manos/cuello)
        para descartar falsos positivos de mochilas, sillas o abrigos colgados cuando la confianza es media.
        """
        if crop_bgr.size == 0 or crop_bgr.shape[0] < 20 or crop_bgr.shape[1] < 20:
            return False
        if self._face_cascade is not None:
            gray = to_grayscale(crop_bgr)
            faces = self._detect_faces_safe(gray, scale_factor=1.15, min_neighbors=5, min_size=(28, 28))
            if len(faces) > 0:
                return True
        # Verificar proporción de píxeles en rango de piel humana en espacio YCrCb en la mitad superior
        upper = crop_bgr[: max(10, int(crop_bgr.shape[0] * 0.55)), :]
        ycrcb = cv2.cvtColor(upper, cv2.COLOR_BGR2YCrCb)
        skin_mask = cv2.inRange(ycrcb, (45, 134, 78), (245, 174, 128))
        skin_ratio = float(np.mean(skin_mask > 0))
        return skin_ratio >= 0.045

    def _enhance_low_quality_frame(self, bgr: np.ndarray) -> np.ndarray:
        """
        Realza fotogramas de cámaras viales públicas de baja calidad/compresión (HLS .m3u8 / CCTV)
        aplicando reducción de artefactos JPEG/H264 (bilateral filter ligero), ecualización adaptativa
        de histograma (CLAHE en canal L de LAB) y enfoque de bordes (unsharp mask).
        """
        if bgr.size == 0:
            return bgr
        denoised = cv2.bilateralFilter(bgr, d=5, sigmaColor=28, sigmaSpace=28)
        lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.6, tileGridSize=(8, 8))
        l_enh = clahe.apply(l_ch)
        enhanced = cv2.cvtColor(cv2.merge((l_enh, a_ch, b_ch)), cv2.COLOR_LAB2BGR)
        blurred = cv2.GaussianBlur(enhanced, (0, 0), 1.1)
        sharpened = cv2.addWeighted(enhanced, 1.28, blurred, -0.28, 0)
        return sharpened

    def _segment_highway_road_polygon(
        self,
        bgr: np.ndarray,
        vehicle_boxes: List[Tuple[float, float, float, float]],
    ) -> Tuple[List[List[float]], float]:
        """
        Detecta y segmenta automáticamente el corredor de la carretera (asfalto + ruta activa de los vehículos)
        usando máscara HSV de asfalto (baja saturación, luminancia media) combinada con la envolvente
        convexa (cv2.convexHull) de los carriles donde circulan los vehículos.
        """
        h, w = bgr.shape[:2]
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        # El pavimento/asfalto en cámaras viales tiene baja saturación (S < 65) y brillo medio (45 < V < 205)
        road_mask = cv2.inRange(hsv, (0, 0, 42), (180, 68, 208))
        # Ignorar el cielo (franja superior 0..22%)
        road_mask[: int(h * 0.22), :] = 0

        pts: List[List[int]] = []
        # Incluir los puntos de paso de los vehículos detectados para anclar la ruta real
        for bx, by, bw, bh in vehicle_boxes:
            cx, cy = int((bx + bw * 0.5) * w), int((by + bh * 0.5) * h)
            pad_x, pad_y = max(24, int(bw * w * 0.9)), max(18, int(bh * h * 0.8))
            pts.extend(
                [
                    [max(0, cx - pad_x), max(int(h * 0.20), cy - pad_y)],
                    [min(w - 1, cx + pad_x), max(int(h * 0.20), cy - pad_y)],
                    [min(w - 1, cx + pad_x), min(h - 1, cy + pad_y)],
                    [max(0, cx - pad_x), min(h - 1, cy + pad_y)],
                ]
            )

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        closed = cv2.morphologyEx(road_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            largest = max(contours, key=cv2.contourArea)
            if cv2.contourArea(largest) > (w * h * 0.05):
                step = max(1, len(largest) // 24)
                for p in largest[::step]:
                    pts.append([int(p[0][0]), int(p[0][1])])

        if len(pts) >= 4:
            hull = cv2.convexHull(np.array(pts, dtype=np.int32))
            epsilon = 0.025 * cv2.arcLength(hull, True)
            approx = cv2.approxPolyDP(hull, epsilon, True)
            poly_norm = [
                [round(max(0.0, min(1.0, float(pt[0][0]) / w)), 4), round(max(0.0, min(1.0, float(pt[0][1]) / h)), 4)]
                for pt in approx
            ]
            if len(poly_norm) >= 3:
                area = round(float(cv2.contourArea(approx)) / float(w * h), 4)
                return poly_norm, max(0.08, min(0.65, area))

        return [[0.08, 0.30], [0.92, 0.30], [0.96, 0.90], [0.04, 0.90]], 0.52

    def _detect_highway_multiscale(
        self,
        enhanced_bgr: np.ndarray,
    ) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """
        Detección multi-escala especializada para cámaras públicas de carretera de baja calidad:
        1) Pasada completa a imgsz=960 (conf=0.09) para vehículos medianos/cercanos.
        2) Pasada con zoom (recorte de la franja media/lejana de la carretera y=16%..72% escalado 1.5x)
           para detectar autos pequeños o borrosos en el horizonte vial que una sola pasada pierde.
        3) Respaldo por contornos OpenCV sobre la calzada.
        """
        # Pasada 1: Fotograma completo realzado
        dets_full = self._detect_with_yolo(
            enhanced_bgr,
            conf_min=0.09,
            allowed_coco_ids=[0, 2, 3, 5, 7],
            reject_clutter_for_person=True,
            imgsz=960,
        )

        # Pasada 2: Zoom sobre la zona media/lejana de la autopista (16% a 74% vertical, 4% a 96% horizontal)
        h, w = enhanced_bgr.shape[:2]
        x1, y1, x2, y2 = int(w * 0.04), int(h * 0.16), int(w * 0.96), int(h * 0.74)
        crop = enhanced_bgr[y1:y2, x1:x2]
        dets_zoom: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
        if crop.size > 0:
            ch, cw = crop.shape[:2]
            upscaled = cv2.resize(crop, (int(cw * 1.45), int(ch * 1.45)), interpolation=cv2.INTER_CUBIC)
            sub_dets = self._detect_with_yolo(
                upscaled,
                conf_min=0.10,
                allowed_coco_ids=[2, 3, 5, 7],
                reject_clutter_for_person=False,
                imgsz=640,
            )
            rx_scale = (x2 - x1) / float(w)
            ry_scale = (y2 - y1) / float(h)
            rx_off = x1 / float(w)
            ry_off = y1 / float(h)
            for cid, lbl, conf, (sx, sy, sw, sh) in sub_dets:
                gx = round(max(0.0, min(1.0, rx_off + sx * rx_scale)), 4)
                gy = round(max(0.0, min(1.0, ry_off + sy * ry_scale)), 4)
                gw = round(max(0.01, min(1.0 - gx, sw * rx_scale)), 4)
                gh = round(max(0.01, min(1.0 - gy, sh * ry_scale)), 4)
                if (gw * gh) >= 0.00035:
                    dets_zoom.append((cid, lbl, conf, (gx, gy, gw, gh)))

        combined = deduplicate_detections(dets_full + dets_zoom, iou_threshold=0.42)
        if len([1 for c, _, _, _ in combined if c in VEHICLE_CLASSES]) < 4:
            extra_vehs = self._detect_opencv_highway_vehicles(enhanced_bgr, combined)
            combined = deduplicate_detections(combined + extra_vehs, iou_threshold=0.42)
        return combined

    def _detect_with_yolo(
        self,
        bgr: np.ndarray,
        conf_min: float = 0.25,
        allowed_coco_ids: Optional[List[int]] = None,
        reject_clutter_for_person: bool = False,
        imgsz: int = 640,
        bags_as_objects: bool = False,
    ) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """
        Ejecuta YOLOv8n sobre la matriz BGR y devuelve [(classId, label, confidence, box_norm)].
        Si `reject_clutter_for_person=True`, consulta también las clases mochila/bolso/maleta/silla
        para evitar que una mochila o silla sea clasificada erróneamente como Persona.
        """
        model = self._get_yolo()
        if model is None:
            return []
        h, w = bgr.shape[:2]
        query_classes = list(allowed_coco_ids) if allowed_coco_ids is not None else list(COCO_TO_DOMAIN.keys())
        if reject_clutter_for_person:
            for c_id in CLUTTER_COCO_CLASSES:
                if c_id not in query_classes:
                    query_classes.append(c_id)

        with self._infer_lock:
            try:
                results = model.predict(
                    source=bgr,
                    conf=conf_min,
                    classes=query_classes,
                    imgsz=imgsz,
                    verbose=False,
                )
            except Exception:
                results = None
        out: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
        clutter_boxes: List[Tuple[float, Tuple[float, float, float, float]]] = []
        if not results:
            return out
        r = results[0]
        if r.boxes is None:
            return out

        raw_candidates: List[Tuple[int, float, Tuple[float, float, float, float]]] = []
        bag_candidates: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
        for b in r.boxes:
            cls_idx = int(b.cls[0].item())
            conf = round(float(b.conf[0].item()), 3)
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            nx = round(max(0.0, min(1.0, x1 / w)), 4)
            ny = round(max(0.0, min(1.0, y1 / h)), 4)
            nw = round(max(0.01, min(1.0 - nx, (x2 - x1) / w)), 4)
            nh = round(max(0.01, min(1.0 - ny, (y2 - y1) / h)), 4)
            box = (nx, ny, nw, nh)
            if bags_as_objects and cls_idx in BAG_COCO and conf >= 0.18 and (nw * nh) >= 0.0012:
                # Escenario "Objetos abandonados": mochila/bolso/maleta son objetos vigilados.
                bag_candidates.append(("bag", BAG_COCO[cls_idx], conf, box))
            if cls_idx in CLUTTER_COCO_CLASSES:
                clutter_boxes.append((conf, box))
            elif cls_idx in COCO_TO_DOMAIN:
                raw_candidates.append((cls_idx, conf, box))

        for cls_idx, conf, box in raw_candidates:
            class_id, label = COCO_TO_DOMAIN[cls_idx]
            nx, ny, nw, nh = box

            if class_id == "person" and reject_clutter_for_person:
                # 1. Exigir confianza mínima real para personas (>= 0.45)
                if conf < 0.45:
                    continue
                # 2. Descartar objetos muy pequeños o con geometría horizontal no humana
                pix_w, pix_h = nw * w, nh * h
                if (nw * nh) < 0.0045 or (pix_h / max(pix_w, 1.0)) < 0.68:
                    continue
                # 3. Si coincide con una mochila, bolso, maleta o silla detectada por YOLO, descartar
                is_backpack_or_chair = False
                for c_conf, c_box in clutter_boxes:
                    if compute_iou(box, c_box) >= 0.28 or box_containment(box, c_box) >= 0.55:
                        # Solo permitir si la persona tiene confianza altísima (>0.78) y es más del doble de grande que la mochila
                        if not (conf >= 0.78 and (nw * nh) > (c_box[2] * c_box[3] * 2.1)):
                            is_backpack_or_chair = True
                            break
                if is_backpack_or_chair:
                    continue
                # 4. Si la confianza es moderada (0.45 - 0.60), validar que exista rostro o piel humana real.
                #    Solo en personas grandes: en una multitud lejana o vista cenital no se ven rostros ni piel,
                #    y esta regla descartaba a casi todas las personas pequeñas.
                if conf < 0.60 and pix_h >= 140:
                    crop = extract_roi(bgr, box)
                    if not self._has_human_skin_or_face(crop):
                        continue

            elif class_id in VEHICLE_CLASSES:
                # Permitir vehículos pequeños/lejanos en cámaras de autopista de baja calidad (área >= 0.0003)
                if conf < 0.08 or (nw * nh) < 0.0003 or ny < 0.08:
                    continue
                # Calibración moderada para cámaras CCTV de baja resolución. ANTES se forzaba un mínimo de 70%:
                # cualquier sombra/edificio con 9% de YOLO pasaba el umbral (50%) y disparaba alertas.
                # Ahora: YOLO 0.09 -> 0.29 (baja confianza, solo se dibuja), 0.32 -> 0.50, 0.60 -> 0.77.
                conf = round(min(0.97, 0.20 + conf * 0.95), 3)

            out.append((class_id, label, conf, box))

        return deduplicate_detections(out) + deduplicate_detections(bag_candidates)

    @staticmethod
    def _on_road_surface(hsv: np.ndarray, box: Tuple[float, float, float, float]) -> bool:
        """
        ¿El vehículo está apoyado sobre calzada? Mira una franja justo debajo/alrededor de sus ruedas:
        asfalto = gris (saturación baja, brillo medio) o marcas viales (blanco/amarillo). Si la franja es
        pasto, tierra o vereda de color, el vehículo se salió de la ruta.
        """
        h, w = hsv.shape[:2]
        x, y, bw, bh = box
        x1 = int(max(0.0, x - bw * 0.1) * w)
        x2 = int(min(1.0, x + bw * 1.1) * w)
        y1 = int(min(1.0, y + bh * 0.85) * h)
        y2 = int(min(1.0, y + bh * 1.25) * h)
        if y2 - y1 < 3 or x2 - x1 < 3:
            return True  # tocando el borde inferior: no hay evidencia para acusar
        patch = hsv[y1:y2, x1:x2]
        asphalt = (patch[:, :, 1] < 70) & (patch[:, :, 2] > 35) & (patch[:, :, 2] < 225)
        markings = ((patch[:, :, 1] < 45) & (patch[:, :, 2] >= 200)) | (
            (patch[:, :, 0] >= 15) & (patch[:, :, 0] <= 35) & (patch[:, :, 1] >= 90)
        )
        return float(np.mean(asphalt | markings)) >= 0.35

    @staticmethod
    def _on_sidewalk(hsv: np.ndarray, box: Tuple[float, float, float, float], vehicles: List[Dict[str, Any]]) -> bool:
        """
        La vereda también es gris como el asfalto. Heurística: si ningún vehículo circula a la altura de los pies
        del peatón dentro de un radio de 2.5 anchos de vehículo, el peatón está en la vereda/borde, no en la vía.
        """
        feet_x = box[0] + box[2] * 0.5
        feet_y = box[1] + box[3]
        for v in vehicles:
            vb = v["box"]
            v_bottom = vb["y"] + vb["height"]
            v_cx = vb["x"] + vb["width"] * 0.5
            if abs(v_bottom - feet_y) <= max(0.06, vb["height"] * 0.8) and abs(v_cx - feet_x) <= vb["width"] * 2.5:
                return False
        return True

    def _detect_people_tiled(
        self,
        bgr: np.ndarray,
        conf_min: float = 0.30,
    ) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """
        Conteo de personas en multitudes / cámaras altas: además de la pasada completa, YOLO se ejecuta sobre
        4 mosaicos solapados (2x2, 60% del tamaño cada uno). Las personas lejanas, que en la imagen completa
        miden pocos píxeles tras el redimensionado a 640/800 px, en el mosaico se ven ~1.7x más grandes.
        """
        h, w = bgr.shape[:2]
        out = self._detect_with_yolo(bgr, conf_min=conf_min, allowed_coco_ids=[0], reject_clutter_for_person=True, imgsz=960)
        if min(h, w) < 360:
            return out
        tw, th = int(w * 0.6), int(h * 0.6)
        for x0 in (0, w - tw):
            for y0 in (0, h - th):
                tile = bgr[y0 : y0 + th, x0 : x0 + tw]
                for cid, lbl, conf, (sx, sy, sw, sh) in self._detect_with_yolo(
                    tile, conf_min=conf_min, allowed_coco_ids=[0], reject_clutter_for_person=True, imgsz=640
                ):
                    gx = (x0 + sx * tw) / w
                    gy = (y0 + sy * th) / h
                    gw = sw * tw / w
                    gh = sh * th / h
                    # Persona cortada por el borde interno del mosaico: la completa la da otro mosaico.
                    touches_inner = (sx <= 0.003 and x0 > 0) or (sx + sw >= 0.997 and x0 + tw < w) or (
                        sy <= 0.003 and y0 > 0
                    ) or (sy + sh >= 0.997 and y0 + th < h)
                    if touches_inner:
                        continue
                    out.append((cid, lbl, conf, (round(gx, 4), round(gy, 4), round(gw, 4), round(gh, 4))))
        return deduplicate_detections(out, iou_threshold=0.45)

    def _detect_with_padding(
        self,
        bgr: np.ndarray,
        conf_min: float,
        allowed_coco_ids: List[int],
        pad_frac: float = 0.18,
        imgsz: int = 640,
    ) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """YOLO sobre la imagen con un marco gris alrededor; devuelve cajas en coordenadas de la imagen original."""
        h, w = bgr.shape[:2]
        py, px = int(h * pad_frac), int(w * pad_frac)
        padded = cv2.copyMakeBorder(bgr, py, py, px, px, cv2.BORDER_CONSTANT, value=(114, 114, 114))
        ph, pw = padded.shape[:2]
        out: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
        for cid, lbl, conf, (sx, sy, sw, sh) in self._detect_with_yolo(
            padded, conf_min=conf_min, allowed_coco_ids=allowed_coco_ids, imgsz=imgsz
        ):
            x1 = max(0.0, (sx * pw - px) / w)
            y1 = max(0.0, (sy * ph - py) / h)
            x2 = min(1.0, ((sx + sw) * pw - px) / w)
            y2 = min(1.0, ((sy + sh) * ph - py) / h)
            if x2 - x1 >= 0.02 and y2 - y1 >= 0.02:
                out.append((cid, lbl, conf, (round(x1, 4), round(y1, 4), round(x2 - x1, 4), round(y2 - y1, 4))))
        return out

    def _detect_opencv_highway_vehicles(
        self,
        bgr: np.ndarray,
        existing: List[Tuple[str, str, float, Tuple[float, float, float, float]]],
    ) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """
        Detector complementario OpenCV (gradiente morfológico + bordes Canny en calzada)
        para cámaras públicas de carretera con alta compresión o neblina donde los autos
        se ven como bloques compactos de alto contraste sobre el asfalto.
        """
        h, w = bgr.shape[:2]
        gray = to_grayscale(bgr)
        # Enfocarse en la franja vial (24% a 92% de la altura)
        y_start, y_end = int(h * 0.24), int(h * 0.92)
        road_gray = gray[y_start:y_end, :]
        if road_gray.size == 0:
            return []

        edges = canny_edges(road_gray, 45, 130)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidates: List[Tuple[float, Tuple[str, str, float, Tuple[float, float, float, float]]]] = []
        for cnt in contours:
            cx, cy, cw, ch = cv2.boundingRect(cnt)
            abs_y = y_start + cy
            nx, ny, nw, nh = round(cx / w, 4), round(abs_y / h, 4), round(cw / w, 4), round(ch / h, 4)
            area_ratio = nw * nh
            aspect = cw / max(float(ch), 1.0)
            # Geometría típica de vehículo en cámara vial
            if 0.0018 <= area_ratio <= 0.085 and 0.85 <= aspect <= 2.8:
                box = (nx, ny, nw, nh)
                if any(compute_iou(box, ex_box) >= 0.22 for _, _, _, ex_box in existing):
                    continue
                roi_patch = road_gray[cy : cy + ch, cx : cx + cw]
                std_val = float(np.std(roi_patch)) if roi_patch.size else 0.0
                if std_val >= 28.0:
                    # Respaldo por contornos: solo "candidato" de baja confianza (no dispara alertas por sí solo).
                    conf = round(min(0.45, 0.30 + min(0.15, (std_val - 28.0) / 140.0)), 3)
                    veh_cls = "truck" if area_ratio >= 0.028 else "car"
                    veh_lbl = "Camión" if veh_cls == "truck" else "Auto"
                    candidates.append((std_val * area_ratio, (veh_cls, veh_lbl, conf, box)))

        candidates.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in candidates[:6]]

    def _refine_person_box(
        self,
        bgr: np.ndarray,
        box: Tuple[float, float, float, float],
    ) -> Tuple[float, float, float, float]:
        """
        Ajusta los cuadros de Persona cuando el usuario está frente a la cámara web en primer plano
        para que el encuadre marque limpiamente la silueta central (cabeza y torso) sin cubrir toda la pantalla.
        """
        nx, ny, nw, nh = box
        if nw <= 0.44 and nh <= 0.76 and (nw * nh) <= 0.30:
            return box

        h, w = bgr.shape[:2]
        if self._face_cascade is not None:
            x1, y1 = int(nx * w), int(ny * h)
            x2, y2 = int((nx + nw) * w), int((ny + nh) * h)
            crop = bgr[max(0, y1) : min(h, y2), max(0, x1) : min(w, x2)]
            if crop.size > 0:
                gray = to_grayscale(crop)
                faces = self._detect_faces_safe(gray, scale_factor=1.15, min_neighbors=5, min_size=(36, 36))
                # Solo rostros plausibles: en la mitad superior del cuerpo (un "rostro" en la cintura, una
                # riñonera o un logo, desplazaba la caja de la persona a otra zona y arruinaba el análisis de EPP).
                crop_h = max(1, crop.shape[0])
                faces = [f for f in faces if (f[1] + f[3] * 0.5) <= crop_h * 0.45]
                if len(faces) > 0:
                    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                    abs_fcx = (x1 + fx + fw * 0.5) / float(w)
                    abs_fy = (y1 + fy) / float(h)
                    f_w_norm = fw / float(w)
                    f_h_norm = fh / float(h)

                    target_w = min(0.42, max(0.24, f_w_norm * 2.15))
                    target_h = min(0.72, max(0.46, f_h_norm * 3.45))
                    rx = max(0.03, min(0.97 - target_w, abs_fcx - target_w * 0.5))
                    ry = max(0.03, min(0.97 - target_h, abs_fy - f_h_norm * 0.38))
                    return (round(rx, 4), round(ry, 4), round(target_w, 4), round(target_h, 4))

        cx = nx + nw * 0.5
        cy = ny + nh * 0.48
        target_w = min(0.44, nw * 0.62)
        target_h = min(0.74, nh * 0.78)
        rx = max(0.04, min(0.96 - target_w, cx - target_w * 0.5))
        ry = max(0.04, min(0.96 - target_h, cy - target_h * 0.48))
        return (round(rx, 4), round(ry, 4), round(target_w, 4), round(target_h, 4))

    def _detect_opencv_fallback_person(self, bgr: np.ndarray) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """
        Respaldo OpenCV para detectar personas muy cercanas a la webcam cuando solo se ve rostro/torso.
        Valida estrictamente tono de piel humana en YCrCb para jamás confundir mochilas ni objetos con rostros.
        """
        h, w = bgr.shape[:2]
        out: List[Tuple[str, str, float, Tuple[float, float, float, float]]] = []
        if self._face_cascade is not None:
            gray = to_grayscale(bgr)
            faces = self._detect_faces_safe(
                gray,
                scale_factor=1.15,
                min_neighbors=7,
                min_size=(max(48, int(w * 0.09)), max(48, int(h * 0.09))),
            )
            for fx, fy, fw, fh in faces:
                face_crop = bgr[fy : fy + fh, fx : fx + fw]
                if face_crop.size == 0:
                    continue
                ycrcb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2YCrCb)
                skin_mask = cv2.inRange(ycrcb, (45, 134, 78), (245, 174, 128))
                if float(np.mean(skin_mask > 0)) < 0.24:
                    continue
                fcx = (fx + fw * 0.5) / float(w)
                pw = min(0.40, (fw * 2.1) / w)
                ph = min(0.70, (fh * 3.4) / h)
                px = max(0.03, min(0.97 - pw, fcx - pw * 0.5))
                py = max(0.03, min(0.97 - ph, (fy / float(h)) - (fh * 0.35) / h))
                out.append(("person", "Persona", 0.86, (round(px, 4), round(py, 4), round(pw, 4), round(ph, 4))))
        return deduplicate_detections(out)

    def _detect_opencv_foreground_bottle(self, bgr: np.ndarray) -> List[Tuple[str, str, float, Tuple[float, float, float, float]]]:
        """
        Detector OpenCV de contornos, gradientes Sobel y firmas cromáticas (azul Cielo / tapas / plástico)
        para botellas/envases en primer plano (incluso botellas plásticas transparentes sin etiqueta
        o botellas Cielo sostenidas frente a la webcam). Ignora rostros y piel para no confundir al usuario.
        """
        h, w = bgr.shape[:2]
        gray = to_grayscale(bgr)
        clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
        gray_enh = clahe.apply(gray)
        edges = canny_edges(gray_enh, 30, 105)

        if self._face_cascade is not None:
            faces = self._face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(40, 40))
            for fx, fy, fw, fh in faces:
                pad_x = int(fw * 0.35)
                pad_y = int(fh * 0.35)
                edges[max(0, fy - pad_y) : min(h, fy + fh + pad_y), max(0, fx - pad_x) : min(w, fx + fw + pad_x)] = 0

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 13))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        cielo_mask = cv2.inRange(hsv, (88, 65, 55), (135, 255, 255))

        candidates: List[Tuple[float, Tuple[float, float, float, float]]] = []
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area_ratio = (cw * ch) / float(w * h)
            aspect = ch / max(float(cw), 1.0)
            if 0.018 <= area_ratio <= 0.56 and 1.05 <= aspect <= 5.2:
                nx, ny, nw, nh = round(x / w, 4), round(y / h, 4), round(cw / w, 4), round(ch / h, 4)
                patch_cielo = cielo_mask[y : y + ch, x : x + cw]
                cielo_bonus = 1.35 if (patch_cielo.size and float(np.mean(patch_cielo > 0)) >= 0.04) else 1.0
                center_dist = abs((nx + nw * 0.5) - 0.5) + abs((ny + nh * 0.5) - 0.5)
                score = area_ratio * cielo_bonus * (1.3 - min(0.8, center_dist)) * (1.25 if 1.35 <= aspect <= 4.2 else 0.85)
                candidates.append((score, (nx, ny, nw, nh)))

        candidates.sort(key=lambda item: item[0], reverse=True)
        if candidates:
            _, best_box = candidates[0]
            return [("product", "Botella / Envase", 0.86, best_box)]
        return []

    def _apply_abandoned_objects(
        self,
        detections: List[Dict[str, Any]],
        masks: List[Dict[str, Any]],
        patterns: List[Dict[str, Any]],
        threshold: float,
        alert_target: str,
        source_key: str,
        wants_patterns: bool,
    ) -> None:
        """Escenario 'Objetos abandonados': bulto quieto y sin persona cerca durante N segundos."""
        limit_s, kinds = target_settings(alert_target)
        temporal = source_key != "default"  # una imagen suelta no tiene historial de tiempo
        as_box = lambda d: (d["box"]["x"], d["box"]["y"], d["box"]["width"], d["box"]["height"])  # noqa: E731
        persons = [as_box(d) for d in detections if d["classId"] == "person"]
        bag_dets = [d for d in detections if d["classId"] == "bag"]
        if temporal:
            states = monitor_for(source_key).update([(d["label"], d["confidence"], as_box(d)) for d in bag_dets], persons)
        else:
            states = [
                {
                    "oid": f"O{i}",
                    "kind": d["label"],
                    "conf": d["confidence"],
                    "owner_near": any(person_is_near(as_box(d), p) for p in persons),
                    "moving": False,
                    "unattended_s": limit_s,
                }
                for i, d in enumerate(bag_dets, start=1)
            ]

        for d in detections:
            if d["classId"] == "person":
                d["label"] = f"Persona {d.get('trackId', 'T1')} ({position_Zone_label(as_box(d))})"

        for d, st in zip(bag_dets, states):
            # ID estable del bulto (O1, O2...): una alerta por objeto, no una por fotograma.
            old_id = d["id"]
            oid = str(st["oid"])
            d["id"] = f"bag-{oid}"
            d["trackId"] = oid
            kind = str(st["kind"])
            for m in masks:
                if m["id"] == f"m-{old_id}":
                    m["id"] = f"m-{d['id']}"
                    m["label"] = f"{kind} {oid}"
            b = d["box"]
            pos_txt = position_Zone_label(as_box(d))
            secs = float(st["unattended_s"])
            if st["owner_near"] or st["moving"]:
                d["label"] = f"{kind} {oid} (CON PERSONA CERCA)"
                continue
            if kind not in kinds:
                d["label"] = f"{kind} {oid} (no vigilado)"
                continue
            if secs >= limit_s:
                # En una imagen suelta no hay tiempo medido: no se inventan segundos en la etiqueta.
                d["label"] = f"{kind} {oid} (ABANDONADO {int(secs)} s)" if temporal else f"{kind} {oid} (ABANDONADO · sin persona cerca)"
                # Bulto con confianza baja (tacho, caja, sombra confundida con maleta): se muestra pero no alerta.
                if wants_patterns and d["confidence"] >= min(threshold, 0.40):
                    base = 0.6 if temporal else 0.5
                    detail = (
                        f"permanece quieto {int(secs)} s sin ninguna persona cerca (límite {int(limit_s)} s)"
                        if temporal
                        else "no hay ninguna persona cerca en la imagen analizada"
                    )
                    patterns.append(
                        {
                            "id": f"p-abandoned-{oid}",
                            "type": "abandoned_object",
                            "label": f"{kind} {oid} sin persona cerca en el {pos_txt} ({int(secs)} s)" if temporal else f"{kind} {oid} sin persona cerca en el {pos_txt}",
                            "confidence": round(min(0.97, base + d["confidence"] * 0.4), 3),
                            "evidence": (
                                f"Objeto: {kind} {oid} ubicado en el {pos_txt} [x={int(b['x'] * 100)}%, y={int(b['y'] * 100)}%]. "
                                f"Razón de la alerta: {detail}. Personas en escena: {len(persons)}."
                            ),
                            "source": "model",
                            "relatedDetectionIds": [d["id"]],
                        }
                    )
            else:
                d["label"] = f"{kind} {oid} (SIN DUEÑO {int(secs)} s de {int(limit_s)} s)"
                if wants_patterns:
                    patterns.append(
                        {
                            "id": f"p-unattended-{oid}",
                            "type": "unattended_object",
                            "label": f"{kind} {oid} sin persona cerca · {int(secs)} s de {int(limit_s)} s",
                            "confidence": round(min(0.9, 0.5 + d["confidence"] * 0.3), 3),
                            "evidence": f"{kind} {oid} en el {pos_txt}: en vigilancia; se alertará si sigue solo {max(0, int(limit_s - secs))} s más.",
                            "source": "model",
                            "relatedDetectionIds": [d["id"]],
                        }
                    )

    def _get_tracker(self, source_key: str) -> SimpleByteTracker:
        with self._trackers_lock:
            tr = self._trackers.get(source_key)
            if tr is None:
                tr = SimpleByteTracker()
                self._trackers[source_key] = tr
            return tr

    def analyze_frame(
        self,
        bgr: np.ndarray,
        scenario_id: str,
        mode: str = "combined",
        threshold: float = 0.5,
        alert_target: str = "all",
        source_key: str = "default",
    ) -> Dict[str, Any]:
        started = time.perf_counter()
        tracker = self._get_tracker(source_key)
        used_tracks: set = set()

        if scenario_id == "quality-control":
            raw_dets = self._detect_with_yolo(
                bgr,
                conf_min=0.12,
                allowed_coco_ids=[39, 40, 41, 75],
                reject_clutter_for_person=False,
                imgsz=768,
            )
            if not any(c == "product" for c, _, _, _ in raw_dets):
                enh_bottle = self._enhance_low_quality_frame(bgr)
                raw_dets = self._detect_with_yolo(
                    enh_bottle,
                    conf_min=0.11,
                    allowed_coco_ids=[39, 40, 41, 75],
                    reject_clutter_for_person=False,
                    imgsz=768,
                )
            if sum(1 for c, _, _, _ in raw_dets if c == "product") < 3:
                # Primer plano (botellas que llenan la foto o cortadas por el borde): YOLO las reconoce mejor
                # con margen alrededor. Pasada extra sobre la imagen con borde y fusión sin duplicados.
                padded = self._detect_with_padding(bgr, conf_min=0.12, allowed_coco_ids=[39, 40, 41, 75], pad_frac=0.18)
                raw_dets = deduplicate_detections(raw_dets + padded, iou_threshold=0.5)
            if not any(c == "product" for c, _, _, _ in raw_dets):
                raw_dets.extend(self._detect_opencv_foreground_bottle(bgr))
            raw_dets = clean_bottle_boxes(raw_dets)
        elif scenario_id == "abandoned-objects":
            # Multiescala: YOLO reconoce mejor un bulto CERCANO (que llena la imagen) a 480 px,
            # la escena normal a 640 px y un bulto LEJANO y pequeño a 960 px.
            kw = dict(allowed_coco_ids=[0, 24, 26, 28], reject_clutter_for_person=True, bags_as_objects=True)
            base = self._detect_with_yolo(bgr, conf_min=0.18, imgsz=640, **kw)
            near = self._detect_with_yolo(bgr, conf_min=0.25, imgsz=480, **kw)
            bags = [d for d in base + near if d[0] == "bag"]
            if not bags:
                bags = [d for d in self._detect_with_yolo(bgr, conf_min=0.18, imgsz=960, **kw) if d[0] == "bag"]
            raw_dets = [d for d in base if d[0] != "bag"] + deduplicate_detections(bags)
            # Antes de declarar un bulto "sin dueño", confirmar que de verdad no hay nadie cerca: buscar personas
            # pequeñas/lejanas o parcialmente tapadas con mosaicos (solo si hay algún bulto aparentemente solo).
            persons_now = [d[3] for d in raw_dets if d[0] == "person"]
            if any(not any(person_is_near(bg[3], p) for p in persons_now) for bg in raw_dets if bg[0] == "bag"):
                extra_people = [d for d in self._detect_people_tiled(bgr, conf_min=0.30) if d[0] == "person"]
                raw_dets = deduplicate_detections(raw_dets + extra_people)
        elif scenario_id == "retail-store":
            raw_dets = self._detect_people_tiled(bgr, conf_min=0.30)
            if not any(c == "person" for c, _, _, _ in raw_dets):
                raw_dets.extend(self._detect_opencv_fallback_person(bgr))
        elif scenario_id == "industrial-safety":
            raw_dets = self._detect_with_yolo(
                bgr,
                conf_min=0.32,
                allowed_coco_ids=[0],
                reject_clutter_for_person=True,
                imgsz=800,
            )
            if not any(c == "person" for c, _, _, _ in raw_dets):
                raw_dets.extend(self._detect_opencv_fallback_person(bgr))
        else:
            enhanced_bgr = self._enhance_low_quality_frame(bgr)
            raw_dets = self._detect_highway_multiscale(enhanced_bgr)

        detections: List[Dict[str, Any]] = []
        masks: List[Dict[str, Any]] = []
        patterns: List[Dict[str, Any]] = []

        wants_det = mode != "segmentation"
        wants_masks = mode in ("segmentation", "combined")
        wants_patterns = mode in ("patterns", "combined")

        person_Boxes: List[Tuple[str, Tuple[float, float, float, float], Tuple[float, float, float, float], float]] = []
        bottle_Boxes: List[Tuple[str, Tuple[float, float, float, float], float]] = []

        for idx, (class_id, label, conf, raw_box) in enumerate(raw_dets, start=1):
            display_box = self._refine_person_box(bgr, raw_box) if class_id == "person" else raw_box
            # En Control de Calidad ordenamos B1, B2 de izquierda a derecha de manera determinista
            if scenario_id == "quality-control" and class_id == "product":
                track_id = f"B{idx}"
            else:
                track_id = tracker.assign(class_id, display_box, exclude=used_tracks)
            used_tracks.add(track_id)
            det_id = f"{class_id}-{track_id}"
            nx, ny, nw, nh = display_box
            detections.append(
                {
                    "id": det_id,
                    "classId": class_id,
                    "label": label,
                    "confidence": conf,
                    "box": {"x": nx, "y": ny, "width": nw, "height": nh},
                    "trackId": track_id,
                }
            )
            skip_large_person_mask = scenario_id == "industrial-safety" and class_id == "person" and (nw * nh) > 0.18
            if wants_masks and not skip_large_person_mask:
                poly, area_ratio = box_to_octagon_mask(display_box)
                masks.append(
                    {
                        "id": f"m-{det_id}",
                        "classId": class_id,
                        "label": f"{label} {track_id}",
                        "kind": "instance",
                        "polygon": poly,
                        "areaRatio": area_ratio,
                        "confidence": round(min(0.99, conf + 0.02), 3),
                    }
                )
            if class_id == "person":
                # El EPP se analiza sobre la caja ORIGINAL de YOLO (cuerpo completo: cabeza arriba, torso al medio).
                # La caja "refinada" es solo visual y puede desplazarse; usarla movía la zona de casco/chaleco.
                person_Boxes.append((det_id, raw_box, display_box, conf))
            elif class_id == "product":
                bottle_Boxes.append((det_id, display_box, conf))

        # ---------------------------------------------------------------------
        # Especialización por Escenario con CNN + OpenCV (Sesiones 02, 03 y 04)
        # ---------------------------------------------------------------------

        if scenario_id == "industrial-safety":
            ppe_ok_count = 0
            for det_id, roi_box, disp_box, _ in person_Boxes:
                track_id = det_id.split("-", 1)[-1]
                pos_txt = position_Zone_label(disp_box)
                ppe = classify_ppe_roi(bgr, roi_box)
                v_color_tag = ppe.vest_color if ppe.vest_color != "Ninguno" else "Reflectivo"

                # Evaluar cumplimiento según el objetivo de alerta configurado en la cámara (alert_target).
                # Un elemento que NO se puede verificar (persona muy lejana, cabeza fuera del encuadre) no se acusa.
                helmet_missing = not ppe.has_helmet and ppe.helmet_verifiable
                vest_missing = not ppe.has_vest and ppe.vest_verifiable
                if alert_target == "helmet_only":
                    is_compliant = ppe.has_helmet
                    unverifiable = not ppe.has_helmet and not helmet_missing
                elif alert_target == "vest_only":
                    is_compliant = ppe.has_vest
                    unverifiable = not ppe.has_vest and not vest_missing
                else:
                    is_compliant = ppe.ppe_complete
                    unverifiable = not is_compliant and not helmet_missing and not vest_missing

                # Actualizar la etiqueta visual de la caja de la persona para identificar en pantalla quién incumple
                for d_item in detections:
                    if d_item["id"] == det_id:
                        if is_compliant:
                            d_item["label"] = f"Operario {track_id} (EPP OK)"
                        elif unverifiable:
                            d_item["label"] = f"Operario {track_id} (EPP NO VERIFICABLE · muy lejos o recortado)"
                        elif helmet_missing and vest_missing:
                            d_item["label"] = f"Operario {track_id} (SIN CASCO NI CHALECO)"
                        elif helmet_missing:
                            d_item["label"] = f"Operario {track_id} (SIN CASCO)"
                        else:
                            d_item["label"] = f"Operario {track_id} (SIN CHALECO)"
                        break

                if ppe.has_helmet and ppe.helmet_box:
                    hx, hy, hw, hh = ppe.helmet_box
                    h_id = f"helmet-{track_id}"
                    detections.append(
                        {
                            "id": h_id,
                            "classId": "helmet",
                            "label": f"Casco ({track_id})",
                            "confidence": ppe.helmet_confidence,
                            "box": {"x": hx, "y": hy, "width": hw, "height": hh},
                            "trackId": track_id,
                        }
                    )
                    if wants_masks:
                        poly, area_ratio = box_to_octagon_mask(ppe.helmet_box)
                        masks.append(
                            {
                                "id": f"m-{h_id}",
                                "classId": "helmet",
                                "label": f"Casco {track_id}",
                                "kind": "instance",
                                "polygon": poly,
                                "areaRatio": area_ratio,
                                "confidence": ppe.helmet_confidence,
                            }
                        )
                if ppe.has_vest and ppe.vest_box:
                    vx, vy, vw, vh = ppe.vest_box
                    v_id = f"vest-{track_id}"
                    detections.append(
                        {
                            "id": v_id,
                            "classId": "vest",
                            "label": f"Chaleco {v_color_tag} ({track_id})",
                            "confidence": ppe.vest_confidence,
                            "box": {"x": vx, "y": vy, "width": vw, "height": vh},
                            "trackId": track_id,
                        }
                    )
                    if wants_masks:
                        poly, area_ratio = box_to_octagon_mask(ppe.vest_box)
                        masks.append(
                            {
                                "id": f"m-{v_id}",
                                "classId": "vest",
                                "label": f"Chaleco {v_color_tag} {track_id}",
                                "kind": "instance",
                                "polygon": poly,
                                "areaRatio": area_ratio,
                                "confidence": ppe.vest_confidence,
                            }
                        )
                if is_compliant:
                    ppe_ok_count += 1
                    if wants_patterns:
                        patterns.append(
                            {
                                "id": f"p-ppe-ok-{track_id}",
                                "type": "ppe_ok",
                                "label": f"Operario {track_id} ({pos_txt}): EPP completo (Casco y Chaleco {v_color_tag} OK)",
                                "confidence": ppe.pattern_confidence,
                                "evidence": (
                                    f"Sujeto identificado: Operario {track_id} en el {pos_txt} "
                                    f"[x={int(disp_box[0] * 100)}%, y={int(disp_box[1] * 100)}%]. "
                                    f"Porta Casco ({int(ppe.helmet_confidence * 100)}%) y Chaleco {v_color_tag} ({int(ppe.vest_confidence * 100)}%)."
                                ),
                                "source": "model",
                                "relatedDetectionIds": [det_id],
                            }
                        )
                elif wants_patterns and not unverifiable:
                    if helmet_missing and vest_missing:
                        missing_title = "SIN CASCO NI CHALECO (Naranja/Verde/Plomo)"
                    elif helmet_missing:
                        missing_title = f"SIN CASCO DE SEGURIDAD (sí porta Chaleco {v_color_tag})"
                    else:
                        missing_title = "SIN CHALECO NARANJA/VERDE/PLOMO (sí porta casco)"

                    helmet_status = f"Casco SÍ ({int(ppe.helmet_confidence * 100)}%)" if ppe.has_helmet else "Casco NO detectado"
                    vest_status = (
                        f"Chaleco {v_color_tag} SÍ ({int(ppe.vest_confidence * 100)}%)"
                        if ppe.has_vest
                        else "Chaleco reglamentario (Naranja/Verde/Plomo) NO detectado"
                    )
                    detailed_evidence = (
                        f"Sujeto: Operario {track_id} ubicado en el {pos_txt} de la imagen "
                        f"[x={int(disp_box[0] * 100)}%, y={int(disp_box[1] * 100)}%]. "
                        f"Verificación ROI: {helmet_status} · {vest_status}."
                    )
                    patterns.append(
                        {
                            "id": f"p-ppe-{track_id}",
                            "type": "ppe_missing",
                            "label": f"Operario {track_id} ({pos_txt}) {missing_title}",
                            "confidence": ppe.pattern_confidence,
                            "evidence": detailed_evidence,
                            "source": "model",
                            "relatedDetectionIds": [det_id],
                        }
                    )

        elif scenario_id == "quality-control":
            # Comparación con las vecinas: en una fila de producción la botella aplastada "sobresale".
            crease_by_id = {det_id: bottle_crease_score(bgr, bbox)[0] for det_id, bbox, _ in bottle_Boxes}
            all_bottle_boxes = [b for _, b, _ in bottle_Boxes]
            for det_id, bbox, _ in bottle_Boxes:
                track_id = det_id.split("-", 1)[-1]
                pos_txt = position_Zone_label(bbox)
                if bottle_is_partial(bbox, all_bottle_boxes):
                    # Botella cortada por el borde: no se juzga (evita falsos "malograda" por media botella).
                    for d_item in detections:
                        if d_item["id"] == det_id:
                            d_item["label"] = f"Botella {track_id} (PARCIAL · fuera de encuadre)"
                    continue
                others = [v for k, v in crease_by_id.items() if k != det_id]
                peer_median = float(np.median(others)) if len(others) >= 2 else None
                qc = classify_bottle_roi(bgr, bbox, peer_crease_median=peer_median)
                brand_name = qc.brand_hint or "Botella"

                # Actualizar la etiqueta visual de la caja de la botella identificando si es Botella Cielo / Comercial / Plástica
                for d_item in detections:
                    if d_item["id"] == det_id:
                        if qc.status == "surface_defect":
                            d_item["label"] = f"{brand_name} {track_id} (MALOGRADA)"
                        elif qc.status == "label_misaligned":
                            d_item["label"] = f"{brand_name} {track_id} (SIN ETIQUETA)"
                        else:
                            d_item["label"] = f"{brand_name} {track_id} (SANA)"
                        break

                if qc.has_cap and qc.cap_box:
                    cx, cy, cw, ch = qc.cap_box
                    detections.append(
                        {
                            "id": f"cap-{track_id}",
                            "classId": "cap",
                            "label": f"Tapa ({track_id})",
                            "confidence": qc.cap_confidence,
                            "box": {"x": cx, "y": cy, "width": cw, "height": ch},
                            "trackId": track_id,
                        }
                    )
                if qc.has_label and qc.label_box:
                    lx, ly, lw, lh = qc.label_box
                    lbl_tag = "Etiqueta Cielo" if "Cielo" in brand_name else "Etiqueta"
                    detections.append(
                        {
                            "id": f"label-{track_id}",
                            "classId": "label",
                            "label": f"{lbl_tag} ({track_id})",
                            "confidence": qc.label_confidence,
                            "box": {"x": lx, "y": ly, "width": lw, "height": lh},
                            "trackId": track_id,
                        }
                    )
                if qc.status in ("surface_defect", "label_misaligned") and qc.defect_box:
                    dx, dy, dw, dh = qc.defect_box
                    def_id = f"defect-{track_id}"
                    def_lbl = f"Sin Etiqueta ({track_id})" if qc.status == "label_misaligned" else f"Defecto ({track_id})"
                    detections.append(
                        {
                            "id": def_id,
                            "classId": "defect",
                            "label": def_lbl,
                            "confidence": qc.confidence,
                            "box": {"x": dx, "y": dy, "width": dw, "height": dh},
                            "trackId": track_id,
                        }
                    )
                    if wants_masks:
                        poly, area_ratio = box_to_octagon_mask(qc.defect_box)
                        masks.append(
                            {
                                "id": f"m-{def_id}",
                                "classId": "defect",
                                "label": def_lbl,
                                "kind": "instance",
                                "polygon": poly,
                                "areaRatio": area_ratio,
                                "confidence": qc.confidence,
                            }
                        )
                if wants_patterns:
                    if qc.status == "surface_defect" and alert_target in ("all", "deformed"):
                        patterns.append(
                            {
                                "id": f"p-def-{track_id}",
                                "type": "surface_defect",
                                "label": f"{brand_name} {track_id} ({pos_txt}) MALOGRADA / NO CONFORME",
                                "confidence": qc.confidence,
                                "evidence": f"Envase identificado: {brand_name} {track_id} en el {pos_txt} [x={int(bbox[0]*100)}%]. {qc.evidence}",
                                "source": "model",
                                "relatedDetectionIds": [det_id, f"defect-{track_id}"],
                            }
                        )
                    elif qc.status == "label_misaligned" and alert_target in ("all", "no_label"):
                        patterns.append(
                            {
                                "id": f"p-lbl-{track_id}",
                                "type": "label_misaligned",
                                "label": f"{brand_name} {track_id} ({pos_txt}): SIN ETIQUETA COMERCIAL",
                                "confidence": qc.confidence,
                                "evidence": f"Envase identificado: {brand_name} {track_id} en el {pos_txt} [x={int(bbox[0]*100)}%]. {qc.evidence}",
                                "source": "model",
                                "relatedDetectionIds": [det_id, f"defect-{track_id}"],
                            }
                        )
                    else:
                        patterns.append(
                            {
                                "id": f"p-ok-{track_id}",
                                "type": "conforming",
                                "label": f"{brand_name} {track_id} ({pos_txt}) SANA (Conforme)",
                                "confidence": qc.confidence,
                                "evidence": f"Envase identificado: {brand_name} {track_id} en el {pos_txt}. {qc.evidence}",
                                "source": "model",
                                "relatedDetectionIds": [det_id],
                            }
                        )

        elif scenario_id == "retail-store":
            people_descriptions: List[str] = []
            for d_item in detections:
                if d_item["classId"] == "person":
                    tid = d_item.get("trackId", "T1")
                    b = d_item["box"]
                    pos_txt = position_Zone_label((b["x"], b["y"], b["width"], b["height"]))
                    d_item["label"] = f"Persona {tid} ({pos_txt})"
                    people_descriptions.append(f"Persona {tid} en {pos_txt} [x={int(b['x']*100)}%]")
                    if wants_patterns:
                        patterns.append(
                            {
                                "id": f"p-person-{tid}",
                                "type": "person_identified",
                                "label": f"Persona {tid} identificada en {pos_txt}",
                                "confidence": d_item["confidence"],
                                "evidence": f"Sujeto contabilizado en aforo: Persona {tid} ubicada en el {pos_txt} de la sala.",
                                "source": "model",
                                "relatedDetectionIds": [d_item["id"]],
                            }
                        )
            valid_people = [d for d in detections if d["classId"] == "person" and d["confidence"] >= threshold]
            max_occ = parse_max_occupancy(alert_target)
            if wants_patterns and len(valid_people) > max_occ:
                excess = len(valid_people) - max_occ
                patterns.append(
                    {
                        "id": "p-retail-crowding",
                        "type": "crowding",
                        "label": f"Aforo máximo excedido: {len(valid_people)} personas (máximo {max_occ}, exceso {excess})",
                        "confidence": round(min(0.96, 0.78 + min(excess, 6) * 0.03), 3),
                        "evidence": f"Se contabilizaron {len(valid_people)} personas superando el aforo máximo configurado ({max_occ}): {'; '.join(people_descriptions)}.",
                        "source": "model",
                        "relatedDetectionIds": [p["id"] for p in valid_people],
                    }
                )

        elif scenario_id == "public-traffic":
            veh_tuples = [
                (d["box"]["x"], d["box"]["y"], d["box"]["width"], d["box"]["height"])
                for d in detections
                if d["classId"] in VEHICLE_CLASSES
            ]
            road_poly, road_area = self._segment_highway_road_polygon(bgr, veh_tuples)
            if wants_masks:
                masks.append(
                    {
                        "id": "m-road-corridor",
                        "classId": "car",
                        "label": "Calzada / Ruta Vial Obligatoria Detectada",
                        "kind": "semantic",
                        "polygon": road_poly,
                        "areaRatio": road_area,
                        "confidence": 0.94,
                    }
                )
                masks.append(
                    {
                        "id": "m-zone-restricted",
                        "classId": "zone",
                        "label": "Zona de Desvío / Carril Restringido",
                        "kind": "semantic",
                        "polygon": [[0.58, 0.48], [0.94, 0.48], [0.96, 0.88], [0.54, 0.88]],
                        "areaRatio": 0.152,
                        "confidence": 0.96,
                    }
                )

            road_hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
            # Evaluar para cada vehículo si cumple la Ruta Vial Obligatoria o si incurre en la condición de alerta elegida para esta cámara (`alert_target`)
            veh_items = [d for d in detections if d["classId"] in VEHICLE_CLASSES]
            route_violations: Dict[str, Tuple[str, str, str]] = {}  # det_id -> (short_tag, pattern_title, reason_evidence)

            for idx_v, d_item in enumerate(veh_items):
                tid = d_item.get("trackId", f"V{idx_v + 1}")
                b = d_item["box"]
                vcx = b["x"] + b["width"] * 0.5
                vcy = b["y"] + b["height"] * 0.5
                pos_txt = position_Zone_label((b["x"], b["y"], b["width"], b["height"]))
                base_lbl = d_item["label"]
                is_heavy = d_item["classId"] in ("truck", "bus")

                # Punto de contacto con la calzada (centro inferior de la caja): es lo que define en qué carril
                # está un vehículo en perspectiva; el centro de la caja de un bus alto "flota" sobre otro carril.
                contact = (vcx, b["y"] + b["height"] * 0.92)

                # 1) ¿Está dentro del polígono de carril restringido? ¿Se salió de la calzada (berma, vereda, pasto)?
                in_restricted_poly = point_in_polygon(contact, RESTRICTED_LANE_POLYGON)
                off_corridor = not in_restricted_poly and not self._on_road_surface(road_hsv, (b["x"], b["y"], b["width"], b["height"]))

                # 2) ¿Es un vehículo pesado (Camión / Bus) circulando fuera del carril lento?
                is_heavy_off_route = is_heavy and (0.20 <= vcx <= 0.62)

                # 3) ¿Tiene distancia crítica (riesgo de colisión por alcance) con el vehículo de ADELANTE en su carril?
                #    Mismo carril = solapamiento horizontal real; "adelante" = más arriba en la imagen; la separación se
                #    mide en múltiplos de su propio alto (en perspectiva, el tamaño aparente escala igual que la distancia).
                close_ahead_lbl: Optional[str] = None
                gap_factor = 0.45 if alert_target == "close_distance" else 0.35
                for other in veh_items:
                    if other["id"] == d_item["id"] or other["confidence"] < min(threshold, 0.45):
                        continue
                    ob = other["box"]
                    overlap_w = min(b["x"] + b["width"], ob["x"] + ob["width"]) - max(b["x"], ob["x"])
                    same_lane = overlap_w >= 0.5 * min(b["width"], ob["width"])
                    ahead = (ob["y"] + ob["height"]) < (b["y"] + b["height"]) - 0.25 * b["height"]
                    scale_ok = 0.35 <= (ob["height"] / max(b["height"], 1e-6)) <= 1.25
                    gap = b["y"] - (ob["y"] + ob["height"])  # negativo = se tocan/solapan en la imagen
                    if same_lane and ahead and scale_ok and gap <= gap_factor * b["height"]:
                        close_ahead_lbl = f"{other['label']} {other.get('trackId', '')}".strip()
                        break

                if d_item["confidence"] < min(threshold, 0.5):
                    # Detección dudosa (vehículo diminuto, borroso o candidato OpenCV): se muestra pero no acusa.
                    d_item["label"] = f"{base_lbl} {tid} (por confirmar · {pos_txt})"
                    continue

                if alert_target == "heavy_vehicles":
                    if is_heavy:
                        short_tag = "TRANSPORTE PESADO EN RUTA"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Control de transporte pesado: {full_lbl}",
                            f"Sujeto detectado por filtro de cámara: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: La cámara está configurada para alertar el paso de camiones y buses sobre la vía pública.",
                        )
                    else:
                        d_item["label"] = f"{base_lbl} {tid} (RUTA OK · {pos_txt})"
                elif alert_target == "close_distance":
                    if close_ahead_lbl is not None:
                        short_tag = "DISTANCIA CRÍTICA EN RUTA"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Riesgo en ruta (distancia crítica): {full_lbl}",
                            f"Sujeto infractor: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: No mantiene la distancia mínima de seguridad respecto a {close_ahead_lbl} (riesgo de colisión).",
                        )
                    else:
                        d_item["label"] = f"{base_lbl} {tid} (RUTA OK · {pos_txt})"
                elif alert_target == "off_route":
                    if in_restricted_poly or off_corridor:
                        short_tag = "CARRIL RESTRINGIDO" if in_restricted_poly else "DESVÍO DE RUTA"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Desvío / Invasión de carril: {full_lbl}",
                            f"Sujeto infractor: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: El vehículo se salió del corredor asignado o invadió el carril lateral restringido.",
                        )
                    else:
                        d_item["label"] = f"{base_lbl} {tid} (RUTA OK · {pos_txt})"
                elif alert_target in ("congestion", "pedestrian_road"):
                    if alert_target == "pedestrian_road" and d_item["classId"] == "motorcycle":
                        short_tag = "MOTO EN CORREDOR VIAL"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Motocicleta detectada en corredor vial: {full_lbl}",
                            f"Sujeto detectado: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%].",
                        )
                    else:
                        d_item["label"] = f"{base_lbl} {tid} (RUTA OK · {pos_txt})"
                else:
                    # alert_target == "all" (Comportamiento integral)
                    if in_restricted_poly:
                        short_tag = "CARRIL RESTRINGIDO"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Invasión de carril restringido: {full_lbl}",
                            f"Sujeto infractor: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: Se desvió de la ruta permitida ingresando al carril lateral restringido.",
                        )
                    elif is_heavy_off_route:
                        short_tag = "FUERA DE RUTA DE CARGA"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Incumplimiento de ruta pesada: {full_lbl}",
                            f"Sujeto infractor: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: Unidad de transporte pesado ({base_lbl}) circulando por carril rápido fuera de su ruta asignada de carga.",
                        )
                    elif close_ahead_lbl is not None:
                        short_tag = "DISTANCIA CRÍTICA EN RUTA"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Riesgo en ruta (distancia crítica): {full_lbl}",
                            f"Sujeto infractor: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: No mantiene la distancia mínima de seguridad en la ruta respecto a {close_ahead_lbl} (riesgo de alcance).",
                        )
                    elif off_corridor:
                        short_tag = "DESVÍO DE RUTA"
                        full_lbl = f"{base_lbl} {tid} ({short_tag})"
                        d_item["label"] = full_lbl
                        route_violations[d_item["id"]] = (
                            short_tag,
                            f"Desvío del corredor vial asignado: {full_lbl}",
                            f"Sujeto infractor: {full_lbl} en el {pos_txt} [x={int(vcx*100)}%, y={int(vcy*100)}%]. "
                            f"Razón de la alerta: Circulación por el borde/berma exterior fuera del corredor central de la ruta obligatoria.",
                        )
                    else:
                        d_item["label"] = f"{base_lbl} {tid} (RUTA OK · {pos_txt})"

            for d_item in detections:
                if d_item["classId"] not in VEHICLE_CLASSES:
                    tid = d_item.get("trackId", "P1")
                    b = d_item["box"]
                    pos_txt = position_Zone_label((b["x"], b["y"], b["width"], b["height"]))
                    # Peatón "en vía" solo si sus pies están sobre la calzada (no en la vereda/acera) o en el carril
                    # restringido. Antes TODA persona visible en la cámara se marcaba como peatón en la vía.
                    feet = (b["x"] + b["width"] * 0.5, b["y"] + b["height"])
                    on_road = point_in_polygon(feet, RESTRICTED_LANE_POLYGON) or (
                        self._on_road_surface(road_hsv, (b["x"], b["y"], b["width"], b["height"]))
                        and not self._on_sidewalk(road_hsv, (b["x"], b["y"], b["width"], b["height"]), veh_items)
                    )
                    if not on_road:
                        d_item["label"] = f"{d_item['label']} {tid} (en vereda · {pos_txt})"
                        continue
                    d_item["label"] = f"{d_item['label']} {tid} (PEATÓN EN VÍA · {pos_txt})"
                    if alert_target in ("all", "pedestrian_road"):
                        route_violations[d_item["id"]] = (
                            "PEATÓN EN VÍA",
                            f"Peatón en calzada vehicular: {d_item['label']}",
                            f"Sujeto detectado: {d_item['label']} sobre la vía pública en el {pos_txt}.",
                        )

            vehicles = [d for d in detections if d["classId"] in VEHICLE_CLASSES and d["confidence"] >= threshold]
            if wants_patterns:
                for d_item in detections:
                    if d_item["confidence"] >= threshold and d_item["id"] in route_violations:
                        _, pat_title, pat_evidence = route_violations[d_item["id"]]
                        patterns.append(
                            {
                                "id": f"p-zone-{d_item['id']}",
                                "type": "zone_intrusion",
                                "label": pat_title,
                                "confidence": round(min(0.97, d_item["confidence"] + 0.03), 3),
                                "evidence": pat_evidence,
                                "source": "model",
                                "relatedDetectionIds": [d_item["id"]],
                            }
                        )
                if len(vehicles) >= 3 and alert_target in ("all", "congestion"):
                    veh_list = ", ".join(v["label"] for v in vehicles[:8])
                    patterns.append(
                        {
                            "id": "p-traffic-congestion",
                            "type": "traffic_congestion",
                            "label": f"Flujo / Congestión en carretera ({len(vehicles)} vehículos detectados en ruta)",
                            "confidence": round(min(0.96, 0.74 + len(vehicles) * 0.03), 3),
                            "evidence": (
                                f"Razón de la alerta: Alta densidad vehicular sobre la ruta monitoreada "
                                f"({len(vehicles)} unidades simultáneas identificadas: {veh_list})."
                            ),
                            "source": "model",
                            "relatedDetectionIds": [v["id"] for v in vehicles],
                        }
                    )

        if scenario_id == "abandoned-objects":
            self._apply_abandoned_objects(detections, masks, patterns, threshold, alert_target, source_key, wants_patterns)

        duration_ms = max(1, int(round((time.perf_counter() - started) * 1000)))
        annotated_url = render_annotated_snapshot(bgr, detections if wants_det else [])
        return {
            "detections": detections if wants_det else [],
            "masks": masks if wants_masks else [],
            "patterns": patterns if wants_patterns else [],
            "durationMs": duration_ms,
            "annotatedSnapshotUrl": annotated_url,
        }


detector_engine = RealVisionDetector()
