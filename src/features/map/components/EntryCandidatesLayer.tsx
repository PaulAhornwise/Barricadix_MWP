import React, { useMemo } from "react";
import type { EntryCandidate } from "../../../shared/graph/types";

export interface EntryCandidatesLayerProps {
  /** Entry Candidates zur Anzeige */
  candidates: EntryCandidate[];
  /** Zeige nur Kandidaten mit Confidence über diesem Wert */
  minConfidence?: number;
  /** Zeige Pfade an */
  showPaths?: boolean;
  /** Zeige Marker an */
  showMarkers?: boolean;
  /** Callback wenn ein Kandidat ausgewählt wird */
  onCandidateSelect?: (candidate: EntryCandidate) => void;
  /** Callback für Klick auf Marker */
  onMarkerClick?: (candidate: EntryCandidate) => void;
}

/** UI-Komponente für die Darstellung von Entry Candidates */
export function EntryCandidatesLayer({
  candidates,
  minConfidence = 0.3,
  showPaths = true,
  showMarkers = true,
  onCandidateSelect,
  onMarkerClick
}: EntryCandidatesLayerProps) {
  
  // Filtere Kandidaten nach Confidence
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => c.confidence >= minConfidence);
  }, [candidates, minConfidence]);

  // Gruppiere Kandidaten nach Confidence für verschiedene Darstellungen
  const candidateGroups = useMemo(() => {
    const high = filteredCandidates.filter(c => c.confidence >= 0.7);
    const medium = filteredCandidates.filter(c => c.confidence >= 0.4 && c.confidence < 0.7);
    const low = filteredCandidates.filter(c => c.confidence < 0.4);
    
    return { high, medium, low };
  }, [filteredCandidates]);

  if (filteredCandidates.length === 0) {
    return (
      <div className="entry-candidates-layer">
        <div className="no-candidates">
          <p>Keine Zufahrtskandidaten gefunden</p>
          <small>Confidence ≥ {minConfidence}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="entry-candidates-layer">
      {/* Statistiken */}
      <div className="candidates-stats">
        <h4>Zufahrtskandidaten ({filteredCandidates.length})</h4>
        <div className="confidence-breakdown">
          <span className="high">Hoch: {candidateGroups.high.length}</span>
          <span className="medium">Mittel: {candidateGroups.medium.length}</span>
          <span className="low">Niedrig: {candidateGroups.low.length}</span>
        </div>
      </div>

      {/* Kandidaten-Liste */}
      <div className="candidates-list">
        {filteredCandidates.map((candidate) => (
          <div
            key={candidate.id}
            className={`candidate-item confidence-${getConfidenceLevel(candidate.confidence)}`}
            onClick={() => onCandidateSelect?.(candidate)}
          >
            <div className="candidate-header">
              <span className="candidate-id">{candidate.id}</span>
              <span className="confidence-badge">
                {(candidate.confidence * 100).toFixed(0)}%
              </span>
            </div>
            
            <div className="candidate-details">
              <div className="metric">
                <span className="label">Distanz:</span>
                <span className="value">{Math.round(candidate.distanceMeters)}m</span>
              </div>
              <div className="metric">
                <span className="label">Geradheit:</span>
                <span className="value">{(candidate.straightness * 100).toFixed(0)}%</span>
              </div>
              <div className="metric">
                <span className="label">Kontinuität:</span>
                <span className="value">{(candidate.continuity * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="candidate-actions">
              <button
                className="btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkerClick?.(candidate);
                }}
              >
                Auf Karte zeigen
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CSS für die Komponente */}
      <style jsx>{`
        .entry-candidates-layer {
          background: rgba(12, 47, 77, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px;
          color: white;
          max-height: 400px;
          overflow-y: auto;
        }

        .no-candidates {
          text-align: center;
          padding: 20px;
          color: #888;
        }

        .candidates-stats h4 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .confidence-breakdown {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          font-size: 12px;
        }

        .confidence-breakdown .high { color: #4ade80; }
        .confidence-breakdown .medium { color: #fbbf24; }
        .confidence-breakdown .low { color: #f87171; }

        .candidates-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .candidate-item {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          border-left: 4px solid transparent;
        }

        .candidate-item:hover {
          background: rgba(255, 255, 255, 0.15);
          transform: translateX(2px);
        }

        .candidate-item.confidence-high {
          border-left-color: #4ade80;
        }

        .candidate-item.confidence-medium {
          border-left-color: #fbbf24;
        }

        .candidate-item.confidence-low {
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
          font-size: 12px;
          color: #ccc;
        }

        .confidence-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .candidate-details {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 11px;
        }

        .metric {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric .label {
          color: #aaa;
          font-size: 10px;
        }

        .metric .value {
          font-weight: 600;
        }

        .candidate-actions {
          display: flex;
          justify-content: flex-end;
        }

        .btn-small {
          background: rgba(59, 130, 246, 0.8);
          border: none;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .btn-small:hover {
          background: rgba(59, 130, 246, 1);
        }
      `}</style>
    </div>
  );
}

/** Hilfsfunktion für Confidence-Level */
function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

/** Marker-Komponente für einzelne Entry Candidates */
export function EntryCandidateMarker({ 
  candidate, 
  onClick 
}: { 
  candidate: EntryCandidate; 
  onClick?: () => void; 
}) {
  const [lon, lat] = candidate.intersectionPoint;
  
  return (
    <div
      className={`entry-marker confidence-${getConfidenceLevel(candidate.confidence)}`}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        cursor: 'pointer'
      }}
    >
      <div className="marker-dot" />
      <div className="marker-label">
        {(candidate.confidence * 100).toFixed(0)}%
      </div>
    </div>
  );
}





