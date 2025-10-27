# 🌍 3D Mode Integration - Digitaler Zwilling NRW

This document describes the 3D mode integration that adds CesiumJS-based 3D visualization with Digitaler Zwilling NRW (DZ NRW) data to the Barricadix dashboard.

## 🚀 Features

- **2D/3D Toggle**: Seamless switching between 2D Leaflet and 3D Cesium views
- **NRW-Gated Loading**: 3D data only loads when the map is within North Rhine-Westphalia (NRW)
- **DZ NRW Integration**: Supports both 3D Tiles and ArcGIS SceneServer endpoints
- **Camera Sync**: Automatic synchronization between 2D and 3D views
- **Graceful Fallback**: Falls back to 2D mode if 3D data is unavailable
- **Attribution**: Proper attribution for DZ NRW data sources

## 📁 File Structure

```
src/
├── threeD/
│   ├── CesiumContainer.tsx          # React wrapper for Cesium viewer
│   ├── DzNrw3DProvider.ts          # DZ NRW 3D data provider
│   └── sync.ts                     # Camera sync utilities
├── features/map/
│   ├── threeDMode.ts               # 3D mode state management
│   └── ui/
│       └── ThreeDToggle.tsx        # 2D/3D toggle button
└── index.tsx                       # Main integration point
```

## 🔧 Configuration

### Environment Variables

Add these to your environment configuration:

```bash
# DZ NRW 3D Tiles endpoint (preferred)
VITE_DZNRW_3DTILES_URL=https://geoportal.nrw.de/tileset.json

# DZ NRW SceneServer endpoint (fallback)
VITE_DZNRW_SCENE_URL=https://geoportal.nrw.de/arcgis/rest/services/DigitalerZwillingNRW/SceneServer

# Optional Cesium Ion token
VITE_CESIUM_ION_TOKEN=your_token_here
```

### Dependencies

```bash
npm install cesium
```

## 🏗️ Architecture

### Components

1. **CesiumContainer**: React component that wraps the Cesium viewer
2. **DzNrw3DProvider**: Handles loading DZ NRW 3D data (tiles or imagery)
3. **ThreeDToggle**: UI button for switching between 2D/3D modes
4. **threeDMode**: State management for 3D mode operations

### Data Flow

1. User clicks 3D toggle button
2. System checks if current location is within NRW bounds
3. If in NRW: loads DZ NRW 3D data (tiles or imagery)
4. If outside NRW: shows notification and keeps 2D mode
5. Camera position syncs between 2D and 3D views

## 🎯 Usage

### Basic Usage

The 3D mode is automatically initialized when the map loads. Users can:

1. Click the "2D/3D" toggle button in the top-right corner
2. The system automatically detects if 3D data is available for the current location
3. Switch back to 2D mode at any time

### Programmatic Usage

```typescript
// Enter 3D mode
await enter3D(threeDState, map, cesiumContainer);

// Exit 3D mode
exit3D(threeDState, map, cesiumContainer);

// Load 3D data
await load3DData(threeDState, cesiumViewer);
```

## 🔍 NRW Detection

The system uses the same NRW bounding box as the existing provider system:

```typescript
const NRW_BBOX_4326: [number, number, number, number] = [5.86, 50.32, 9.46, 52.53];
```

This ensures consistency with the existing 2D provider selection logic.

## 🎨 Styling

The 3D toggle button includes:
- Dynamic styling based on current mode (2D/3D)
- Loading states with spinner animation
- Attribution badge when in 3D mode
- Hover effects and smooth transitions

## 🚨 Error Handling

The system includes comprehensive error handling:

1. **Network Errors**: Graceful fallback if DZ NRW endpoints are unreachable
2. **Data Errors**: Fallback to imagery if 3D tiles fail to load
3. **Location Errors**: Notification if outside NRW bounds
4. **Browser Errors**: Fallback to 2D mode if Cesium fails to initialize

## 🔧 Performance Optimizations

- **Request Render Mode**: Only renders when camera moves
- **LOD Management**: Configurable screen space error for 3D tiles
- **Memory Management**: Proper cleanup when exiting 3D mode
- **Debounced Events**: Prevents excessive camera sync operations

## 🧪 Testing

Use the included test script to verify integration:

```javascript
// Run in browser console
// Load test-3d-integration.js
```

The test checks:
- Cesium library availability
- 3D toggle button presence
- Cesium container setup
- Environment variables
- Map initialization
- 3D state management

## 📝 Logging

The system includes extensive logging with emoji prefixes:

- 🌍 Cesium viewer operations
- 🏗️ 3D data loading
- 🔄 Mode switching
- 📍 Camera synchronization
- ⚠️ Warnings and errors
- ✅ Success confirmations

## 🔮 Future Enhancements

Potential improvements:

1. **Terrain Support**: Add NRW-specific terrain data
2. **Building Heights**: Extract building height information
3. **Shadow Casting**: Enable realistic shadows in 3D mode
4. **Animation**: Smooth transitions between 2D/3D modes
5. **Performance**: Further optimizations for large datasets

## 🐛 Troubleshooting

### Common Issues

1. **Cesium not loading**: Check if `/cesium/` assets are properly copied
2. **3D toggle not appearing**: Verify React components are properly mounted
3. **No 3D data**: Check environment variables and network connectivity
4. **Performance issues**: Adjust `maximumScreenSpaceError` in provider settings

### Debug Mode

Enable debug logging by checking the browser console for emoji-prefixed messages.

## 📚 References

- [CesiumJS Documentation](https://cesium.com/docs/)
- [Digitaler Zwilling NRW](https://www.geoportal.nrw.de/)
- [3D Tiles Specification](https://github.com/CesiumGS/3d-tiles)
- [ArcGIS SceneServer](https://developers.arcgis.com/rest/services-reference/enterprise/scene-server.htm)

## 🤝 Contributing

When modifying the 3D integration:

1. Maintain backward compatibility with existing 2D functionality
2. Follow the existing logging patterns
3. Test both NRW and non-NRW locations
4. Ensure proper cleanup of Cesium resources
5. Update this documentation for any API changes

