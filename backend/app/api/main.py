"""
API Principal de VISION AI (FastAPI + OpenCV + YOLOv8 + Clasificador CNN por ROI).
Cumple el contrato de `ApiVisionAdapter.ts` y expone endpoints para monitoreo en vivo
con Webcam, Celular (IP Webcam / Web) y Cámaras Públicas, más alertas móviles (Telegram y ntfy.sh).
"""

from __future__ import annotations
import logging
import os
import uuid
from collections import OrderedDict
from typing import Any, Dict, List, Optional
import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..core.config import settings
from ..services.notifier import send_mobile_alert
from ..vision.detector import detector_engine
from ..vision.opencv_pipeline import (
    canny_edges,
    decode_data_url,
    decode_image,
    encode_jpeg_data_url,
    sobel_gradients,
    strict_threshold,
    to_grayscale,
)
from ..vision.streams import PUBLIC_CAMERAS, grab_stream_frame

app = FastAPI(
    title="VISION AI — Backend de Visión Computacional e IA Real",
    version="1.0.0",
    description="Servicio FastAPI con OpenCV (Sesión 04), YOLOv8 y Clasificador CNN (Sesiones 02 y 03).",
)

@app.middleware("http")
async def _catch_unhandled_errors(request, call_next):
    """Red de seguridad: cualquier excepción no controlada se devuelve como JSON 500.
    Se registra ANTES del middleware CORS para que la respuesta lleve cabeceras CORS
    (sin ellas el navegador solo muestra un 'Failed to fetch' sin explicación)."""
    try:
        return await call_next(request)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("vision_ai").exception("Error no controlado en %s", request.url.path)
        return JSONResponse(status_code=500, content={"detail": f"Error interno del servidor: {exc}"})


# CORS: en producción solo el dominio del frontend (Vercel). Variables en Render:
#   ALLOWED_ORIGINS="https://vision-ai.vercel.app,https://otro-dominio.com"
#   ALLOWED_ORIGIN_REGEX="https://vision-ai-.*\.vercel\.app"   (despliegues de vista previa, opcional)
# Sin variables (desarrollo local) se permite cualquier origen, sin credenciales.
_origins = [o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX") or None,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)

logger = logging.getLogger("vision_ai")

# Almacén en memoria de análisis recientes para responder a GET /api/v1/analyses/{id}/results.
# Acotado para que el servidor no crezca en memoria indefinidamente.
_ANALYSIS_RESULTS: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
_MAX_STORED_RESULTS = 200
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
VALID_MODES = {"detection", "segmentation", "patterns", "combined"}


def _store_result(analysis_id: str, payload: Dict[str, Any]) -> None:
    _ANALYSIS_RESULTS[analysis_id] = payload
    while len(_ANALYSIS_RESULTS) > _MAX_STORED_RESULTS:
        _ANALYSIS_RESULTS.popitem(last=False)


def _clamp_threshold(value: float) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.5
    if v != v:  # NaN
        return 0.5
    return min(0.99, max(0.01, v))


def _safe_mode(mode: str) -> str:
    return mode if mode in VALID_MODES else "combined"


def _decode_frame_or_400(data_url: str) -> np.ndarray:
    if not data_url or len(data_url) > MAX_UPLOAD_BYTES * 4 // 3 + 64:
        raise HTTPException(status_code=400, detail="Fotograma vacío o demasiado grande (máx. 15 MB).")
    try:
        return decode_data_url(data_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Fotograma inválido: {exc}") from exc


def _run_analysis(bgr: np.ndarray, scenario_id: str, mode: str, threshold: float, alert_target: str, source_key: str) -> Dict[str, Any]:
    """Ejecuta la inferencia y convierte cualquier fallo interno en un error HTTP 500 con mensaje claro
    (así pasa por el middleware CORS y el navegador puede mostrar el motivo real)."""
    try:
        return detector_engine.analyze_frame(
            bgr=bgr,
            scenario_id=scenario_id,
            mode=_safe_mode(mode),
            threshold=_clamp_threshold(threshold),
            alert_target=alert_target,
            source_key=source_key,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Fallo en el motor de visión")
        raise HTTPException(status_code=500, detail=f"Error interno del motor de visión: {exc}") from exc


def _generate_reference_scene_bgr(scenario_id: str) -> np.ndarray:
    """Genera una imagen sintética de respaldo si se analiza un escenario sin adjuntar imagen."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (35, 25, 18)
    if scenario_id == "quality-control":
        # Dibuja dos botellas sintéticas (una sana con tapa y una aplastada sin tapa)
        cv2.rectangle(img, (150, 140), (240, 400), (180, 200, 120), -1)
        cv2.rectangle(img, (175, 110), (215, 140), (240, 120, 20), -1)  # tapa
        cv2.rectangle(img, (155, 230), (235, 310), (60, 80, 210), -1)   # etiqueta
        # Segunda botella sin tapa y deformada
        pts = np.array([[390, 160], [470, 175], [450, 270], [485, 395], [380, 400], [410, 265]], np.int32)
        cv2.fillPoly(img, [pts], (140, 160, 140))
    return img


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "engine": "REAL",
        "opencvVersion": cv2.__version__,
        "supabaseConfigured": bool(settings.SUPABASE_URL),
        "scenarios": ["industrial-safety", "quality-control", "retail-store", "public-traffic", "abandoned-objects"],
    }


# -----------------------------------------------------------------------------
# 1. Endpoints del contrato ApiVisionAdapter.ts (Análisis de Imágenes)
# -----------------------------------------------------------------------------

@app.post("/api/v1/analyses")
async def create_analysis(
    mode: str = Form("combined"),
    threshold: float = Form(0.5),
    scenarioId: str = Form("industrial-safety"),
    alertTarget: str = Form("all"),
    image: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    analysis_id = f"AN-REAL-{uuid.uuid4().hex[:8].upper()}"
    try:
        if image is not None:
            raw = await image.read(MAX_UPLOAD_BYTES + 1)
            if not raw:
                raise ValueError("La imagen subida está vacía.")
            if len(raw) > MAX_UPLOAD_BYTES:
                raise ValueError("La imagen supera el máximo de 15 MB.")
            bgr = decode_image(raw)
        else:
            bgr = _generate_reference_scene_bgr(scenarioId)

        res = detector_engine.analyze_frame(
            bgr=bgr,
            scenario_id=scenarioId,
            mode=_safe_mode(mode),
            threshold=_clamp_threshold(threshold),
            alert_target=(alertTarget or "all")[:64],
        )
        _store_result(analysis_id, {
            "analysisId": analysis_id,
            "status": "completed",
            "detections": res["detections"],
            "masks": res["masks"],
            "patterns": res["patterns"],
            "durationMs": res["durationMs"],
            "annotatedSnapshotUrl": res.get("annotatedSnapshotUrl"),
        })
    except Exception as exc:
        logger.exception("Fallo analizando imagen")
        _store_result(analysis_id, {
            "analysisId": analysis_id,
            "status": "failed",
            "detections": [],
            "masks": [],
            "patterns": [],
            "durationMs": 0,
            "error": str(exc),
        })
    return {"analysisId": analysis_id, "status": _ANALYSIS_RESULTS[analysis_id]["status"]}


@app.get("/api/v1/analyses/{analysis_id}/results")
def get_analysis_results(analysis_id: str) -> Dict[str, Any]:
    if analysis_id not in _ANALYSIS_RESULTS:
        raise HTTPException(status_code=404, detail=f"Análisis {analysis_id} no encontrado.")
    return _ANALYSIS_RESULTS[analysis_id]


# -----------------------------------------------------------------------------
# 2. Endpoints de Monitoreo en Vivo (Webcam / Celular / Cámaras IP y Públicas)
# -----------------------------------------------------------------------------

class LiveFrameRequest(BaseModel):
    scenarioId: str
    mode: str = "combined"
    threshold: float = 0.5
    frameIndex: int = 0
    t: float = 0.0
    imageDataUrl: str
    alertTarget: str = "all"
    cameraId: Optional[str] = None


@app.post("/api/v1/live/frame")
def analyze_live_frame(req: LiveFrameRequest) -> Dict[str, Any]:
    """
    Recibe un fotograma en vivo (desde la Webcam de la PC o la cámara del Celular),
    ejecuta el pipeline OpenCV + YOLOv8 + Clasificador CNN y devuelve las cajas, máscaras y patrones.
    """
    bgr = _decode_frame_or_400(req.imageDataUrl)
    res = _run_analysis(
        bgr, req.scenarioId, req.mode, req.threshold, req.alertTarget, f"webcam:{req.cameraId or 'default'}"
    )
    return {
        "index": req.frameIndex,
        "t": req.t,
        "engine": "REAL",
        "detections": res["detections"],
        "masks": res["masks"],
        "patterns": res["patterns"],
        "latencyMs": res["durationMs"],
        "annotatedSnapshotUrl": res.get("annotatedSnapshotUrl"),
    }


@app.get("/api/v1/streams/public")
def list_public_streams() -> Dict[str, Any]:
    """Devuelve la lista de cámaras públicas en vivo precargadas."""
    return {"streams": PUBLIC_CAMERAS}


class StreamCaptureRequest(BaseModel):
    streamUrl: str
    scenarioId: str = "public-traffic"
    mode: str = "combined"
    threshold: float = 0.5
    frameIndex: int = 0
    t: float = 0.0
    alertTarget: str = "all"


@app.post("/api/v1/streams/capture")
def capture_and_analyze_stream(req: StreamCaptureRequest) -> Dict[str, Any]:
    """
    Conecta OpenCV (cv2.VideoCapture) a una Cámara IP (ej. http://192.168.1.40:8080/video de IP Webcam)
    o a una Cámara Pública en vivo (.m3u8), extrae el fotograma actual y ejecuta la inferencia real.
    """
    url = req.streamUrl.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Debe proporcionar una URL de cámara IP o stream público.")

    try:
        bgr = grab_stream_frame(url)
    except Exception:
        logger.exception("Fallo capturando stream")
        bgr = None
    if bgr is None:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo abrir el stream '{url}' con OpenCV. Verifique que la cámara IP o stream esté activo.",
        )

    res = _run_analysis(bgr, req.scenarioId, req.mode, req.threshold, req.alertTarget, f"stream:{url}")
    return {
        "index": req.frameIndex,
        "t": req.t,
        "engine": "REAL",
        "frameDataUrl": encode_jpeg_data_url(bgr, quality=80),
        "annotatedSnapshotUrl": res.get("annotatedSnapshotUrl"),
        "detections": res["detections"],
        "masks": res["masks"],
        "patterns": res["patterns"],
        "latencyMs": res["durationMs"],
    }


# -----------------------------------------------------------------------------
# 3. Endpoint de Preprocesamiento Clásico OpenCV (Sesión 04)
# -----------------------------------------------------------------------------

class PreprocessRequest(BaseModel):
    imageDataUrl: str
    view: str = "edges"  # "gray" | "edges" | "canny" | "binary"
    binaryThreshold: int = 60


@app.post("/api/v1/preprocess")
def opencv_preprocess_view(req: PreprocessRequest) -> Dict[str, Any]:
    bgr = _decode_frame_or_400(req.imageDataUrl)
    gray = to_grayscale(bgr)
    if req.view == "gray":
        out = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    elif req.view == "canny":
        edges = canny_edges(gray, 50, 150)
        out = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    elif req.view == "binary":
        sob = sobel_gradients(gray)
        binary = strict_threshold(sob, thresh=req.binaryThreshold)
        out = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    else:
        sob = sobel_gradients(gray)
        out = cv2.cvtColor(sob, cv2.COLOR_GRAY2BGR)
    return {"imageDataUrl": encode_jpeg_data_url(out, quality=85)}


# -----------------------------------------------------------------------------
# 4. Endpoints de Notificaciones Móviles en Tiempo Real (Telegram Bot + ntfy.sh)
# -----------------------------------------------------------------------------

class MobileAlertRequest(BaseModel):
    title: str
    message: str
    severity: str = "high"
    scenarioName: str = ""
    evidence: str = ""
    imageDataUrl: Optional[str] = None
    detections: Optional[List[Dict[str, Any]]] = None
    telegramBotToken: Optional[str] = None
    telegramChatId: Optional[str] = None
    ntfyTopic: Optional[str] = None


@app.post("/api/v1/notifications/alert")
async def notify_alert(req: MobileAlertRequest) -> Dict[str, Any]:
    try:
        res = await send_mobile_alert(
            title=req.title,
            message=req.message,
            severity=req.severity,
            scenario_name=req.scenarioName,
            evidence=req.evidence,
            image_data_url=req.imageDataUrl,
            detections=req.detections,
            telegram_bot_token=req.telegramBotToken,
            telegram_chat_id=req.telegramChatId,
            ntfy_topic=req.ntfyTopic,
        )
    except Exception as exc:
        logger.exception("Fallo enviando alerta móvil")
        raise HTTPException(status_code=502, detail=f"No se pudo enviar la alerta móvil: {exc}") from exc
    return {"status": "sent", "channels": res}
