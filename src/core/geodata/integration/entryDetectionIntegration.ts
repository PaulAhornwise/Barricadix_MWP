import type { Feature, Polygon } from "geojson";
import type { OsmBundle } from "../provider";
import { pickProvider, getCurrentMapBbox4326, geoCache, cacheKey, simplePolygonHash } from "../index";

/**
 * Check if the proxy server is available.
 * Required for NRW WFS access which has CORS restrictions.
 */
async function isProxyAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch('http://localhost:3001/health', {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch road network data using the provider abstraction system.
 * 
 * This function replaces direct calls to fetchOsmBundleForPolygon with
 * a provider-aware approach that automatically selects the best available
 * data source (NRW WFS or OSM) based on location and availability.
 * 
 * Enhanced with:
 * - Proxy availability check for NRW WFS
 * - Multi-layer support matching main.py implementation
 * - Automatic fallback to OSM if NRW fails
 * 
 * @param polygonCoords Array of {lat, lng} coordinates defining the analysis area
 * @param signal Optional AbortSignal for request cancellation
 * @returns Promise resolving to OsmBundle compatible with entry detection engine
 */
export async function fetchRoadNetworkForPolygon(
  polygonCoords: Array<{lat: number, lng: number}>
): Promise<OsmBundle> {
  console.log(`[entryDetectionIntegration] Fetching road network for polygon with ${polygonCoords.length} points`);
  
  try {
    // Convert Leaflet coordinates to GeoJSON Feature format
    const polygonFeature = createPolygonFeatureFromCoords(polygonCoords);
    
    // Generate cache key for this polygon
    const polygonHash = simplePolygonHash(polygonFeature);
    
    // Get current map bounds to determine suitable provider
    const map = (window as any).map;
    if (!map) {
      throw new Error('Map instance not available for provider selection');
    }
    
    const bbox4326 = getCurrentMapBbox4326(map);
    let provider = await pickProvider(bbox4326);
    
    // Check proxy availability for NRW provider
    if (provider.id === 'nrw') {
      const proxyAvailable = await isProxyAvailable();
      if (!proxyAvailable) {
        console.warn('[entryDetectionIntegration] Proxy server not available - NRW WFS requires proxy for CORS');
        console.log('[entryDetectionIntegration] Start proxy server with: node proxy-server.js');
        console.log('[entryDetectionIntegration] Falling back to OSM provider');
        
        const { osmProvider } = await import("../providers/osmProvider");
        provider = osmProvider;
      } else {
        console.log('[entryDetectionIntegration] Proxy server available at localhost:3001');
      }
    }
    
    // Check cache first
    const cacheKeyStr = cacheKey(provider.id, polygonHash);
    const cachedData = geoCache.get(cacheKeyStr);
    
    if (cachedData) {
      console.log(`[entryDetectionIntegration] Using cached data from ${provider.id} provider`);
      return cachedData;
    }
    
    // Fetch fresh data from provider
    console.log(`[entryDetectionIntegration] Fetching fresh data from ${provider.id} provider`);
    
    let bundle: OsmBundle;
    let usedFallback = false;
    
    try {
      bundle = await provider.fetchRoadNetwork(polygonFeature);
      
      // Validate bundle has required structure
      if (!bundle || !Array.isArray(bundle.nodes) || !Array.isArray(bundle.ways)) {
        throw new Error(`Invalid bundle structure from ${provider.id} provider`);
      }
      
      // Check if NRW returned empty result
      if (provider.id === 'nrw' && bundle.ways.length === 0) {
        console.warn(`[entryDetectionIntegration] NRW returned 0 ways, falling back to OSM`);
        throw new Error('NRW returned no features');
      }
      
      console.log(`[entryDetectionIntegration] ✅ Received bundle from ${provider.id}: ${bundle.nodes.length} nodes, ${bundle.ways.length} ways`);
      
      // Log statistics about road types found (useful for debugging)
      if (bundle.ways.length > 0) {
        const roadTypes = new Map<string, number>();
        for (const way of bundle.ways) {
          const highway = (way.tags as any)?.highway || 'unknown';
          roadTypes.set(highway, (roadTypes.get(highway) || 0) + 1);
        }
        console.log(`[entryDetectionIntegration] Road types found:`, Object.fromEntries(roadTypes));
      }
      
    } catch (error) {
      console.warn(`[entryDetectionIntegration] Provider ${provider.id} failed:`, error);
      
      // Fallback to OSM provider
      if (provider.id !== 'osm') {
        console.log(`[entryDetectionIntegration] Falling back to OSM provider`);
        const { osmProvider } = await import("../providers/osmProvider");
        
        try {
          bundle = await osmProvider.fetchRoadNetwork(polygonFeature);
          console.log(`[entryDetectionIntegration] ✅ OSM fallback successful: ${bundle.nodes.length} nodes, ${bundle.ways.length} ways`);
          usedFallback = true;
          
          // Cache OSM result separately
          const osmKey = cacheKey('osm', polygonHash);
          geoCache.set(osmKey, bundle);
        } catch (osmError) {
          console.error(`[entryDetectionIntegration] OSM fallback also failed:`, osmError);
          throw new Error(`Both ${provider.id} and OSM providers failed. Last error: ${osmError instanceof Error ? osmError.message : 'Unknown error'}`);
        }
      } else {
        throw error;
      }
    }
    
    // Cache the result (if not already cached by fallback)
    if (!usedFallback) {
      geoCache.set(cacheKeyStr, bundle);
    }
    
    // Show fallback notification if applicable
    if (usedFallback) {
      showFallbackNotification(provider.id, 'osm');
    }
    
    return bundle;
    
  } catch (error) {
    console.error('[entryDetectionIntegration] Failed to fetch road network:', error);
    throw new Error(`Road network fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a GeoJSON Polygon Feature from Leaflet coordinate array.
 * 
 * @param coords Array of {lat, lng} coordinates
 * @returns GeoJSON Feature<Polygon>
 */
function createPolygonFeatureFromCoords(coords: Array<{lat: number, lng: number}>): Feature<Polygon> {
  // Convert to GeoJSON coordinate format [lon, lat]
  const coordinates = coords.map(coord => [coord.lng, coord.lat]);
  
  // Ensure polygon is closed (first and last coordinates should be the same)
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

/**
 * Show a notification when fallback occurs.
 * 
 * @param fromProvider Provider that was attempted first
 * @param toProvider Provider that was used as fallback
 */
function showFallbackNotification(fromProvider: string, toProvider: string): void {
  // Try to show a toast notification if available
  const toastContainer = document.querySelector('.toast-container');
  if (toastContainer) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-warning';
    toast.textContent = `${fromProvider.toUpperCase()} Daten nicht verfügbar – ${toProvider.toUpperCase()} verwendet.`;
    toastContainer.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);
  } else {
    // Fallback to console warning
    console.warn(`[entryDetectionIntegration] ${fromProvider} data unavailable - using ${toProvider} fallback`);
  }
}

/**
 * Clear the geodata cache.
 * Useful for forcing fresh data fetches or during testing.
 */
export function clearGeodataCache(): void {
  geoCache.clear();
  console.log('[entryDetectionIntegration] Geodata cache cleared');
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): { size: number, keys: string[] } {
  return {
    size: geoCache.size,
    keys: Array.from(geoCache.keys())
  };
}
