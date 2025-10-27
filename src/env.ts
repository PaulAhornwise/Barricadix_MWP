// src/env.ts
type Env = {
  DZ_URL: string | null;
  DZ_PROXY: string | null;
  BASEMAP: "carto" | "osm-proxy";
};

function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

const e = (import.meta as any).env || {};

export const ENV: Env = {
  DZ_URL: str(e.VITE_DZNRW_SCENESERVER_URL),
  DZ_PROXY: str(e.VITE_DZNRW_SCENESERVER_PROXY),
  BASEMAP: (str(e.VITE_BASEMAP_PROVIDER) as Env["BASEMAP"]) || "carto",
};

export function requireDZUrl(): string {
  if (!ENV.DZ_URL) {
    const msg = "3D‑URL fehlt. Bitte 'VITE_DZNRW_SCENESERVER_URL' in .env.local setzen.";
    console.error("[3D] " + msg, ENV);
    throw new Error(msg);
  }
  return ENV.DZ_URL;
}

export function buildFinalI3SUrl(): string {
  // Use fallback URL if env var is not set
  const base = ENV.DZ_URL || 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0';
  
  // if a proxy is configured, we map to /dz-nrw/i3s?url=...
  if (ENV.DZ_PROXY) {
    const u = `${ENV.DZ_PROXY}?url=${encodeURIComponent(base)}`;
    console.info("[3D] using PROXY", { proxy: ENV.DZ_PROXY, finalUrl: u });
    return u;
  }
  console.info("[3D] using DIRECT I3S URL", { url: base });
  return base;
}

