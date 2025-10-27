import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { GeoDataProvider } from "../provider";

/**
 * OSM (OpenStreetMap) geodata provider.
 * 
 * This is a wrapper around the existing OSM fetching functionality,
 * providing a consistent interface for the provider abstraction.
 * 
 * Uses:
 * - Overpass API for road network data
 * - OSM tile server for basemap
 */
export const osmProvider: GeoDataProvider = {
  id: "osm",
  
  /**
   * OSM provider supports all areas globally.
   */
  supports(): boolean {
    return true;
  },
  
  /**
   * Fetch road network using existing OSM utilities.
   * Converts GeoJSON polygon to the format expected by fetchOsmBundleForPolygon.
   */
  async fetchRoadNetwork(polygon: FeatureCollection | Feature<Polygon>): Promise<any> {
    // Import the existing OSM utility function
    const { fetchOsmBundleForPolygon } = await import("../../../utils/osm");
    
    // Convert GeoJSON polygon to Leaflet LatLng array format
    const ring = toLeafletLatLngArray(polygon);
    
    console.log(`[osmProvider] Fetching road data from OSM for polygon with ${ring.length} points`);
    
    try {
      const bundle = await fetchOsmBundleForPolygon(ring);
      console.log(`[osmProvider] Received OsmBundle: ${bundle.ways?.length || 0} ways`);
      return bundle;
    } catch (error) {
      console.error("[osmProvider] Failed to fetch from OSM:", error);
      throw new Error(`OSM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
  
  /**
   * Create standard OSM tile basemap layer.
   */
  makeBasemapLayer(): any {
    // @ts-ignore - Leaflet global types
    return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    });
  }
};

/**
 * Convert GeoJSON polygon to Leaflet LatLng array format.
 * 
 * The existing fetchOsmBundleForPolygon function expects an array of
 * {lat, lng} objects representing the polygon boundary.
 */
function toLeafletLatLngArray(polygon: FeatureCollection | Feature<Polygon>): Array<{lat: number, lng: number}> {
  let coordinates: number[][];
  
  if ('features' in polygon && polygon.features.length > 0) {
    // FeatureCollection - take first feature
    coordinates = (polygon.features[0].geometry as any).coordinates[0];
  } else if ('geometry' in polygon) {
    // Feature
    coordinates = (polygon.geometry as any).coordinates[0];
  } else {
    throw new Error("Invalid polygon format for OSM provider");
  }
  
  return coordinates.map((coord: number[]) => ({ 
    lat: coord[1], 
    lng: coord[0] 
  }));
}
