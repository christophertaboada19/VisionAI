"""
Motor YOLOv8n con ONNX Runtime (sin PyTorch ni Ultralytics) para PRODUCCIÓN.

En el plan gratuito de Render (512 MB de RAM, 0.1 vCPU) PyTorch + Ultralytics no caben en memoria.
Este módulo carga `yolov8n.onnx` (exportado con tamaño de entrada dinámico) y expone la MISMA interfaz
mínima que usa el detector con Ultralytics:

    results = model.predict(source=bgr, conf=0.25, classes=[0, 2], imgsz=640, verbose=False)
    for b in results[0].boxes:  b.cls[0].item(), b.conf[0].item(), b.xyxy[0].tolist()

Preprocesado (letterbox a múltiplo de 32, RGB, 0..1) y postprocesado (umbral + NMS por clase) iguales
a los de Ultralytics, así que los resultados coinciden con los del entorno de desarrollo.
"""

from __future__ import annotations

import os
from typing import Iterable, List, Optional, Sequence

import cv2
import numpy as np


class _Scalar:
    """Imita a un tensor de 1 elemento (`.item()`) para que el detector no cambie."""

    def __init__(self, v: float) -> None:
        self._v = v

    def item(self) -> float:
        return self._v


class _Row:
    def __init__(self, values: Sequence[float]) -> None:
        self._values = list(values)

    def tolist(self) -> List[float]:
        return list(self._values)


class _Box:
    def __init__(self, cls_id: int, conf: float, xyxy: Sequence[float]) -> None:
        self.cls = [_Scalar(float(cls_id))]
        self.conf = [_Scalar(float(conf))]
        self.xyxy = [_Row(xyxy)]


class _Result:
    def __init__(self, boxes: List[_Box]) -> None:
        self.boxes = boxes


def _letterbox(img: np.ndarray, size: int) -> tuple[np.ndarray, float, tuple[int, int]]:
    h, w = img.shape[:2]
    r = min(size / h, size / w)
    nw, nh = int(round(w * r)), int(round(h * r))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR) if (nw, nh) != (w, h) else img
    # Igual que Ultralytics en modo "auto": el lienzo es el mínimo múltiplo de 32 que contiene la imagen.
    pw, ph = (32 - nw % 32) % 32, (32 - nh % 32) % 32
    left, top = pw // 2, ph // 2
    out = cv2.copyMakeBorder(resized, top, ph - top, left, pw - left, cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return out, r, (left, top)


class OnnxYolo:
    def __init__(self, model_path: str, threads: Optional[int] = None) -> None:
        import onnxruntime as ort  # import diferido: solo si se usa este motor

        opts = ort.SessionOptions()
        n = threads or int(os.getenv("VISION_THREADS", "1"))
        opts.intra_op_num_threads = max(1, n)
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(model_path, sess_options=opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        # Tamaño máximo de entrada: en servidores pequeños se limita para no tardar demasiado.
        self.max_imgsz = int(os.getenv("VISION_MAX_IMGSZ", "960"))

    def predict(
        self,
        source: np.ndarray,
        conf: float = 0.25,
        classes: Optional[Iterable[int]] = None,
        imgsz: int = 640,
        verbose: bool = False,  # compatibilidad con Ultralytics
        iou: float = 0.7,
        max_det: int = 300,
    ) -> List[_Result]:
        size = max(32, min(int(imgsz), self.max_imgsz))
        size = int(np.ceil(size / 32) * 32)
        img, ratio, (padx, pady) = _letterbox(source, size)
        blob = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.ascontiguousarray(blob.transpose(2, 0, 1)[None])
        out = self.session.run(None, {self.input_name: blob})[0][0]  # (84, N): 4 caja + 80 clases
        preds = out.T
        scores_all = preds[:, 4:]
        cls_ids = scores_all.argmax(axis=1)
        scores = scores_all[np.arange(len(cls_ids)), cls_ids]
        keep = scores >= conf
        if classes is not None:
            keep &= np.isin(cls_ids, np.array(list(classes)))
        preds, cls_ids, scores = preds[keep], cls_ids[keep], scores[keep]
        if len(scores) == 0:
            return [_Result([])]

        cx, cy, w, h = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
        x1 = (cx - w / 2 - padx) / ratio
        y1 = (cy - h / 2 - pady) / ratio
        x2 = (cx + w / 2 - padx) / ratio
        y2 = (cy + h / 2 - pady) / ratio
        H, W = source.shape[:2]
        x1, x2 = np.clip(x1, 0, W), np.clip(x2, 0, W)
        y1, y2 = np.clip(y1, 0, H), np.clip(y2, 0, H)

        boxes: List[_Box] = []
        for c in np.unique(cls_ids):  # NMS por clase (como Ultralytics con agnostic=False)
            idx = np.where(cls_ids == c)[0]
            rects = [[float(x1[i]), float(y1[i]), float(x2[i] - x1[i]), float(y2[i] - y1[i])] for i in idx]
            kept = cv2.dnn.NMSBoxes(rects, [float(scores[i]) for i in idx], conf, iou)
            for k in np.array(kept).reshape(-1):
                i = idx[int(k)]
                boxes.append(_Box(int(c), float(scores[i]), [float(x1[i]), float(y1[i]), float(x2[i]), float(y2[i])]))
        boxes.sort(key=lambda b: -b.conf[0].item())
        return [_Result(boxes[:max_det])]
