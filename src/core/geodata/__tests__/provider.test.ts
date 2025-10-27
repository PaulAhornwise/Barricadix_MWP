import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nrwProvider } from '../providers/nrwProvider';
import { osmProvider } from '../providers/osmProvider';
import { polygonBbox4326, simplePolygonHash, cacheKey } from '../provider';
import { pickProvider } from '../index';

// Mock fetch for testing
global.fetch = vi.fn();

// Mock Leaflet for testing
const mockWmsLayer = vi.fn(() => ({ mock: 'wms-layer' }));
const mockTileLayer = vi.fn(() => ({ mock: 'tile-layer' }));

global.L = {
  tileLayer: Object.assign(mockTileLayer, {
    wms: mockWmsLayer
  })
};

describe('Geodata Provider System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NRW Provider', () => {
    it('should support NRW bounding box in EPSG:4326', () => {
      // Dortmund area (center of NRW) in EPSG:4326 (lon/lat)
      const dortmundBbox: [number, number, number, number] = [7.3, 51.4, 7.6, 51.6];
      expect(nrwProvider.supports(dortmundBbox)).toBe(true);
    });

    it('should not support areas outside NRW', () => {
      // Berlin area (outside NRW) in EPSG:4326 (lon/lat)
      const berlinBbox: [number, number, number, number] = [13.2, 52.4, 13.5, 52.6];
      expect(nrwProvider.supports(berlinBbox)).toBe(false);
    });

    it('should fetch road network from NRW WFS', async () => {
      // Mock successful WFS response
      const mockWfsResponse = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[8.1, 51.5], [8.2, 51.6]]
            },
            properties: {
              roadClass: 'primary'
            }
          }
        ]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWfsResponse)
      });

      const polygon = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.1, 51.5], [8.2, 51.5], [8.2, 51.6], [8.1, 51.6], [8.1, 51.5]]]
        },
        properties: {}
      };

      const result = await nrwProvider.fetchRoadNetwork(polygon);

      expect(result).toBeDefined();
      expect(result.nodes).toHaveLength(2);
      expect(result.ways).toHaveLength(1);
      expect(result.ways[0]?.tags?.highway).toBe('primary');
      expect(result.ways[0]?.tags?.source).toBe('GEOBASIS.NRW');
    });

    it('should create NRW WMS basemap layer', () => {
      const layer = nrwProvider.makeBasemapLayer?.();
      expect(layer).toBeDefined();
      // In a real test, you'd check if it's a Leaflet WMS layer
    });
  });

  describe('OSM Provider', () => {
    it('should support all areas', () => {
      const anyBbox: [number, number, number, number] = [0, 0, 1000, 1000];
      expect(osmProvider.supports(anyBbox)).toBe(true);
    });

    it('should create OSM tile basemap layer', () => {
      const layer = osmProvider.makeBasemapLayer?.();
      expect(layer).toBeDefined();
      // In a real test, you'd check if it's a Leaflet tile layer
    });
  });

  describe('Provider Selection', () => {
    it('should select NRW provider for Dortmund area (EPSG:4326)', async () => {
      // Dortmund area in EPSG:4326 (lon/lat)
      const dortmundBbox: [number, number, number, number] = [7.3, 51.4, 7.6, 51.6];
      const provider = await pickProvider(dortmundBbox);
      expect(provider.id).toBe('nrw');
    });

    it('should select NRW provider for Soest area (EPSG:4326)', async () => {
      // Soest area in EPSG:4326 (lon/lat) - within NRW bounds
      const soestBbox: [number, number, number, number] = [8.0, 51.5, 8.2, 51.6];
      const provider = await pickProvider(soestBbox);
      expect(provider.id).toBe('nrw');
    });

    it('should fallback to OSM provider for Berlin area (EPSG:4326)', async () => {
      // Berlin area (outside NRW) in EPSG:4326 (lon/lat)
      const berlinBbox: [number, number, number, number] = [13.2, 52.4, 13.5, 52.6];
      const provider = await pickProvider(berlinBbox);
      expect(provider.id).toBe('osm');
    });

    it('should fallback to OSM provider if NRW fails health check', async () => {
      // Mock NRW provider to fail health check
      const originalHealthcheck = nrwProvider.healthcheck;
      nrwProvider.healthcheck = vi.fn().mockResolvedValue(false);

      const dortmundBbox: [number, number, number, number] = [7.3, 51.4, 7.6, 51.6];
      const provider = await pickProvider(dortmundBbox);
      
      expect(provider.id).toBe('osm');
      
      // Restore original healthcheck
      nrwProvider.healthcheck = originalHealthcheck;
    });
  });

  describe('Utility Functions', () => {
    it('should calculate polygon bounding box correctly', () => {
      const polygon = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.1, 51.5], [8.2, 51.5], [8.2, 51.6], [8.1, 51.6], [8.1, 51.5]]]
        },
        properties: {}
      };

      const bbox = polygonBbox4326(polygon);
      expect(bbox).toEqual([8.1, 51.5, 8.2, 51.6]);
    });

    it('should generate consistent polygon hashes', () => {
      const polygon = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.1, 51.5], [8.2, 51.5], [8.2, 51.6], [8.1, 51.6], [8.1, 51.5]]]
        },
        properties: {}
      };

      const hash1 = simplePolygonHash(polygon);
      const hash2 = simplePolygonHash(polygon);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different polygons', () => {
      const polygon1 = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.1, 51.5], [8.2, 51.5], [8.2, 51.6], [8.1, 51.6], [8.1, 51.5]]]
        },
        properties: {}
      };

      const polygon2 = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.3, 51.7], [8.4, 51.7], [8.4, 51.8], [8.3, 51.8], [8.3, 51.7]]]
        },
        properties: {}
      };

      const hash1 = simplePolygonHash(polygon1);
      const hash2 = simplePolygonHash(polygon2);
      expect(hash1).not.toBe(hash2);
    });

    it('should generate correct cache keys', () => {
      const providerId = 'nrw';
      const polygonHash = 'p123abc';
      const key = cacheKey(providerId, polygonHash);
      expect(key).toBe('nrw:p123abc');
    });
  });

  describe('Error Handling', () => {
    it('should handle NRW WFS failures gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const polygon = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.1, 51.5], [8.2, 51.5], [8.2, 51.6], [8.1, 51.6], [8.1, 51.5]]]
        },
        properties: {}
      };

      await expect(nrwProvider.fetchRoadNetwork(polygon)).rejects.toThrow('NRW WFS request failed');
    });

    it('should handle empty WFS responses', async () => {
      const mockEmptyResponse = {
        type: 'FeatureCollection',
        features: []
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmptyResponse)
      });

      const polygon = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[8.1, 51.5], [8.2, 51.5], [8.2, 51.6], [8.1, 51.6], [8.1, 51.5]]]
        },
        properties: {}
      };

      const result = await nrwProvider.fetchRoadNetwork(polygon);
      expect(result.nodes).toHaveLength(0);
      expect(result.ways).toHaveLength(0);
    });
  });
});
