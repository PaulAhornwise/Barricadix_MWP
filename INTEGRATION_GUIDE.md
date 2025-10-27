# Geodata Provider Abstraction - Integration Guide

This guide shows how to integrate the geodata provider abstraction system into the existing Barricadix application.

## Overview

The provider abstraction system automatically selects the best available data source:
- **NRW WFS + WMS** for areas within North Rhine-Westphalia (higher fidelity, official data)
- **OSM + Overpass** for areas outside NRW or when NRW services are unavailable

## Files Created

### Core Provider System
- `src/core/geodata/provider.ts` - Core interfaces and utilities
- `src/core/geodata/providers/nrwProvider.ts` - NRW WFS/WMS provider
- `src/core/geodata/providers/osmProvider.ts` - OSM provider wrapper
- `src/core/geodata/index.ts` - Provider selection router

### Integration Components
- `src/core/geodata/integration/mapIntegration.ts` - Map initialization integration
- `src/core/geodata/integration/entryDetectionIntegration.ts` - Entry detection integration
- `src/core/geodata/integration/indexIntegration.ts` - Main application integration
- `src/core/geodata/controls/SourceAttributionControl.ts` - Source attribution UI

### Tests
- `src/core/geodata/__tests__/provider.test.ts` - Unit tests

## Required Changes to index.tsx

### 1. Add Imports

Add these imports at the top of `index.tsx`:

```typescript
// Geodata Provider Abstraction
import { initializeProviderSystem } from './src/core/geodata/integration/indexIntegration';
import { fetchOsmDataWithProvider } from './src/core/geodata/integration/indexIntegration';
```

### 2. Initialize Provider System

Add this call early in the application initialization (after DOM is ready):

```typescript
// Initialize provider abstraction system
await initializeProviderSystem();
```

### 3. Replace Map Initialization

Replace the existing map initialization code around line 3016:

```typescript
// OLD CODE (replace this):
const mapCenter: [number, number] = [51.5711, 8.1060]; // Soest
map = L.map(mapDiv, {
  zoomControl: false,
  preferCanvas: true
}).setView(mapCenter, 16);

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// NEW CODE (replace with this):
import { initializeMapWithProviderSystem } from './src/core/geodata/integration/indexIntegration';

const mapCenter: [number, number] = [51.5711, 8.1060]; // Soest
map = await initializeMapWithProviderSystem(mapDiv, mapCenter, 16);

// The provider system handles basemap selection and attribution automatically
```

### 4. Replace OSM Data Fetching

Replace the OSM data fetching call around line 7753:

```typescript
// OLD CODE (replace this):
const osmData = await fetchOsmBundleForPolygon(polygonCoords, osmLoadingController.signal);

// NEW CODE (replace with this):
const osmData = await fetchOsmDataWithProvider(polygonCoords, osmLoadingController.signal);
```

### 5. Add Provider Information to Reports

Add provider information to PDF reports by including the current provider ID:

```typescript
// In generateRiskReport function, add:
const currentProvider = getCurrentProviderId();
const dataSource = currentProvider === 'nrw' ? 'GEOBASIS.NRW' : 'OpenStreetMap';

// Include in report content:
`Datenquelle: ${dataSource}`
```

## Features

### Automatic Provider Selection
- Detects if current map view is within NRW bounds
- Automatically selects NRW WFS/WMS for NRW areas
- Falls back to OSM for non-NRW areas or service failures

### Visual Indicators
- Source attribution control shows current data provider
- "Quelle: GEOBASIS.NRW" or "Quelle: OSM" displayed on map

### Error Handling
- Graceful fallback when NRW services are unavailable
- User notifications when fallback occurs
- Maintains application stability

### Caching
- Provider-agnostic caching system
- Reduces redundant network requests
- Improves performance for repeated analyses

## Testing

Run the unit tests:

```bash
npm test src/core/geodata/__tests__/provider.test.ts
```

## Configuration

### NRW Bounding Box
The NRW bounding box can be adjusted in `src/core/geodata/providers/nrwProvider.ts`:

```typescript
const NRW_BBOX_3857: [number, number, number, number] = [618000, 6500000, 929000, 6800000];
```

### WFS Service URL
The NRW WFS service URL can be modified in the same file:

```typescript
const url = new URL("https://www.wfs.nrw.de/wfs/DE_NW_SBV_INSPIRE_Downloadservice_Strassennetz");
```

## Benefits

1. **Higher Data Quality**: Official NRW data for North Rhine-Westphalia
2. **Automatic Fallback**: Seamless operation outside NRW or during service outages
3. **No Breaking Changes**: Existing entry detection engine works unchanged
4. **Performance**: Intelligent caching and provider selection
5. **User Transparency**: Clear indication of data source being used

## Troubleshooting

### NRW Services Not Working
- Check network connectivity to NRW servers
- Verify WFS/WMS service URLs are accessible
- System will automatically fall back to OSM

### Provider Selection Issues
- Check console logs for provider selection decisions
- Verify map bounds calculation
- Ensure NRW bounding box is correctly configured

### Performance Issues
- Monitor cache hit rates in console logs
- Consider adjusting cache size or TTL
- Check network latency to different providers

## Future Enhancements

1. **Additional Providers**: Add support for other regional data sources
2. **Advanced Caching**: Implement cache expiration and size limits
3. **Health Monitoring**: Add service health monitoring and metrics
4. **User Preferences**: Allow users to manually select preferred provider
5. **Offline Support**: Add offline data caching capabilities
