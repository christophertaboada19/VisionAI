# VISION AI — Plataforma inteligente de análisis visual

Prototipo funcional (v1.0) de detección de objetos, segmentación y reconocimiento de patrones.
Implementa la especificación `visionIA.md`. La **inferencia es simulada**: el modo DEMO se indica
siempre en la cabecera, el historial y los CSV.

## Cómo ejecutarlo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 22 pruebas unitarias y de integración
npm run build      # compilación de producción en dist/
```

Inicie sesión eligiendo un perfil demostrativo: Administrador, Operador, Supervisor o Auditor.

## Qué incluye

- **Dashboard**: KPI calculados desde los análisis guardados (análisis, objetos, alertas abiertas,
  confianza media, tiempo), actividad por día, distribución por clase, alertas y análisis recientes.
  Rango de 7, 14 o 30 días y vista de tabla.
- **Análisis visual**: escena semilla o imagen JPG/PNG (se validan MIME, extensión, firma y tamaño),
  perfil (detección, segmentación, patrones o combinado), umbral, reglas por análisis, progreso por
  etapas y botón bloqueado contra el doble envío. Estados: vacío, preparado, procesando, completado,
  advertencia y error con reintento.
- **Escenarios 3D** (Three.js): planta industrial, almacén, línea de envasado y tienda, con luces,
  sombras, materiales PBR y personas articuladas que caminan. Las cajas y máscaras se obtienen
  **proyectando los objetos 3D con la misma cámara** que dibuja la escena, igual que un detector
  vería ese video. Por eso quedan calibradas aunque haya perspectiva y movimiento.
- **Monitoreo en vivo** (Análisis visual › Monitoreo en vivo): la cámara 3D transmite **siempre**,
  y la escena se mueve desde que se abre la página. Al pulsar «Iniciar análisis», la IA simulada
  analiza el video en curso a unos 15 fps, fotograma a fotograma.
  - Los objetos se mueven y tienen seguimiento con un ID estable por track.
  - Los indicadores se actualizan en tiempo real: objetos en escena, objetos rastreados, FPS, latencia
    simulada y eventos únicos.
  - Las reglas usan antirrebote: la condición debe mantenerse 1,5 s antes de alertar. También usan
    enfriamiento: la misma regla no vuelve a alertar sobre el mismo objeto antes de 30 s.
  - Las alertas se generan en vivo y guardan el instante `t` del fotograma.
  - Controles: pausa, velocidad 1×, 2× o 4×, y pausa automática si la pestaña queda oculta.
  - La sesión dura como máximo 5 minutos y no se graba video.
  - Al detener, la sesión queda en el historial. Desde ahí se puede **reproducir cualquier instante**:
    el motor demo es determinista, así que el fotograma de evidencia se reconstruye exacto.
  - Por escenario:
    - Seguridad industrial: operarios caminando, uno sin EPP y otro que cruza la planta.
    - Almacén inteligente: el montacargas entra en la zona restringida.
    - Control de calidad: faja continua, y cada envase se inspecciona bajo la cámara.
    - Retail: clientes que entran y salen, así que la ocupación sube y baja.
- **Visor**: cajas, etiquetas, máscaras (semántica e instancia), zonas y leyenda por clase, en
  coordenadas normalizadas 0–1 que se adaptan al tamaño. Las detecciones de baja confianza se ven
  punteadas y nunca se borran.
- **Preprocesamiento clásico real** (sesión 04), calculado de verdad en el navegador: escala de grises
  `Y = 0.299R + 0.587G + 0.114B`, desenfoque gaussiano 3×3, bordes con Sobel y binarización.
- **Panel lateral**: pestañas Resultado, Detecciones, Máscaras y Patrones, con evidencia, alertas y
  observaciones del revisor.
- **Patrones y reglas**: de patrón del motor, de conteo por clase y de objeto en zona (punto en
  polígono). Se crean, editan, activan y eliminan desde Administración.
- **Alertas**: severidad, regla, evidencia y responsable. Ciclo nueva → revisada → cerrada según el
  rol, con nota y auditoría.
- **Historial**: búsqueda y filtros por escenario, clase, estado, perfil, fechas, confianza y alertas,
  vista de detalle y exportación CSV. Persiste al recargar mediante localStorage.
- **Exportaciones**: CSV de detecciones, análisis y alertas en UTF-8 con BOM, protegidos contra
  inyección de fórmulas.
- **Administración**: escenarios, clases (con color fijo por clase), reglas, usuarios con matriz de
  permisos, y configuración: umbral por defecto, modo aleatorio, simular fallo y restablecer datos demo.
- **Registro de eventos** y notificaciones dentro de la app.
- Diseño responsive, navegación por teclado, estados que no dependen solo del color y respeto de
  `prefers-reduced-motion`.

## Arquitectura

```
src/
  app/            router (rutas + protección por rol), providers (sesión, toasts, contenedor DI), layout
  core/
    domain/       entidades, reglas puras (umbral, IoU, NMS, punto en polígono, reglas, KPI), permisos
    application/  casos de uso: AnalyzeImage, ManageAlerts, ManageRules, searchHistory, validación
    ports/        VisionEngine, AnalysisRepository, ScenarioCatalog
    contracts/    DTO: AnalysisInput, VisionResult, progreso
  infrastructure/
    vision/       DemoVisionAdapter (simulado, determinista) · ApiVisionAdapter (fase 2)
    persistence/  LocalAnalysisRepository (localStorage)
    export/       CSV
  modules/        dashboard, analysis, vision, patterns, alerts, history, scenarios, settings, auth
  shared/         ui, hooks
  tests/unit/
server/           contrato de la API real (fase 2)
```

El modo en vivo usa dos puertos:

- `VisionStreamEngine`: analiza cada fotograma. Hoy lo implementa `DemoVisionStreamAdapter`, que
  imita la salida de un detector **YOLO** (clase, confianza, caja normalizada y máscara) más un
  rastreador tipo **ByteTrack** (`trackId`).
- `CameraFeed`: entrega la imagen de cada fotograma. Hoy es la escena animada de `DemoCameraFeed`.

En la fase 2, el servidor (Python + OpenCV + YOLO) procesaría el video de la cámara. Un adaptador
WebSocket/SSE implementaría `VisionStreamEngine` y la interfaz no cambiaría.

La interfaz solo depende del contrato `VisionEngine`. Para usar un modelo real se configura
`VITE_VISION_MODE=api` (ver `.env.example` y `server/README.md`), sin cambiar la UI.

Las escenas demo se dibujan como SVG desde la **misma geometría** que genera los resultados semilla,
así que las cajas y máscaras quedan calibradas por construcción. La misma entrada produce el mismo
resultado, salvo que se active el modo aleatorio.

## Guion de demostración (sección 15)

1. Dashboard: volumen de análisis, detecciones y alertas recientes.
2. Análisis visual → **Seguridad industrial** → perfil **Combinado** → **Analizar** (progreso animado).
3. Comparar la caja (detección) con la máscara de píxeles (segmentación) usando los interruptores
   Cajas y Máscaras.
4. Pestaña Patrones: «EPP incompleto», su confianza y la evidencia. Al pasar el cursor se resalta la
   persona en el visor.
5. Revisar la alerta (nota → «Marcar revisada»). Iniciar sesión como Supervisor para cerrarla y ver
   la trazabilidad en Actividad.
6. Historial: filtrar por escenario y exportar el CSV.
7. Cerrar explicando que `DemoVisionAdapter` se reemplaza por `ApiVisionAdapter` mediante `VisionEngine`.

Para demostrar el estado de error: Administración › Configuración › «Simular fallo en el próximo análisis».

## Límites

Los datos e inferencias son simulados y no representan la precisión de un modelo entrenado. La
confianza es una estimación, no una certeza: las decisiones críticas requieren revisión humana. Fuera
de alcance: reconocimiento facial o biométrico, vigilancia 24/7 y decisiones automáticas sin supervisión.
