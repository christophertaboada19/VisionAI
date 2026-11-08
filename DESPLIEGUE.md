# Despliegue de VISION AI (planes gratuitos)

| Parte | Servicio | Qué se despliega |
|---|---|---|
| Base de datos y usuarios | **Supabase** (Free) | PostgreSQL + Auth + RLS (ya creado) |
| Backend de IA | **Render** (Free, con **Docker**) | `backend/` → FastAPI + OpenCV + YOLOv8n (ONNX) |
| Frontend | **Vercel** (Hobby) | `frontend/` → React + Vite |

Repositorio: https://github.com/christophertaboada19/VisionAI

> **Orden recomendado:** 1) Supabase → 2) Render (backend) → 3) Vercel (frontend) → 4) volver a Render y Supabase para poner la URL de Vercel.

---

## 1. Supabase (base de datos)

Ya está creado. Solo verifique:

1. **SQL Editor**: haber ejecutado `backend/supabase/migracion_usuarios.sql` (usuarios solo por invitación del administrador).
2. Tenga a mano (Project Settings → **API**):
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public key** (es pública por diseño; la protección real son las políticas RLS).
   - ⚠️ **Nunca** use la `service_role key` en el frontend ni la suba a GitHub.

El paso 4 completa la configuración de Supabase con la URL de Vercel.

---

## 2. Render (backend con Docker)

**Opción A — Blueprint (recomendada, usa `render.yaml`)**
1. https://dashboard.render.com → **New** → **Blueprint** → conecte GitHub y elija `VisionAI`.
2. Render detecta `render.yaml` y crea `vision-ai-backend` (Docker, plan **Free**).
3. Cuando pida las variables marcadas como secretas:
   - `ALLOWED_ORIGINS` → déjela vacía por ahora (se completa en el paso 4).
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NTFY_TOPIC` → opcionales (alertas al celular).
   - `SUPABASE_URL`, `ALLOWED_ORIGIN_REGEX` → opcionales, puede dejarlas vacías.
4. **Apply**. La primera construcción tarda ~5–8 min.

**Opción B — Manual:** New → **Web Service** → repo `VisionAI` → Language **Docker**, Root Directory `backend`, Instance Type **Free**, Health Check Path `/health`, y las mismas variables.

**Comprobar:** abra `https://vision-ai-backend.onrender.com/health` (use su URL real) → debe responder `{"status":"ok", ...}`.

**Límites del plan gratuito (importante):**
- 512 MB de RAM y 0.1 vCPU → por eso el backend usa **YOLOv8n en ONNX** (sin PyTorch): ~70 MB en reposo y ~150 MB analizando.
- Se **duerme tras 15 min sin uso** y tarda ~50 s en despertar. La app muestra *"Activando el servidor de IA…"* mientras tanto.
- Cada análisis tarda más que en su PC (CPU compartida). El monitoreo en vivo se adapta solo (analiza menos fotogramas por segundo).
- Opcional para evitar que se duerma: un monitor gratuito (p. ej. UptimeRobot) que visite `/health` cada 10 min. 750 h gratis/mes alcanzan para 1 servicio encendido todo el mes.

---

## 3. Vercel (frontend)

1. https://vercel.com/new → importe el repositorio `VisionAI`.
2. **Root Directory**: `frontend` (botón *Edit*). Framework: **Vite** (se detecta solo; `vercel.json` ya trae build y rutas).
3. **Environment Variables** (Production y Preview):

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL de Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon public key de Supabase |
   | `VITE_VISION_MODE` | `api` |
   | `VITE_VISION_API_URL` | URL de Render, sin `/` final (ej. `https://vision-ai-backend.onrender.com`) |

4. **Deploy**. Obtendrá una URL como `https://visionai.vercel.app`.

> Las variables `VITE_*` se incrustan al **compilar**: si las cambia, haga *Redeploy*.

---

## 4. Conectar las tres partes

1. **Render** → su servicio → **Environment** → `ALLOWED_ORIGINS` = URL de Vercel **sin** `/` final (ej. `https://visionai.vercel.app`; varias separadas por comas) → *Save* (redespliega solo).
2. **Supabase** → Authentication → **URL Configuration**:
   - **Site URL**: la URL de Vercel.
   - **Redirect URLs**: agregue `https://visionai.vercel.app/**` (y `http://localhost:5173/**` para desarrollo).
3. Abra la URL de Vercel, inicie sesión con su administrador y pruebe un análisis.

---

## 5. Desarrollo local (sin cambios)

```bash
# Backend (con Ultralytics + PyTorch)
cd backend && pip install -r requirements.txt && python -m uvicorn app.api.main:app --port 8000
# Frontend
cd frontend && npm install && npm run dev            # http://localhost:5173
npm run dev:celular                                  # HTTPS en la red local (cámara del celular)
```

Probar la imagen Docker localmente (requiere Docker Desktop):
```bash
cd backend
docker build -t vision-ai-backend .
docker run --rm -p 8000:8000 -e ALLOWED_ORIGINS=http://localhost:5173 vision-ai-backend
```

---

## 6. Archivos de despliegue

| Archivo | Para qué sirve |
|---|---|
| `render.yaml` | Blueprint de Render (servicio Docker gratuito) |
| `backend/Dockerfile` | Imagen liviana: Python 3.12 + OpenCV headless + ONNX Runtime |
| `backend/requirements-prod.txt` | Dependencias de producción (sin PyTorch) |
| `backend/yolov8n.onnx` | Modelo YOLOv8n exportado a ONNX (mismos resultados que `.pt`) |
| `frontend/vercel.json` | Build, rutas SPA, caché y cabeceras de seguridad |
| `.gitignore` | Impide subir `.env` y otros secretos |
