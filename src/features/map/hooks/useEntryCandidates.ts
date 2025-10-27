import { useEffect, useState, useCallback } from "react";
import type { EntryDetectionInput, EntryDetectionResult, EntryCandidate } from "../../../shared/graph/types";
import { computeEntryCandidates, prepareEntryDetectionInput } from "../services/entryCandidateService";

export interface UseEntryCandidatesReturn {
  /** Gefundene Entry Candidates */
  candidates: EntryCandidate[];
  /** Lade-Status */
  loading: boolean;
  /** Fehler-Meldung */
  error: string | null;
  /** Graph-Statistiken */
  graphStats: {
    nodeCount: number;
    wayCount: number;
    edgeCount: number;
  } | null;
  /** Verarbeitungszeit in Millisekunden */
  processingTimeMs: number | null;
  /** Manuelle Neuberechnung auslösen */
  recalculate: () => void;
  /** Eingabe-Daten für Debugging */
  input: EntryDetectionInput | null;
}

export function useEntryCandidates(
  polygon: any,
  osmData: any,
  outerBufferMeters = 30
): UseEntryCandidatesReturn {
  const [result, setResult] = useState<EntryDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<EntryDetectionInput | null>(null);

  const recalculate = useCallback(async () => {
    if (!polygon || !osmData) {
      setError('Missing polygon or OSM data');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const detectionInput = prepareEntryDetectionInput(polygon, osmData, outerBufferMeters);
      
      if (!detectionInput) {
        setError('Failed to prepare detection input');
        setLoading(false);
        return;
      }

      setInput(detectionInput);
      
      console.log('🔍 Starting entry candidate detection...');
      const detectionResult = await computeEntryCandidates(detectionInput);
      
      console.log(`✅ Entry detection completed: ${detectionResult.candidates.length} candidates found`);
      setResult(detectionResult);
    } catch (err: any) {
      const errorMessage = String(err?.message ?? err);
      console.error('❌ Entry detection failed:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [polygon, osmData, outerBufferMeters]);

  // Automatische Neuberechnung bei Änderungen
  useEffect(() => {
    recalculate();
  }, [recalculate]);

  return {
    candidates: result?.candidates || [],
    loading,
    error,
    graphStats: result?.graphStats || null,
    processingTimeMs: result?.processingTimeMs || null,
    recalculate,
    input
  };
}

/** Hook für manuelle Entry Detection ohne automatische Neuberechnung */
export function useManualEntryDetection() {
  const [result, setResult] = useState<EntryDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(async (input: EntryDetectionInput) => {
    setLoading(true);
    setError(null);

    try {
      const detectionResult = await computeEntryCandidates(input);
      setResult(detectionResult);
    } catch (err: any) {
      const errorMessage = String(err?.message ?? err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    detect,
    clear
  };
}





