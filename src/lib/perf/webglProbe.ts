// Safe, non-invasive WebGL capability probe. No pixels are read, no renderer
// string is inspected, nothing is fingerprinted.

export interface WebglSupport {
  webgl2: boolean;
  webgl1: boolean;
}

export function probeWebgl(): WebglSupport {
  if (typeof document === "undefined") return { webgl2: false, webgl1: false };
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const gl2 = canvas.getContext("webgl2");
    if (gl2) {
      loseContext(gl2);
      return { webgl2: true, webgl1: true };
    }
    const gl1 =
      canvas.getContext("webgl") ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (gl1) {
      loseContext(gl1);
      return { webgl2: false, webgl1: true };
    }
    return { webgl2: false, webgl1: false };
  } catch {
    return { webgl2: false, webgl1: false };
  } finally {
    canvas = null;
  }
}

function loseContext(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  try {
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  } catch {
    /* extension unavailable */
  }
}

/**
 * Watch a map container for WebGL context loss. Google renders into a canvas
 * inside the container, which may not exist yet, so the container itself is
 * observed with a capturing listener.
 */
export function watchContextLoss(container: HTMLElement, onLost: () => void): () => void {
  const handler = () => onLost();
  container.addEventListener("webglcontextlost", handler, true);
  return () => container.removeEventListener("webglcontextlost", handler, true);
}

export function readHardwareHints(): { cores: number | null; memoryGb: number | null; reducedMotion: boolean } {
  if (typeof navigator === "undefined") return { cores: null, memoryGb: null, reducedMotion: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const reducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  return {
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    reducedMotion,
  };
}
