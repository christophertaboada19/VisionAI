"""
Servicio de Notificaciones Móviles en Tiempo Real (Telegram Bot API con Foto + ntfy.sh Push).
Dibuja con OpenCV las cajas delimitadoras sobre el fotograma de evidencia y lo envía al celular.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
import cv2
import httpx
import numpy as np
from ..core.config import settings
from ..vision.opencv_pipeline import decode_data_url, encode_jpeg_bytes


def annotate_evidence_image(
    bgr: np.ndarray,
    detections: List[Dict[str, Any]],
    alert_title: str,
) -> bytes:
    """Dibuja los cuadros delimitadores y etiquetas con OpenCV sobre el fotograma de la alerta."""
    canvas = bgr.copy()
    h, w = canvas.shape[:2]

    for d in detections:
        box = d.get("box", {})
        x1 = int(round(float(box.get("x", 0)) * w))
        y1 = int(round(float(box.get("y", 0)) * h))
        x2 = int(round((float(box.get("x", 0)) + float(box.get("width", 0))) * w))
        y2 = int(round((float(box.get("y", 0)) + float(box.get("height", 0))) * h))
        cls_id = d.get("classId", "")
        conf = int(round(float(d.get("confidence", 0)) * 100))
        label = f"{d.get('label', cls_id)} {conf}%"

        # Color BGR en OpenCV: rojo para defectos/alertas, amarillo para casco/chaleco, azul/verde para resto
        if cls_id in ("defect", "zone"):
            color = (60, 60, 235)
        elif cls_id in ("helmet", "vest"):
            color = (0, 180, 245)
        else:
            color = (210, 125, 40)

        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
        cv2.rectangle(canvas, (x1, max(0, y1 - 22)), (min(w, x1 + len(label) * 9 + 10), y1), color, -1)
        cv2.putText(canvas, label, (x1 + 4, max(14, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)

    # Banner superior de evidencia (ASCII limpio para OpenCV putText)
    clean_title = (
        alert_title.replace("á", "a")
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
    cv2.rectangle(canvas, (0, 0), (w, 30), (20, 25, 45), -1)
    cv2.putText(
        canvas,
        f"VISION AI ALERTA: {clean_title[:55]}",
        (10, 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        (255, 255, 255),
        1,
        cv2.LINE_AA,
    )
    return encode_jpeg_bytes(canvas, quality=85)


async def send_mobile_alert(
    title: str,
    message: str,
    severity: str = "high",
    scenario_name: str = "",
    evidence: str = "",
    image_data_url: Optional[str] = None,
    detections: Optional[List[Dict[str, Any]]] = None,
    telegram_bot_token: Optional[str] = None,
    telegram_chat_id: Optional[str] = None,
    ntfy_topic: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Envía la alerta en tiempo real al celular mediante:
    1. Telegram Bot API (con foto adjunta si hay fotograma de evidencia).
    2. ntfy.sh (notificación Push nativa inmediata sin cuenta).
    """
    bot_token = (telegram_bot_token or settings.TELEGRAM_BOT_TOKEN or "").strip()
    chat_id = (telegram_chat_id or settings.TELEGRAM_CHAT_ID or "").strip()
    topic = (ntfy_topic or settings.NTFY_TOPIC or "").strip()

    sev_icon = {"critical": "🚨 CRÍTICA", "high": "⚠️ ALTA", "medium": "🔶 MEDIA", "low": "ℹ️ BAJA"}.get(severity, "⚠️ ALERTA")
    caption = (
        f"{sev_icon} — VISION AI\n"
        f"📌 Regla: {title}\n"
        f"🏭 Escenario: {scenario_name or 'Monitoreo en vivo'}\n"
        f"📝 Detalle: {message}\n"
        f"🔎 Evidencia: {evidence}"
    )

    # Telegram rechaza captions de foto > 1024 caracteres y mensajes > 4096 (error 400).
    if len(caption) > 1000:
        caption = caption[:997] + "..."
    topic = topic.strip("/ ")

    results: Dict[str, Any] = {"telegram": "skipped", "ntfy": "skipped"}

    annotated_bytes: Optional[bytes] = None
    if image_data_url:
        try:
            bgr = decode_data_url(image_data_url)
            annotated_bytes = annotate_evidence_image(bgr, detections or [], title)
        except Exception:
            annotated_bytes = None

    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Envío a Telegram Bot API
        if bot_token:
            try:
                # Si no hay chat_id o si el usuario acaba de darle /start al bot, intentar descubrirlo en getUpdates
                target_chat_id = chat_id
                if not target_chat_id:
                    upd_resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getUpdates")
                    if upd_resp.status_code == 200:
                        updates = upd_resp.json().get("result", [])
                        for u in reversed(updates):
                            cid = u.get("message", {}).get("chat", {}).get("id")
                            if cid:
                                target_chat_id = str(cid)
                                break

                if target_chat_id:
                    if annotated_bytes:
                        tg_url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
                        resp = await client.post(
                            tg_url,
                            data={"chat_id": target_chat_id, "caption": caption},
                            files={"photo": ("evidencia_vision_ai.jpg", annotated_bytes, "image/jpeg")},
                        )
                    else:
                        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                        resp = await client.post(tg_url, json={"chat_id": target_chat_id, "text": caption})

                    # Si Telegram devuelve "chat not found", buscar si el usuario inició chat en getUpdates con otro ID
                    if resp.status_code == 400 and "chat not found" in resp.text:
                        upd_resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getUpdates")
                        discovered_id = None
                        if upd_resp.status_code == 200:
                            for u in reversed(upd_resp.json().get("result", [])):
                                cid = u.get("message", {}).get("chat", {}).get("id")
                                if cid:
                                    discovered_id = str(cid)
                                    break
                        if discovered_id and discovered_id != target_chat_id:
                            if annotated_bytes:
                                resp = await client.post(
                                    f"https://api.telegram.org/bot{bot_token}/sendPhoto",
                                    data={"chat_id": discovered_id, "caption": caption},
                                    files={"photo": ("evidencia_vision_ai.jpg", annotated_bytes, "image/jpeg")},
                                )
                            else:
                                resp = await client.post(
                                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                                    json={"chat_id": discovered_id, "text": caption},
                                )
                        else:
                            results["telegram"] = (
                                "pendiente_start: Abre tu bot @AlertasVision_bot en Telegram y pulsa INICIAR (/start)"
                            )
                            resp = None

                    if resp is not None:
                        results["telegram"] = "ok" if resp.status_code == 200 else f"error_{resp.status_code}: {resp.text[:120]}"
                else:
                    results["telegram"] = "pendiente_start: Abre @AlertasVision_bot en Telegram y pulsa INICIAR (/start)"
            except Exception as exc:
                results["telegram"] = f"error: {exc}"

        # 2. Envío a ntfy.sh (100% gratuito sin tokens)
        if topic:
            try:
                priority = "5" if severity == "critical" else "4" if severity == "high" else "3"
                headers = {
                    "Title": f"VISION AI - {title}"[:100].encode("ascii", errors="ignore").decode("ascii") or "VISION AI Alerta",
                    "Priority": priority,
                    "Tags": "rotating_light,camera",
                }
                resp = await client.post(
                    f"https://ntfy.sh/{topic}",
                    content=f"{message}\n{evidence}".encode("utf-8"),
                    headers=headers,
                )
                results["ntfy"] = "ok" if resp.status_code in (200, 201) else f"error_{resp.status_code}"
            except Exception as exc:
                results["ntfy"] = f"error: {exc}"

    return results
