import { useEffect, useRef } from "react";
import * as Cesium from "cesium";

type ViewParams = { 
  center?: [number, number]; 
  height?: number; 
  bbox4326?: [number, number, number, number] 
};

type Props = {
  className?: string;
  onReady?: (viewer: Cesium.Viewer) => void;
  onCameraChange?: (p: { center: [number, number]; height: number }) => void;
  initialView?: ViewParams;
};

export default function CesiumContainer({ className, onReady, onCameraChange, initialView }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    
    console.log('🌍 Creating Cesium viewer...');
    
    const v = new Cesium.Viewer(elRef.current, {
      animation: false, 
      timeline: false, 
      geocoder: false, 
      baseLayerPicker: false,
      homeButton: false, 
      navigationHelpButton: false, 
      sceneMode: Cesium.SceneMode.SCENE3D,
      // Use default terrain (no custom terrain provider for now)
    });
    
    // Performance optimizations
    v.scene.requestRenderMode = true;
    (v.scene as any).maximumRenderTimeChange = Infinity;
    
    // Hide Cesium credit container
    (v.cesiumWidget.creditContainer as HTMLElement).style.display = "none";
    
    // Enable depth testing for better 3D rendering
    v.scene.globe.depthTestAgainstTerrain = true;

    viewerRef.current = v;
    onReady?.(v);
    
    console.log('✅ Cesium viewer created successfully');

    const handler = v.camera.moveEnd.addEventListener(() => {
      const c = v.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(c.longitude);
      const lat = Cesium.Math.toDegrees(c.latitude);
      onCameraChange?.({ center: [lon, lat], height: c.height });
      v.scene.requestRender();
    });

    return () => {
      console.log('🗑️ Destroying Cesium viewer...');
      handler();
      v.destroy();
      viewerRef.current = null;
      console.log('✅ Cesium viewer destroyed');
    };
  }, []);

  useEffect(() => {
    if (!viewerRef.current || !initialView) return;
    
    const v = viewerRef.current;
    console.log('🎯 Setting initial view:', initialView);
    
    if (initialView.bbox4326) {
      const [minLon, minLat, maxLon, maxLat] = initialView.bbox4326;
      console.log(`📍 Flying to bbox: [${minLon}, ${minLat}, ${maxLon}, ${maxLat}]`);
      v.camera.flyTo({ 
        destination: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
        duration: 1.0
      });
    } else if (initialView.center) {
      const [lon, lat] = initialView.center;
      const height = initialView.height ?? 1200;
      console.log(`📍 Flying to center: [${lon}, ${lat}] at height ${height}`);
      v.camera.flyTo({ 
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        duration: 1.0
      });
    }
  }, [initialView]);

  return <div ref={elRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
