import * as Cesium from "cesium";

export function flyToBounds(viewer: Cesium.Viewer, bbox4326: [number, number, number, number]) {
  const [minLon, minLat, maxLon, maxLat] = bbox4326;
  
  console.log('🎯 Flying Cesium to bounds:', bbox4326);
  
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
    duration: 0.8,
    complete: () => {
      console.log('✅ Cesium camera moved to bounds');
      viewer.scene.requestRender();
    }
  });
}

export function cameraToCenterZoom(viewer: Cesium.Viewer): { center: [number, number]; zoom: number } {
  const c = viewer.camera.positionCartographic;
  const lon = Cesium.Math.toDegrees(c.longitude);
  const lat = Cesium.Math.toDegrees(c.latitude);
  const height = c.height;
  
  // Crude zoom approximation for syncing back to Leaflet
  // This is an approximation - in practice, you might want to store the original zoom
  const zoom = Math.max(2, Math.min(20, Math.log2(40075000 / (256 * height))));
  
  console.log(`📍 Cesium camera position: [${lon}, ${lat}] height: ${height}, zoom: ${zoom}`);
  
  return { center: [lon, lat], zoom };
}

export function syncCesiumToLeaflet(viewer: Cesium.Viewer, leafletMap: any): void {
  console.log('🔄 Syncing Cesium camera to Leaflet map...');
  
  const center = leafletMap.getCenter();
  const zoom = leafletMap.getZoom();
  
  // Convert Leaflet zoom to approximate Cesium height
  // This is a rough approximation - you might want to fine-tune this
  const height = Math.pow(2, 20 - zoom) * 1000;
  
  console.log(`📍 Syncing to Leaflet position: [${center.lng}, ${center.lat}] zoom: ${zoom}, height: ${height}`);
  
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, height),
    duration: 0.5,
    complete: () => {
      console.log('✅ Cesium synced to Leaflet');
      viewer.scene.requestRender();
    }
  });
}

export function syncLeafletToCesium(viewer: Cesium.Viewer, leafletMap: any): void {
  console.log('🔄 Syncing Leaflet map to Cesium camera...');
  
  const { center, zoom } = cameraToCenterZoom(viewer);
  
  console.log(`📍 Syncing Leaflet to Cesium position: [${center[0]}, ${center[1]}] zoom: ${zoom}`);
  
  leafletMap.setView([center[1], center[0]], Math.round(zoom), {
    animate: true,
    duration: 0.5
  });
}
