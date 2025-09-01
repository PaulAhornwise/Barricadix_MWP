/**
 * OSM data parsing utilities for speed limits, surface friction, and traffic calming
 */

export function parseMaxspeed(tag?: string): number | undefined {
  if (!tag) return;
  const s = tag.trim().toLowerCase();
  
  // Beispiele: "50", "30 mph", "walk", "none"
  if (s === 'walk') return 7; // ~7 km/h konservativ
  if (s === 'none') return undefined; // Keine Begrenzung
  
  const mph = s.includes('mph');
  const num = parseFloat(s);
  if (isFinite(num)) {
    return mph ? Math.round(num * 1.60934) : num;
  }
  
  return undefined;
}

export function muFromSurface(surface?: string, smoothness?: string): number | undefined {
  // konservative "sustained grip"-Werte (trocken), optional Smoothness-Korrektur
  const base = ((): number | undefined => {
    switch ((surface||'').toLowerCase()) {
      case 'asphalt':
      case 'concrete':
      case 'concrete:lanes':
      case 'concrete:plates': return 0.75;
      case 'paving_stones':
      case 'sett':
      case 'cobblestone':    return 0.55; // teils glatter
      case 'compacted':      return 0.55;
      case 'gravel':         return 0.45;
      case 'fine_gravel':    return 0.48;
      case 'dirt':
      case 'earth':
      case 'ground':         return 0.35;
      case 'grass':          return 0.30;
      case 'sand':           return 0.25;
      default:               return undefined;
    }
  })();

  if (!base) return undefined;

  if (smoothness) {
    const s = smoothness.toLowerCase();
    if (s.includes('good') || s.includes('excellent')) return Math.min(0.85, base + 0.02);
    if (s.includes('bad') || s.includes('horrible'))   return Math.max(0.2, base - 0.05);
  }
  return base;
}

export type WeatherCondition = 'dry' | 'wet' | 'snow' | 'ice';

export function weatherMultiplier(kind: WeatherCondition): number {
  switch (kind) {
    case 'dry':  return 1.00;
    case 'wet':  return 0.75;
    case 'snow': return 0.30;
    case 'ice':  return 0.15;
  }
}

export function getTrafficCalmingSpeedCap(kind: string): number | undefined {
  switch (kind) {
    case 'hump':
    case 'table':
    case 'island': return 40; // km/h
    case 'chicane': return 35; // km/h
    case 'cushion':
    case 'rumble_strip': return 45; // km/h
    default: return undefined;
  }
}

/**
 * Calculate distance between two lat/lng points in meters
 */
export function getDistance(p1: {lat: number; lng: number}, p2: {lat: number; lng: number}): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Find the closest point on a line segment to a given point
 */
export function closestPointOnSegment(
  point: {lat: number; lng: number},
  segStart: {lat: number; lng: number},
  segEnd: {lat: number; lng: number}
): {lat: number; lng: number; distance: number} {
  const A = point.lat - segStart.lat;
  const B = point.lng - segStart.lng;
  const C = segEnd.lat - segStart.lat;
  const D = segEnd.lng - segStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    // Segment is a point
    return {
      lat: segStart.lat,
      lng: segStart.lng,
      distance: getDistance(point, segStart)
    };
  }

  const param = dot / lenSq;
  let closestPoint: {lat: number; lng: number};

  if (param < 0) {
    closestPoint = segStart;
  } else if (param > 1) {
    closestPoint = segEnd;
  } else {
    closestPoint = {
      lat: segStart.lat + param * C,
      lng: segStart.lng + param * D
    };
  }

  return {
    ...closestPoint,
    distance: getDistance(point, closestPoint)
  };
}

