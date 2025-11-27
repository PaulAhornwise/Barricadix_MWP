import type { Feature, FeatureCollection, LineString, Polygon, Position } from "geojson";

export type OsmNodeId = number | string;
export type OsmWayId = number | string;

export interface OsmNode {
  id: OsmNodeId;
  lon: number;
  lat: number;
}

export interface OsmWay {
  id: OsmWayId;
  nodeIds: OsmNodeId[];
  // Original tags werden akzeptiert, aber NICHT als harte Filter verwendet.
  tags?: Record<string, string | number | boolean | undefined>;
}

export interface OsmGraph {
  /** adjacency: nodeId -> set(nodeId) */
  adj: Map<OsmNodeId, Set<OsmNodeId>>;
  nodes: Map<OsmNodeId, OsmNode>;
  ways: Map<OsmWayId, OsmWay>;
  /** mapping edgeKey(nodeA,nodeB) -> wayId */
  edgeWays: Map<string, OsmWayId[]>;
}

export interface EntryCandidate {
  id: string;
  intersectionPoint: Position; // [lon, lat] auf Polygonrand
  /** Teilpfad von „außen" bis zum Schnittpunkt (as NodeId[] und als LineString) */
  pathNodeIds: OsmNodeId[];
  path: Feature<LineString>;
  /** Metriken */
  distanceMeters: number;      // Weglänge bis zum Rand
  straightness: number;        // 0..1 (1 = sehr gerade)
  continuity: number;          // 0..1 (Knoten/Abzweig-Konsistenz)
  /** erster, einfachster Confidence-Score nur aus Topologie/Geometrie */
  confidence: number;          // 0..1
  /** Referenz auf verwendete wayIds (zur UI-Hervorhebung) */
  wayIds: OsmWayId[];
  /** Markierung für manuell hinzugefügte Zufahrten */
  manual?: boolean;
}

export interface EntryDetectionInput {
  polygon: Feature<Polygon>;
  osm: {
    nodes: OsmNode[];
    ways: OsmWay[];
  };
  /** Distanz des Außenbuffers in Metern, Standard 30 */
  outerBufferMeters?: number;
  /** max. Suchradius der Außenstartpunkte (fallback) */
  maxSearchMeters?: number;
}

export interface EntryDetectionResult {
  candidates: EntryCandidate[];
  processingTimeMs: number;
  graphStats: {
    nodeCount: number;
    wayCount: number;
    edgeCount: number;
  };
}

