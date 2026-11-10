"""
Pruebas unitarias e integrales del motor de Visión Computacional e IA Real (Fase 3):
- Pipeline OpenCV (Sesión 04): Grises, Gaussiano, Sobel, Canny, Binarización y Tensor ROI.
- Clasificador CNN + ROI (Sesiones 02 y 03): Botella Sana vs. Botella Malograda y EPP (Casco y Chaleco).
- Endpoints de FastAPI (/health, /api/v1/analyses, /api/v1/live/frame).
"""

import cv2
import numpy as np
from fastapi.testclient import TestClient
from app.api.main import app
from app.vision.cnn_classifier import classify_bottle_roi, classify_ppe_roi
from app.vision.streams import resolve_stream_url
from app.vision.opencv_pipeline import (
    canny_edges,
    encode_jpeg_bytes,
    encode_jpeg_data_url,
    extract_roi_tensor,
    gaussian_smooth,
    sobel_gradients,
    strict_threshold,
    to_grayscale,
)

client = TestClient(app)


def test_opencv_pipeline_sesion04():
    # Imagen BGR de prueba (240, 320, 3)
    bgr = np.zeros((240, 320, 3), dtype=np.uint8)
    cv2.rectangle(bgr, (60, 40), (200, 200), (255, 255, 255), -1)

    gray = to_grayscale(bgr)
    assert gray.shape == (240, 320)

    smooth = gaussian_smooth(gray, 5)
    assert smooth.shape == (240, 320)

    sobel = sobel_gradients(gray)
    assert sobel.shape == (240, 320)
    assert int(sobel.max()) > 0

    edges = canny_edges(gray)
    assert edges.shape == (240, 320)

    binary = strict_threshold(gray, thresh=100)
    assert set(np.unique(binary).tolist()).issubset({0, 255})

    tensor = extract_roi_tensor(bgr, (0.1, 0.1, 0.5, 0.5), target_size=(64, 64))
    assert tensor.shape == (1, 64, 64, 3)
    assert 0.0 <= float(tensor.min()) and float(tensor.max()) <= 1.0


def test_cnn_bottle_classifier_sana_vs_malograda():
    # 1. Botella Sana: tapa azul/naranja arriba, etiqueta colorida en el centro y cuerpo simétrico
    img_ok = np.full((300, 200, 3), 240, dtype=np.uint8)
    # Cuerpo simétrico
    cv2.rectangle(img_ok, (60, 50), (140, 270), (200, 210, 190), -1)
    # Tapa con saturación alta
    cv2.rectangle(img_ok, (82, 20), (118, 52), (20, 120, 245), -1)
    # Etiqueta centrada con alto contraste
    cv2.rectangle(img_ok, (62, 110), (138, 185), (220, 50, 40), -1)

    res_ok = classify_bottle_roi(img_ok, (0.25, 0.05, 0.50, 0.88))
    assert res_ok.has_cap is True
    assert res_ok.status == "conforming"

    # 2. Botella Malograda: sin tapa (parte superior vacía/gris) y cuerpo aplastado/asimétrico con pliegues
    img_bad = np.full((300, 200, 3), 235, dtype=np.uint8)
    pts = np.array([[55, 95], [145, 110], [110, 180], [150, 265], [60, 270], [88, 175]], np.int32)
    cv2.fillPoly(img_bad, [pts], (160, 160, 160))
    # Líneas de pliegue / abolladura brusca
    cv2.line(img_bad, (65, 140), (135, 195), (20, 20, 20), 4)
    cv2.line(img_bad, (75, 205), (140, 155), (30, 30, 30), 4)

    res_bad = classify_bottle_roi(img_bad, (0.20, 0.25, 0.60, 0.65))
    assert res_bad.status == "surface_defect"
    assert res_bad.defect_box is not None

    # 3. Botella Plástica Transparente SIN ETIQUETA (con tapa pero cuerpo transparente uniforme):
    # Jamás debe detectarse como si tuviera etiqueta; debe reportar label_misaligned y defect_box.
    img_no_label = np.full((300, 200, 3), 232, dtype=np.uint8)
    cv2.rectangle(img_no_label, (62, 48), (138, 272), (218, 220, 216), -1)
    # Tapa azul en la parte superior
    cv2.rectangle(img_no_label, (84, 18), (116, 48), (235, 115, 15), -1)
    res_no_lbl = classify_bottle_roi(img_no_label, (0.25, 0.05, 0.50, 0.88))
    assert res_no_lbl.has_cap is True
    assert res_no_lbl.has_label is False
    assert res_no_lbl.status == "label_misaligned"
    assert res_no_lbl.defect_box is not None

    # 4. Botella Cielo (tapa azul y etiqueta azul/celeste característica)
    img_cielo = np.full((300, 200, 3), 238, dtype=np.uint8)
    cv2.rectangle(img_cielo, (62, 48), (138, 272), (222, 226, 220), -1)
    cv2.rectangle(img_cielo, (84, 18), (116, 48), (230, 120, 10), -1)   # tapa azul Cielo en BGR
    cv2.rectangle(img_cielo, (63, 108), (137, 178), (225, 130, 15), -1) # etiqueta azul Cielo en BGR
    res_cielo = classify_bottle_roi(img_cielo, (0.25, 0.05, 0.50, 0.88))
    assert res_cielo.has_label is True
    assert res_cielo.brand_hint == "Botella Cielo"
    assert res_cielo.status == "conforming"


def test_seattle_stream_resolver_and_vest_colors():
    # Verificar resolución directa del link https://web.seattle.gov/Travelers/
    resolved = resolve_stream_url("https://web.seattle.gov/Travelers/")
    assert resolved.endswith(".stream/playlist.m3u8")
    assert "streamlock.net" in resolved

    # Verificar detección de chaleco Naranja
    img_orange = np.full((320, 200, 3), 75, dtype=np.uint8)
    cv2.rectangle(img_orange, (65, 10), (135, 50), (0, 215, 255), -1)  # casco amarillo
    cv2.rectangle(img_orange, (45, 75), (155, 195), (10, 115, 245), -1)  # chaleco naranja BGR
    res_orange = classify_ppe_roi(img_orange, (0.1, 0.02, 0.8, 0.9))
    assert res_orange.has_vest is True
    assert res_orange.vest_color == "Naranja"


def test_cnn_ppe_classifier_casco_y_chaleco():
    # Persona con casco amarillo (BGR: 0, 215, 255) y chaleco verde/amarillo reflectivo (BGR: 0, 235, 190)
    img_ppe = np.full((320, 200, 3), 80, dtype=np.uint8)
    # Cabeza con casco amarillo
    cv2.rectangle(img_ppe, (65, 10), (135, 65), (0, 215, 255), -1)
    # Torso con chaleco reflectivo
    cv2.rectangle(img_ppe, (45, 75), (155, 195), (0, 230, 210), -1)

    res_ok = classify_ppe_roi(img_ppe, (0.1, 0.02, 0.8, 0.9))
    assert res_ok.has_helmet is True
    assert res_ok.has_vest is True
    assert res_ok.ppe_complete is True

    # Persona sin casco ni chaleco (tonos oscuros/neutros)
    img_no_ppe = np.full((320, 200, 3), 75, dtype=np.uint8)
    res_no = classify_ppe_roi(img_no_ppe, (0.1, 0.02, 0.8, 0.9))
    assert res_no.ppe_complete is False


def test_fastapi_endpoints():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["engine"] == "REAL"

    # Crear análisis sobre imagen real codificada
    canvas = np.zeros((240, 320, 3), dtype=np.uint8)
    jpg_bytes = encode_jpeg_bytes(canvas)
    post_res = client.post(
        "/api/v1/analyses",
        data={"mode": "combined", "threshold": "0.5", "scenarioId": "quality-control"},
        files={"image": ("test.jpg", jpg_bytes, "image/jpeg")},
    )
    assert post_res.status_code == 200
    aid = post_res.json()["analysisId"]

    get_res = client.get(f"/api/v1/analyses/{aid}/results")
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "completed"

    # Endpoint de fotograma en vivo
    data_url = encode_jpeg_data_url(canvas)
    live_res = client.post(
        "/api/v1/live/frame",
        json={"scenarioId": "industrial-safety", "mode": "combined", "threshold": 0.5, "frameIndex": 1, "t": 0.5, "imageDataUrl": data_url},
    )
    assert live_res.status_code == 200
    assert live_res.json()["engine"] == "REAL"


def test_tracker_ids_unicos_por_fotograma():
    """Dos objetos del mismo fotograma que solapan el mismo track previo no deben compartir ID."""
    from app.vision.detector import SimpleByteTracker

    tr = SimpleByteTracker()
    first = tr.assign("car", (0.10, 0.10, 0.20, 0.20))
    used: set = set()
    a = tr.assign("car", (0.11, 0.10, 0.20, 0.20), exclude=used)
    used.add(a)
    b = tr.assign("car", (0.12, 0.11, 0.20, 0.20), exclude=used)
    assert a == first
    assert a != b


# ---------------------------------------------------------------------------
# Robustez de la API ante entradas inválidas (nunca debe responder 500 ni colgarse)
# ---------------------------------------------------------------------------
_rc = TestClient(app)


def test_live_frame_basura_devuelve_400():
    for bad in ["", "data:image/jpeg;base64,", "data:image/jpeg;base64,@@@no-base64@@@", "data:image/png;base64,aGVsbG8="]:
        r = _rc.post("/api/v1/live/frame", json={"scenarioId": "public-traffic", "imageDataUrl": bad})
        assert r.status_code == 400, (bad, r.status_code, r.text)
        assert "detail" in r.json()


def test_preprocess_basura_devuelve_400():
    r = _rc.post("/api/v1/preprocess", json={"imageDataUrl": "no-es-imagen"})
    assert r.status_code == 400


def test_upload_corrupto_o_vacio_queda_failed_sin_500():
    for payload in [b"", b"no soy una imagen"]:
        r = _rc.post("/api/v1/analyses", files={"image": ("x.jpg", payload, "image/jpeg")}, data={"scenarioId": "quality-control"})
        assert r.status_code == 200
        aid = r.json()["analysisId"]
        res = _rc.get(f"/api/v1/analyses/{aid}/results").json()
        assert res["status"] == "failed" and res["error"]


def test_umbral_y_modo_invalidos_se_normalizan():
    img = np.full((240, 320, 3), 120, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    import base64
    du = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()
    r = _rc.post(
        "/api/v1/live/frame",
        json={"scenarioId": "public-traffic", "imageDataUrl": du, "threshold": 7.5, "mode": "inexistente"},
    )
    assert r.status_code == 200, r.text


def test_resultado_inexistente_404():
    assert _rc.get("/api/v1/analyses/NO-EXISTE/results").status_code == 404


def test_stream_url_vacia_400():
    assert _rc.post("/api/v1/streams/capture", json={"streamUrl": "   "}).status_code == 400


# ---------------------------------------------------------------------------
# Escenario "Objetos abandonados"
# ---------------------------------------------------------------------------
from app.vision.abandoned import AbandonedObjectMonitor, person_is_near

MALETA = (0.40, 0.60, 0.10, 0.15)
PERSONA_AL_LADO = (0.36, 0.30, 0.14, 0.50)
PERSONA_LEJOS = (0.85, 0.20, 0.10, 0.40)


def test_persona_cerca_o_lejos():
    assert person_is_near(MALETA, PERSONA_AL_LADO)
    assert not person_is_near(MALETA, PERSONA_LEJOS)


def test_maleta_abandonada_tras_n_segundos_y_reinicio_si_vuelve_el_dueno():
    m = AbandonedObjectMonitor()
    s = m.update([("Maleta", 0.8, MALETA)], [PERSONA_AL_LADO], now=0)[0]
    assert s["owner_near"] and s["unattended_s"] == 0
    oid = s["oid"]
    m.update([("Maleta", 0.8, MALETA)], [PERSONA_LEJOS], now=1)  # el dueño se va
    s = m.update([("Maleta", 0.8, MALETA)], [PERSONA_LEJOS], now=12)[0]
    assert s["oid"] == oid and s["unattended_s"] >= 10  # mismo objeto, 11 s solo
    s = m.update([("Maleta", 0.8, MALETA)], [PERSONA_AL_LADO], now=13)[0]
    assert s["unattended_s"] == 0  # vuelve alguien: contador reiniciado


def test_objeto_movido_reinicia_contador():
    m = AbandonedObjectMonitor()
    m.update([("Mochila", 0.7, MALETA)], [], now=0)
    s = m.update([("Mochila", 0.7, MALETA)], [], now=8)[0]
    assert s["unattended_s"] == 8
    movida = (0.45, 0.60, 0.10, 0.15)  # alguien lo arrastra: sigue siendo el mismo objeto pero se movió
    s = m.update([("Mochila", 0.7, movida)], [], now=9)[0]
    assert s["moving"] and s["unattended_s"] == 0


def test_rama_del_escenario_genera_patron_abandonado_y_aviso_previo():
    from app.vision.detector import detector_engine

    def dets():
        return [
            {"id": "bag-x", "classId": "bag", "label": "Maleta", "confidence": 0.8, "box": {"x": 0.4, "y": 0.6, "width": 0.1, "height": 0.15}, "trackId": "O9"},
            {"id": "person-T1", "classId": "person", "label": "Persona", "confidence": 0.9, "box": {"x": 0.85, "y": 0.2, "width": 0.1, "height": 0.4}, "trackId": "T1"},
        ]

    # Imagen suelta: sin persona cerca -> patrón de objeto abandonado inmediato
    d, pats = dets(), []
    detector_engine._apply_abandoned_objects(d, [], pats, 0.5, "all", "default", True)
    assert [p["type"] for p in pats] == ["abandoned_object"]
    assert "ABANDONADO" in d[0]["label"] and d[0]["id"].startswith("bag-O")

    # En vivo: primero solo aviso (contador), sin alerta todavía
    d, pats = dets(), []
    detector_engine._apply_abandoned_objects(d, [], pats, 0.5, "all", "webcam:test-abandono", True)
    assert [p["type"] for p in pats] == ["unattended_object"]
    assert "SIN DUEÑO" in d[0]["label"]

    # Objetivo "solo maletas": una mochila no se vigila
    d, pats = dets(), []
    d[0]["label"] = "Mochila"
    detector_engine._apply_abandoned_objects(d, [], pats, 0.5, "suitcase_only", "default", True)
    assert pats == [] and "no vigilado" in d[0]["label"]


# ---------------------------------------------------------------------------
# Regresión de precisión con fotos reales (carpeta "imagenes de prueba")
# ---------------------------------------------------------------------------
import re
from pathlib import Path

import pytest

from app.vision.cnn_classifier import bottle_crease_score
from app.vision.detector import detector_engine, parse_max_occupancy, point_in_polygon, RESTRICTED_LANE_POLYGON

_IMG_DIR = Path(__file__).resolve().parents[2] / "imagenes de prueba"


def _load(name: str) -> np.ndarray:
    path = _IMG_DIR / name
    if not path.exists():
        pytest.skip(f"No está la imagen de prueba {name}")
    return cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)


def _bottle_states(img: np.ndarray) -> list:
    res = detector_engine.analyze_frame(img, "quality-control", mode="combined", threshold=0.5)
    bottles = sorted((d for d in res["detections"] if d["classId"] == "product"), key=lambda d: d["box"]["x"])
    return [re.search(r"\((SANA|MALOGRADA|SIN ETIQUETA|PARCIAL)", d["label"]).group(1) for d in bottles]


def test_fila_de_botellas_real_solo_las_aplastadas_son_malogradas():
    # Antes: las 10 cajas salían MALOGRADA (el plástico transparente deja ver el fondo y eso parecía "pliegues").
    img = _load("prueba.png")
    expected = ["SANA", "SANA", "SANA", "MALOGRADA", "SANA", "MALOGRADA", "SANA", "MALOGRADA", "SANA"]
    assert _bottle_states(img) == expected
    # Robustez: poca luz, compresión JPEG fuerte y foto espejada.
    assert _bottle_states(np.clip(img * 0.5, 0, 255).astype(np.uint8)) == expected
    jpg = cv2.imdecode(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 25])[1], cv2.IMREAD_COLOR)
    assert _bottle_states(jpg) == expected
    assert _bottle_states(cv2.flip(img, 1)) == expected[::-1]


def test_botella_sana_vs_aplastada_inclinada():
    img = _load("WhatsApp Image 2026-11-07 at 5.00.59 PM.jpeg")
    assert _bottle_states(img) == ["SANA", "MALOGRADA"]


def test_indice_de_pliegues_separa_sanas_de_aplastadas():
    img = _load("prueba.png")
    sanas = [(0.128, 0.383, 0.112, 0.484), (0.462, 0.388, 0.104, 0.486)]
    aplastadas = [(0.346, 0.391, 0.116, 0.478), (0.568, 0.390, 0.118, 0.480)]
    assert max(bottle_crease_score(img, b)[0] for b in sanas) < 0.37
    assert min(bottle_crease_score(img, b)[0] for b in aplastadas) >= 0.40


def test_pelo_rubio_no_es_casco_y_casco_amarillo_si():
    def persona(color_cabeza):
        img = np.full((320, 200, 3), 75, dtype=np.uint8)
        cv2.ellipse(img, (100, 32), (34, 24), 0, 0, 360, color_cabeza, -1)
        cv2.rectangle(img, (45, 75), (155, 195), (10, 115, 245), -1)  # chaleco naranja
        return classify_ppe_roi(img, (0.1, 0.02, 0.8, 0.9))

    assert persona((0, 215, 255)).has_helmet is True        # casco amarillo de seguridad
    assert persona((110, 185, 220)).has_helmet is False     # pelo rubio (saturación baja)


def test_aforo_configurable():
    assert parse_max_occupancy("all") == 3
    assert parse_max_occupancy("capacity:25") == 25
    assert parse_max_occupancy("capacity:abc") == 3


def test_carril_restringido_por_punto_de_contacto():
    assert point_in_polygon((0.75, 0.70), RESTRICTED_LANE_POLYGON)
    assert not point_in_polygon((0.30, 0.70), RESTRICTED_LANE_POLYGON)
