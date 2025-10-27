import {GeoJsonLayer} from "@deck.gl/layers";

/**
 * Creates a placeholder 3D buildings layer for demonstration purposes.
 * This is used when the real I3S data from DZ NRW is unavailable or contains invalid coordinates.
 */
export function createPlaceholder3DBuildings() {
  // Generate sample 3D building footprints in Paderborn city center
  const center = [8.7575, 51.7189]; // Paderborn coordinates (matching map center)
  const buildings: any[] = [];
  
  // Create a grid of buildings (10x10)
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      const offsetLng = (i - 5) * 0.001; // Smaller offset for Paderborn
      const offsetLat = (j - 5) * 0.0005; // Smaller offset for Paderborn
      const lng = center[0] + offsetLng;
      const lat = center[1] + offsetLat;
      
      // Random building height (10-50 meters)
      const height = 10 + Math.random() * 40;
      
      // Create a rectangular building footprint
      const size = 0.0001; // Smaller buildings for Paderborn
      buildings.push({
        type: "Feature",
        properties: {
          height,
          color: [100 + Math.random() * 100, 100 + Math.random() * 100, 150 + Math.random() * 100]
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [lng - size, lat - size],
            [lng + size, lat - size],
            [lng + size, lat + size],
            [lng - size, lat + size],
            [lng - size, lat - size]
          ]]
        }
      });
    }
  }
  
  console.info("[3D] Created", buildings.length, "placeholder buildings");
  console.log("[3D] First building coordinates:", buildings[0]?.geometry?.coordinates);
  console.log("[3D] Building center:", center);
  
  return new GeoJsonLayer({
    id: "placeholder-buildings",
    data: {
      type: "FeatureCollection",
      features: buildings
    },
    extruded: true,
    wireframe: true,
    getElevation: (d: any) => {
      console.log("[3D] getElevation called with:", d?.properties?.height);
      return d.properties.height;
    },
    getFillColor: (d: any) => {
      console.log("[3D] getFillColor called with:", d?.properties?.color);
      return d.properties.color;
    },
    getLineColor: [80, 80, 80],
    lineWidthMinPixels: 1,
    pickable: true,
    onHover: (info: any) => {
      if (info.object) {
        console.log("[3D] Building hovered:", info.object);
      }
    }
  });
}


