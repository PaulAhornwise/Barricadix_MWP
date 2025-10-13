import { describe, it, expect, beforeEach } from "vitest";
import { buildGraph, detectEntryCandidates } from "../shared/graph/osmTopology";
import type { EntryDetectionInput, OsmNode, OsmWay } from "../shared/graph/types";
import { polygon, lineString } from "@turf/helpers";

describe("Graph topology", () => {
  let testNodes: OsmNode[];
  let testWays: OsmWay[];
  let testPolygon: any;

  beforeEach(() => {
    // Einfaches Test-Polygon (Quadrat)
    testPolygon = polygon([[
      [0, 0], [0, 1], [1, 1], [1, 0], [0, 0]
    ]]);

    // Test-Nodes: Außerhalb, am Rand, und innerhalb
    testNodes = [
      { id: "outside1", lon: -0.1, lat: 0.5 },  // Außerhalb links
      { id: "outside2", lon: 0.5, lat: -0.1 },  // Außerhalb unten
      { id: "edge1", lon: 0.0, lat: 0.5 },      // Am Rand links
      { id: "edge2", lon: 0.5, lat: 0.0 },      // Am Rand unten
      { id: "inside1", lon: 0.5, lat: 0.5 },    // Innen
      { id: "inside2", lon: 0.2, lat: 0.2 },    // Innen
    ];

    // Test-Ways: Verbindungen von außen nach innen
    testWays = [
      {
        id: "way1",
        nodeIds: ["outside1", "edge1", "inside1"],
        tags: { highway: "primary" }
      },
      {
        id: "way2", 
        nodeIds: ["outside2", "edge2", "inside2"],
        tags: { highway: "secondary" }
      },
      {
        id: "way3",
        nodeIds: ["inside1", "inside2"],
        tags: { highway: "residential" }
      }
    ];
  });

  describe("buildGraph", () => {
    it("should build adjacency list correctly", () => {
      const graph = buildGraph(testNodes, testWays);
      
      expect(graph.nodes.size).toBe(6);
      expect(graph.ways.size).toBe(3);
      
      // Prüfe Adjazenz
      expect(graph.adj.get("outside1")?.has("edge1")).toBe(true);
      expect(graph.adj.get("edge1")?.has("outside1")).toBe(true);
      expect(graph.adj.get("edge1")?.has("inside1")).toBe(true);
      expect(graph.adj.get("inside1")?.has("edge1")).toBe(true);
    });

    it("should handle empty input", () => {
      const graph = buildGraph([], []);
      
      expect(graph.nodes.size).toBe(0);
      expect(graph.ways.size).toBe(0);
      expect(graph.adj.size).toBe(0);
    });

    it("should handle disconnected nodes", () => {
      const nodes = [
        { id: "a", lon: 0, lat: 0 },
        { id: "b", lon: 1, lat: 1 }
      ];
      const ways: OsmWay[] = [];
      
      const graph = buildGraph(nodes, ways);
      
      expect(graph.nodes.size).toBe(2);
      expect(graph.adj.get("a")?.size).toBe(0);
      expect(graph.adj.get("b")?.size).toBe(0);
    });
  });

  describe("detectEntryCandidates", () => {
    it("should detect entries when continuous path reaches polygon edge", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].intersectionPoint).toBeTruthy();
      expect(result.candidates[0].pathNodeIds.length).toBeGreaterThan(0);
      expect(result.candidates[0].confidence).toBeGreaterThan(0);
      expect(result.candidates[0].confidence).toBeLessThanOrEqual(1);
    });

    it("should sort candidates by confidence", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i-1].confidence).toBeGreaterThanOrEqual(
          result.candidates[i].confidence
        );
      }
    });

    it("should include graph statistics", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      expect(result.graphStats.nodeCount).toBe(6);
      expect(result.graphStats.wayCount).toBe(3);
      expect(result.graphStats.edgeCount).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it("should handle empty OSM data", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: [], ways: [] },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      expect(result.candidates.length).toBe(0);
      expect(result.graphStats.nodeCount).toBe(0);
      expect(result.graphStats.wayCount).toBe(0);
    });

    it("should respect outerBufferMeters parameter", () => {
      const inputSmall: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.05  // Sehr kleiner Buffer
      };

      const inputLarge: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.5   // Großer Buffer
      };

      const resultSmall = detectEntryCandidates(inputSmall);
      const resultLarge = detectEntryCandidates(inputLarge);
      
      // Mit größerem Buffer sollten mehr Startpunkte gefunden werden
      expect(resultLarge.candidates.length).toBeGreaterThanOrEqual(
        resultSmall.candidates.length
      );
    });
  });

  describe("confidence calculation", () => {
    it("should calculate confidence between 0 and 1", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      result.candidates.forEach(candidate => {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
        expect(candidate.straightness).toBeGreaterThanOrEqual(0);
        expect(candidate.straightness).toBeLessThanOrEqual(1);
        expect(candidate.continuity).toBeGreaterThanOrEqual(0);
        expect(candidate.continuity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("path validation", () => {
    it("should create valid LineString paths", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      result.candidates.forEach(candidate => {
        expect(candidate.path.type).toBe("Feature");
        expect(candidate.path.geometry.type).toBe("LineString");
        expect(candidate.path.geometry.coordinates.length).toBeGreaterThan(1);
        expect(candidate.pathNodeIds.length).toBe(candidate.path.geometry.coordinates.length);
      });
    });

    it("should have valid intersection points", () => {
      const input: EntryDetectionInput = {
        polygon: testPolygon,
        osm: { nodes: testNodes, ways: testWays },
        outerBufferMeters: 0.2
      };

      const result = detectEntryCandidates(input);
      
      result.candidates.forEach(candidate => {
        expect(candidate.intersectionPoint).toHaveLength(2);
        expect(typeof candidate.intersectionPoint[0]).toBe("number");
        expect(typeof candidate.intersectionPoint[1]).toBe("number");
      });
    });
  });
});

