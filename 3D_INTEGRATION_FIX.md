# 3D-Integration Fix - Digitaler Zwilling NRW

## Problem-Analyse

### Identifizierte Fehler aus der Konsole:
```
deck: update of TileLayer({id: 'basemap'}): Cannot read properties of undefined (reading 'west')
TypeError: Cannot read properties of undefined (reading 'west')
    at Object.renderSubLayers (deckBasemap.ts:27:23)
```

**Ursache**: Die `bbox` Eigenschaft wurde nicht korrekt aus den TileLayer-Props extrahiert.

## Lösung

### 1. Korrektur der `deckBasemap.ts`

**Problem**: Die ursprüngliche Implementierung versuchte, `bbox` direkt aus `props` zu extrahieren, aber deck.gl TileLayer stellt die bbox-Informationen über `props.tile.bbox` bereit.

**Vorher**:
```typescript
renderSubLayers: (props) => {
  const {bbox, data} = props;
  return new BitmapLayer({
    id: `${props.id}-bmp`,
    bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
    image: data?.url,
    pickable: false
  });
}
```

**Nachher**:
```typescript
renderSubLayers: (props: any) => {
  const {
    bbox: {west, south, east, north}
  } = props.tile;

  return new BitmapLayer(props, {
    data: null,
    image: props.data,
    bounds: [west, south, east, north]
  });
}
```

### 2. Korrekte getTileData Implementierung

Die `getTileData` Funktion gibt jetzt direkt die URL zurück, anstatt ein Objekt:

```typescript
getTileData: ({x, y, z}: {x: number; y: number; z: number}) => {
  const subs = ["a", "b", "c"];
  const s = subs[(x + y + z) % subs.length];
  const url = template
    .replace("{s}", s)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  return url;
}
```

## Technische Details

### deck.gl TileLayer Architektur

1. **TileLayer** verwaltet das Tile-Management (Laden, Caching, LOD)
2. **renderSubLayers** wird für jedes Tile aufgerufen
3. **BitmapLayer** rendert die eigentlichen Raster-Tiles

### Wichtige Props-Struktur:
```typescript
props = {
  id: string,
  data: any,  // Rückgabewert von getTileData
  tile: {
    bbox: {
      west: number,
      south: number,
      east: number,
      north: number
    },
    x: number,
    y: number,
    z: number
  }
}
```

## Nächste Schritte

### Aktueller Status:
✅ Basemap-Rendering funktioniert korrekt
✅ Keine React-Root-Warnings mehr
✅ Keine Hook-Context-Fehler
⏳ I3S-Layer Integration (auskommentiert wegen Versions-Kompatibilität)

### I3S-Layer Integration (zukünftig):

Sobald die deck.gl Version aktualisiert ist oder I3SLayer verfügbar ist:

```typescript
import {I3SLayer} from "@deck.gl/geo-layers";
import {registerLoaders} from "@loaders.gl/core";
import {I3SLoader} from "@loaders.gl/i3s";

registerLoaders(I3SLoader);

const i3s = new I3SLayer({
  id: "dz-nrw-i3s",
  data: dzUrl,  // https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0
  loadOptions: {i3s: {coordinateSystem: "LNGLAT"}},
  pickable: false
});
```

## Verwendung

1. **3D-Modus aktivieren**: Klick auf den "3D" Button in der rechten oberen Ecke
2. **Voraussetzungen**: 
   - Innerhalb NRW-Bounds (5.86°E - 9.46°E, 50.32°N - 52.53°N)
   - SceneServer URL in `.env.local` konfiguriert
3. **Zurück zu 2D**: Erneuter Klick auf den Button (zeigt dann "2D")

## Umgebungsvariablen

```env
VITE_DZNRW_SCENESERVER_URL=https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0
VITE_DZNRW_SCENESERVER_PROXY=  # Optional für CORS-Bypass
```

## Debugging

### Konsolen-Logs prüfen:
- `🏗️ Entering 3D mode with deck.gl I3S...` - 3D-Modus wird aktiviert
- `🔧 DZ NRW SceneServer URL:` - URL-Konfiguration
- `🔧 In NRW:` - NRW-Bounds-Check
- `✅ All checks passed, entering 3D mode...` - Erfolgreiche Aktivierung
- `📷 3D view state changed:` - Kamera-Updates

### Häufige Probleme:

1. **Graue Karte**: 
   - Prüfen Sie die Browser-Konsole auf Fehler
   - Stellen Sie sicher, dass Sie innerhalb NRW sind
   
2. **CORS-Fehler**:
   - Proxy-Server verwenden (siehe `VITE_DZNRW_SCENESERVER_PROXY`)
   - Oder Browser mit deaktivierten CORS-Checks verwenden (nur für Entwicklung!)

3. **Keine 3D-Daten**:
   - Health-Check schlägt fehl → Server nicht erreichbar
   - I3S-Layer noch nicht verfügbar → Nur Basemap wird angezeigt

## Performance

- **Tile-Caching**: deck.gl cached automatisch geladene Tiles
- **LOD (Level of Detail)**: Automatische Anpassung basierend auf Zoom-Level
- **Viewport Culling**: Nur sichtbare Tiles werden geladen

## Attribution

Die 3D-Ansicht zeigt automatisch die korrekte Attribution:
```
3D: © Digitaler Zwilling NRW / Land NRW · Basemap © OpenStreetMap
```


