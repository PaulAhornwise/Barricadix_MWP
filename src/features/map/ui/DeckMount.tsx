import { useEffect, useRef } from "react";

export function ensureDeckMount(): HTMLElement {
  let el = document.getElementById("deckgl-mount") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "deckgl-mount";
    Object.assign(el.style, {
      position: "absolute",
      inset: "0",
      display: "none",
      zIndex: "500", // higher than Leaflet canvas/tiles
      pointerEvents: "auto"
    });
    const mapRoot = document.getElementById("map");
    (mapRoot?.parentElement ?? document.body).appendChild(el);
    console.info("[3D] created deck mount");
  }
  return el;
}

export default function DeckMount() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // If you want it in React tree instead of DOM injection, mount here:
    const el = document.getElementById("deckgl-mount");
    if (el && ref.current && el !== ref.current) {
      // Reuse existing node
      ref.current.replaceWith(el);
    } else if (!el && ref.current) {
      ref.current.id = "deckgl-mount";
    }
  }, []);
  return <div id="deckgl-mount" style={{position:"absolute", inset:0, display:"none", zIndex:500, pointerEvents:"auto"}} />;
}

