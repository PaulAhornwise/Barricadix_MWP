/**
 * OSM/Overpass API utilities for fetching traffic-related data
 */

export type OsmTrafficCalming =
  | 'hump' | 'table' | 'chicane' | 'cushion' | 'rumble_strip' | 'island';

export interface OsmWayLite {
  id: number;
  nodes: Array<{ lat: number; lon: number }>;
  tags: Partial<{
    highway: string;
    maxspeed: string;
    surface: string;
    smoothness: string;
  }>;
}

export interface OsmTrafficNode {
  id: number;
  lat: number;
  lon: number;
  kind: OsmTrafficCalming;
}

export interface OsmBundle {
  ways: OsmWayLite[];
  calming: OsmTrafficNode[];
}

export function polygonToOverpassPoly(latlngs: Array<{lat:number;lng:number}>): string {
  // "lat lon" Paare, Leerzeichen-getrennt
  return latlngs.map(p => `${p.lat} ${p.lng}`).join(' ');
}

export async function fetchOsmBundleForPolygon(
  polygon: Array<{lat:number;lng:number}>,
  signal?: AbortSignal
): Promise<OsmBundle> {
  if (polygon.length < 3) {
    throw new Error('Polygon must have at least 3 points');
  }
  
  const poly = polygonToOverpassPoly(polygon);
  console.log('🗺️ OSM Query polygon coords:', poly);
  
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](poly:"${poly}");
      node["traffic_calming"](poly:"${poly}");
    );
    (._;>;);
    out body;
  `;
  
  console.log('🗺️ OSM Query:', query.trim());
  
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
    signal
  });
  
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error('Overpass API Error:', res.status, errorText);
    throw new Error(`Overpass ${res.status}: ${errorText}`);
  }
  
  const data = await res.json();
  
  // Parse: ways + nodes (nur benötigte Felder)
  const nodes: Record<number, {lat:number;lon:number}> = {};
  for (const el of data.elements) {
    if (el.type === 'node') nodes[el.id] = {lat: el.lat, lon: el.lon};
  }
  
  const ways: OsmWayLite[] = [];
  const calming: OsmTrafficNode[] = [];
  
  for (const el of data.elements) {
    if (el.type === 'way') {
      ways.push({
        id: el.id,
        nodes: (el.nodes || []).map((nid:number)=>nodes[nid]).filter(Boolean),
        tags: el.tags || {}
      });
    } else if (el.type === 'node' && el.tags?.traffic_calming) {
      const kind = String(el.tags.traffic_calming) as OsmTrafficCalming;
      if (['hump', 'table', 'chicane', 'cushion', 'rumble_strip', 'island'].includes(kind)) {
        calming.push({ id: el.id, lat: el.lat, lon: el.lon, kind });
      }
    }
  }
  
  return { ways, calming };
}

/**
 * Simple cache for OSM data based on polygon hash
 */
class OsmCache {
  private cache = new Map<string, { data: OsmBundle; timestamp: number }>();
  private readonly TTL = 10 * 60 * 1000; // 10 minutes

  getKey(polygon: Array<{lat:number;lng:number}>, flags: string): string {
    const polyStr = JSON.stringify(polygon.map(p => [p.lat, p.lng]));
    return `${this.simpleHash(polyStr)}_${flags}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  get(key: string): OsmBundle | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: OsmBundle): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const osmCache = new OsmCache();
