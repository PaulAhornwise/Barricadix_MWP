import {TileLayer} from "@deck.gl/geo-layers";
import {BitmapLayer} from "@deck.gl/layers";

function getTemplate(): string {
  const envTpl = (import.meta as any).env.VITE_BASEMAP_TEMPLATE?.toString().trim();
  const fallbackCarto = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
  return envTpl && envTpl.length ? envTpl : fallbackCarto;
}

export function createBasemapLayer(id = "basemap") {
  const template = getTemplate();
  console.info("[Basemap] template =", template);

  return new TileLayer({
    id,
    data: template,        // DeckGL löst {z}/{x}/{y} pro Kachel
    tileSize: 256,
    minZoom: 0,
    maxZoom: 19,
    renderSubLayers: (props: any) => {
      const {west, south, east, north} = props.tile.bbox;
      const image = props.data; // URL‑String der aktuellen Kachel
      if (!image) {
        console.warn("[Basemap] missing tile image", props.tile);
        return null;
      }
      return new BitmapLayer(props, {
        id: `${props.id}-bmp-${props.tile.id}`,
        bounds: [west, south, east, north],
        image,
        pickable: false
      });
    }
  });
}

