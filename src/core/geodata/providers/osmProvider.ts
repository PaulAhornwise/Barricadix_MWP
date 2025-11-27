import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { GeoDataProvider, OsmBundle } from "../provider";
import type { OsmNode, OsmWay } from "../../../shared/graph/types";

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
  async fetchRoadNetwork(polygon: FeatureCollection | Feature<Polygon>): Promise<OsmBundle> {
    // Import the existing OSM utility function
    const { fetchOsmBundleForPolygon } = await import("../../../utils/osm");
    
    // Convert GeoJSON polygon to Leaflet LatLng array format
    const ring = toLeafletLatLngArray(polygon);
    
    console.log(`[osmProvider] Fetching road data from OSM for polygon with ${ring.length} points`);
    
    try {
      const liteBundle = await fetchOsmBundleForPolygon(ring);
      console.log(`[osmProvider] Received lite bundle: ${liteBundle.ways?.length || 0} ways`);
      
      // Convert lite bundle (ways with inline coordinates) to OsmBundle (nodes + nodeIds)
      const nodes: OsmNode[] = [];
      const ways: OsmWay[] = [];
      const nodeMap = new Map<string, OsmNode>();
      let nodeIdCounter = 1;
      
      liteBundle.ways.forEach(way => {
        const nodeIds: Array<number> = [];
        (way.nodes || []).forEach(coord => {
          if (!coord) return;
          const key = `${coord.lat.toFixed(7)},${coord.lon.toFixed(7)}`;
          let node = nodeMap.get(key);
          if (!node) {
            node = { id: nodeIdCounter++, lat: coord.lat, lon: coord.lon };
            nodeMap.set(key, node);
            nodes.push(node);
          }
          nodeIds.push(node.id as number);
        });
        
        if (nodeIds.length > 1) {
          ways.push({
            id: way.id,
            nodeIds,
            tags: way.tags || {}
          });
        }
      });
      
      console.log(`[osmProvider] Converted to OsmBundle: ${nodes.length} nodes, ${ways.length} ways`);
      return { nodes, ways, calming: liteBundle.calming || [] };
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
