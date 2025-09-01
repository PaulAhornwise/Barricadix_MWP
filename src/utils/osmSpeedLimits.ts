/**
 * OSM-based speed limit integration for vehicle dynamics
 */

import { OsmBundle, OsmWayLite, OsmTrafficNode } from './osm.js';
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
  private config: SpeedLimitConfig;

  constructor(config: SpeedLimitConfig) {
    this.config = config;
  }

  setOsmData(data: OsmBundle): void {
    this.osmData = data;
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
      if (!way.tags.maxspeed || way.nodes.length < 2) continue;

      // Check distance to way segments
      for (let i = 0; i < way.nodes.length - 1; i++) {
        const segStart = { lat: way.nodes[i].lat, lng: way.nodes[i].lon };
        const segEnd = { lat: way.nodes[i + 1].lat, lng: way.nodes[i + 1].lon };
        
        const closest = closestPointOnSegment(point, segStart, segEnd);
        
        // Within 15m tolerance
        if (closest.distance < 15 && closest.distance < closestDistance) {
          const parsed = parseMaxspeed(way.tags.maxspeed);
          if (parsed !== undefined) {
            closestMaxspeed = parsed;
            closestDistance = closest.distance;
          }
        }
      }
    }

    return closestMaxspeed;
  }

  private findCalmingCapAt(point: {lat: number; lng: number}): number | undefined {
    if (!this.osmData) return undefined;

    let lowestCap: number | undefined;

    for (const calmingNode of this.osmData.calming) {
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
      if (!way.tags.surface || way.nodes.length < 2) continue;

      // Check distance to way segments
      for (let i = 0; i < way.nodes.length - 1; i++) {
        const segStart = { lat: way.nodes[i].lat, lng: way.nodes[i].lon };
        const segEnd = { lat: way.nodes[i + 1].lat, lng: way.nodes[i + 1].lon };
        
        const closest = closestPointOnSegment(point, segStart, segEnd);
        
        // Within 15m tolerance
        if (closest.distance < 15 && closest.distance < closestDistance) {
          const baseMu = muFromSurface(way.tags.surface, way.tags.smoothness);
          if (baseMu !== undefined) {
            closestMu = baseMu * weatherMultiplier(this.config.weather);
            closestDistance = closest.distance;
          }
        }
      }
    }

    return closestMu;
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

