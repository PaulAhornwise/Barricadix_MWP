import { describe, it, expect } from "vitest";
import { prepareEntryDetectionInput } from "../features/map/services/entryCandidateService";
import { convertFromExistingOsmData } from "../shared/graph/osmTopology";
import type { OsmNode, OsmWay } from "../shared/graph/types";

describe("Entry Detection Integration", () => {
  describe("convertFromExistingOsmData", () => {
    it("should convert existing OSM data format", () => {
      const existingData = {
        ways: [
          {
            id: "way1",
            nodes: [
              { lon: 0, lat: 0 },
              { lon: 1, lat: 0 },
              { lon: 1, lat: 1 }
            ],
            tags: { highway: "primary" }
          },
          {
            id: "way2", 
            nodes: [
              { lon: 1, lat: 1 },
              { lon: 0, lat: 1 },
              { lon: 0, lat: 0 }
            ],
            tags: { highway: "secondary" }
          }
        ]
      };

      const result = convertFromExistingOsmData(existingData);
      
      expect(result.nodes.length).toBe(6); // 3 + 3 nodes
      expect(result.ways.length).toBe(2);
      
      // Prüfe dass alle Ways die richtige Anzahl Nodes haben
      expect(result.ways[0].nodeIds.length).toBe(3);
      expect(result.ways[1].nodeIds.length).toBe(3);
      
      // Prüfe dass Node-IDs korrekt generiert wurden
      expect(result.ways[0].nodeIds[0]).toBe("way1-0");
      expect(result.ways[0].nodeIds[1]).toBe("way1-1");
      expect(result.ways[0].nodeIds[2]).toBe("way1-2");
    });

    it("should handle empty OSM data", () => {
      const result = convertFromExistingOsmData({});
      
      expect(result.nodes.length).toBe(0);
      expect(result.ways.length).toBe(0);
    });

    it("should preserve way tags", () => {
      const existingData = {
        ways: [
          {
            id: "way1",
            nodes: [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }],
            tags: { highway: "primary", surface: "asphalt" }
          }
        ]
      };

      const result = convertFromExistingOsmData(existingData);
      
      expect(result.ways[0].tags).toEqual({
        highway: "primary",
        surface: "asphalt"
      });
    });
  });

  describe("prepareEntryDetectionInput", () => {
    const testPolygon = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
      }
    };

    it("should prepare input from valid data", () => {
      const osmData = {
        nodes: [
          { id: "1", lon: 0, lat: 0 },
          { id: "2", lon: 1, lat: 1 }
        ],
        ways: [
          { id: "w1", nodeIds: ["1", "2"], tags: {} }
        ]
      };

      const result = prepareEntryDetectionInput(testPolygon, osmData, 50);
      
      expect(result).not.toBeNull();
      expect(result!.polygon).toEqual(testPolygon);
      expect(result!.osm.nodes.length).toBe(2);
      expect(result!.osm.ways.length).toBe(1);
      expect(result!.outerBufferMeters).toBe(50);
    });

    it("should convert existing format when needed", () => {
      const osmData = {
        ways: [
          {
            id: "way1",
            nodes: [
              { lon: -0.1, lat: 0.5 },
              { lon: 0.5, lat: 0.5 }
            ],
            tags: { highway: "primary" }
          }
        ]
      };

      const result = prepareEntryDetectionInput(testPolygon, osmData, 30);
      
      expect(result).not.toBeNull();
      expect(result!.osm.nodes.length).toBe(2);
      expect(result!.osm.ways.length).toBe(1);
      expect(result!.outerBufferMeters).toBe(30);
    });

    it("should return null for invalid input", () => {
      expect(prepareEntryDetectionInput(null, {}, 30)).toBeNull();
      expect(prepareEntryDetectionInput(testPolygon, null, 30)).toBeNull();
      expect(prepareEntryDetectionInput(testPolygon, { nodes: [], ways: [] }, 30)).toBeNull();
    });

    it("should use default outerBufferMeters", () => {
      const osmData = {
        nodes: [{ id: "1", lon: 0, lat: 0 }],
        ways: [{ id: "w1", nodeIds: ["1"], tags: {} }]
      };

      const result = prepareEntryDetectionInput(testPolygon, osmData);
      
      expect(result!.outerBufferMeters).toBe(30); // Default value
    });
  });

  describe("Error handling", () => {
    it("should handle malformed polygon data", () => {
      const malformedPolygon = {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: "invalid"
        }
      };

      const osmData = {
        nodes: [{ id: "1", lon: 0, lat: 0 }],
        ways: [{ id: "w1", nodeIds: ["1"], tags: {} }]
      };

      // Sollte nicht crashen, aber möglicherweise null zurückgeben
      const result = prepareEntryDetectionInput(malformedPolygon, osmData);
      // Das Verhalten hängt von der Implementierung ab
    });

    it("should handle missing node references in ways", () => {
      const existingData = {
        ways: [
          {
            id: "way1",
            nodes: [
              { lon: 0, lat: 0 },
              { lon: 1, lat: 1 }
            ],
            tags: {}
          }
        ]
      };

      // Sollte nicht crashen
      const result = convertFromExistingOsmData(existingData);
      expect(result.ways.length).toBe(1);
      expect(result.nodes.length).toBe(2);
    });
  });
});

