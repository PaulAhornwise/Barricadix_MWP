import { Feature, FeatureCollection, LineString, Polygon, Position } from "geojson";
import { lineString, point } from "@turf/helpers";
import { intersectLineWithPolygon, linestringLengthMeters, makeOuterBuffer, straightness01, isInside } from "../geometry/polygonOps";
import { EntryCandidate, EntryDetectionInput, EntryDetectionResult, OsmGraph, OsmNode, OsmNodeId, OsmWay, OsmWayId } from "./types";

/** Key für ungerichtete Kante */
function edgeKey(a: OsmNodeId, b: OsmNodeId): string {
  const A = String(a), B = String(b);
  return A < B ? `${A}_${B}` : `${B}_${A}`;
}

export function buildGraph(nodes: OsmNode[], ways: OsmWay[]): OsmGraph {
  const g: OsmGraph = {
    adj: new Map(),
    nodes: new Map(nodes.map(n => [n.id, n])),
    ways: new Map(ways.map(w => [w.id, w])),
    edgeWays: new Map(),
  };

  const ensure = (id: OsmNodeId) => {
    if (!g.adj.has(id)) g.adj.set(id, new Set());
  };

  for (const w of ways) {
    for (let i = 0; i < w.nodeIds.length - 1; i++) {
      const a = w.nodeIds[i], b = w.nodeIds[i + 1];
      ensure(a); ensure(b);
      g.adj.get(a)!.add(b);
      g.adj.get(b)!.add(a);
      const k = edgeKey(a, b);
      const arr = g.edgeWays.get(k) ?? [];
      arr.push(w.id);
      g.edgeWays.set(k, arr);
    }
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

/** Finde Knoten außerhalb des Polygons im Außenbuffer (Startkandidaten) */
function findOutsideStartNodes(g: OsmGraph, poly: Feature<Polygon>, outerBufferMeters: number): OsmNodeId[] {
  const buf = makeOuterBuffer(poly, outerBufferMeters);
  const result: OsmNodeId[] = [];
  for (const [id, n] of g.nodes) {
    const coord: Position = [n.lon, n.lat];
    // Im Buffer aber NICHT im Polygon => „außen nah am Rand"
    if (!isInside(poly, coord) && isInside(buf, coord)) {
      result.push(id);
    }
  }
  return result;
}

/** BFS bis zum ersten Schnitt mit Polygonrand */
function bfsToPolygonEdge(g: OsmGraph, poly: Feature<Polygon>, start: OsmNodeId, maxSteps = 6000): {path?: OsmNodeId[], hitPoint?: Position} {
  const q: OsmNodeId[] = [start];
  const prev = new Map<OsmNodeId, OsmNodeId | null>([[start, null]]);
  let steps = 0;

  while (q.length && steps < maxSteps) {
    steps++;
    const v = q.shift()!;
    const adj = g.adj.get(v);
    if (!adj) continue;

    for (const u of adj) {
      if (prev.has(u)) continue;
      prev.set(u, v);

      // Prüfe Segment [v,u] auf Schnitt mit Polygon
      const seg = lineFromNodeIds(g, [v, u]);
      const hits = intersectLineWithPolygon(seg, poly);
      if (hits.length > 0) {
        // Pfad rückverfolgen (bis v) + füge u hinzu
        const path: OsmNodeId[] = [];
        let cur: OsmNodeId | null = v;
        while (cur !== null) {
          path.push(cur);
          cur = prev.get(cur) ?? null;
        }
        path.reverse();
        path.push(u);
        return { path, hitPoint: hits[0] };
      }

      q.push(u);
    }
  }
  return {};
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

/** Erweiterte Confidence-Berechnung mit mehreren Faktoren */
function calculateConfidence(
  distanceMeters: number,
  straightness: number,
  continuity: number,
  pathLength: number
): number {
  // Normalisierte Distanz (bis 200m voll)
  const normDist = Math.min(distanceMeters / 200, 1);
  
  // Pfadlänge-Bonus (längere Pfade sind oft stabiler)
  const lengthBonus = Math.min(pathLength / 10, 1) * 0.1;
  
  // Basis-Confidence aus Geometrie
  const baseConfidence = 0.4 * normDist + 0.3 * straightness + 0.3 * continuity;
  
  // Finale Confidence mit Längen-Bonus
  return Math.max(0, Math.min(1, baseConfidence + lengthBonus));
}

export function detectEntryCandidates(input: EntryDetectionInput): EntryDetectionResult {
  const startTime = performance.now();
  const { polygon, osm, outerBufferMeters = 30 } = input;
  
  const g = buildGraph(osm.nodes, osm.ways);
  const starts = findOutsideStartNodes(g, polygon, outerBufferMeters);

  const candidates: EntryCandidate[] = [];
  const seenHitKeys = new Set<string>();

  console.log(`🔍 Starting entry detection with ${starts.length} start nodes`);

  for (const s of starts) {
    const res = bfsToPolygonEdge(g, polygon, s);
    if (!res.path || !res.hitPoint) continue;

    const line = lineFromNodeIds(g, res.path);
    const dist = linestringLengthMeters(line);
    const straight = straightness01((line.geometry as any).coordinates);
    const cont = continuity01(g, res.path);

    // Konsistenter ID-Key am Hitpunkt (gerundete Koordinate)
    const key = `${res.hitPoint[0].toFixed(7)},${res.hitPoint[1].toFixed(7)}`;
    if (seenHitKeys.has(key)) continue;
    seenHitKeys.add(key);

    // Erweiterte Confidence-Berechnung
    const confidence = calculateConfidence(dist, straight, cont, res.path.length);

    // Sammle wayIds entlang des Pfads
    const wayIds = new Set<string>();
    for (let i = 0; i < res.path.length - 1; i++) {
      const k = edgeKey(res.path[i], res.path[i+1]);
      const arr = g.edgeWays.get(k) ?? [];
      arr.forEach(w => wayIds.add(String(w)));
    }

    candidates.push({
      id: `entry-${key}`,
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

  const processingTime = performance.now() - startTime;
  const edgeCount = Array.from(g.edgeWays.values()).reduce((sum, ways) => sum + ways.length, 0);

  console.log(`✅ Entry detection completed: ${candidates.length} candidates found in ${processingTime.toFixed(1)}ms`);

  return {
    candidates: candidates.sort((a, b) => b.confidence - a.confidence),
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
  const nodeMap = new Map<string, OsmNodeId>();

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
