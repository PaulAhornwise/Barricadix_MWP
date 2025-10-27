type Props = { is3D: boolean; onToggle: () => void };
export function ThreeDToggle({is3D, onToggle}: Props) {
  return (
    <button className="leaflet-control leaflet-bar" style={{padding:8}} onClick={onToggle} title="2D / 3D umschalten">
      {is3D ? "3D" : "2D"}
    </button>
  );
}