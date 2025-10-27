import type { GeoDataProvider } from "./provider";
import { nrwProvider } from "./providers/nrwProvider";
import { osmProvider } from "./providers/osmProvider";

/**
 * Ordered list of geodata providers.
 * Providers are tried in order, with the first suitable provider being selected.
 */
const providers: GeoDataProvider[] = [nrwProvider, osmProvider];

/**
 * Select the best available geodata provider for the given bounding box.
 * 
 * This function:
 * 1. Iterates through providers in order of preference
 * 2. Checks if each provider supports the given area (in EPSG:4326)
 * 3. Optionally performs a health check
 * 4. Returns the first suitable provider
 * 5. Falls back to OSM provider if no others are suitable
 * 
 * @param bbox4326 Bounding box in EPSG:4326 (lon/lat) format: [minLon, minLat, maxLon, maxLat]
 * @returns Promise resolving to the selected provider
 */
export async function pickProvider(bbox4326: [number, number, number, number]): Promise<GeoDataProvider> {
  console.info(`[pickProvider] bbox4326=${JSON.stringify(bbox4326)}`);
  
  for (const provider of providers) {
    try {
      console.log(`[pickProvider] Trying provider: ${provider.id}`);
      
      // Check if provider supports this area
      const supports = await Promise.resolve(provider.supports(bbox4326));
      if (!supports) {
        console.log(`[pickProvider] Provider ${provider.id} does not support this area`);
        continue;
      }
      
      // Optional health check
      if (provider.healthcheck) {
        try {
          const healthy = await provider.healthcheck();
          if (!healthy) {
            console.log(`[pickProvider] Provider ${provider.id} failed health check`);
            continue;
          }
        } catch (error) {
          console.warn(`[pickProvider] Provider ${provider.id} health check failed:`, error);
          continue;
        }
      }
      
      console.info(`[pickProvider] ✅ chosen=${provider.id}`);
      return provider;
      
    } catch (error) {
      console.warn(`[pickProvider] Error checking provider ${provider.id}:`, error);
      continue;
    }
  }
  
  // Fallback to OSM provider
  console.info(`[pickProvider] ✅ chosen=osm (fallback)`);
  return osmProvider;
}

/**
 * Get current map bounding box in EPSG:4326 format (lon/lat, WGS84).
 * 
 * This is a utility function to extract the current map bounds
 * in the format expected by pickProvider.
 * 
 * @param map Leaflet map instance
 * @returns Bounding box in EPSG:4326 format: [minLon, minLat, maxLon, maxLat]
 */
export function getCurrentMapBbox4326(map: any): [number, number, number, number] {
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  
  return [sw.lng, sw.lat, ne.lng, ne.lat];
}

/**
 * @deprecated Use getCurrentMapBbox4326 instead
 */
export function getCurrentMapBbox3857(map: any): [number, number, number, number] {
  // For backward compatibility, convert to 4326
  return getCurrentMapBbox4326(map);
}

// Re-export provider types and utilities for convenience
export type { GeoDataProvider, OsmBundle } from "./provider";
export { polygonBbox4326, simplePolygonHash, geoCache, cacheKey } from "./provider";
export { nrwProvider, osmProvider };
