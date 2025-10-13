# Entry Detection System

## Übersicht

Das Entry Detection System ersetzt die rein tag-basierte Zufahrtserkennung durch eine topologische Graph-Konnektion. Ein Kandidat gilt als "Zufahrt", wenn eine durchgehende Route (ohne harte Tag-Filter) von außerhalb des Sicherheitsbereichs bis zum Polygonrand existiert.

## Architektur

### Kern-Komponenten

1. **Graph-Topologie** (`src/shared/graph/osmTopology.ts`)
   - Baut Adjazenz-Graph aus OSM-Nodes und Ways
   - Implementiert BFS-Algorithmus für Pfad-Suche
   - Berechnet Confidence-Scores basierend auf Geometrie

2. **Geometrie-Utilities** (`src/shared/geometry/polygonOps.ts`)
   - Turf.js-basierte Geometrie-Operationen
   - Schnittpunkt-Berechnung
   - Geradheits- und Kontinuitäts-Metriken

3. **Web Worker** (`src/shared/workers/topology.worker.ts`)
   - Verhindert UI-Blocking bei großen OSM-Datensätzen
   - Asynchrone Entry Detection

4. **React Hooks** (`src/features/map/hooks/useEntryCandidates.ts`)
   - State Management für Entry Candidates
   - Automatische Neuberechnung bei Änderungen

5. **UI-Komponenten** (`src/features/map/components/EntryCandidatesLayer.tsx`)
   - Visualisierung der gefundenen Zufahrten
   - Confidence-basierte Farbkodierung

## Verwendung

### Grundlegende Verwendung

```typescript
import { useEntryCandidates } from './hooks/useEntryCandidates';

function MyComponent() {
  const { candidates, loading, error } = useEntryCandidates(
    polygon,      // GeoJSON Polygon
    osmData,      // OSM-Daten
    30            // Außenbuffer in Metern
  );
  
  return (
    <div>
      {loading && <p>Analysiere...</p>}
      {error && <p>Fehler: {error}</p>}
      {candidates.map(candidate => (
        <div key={candidate.id}>
          Confidence: {candidate.confidence}
          Distanz: {candidate.distanceMeters}m
        </div>
      ))}
    </div>
  );
}
```

### Integration in bestehende Anwendung

Das System ist bereits in die bestehende `index.tsx` integriert:

1. **Automatische Erkennung**: Wird automatisch ausgelöst, wenn OSM-Daten geladen werden
2. **UI-Integration**: Entry Detection Panel im Parameter-Bereich
3. **Manuelle Steuerung**: "Analysieren" und "Löschen" Buttons

## Algorithmus

### 1. Graph-Bau
- Erstellt Adjazenz-Liste aus OSM-Ways
- Berücksichtigt bidirektionale Verbindungen
- Ignoriert Tag-Filter (reine Topologie)

### 2. Startpunkt-Identifikation
- Findet Knoten außerhalb des Polygons
- Im definierten Außenbuffer (Standard: 30m)
- "Außen nah am Rand" für realistische Zufahrten

### 3. Pfad-Suche (BFS)
- Breitensuche bis zum ersten Polygon-Schnitt
- Prüft jedes Segment auf Schnittpunkte
- Stoppt bei erstem Treffer

### 4. Confidence-Berechnung
```typescript
confidence = 0.4 * normDist + 0.3 * straightness + 0.3 * continuity + lengthBonus
```

- **Distanz**: Normalisierte Weglänge (bis 200m)
- **Geradheit**: Winkel-Konsistenz entlang des Pfads
- **Kontinuität**: Mittlerer Knotengrad (Stabilität)
- **Längen-Bonus**: Längere Pfade sind oft stabiler

## Konfiguration

### EntryDetectionInput

```typescript
interface EntryDetectionInput {
  polygon: Feature<Polygon>;           // Sicherheitsbereich
  osm: {
    nodes: OsmNode[];                  // OSM-Knoten
    ways: OsmWay[];                    // OSM-Wege
  };
  outerBufferMeters?: number;          // Außenbuffer (Standard: 30)
  maxSearchMeters?: number;            // Max. Suchradius
}
```

### Confidence-Konfiguration

```typescript
interface ConfidenceConfig {
  distanceWeight: number;              // Gewichtung Distanz (0.4)
  straightnessWeight: number;          // Gewichtung Geradheit (0.3)
  continuityWeight: number;            // Gewichtung Kontinuität (0.3)
  minConfidence: number;               // Min. Confidence (0.3)
  maxDistance: number;                 // Max. Distanz (200m)
}
```

## Tests

```bash
# Alle Tests ausführen
npm run test

# Tests einmal ausführen
npm run test:run
```

### Test-Kategorien

1. **Graph-Topologie** (`graphTopology.test.ts`)
   - Graph-Bau und Adjazenz
   - Entry Detection Algorithmus
   - Confidence-Berechnung

2. **Integration** (`entryDetection.test.ts`)
   - Datenkonvertierung
   - Service-Integration
   - Fehlerbehandlung

## Performance

### Optimierungen

1. **Web Worker**: Verhindert UI-Blocking
2. **Caching**: Wiederverwendung von Graph-Strukturen
3. **Debouncing**: Verhindert häufige Neuberechnungen
4. **BFS-Limits**: Max. 6000 Schritte pro Suche

### Benchmarks

- **Kleine Polygone** (< 1km²): ~50-100ms
- **Mittlere Polygone** (1-10km²): ~200-500ms
- **Große Polygone** (> 10km²): ~1-3s

## Debugging

### Console-Commands

```javascript
// Entry Detection Manager
window.entryDetectionManager.detectEntries(polygon, osmData);
window.entryDetectionManager.clearCandidates();

// Debug-Informationen
console.log('Current candidates:', window.entryDetectionManager.candidates);
console.log('Last result:', window.entryDetectionManager.lastResult);
```

### Logging

Das System verwendet strukturiertes Logging:

- `🔍` Entry Detection Start
- `✅` Erfolgreiche Erkennung
- `❌` Fehler
- `📊` Statistiken
- `🔧` Setup/Initialisierung

## Erweiterungen

### Geplante Features

1. **Machine Learning**: ML-basierte Confidence-Berechnung
2. **Historische Daten**: Berücksichtigung von Verkehrsmustern
3. **3D-Analyse**: Höhenunterschiede und Steigungen
4. **Echtzeit-Updates**: Live-Monitoring von Zufahrten

### API-Erweiterungen

```typescript
// Zukünftige API
interface AdvancedEntryDetection {
  detectEntriesWithML(input: EntryDetectionInput): Promise<EntryCandidate[]>;
  detectEntriesWithHistory(input: EntryDetectionInput, history: TrafficHistory): Promise<EntryCandidate[]>;
  detectEntries3D(input: EntryDetectionInput3D): Promise<EntryCandidate3D[]>;
}
```

## Troubleshooting

### Häufige Probleme

1. **Keine Zufahrten gefunden**
   - Prüfen Sie OSM-Datenverfügbarkeit
   - Erhöhen Sie `outerBufferMeters`
   - Prüfen Sie Polygon-Größe

2. **Performance-Probleme**
   - Aktivieren Sie Web Worker
   - Reduzieren Sie `maxSearchMeters`
   - Verwenden Sie kleinere Polygone

3. **Falsche Confidence-Scores**
   - Anpassen der Gewichtungen
   - Prüfen Sie OSM-Datenqualität
   - Kalibrieren Sie Schwellenwerte

### Support

Bei Problemen oder Fragen:
1. Prüfen Sie die Browser-Konsole
2. Führen Sie Tests aus: `npm run test`
3. Überprüfen Sie die Logs
4. Kontaktieren Sie das Entwicklungsteam

