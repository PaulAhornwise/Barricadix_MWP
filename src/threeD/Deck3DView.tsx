import {useMemo, useState, useCallback} from "react";
import {DeckGL} from "@deck.gl/react";
import {MapView, MapController} from "@deck.gl/core";
import {createBasemapLayer} from "./deckBasemap";
import {createDzNrwI3sLayer} from "../providers/dznrw/i3s";
import {registerLoaders} from "@loaders.gl/core";
import {I3SLoader} from "@loaders.gl/i3s";

registerLoaders(I3SLoader);

export type ViewState = { longitude:number; latitude:number; zoom:number; pitch?:number; bearing?:number; };

type Props = { initialViewState: ViewState; onViewStateChange?: (vs: ViewState)=>void; dzUrl: string; className?: string; style?: React.CSSProperties; };

export default function Deck3DView({ initialViewState, onViewStateChange, dzUrl, className, style }: Props) {
  // Validate initialViewState to prevent "invalid latitude" errors
  const validatedInitial = {
    longitude: Math.max(-180, Math.min(180, initialViewState.longitude)),
    latitude: Math.max(-90, Math.min(90, initialViewState.latitude)),
    zoom: Math.max(2, Math.min(19, initialViewState.zoom)),
    pitch: Math.max(0, Math.min(90, initialViewState.pitch ?? 45)),
    bearing: initialViewState.bearing ?? 0
  };
  
  console.log("[3D] Deck3DView initialViewState:", { original: initialViewState, validated: validatedInitial });
  
  const [viewState, setViewState] = useState(validatedInitial);
  const handleVS = useCallback(({viewState: vs}: any) => {
    // Validate coordinates before updating state
    const validLng = Math.max(-180, Math.min(180, vs.longitude));
    const validLat = Math.max(-90, Math.min(90, vs.latitude));
    const validZoom = Math.max(2, Math.min(19, vs.zoom));
    
    const next = { 
      longitude: validLng, 
      latitude: validLat, 
      zoom: validZoom, 
      pitch: vs.pitch, 
      bearing: vs.bearing 
    };
    setViewState(next); onViewStateChange?.(next);
  }, [onViewStateChange]);

  const layers = useMemo(() => {
    // Use proper basemap with TileLayer + BitmapLayer
    const base = createBasemapLayer("basemap");
    
    // Use Tile3DLayer + I3SLoader for DZ-NRW I3S data
    const i3s = createDzNrwI3sLayer();
    
    const arr = [base, i3s];
    console.info("[3D] deck layers =", arr.map(l=>l.id));
    return arr;
  }, []);

  return (
    <div className={className} style={{position:"absolute", inset:0, ...(style||{})}}>
      <DeckGL views={new MapView({id:"main", repeat:false})} controller={MapController} viewState={viewState} onViewStateChange={handleVS} layers={layers} />
      <div style={{position:"absolute", right:10, bottom:8, background:"rgba(0,0,0,0.45)", color:"#fff", fontSize:12, padding:"4px 8px", borderRadius:6}}>
        3D © Digitaler Zwilling NRW · Basemap © OSM/Carto
      </div>
    </div>
  );
}