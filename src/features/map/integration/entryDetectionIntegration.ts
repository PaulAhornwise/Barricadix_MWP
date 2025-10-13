import { detectEntryCandidates, convertFromExistingOsmData } from "../../../shared/graph/osmTopology";
import type { EntryDetectionResult, EntryCandidate } from "../../../shared/graph/types";
import { prepareEntryDetectionInput } from "../services/entryCandidateService";

/**
 * Integration des Entry Detection Systems in die bestehende Anwendung
 */

export interface EntryDetectionIntegration {
  /** Aktuelle Entry Candidates */
  candidates: EntryCandidate[];
  /** Lade-Status */
  loading: boolean;
  /** Fehler-Meldung */
  error: string | null;
  /** Letztes Ergebnis */
  lastResult: EntryDetectionResult | null;
  /** Startet Entry Detection für aktuelles Polygon */
  detectEntries: (polygon: any, osmData: any) => Promise<void>;
  /** Löscht alle Entry Candidates */
  clearCandidates: () => void;
  /** Löscht einen spezifischen Entry Candidate */
  deleteCandidate: (candidateId: string) => void;
  /** Setzt Callback für UI-Updates */
  setOnUpdate: (callback: (candidates: EntryCandidate[]) => void) => void;
}

class EntryDetectionManager implements EntryDetectionIntegration {
  public candidates: EntryCandidate[] = [];
  public loading: boolean = false;
  public error: string | null = null;
  public lastResult: EntryDetectionResult | null = null;
  private onUpdateCallback?: (candidates: EntryCandidate[]) => void;

  async detectEntries(polygon: any, osmData: any): Promise<void> {
    if (!polygon || !osmData) {
      this.error = 'Missing polygon or OSM data';
      this.candidates = [];
      this.notifyUpdate();
      return;
    }

    this.loading = true;
    this.error = null;
    this.notifyUpdate();

    try {
      console.log('🔍 Starting entry detection...');
      
      // Konvertiere Leaflet Polygon zu GeoJSON
      const geoJsonPolygon = this.convertLeafletPolygonToGeoJSON(polygon);
      
      // Bereite Input für Entry Detection vor
      const input = prepareEntryDetectionInput(geoJsonPolygon, osmData, 30);
      
      if (!input) {
        throw new Error('Failed to prepare detection input');
      }

      // Führe Entry Detection aus
      const result = await this.runEntryDetection(input);
      
      this.candidates = result.candidates;
      this.lastResult = result;
      this.error = null;
      
      console.log(`✅ Entry detection completed: ${result.candidates.length} candidates found`);
      console.log(`📊 Graph stats: ${result.graphStats.nodeCount} nodes, ${result.graphStats.wayCount} ways, ${result.graphStats.edgeCount} edges`);
      console.log(`⏱️ Processing time: ${result.processingTimeMs.toFixed(1)}ms`);
      
    } catch (err: any) {
      const errorMessage = String(err?.message ?? err);
      console.error('❌ Entry detection failed:', errorMessage);
      this.error = errorMessage;
      this.candidates = [];
    } finally {
      this.loading = false;
      this.notifyUpdate();
    }
  }

  clearCandidates(): void {
    this.candidates = [];
    this.lastResult = null;
    this.error = null;
    this.notifyUpdate();
  }

  deleteCandidate(candidateId: string): void {
    const initialLength = this.candidates.length;
    this.candidates = this.candidates.filter(candidate => candidate.id !== candidateId);
    
    if (this.candidates.length < initialLength) {
      console.log(`🗑️ Deleted entry candidate: ${candidateId}`);
      this.notifyUpdate();
    } else {
      console.warn(`⚠️ Entry candidate not found: ${candidateId}`);
    }
  }

  setOnUpdate(callback: (candidates: EntryCandidate[]) => void): void {
    this.onUpdateCallback = callback;
  }

  private notifyUpdate(): void {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.candidates);
    }
  }

  private convertLeafletPolygonToGeoJSON(leafletPolygon: any): any {
    const latLngs = leafletPolygon.getLatLngs()[0];
    const coordinates = latLngs.map((latlng: any) => [latlng.lng, latlng.lat]);
    
    // Ensure the polygon is closed (first and last points are the same)
    if (coordinates.length > 0) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push([first[0], first[1]]);
      }
    }
    
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coordinates]
      },
      properties: {}
    };
  }

  private async runEntryDetection(input: any): Promise<EntryDetectionResult> {
    // Verwende die direkte Ausführung (ohne Worker für bessere Kompatibilität)
    const { detectEntryCandidates } = await import("../../../shared/graph/osmTopology");
    return detectEntryCandidates(input);
  }
}

// Globale Instanz für die Integration
export const entryDetectionManager = new EntryDetectionManager();

/**
 * Integriert Entry Detection in die bestehende OSM-Datenverarbeitung
 */
export function integrateEntryDetectionWithExistingOSM() {
  console.log('🔧 Integrating Entry Detection with existing OSM system...');
  
  // Hook in die bestehende loadOsmDataForCurrentPolygon Funktion
  const originalLoadOsmData = (window as any).loadOsmDataForCurrentPolygon;
  
  if (originalLoadOsmData) {
    (window as any).loadOsmDataForCurrentPolygon = async function(...args: any[]) {
      // Rufe ursprüngliche Funktion auf
      const result = await originalLoadOsmData.apply(this, args);
      
      // Führe Entry Detection aus, wenn OSM-Daten geladen wurden
      const currentPolygon = (window as any).drawnPolygon;
      const currentOsmData = (window as any).currentOsmData;
      
      if (currentPolygon && currentOsmData) {
        console.log('🔍 Triggering entry detection after OSM data load...');
        await entryDetectionManager.detectEntries(currentPolygon, currentOsmData);
      }
      
      return result;
    };
  }

  // Mache Entry Detection Manager global verfügbar
  (window as any).entryDetectionManager = entryDetectionManager;
  
  console.log('✅ Entry Detection integration completed');
}

/**
 * Erstellt UI-Elemente für Entry Detection
 */
export function createEntryDetectionUI(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'entry-detection-panel';
  container.className = 'entry-detection-panel';
  container.innerHTML = `
    <div class="entry-detection-header">
      <h3>🚪 Zufahrtserkennung</h3>
      <div class="entry-detection-controls">
        <button id="detect-entries-btn" class="btn-primary">Zufahrten analysieren</button>
        <button id="clear-entries-btn" class="btn-secondary">Löschen</button>
      </div>
    </div>
    <div class="entry-detection-status">
      <div id="entry-detection-status" class="status-indicator">Bereit</div>
    </div>
    <div class="entry-detection-results">
      <div id="entry-candidates-list" class="candidates-list"></div>
    </div>
  `;

  // Event Listeners
  const detectBtn = container.querySelector('#detect-entries-btn');
  const clearBtn = container.querySelector('#clear-entries-btn');
  const statusEl = container.querySelector('#entry-detection-status');
  const resultsEl = container.querySelector('#entry-candidates-list');

  detectBtn?.addEventListener('click', async () => {
    const polygon = (window as any).drawnPolygon;
    const osmData = (window as any).currentOsmData;
    
    if (!polygon) {
      alert('Bitte zeichnen Sie zuerst ein Polygon');
      return;
    }
    
    if (!osmData) {
      alert('Keine OSM-Daten verfügbar. Bitte aktivieren Sie OSM-Analyse.');
      return;
    }

    await entryDetectionManager.detectEntries(polygon, osmData);
  });

  clearBtn?.addEventListener('click', () => {
    entryDetectionManager.clearCandidates();
  });

  // Update Callback
  entryDetectionManager.setOnUpdate((candidates) => {
    if (statusEl) {
      if (entryDetectionManager.loading) {
        statusEl.textContent = 'Analysiere...';
        statusEl.className = 'status-indicator loading';
      } else if (entryDetectionManager.error) {
        statusEl.textContent = `Fehler: ${entryDetectionManager.error}`;
        statusEl.className = 'status-indicator error';
      } else {
        statusEl.textContent = `${candidates.length} Zufahrten gefunden`;
        statusEl.className = 'status-indicator success';
      }
    }

    if (resultsEl) {
      resultsEl.innerHTML = candidates.map(candidate => `
        <div class="candidate-item" data-confidence="${candidate.confidence}">
          <div class="candidate-header">
            <span class="candidate-id">${candidate.id}</span>
            <span class="confidence-badge">${Math.round(candidate.confidence * 100)}%</span>
          </div>
          <div class="candidate-details">
            <div class="metric">
              <span class="label">Distanz:</span>
              <span class="value">${Math.round(candidate.distanceMeters)}m</span>
            </div>
            <div class="metric">
              <span class="label">Geradheit:</span>
              <span class="value">${Math.round(candidate.straightness * 100)}%</span>
            </div>
            <div class="metric">
              <span class="label">Kontinuität:</span>
              <span class="value">${Math.round(candidate.continuity * 100)}%</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  });

  return container;
}

/**
 * Fügt CSS-Styles für Entry Detection UI hinzu
 */
export function addEntryDetectionStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .entry-detection-panel {
      background: rgba(12, 47, 77, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 16px;
      margin: 16px 0;
      color: white;
      max-height: 400px;
      overflow-y: auto;
    }

    .entry-detection-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .entry-detection-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .entry-detection-controls {
      display: flex;
      gap: 8px;
    }

    .btn-primary, .btn-secondary {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .entry-detection-status {
      margin-bottom: 12px;
    }

    .status-indicator {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }

    .status-indicator.loading {
      background: rgba(251, 191, 36, 0.2);
      color: #fbbf24;
    }

    .status-indicator.success {
      background: rgba(74, 222, 128, 0.2);
      color: #4ade80;
    }

    .status-indicator.error {
      background: rgba(248, 113, 113, 0.2);
      color: #f87171;
    }

    .candidates-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .candidate-item {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px;
      border-left: 4px solid transparent;
    }

    .candidate-item[data-confidence*="0.7"] {
      border-left-color: #4ade80;
    }

    .candidate-item[data-confidence*="0.4"]:not([data-confidence*="0.7"]) {
      border-left-color: #fbbf24;
    }

    .candidate-item[data-confidence*="0.3"]:not([data-confidence*="0.4"]) {
      border-left-color: #f87171;
    }

    .candidate-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .candidate-id {
      font-family: monospace;
      font-size: 11px;
      color: #ccc;
    }

    .confidence-badge {
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }

    .candidate-details {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      font-size: 10px;
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .metric .label {
      color: #aaa;
      font-size: 9px;
    }

    .metric .value {
      font-weight: 600;
    }
  `;
  
  document.head.appendChild(style);
}
