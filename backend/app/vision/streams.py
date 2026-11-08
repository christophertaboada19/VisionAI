"""
Gestor de Cámaras IP (IP Webcam / RTSP / HTTP MJPEG) y Cámaras Públicas en Vivo (HLS .m3u8) con OpenCV.
"""

from __future__ import annotations
import threading
import time
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np

# Catálogo de Cámaras Públicas en Vivo (Seattle DOT Travelers HD + Caltrans HLS .m3u8)
PUBLIC_CAMERAS: List[Dict[str, str]] = [
    {
        "id": "seattle-35-barton",
        "name": "Seattle DOT · 35th Ave SW & SW Barton St (HD En Vivo)",
        "url": "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Barton_EW.stream/playlist.m3u8",
        "location": "Seattle Travelers · 35th Ave SW & Barton (Buses, Camiones y Autos HD)",
        "scenarioId": "public-traffic",
    },
    {
        "id": "seattle-24-market",
        "name": "Seattle DOT · 24th Ave NW & NW Market St (HD En Vivo)",
        "url": "https://61e0c5d388c2e.streamlock.net:443/live/24_NW_Market_EW.stream/playlist.m3u8",
        "location": "Seattle Travelers · Ballard 24th & Market (Corredor Urbano HD)",
        "scenarioId": "public-traffic",
    },
    {
        "id": "seattle-35-roxbury",
        "name": "Seattle DOT · 35th Ave SW & SW Roxbury St (HD En Vivo)",
        "url": "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Roxbury_EW.stream/playlist.m3u8",
        "location": "Seattle Travelers · West Seattle Roxbury (Tráfico y Transporte Pesado HD)",
        "scenarioId": "public-traffic",
    },
    {
        "id": "seattle-41-admiral",
        "name": "Seattle DOT · 41st Ave SW & SW Admiral Way (HD En Vivo)",
        "url": "https://61e0c5d388c2e.streamlock.net:443/live/41_SW_Admiral.stream/playlist.m3u8",
        "location": "Seattle Travelers · Admiral Way (Pendiente y Cruce Vial HD)",
        "scenarioId": "public-traffic",
    },
    {
        "id": "seattle-california-alaska",
        "name": "Seattle DOT · California Ave SW & SW Alaska St (HD En Vivo)",
        "url": "https://61e0c5d388c2e.streamlock.net:443/live/California_SW_Alaska_NS.stream/playlist.m3u8",
        "location": "Seattle Travelers · Junction Alaska St (Intersección Principal HD)",
        "scenarioId": "public-traffic",
    },
    {
        "id": "pub-i5-meadowdale",
        "name": "Autopista I-5 · Meadowdale (Tráfico en Vivo)",
        "url": "https://wzmedia.dot.ca.gov/D7/CCTV-25.stream/playlist.m3u8",
        "location": "Los Ángeles DOT · Interestatal 5 (Meadowdale)",
        "scenarioId": "public-traffic",
    },
    {
        "id": "pub-i5-south-i10",
        "name": "Autopista I-5 · Sur de I-10 (Camiones y Autos en Vivo)",
        "url": "https://wzmedia.dot.ca.gov/D7/CCTV-17.stream/playlist.m3u8",
        "location": "Los Ángeles DOT · Cruce I-5 / I-10",
        "scenarioId": "public-traffic",
    },
    {
        "id": "pub-i5-burbank",
        "name": "Autopista I-5 · Burbank Blvd (Carril Restringido)",
        "url": "https://wzmedia.dot.ca.gov/D7/CCTV-40.stream/playlist.m3u8",
        "location": "Los Ángeles DOT · I-5 Norte de Burbank",
        "scenarioId": "public-traffic",
    },
    {
        "id": "pub-i110-ave26",
        "name": "Autopista I-110 · Avenue 26 (Cámara Vial Pública)",
        "url": "https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8",
        "location": "Los Ángeles DOT · Corredor I-110",
        "scenarioId": "public-traffic",
    },
]

_CAPTURE_CACHE: Dict[str, Tuple[cv2.VideoCapture, float]] = {}
_LAST_FRAME_CACHE: Dict[str, Tuple[np.ndarray, float]] = {}
_URL_LOCKS: Dict[str, threading.Lock] = {}
_GLOBAL_LOCK = threading.Lock()

SEATTLE_WOWZA_BASE = "https://61e0c5d388c2e.streamlock.net:443/live"


def _get_url_lock(url: str) -> threading.Lock:
    with _GLOBAL_LOCK:
        if url not in _URL_LOCKS:
            _URL_LOCKS[url] = threading.Lock()
        return _URL_LOCKS[url]


def resolve_stream_url(raw_url: str) -> str:
    """
    Traduce enlaces del portal de cámaras de Seattle (https://web.seattle.gov/Travelers/)
    o nombres de cámaras de Seattle a su stream HLS (.m3u8) en alta definición.
    """
    u = raw_url.strip()
    if not u:
        return u
    low = u.lower()
    # Si el usuario pega directamente el portal web.seattle.gov/Travelers/
    if "web.seattle.gov/travelers" in low:
        return f"{SEATTLE_WOWZA_BASE}/35_SW_Barton_EW.stream/playlist.m3u8"
    # Si pega una URL de imagen de cámara de Seattle: .../trafficcams/images/24_NW_Market_EW.jpg
    if "seattle.gov/trafficcams/images/" in low and low.endswith(".jpg"):
        slug = u.rsplit("/", 1)[-1][:-4]
        return f"{SEATTLE_WOWZA_BASE}/{slug}.stream/playlist.m3u8"
    # Si escribe directamente el código de una cámara de Seattle (ej. 24_NW_Market_EW o 35_SW_Barton_EW.stream)
    if "://" not in u and not u.startswith("/"):
        slug = u[:-7] if u.endswith(".stream") else u
        return f"{SEATTLE_WOWZA_BASE}/{slug}.stream/playlist.m3u8"
    return u


def _safe_release(cap: Optional[cv2.VideoCapture]) -> None:
    if cap is None:
        return
    try:
        cap.release()
    except Exception:
        pass


# Tiempos máximos para abrir/leer un stream con FFmpeg. Sin ellos, una cámara IP apagada o un
# segmento HLS caducado bloquea la petición más de un minuto y deja colgado el monitoreo en vivo.
OPEN_TIMEOUT_MS = 15000
READ_TIMEOUT_MS = 8000
# Una captura HLS inactiva más de este tiempo tiene su lista de segmentos caducada: se reabre limpia.
MAX_IDLE_SEC = 12.0


def _create_capture(resolved_url: str) -> cv2.VideoCapture:
    params = [
        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, OPEN_TIMEOUT_MS,
        cv2.CAP_PROP_READ_TIMEOUT_MSEC, READ_TIMEOUT_MS,
    ]
    try:
        cap = cv2.VideoCapture(resolved_url, cv2.CAP_FFMPEG, params)
    except Exception:
        cap = cv2.VideoCapture(resolved_url)
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass
    return cap


def _open_and_read_once(resolved_url: str, cap: Optional[cv2.VideoCapture]) -> Tuple[Optional[cv2.VideoCapture], Optional[np.ndarray]]:
    try:
        if cap is None or not cap.isOpened():
            _safe_release(cap)
            cap = _create_capture(resolved_url)
        if not cap.isOpened():
            _safe_release(cap)
            return None, None
        ok, frame = cap.read()
        if not ok or frame is None or frame.size == 0:
            _safe_release(cap)
            return None, None
        return cap, frame
    except Exception:
        _safe_release(cap)
        return None, None


def grab_stream_frame(url: str, timeout_sec: float = 4.5) -> Optional[np.ndarray]:
    """
    Abre o reutiliza de forma thread-safe un cv2.VideoCapture para una cámara IP o stream HLS (.m3u8).
    Si el segmento HLS rotó o falló la lectura en caché, reconecta automáticamente y respalda con el
    último fotograma válido para evitar errores 500/502 en el frontend.
    """
    resolved_url = resolve_stream_url(url)
    if not resolved_url:
        return None

    now = time.time()
    with _GLOBAL_LOCK:
        stale = [k for k, (_, ts) in _CAPTURE_CACHE.items() if now - ts > 25.0 and k != resolved_url]
    for k in stale:
        # Solo se libera si nadie la está leyendo en este momento (evita release() durante read()).
        other_lock = _get_url_lock(k)
        if other_lock.acquire(blocking=False):
            try:
                with _GLOBAL_LOCK:
                    entry = _CAPTURE_CACHE.pop(k, None)
                if entry is not None:
                    _safe_release(entry[0])
            finally:
                other_lock.release()

    url_lock = _get_url_lock(resolved_url)
    with url_lock:
        with _GLOBAL_LOCK:
            cached = _CAPTURE_CACHE.get(resolved_url)
            # Captura inactiva demasiado tiempo: su buffer HLS está caducado y leerla puede colgarse.
            if cached and time.time() - cached[1] > MAX_IDLE_SEC:
                _CAPTURE_CACHE.pop(resolved_url, None)
                _safe_release(cached[0])
                cached = None
        cap = cached[0] if cached else None

        # Intento 1: leer del VideoCapture activo (o abrir si no existía)
        had_cached = cap is not None
        cap, frame = _open_and_read_once(resolved_url, cap)

        # Intento 2: si teníamos un capture en caché y falló por rotación de segmento HLS, reabrir limpio
        if frame is None and had_cached:
            with _GLOBAL_LOCK:
                _CAPTURE_CACHE.pop(resolved_url, None)
            cap, frame = _open_and_read_once(resolved_url, None)

        if frame is not None and cap is not None:
            h, w = frame.shape[:2]
            if w > 1280:
                scale = 1280.0 / w
                frame = cv2.resize(frame, (1280, int(round(h * scale))), interpolation=cv2.INTER_AREA)
            with _GLOBAL_LOCK:
                _CAPTURE_CACHE[resolved_url] = (cap, time.time())
                _LAST_FRAME_CACHE[resolved_url] = (frame.copy(), time.time())
            return frame

        # Si el servidor remoto HLS tardó en rotar el segmento, devolver el último fotograma válido reciente (< 60s)
        with _GLOBAL_LOCK:
            _CAPTURE_CACHE.pop(resolved_url, None)
            last_entry = _LAST_FRAME_CACHE.get(resolved_url)
        if last_entry is not None and (time.time() - last_entry[1]) <= 60.0:
            return last_entry[0].copy()

        return None
