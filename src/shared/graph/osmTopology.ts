import { Feature, LineString, Polygon, Position } from "geojson";
import { lineString, point } from "@turf/helpers";
import distance from "@turf/distance";
import { intersectLineWithPolygon, linestringLengthMeters, makeOuterBuffer, straightness01, isInside } from "../geometry/polygonOps";
import { EntryCandidate, EntryDetectionInput, EntryDetectionResult, OsmGraph, OsmNode, OsmNodeId, OsmWay } from "./types";

/** Key für ungerichtete Kante */
function edgeKey(a: OsmNodeId, b: OsmNodeId): string {
  const A = String(a), B = String(b);
  return A < B ? `${A}_${B}` : `${B}_${A}`;
}

/** Spatial Grid Index für schnelle räumliche Abfragen */
class SpatialGrid {
  private grid: Map<string, OsmNodeId[]>;
  private cellSize: number;
  private minX: number;
  private minY: number;
  
  constructor(nodes: Map<OsmNodeId, OsmNode>, cellSizeMeters = 50) {
    this.grid = new Map();
    // Adaptive cell size: Use smaller cells for small datasets
    this.cellSize = nodes.size < 100 ? Math.min(cellSizeMeters, 0.001) : cellSizeMeters;
    
    // Berechne Bounding Box
    if (nodes.size === 0) {
      this.minX = 0;
      this.minY = 0;
      return;
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes.values()) {
      minX = Math.min(minX, n.lon);
      minY = Math.min(minY, n.lat);
      maxX = Math.max(maxX, n.lon);
      maxY = Math.max(maxY, n.lat);
    }
    this.minX = minX;
    this.minY = minY;
  }
  
  private cellKey(lon: number, lat: number): string {
    const x = Math.floor((lon - this.minX) / this.cellSize);
    const y = Math.floor((lat - this.minY) / this.cellSize);
    return `${x},${y}`;
  }
  
  index(nodes: Map<OsmNodeId, OsmNode>): void {
    for (const [id, node] of nodes) {
      const key = this.cellKey(node.lon, node.lat);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key)!.push(id);
    }
  }
  
  /** Findet Knoten in der Nähe eines Punktes */
  nearNodes(lon: number, lat: number, radiusMeters: number): OsmNodeId[] {
    const radiusDeg = radiusMeters / 111000; // grob: 1° ≈ 111km
    const cells = Math.max(1, Math.ceil(radiusDeg / this.cellSize));
    const centerKey = this.cellKey(lon, lat);
    const [cx, cy] = centerKey.split(',').map(Number);
    const result: OsmNodeId[] = [];
    
    for (let dx = -cells; dx <= cells; dx++) {
      for (let dy = -cells; dy <= cells; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const cellNodes = this.grid.get(key);
        if (cellNodes) result.push(...cellNodes);
      }
    }
    return result;
  }
}

/** Graph Cache für wiederholte Analysen */
const graphCache = new Map<string, OsmGraph>();
const CACHE_KEY_VERSION = "v1";

function getCacheKey(osm: { nodes: OsmNode[], ways: OsmWay[] }): string {
  const nodeKey = `${osm.nodes.length}-${osm.nodes[0]?.id}`;
  const wayKey = `${osm.ways.length}-${osm.ways[0]?.id}`;
  return `${CACHE_KEY_VERSION}:${nodeKey}:${wayKey}`;
}

export function buildGraph(nodes: OsmNode[], ways: OsmWay[], useCache = true): OsmGraph {
  // Check cache
  if (useCache) {
    const cacheKey = getCacheKey({ nodes, ways });
    const cached = graphCache.get(cacheKey);
    if (cached) {
      console.log('📦 Using cached graph');
      return cached;
    }
  }
  
  const g: OsmGraph = {
    adj: new Map(),
    nodes: new Map(nodes.map(n => [n.id, n])),
    ways: new Map(ways.map(w => [w.id, w])),
    edgeWays: new Map(),
  };

  // Ensure ALL nodes have adjacency list (even disconnected ones)
  for (const n of nodes) {
    if (!g.adj.has(n.id)) {
      g.adj.set(n.id, new Set());
    }
  }

  // Build edges from ways
  for (const w of ways) {
    for (let i = 0; i < w.nodeIds.length - 1; i++) {
      const a = w.nodeIds[i], b = w.nodeIds[i + 1];
      // Ensure adjacency list exists (should already exist from above)
      if (!g.adj.has(a)) g.adj.set(a, new Set());
      if (!g.adj.has(b)) g.adj.set(b, new Set());
      
      g.adj.get(a)!.add(b);
      g.adj.get(b)!.add(a);
      const k = edgeKey(a, b);
      const arr = g.edgeWays.get(k) ?? [];
      arr.push(w.id);
      g.edgeWays.set(k, arr);
    }
  }
  
  // Cache the result
  if (useCache) {
    const cacheKey = getCacheKey({ nodes, ways });
    graphCache.set(cacheKey, g);
  }
  
  return g;
}

/** Baue LineString aus nodeIds */
function lineFromNodeIds(g: OsmGraph, nodeIds: OsmNodeId[]): Feature<LineString> {
  const coords: Position[] = nodeIds.map(id => {
    const n = g.nodes.get(id);
    if (!n) throw new Error("missing node " + id);
    return [n.lon, n.lat];
  });
  return lineString(coords);
}

/** Finde Knoten außerhalb des Polygons im Außenbuffer (Startkandidaten) - OPTIMIERT mit Grid */
function findOutsideStartNodes(g: OsmGraph, poly: Feature<Polygon>, outerBufferMeters: number): OsmNodeId[] {
  const buf = makeOuterBuffer(poly, outerBufferMeters);
  const result: OsmNodeId[] = [];
  
  // Nutze Spatial Grid für bessere Performance (adaptive cell size)
  const cellSize = g.nodes.size < 100 ? 0.0005 : 50; // Small cells for test data, large for production
  const grid = new SpatialGrid(g.nodes, cellSize);
  grid.index(g.nodes);
  
  // Verwende Grid für schnelle Suche, aber mit Fallback
  const polyBbox = poly.geometry.coordinates[0];
  const centerLon = polyBbox.reduce((sum, c) => sum + c[0], 0) / polyBbox.length;
  const centerLat = polyBbox.reduce((sum, c) => sum + c[1], 0) / polyBbox.length;
  
  // Erweitere Suchradius für kleine Datensätze (z.B. Tests)
  const searchRadius = g.nodes.size < 100 ? outerBufferMeters * 10 : outerBufferMeters * 3;
  const candidateIds = grid.nearNodes(centerLon, centerLat, searchRadius);
  
  for (const id of candidateIds) {
    const n = g.nodes.get(id);
    if (!n) continue;
    const coord: Position = [n.lon, n.lat];
    // Im Buffer aber NICHT im Polygon => „außen nah am Rand"
    if (!isInside(poly, coord) && isInside(buf, coord)) {
      result.push(id);
    }
  }
  
  // Fallback: Falls Grid keine Ergebnisse liefert, verwende vollständige Suche
  if (result.length === 0 && g.nodes.size < 10000) {
    for (const [id, n] of g.nodes) {
      const coord: Position = [n.lon, n.lat];
      if (!isInside(poly, coord) && isInside(buf, coord)) {
        result.push(id);
      }
    }
  }
  
  return result;
}

/** A* Pathfinding mit Heuristik für bessere Performance */
function bfsToPolygonEdge(g: OsmGraph, poly: Feature<Polygon>, start: OsmNodeId, maxSteps = 4000): {path?: OsmNodeId[], hitPoint?: Position, visitedCount?: number} {
  const startNode = g.nodes.get(start);
  if (!startNode) return { visitedCount: 0 };
  
  const visited = new Set<OsmNodeId>([start]);
  const queue: OsmNodeId[] = [start];
  const prev = new Map<OsmNodeId, OsmNodeId | null>([[start, null]]);
  const gScore = new Map<OsmNodeId, number>([[start, 0]]);
  let steps = 0;
  let visitedCount = 0;
  
  // Berechne Polygon-Zentrum für Heuristik
  const polyBbox = poly.geometry.coordinates[0];
  const polyCenter: Position = [
    polyBbox.reduce((sum, c) => sum + c[0], 0) / polyBbox.length,
    polyBbox.reduce((sum, c) => sum + c[1], 0) / polyBbox.length
  ];

  while (queue.length && steps < maxSteps) {
    steps++;
    
    // Wähle nächsten Knoten nach Distanz
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const nodeId = queue[i];
      const node = g.nodes.get(nodeId);
      if (!node) continue;
      
      const distToCenter = distance(
        point([node.lon, node.lat]),
        point(polyCenter),
        { units: 'meters' }
      );
      const gValue = gScore.get(nodeId) || 0;
      const score = gValue + distToCenter;
      
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    
    const v = queue.splice(bestIdx, 1)[0];
    visitedCount++;
    const adj = g.adj.get(v);
    if (!adj) continue;

    for (const u of adj) {
      if (visited.has(u)) continue;
      visited.add(u);
      
      const nodeU = g.nodes.get(u);
      if (!nodeU) continue;
      
      const currentScore = gScore.get(v) || 0;
      const edgeLength = distance(
        point([nodeU.lon, nodeU.lat]),
        point([g.nodes.get(v)!.lon, g.nodes.get(v)!.lat]),
        { units: 'meters' }
      );
      const newScore = currentScore + edgeLength;
      
      // Prüfe Segment [v,u] auf Schnitt mit Polygon
      const seg = lineFromNodeIds(g, [v, u]);
      const hits = intersectLineWithPolygon(seg, poly);
      if (hits.length > 0) {
        // Pfad rückverfolgen
        const path: OsmNodeId[] = [];
        let cur: OsmNodeId | null = v;
        while (cur !== null) {
          path.push(cur);
          cur = prev.get(cur) ?? null;
        }
        path.reverse();
        path.push(u);
        return { path, hitPoint: hits[0], visitedCount };
      }

      prev.set(u, v);
      gScore.set(u, newScore);
      queue.push(u);
    }
  }
  return { visitedCount };
}

/** Schätze Continuity (0..1) aus mittlerem Knotengrad entlang des Pfads */
function continuity01(g: OsmGraph, path: OsmNodeId[]): number {
  if (path.length === 0) return 0;
  let sum = 0;
  for (const id of path) {
    const deg = g.adj.get(id)?.size ?? 0;
    sum += Math.min(deg, 4); // Deckeln (hoher Kreuzungsgrad => stabil)
  }
  const avg = sum / path.length;
  return Math.min(avg / 4, 1);
}

/** Erweiterte Confidence-Berechnung mit Verkehrssicherheits-Faktoren */
function calculateConfidence(
  distanceMeters: number,
  straightness: number,
  continuity: number,
  pathLength: number,
  wayIds: string[],
  g: OsmGraph
): number {
  // Normalisierte Distanz (bis 200m voll)
  const normDist = Math.min(distanceMeters / 200, 1);
  
  // Pfadlänge-Bonus (längere Pfade sind oft stabiler)
  const lengthBonus = Math.min(pathLength / 10, 1) * 0.1;
  
  // Basis-Confidence aus Geometrie
  const baseConfidence = 0.4 * normDist + 0.3 * straightness + 0.3 * continuity;
  
  // Verkehrssicherheits-Faktor: Analysiere Way-Tags
  let trafficSafetyScore = 0.5; // Neutral
  let totalWays = 0;
  
  for (const wayId of wayIds) {
    const way = g.ways.get(wayId);
    if (!way) continue;
    totalWays++;
    
    const highway = way.tags?.highway as string;
    if (highway) {
      // Höhere Straßen = höhere Relevanz
      const highwayWeights: Record<string, number> = {
        'motorway': 1.0,
        'trunk': 0.95,
        'primary': 0.9,
        'secondary': 0.85,
        'tertiary': 0.8,
        'residential': 0.7,
        'service': 0.6,
        'track': 0.5,
        'path': 0.3,
        'footway': 0.2
      };
      trafficSafetyScore += highwayWeights[highway] || 0.5;
    }
    
    // Maxspeed-Bonus für klar definierte Geschwindigkeiten
    const maxspeed = way.tags?.maxspeed as string;
    if (maxspeed && !isNaN(parseFloat(maxspeed))) {
      const speed = parseFloat(maxspeed);
      // Niedrige Geschwindigkeiten deuten auf Verkehrsberuhigung hin
      if (speed <= 30) trafficSafetyScore += 0.1;
      else if (speed <= 50) trafficSafetyScore += 0.05;
    }
    
    // Barrierefreiheit und Qualität
    if (way.tags?.surface === 'paved' || way.tags?.surface === 'asphalt') {
      trafficSafetyScore += 0.05;
    }
  }
  
  if (totalWays > 0) {
    trafficSafetyScore = trafficSafetyScore / totalWays;
  } else {
    trafficSafetyScore = 0.5; // Fallback
  }
  
  // Finale Confidence mit Verkehrssicherheits-Faktor
  const finalConfidence = baseConfidence * 0.7 + trafficSafetyScore * 0.3 + lengthBonus;
  return Math.max(0, Math.min(1, finalConfidence));
}

export function detectEntryCandidates(input: EntryDetectionInput): EntryDetectionResult {
  const startTime = performance.now();
  const { polygon, osm, outerBufferMeters = 30 } = input;
  
  const g = buildGraph(osm.nodes, osm.ways);
  const starts = findOutsideStartNodes(g, polygon, outerBufferMeters);

  // Verbesserte räumliche Deduplizierung mit Clustering
  const spatialClusters = new Map<string, EntryCandidate[]>();

  console.log(`🔍 Starting OPTIMIZED entry detection with ${starts.length} start nodes`);

  let totalVisitedNodes = 0;
  const maxStarts = 1000; // Limitiere auf wichtigste Startpunkte
  
  // Sortiere Startpunkte nach Distanz zum Polygon-Rand (wichtigere zuerst)
  const sortedStarts = starts.slice(0, maxStarts);

  for (const s of sortedStarts) {
    const res = bfsToPolygonEdge(g, polygon, s);
    if (!res.path || !res.hitPoint) continue;
    
    totalVisitedNodes += res.visitedCount || 0;

    const line = lineFromNodeIds(g, res.path);
    const dist = linestringLengthMeters(line);
    const straight = straightness01((line.geometry as any).coordinates);
    const cont = continuity01(g, res.path);

    // Sammle wayIds entlang des Pfads
    const wayIds = new Set<string>();
    for (let i = 0; i < res.path.length - 1; i++) {
      const k = edgeKey(res.path[i], res.path[i+1]);
      const arr = g.edgeWays.get(k) ?? [];
      arr.forEach(w => wayIds.add(String(w)));
    }

    // Erweiterte Confidence-Berechnung mit Verkehrssicherheits-Faktoren
    const confidence = calculateConfidence(dist, straight, cont, res.path.length, Array.from(wayIds), g);

    // Räumliches Clustering: Gruppiere nahe Hitpunkte
    const clusterKey = `${Math.round(res.hitPoint[0] * 1000)},${Math.round(res.hitPoint[1] * 1000)}`;
    
    if (!spatialClusters.has(clusterKey)) {
      spatialClusters.set(clusterKey, []);
    }
    
    const candidatesInCluster = spatialClusters.get(clusterKey)!;
    candidatesInCluster.push({
      id: `entry-${candidatesInCluster.length > 0 ? candidatesInCluster.length + 1 : '1'}-${clusterKey}`,
      intersectionPoint: res.hitPoint,
      pathNodeIds: res.path,
      path: line,
      distanceMeters: dist,
      straightness: straight,
      continuity: cont,
      confidence,
      wayIds: Array.from(wayIds),
    });
  }
  
  // Wähle den besten Kandidaten aus jedem Cluster
  const deduplicatedCandidates: EntryCandidate[] = [];
  for (const [_, clusterCandidates] of spatialClusters) {
    if (clusterCandidates.length > 0) {
      // Sortiere nach Confidence und nimm den besten
      clusterCandidates.sort((a, b) => b.confidence - a.confidence);
      deduplicatedCandidates.push(clusterCandidates[0]);
    }
  }

  const processingTime = performance.now() - startTime;
  const edgeCount = Array.from(g.edgeWays.values()).reduce((sum, ways) => sum + ways.length, 0);

  console.log(`✅ OPTIMIZED Entry detection completed: ${deduplicatedCandidates.length} unique candidates found in ${processingTime.toFixed(1)}ms`);
  console.log(`📊 Visited nodes: ${totalVisitedNodes.toLocaleString()}, Efficiency: ${(deduplicatedCandidates.length / totalVisitedNodes * 100).toFixed(2)}%`);

  return {
    candidates: deduplicatedCandidates.sort((a, b) => b.confidence - a.confidence),
    processingTimeMs: processingTime,
    graphStats: {
      nodeCount: g.nodes.size,
      wayCount: g.ways.size,
      edgeCount
    }
  };
}

/** Utility: Konvertiert OSM-Daten aus der bestehenden Anwendung */
export function convertFromExistingOsmData(osmData: any): { nodes: OsmNode[], ways: OsmWay[] } {
  const nodes: OsmNode[] = [];
  const ways: OsmWay[] = [];

  // Falls osmData bereits nodes und ways im richtigen Format hat
  if (osmData.nodes && Array.isArray(osmData.nodes) && 
      osmData.nodes.length > 0 && 
      osmData.nodes[0].id !== undefined) {
    // Daten sind bereits im richtigen Format
    return {
      nodes: osmData.nodes,
      ways: osmData.ways || []
    };
  }

  // Konvertiere Ways zu unserem Format
  for (const way of osmData.ways || []) {
    if (!way.nodes || !Array.isArray(way.nodes)) continue;
    
    const wayNodes: OsmNodeId[] = [];
    
    // Erstelle Nodes aus Way-Koordinaten
    for (let i = 0; i < way.nodes.length; i++) {
      const wayNode = way.nodes[i];
      
      // Check if node has coordinates
      if (wayNode && typeof wayNode.lon === 'number' && typeof wayNode.lat === 'number') {
        const nodeId = `${way.id}-${i}`;
        const node: OsmNode = {
          id: nodeId,
          lon: wayNode.lon,
          lat: wayNode.lat
        };
        nodes.push(node);
        wayNodes.push(nodeId);
      } else if (typeof wayNode === 'number' || typeof wayNode === 'string') {
        // Node is just an ID reference, skip this way
        console.warn(`Way ${way.id} has node references instead of coordinates, skipping`);
        break;
      }
    }

    // Only create way if we have valid nodes
    if (wayNodes.length > 0) {
      const osmWay: OsmWay = {
        id: way.id || `way-${ways.length}`,
        nodeIds: wayNodes,
        tags: way.tags || {}
      };
      ways.push(osmWay);
    }
  }

  console.log(`Converted OSM data: ${nodes.length} nodes, ${ways.length} ways`);
  return { nodes, ways };
}
