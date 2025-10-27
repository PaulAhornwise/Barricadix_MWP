import { featureCollection, lineString, point, polygon as turfPolygon } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import lineIntersect from "@turf/line-intersect";
import buffer from "@turf/buffer";
import bboxPolygon from "@turf/bbox-polygon";
import bbox from "@turf/bbox";
import length from "@turf/length";
import lineChunk from "@turf/line-chunk";
import { Feature, LineString, Polygon, Position } from "geojson";

export function makeOuterBuffer(poly: Feature<Polygon>, meters = 30): Feature<Polygon> {
  return buffer(poly, meters, { units: "meters" }) as Feature<Polygon>;
}

export function isInside(poly: Feature<Polygon>, coord: Position): boolean {
  return booleanPointInPolygon(point(coord), poly);
}

/** Schneidet eine Linienfolge mit dem Polygonrand und liefert die Schnittpunkte (Position[]) */
export function intersectLineWithPolygon(line: Feature<LineString>, poly: Feature<Polygon>): Position[] {
  const inter = lineIntersect(line, poly);
  return inter.features.map(f => (f.geometry as any).coordinates as Position);
}

export function linestringLengthMeters(line: Feature<LineString>): number {
  return length(line, { units: "meters" }) * 1000;
}

/** Grobe „Geradheit" 0..1 aus Segmentwinkeln (1 = gerade) */
export function straightness01(coords: Position[]): number {
  if (coords.length < 3) return 1;
  let turn = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const a = coords[i - 1], b = coords[i], c = coords[i + 1];
    const ang = angleAt(b, a, c); // 0..π
    turn += Math.abs(Math.PI - ang);
  }
  const norm = Math.min(turn / (Math.PI * (coords.length - 2)), 1);
  return 1 - norm;
}

function angleAt(b: Position, a: Position, c: Position): number {
  const v1 = [a[0] - b[0], a[1] - b[1]];
  const v2 = [c[0] - b[0], c[1] - b[1]];
  const dot = v1[0]*v2[0] + v1[1]*v2[1];
  const n1 = Math.hypot(v1[0], v1[1]);
  const n2 = Math.hypot(v2[0], v2[1]);
  return Math.acos(Math.max(-1, Math.min(1, dot / (n1*n2))));
}

/** Berechnet Bounding Box eines Polygons */
export function getPolygonBbox(poly: Feature<Polygon>): [number, number, number, number] {
  return bbox(poly);
}

/** Erstellt Bounding Box als Polygon */
export function bboxToPolygon(bbox: [number, number, number, number]): Feature<Polygon> {
  return bboxPolygon(bbox);
}

/** Prüft ob ein Punkt in der Nähe eines Polygons liegt */
export function isNearPolygon(poly: Feature<Polygon>, coord: Position, maxDistanceMeters: number): boolean {
  const buffered = buffer(poly, maxDistanceMeters, { units: "meters" });
  return isInside(buffered as Feature<Polygon>, coord);
}

/** Findet den nächsten Punkt auf dem Polygonrand */
export function findNearestPointOnPolygon(poly: Feature<Polygon>, coord: Position): Position {
  // Vereinfachte Implementierung - in Produktion würde man hier eine robustere Methode verwenden
  const coords = poly.geometry.coordinates[0];
  let minDist = Infinity;
  let nearest: Position = coords[0];
  
  for (const ring of poly.geometry.coordinates) {
    for (const point of ring) {
      const dist = Math.hypot(coord[0] - point[0], coord[1] - point[1]);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }
  }
  
  return nearest;
}





