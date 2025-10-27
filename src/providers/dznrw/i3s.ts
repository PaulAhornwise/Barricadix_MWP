import {Tile3DLayer} from "@deck.gl/geo-layers";
import {I3SLoader} from "@loaders.gl/i3s";
import type {Layer} from "@deck.gl/core";

export function createDzNrwI3sLayer(): Layer {
  // Use the correct environment variable name
  const RAW = (import.meta as any).env.VITE_DZNRW_SCENESERVER_URL as string || 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
  const PROXY = (import.meta as any).env.VITE_DZNRW_SCENESERVER_PROXY as string | undefined;
  const DATA_URL = PROXY && PROXY.length ? `${PROXY}${encodeURIComponent(RAW)}` : RAW;

  // Use fallback if env var is not set
  const finalUrl = DATA_URL || 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
  
  console.info("[I3S] Using URL =", finalUrl);

  return new Tile3DLayer({
    id: "dz-nrw-i3s",
    data: finalUrl,
    loader: I3SLoader,
    pickable: false,
    loadOptions: {
      i3s: { coordinateSystem: "LNGLAT" },
      fetch: { mode: "cors", credentials: "omit" }
    }
  });
}

