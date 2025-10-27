import type { EntryDetectionInput, EntryDetectionResult } from "../../../shared/graph/types";
import { detectEntryCandidates } from "../../../shared/graph/osmTopology";

// Fallback: Direkte Ausführung wenn Worker nicht verfügbar
export async function computeEntryCandidatesDirect(input: EntryDetectionInput): Promise<EntryDetectionResult> {
  console.log('🔧 Computing entry candidates directly (no worker)');
  return detectEntryCandidates(input);
}

// Worker-basierte Ausführung (bevorzugt)
export async function computeEntryCandidates(input: EntryDetectionInput): Promise<EntryDetectionResult> {
  return new Promise((resolve, reject) => {
    try {
      // Dynamischer Worker-Import für Vite
      const worker = new Worker(
        new URL('../../../shared/workers/topology.worker.ts', import.meta.url),
        { type: 'module' }
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Entry detection timeout after 30 seconds'));
      }, 30000);

      worker.onmessage = (e: MessageEvent<any>) => {
        clearTimeout(timeout);
        worker.terminate();
        
        if (e.data?.ok) {
          resolve(e.data.data as EntryDetectionResult);
        } else {
          reject(new Error(e.data?.error ?? "Worker failed"));
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        worker.terminate();
        console.warn('⚠️ Worker failed, falling back to direct computation');
        
        // Fallback auf direkte Ausführung
        computeEntryCandidatesDirect(input)
          .then(resolve)
          .catch(reject);
      };

      worker.postMessage(input);
    } catch (error) {
      console.warn('⚠️ Worker creation failed, falling back to direct computation');
      
      // Fallback auf direkte Ausführung
      computeEntryCandidatesDirect(input)
        .then(resolve)
        .catch(reject);
    }
  });
}

/** Utility: Konvertiert bestehende OSM-Daten für Entry Detection */
export function prepareEntryDetectionInput(
  polygon: any,
  osmData: any,
  outerBufferMeters = 30
): EntryDetectionInput | null {
  try {
    if (!polygon || !osmData) {
      console.warn('⚠️ Missing polygon or OSM data for entry detection');
      return null;
    }

    // Konvertiere OSM-Daten falls nötig
    let nodes, ways;
    if (osmData.nodes && osmData.ways) {
      // Bereits im richtigen Format
      nodes = osmData.nodes;
      ways = osmData.ways;
    } else {
      // Konvertiere aus bestehendem Format
      const converted = convertFromExistingOsmData(osmData);
      nodes = converted.nodes;
      ways = converted.ways;
    }

    if (nodes.length === 0 || ways.length === 0) {
      console.warn('⚠️ No OSM nodes or ways available for entry detection');
      return null;
    }

    return {
      polygon,
      osm: { nodes, ways },
      outerBufferMeters,
      maxSearchMeters: outerBufferMeters * 2
    };
  } catch (error) {
    console.error('❌ Error preparing entry detection input:', error);
    return null;
  }
}

// Import der Konvertierungsfunktion
import { convertFromExistingOsmData } from "../../../shared/graph/osmTopology";





