import { useCallback, useEffect, useRef, useState } from "react";

import {
  PerformanceProfileDetector,
  clearPersistedProfile,
  type PerfDiagnostics,
} from "./PerformanceProfileDetector";
import { DEFAULT_PROFILE, type PerfProfile } from "./profileConfig";

export interface PerformanceProfileApi {
  profile: PerfProfile;
  diagnostics: PerfDiagnostics | null;
  /** Report how long map creation took plus what Google actually rendered. */
  reportMapInit: (ms: number, renderingType: "vector" | "raster") => void;
  reportRendererFailure: () => void;
  reportContextLoss: () => void;
  /** Developer-only: forget the stored profile and reload detection. */
  resetProfile: () => void;
}

/**
 * React state changes only when the profile or the (throttled) diagnostics
 * change - never once per frame.
 */
export function usePerformanceProfile(collectDiagnostics = false): PerformanceProfileApi {
  const detectorRef = useRef<PerformanceProfileDetector | null>(null);
  const [profile, setProfile] = useState<PerfProfile>(DEFAULT_PROFILE);
  const [diagnostics, setDiagnostics] = useState<PerfDiagnostics | null>(null);

  useEffect(() => {
    const detector = new PerformanceProfileDetector();
    detectorRef.current = detector;
    setProfile(detector.current());
    detector.onProfileChange = (p) => setProfile(p);
    if (collectDiagnostics) {
      setDiagnostics(detector.diagnostics());
      detector.onDiagnostics = (d) => setDiagnostics(d);
    }
    return () => {
      detector.stop();
      detectorRef.current = null;
    };
  }, [collectDiagnostics]);

  const reportMapInit = useCallback((ms: number, renderingType: "vector" | "raster") => {
    detectorRef.current?.mapInitialized(ms, renderingType);
  }, []);
  const reportRendererFailure = useCallback(() => {
    detectorRef.current?.rendererFailed();
  }, []);
  const reportContextLoss = useCallback(() => {
    detectorRef.current?.contextLost();
  }, []);
  const resetProfile = useCallback(() => {
    clearPersistedProfile();
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  return { profile, diagnostics, reportMapInit, reportRendererFailure, reportContextLoss, resetProfile };
}
