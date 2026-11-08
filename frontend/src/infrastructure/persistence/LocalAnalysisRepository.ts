// Repositorio reactivo con caché local y sincronización automática con Supabase (PostgreSQL + RLS).
import type { Alert, Analysis, AuditEvent, CameraConfig, Rule, Settings, VisionClass } from "@/core/domain/entities";
import type { AnalysisRepository } from "@/core/ports";
import { DEFAULT_CAMERAS } from "@/modules/scenarios/data/seedCatalog";
import { fetchSupabaseState, supabaseWriter } from "./SupabaseSync";

export interface RepositoryState {
  schema: 1;
  analyses: Analysis[];
  alerts: Alert[];
  rules: Rule[];
  classes: VisionClass[];
  settings: Settings;
  events: AuditEvent[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MAX_EVENTS = 300;

export class LocalAnalysisRepository implements AnalysisRepository {
  private state: RepositoryState;
  private listeners = new Set<() => void>();
  private ver = 0;

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly key: string,
    private readonly initial: () => RepositoryState,
  ) {
    this.state = this.load();
  }

  private normalizeCameras(cams?: CameraConfig[]): CameraConfig[] {
    let source = cams;
    if (!source || !Array.isArray(source) || source.length === 0) {
      try {
        const legacy = this.storage?.getItem("visionai:cameras-v1");
        if (legacy) {
          const parsed = JSON.parse(legacy) as Partial<CameraConfig>[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            source = parsed as CameraConfig[];
          }
        }
      } catch {
        /* ignore */
      }
    }
    const base = source && source.length > 0 ? source : DEFAULT_CAMERAS;
    return base.map((c, idx) => ({
      id: c.id || `cam-${idx + 1}`,
      name: c.name || `Cámara ${idx + 1}`,
      sourceKind: c.sourceKind || "public-stream",
      url: c.url ?? "",
      scenarioId: c.scenarioId || "public-traffic",
      alertTarget: c.alertTarget || "all",
      mode: c.mode || "combined",
      threshold: typeof c.threshold === "number" ? c.threshold : 0.5,
      enabled: c.enabled !== false,
      location: c.location,
      notifyMobile: c.notifyMobile !== false,
    }));
  }

  private load(): RepositoryState {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw) as RepositoryState;
        if (parsed.schema === 1) {
          parsed.settings = {
            ...parsed.settings,
            cameras: this.normalizeCameras(parsed.settings?.cameras),
          };
          return parsed;
        }
      }
    } catch {
      /* almacenamiento no disponible o corrupto: se reinicia con datos semilla */
    }
    const s = this.initial();
    s.settings = {
      ...s.settings,
      cameras: this.normalizeCameras(s.settings?.cameras),
    };
    this.persist(s);
    return s;
  }

  private persist(s: RepositoryState) {
    if (!this.storage) return;
    // localStorage admite ~5 MB y las fotos de evidencia (data URL) lo llenan rápido.
    // Si no cabe, se guarda una copia compacta: se conservan las fotos solo de los registros
    // más recientes, para que las sesiones y alertas nuevas no se pierdan al recargar.
    for (const keepImages of [Infinity, 40, 15, 0]) {
      try {
        const data = keepImages === Infinity ? s : LocalAnalysisRepository.compact(s, keepImages);
        this.storage.setItem(this.key, JSON.stringify(data));
        return;
      } catch {
        /* cuota excedida: probar con una copia más compacta */
      }
    }
    /* modo privado o almacenamiento bloqueado: la sesión sigue en memoria */
  }

  private static compact(s: RepositoryState, keepImages: number): RepositoryState {
    const strip = <T extends { snapshotUrl?: string }>(list: T[]): T[] =>
      list.map((item, i) =>
        i >= keepImages && item.snapshotUrl?.startsWith("data:") ? { ...item, snapshotUrl: undefined } : item,
      );
    return {
      ...s,
      analyses: strip(s.analyses),
      alerts: strip(s.alerts),
      events: s.events.slice(0, keepImages === 0 ? 100 : s.events.length),
    };
  }

  private commit(mut: (s: RepositoryState) => RepositoryState) {
    this.state = mut(this.state);
    this.persist(this.state);
    this.ver++;
    this.listeners.forEach((l) => l());
  }

  private upsert<T extends { id: string }>(list: T[], item: T): T[] {
    const i = list.findIndex((x) => x.id === item.id);
    if (i === -1) return [item, ...list];
    const copy = list.slice();
    copy[i] = item;
    return copy;
  }

  listAnalyses = () => this.state.analyses;
  getAnalysis = (id: string) => this.state.analyses.find((a) => a.id === id);
  saveAnalysis = (a: Analysis) => {
    this.commit((s) => ({ ...s, analyses: this.upsert(s.analyses, a) }));
    void supabaseWriter.saveAnalysis(a);
  };

  listAlerts = () => this.state.alerts;
  saveAlert = (a: Alert) => {
    this.commit((s) => ({ ...s, alerts: this.upsert(s.alerts, a) }));
    void supabaseWriter.saveAlert(a);
  };

  listRules = () => this.state.rules;
  saveRule = (r: Rule) => {
    this.commit((s) => ({ ...s, rules: this.upsert(s.rules, r) }));
    void supabaseWriter.saveRule(r);
  };
  deleteRule = (id: string) => {
    this.commit((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }));
    void supabaseWriter.deleteRule(id);
  };

  listClasses = () => this.state.classes;
  saveClass = (c: VisionClass) => {
    this.commit((s) => ({ ...s, classes: this.upsert(s.classes, c) }));
    void supabaseWriter.saveClass(c);
  };

  getSettings = () => this.state.settings;
  saveSettings = (st: Settings) => {
    const normalized: Settings = {
      ...st,
      cameras: this.normalizeCameras(st.cameras ?? this.state.settings.cameras),
    };
    this.commit((s) => ({ ...s, settings: normalized }));
    void supabaseWriter.saveSettings(normalized);
  };

  listCameras = (): CameraConfig[] => this.normalizeCameras(this.state.settings.cameras);

  saveCameras = (cams: CameraConfig[]) => {
    const normalized = this.normalizeCameras(cams);
    try {
      this.storage?.setItem("visionai:cameras-v1", JSON.stringify(normalized));
    } catch {
      /* ignore */
    }
    this.saveSettings({ ...this.state.settings, cameras: normalized });
  };

  saveCamera = (cam: CameraConfig) => {
    const current = this.listCameras();
    const next = this.upsert(current, cam);
    this.saveCameras(next);
  };

  deleteCamera = (id: string) => {
    const current = this.listCameras();
    if (current.length <= 1) return;
    this.saveCameras(current.filter((c) => c.id !== id));
  };

  toggleCamera = (id: string, enabled?: boolean) => {
    const current = this.listCameras();
    const next = current.map((c) => (c.id === id ? { ...c, enabled: enabled ?? !c.enabled } : c));
    this.saveCameras(next);
  };

  listEvents = () => this.state.events;
  addEvent = (e: AuditEvent) => {
    this.commit((s) => ({ ...s, events: [e, ...s.events].slice(0, MAX_EVENTS) }));
    void supabaseWriter.addEvent(e);
  };

  /** Carga tablas protegidas por RLS desde Supabase tras autenticar la sesión. */
  syncFromRemote = async () => {
    try {
      const remote = await fetchSupabaseState(this.state);
      if (remote) {
        this.commit((s) => ({ ...s, ...remote }));
      }
    } catch {
      /* si no hay red o Supabase no está configurado aún, continúa con caché local */
    }
  };

  reset = () => {
    const preservedCameras = this.listCameras();
    const preservedSettings = this.state.settings;
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignorado */
    }
    this.commit(() => {
      const fresh = this.initial();
      return {
        ...fresh,
        settings: {
          ...fresh.settings,
          ...preservedSettings,
          cameras: preservedCameras,
        },
      };
    });
    void supabaseWriter.clearHistory();
  };

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  version = () => this.ver;
}
