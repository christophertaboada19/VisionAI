import { useState } from "react";
import { useTheme, type ThemeChoice } from "@/app/providers/theme";
import { fetchWithTimeout, readApiError } from "@/infrastructure/http";
import { Bell, BellOff, Camera, Monitor, Moon, Palette, Sun, Cpu, Plus, Power, RotateCcw, Save, Send, SlidersHorizontal, Smartphone, Trash2 } from "lucide-react";
import { API_BASE_URL, repository, visionEngine } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { saveSettings } from "@/core/application/operations";
import type { CameraConfig, CameraSourceKind } from "@/core/domain/entities";
import { useCameras, useSettings } from "@/shared/hooks/useRepository";
import { ALERT_TARGET_OPTIONS, DEFAULT_CAMERAS } from "@/modules/scenarios/data/seedCatalog";
import { CapacityInput } from "@/modules/scenarios/components/CapacityInput";
import { SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Button, Card, CardHeader, cx, Field, Input, Notice, PageHeader, Select, Toggle } from "@/shared/ui";

export function SettingsPage() {
  const user = useUser();
  const toast = useToast();
  const current = useSettings();
  const cameras = useCameras();
  const [s, setS] = useState(current);
  const [testingMobile, setTestingMobile] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(current);

  const handleUpdateCamera = (id: string, patch: Partial<CameraConfig>) => {
    const target = cameras.find((c) => c.id === id);
    if (!target) return;
    const updated: CameraConfig = { ...target, ...patch };
    repository.saveCamera(updated);
    setS((prev) => ({ ...prev, cameras: repository.listCameras() }));
  };

  const handleAddCameraInSettings = () => {
    const idx = cameras.length + 1;
    const created: CameraConfig = {
      id: `cam-${Date.now().toString(36)}`,
      name: `Cámara ${idx} · Seattle DOT HD`,
      sourceKind: "public-stream",
      url: "https://61e0c5d388c2e.streamlock.net:443/live/41_SW_Admiral.stream/playlist.m3u8",
      scenarioId: "public-traffic",
      alertTarget: "all",
      mode: "combined",
      threshold: 0.5,
      enabled: true,
      location: "Seattle Travelers HD",
    };
    repository.saveCamera(created);
    setS((prev) => ({ ...prev, cameras: repository.listCameras() }));
    toast({ kind: "success", title: "Nueva cámara registrada", description: `${created.name} añadida y guardada.` });
  };

  const handleRestoreDefaultCameras = () => {
    repository.saveCameras(DEFAULT_CAMERAS);
    setS((prev) => ({ ...prev, cameras: repository.listCameras() }));
    toast({ kind: "info", title: "Catálogo de cámaras restaurado", description: "Se restauraron las 5 cámaras por defecto." });
  };

  const save = () => {
    try {
      saveSettings(repository, s, user);
      toast({ kind: "success", title: "Configuración guardada" });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo guardar", description: (e as Error).message });
    }
  };

  const sendTestMobileAlert = async () => {
    const topic = (s.ntfyTopic ?? "").trim();
    const token = (s.telegramBotToken ?? "").trim();
    const chatId = (s.telegramChatId ?? "").trim();
    setTestingMobile(true);
    setTestResult(null);
    try {
      if (dirty) {
        saveSettings(repository, { ...s, notificationsEnabled: true }, user);
        setS((prev) => ({ ...prev, notificationsEnabled: true }));
      }
      const resp = await fetchWithTimeout(`${API_BASE_URL}/api/v1/notifications/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Prueba de Alerta Móvil — VISION AI",
          message: "Operario T3 (sector derecho) SIN CASCO NI CHALECO / Botella B2 (MALOGRADA)",
          severity: "critical",
          scenarioName: "Prueba de Conexión Móvil en Tiempo Real",
          evidence: "Notificación de prueba enviada desde VISION AI a su celular.",
          telegramBotToken: token || undefined,
          telegramChatId: chatId || undefined,
          ntfyTopic: topic || undefined,
        }),
      }, 25_000);
      if (!resp.ok) throw await readApiError(resp, "Backend de notificaciones");
      const data = await resp.json();
      const ch = data.channels ?? {};
      const summary = `ntfy.sh: ${ch.ntfy ?? "—"} · Telegram: ${ch.telegram ?? "—"}`;
      setTestResult(summary);
      const anyOk = ch.ntfy === "ok" || ch.telegram === "ok";
      const allSkipped = ch.ntfy === "skipped" && ch.telegram === "skipped";
      toast({
        kind: anyOk ? "success" : "warning",
        title: anyOk
          ? "Alerta de prueba enviada a su celular"
          : allSkipped
            ? "No hay canal móvil configurado (Telegram o ntfy)"
            : "El backend respondió, pero ningún canal entregó la alerta",
        description: summary,
      });
    } catch (e) {
      toast({
        kind: "error",
        title: "No se pudo enviar la alerta de prueba",
        description: (e as Error).message,
      });
    } finally {
      setTestingMobile(false);
    }
  };

  return (
    <>
      <PageHeader title="Configuración" description="Parámetros por defecto del análisis, alertas móviles en tiempo real y opciones del motor." actions={<Button variant="primary" icon={Save} onClick={save} disabled={!dirty}>Guardar cambios</Button>} />
      <AppearanceCard />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Análisis" icon={SlidersHorizontal} />
          <div className="space-y-5 p-5">
            <Field label={`Umbral de confianza por defecto · ${(s.defaultThreshold * 100).toFixed(0)} %`} htmlFor="dt" hint="Valor inicial en Nuevo análisis. Las detecciones inferiores se marcan como baja confianza, sin borrarse.">
              <input id="dt" type="range" min={0.1} max={0.95} step={0.05} value={s.defaultThreshold} onChange={(e) => setS({ ...s, defaultThreshold: +e.target.value })} className="accent-[var(--accent)]" />
            </Field>
            <Field label="Tamaño máximo de imagen (MB)" htmlFor="mx">
              <Input id="mx" type="number" min={1} max={20} value={s.maxUploadMb} onChange={(e) => setS({ ...s, maxUploadMb: Math.min(20, Math.max(1, +e.target.value || 1)) })} className="w-28" />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Motor de visión" icon={Cpu} />
          <div className="space-y-4 p-5">
            <p className="text-sm">Motor activo: <strong>{visionEngine.kind === "DEMO" ? "DemoVisionAdapter (simulado)" : "ApiVisionAdapter (servicio real)"}</strong></p>
            <p className="text-xs text-[var(--ink-3)]">Para conectar la IA real, configure <code>VITE_VISION_MODE=api</code> y <code>VITE_VISION_API_URL</code>. La interfaz no cambia: ambos implementan el contrato <code>VisionEngine</code>.</p>
            <label className="flex items-start gap-3">
              <Toggle checked={s.randomDemo} onChange={(v) => setS({ ...s, randomDemo: v })} label="Modo aleatorio de demostración" />
              <span className="text-sm"><span className="font-medium">Modo aleatorio de demostración</span><span className="block text-xs text-[var(--ink-3)]">Varía levemente la confianza (±4 %). Desactivado: la misma entrada produce el mismo resultado.</span></span>
            </label>
            <label className="flex items-start gap-3">
              <Toggle checked={s.simulateNextFailure} onChange={(v) => setS({ ...s, simulateNextFailure: v })} label="Simular fallo en el próximo análisis" />
              <span className="text-sm"><span className="font-medium">Simular fallo en el próximo análisis</span><span className="block text-xs text-[var(--ink-3)]">Para demostrar el estado de error, el mensaje y el reintento. Se desactiva solo tras usarse.</span></span>
            </label>
          </div>
        </Card>

        {/* Fase 5: Notificaciones Móviles en Tiempo Real */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Notificaciones móviles en tiempo real al celular (Telegram Bot + ntfy.sh)"
            subtitle="Reciba automáticamente en su teléfono cada alerta detectada en análisis de imágenes o cámaras en vivo con el sujeto infractor y la captura anotada por OpenCV."
            icon={Smartphone}
          />
          <div className="space-y-5 p-5">
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <Toggle
                checked={!!s.notificationsEnabled}
                onChange={(v) => setS({ ...s, notificationsEnabled: v })}
                label="Activar envío automático de alertas al celular"
              />
              <span className="text-sm">
                <span className="font-semibold text-[var(--ink)]">Activar envío automático de alertas al celular</span>
                <span className="block text-xs text-[var(--ink-3)]">
                  Cuando se dispare cualquier regla (persona sin casco/chaleco, botella malograda, aforo excedido o carril restringido), el backend FastAPI enviará la alerta al instante a su teléfono.
                </span>
              </span>
            </label>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold">Opción A (Inmediata en 10 s, sin cuenta): Push con ntfy.sh</h3>
                </div>
                <Field
                  label="Nombre de su tópico ntfy.sh"
                  htmlFor="ntfy-topic"
                  hint="1) Instale la app gratuita 'ntfy' en Android/iOS (o abra https://ntfy.sh en su navegador móvil) · 2) Suscríbase a un nombre único (ej. vision-ai-alertas-2026) y escríbalo aquí."
                >
                  <Input
                    id="ntfy-topic"
                    value={s.ntfyTopic ?? ""}
                    onChange={(e) => setS({ ...s, ntfyTopic: e.target.value })}
                    placeholder="Ej. vision-ai-alertas-2026"
                  />
                </Field>
              </div>

              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold">Opción B (Con foto anotada por OpenCV): Telegram Bot</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Telegram Bot Token"
                    htmlFor="tg-token"
                    hint="Token entregado por @BotFather"
                  >
                    <Input
                      id="tg-token"
                      type="password"
                      value={s.telegramBotToken ?? ""}
                      onChange={(e) => setS({ ...s, telegramBotToken: e.target.value })}
                      placeholder="123456789:AAH..."
                    />
                  </Field>
                  <Field
                    label="Telegram Chat ID"
                    htmlFor="tg-chat"
                    hint="Su ID numérico (vía @userinfobot)"
                  >
                    <Input
                      id="tg-chat"
                      value={s.telegramChatId ?? ""}
                      onChange={(e) => setS({ ...s, telegramChatId: e.target.value })}
                      placeholder="Ej. 987654321"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
              <div className="text-xs text-[var(--ink-3)]">
                {testResult ? (
                  <span className="font-semibold text-[var(--good)]">Último envío: {testResult}</span>
                ) : (
                  <span>Puede usar ntfy.sh, Telegram o ambos canales al mismo tiempo.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={Send} onClick={sendTestMobileAlert} disabled={testingMobile}>
                  {testingMobile ? "Enviando al celular..." : "Enviar alerta de prueba a mi celular"}
                </Button>
                <Button variant="primary" icon={Save} onClick={save} disabled={!dirty}>
                  Guardar configuración móvil
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Gestión Central de Cámaras del Sistema y Objetivos por Escenario */}
        <Card className="xl:col-span-2">
          <CardHeader
            title={`Gestión Central de Cámaras y Escenarios (${cameras.filter((c) => c.enabled).length} activas de ${cameras.length})`}
            subtitle="Toda modificación en el nombre, stream, tipo de escenario, objetivo de alerta o estado (Activa / Desactivada) se guarda automáticamente y se refleja en Dashboard, Monitoreo en Vivo, Historial y Alertas."
            icon={Camera}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={handleRestoreDefaultCameras}>
                  Restaurar cámaras base
                </Button>
                <Button size="sm" variant="primary" icon={Plus} onClick={handleAddCameraInSettings}>
                  Añadir cámara
                </Button>
              </div>
            }
          />
          <div className="divide-y divide-[var(--border)]">
            {cameras.map((cam) => (
              <div
                key={cam.id}
                className={cx("space-y-3 p-4 transition-colors", !cam.enabled && "bg-slate-50/80")}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <Field label="Nombre de la cámara">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx("h-2.5 w-2.5 shrink-0 rounded-full", cam.enabled ? "bg-emerald-500" : "bg-slate-400")}
                          title={cam.enabled ? "Activa" : "Desactivada"}
                          aria-hidden
                        />
                        <Input
                          value={cam.name}
                          onChange={(e) => handleUpdateCamera(cam.id, { name: e.target.value })}
                          placeholder="Nombre de cámara"
                          className="w-full"
                        />
                      </div>
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateCamera(cam.id, { notifyMobile: cam.notifyMobile === false })}
                      className={cx(
                        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                        cam.notifyMobile === false
                          ? "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                          : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
                      )}
                      title="Enviar o no las alertas de esta cámara al celular"
                    >
                      {cam.notifyMobile === false ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                      {cam.notifyMobile === false ? "Celular: silenciado" : "Celular: avisos activos"}
                    </button>
                    <Button
                      size="sm"
                      variant={cam.enabled ? "secondary" : "primary"}
                      icon={Power}
                      onClick={() => {
                        repository.toggleCamera(cam.id);
                        setS((prev) => ({ ...prev, cameras: repository.listCameras() }));
                        toast({
                          kind: cam.enabled ? "warning" : "success",
                          title: cam.enabled ? `${cam.name} desactivada` : `${cam.name} activada`,
                        });
                      }}
                    >
                      {cam.enabled ? "Desactivar" : "Activar"}
                    </Button>
                    {cameras.length > 1 && (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => {
                          repository.deleteCamera(cam.id);
                          setS((prev) => ({ ...prev, cameras: repository.listCameras() }));
                          toast({ kind: "info", title: "Cámara eliminada" });
                        }}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Tipo de fuente">
                    <Select
                      value={cam.sourceKind}
                      onChange={(e) => {
                        const sk = e.target.value as CameraSourceKind;
                        handleUpdateCamera(cam.id, {
                          sourceKind: sk,
                          url:
                            sk === "webcam"
                              ? ""
                              : sk === "mobile-ip"
                                ? "http://192.168.1.40:8080/video"
                                : cam.url || "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Barton_EW.stream/playlist.m3u8",
                        });
                      }}
                      className="w-full"
                    >
                      <option value="public-stream">Pública en Vivo (HLS / Seattle)</option>
                      <option value="webcam">Cámara Web (PC / Local)</option>
                      <option value="mobile-ip">Celular (IP Webcam)</option>
                    </Select>
                  </Field>
                  <Field label="Tipo de escenario">
                    <Select
                      value={cam.scenarioId}
                      onChange={(e) => {
                        const nextSc = e.target.value;
                        const defaultTarget = ALERT_TARGET_OPTIONS[nextSc]?.[0]?.value ?? "all";
                        handleUpdateCamera(cam.id, { scenarioId: nextSc, alertTarget: defaultTarget });
                      }}
                      className="w-full"
                    >
                      {SCENARIOS.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={cam.scenarioId === "retail-store" ? "Aforo máximo de la sala" : "Qué detectar como alerta"} htmlFor={`cap-${cam.id}`}>
                    {cam.scenarioId === "retail-store" ? (
                      <CapacityInput id={`cap-${cam.id}`} target={cam.alertTarget} onChange={(t) => handleUpdateCamera(cam.id, { alertTarget: t })} />
                    ) : (
                    <Select
                      value={cam.alertTarget}
                      onChange={(e) => handleUpdateCamera(cam.id, { alertTarget: e.target.value })}
                      className="w-full"
                    >
                      {(ALERT_TARGET_OPTIONS[cam.scenarioId] ?? ALERT_TARGET_OPTIONS["public-traffic"]).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                    )}
                  </Field>
                </div>

                <Field label={cam.sourceKind === "webcam" ? "Dispositivo local" : "URL del stream (.m3u8 / Seattle / IP Webcam)"}>
                  <Input
                    value={cam.sourceKind === "webcam" ? "Cámara web del navegador (se elige en Monitoreo por cámara)" : cam.url}
                    disabled={cam.sourceKind === "webcam"}
                    onChange={(e) => handleUpdateCamera(cam.id, { url: e.target.value })}
                    placeholder="https://web.seattle.gov/Travelers/ o .m3u8"
                    className="w-full font-mono text-xs"
                  />
                </Field>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Limpieza de historial y advertencias" icon={RotateCcw} />
          <div className="flex flex-wrap items-center gap-4 p-5">
            <div className="flex-1"><Notice tone="warning">Limpiar registros borra todo el historial de análisis, advertencias, alertas y bitácora (tanto en caché local como en Supabase), dejando el sistema en cero listo para nuevas pruebas reales.</Notice></div>
            <Button variant="danger" icon={RotateCcw} onClick={() => { if (window.confirm("¿Eliminar todos los registros de historial, advertencias y alertas para dejar el sistema limpio?")) { repository.reset(); setS(repository.getSettings()); toast({ kind: "info", title: "Historial y alertas eliminados (0 registros)" }); } }}>Limpiar historial y alertas</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Apariencia: tema claro, oscuro o según el sistema (celular/PC). Se guarda en este navegador. */
function AppearanceCard() {
  const [choice, resolved, setTheme] = useTheme();
  const opts: { value: ThemeChoice; label: string; hint: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", hint: "Fondo claro", icon: Sun },
    { value: "dark", label: "Oscuro", hint: "Ideal de noche o en salas de monitoreo", icon: Moon },
    { value: "system", label: "Según el sistema", hint: `Sigue el modo del dispositivo (ahora: ${resolved === "dark" ? "oscuro" : "claro"})`, icon: Monitor },
  ];
  return (
    <Card className="mb-4">
      <CardHeader title="Apariencia" subtitle="Cambia los colores de toda la página. También puede usar el botón sol/luna de la barra superior." icon={Palette} />
      <div className="grid gap-3 p-4 sm:grid-cols-3" role="radiogroup" aria-label="Tema de la página">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={choice === o.value}
            onClick={() => setTheme(o.value)}
            className={cx(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              choice === o.value ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]",
            )}
          >
            <o.icon className={cx("mt-0.5 h-5 w-5 shrink-0", choice === o.value ? "text-[var(--accent-ink)]" : "text-[var(--ink-3)]")} />
            <span>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-[var(--ink-3)]">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
