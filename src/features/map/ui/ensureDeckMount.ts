export function ensureDeckMount(): HTMLElement {
  // First try to use the existing deck3d-root element
  let el = document.getElementById("deck3d-root") as HTMLElement | null;
  
  if (!el) {
    // Fallback to deckgl-mount
    el = document.getElementById("deckgl-mount") as HTMLElement | null;
  }
  
  if (!el) {
    // Create new element if neither exists
    el = document.createElement("div");
    el.id = "deckgl-mount";
    Object.assign(el.style, {
      position: "absolute",
      inset: "0",
      display: "none",
      zIndex: "500",
      pointerEvents: "auto"
    });
    const wrap = document.getElementById("map-wrapper") || document.getElementById("map")?.parentElement || document.body;
    wrap.appendChild(el);
    console.info("[3D] created deck mount dynamically");
  } else {
    console.info("[3D] using existing mount element:", el.id);
  }
  
  const r = el.getBoundingClientRect();
  console.info("[3D] deck mount rect (ensure)", r.width, r.height);
  return el;
}

