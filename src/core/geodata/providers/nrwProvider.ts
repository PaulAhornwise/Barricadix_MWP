import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import type { GeoDataProvider, OsmBundle } from "../provider";

// NRW extent in EPSG:4326 (lon/lat, WGS84)
// Covers North Rhine-Westphalia: roughly 5.86°E to 9.46°E, 50.32°N to 52.53°N
const NRW_BBOX_4326: [number, number, number, number] = [5.86, 50.32, 9.46, 52.53];

/**
 * Check if two bounding boxes intersect using simple AABB intersection test.
 */
function intersects(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

/**
 * Check if a point (lon, lat) is contained within a bbox.
 */
function contains(bbox: [number, number, number, number], lon: number, lat: number): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

// ID generators for OSM-compatible node and way IDs
let _nodeId = 1;
let _wayId = 1;

/**
 * NRW (North Rhine-Westphalia) geodata provider.
 * 
 * Uses GEOBASIS.NRW services:
 * - WFS for road network data (INSPIRE RoadLink)
 * - WMS for basemap tiles
 * 
 * Falls back to OSM if outside NRW bounds or service unavailable.
 */
export const nrwProvider: GeoDataProvider = {
  id: "nrw",
  
  /**
   * Check if the given bounding box (EPSG:4326, lon/lat) intersects with NRW territory.
   */
  supports(bbox4326: [number, number, number, number]): boolean {
    const cx = (bbox4326[0] + bbox4326[2]) / 2;
    const cy = (bbox4326[1] + bbox4326[3]) / 2;
    const result = intersects(bbox4326, NRW_BBOX_4326) || contains(NRW_BBOX_4326, cx, cy);
    console.info(`[nrwProvider.supports] bbox4326=${JSON.stringify(bbox4326)}, center=[${cx.toFixed(4)}, ${cy.toFixed(4)}], NRW=${result}`);
    return result;
  },
  
  /**
   * Optional health check - could ping GetCapabilities in the future.
   * For now, assume service is available if we're in NRW bounds.
   */
  async healthcheck(): Promise<boolean> {
    // TODO: Could implement actual WFS GetCapabilities ping here
    return true;
  },
  
  /**
   * Fetch road network from NRW WFS and convert to OsmBundle format.
   */
  async fetchRoadNetwork(polygon: FeatureCollection | Feature<Polygon>): Promise<OsmBundle> {
    const { polygonBbox4326 } = await import("../provider");
    const [minLon, minLat, maxLon, maxLat] = polygonBbox4326(polygon);
    
    // Build WFS request URL for NRW INSPIRE RoadLink service
    const url = new URL("https://www.wfs.nrw.de/wfs/DE_NW_SBV_INSPIRE_Downloadservice_Strassennetz");
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", "tn-ro:RoadLink");
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("SRSNAME", "EPSG:4326");
    url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`);
    
    console.info(`[nrwProvider] WFS URL=${url.toString()}`);
    console.info(`[nrwProvider] WFS bbox4326=[${minLon}, ${minLat}, ${maxLon}, ${maxLat}]`);
    
    try {
      const res = await fetch(url.toString());
      
      // Check for specific error conditions
      if (!res.ok) {
        const statusText = res.statusText || 'Unknown error';
        let errorMessage = `NRW WFS failed with status ${res.status}`;
        
        if (res.status === 400) {
          errorMessage = `NRW WFS Bad Request (400) - Invalid bounding box or parameters`;
        } else if (res.status === 0 || res.status === 200 && res.type === 'opaque') {
          errorMessage = `NRW WFS CORS error - Browser blocked request from ${url.origin}`;
        } else {
          errorMessage = `NRW WFS error: ${res.status} ${statusText}`;
        }
        
        console.error(`[nrwProvider] ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      const fc: FeatureCollection = await res.json();
      
      // Validate response structure
      if (!fc || !fc.features || !Array.isArray(fc.features)) {
        throw new Error('Invalid NRW WFS response format: missing features array');
      }
      
      console.log(`[nrwProvider] Received ${fc.features.length} features from NRW WFS`);
      
      const { nodes, ways } = wfsToOsm(fc);
      
      if (!ways.length) {
        console.warn("[nrwProvider] No road features found in NRW WFS response, consider fallback to OSM.");
      }
      
      return { nodes, ways };
    } catch (error) {
      console.error("[nrwProvider] Failed to fetch from NRW WFS:", error);
      
      // Provide helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('CORS')) {
          console.warn("[nrwProvider] CORS policy blocked WFS request - will use OSM fallback");
          throw error; // Re-throw to trigger fallback
        }
        throw new Error(`NRW WFS request failed: ${error.message}`);
      }
      
      throw new Error(`NRW WFS request failed: Unknown error`);
    }
  },
  
  /**
   * Create NRW WMS basemap layer.
   */
  makeBasemapLayer(): any {
    // Use WMS to avoid additional WMTS plugin dependencies
    // @ts-ignore - Leaflet global types
    return L.tileLayer.wms("https://www.wms.nrw.de/geobasis/wms_nw_dtk", {
      layers: "nw_dtk_col",
      format: "image/png",
      transparent: false,
      attribution: "© GEOBASIS.NRW"
    });
  }
};

/**
 * Convert WFS FeatureCollection to OsmBundle format.
 * 
 * This is the critical mapping function that converts NRW road data
 * to the format expected by our existing entry detection engine.
 */
function wfsToOsm(fc: FeatureCollection): OsmBundle {
  const nodes: any[] = [];
  const ways: any[] = [];
  
  for (const feature of fc.features) {
    if (!feature.geometry || feature.geometry.type !== "LineString") {
      continue;
    }
    
    const lineString = feature.geometry as LineString;
    const nodeIds: number[] = [];
    
    // Create nodes for each coordinate in the LineString
    for (const [lon, lat] of lineString.coordinates) {
      const id = _nodeId++;
      nodes.push({ id, lon, lat });
      nodeIds.push(id);
    }
    
    // Create way with minimal tag mapping
    const tags = normalizeTags(feature.properties || {});
    ways.push({ id: _wayId++, nodeIds, tags });
  }
  
  console.log(`[nrwProvider] Converted WFS to OsmBundle: ${nodes.length} nodes, ${ways.length} ways`);
  
  return { nodes, ways } as OsmBundle;
}

/**
 * Normalize NRW WFS properties to OSM-style tags.
 * 
 * This is a best-effort mapping focusing on topology-first approach.
 * The entry detection engine primarily uses geometric relationships,
 * so minimal tag mapping is acceptable.
 */
function normalizeTags(props: Record<string, any>): Record<string, string> {
  const tags: Record<string, string> = {};
  
  // Map NRW road classification to OSM highway tags
  if (props.roadClass) {
    tags.highway = classifyRoadType(props.roadClass);
  }
  
  // Add source attribution
  tags.source = "GEOBASIS.NRW";
  
  return tags;
}

/**
 * Map NRW road classification values to OSM highway types.
 * 
 * This is a simplified mapping - in production, you might want
 * to consult NRW documentation for more precise classifications.
 */
function classifyRoadType(roadClass: any): string {
  const classStr = String(roadClass).toLowerCase();
  
  // Basic mapping based on common NRW road classifications
  if (classStr.includes('motorway') || classStr.includes('autobahn')) {
    return 'motorway';
  }
  if (classStr.includes('primary') || classStr.includes('hauptstrasse')) {
    return 'primary';
  }
  if (classStr.includes('secondary') || classStr.includes('landstrasse')) {
    return 'secondary';
  }
  if (classStr.includes('tertiary') || classStr.includes('kreisstrasse')) {
    return 'tertiary';
  }
  if (classStr.includes('residential') || classStr.includes('wohngebiet')) {
    return 'residential';
  }
  if (classStr.includes('service') || classStr.includes('zufahrt')) {
    return 'service';
  }
  
  // Default fallback
  return 'road';
}
