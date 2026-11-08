# server/ — Fase 2: servicio real de visión (fuera del alcance de la v1)

La interfaz ya está preparada. Para conectar un modelo real basta con implementar este contrato
(lo consume `src/infrastructure/vision/ApiVisionAdapter.ts`) y arrancar la app con:

```
VITE_VISION_MODE=api
VITE_VISION_API_URL=http://localhost:8000
```

## Endpoints esperados

| Método / ruta | Entrada | Salida |
|---|---|---|
| `POST /api/v1/analyses` | multipart: `image`, `mode`, `threshold`, `scenarioId` | `{ analysisId, status }` |
| `GET /api/v1/analyses/{id}/results` | — | `{ analysisId, status, detections, masks, patterns, durationMs, error? }` |
| `GET /api/v1/analyses` | filtros, paginación | historial paginado |
| `PATCH /api/v1/alerts/{id}` | `status`, `note` | alerta actualizada |
| `GET /api/v1/dashboard` | rango de fechas | KPI y series |

Las coordenadas deben devolverse **normalizadas 0–1** (`box.x, box.y, box.width, box.height`;
máscaras como `polygon: [[x, y], …]`) y la confianza en 0–1, igual que en `src/core/domain/entities.ts`.

## Estructura sugerida (Python + FastAPI + OpenCV)

```
server/
  api/            # FastAPI: rutas, validación (MIME, tamaño), autenticación y roles
  vision/
    preprocessing/  # cv2: cvtColor → GaussianBlur → resize/ROI (sesión 04)
    detection/      # detector validado (p. ej. YOLO) + umbral + NMS
    segmentation/   # segmentador de instancias/semántico → polígonos normalizados
    patterns/       # reglas temporales / clasificadores
  tests/
```

Criterio de salida de la fase 2: métricas (precisión, recall, IoU, mAP, latencia) medidas sobre
un dataset etiquetado y representativo, y despliegue controlado.
