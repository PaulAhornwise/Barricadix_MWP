import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { OsmNode, OsmWay } from "../../shared/graph/types";

/**
 * Core data structure for road network data that can be consumed by the entry detection engine.
 * This maintains compatibility with the existing topology/graph processing pipeline.
 */
export interface OsmBundle {
  nodes: OsmNode[];
  ways: OsmWay[];
}

/**
 * Interface for geodata providers that can fetch road networks and provide basemap layers.
 * Providers are responsible for converting their native data format to OsmBundle.
 */
export interface GeoDataProvider {
  /** Unique identifier for this provider */
  id: string;
  
  /** 
   * Check if this provider supports the given bounding box (in EPSG:3857 Web Mercator).
   * Used to determine if provider is applicable to current map extent.
   */
  supports(bbox3857: [number, number, number, number]): boolean | Promise<boolean>;
  
  /** 
   * Optional health check to verify provider availability.
   * Should be lightweight and not throw errors.
   */
  healthcheck?(): Promise<boolean>;
  
  /** 
   * Fetch road network data for the given polygon and convert to OsmBundle format.
   * The polygon should be in EPSG:4326 (GeoJSON standard).
   */
  fetchRoadNetwork(polygon: FeatureCollection | Feature<Polygon>): Promise<OsmBundle>;
  
  /** 
   * Optional: Fetch building data for the given polygon.
   * For future use in enhanced analysis.
   */
  fetchBuildings?(polygon: FeatureCollection | Feature<Polygon>): Promise<FeatureCollection>;
  
  /** 
   * Optional: Create a Leaflet basemap layer for this provider.
   * Should return a Leaflet layer that can be added to the map.
   */
  makeBasemapLayer?(): any;
}

/**
 * Calculate bounding box for a polygon in EPSG:4326 (WGS84).
 * Assumes GeoJSON input is in EPSG:4326 as per standard.
 */
export function polygonBbox4326(polygon: FeatureCollection | Feature<Polygon>): [number, number, number, number] {
  const coords: number[][] = [];
  
  // Recursively extract coordinates from GeoJSON geometry
  const walk = (g: any) => {
    if (!g) return;
    if (g.type === "Polygon") {
      g.coordinates[0].forEach(([lon, lat]: [number, number]) => coords.push([lon, lat]));
    } else if (g.type === "Feature") {
      walk(g.geometry);
    } else if (g.type === "FeatureCollection") {
      g.features.forEach((f: any) => walk(f));
    }
  };
  
  walk(polygon);
  
  // Calculate bounding box
  let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Generate a simple hash for polygon caching.
 * Uses first 2048 characters of JSON string for performance.
 */
export function simplePolygonHash(polygon: FeatureCollection | Feature<Polygon>): string {
  const s = JSON.stringify(polygon).slice(0, 2048);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `p${(h >>> 0).toString(16)}`;
}

/**
 * In-memory cache for geodata to avoid redundant network requests.
 * Keyed by provider ID and polygon hash.
 */
export const geoCache = new Map<string, any>();

/**
 * Generate cache key for a provider and polygon combination.
 */
export function cacheKey(providerId: string, polygonHash: string): string {
  return `${providerId}:${polygonHash}`;
}
