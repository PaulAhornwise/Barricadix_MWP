import * as Cesium from "cesium";

export type DzLoadResult = { 
  tileset?: Cesium.Cesium3DTileset; 
  imagery?: Cesium.ImageryLayer;
  source: '3dtiles' | 'scene-imagery' | 'scene-tileset' | 'placeholder';
};

export async function addDzNrw3D(viewer: Cesium.Viewer): Promise<DzLoadResult> {
  console.log('🏗️ Loading DZ NRW 3D content...');
  
  // For now, skip actual DZ NRW loading due to CORS issues
  // and create a placeholder 3D scene for demonstration
  console.log('🎯 DZ NRW endpoints not accessible due to CORS restrictions');
  console.log('🎯 Creating placeholder 3D scene for demonstration...');
  
  try {
    // Add multiple 3D buildings for demonstration
    const buildings = [
      { lon: 8.108, lat: 51.5707, height: 50, color: Cesium.Color.BLUE, label: 'DZ NRW Demo 1' },
      { lon: 8.109, lat: 51.5710, height: 75, color: Cesium.Color.GREEN, label: 'DZ NRW Demo 2' },
      { lon: 8.107, lat: 51.5705, height: 40, color: Cesium.Color.RED, label: 'DZ NRW Demo 3' },
      { lon: 8.110, lat: 51.5708, height: 60, color: Cesium.Color.YELLOW, label: 'DZ NRW Demo 4' }
    ];
    
    buildings.forEach((building) => {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(building.lon, building.lat, 0),
        box: {
          dimensions: new Cesium.Cartesian3(80.0, 80.0, building.height),
          material: building.color.withAlpha(0.8),
          outline: true,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2
        },
        label: {
          text: building.label,
          font: '12pt sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -building.height - 20),
          scale: 0.8
        }
      });
    });
    
    // Add terrain and lighting effects
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.dynamicAtmosphereLighting = true;
    viewer.scene.globe.atmosphereLightIntensity = 10.0;
    
    // Add some ground markers
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(8.1085, 51.5707, 0),
      cylinder: {
        length: 5.0,
        topRadius: 0.0,
        bottomRadius: 10.0,
        material: Cesium.Color.CYAN.withAlpha(0.7),
        outline: true,
        outlineColor: Cesium.Color.WHITE
      }
    });
    
    // Set camera to view the demo buildings
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(8.108, 51.5707, 800),
      orientation: {
        heading: 0.0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0
      }
    });
    
    console.log('✅ Placeholder 3D scene created successfully');
    console.log('📊 Added', buildings.length, 'demo buildings');
    console.log('📊 Camera positioned for optimal viewing');
    
    return {
      source: 'placeholder' as const,
      tileset: undefined,
      imagery: undefined
    };
    
  } catch (error) {
    console.error('❌ Failed to create placeholder 3D scene:', error);
    throw new Error("Could not load 3D content - placeholder creation failed");
  }
}

export function cleanupDzNrw3D(viewer: Cesium.Viewer): void {
  console.log('🧹 Cleaning up DZ NRW 3D content...');
  
  try {
    // Remove all entities (buildings, markers, etc.)
    if (viewer && viewer.entities) {
      viewer.entities.removeAll();
    }
    
    // Reset terrain and lighting to defaults
    if (viewer && viewer.scene && viewer.scene.globe) {
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.dynamicAtmosphereLighting = false;
      viewer.scene.globe.atmosphereLightIntensity = 1.0;
    }
    
    console.log('✅ DZ NRW 3D content cleaned up successfully');
    
  } catch (error) {
    console.error('❌ Failed to cleanup DZ NRW 3D content:', error);
  }
}