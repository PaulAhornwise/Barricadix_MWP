import type { Feature, FeatureCollection, LineString, Polygon, MultiLineString, GeometryCollection } from "geojson";
import type { GeoDataProvider, OsmBundle } from "../provider";

// NRW extent in EPSG:4326 (lon/lat, WGS84)
// Covers North Rhine-Westphalia: roughly 5.86°E to 9.46°E, 50.32°N to 52.53°N
const NRW_BBOX_4326: [number, number, number, number] = [5.86, 50.32, 9.46, 52.53];

// WFS configuration matching the working main.py
const NRW_WFS_URL = "http://www.wfs.nrw.de/geobasis/wfs_nw_inspire-verkehrsnetze_atkis-basis-dlm";
const NRW_WFS_LAYERS = ['tn-ro:RoadLink', 'tn-ro:Road', 'tn-ro:RoadArea', 'tn-ro:ERoad'];

// Use local proxy to avoid CORS issues (same as main.py uses Python backend)
const USE_PROXY = true;
const PROXY_BASE_URL = "http://localhost:3001";

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
 * Transform coordinates from EPSG:4326 (WGS84) to EPSG:25832 (ETRS89 / UTM zone 32N - NRW native CRS)
 * Using simplified Proj4 formulas for the specific transformation
 */
function transformTo25832(lon: number, lat: number): [number, number] {
  // UTM Zone 32N parameters
  const k0 = 0.9996;
  const a = 6378137.0; // WGS84 semi-major axis
  const e = 0.0818191908426; // WGS84 eccentricity
  const e2 = e * e;
  const lon0 = 9.0; // Central meridian for UTM zone 32

  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const lon0Rad = lon0 * Math.PI / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = (e2 / (1 - e2)) * Math.cos(latRad) * Math.cos(latRad);
  const A = (lonRad - lon0Rad) * Math.cos(latRad);
  
  // Calculate M (meridional arc)
  const M = a * (
    (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256) * latRad
    - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024) * Math.sin(2*latRad)
    + (15*e2*e2/256 + 45*e2*e2*e2/1024) * Math.sin(4*latRad)
    - (35*e2*e2*e2/3072) * Math.sin(6*latRad)
  );

  const x = k0 * N * (A + (1-T+C)*A*A*A/6 + (5-18*T+T*T+72*C-58*(e2/(1-e2)))*A*A*A*A*A/120) + 500000;
  const y = k0 * (M + N * Math.tan(latRad) * (A*A/2 + (5-T+9*C+4*C*C)*A*A*A*A/24 + (61-58*T+T*T+600*C-330*(e2/(1-e2)))*A*A*A*A*A*A/720));

  return [x, y];
}

/**
 * Transform coordinates from EPSG:25832 to EPSG:4326
 */
function transformTo4326(x: number, y: number): [number, number] {
  // UTM Zone 32N parameters
  const k0 = 0.9996;
  const a = 6378137.0;
  const e = 0.0818191908426;
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lon0 = 9.0;

  const xAdj = x - 500000;
  const M = y / k0;
  
  const mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));
  
  const phi1 = mu + (3*e1/2 - 27*e1*e1*e1/32) * Math.sin(2*mu)
    + (21*e1*e1/16 - 55*e1*e1*e1*e1/32) * Math.sin(4*mu)
    + (151*e1*e1*e1/96) * Math.sin(6*mu);
    
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const C1 = (e2 / (1 - e2)) * Math.cos(phi1) * Math.cos(phi1);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = xAdj / (N1 * k0);

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D*D/2 - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*(e2/(1-e2)))*D*D*D*D/24
    + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*(e2/(1-e2)) - 3*C1*C1)*D*D*D*D*D*D/720);
    
  const lon = lon0 + (D - (1 + 2*T1 + C1)*D*D*D/6 + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*(e2/(1-e2)) + 24*T1*T1)*D*D*D*D*D/120) / Math.cos(phi1);

  return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}

/**
 * Transform bounding box from EPSG:4326 to EPSG:25832 with buffer
 */
function transformBbox4326To25832(bbox4326: [number, number, number, number], buffer: number = 1000): [number, number, number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox4326;
  const [minX, minY] = transformTo25832(minLon, minLat);
  const [maxX, maxY] = transformTo25832(maxLon, maxLat);
  
  // Add buffer (matching main.py: min - 1000, max + 1000)
  return [minX - buffer, minY - buffer, maxX + buffer, maxY + buffer];
}

/**
 * NRW (North Rhine-Westphalia) geodata provider.
 * 
 * Uses GEOBASIS.NRW INSPIRE WFS services for road network data:
 * - tn-ro:RoadLink - Road center lines
 * - tn-ro:Road - Road areas
 * - tn-ro:RoadArea - Road surface areas (converted to boundary lines)
 * - tn-ro:ERoad - European roads
 * 
 * Coordinates are transformed between EPSG:4326 (WGS84) and EPSG:25832 (NRW native CRS)
 * to ensure accurate spatial queries matching the working main.py implementation.
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
   * Health check - verify WFS service is reachable
   */
  async healthcheck(): Promise<boolean> {
    try {
      const testUrl = USE_PROXY 
        ? `${PROXY_BASE_URL}/nrw-wfs?service=WFS&request=GetCapabilities`
        : `${NRW_WFS_URL}?service=WFS&request=GetCapabilities`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(testUrl, { 
        method: 'HEAD',
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      return res.ok || res.status === 405; // 405 is OK for HEAD on some WFS servers
    } catch (error) {
      console.warn("[nrwProvider] Health check failed:", error);
      return false;
    }
  },
  
  /**
   * Fetch road network from NRW WFS and convert to OsmBundle format.
   * Queries multiple layers and combines results (matching main.py logic).
   */
  async fetchRoadNetwork(polygon: FeatureCollection | Feature<Polygon>): Promise<OsmBundle> {
    const { polygonBbox4326 } = await import("../provider");
    const bbox4326 = polygonBbox4326(polygon);
    
    // Transform to EPSG:25832 with buffer (matching main.py: bbox_25832 = transform_bbox(...))
    const bbox25832 = transformBbox4326To25832(bbox4326, 1000);
    const bboxStr = `${bbox25832[0]},${bbox25832[1]},${bbox25832[2]},${bbox25832[3]},EPSG:25832`;
    
    console.info(`[nrwProvider] Querying bbox4326=[${bbox4326.join(', ')}]`);
    console.info(`[nrwProvider] Transformed to bbox25832=[${bbox25832.map(v => v.toFixed(2)).join(', ')}]`);
    
    const allFeatures: any[] = [];
    const layerResults: Record<string, number> = {};
    
    // Query all layers (matching main.py: layer_names = ['tn-ro:RoadLink', 'tn-ro:Road', 'tn-ro:RoadArea', 'tn-ro:ERoad'])
    for (const layerName of NRW_WFS_LAYERS) {
      try {
        const features = await fetchWfsLayer(layerName, bboxStr);
        layerResults[layerName] = features.length;
        
        // For RoadArea: Convert polygons to boundary lines (matching main.py)
        if (layerName === 'tn-ro:RoadArea') {
          const lineFeatures = convertPolygonsToLines(features);
          allFeatures.push(...lineFeatures);
          console.log(`[nrwProvider] Layer ${layerName}: ${features.length} areas → ${lineFeatures.length} boundary lines`);
        } else {
          allFeatures.push(...features);
          console.log(`[nrwProvider] Layer ${layerName}: ${features.length} features`);
        }
      } catch (error) {
        console.warn(`[nrwProvider] Layer ${layerName} failed:`, error);
        layerResults[layerName] = 0;
        // Continue with other layers (matching main.py error handling)
      }
    }
    
    console.info(`[nrwProvider] Total features from all layers:`, layerResults);
    console.info(`[nrwProvider] Combined features: ${allFeatures.length}`);
    
    if (allFeatures.length === 0) {
      console.warn("[nrwProvider] No features from any NRW WFS layer - will trigger fallback to OSM");
      throw new Error("NRW WFS returned no features from any layer");
    }
    
    // Convert to OsmBundle format with coordinate transformation back to 4326
    const { nodes, ways } = wfsToOsm({ type: "FeatureCollection", features: allFeatures }, true);
    
    console.log(`[nrwProvider] Converted to OsmBundle: ${nodes.length} nodes, ${ways.length} ways`);
    return { nodes, ways };
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
 * Fetch a single WFS layer with proper error handling
 */
async function fetchWfsLayer(layerName: string, bboxStr: string): Promise<any[]> {
  const baseUrl = USE_PROXY ? `${PROXY_BASE_URL}/nrw-wfs` : NRW_WFS_URL;
  
  const url = new URL(baseUrl);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", layerName);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("SRSNAME", "EPSG:25832");
  url.searchParams.set("bbox", bboxStr);
  
  console.log(`[nrwProvider] Fetching layer ${layerName}: ${url.toString()}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('xml') || contentType.includes('html')) {
      // WFS might return XML error instead of JSON
      const text = await res.text();
      if (text.includes('Exception') || text.includes('error')) {
        throw new Error(`WFS returned error: ${text.substring(0, 200)}`);
      }
      throw new Error(`Unexpected content type: ${contentType}`);
    }
    
    const fc = await res.json() as FeatureCollection;
    
    if (!fc || !fc.features || !Array.isArray(fc.features)) {
      return [];
    }
    
    return fc.features;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Timeout fetching layer ${layerName}`);
    }
    throw error;
  }
}

/**
 * Convert polygon features to LineString boundaries (for RoadArea layer)
 * Matching main.py: layer_gdf['geometry'] = layer_gdf.geometry.boundary
 */
function convertPolygonsToLines(features: any[]): any[] {
  const lineFeatures: any[] = [];
  
  for (const feature of features) {
    if (!feature.geometry) continue;
    
    const geomType = feature.geometry.type;
    
    if (geomType === 'Polygon') {
      // Convert polygon exterior ring to LineString
      const coords = feature.geometry.coordinates[0]; // Outer ring
      if (coords && coords.length > 2) {
        lineFeatures.push({
          ...feature,
          geometry: {
            type: 'LineString',
            coordinates: coords
          }
        });
      }
    } else if (geomType === 'MultiPolygon') {
      // Convert each polygon to LineString
      for (const polygon of feature.geometry.coordinates) {
        const coords = polygon[0]; // Outer ring
        if (coords && coords.length > 2) {
          lineFeatures.push({
            ...feature,
            geometry: {
              type: 'LineString',
              coordinates: coords
            }
          });
        }
      }
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
      // Already a line, keep as-is
      lineFeatures.push(feature);
    }
  }
  
  return lineFeatures;
}

/**
 * Convert WFS FeatureCollection to OsmBundle format.
 * 
 * This is the critical mapping function that converts NRW road data
 * to the format expected by our existing entry detection engine.
 * 
 * @param fc FeatureCollection from WFS
 * @param transformFromEpsg25832 Whether to transform coordinates from EPSG:25832 to EPSG:4326
 */
function wfsToOsm(fc: FeatureCollection, transformFromEpsg25832: boolean = false): OsmBundle {
  const nodes: any[] = [];
  const ways: any[] = [];
  const nodeMap = new Map<string, number>(); // De-duplicate nodes by coordinate
  
  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    
    const geomType = feature.geometry.type;
    let coordinates: number[][] = [];
    
    // Handle different geometry types
    if (geomType === "LineString") {
      coordinates = (feature.geometry as LineString).coordinates;
    } else if (geomType === "MultiLineString") {
      // Flatten MultiLineString to individual LineStrings
      const multiLine = feature.geometry as MultiLineString;
      for (const line of multiLine.coordinates) {
        const nodeIds = processCoordinates(line, nodes, nodeMap, transformFromEpsg25832);
        if (nodeIds.length > 1) {
          const tags = normalizeTags(feature.properties || {});
          ways.push({ id: _wayId++, nodeIds, tags });
        }
      }
      continue; // Already processed
    } else {
      // Skip other geometry types
      continue;
    }
    
    const nodeIds = processCoordinates(coordinates, nodes, nodeMap, transformFromEpsg25832);
    
    if (nodeIds.length > 1) {
      const tags = normalizeTags(feature.properties || {});
      ways.push({ id: _wayId++, nodeIds, tags });
    }
  }
  
  console.log(`[nrwProvider] Converted WFS to OsmBundle: ${nodes.length} unique nodes, ${ways.length} ways`);
  
  return { nodes, ways } as OsmBundle;
}

/**
 * Process coordinates and create nodes, with optional coordinate transformation
 */
function processCoordinates(
  coordinates: number[][], 
  nodes: any[], 
  nodeMap: Map<string, number>,
  transformFromEpsg25832: boolean
): number[] {
  const nodeIds: number[] = [];
  
  for (const coord of coordinates) {
    if (!coord || coord.length < 2) continue;
    
    let lon: number, lat: number;
    
    if (transformFromEpsg25832) {
      // Transform from EPSG:25832 (x, y) to EPSG:4326 (lon, lat)
      [lon, lat] = transformTo4326(coord[0], coord[1]);
    } else {
      // Already in EPSG:4326 (lon, lat)
      [lon, lat] = coord;
    }
    
    // Round to ~1m precision for de-duplication
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    
    let nodeId = nodeMap.get(key);
    if (nodeId === undefined) {
      nodeId = _nodeId++;
      nodes.push({ id: nodeId, lon, lat });
      nodeMap.set(key, nodeId);
    }
    
    nodeIds.push(nodeId);
  }
  
  return nodeIds;
}

/**
 * Normalize NRW WFS properties to OSM-style tags.
 * 
 * Enhanced mapping based on ATKIS-Basis-DLM attributes.
 * The entry detection engine primarily uses geometric relationships,
 * but better tags improve speed estimation and road classification.
 */
function normalizeTags(props: Record<string, any>): Record<string, string> {
  const tags: Record<string, string> = {};
  
  // Map various NRW road attributes to OSM tags
  const roadClass = props.roadClass || props.funktionaleStraßenklasse || props.functionalRoadClass || '';
  const roadType = props.roadType || props.straßenart || '';
  const localId = props.localId || props.gml_id || '';
  
  // Primary classification
  if (roadClass) {
    tags.highway = classifyRoadType(roadClass);
  } else if (roadType) {
    tags.highway = classifyRoadType(roadType);
  } else {
    // Default to road for NRW data (ensures entry detection considers it)
    tags.highway = 'road';
  }
  
  // Speed limit if available
  if (props.maxspeed || props.formOfWay) {
    const formOfWay = String(props.formOfWay || '').toLowerCase();
    if (formOfWay.includes('motorway') || formOfWay.includes('autobahn')) {
      tags.maxspeed = '130';
    } else if (formOfWay.includes('dual') || formOfWay.includes('schnell')) {
      tags.maxspeed = '100';
    } else if (props.maxspeed) {
      tags.maxspeed = String(props.maxspeed);
    }
  }
  
  // Surface quality if available
  if (props.surfaceCondition) {
    const condition = String(props.surfaceCondition).toLowerCase();
    if (condition.includes('asphalt') || condition.includes('paved')) {
      tags.surface = 'asphalt';
    } else if (condition.includes('gravel') || condition.includes('schotter')) {
      tags.surface = 'gravel';
    }
  }
  
  // Road name if available
  if (props.geographicalName || props.name) {
    tags.name = props.geographicalName || props.name;
  }
  
  // Add source attribution and local ID for debugging
  tags.source = "GEOBASIS.NRW:ATKIS";
  if (localId) {
    tags['ref:nrw'] = localId;
  }
  
  return tags;
}

/**
 * Map NRW road classification values to OSM highway types.
 * 
 * Enhanced mapping based on ATKIS Basis-DLM Objektartenkatalog.
 */
function classifyRoadType(roadClass: any): string {
  const classStr = String(roadClass).toLowerCase();
  
  // ATKIS classifications
  if (classStr.includes('bab') || classStr.includes('motorway') || classStr.includes('autobahn')) {
    return 'motorway';
  }
  if (classStr.includes('bundesstraße') || classStr.includes('bundesstrasse') || classStr.includes('federal')) {
    return 'primary';
  }
  if (classStr.includes('landesstraße') || classStr.includes('landesstrasse') || classStr.includes('state')) {
    return 'secondary';
  }
  if (classStr.includes('kreisstraße') || classStr.includes('kreisstrasse') || classStr.includes('county')) {
    return 'tertiary';
  }
  if (classStr.includes('gemeindestraße') || classStr.includes('gemeindestrasse') || classStr.includes('municipal')) {
    return 'residential';
  }
  
  // Form of way classifications
  if (classStr.includes('motorway') || classStr.includes('autobahn')) {
    return 'motorway';
  }
  if (classStr.includes('trunk') || classStr.includes('schnellstraße')) {
    return 'trunk';
  }
  if (classStr.includes('primary') || classStr.includes('hauptstraße') || classStr.includes('hauptstrasse')) {
    return 'primary';
  }
  if (classStr.includes('secondary') || classStr.includes('nebenstraße')) {
    return 'secondary';
  }
  if (classStr.includes('tertiary') || classStr.includes('verbindungsstraße')) {
    return 'tertiary';
  }
  if (classStr.includes('residential') || classStr.includes('wohngebiet') || classStr.includes('erschließung')) {
    return 'residential';
  }
  if (classStr.includes('service') || classStr.includes('zufahrt') || classStr.includes('wirtschaftsweg')) {
    return 'service';
  }
  if (classStr.includes('path') || classStr.includes('weg') || classStr.includes('fußweg')) {
    return 'path';
  }
  if (classStr.includes('track') || classStr.includes('feldweg')) {
    return 'track';
  }
  
  // Default: assume drivable road for NRW data
  return 'road';
}
