import { z } from 'zod';

/** Schema für OSM Node */
export const OsmNodeSchema = z.object({
  id: z.union([z.number(), z.string()]),
  lon: z.number(),
  lat: z.number(),
});

/** Schema für OSM Way */
export const OsmWaySchema = z.object({
  id: z.union([z.number(), z.string()]),
  nodeIds: z.array(z.union([z.number(), z.string()])),
  tags: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/** Schema für Entry Detection Input */
export const EntryDetectionInputSchema = z.object({
  polygon: z.object({
    type: z.literal('Feature'),
    geometry: z.object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(z.array(z.number()))),
    }),
    properties: z.any().optional(),
  }),
  osm: z.object({
    nodes: z.array(OsmNodeSchema),
    ways: z.array(OsmWaySchema),
  }),
  outerBufferMeters: z.number().min(1).max(1000).optional().default(30),
  maxSearchMeters: z.number().min(10).max(5000).optional(),
});

/** Schema für Entry Candidate */
export const EntryCandidateSchema = z.object({
  id: z.string(),
  intersectionPoint: z.tuple([z.number(), z.number()]),
  pathNodeIds: z.array(z.union([z.number(), z.string()])),
  path: z.object({
    type: z.literal('Feature'),
    geometry: z.object({
      type: z.literal('LineString'),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
    properties: z.any().optional(),
  }),
  distanceMeters: z.number().min(0),
  straightness: z.number().min(0).max(1),
  continuity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  wayIds: z.array(z.union([z.number(), z.string()])),
});

/** Schema für Entry Detection Result */
export const EntryDetectionResultSchema = z.object({
  candidates: z.array(EntryCandidateSchema),
  processingTimeMs: z.number().min(0),
  graphStats: z.object({
    nodeCount: z.number().min(0),
    wayCount: z.number().min(0),
    edgeCount: z.number().min(0),
  }),
});

/** Schema für Graph-Statistiken */
export const GraphStatsSchema = z.object({
  nodeCount: z.number().min(0),
  wayCount: z.number().min(0),
  edgeCount: z.number().min(0),
  averageNodeDegree: z.number().min(0).optional(),
  connectedComponents: z.number().min(1).optional(),
});

/** Schema für Confidence-Konfiguration */
export const ConfidenceConfigSchema = z.object({
  distanceWeight: z.number().min(0).max(1).default(0.4),
  straightnessWeight: z.number().min(0).max(1).default(0.3),
  continuityWeight: z.number().min(0).max(1).default(0.3),
  minConfidence: z.number().min(0).max(1).default(0.3),
  maxDistance: z.number().min(10).max(1000).default(200),
});

/** Schema für Worker-Nachrichten */
export const WorkerMessageSchema = z.object({
  ok: z.boolean(),
  data: EntryDetectionResultSchema.optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});

/** Type Guards */
export function isValidOsmNode(data: unknown): data is z.infer<typeof OsmNodeSchema> {
  return OsmNodeSchema.safeParse(data).success;
}

export function isValidOsmWay(data: unknown): data is z.infer<typeof OsmWaySchema> {
  return OsmWaySchema.safeParse(data).success;
}

export function isValidEntryCandidate(data: unknown): data is z.infer<typeof EntryCandidateSchema> {
  return EntryCandidateSchema.safeParse(data).success;
}

export function isValidEntryDetectionInput(data: unknown): data is z.infer<typeof EntryDetectionInputSchema> {
  return EntryDetectionInputSchema.safeParse(data).success;
}

export function isValidEntryDetectionResult(data: unknown): data is z.infer<typeof EntryDetectionResultSchema> {
  return EntryDetectionResultSchema.safeParse(data).success;
}

