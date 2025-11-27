import type { GeoDataProvider } from "../provider";
import { pickProvider, getCurrentMapBbox4326 } from "../index";
import { SourceAttributionControl } from "../controls/SourceAttributionControl";

/**
 * Current active provider - stored globally for access from other parts of the app
 */
let currentProvider: GeoDataProvider | null = null;
let sourceAttributionControl: SourceAttributionControl | null = null;

/**
 * Initialize map with provider-based basemap and attribution.
 * 
 * This function replaces the hardcoded OSM tile layer with a dynamic
 * provider selection system that chooses the best available basemap.
 * 
 * @param map Leaflet map instance
 * @returns Promise resolving when initialization is complete
 */
export async function initializeMapWithProvider(map: any): Promise<void> {
  console.log('[mapIntegration] Initializing map with provider abstraction');
  
  try {
    // Get current map bounds in EPSG:4326 (lon/lat) to determine suitable provider
    const bbox4326 = getCurrentMapBbox4326(map);
    
    // Select the best provider for this area
    currentProvider = await pickProvider(bbox4326);
    console.log(`[mapIntegration] Selected provider: ${currentProvider.id}`);
    
    // Create basemap layer from selected provider
    let basemapLayer: any = null;
    
    if (currentProvider.makeBasemapLayer) {
      basemapLayer = currentProvider.makeBasemapLayer();
    }
    
    // If no basemap layer available, fall back to OSM
    if (!basemapLayer) {
      console.warn('[mapIntegration] No basemap layer available, falling back to OSM');
      const { osmProvider } = await import("../providers/osmProvider");
      basemapLayer = osmProvider.makeBasemapLayer?.();
      if (basemapLayer) {
        currentProvider = osmProvider;
      }
    }
    
    // Add basemap layer to map
    basemapLayer.addTo(map);
    
    // Add source attribution control
    addSourceAttributionControl(map, currentProvider.id);
    
    // Store reference to basemap layer for potential removal
    (map as any)._currentBasemapLayer = basemapLayer;
    
    // Add event listeners for automatic provider switching
    addMapEventListeners(map);
    
    console.log(`[mapIntegration] Map initialized with ${currentProvider.id} provider`);
    
  } catch (error) {
    console.error('[mapIntegration] Failed to initialize map with provider:', error);
    
    // Fallback to OSM on any error
    const { osmProvider } = await import("../providers/osmProvider");
    const fallbackLayer = osmProvider.makeBasemapLayer?.();
    if (fallbackLayer) {
      fallbackLayer.addTo(map);
      currentProvider = osmProvider;
      addSourceAttributionControl(map, osmProvider.id);
    }
    
    console.log('[mapIntegration] Fallback to OSM provider completed');
    
    // Add event listeners even in fallback case
    addMapEventListeners(map);
  }
}

/**
 * Update map provider when view changes significantly.
 * 
 * This can be called when the user moves to a different region
 * where a different provider might be more appropriate.
 * 
 * @param map Leaflet map instance
 */
export async function updateMapProvider(map: any): Promise<void> {
  console.log('[mapIntegration] Updating map provider based on current view');
  
  try {
    const bbox4326 = getCurrentMapBbox4326(map);
    const newProvider = await pickProvider(bbox4326);
    
    // Only update if provider changed
    if (!currentProvider || newProvider.id !== currentProvider.id) {
      console.log(`[mapIntegration] Provider changed: ${currentProvider?.id || 'none'} -> ${newProvider.id}`);
      
      // Remove current basemap layer
      const currentBasemapLayer = (map as any)._currentBasemapLayer;
      if (currentBasemapLayer) {
        map.removeLayer(currentBasemapLayer);
      }
      
      // Add new basemap layer
      let newBasemapLayer: any = null;
      
      if (newProvider.makeBasemapLayer) {
        newBasemapLayer = newProvider.makeBasemapLayer();
      }
      
      if (!newBasemapLayer) {
        const { osmProvider } = await import("../providers/osmProvider");
        newBasemapLayer = osmProvider.makeBasemapLayer?.();
        if (newBasemapLayer) {
          currentProvider = osmProvider;
        }
      } else {
        currentProvider = newProvider;
      }
      
      newBasemapLayer.addTo(map);
      (map as any)._currentBasemapLayer = newBasemapLayer;
      
      // Update source attribution
      addSourceAttributionControl(map, currentProvider?.id || 'unknown');
      
      console.log(`[mapIntegration] Provider updated to: ${currentProvider?.id || 'unknown'}`);
    }
    
  } catch (error) {
    console.error('[mapIntegration] Failed to update map provider:', error);
  }
}

/**
 * Add event listeners to the map for automatic provider switching.
 * 
 * @param map Leaflet map instance
 */
function addMapEventListeners(map: any): void {
  console.log('[mapIntegration] Adding event listeners for automatic provider switching');
  
  // Debounce timer to avoid too frequent provider checks
  let providerCheckTimeout: NodeJS.Timeout | null = null;
  
  const checkProviderChange = () => {
    if (providerCheckTimeout) {
      clearTimeout(providerCheckTimeout);
    }
    
    providerCheckTimeout = setTimeout(async () => {
      console.log('🔄 Map moved - checking if provider should change...');
      
      try {
        const bbox4326 = getCurrentMapBbox4326(map);
        const newProvider = await pickProvider(bbox4326);
        
        // Only update if provider actually changed
        if (!currentProvider || newProvider.id !== currentProvider.id) {
          console.log(`🔄 Provider change detected: ${currentProvider?.id || 'none'} → ${newProvider.id}`);
          await updateMapProvider(map);
        }
      } catch (error) {
        console.error('[mapIntegration] Error checking provider change:', error);
      }
    }, 1000); // 1 second debounce
  };
  
  // Listen for map movement events
  map.on('moveend', checkProviderChange);
  map.on('zoomend', checkProviderChange);
  
  console.log('[mapIntegration] Event listeners added for moveend and zoomend');
}

/**
 * Add source attribution control to the map.
 * 
 * @param map Leaflet map instance
 * @param providerId Current provider ID
 */
function addSourceAttributionControl(map: any, providerId: string): void {
  // Remove existing control if present
  if (sourceAttributionControl) {
    map.removeControl(sourceAttributionControl);
  }
  
  // Create new control
  sourceAttributionControl = new SourceAttributionControl({
    position: 'bottomleft'
  });
  
  sourceAttributionControl.setProvider(providerId);
  sourceAttributionControl.addTo(map);
  
  console.log(`[mapIntegration] Added source attribution control: ${providerId}`);
}

/**
 * Get the current active provider.
 * 
 * @returns Current provider or null if not initialized
 */
export function getCurrentProvider(): GeoDataProvider | null {
  return currentProvider;
}

/**
 * Get the current provider ID.
 * 
 * @returns Current provider ID or 'unknown' if not initialized
 */
export function getCurrentProviderId(): string {
  return currentProvider?.id || 'unknown';
}

/**
 * Toggle between GEONRW and OSM basemap providers.
 * 
 * This function allows manual switching between the two available basemap providers
 * regardless of the current map location.
 * 
 * @param map Leaflet map instance
 * @returns Promise resolving when toggle is complete
 */
export async function toggleBasemapProvider(map: any): Promise<void> {
  console.log('[mapIntegration] Toggling basemap provider');
  
  try {
    // Import both providers
    const { nrwProvider } = await import("../providers/nrwProvider");
    const { osmProvider } = await import("../providers/osmProvider");
    
    // Determine target provider (switch from current to the other)
    const targetProviderId = currentProvider?.id === 'nrw' ? 'osm' : 'nrw';
    const targetProvider = targetProviderId === 'nrw' ? nrwProvider : osmProvider;
    
    console.log(`[mapIntegration] Switching from ${currentProvider?.id || 'unknown'} to ${targetProviderId}`);
    
    // Remove current basemap layer
    const currentBasemapLayer = (map as any)._currentBasemapLayer;
    if (currentBasemapLayer) {
      map.removeLayer(currentBasemapLayer);
      console.log('[mapIntegration] Removed current basemap layer');
    }
    
    // Create and add new basemap layer
    const newBasemapLayer = targetProvider.makeBasemapLayer();
    if (newBasemapLayer) {
      newBasemapLayer.addTo(map);
      (map as any)._currentBasemapLayer = newBasemapLayer;
      currentProvider = targetProvider;
      console.log(`[mapIntegration] Added new basemap layer from ${targetProviderId} provider`);
    } else {
      console.error(`[mapIntegration] Failed to create basemap layer from ${targetProviderId} provider`);
      return;
    }
    
    // Update source attribution
    addSourceAttributionControl(map, targetProviderId);
    
    // Update attribution div if it exists (for compatibility with index.tsx)
    const attributionDiv = document.getElementById('provider-attribution');
    if (attributionDiv) {
      attributionDiv.textContent = targetProviderId === 'nrw' ? 'Quelle: GEOBASIS.NRW' : 'Quelle: OSM';
    }
    
    // Store provider globally for data fetching (for compatibility with index.tsx)
    (window as any).currentProvider = targetProvider;
    
    console.log(`[mapIntegration] Successfully toggled to ${targetProviderId} provider`);
    
  } catch (error) {
    console.error('[mapIntegration] Failed to toggle basemap provider:', error);
  }
}
