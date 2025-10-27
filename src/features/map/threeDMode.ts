import * as Cesium from "cesium";
import { addDzNrw3D, cleanupDzNrw3D, type DzLoadResult } from "../../threeD/DzNrw3DProvider";
import { flyToBounds, syncLeafletToCesium } from "../../threeD/sync";

// NRW bounding box in EPSG:4326 (same as used in existing provider system)
const NRW_BBOX_4326: [number, number, number, number] = [5.86, 50.32, 9.46, 52.53];

const inNrw = (b: [number, number, number, number]): boolean => {
  return !(b[0] > NRW_BBOX_4326[2] || b[2] < NRW_BBOX_4326[0] || 
           b[1] > NRW_BBOX_4326[3] || b[3] < NRW_BBOX_4326[1]);
};

export type ThreeDState = {
  is3D: boolean;
  viewer?: Cesium.Viewer;
  last2D?: { center: [number, number]; zoom: number };
  dzResult?: DzLoadResult;
};

// Simple toast notification function (you can replace with your existing toast system)
function showToast(message: string, type: 'info' | 'error' = 'info'): void {
  console.log(`🍞 Toast (${type}): ${message}`);
  
  // Create a simple toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff4444' : '#4CAF50'};
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
    max-width: 300px;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4000);
}

export async function enter3D(
  state: ThreeDState, 
  leafletMap: any, 
  cesiumMount: HTMLDivElement
): Promise<void> {
  console.log('🚀 Entering 3D mode...');
  
  // Store current 2D view state
  const center = leafletMap.getCenter();
  state.last2D = { 
    center: [center.lng, center.lat], 
    zoom: leafletMap.getZoom() 
  };
  
  console.log('💾 Stored 2D state:', state.last2D);
  
  // Get current map bounds
  const bounds = leafletMap.getBounds();
  const bbox4326: [number, number, number, number] = [
    bounds.getWest(), 
    bounds.getSouth(), 
    bounds.getEast(), 
    bounds.getNorth()
  ];
  
  console.log('📍 Current map bbox4326:', bbox4326);
  console.log('🔍 Checking if in NRW...');
  
  // Switch to 3D view
  cesiumMount.style.display = "block";
  cesiumMount.style.pointerEvents = "auto"; // Enable mouse events for Cesium navigation
  
  // Hide only the Leaflet map pane, not the entire container (to preserve UI elements)
  const leafletContainer = leafletMap.getContainer();
  const mapPane = leafletContainer.querySelector('.leaflet-map-pane') as HTMLElement;
  if (mapPane) {
    mapPane.style.display = "none";
  } else {
    // Fallback: hide the entire container if map pane not found
    (leafletContainer as HTMLElement).style.display = "none";
  }
  
  // Ensure map action buttons remain visible and functional in 3D mode
  const mapActions = document.querySelector('.map-actions');
  if (mapActions) {
    (mapActions as HTMLElement).style.display = "flex";
    (mapActions as HTMLElement).style.zIndex = "10000";
    (mapActions as HTMLElement).style.pointerEvents = "auto";
  }
  
  // Create Cesium viewer (this will be handled by the CesiumContainer component)
  // For now, we'll wait for the viewer to be created by the React component
  
  if (!inNrw(bbox4326)) {
    console.log('⚠️ Outside NRW - 3D data not available');
    showToast("3D-Daten (DZ NRW) nicht verfügbar – außerhalb NRW", 'info');
    state.is3D = true;
    return;
  }
  
  console.log('✅ Inside NRW - attempting to load 3D data');
  
  // We'll load the 3D data when the viewer is ready
  state.is3D = true;
}

export async function load3DData(state: ThreeDState, viewer: Cesium.Viewer): Promise<void> {
  if (!state.viewer) {
    state.viewer = viewer;
  }
  
  console.log('🏗️ Loading 3D data for NRW...');
  
  try {
    // Fly to the stored bounds first
    if (state.last2D) {
      const bounds = state.viewer.scene.camera.computeViewRectangle();
      if (bounds) {
        const bbox4326: [number, number, number, number] = [
          Cesium.Math.toDegrees(bounds.west),
          Cesium.Math.toDegrees(bounds.south),
          Cesium.Math.toDegrees(bounds.east),
          Cesium.Math.toDegrees(bounds.north)
        ];
        
        flyToBounds(viewer, bbox4326);
      }
    }
    
    // Load DZ NRW 3D content
    const dzResult = await addDzNrw3D(viewer);
    state.dzResult = dzResult;
    
    console.log('✅ 3D data loaded successfully:', dzResult.source);
    
  } catch (error) {
    console.error('❌ Failed to load 3D data:', error);
    showToast("3D-Daten (DZ NRW) nicht verfügbar – bitte 2D nutzen.", 'error');
  }
}

export function exit3D(
  state: ThreeDState, 
  leafletMap: any, 
  cesiumMount: HTMLDivElement
): void {
  console.log('🚪 Exiting 3D mode...');
  
  // Sync camera position back to 2D if we have a viewer
  if (state.viewer && state.last2D) {
    console.log('🔄 Syncing camera position back to 2D...');
    syncLeafletToCesium(state.viewer, leafletMap);
  }
  
  // Clean up 3D content
  if (state.viewer && state.dzResult) {
    cleanupDzNrw3D(state.viewer);
    state.dzResult = undefined;
  }
  
  // Destroy viewer (this will be handled by the CesiumContainer component)
  state.viewer = undefined;
  
  // Switch back to 2D view
  cesiumMount.style.display = "none";
  cesiumMount.style.pointerEvents = "none"; // Disable mouse events when hidden
  
  // Show the Leaflet map pane again
  const leafletContainer = leafletMap.getContainer();
  const mapPane = leafletContainer.querySelector('.leaflet-map-pane') as HTMLElement;
  if (mapPane) {
    mapPane.style.display = "block";
  } else {
    // Fallback: show the entire container if map pane not found
    (leafletContainer as HTMLElement).style.display = "block";
  }
  
  state.is3D = false;
  
  console.log('✅ Exited 3D mode');
}

export function isInNRW(bbox4326: [number, number, number, number]): boolean {
  return inNrw(bbox4326);
}
