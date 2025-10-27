import { detectEntryCandidates } from "../graph/osmTopology";
import type { EntryDetectionInput, EntryDetectionResult } from "../graph/types";

// Worker für topologische Zufahrtserkennung
// Verhindert UI-Blocking bei großen OSM-Datensätzen

self.onmessage = (e: MessageEvent<EntryDetectionInput>) => {
  try {
    console.log('🔧 Worker: Starting entry detection...');
    const result: EntryDetectionResult = detectEntryCandidates(e.data);
    
    console.log(`✅ Worker: Found ${result.candidates.length} candidates in ${result.processingTimeMs.toFixed(1)}ms`);
    
    // @ts-ignore
    postMessage({ 
      ok: true, 
      data: result,
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.error('❌ Worker: Error during entry detection:', err);
    
    // @ts-ignore
    postMessage({ 
      ok: false, 
      error: String(err?.message ?? err),
      timestamp: Date.now()
    });
  }
};

// Fehlerbehandlung für unerwartete Worker-Fehler
self.onerror = (error) => {
  console.error('❌ Worker: Unexpected error:', error);
  
  // @ts-ignore
  postMessage({
    ok: false,
    error: 'Worker crashed: ' + String(error),
    timestamp: Date.now()
  });
};





