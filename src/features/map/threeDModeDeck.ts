import React from "react";
import ReactDOM from "react-dom/client";
import Deck3DView, {ViewState} from "../../threeD/Deck3DView";
import { buildFinalI3SUrl } from "../../env";
import { ensureDeckMount } from "./ui/ensureDeckMount";

const NRW_BBOX_4326: [number, number, number, number] = [5.86, 50.32, 9.46, 52.53];
const inNrw = (b: [number,number,number,number]) =>
  !(b[0] > NRW_BBOX_4326[2] || b[2] < NRW_BBOX_4326[0] || b[1] > NRW_BBOX_4326[3] || b[3] < NRW_BBOX_4326[1]);

type State = {
  is3D: boolean;
  last2D?: { center: [number, number]; zoom: number };
  deckRoot?: ReactDOM.Root | null;
  current3D?: ViewState;
};
export const threeDDeckState: State = { is3D: false, deckRoot: null };

async function i3sHealthcheckJson(url: string): Promise<boolean> {
  try {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "f=pjson", { method: "GET" });
    if (!r.ok) {
      console.warn("[3D] healthcheck HTTP", r.status, url);
      return false;
    }
    const txt = await r.text();
    // ArcGIS Scene/Layer JSON usually exposes these keys
    const ok = /"layerType"|"\blayers\b"|"serviceItemId"|"capabilities"/.test(txt);
    if (!ok) {
      console.error("[3D] unexpected healthcheck payload snippet:", txt.slice(0, 200));
    }
    return ok;
  } catch (e) {
    console.error("[3D] healthcheck exception", e);
    return false;
  }
}

export async function enter3DDeck(map: L.Map, mountEl?: HTMLElement) {
  console.info("🐾 [3D] entering…");
  const deckEl = mountEl ?? ensureDeckMount();
  
  const b = map.getBounds();
  const bbox: [number,number,number,number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  threeDDeckState.last2D = { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() };

  if (!inNrw(bbox)) { alert("3D-Daten (DZ NRW) nicht verfügbar – außerhalb NRW."); return; }

  let finalUrl: string;
  try {
    finalUrl = buildFinalI3SUrl();
  } catch (e: any) {
    alert(e?.message || "3D‑URL fehlt. Bitte in .env.local setzen.");
    return;
  }

  const ok = await i3sHealthcheckJson(finalUrl);
  if (!ok) {
    alert("3D‑Daten (DZ NRW) antworten unerwartet. Prüfe URL/CORS oder entferne Proxy.");
    return;
  }
  console.info("[3D] healthcheck OK → mount DeckGL with I3S:", finalUrl);

  // Keep layout: do NOT use display:none on Leaflet!
  const mapEl = map.getContainer() as HTMLElement;
  mapEl.style.visibility = "hidden";
  mapEl.style.pointerEvents = "none";

  // Show DeckGL
  deckEl.style.display = "block";
  deckEl.style.zIndex = "500";

  // Log size & gently trigger a resize so DeckGL re-measures
  const rect = deckEl.getBoundingClientRect();
  console.info("[3D] deck mount rect", rect.width, rect.height);
  if (rect.width === 0 || rect.height === 0) {
    console.warn("[3D] mount has zero size — check #map-wrapper/#map CSS heights");
  }
  setTimeout(() => window.dispatchEvent(new Event("resize")), 0);

  // Validate and clamp coordinates to prevent "invalid latitude" errors
  const centerLng = threeDDeckState.last2D!.center[0];
  const centerLat = threeDDeckState.last2D!.center[1];
  const zoom = threeDDeckState.last2D!.zoom;
  
  // Clamp latitude to valid range [-90, 90] and longitude to [-180, 180]
  const validLat = Math.max(-90, Math.min(90, centerLat));
  const validLng = Math.max(-180, Math.min(180, centerLng));
  const validZoom = Math.max(2, Math.min(19, zoom));
  
  console.info("[3D] validating coordinates:", { 
    original: { lng: centerLng, lat: centerLat, zoom }, 
    validated: { lng: validLng, lat: validLat, zoom: validZoom } 
  });

  const initialView: ViewState = threeDDeckState.current3D ?? {
    longitude: validLng,
    latitude: validLat,
    zoom: validZoom,
    pitch: 45, 
    bearing: 0
  };

  if (!threeDDeckState.deckRoot) {
    threeDDeckState.deckRoot = ReactDOM.createRoot(deckEl); // create ONCE
    console.info("[3D] created deck root");
  } else {
    console.info("[3D] reuse deck root");
  }
  threeDDeckState.deckRoot.render(
    React.createElement(Deck3DView, {
      initialViewState: initialView,
      dzUrl: finalUrl,
      onViewStateChange: (vs) => { threeDDeckState.current3D = vs; }
    })
  );

  threeDDeckState.is3D = true;
}

export function exit3DDeck(map: L.Map, mountEl?: HTMLElement) {
  console.info("[3D] exiting");
  const deckEl = mountEl ?? document.getElementById("deckgl-mount") as HTMLElement | null;
  const mapEl = map.getContainer() as HTMLElement;

  // Restore Leaflet visibility
  mapEl.style.visibility = "visible";
  mapEl.style.pointerEvents = "auto";

  // Hide DeckGL
  if (deckEl) deckEl.style.display = "none";

  // Optional: small resize to force redraw
  setTimeout(() => window.dispatchEvent(new Event("resize")), 0);

  const vs = threeDDeckState.current3D;
  if (vs) map.setView([vs.latitude, vs.longitude], Math.round(vs.zoom));
  else if (threeDDeckState.last2D) map.setView([threeDDeckState.last2D.center[1], threeDDeckState.last2D.center[0]], threeDDeckState.last2D.zoom);

  console.info("[3D] show leaflet, hide deck");
  threeDDeckState.is3D = false;
}