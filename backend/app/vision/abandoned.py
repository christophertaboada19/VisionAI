"""
Escenario "Objetos abandonados" (mochila, bolso o maleta sin dueño).

Regla visual (YOLOv8 + seguimiento temporal con OpenCV):
  1. YOLOv8 detecta personas (COCO 0) y bultos: mochila (24), bolso (26) y maleta (28).
  2. Cada bulto se sigue entre fotogramas por solapamiento (IoU) con un ID estable propio (O1, O2...).
  3. Se considera "con dueño" si hay una persona cerca (solapada o a poca distancia de su centro).
  4. Si el bulto permanece QUIETO y SIN persona cerca durante N segundos -> OBJETO ABANDONADO.
     Si alguien lo mueve o se acerca, el contador se reinicia.

En una imagen suelta (sin tiempo), un bulto sin ninguna persona cerca se reporta directamente como
posible objeto abandonado (con confianza algo menor).
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

Box = Tuple[float, float, float, float]  # x, y, ancho, alto normalizados 0..1

# Clases COCO de YOLOv8 que representan bultos vigilados.
BAG_COCO: Dict[int, str] = {24: "Mochila", 26: "Bolso", 28: "Maleta"}

# "Qué detectar como alerta" (alertTarget) -> (segundos sin dueño para alertar, tipos de bulto vigilados)
ABANDON_TARGETS: Dict[str, Tuple[float, Tuple[str, ...]]] = {
    "all": (10.0, ("Mochila", "Bolso", "Maleta")),
    "quick": (5.0, ("Mochila", "Bolso", "Maleta")),
    "suitcase_only": (10.0, ("Maleta",)),
    "backpack_only": (10.0, ("Mochila", "Bolso")),
}

# Tiempo que se recuerda un bulto que dejó de verse (oclusión momentánea, una persona pasa delante).
FORGET_AFTER_SEC = 20.0
# El bulto se considera "quieto" si su caja actual se solapa al menos esto con su posición inicial.
STATIC_IOU = 0.45


def _iou(a: Box, b: Box) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def _center(b: Box) -> Tuple[float, float]:
    return b[0] + b[2] / 2.0, b[1] + b[3] / 2.0


def person_is_near(bag: Box, person: Box) -> bool:
    """Una persona 'acompaña' al bulto si lo toca/solapa o está a poca distancia de él."""
    # Solapamiento (la persona lo lleva puesto, lo sostiene o está encima).
    px2, py2 = person[0] + person[2], person[1] + person[3]
    bx2, by2 = bag[0] + bag[2], bag[1] + bag[3]
    overlap_w = min(px2, bx2) - max(person[0], bag[0])
    overlap_h = min(py2, by2) - max(person[1], bag[1])
    if overlap_w > 0 and overlap_h > 0:
        return True
    # Distancia entre el bulto y los pies/centro de la persona, relativa al tamaño de la persona.
    bcx, bcy = _center(bag)
    pcx = person[0] + person[2] / 2.0
    feet_y = person[1] + person[3]
    dist = math.hypot(bcx - pcx, (bcy - feet_y) * 0.7)
    reach = max(0.12, person[2] * 1.6, person[3] * 0.55)
    return dist <= reach


@dataclass
class _Tracked:
    oid: str
    kind: str
    anchor: Box
    last_box: Box
    first_seen: float
    last_seen: float
    unattended_since: Optional[float] = None
    alerted: bool = False
    history: List[float] = field(default_factory=list)


class AbandonedObjectMonitor:
    """Estado temporal por cámara/fuente (cada cámara tiene sus propios bultos y contadores)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._objects: Dict[str, _Tracked] = {}
        self._counter = 0

    def _match(self, kind: str, box: Box, taken: set) -> Optional[_Tracked]:
        best, best_iou = None, 0.30
        for obj in self._objects.values():
            if obj.oid in taken:
                continue
            # Una mochila puede confundirse con bolso entre fotogramas: se compara por posición.
            ov = _iou(box, obj.last_box)
            if ov > best_iou:
                best, best_iou = obj, ov
        return best

    def update(
        self,
        bags: List[Tuple[str, float, Box]],
        persons: List[Box],
        now: Optional[float] = None,
    ) -> List[Dict[str, object]]:
        """
        bags: [(tipo, confianza, caja)]; persons: [caja].
        Devuelve por cada bulto: {oid, kind, conf, box, owner_near, unattended_s, moving}.
        """
        now = time.time() if now is None else now
        out: List[Dict[str, object]] = []
        with self._lock:
            for oid in [k for k, o in self._objects.items() if now - o.last_seen > FORGET_AFTER_SEC]:
                del self._objects[oid]
            taken: set = set()
            for kind, conf, box in bags:
                obj = self._match(kind, box, taken)
                if obj is None:
                    self._counter += 1
                    obj = _Tracked(oid=f"O{self._counter}", kind=kind, anchor=box, last_box=box, first_seen=now, last_seen=now)
                    self._objects[obj.oid] = obj
                taken.add(obj.oid)
                moving = _iou(box, obj.anchor) < STATIC_IOU
                if moving:
                    # Alguien lo está moviendo/cargando: nueva posición de referencia y se reinicia el contador.
                    obj.anchor = box
                    obj.unattended_since = None
                    obj.alerted = False
                owner_near = any(person_is_near(box, p) for p in persons)
                if owner_near or moving:
                    obj.unattended_since = None
                    obj.alerted = False
                elif obj.unattended_since is None:
                    obj.unattended_since = now
                obj.kind = kind
                obj.last_box = box
                obj.last_seen = now
                unattended_s = 0.0 if obj.unattended_since is None else now - obj.unattended_since
                out.append(
                    {
                        "oid": obj.oid,
                        "kind": kind,
                        "conf": conf,
                        "box": box,
                        "owner_near": owner_near,
                        "moving": moving,
                        "unattended_s": round(unattended_s, 1),
                    }
                )
        return out


_MONITORS: Dict[str, AbandonedObjectMonitor] = {}
_MONITORS_LOCK = threading.Lock()


def monitor_for(source_key: str) -> AbandonedObjectMonitor:
    with _MONITORS_LOCK:
        m = _MONITORS.get(source_key)
        if m is None:
            m = AbandonedObjectMonitor()
            _MONITORS[source_key] = m
        return m


def target_settings(alert_target: str) -> Tuple[float, Tuple[str, ...]]:
    return ABANDON_TARGETS.get(alert_target, ABANDON_TARGETS["all"])
