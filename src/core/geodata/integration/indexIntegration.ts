/**
 * Integration modifications for index.tsx to use the provider abstraction system.
 * 
 * This file contains the specific changes needed to integrate the geodata provider
 * abstraction into the existing Barricadix application.
 */

// Import the provider abstraction system
import { initializeMapWithProvider, updateMapProvider, getCurrentProviderId } from "./mapIntegration";
import { fetchRoadNetworkForPolygon } from "./entryDetectionIntegration";

/**
 * Modified map initialization function.
 * 
 * This replaces the hardcoded OSM tile layer initialization with
 * the provider-aware initialization system.
 * 
 * @param mapDiv HTML element for the map container
 * @param mapCenter Initial map center coordinates
 * @param initialZoom Initial zoom level
 */
export async function initializeMapWithProviderSystem(
  mapDiv: HTMLElement,
  mapCenter: [number, number],
  initialZoom: number
): Promise<any> {
  console.log('[indexIntegration] Initializing map with provider system');
  
  // Create Leaflet map instance
  const map = (window as any).L.map(mapDiv, {
    zoomControl: false,
    preferCanvas: true
  }).setView(mapCenter, initialZoom);

  // Add zoom control
  (window as any).L.control.zoom({
    position: 'bottomright'
  }).addTo(map);

  // Initialize with provider abstraction instead of hardcoded OSM tiles
  await initializeMapWithProvider(map);

  // Force map to calculate correct size after initialization
  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      console.log('[indexIntegration] Map size invalidated after initialization');
    }
  }, 100);

  // Add event listeners for map movement to update provider if needed
  let moveTimeout: number | undefined;
  map.on('moveend', () => {
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = window.setTimeout(async () => {
      try {
        await updateMapProvider(map);
      } catch (error) {
        console.warn('[indexIntegration] Failed to update map provider:', error);
      }
    }, 1000); // Debounce provider updates
  });

  // Store map globally for access from other functions
  (window as any).map = map;
  
  return map;
}

/**
 * Modified OSM data fetching function.
 * 
 * This replaces direct calls to fetchOsmBundleForPolygon with
 * the provider-aware fetching system.
 * 
 * @param polygonCoords Array of {lat, lng} coordinates
 * @param signal Optional AbortSignal for cancellation
 * @returns Promise resolving to OsmBundle
 */
export async function fetchOsmDataWithProvider(
  polygonCoords: Array<{lat: number, lng: number}>,
  signal?: AbortSignal
): Promise<any> {
  console.log('[indexIntegration] Fetching OSM data with provider system');
  
  try {
    // Use the provider-aware fetching function
    const osmData = await fetchRoadNetworkForPolygon(polygonCoords);
    
    // Update global state (maintaining compatibility with existing code)
    (window as any).currentOsmData = osmData;
    
    // Update speed limiter if available
    if ((window as any).osmSpeedLimiter) {
      (window as any).osmSpeedLimiter.setOsmData(osmData);
    }
    
    // Show current provider in UI
    const currentProvider = getCurrentProviderId();
    console.log(`[indexIntegration] Data fetched using ${currentProvider} provider`);
    
    return osmData;
    
  } catch (error) {
    console.error('[indexIntegration] Failed to fetch OSM data with provider:', error);
    throw error;
  }
}

/**
 * Add provider information to the UI.
 * 
 * This creates a small indicator showing which data source is currently active.
 */
export function addProviderIndicator(): void {
  // Check if indicator already exists
  if (document.getElementById('provider-indicator')) {
    return;
  }

  const indicator = document.createElement('div');
  indicator.id = 'provider-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    color: #333;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    z-index: 1000;
    pointer-events: none;
  `;
  
  // Update indicator text based on current provider
  const updateIndicator = () => {
    const providerId = getCurrentProviderId();
    const text = providerId === 'nrw' ? 'Quelle: GEOBASIS.NRW' : 'Quelle: OSM';
    indicator.textContent = text;
  };
  
  // Initial update
  updateIndicator();
  
  // Add to document
  document.body.appendChild(indicator);
  
  // Update when provider changes (could be enhanced with event system)
  setInterval(updateIndicator, 5000);
}

/**
 * Initialize the provider abstraction system.
 * 
 * This should be called early in the application lifecycle.
 */
export async function initializeProviderSystem(): Promise<void> {
  console.log('[indexIntegration] Initializing provider abstraction system');
  
  try {
    // Add provider indicator to UI
    addProviderIndicator();
    
    console.log('[indexIntegration] Provider system initialized successfully');
    
  } catch (error) {
    console.error('[indexIntegration] Failed to initialize provider system:', error);
    // Don't throw - allow app to continue with fallback
  }
}
