// Reproducción FLUIDA de cámaras en vivo directamente en el navegador:
// - Cámaras públicas HLS (.m3u8): hls.js en Chrome/Edge/Android; nativo en Safari/iPhone.
// - Cámara del celular con IP Webcam (MJPEG, p. ej. http://192.168.1.40:8080/video): <img> nativo.
// La IA sigue analizando aparte (el backend toma fotogramas); aquí solo se ve el video a velocidad real.
// Mientras el video conecta (o si falla) se muestra `fallback` (la última imagen analizada) y se
// reintenta solo cada 15 s, así nunca queda un recuadro negro.
import { useEffect, useRef, useState, type ReactNode } from "react";

export type StreamKind = "hls" | "mjpeg" | null;
const RETRY_MS = 15_000;

/** ¿Se puede reproducir esta URL directamente en el navegador? */
export function playableStreamKind(url: string): StreamKind {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  if (/\.m3u8(\?|$)/i.test(u)) return "hls";
  if (/\/video(\?|$)|mjpe?g|\/videofeed|\/stream(\?|$)/i.test(u)) return "mjpeg";
  return null;
}

type Status = "loading" | "playing" | "error";

export function LiveStreamVideo({
  url,
  className = "block h-auto w-full",
  fallback,
  onStatus,
}: {
  url: string;
  className?: string;
  /** Lo que se ve mientras conecta o si el video falla (p. ej. el último fotograma analizado). */
  fallback?: ReactNode;
  onStatus?: (s: Status) => void;
}) {
  const kind = playableStreamKind(url);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const statusCb = useRef(onStatus);
  statusCb.current = onStatus;
  const report = (s: Status) => {
    setStatus(s);
    statusCb.current?.(s);
  };

  // Reintento automático tras un fallo.
  useEffect(() => {
    if (status !== "error") return;
    const t = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (kind !== "hls") return;
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    report("loading");
    const onPlaying = () => !destroyed && report("playing");
    video.addEventListener("playing", onPlaying);
    const fail = () => !destroyed && report("error");

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url; // Safari / iPhone: HLS nativo
      video.addEventListener("error", fail, { once: true });
      void video.play().catch(() => {});
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (destroyed) return;
        if (!Hls.isSupported()) return fail();
        const h = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, maxBufferLength: 8, backBufferLength: 10, enableWorker: true });
        hls = h;
        let netRetries = 0;
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 3) {
            netRetries++;
            h.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            h.recoverMediaError();
          } else {
            fail();
          }
        });
        h.loadSource(url);
        h.attachMedia(video);
        h.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
      }, fail);
    }
    return () => {
      destroyed = true;
      video.removeEventListener("playing", onPlaying);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, kind, attempt]);

  if (!kind) return <>{fallback ?? null}</>;

  if (kind === "mjpeg") {
    return status === "error" ? (
      <>{fallback ?? null}</>
    ) : (
      <img key={attempt} src={url} alt="Cámara en vivo" className={className} onError={() => report("error")} onLoad={() => report("playing")} draggable={false} />
    );
  }

  // El <video> debe estar VISIBLE desde el inicio: Chrome pausa los videos silenciados que no se ven.
  // La imagen de respaldo se superpone encima solo hasta que el video empieza a reproducirse.
  const playing = status === "playing";
  return (
    <div className="relative h-full w-full">
      <video
        key={attempt}
        ref={videoRef}
        muted
        playsInline
        autoPlay
        crossOrigin="anonymous"
        className={className}
        style={playing ? undefined : { aspectRatio: "16 / 9", background: "#020617" }}
      />
      {!playing && fallback && <div className="absolute inset-0 overflow-hidden [&>img]:h-full [&>img]:w-full [&>img]:object-cover">{fallback}</div>}
    </div>
  );
}
