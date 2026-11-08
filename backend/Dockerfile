# =============================================================================
# VISION AI — Backend (FastAPI + OpenCV + YOLOv8n ONNX) para Render (plan gratuito)
# Imagen liviana: sin PyTorch. RAM típica en reposo ~200 MB (límite gratis: 512 MB).
# =============================================================================
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VISION_ENGINE=onnx \
    VISION_THREADS=1 \
    VISION_MAX_IMGSZ=640 \
    OMP_NUM_THREADS=1 \
    PORT=8000

# Librerías del sistema que necesitan OpenCV (headless) y ONNX Runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-prod.txt .
RUN pip install -r requirements-prod.txt

COPY app ./app
COPY yolov8n.onnx ./yolov8n.onnx

# Usuario sin privilegios
RUN useradd --create-home --uid 10001 vision && chown -R vision /app
USER vision

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health',timeout=4)"

# Render inyecta $PORT. Un solo proceso: el plan gratuito tiene 0.1 vCPU.
CMD ["sh", "-c", "uvicorn app.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
