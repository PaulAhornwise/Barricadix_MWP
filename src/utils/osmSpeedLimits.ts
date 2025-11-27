/**
 * OSM-based speed limit integration for vehicle dynamics
 */

import type { OsmBundle } from '../core/geodata/provider';
import type { OsmNode, OsmWay, OsmNodeId } from '../shared/graph/types';
import { 
  parseMaxspeed, 
  muFromSurface, 
  weatherMultiplier, 
  getTrafficCalmingSpeedCap,
  getDistance,
  closestPointOnSegment,
  WeatherCondition 
} from './osmParse.js';

export interface SpeedLimitConfig {
  useMaxspeed: boolean;
  useTrafficCalming: boolean;
  useSurface: boolean;
  weather: WeatherCondition;
}

export interface PathSample {
  lat: number;
  lng: number;
  distance: number; // cumulative distance from start
}

export interface SpeedConstraints {
  maxspeedCap?: number; // km/h from OSM maxspeed
  calmingCap?: number;  // km/h from traffic_calming
  frictionMu?: number;  // friction coefficient (0-1)
}

/**
 * Apply OSM-based speed constraints to a path
 */
export class OsmSpeedLimiter {
  private osmData: OsmBundle | null = null;
  private nodeIndex = new Map<OsmNodeId, OsmNode>();
  private config: SpeedLimitConfig;

  constructor(config: SpeedLimitConfig) {
    this.config = config;
  }

  setOsmData(data: OsmBundle): void {
    this.osmData = data;
    this.nodeIndex.clear();
    if (data?.nodes) {
      data.nodes.forEach(node => this.nodeIndex.set(node.id, node));
    }
  }

  updateConfig(config: Partial<SpeedLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get speed constraints for a specific point on the path
   */
  getConstraintsAt(point: {lat: number; lng: number}): SpeedConstraints {
    if (!this.osmData) return {};

    const constraints: SpeedConstraints = {};

    // 1. Maxspeed from nearby ways
    if (this.config.useMaxspeed) {
      constraints.maxspeedCap = this.findMaxspeedAt(point);
    }

    // 2. Traffic calming constraints
    if (this.config.useTrafficCalming) {
      constraints.calmingCap = this.findCalmingCapAt(point);
    }

    // 3. Surface friction
    if (this.config.useSurface) {
      constraints.frictionMu = this.findFrictionAt(point);
    }

    return constraints;
  }

  private findMaxspeedAt(point: {lat: number; lng: number}): number | undefined {
    if (!this.osmData) return undefined;

    let closestMaxspeed: number | undefined;
    let closestDistance = Infinity;

    for (const way of this.osmData.ways) {
      if (!way.tags?.maxspeed) continue;
      const tags = way.tags!;

      this.forEachWaySegment(way, (segStart, segEnd) => {
        const closest = closestPointOnSegment(point, segStart, segEnd);
        if (closest.distance < 15 && closest.distance < closestDistance) {
          const parsed = parseMaxspeed(String(tags.maxspeed));
          if (parsed !== undefined) {
            closestMaxspeed = parsed;
            closestDistance = closest.distance;
          }
        }
      });
    }

    return closestMaxspeed;
  }

  private findCalmingCapAt(point: {lat: number; lng: number}): number | undefined {
    if (!this.osmData) return undefined;

    let lowestCap: number | undefined;

    for (const calmingNode of (this.osmData.calming || [])) {
      const nodePoint = { lat: calmingNode.lat, lng: calmingNode.lon };
      const distance = getDistance(point, nodePoint);

      // Within 25m influence zone
      if (distance <= 25) {
        const cap = getTrafficCalmingSpeedCap(calmingNode.kind);
        if (cap !== undefined) {
          lowestCap = lowestCap === undefined ? cap : Math.min(lowestCap, cap);
        }
      }
    }

    return lowestCap;
  }

  private findFrictionAt(point: {lat: number; lng: number}): number | undefined {
    if (!this.osmData) return undefined;

    let closestMu: number | undefined;
    let closestDistance = Infinity;

    for (const way of this.osmData.ways) {
      if (!way.tags?.surface) continue;
      const tags = way.tags!;

      this.forEachWaySegment(way, (segStart, segEnd) => {
        const closest = closestPointOnSegment(point, segStart, segEnd);
        if (closest.distance < 15 && closest.distance < closestDistance) {
          const baseMu = muFromSurface(String(tags.surface), tags.smoothness ? String(tags.smoothness) : undefined);
          if (baseMu !== undefined) {
            closestMu = baseMu * weatherMultiplier(this.config.weather);
            closestDistance = closest.distance;
          }
        }
      });
    }

    return closestMu;
  }

  private forEachWaySegment(
    way: OsmWay,
    cb: (segStart: {lat: number; lng: number}, segEnd: {lat: number; lng: number}) => void
  ): void {
    if (!way.nodeIds || way.nodeIds.length < 2) return;
    for (let i = 0; i < way.nodeIds.length - 1; i++) {
      const start = this.nodeIndex.get(way.nodeIds[i]);
      const end = this.nodeIndex.get(way.nodeIds[i + 1]);
      if (!start || !end) continue;
      cb({ lat: start.lat, lng: start.lon }, { lat: end.lat, lng: end.lon });
    }
  }

  /**
   * Apply constraints to velocity calculation
   */
  applyConstraints(
    baseVelocityKmH: number,
    constraints: SpeedConstraints,
    curvatureRadius?: number
  ): number {
    let limitedVelocity = baseVelocityKmH;

    // Apply maxspeed cap
    if (constraints.maxspeedCap !== undefined) {
      limitedVelocity = Math.min(limitedVelocity, constraints.maxspeedCap);
    }

    // Apply traffic calming cap
    if (constraints.calmingCap !== undefined) {
      limitedVelocity = Math.min(limitedVelocity, constraints.calmingCap);
    }

    // Apply friction-based curve speed limit
    if (constraints.frictionMu !== undefined && curvatureRadius !== undefined && curvatureRadius > 0) {
      const g = 9.81; // m/s²
      const maxCurveSpeedMs = Math.sqrt(constraints.frictionMu * g * 0.95 * curvatureRadius);
      const maxCurveSpeedKmH = maxCurveSpeedMs * 3.6;
      limitedVelocity = Math.min(limitedVelocity, maxCurveSpeedKmH);
    }

    return limitedVelocity;
  }

  /**
   * Calculate friction-limited acceleration
   */
  getFrictionLimitedAcceleration(
    constraints: SpeedConstraints,
    lateralAcceleration: number = 0
  ): number | undefined {
    if (!constraints.frictionMu) return undefined;

    const g = 9.81; // m/s²
    const maxTotalAccel = constraints.frictionMu * g;
    const ayNormalized = Math.min(1, Math.abs(lateralAcceleration) / maxTotalAccel);
    
    // Kamm circle: ax_max = μ*g * sqrt(1 - (ay/(μ*g))²)
    const axMax = maxTotalAccel * Math.sqrt(1 - ayNormalized * ayNormalized);
    
    return axMax;
  }
}

