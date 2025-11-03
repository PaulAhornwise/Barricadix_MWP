/**
 * Overpass API helper with robust error handling and fallback support
 * Optimized for GitHub Pages deployment
 */

interface OverpassResponse {
  elements: any[];
  remark?: string;
}

interface OverpassOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  endpoints?: string[];
  signal?: AbortSignal;
}

// Default Overpass endpoints (in order of preference)
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];

/**
 * Fetch data from Overpass API with automatic fallback and retries
 */
export async function fetchOverpassWithFallback(
  query: string,
  options: OverpassOptions = {}
): Promise<OverpassResponse> {
  const {
    timeout = 25,
    maxRetries = 3,
    retryDelay = 2000,
    endpoints = DEFAULT_ENDPOINTS,
    signal
  } = options;

  const errors: Array<{ endpoint: string; error: string }> = [];

  // Try each endpoint in order
  for (const endpoint of endpoints) {
    console.log(`[overpassHelper] Trying endpoint: ${endpoint}`);
    
    // Try multiple times for current endpoint
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Combine external abort signal with internal timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
        
        // Also listen to external signal
        if (signal) {
          signal.addEventListener('abort', () => controller.abort());
        }

        const url = `${endpoint}?data=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        });

        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', () => controller.abort());

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          
          // Handle specific error cases
          if (response.status === 504 || response.status === 502) {
            throw new Error(`Gateway timeout (${response.status})`);
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded');
          } else if (response.status === 400) {
            throw new Error(`Bad request: ${errorText.substring(0, 200)}`);
          } else {
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
          }
        }

        const data = await response.json();

        // Check for Overpass-specific errors
        if (data.remark) {
          console.warn(`[overpassHelper] Overpass warning: ${data.remark}`);
        }

        if (!data.elements || !Array.isArray(data.elements)) {
          throw new Error('Invalid response format: missing elements array');
        }

        console.log(`[overpassHelper] ✅ Success from ${endpoint}: ${data.elements.length} elements`);
        return data;

      } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[overpassHelper] Attempt ${attempt}/${maxRetries} failed on ${endpoint}: ${errorMsg}`);

        // If aborted due to timeout, try next endpoint immediately
        if (error.name === 'AbortError') {
          errors.push({ endpoint, error: 'Timeout' });
          break;
        }

        // Wait before retrying same endpoint
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          errors.push({ endpoint, error: errorMsg });
        }
      }
    }
  }

  // All attempts failed
  const errorSummary = errors.map(e => `${e.endpoint}: ${e.error}`).join('; ');
  throw new Error(`All Overpass endpoints failed after ${maxRetries} attempts each. Errors: ${errorSummary}`);
}

/**
 * Create an optimized Overpass query for threat analysis
 */
export function createThreatAnalysisQuery(bbox: string, timeout: number = 25): string {
  return `
    [out:json][timeout:${timeout}];
    (
      way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|living_street|track)$"](bbox:${bbox});
      way["highway"~"^(motorway|trunk)$"](bbox:${bbox});
      way["highway"="cycleway"]["motor_vehicle"!="no"](bbox:${bbox});
      way["railway"="tram"](bbox:${bbox});
      way["access"~"^(yes|permissive)$"]["highway"](bbox:${bbox});
    );
    (._;>;);
    out geom;
  `.trim();
}

/**
 * POST request helper (for larger queries)
 */
export async function fetchOverpassPOSTWithFallback(
  query: string,
  options: OverpassOptions = {}
): Promise<OverpassResponse> {
  const {
    timeout = 25,
    maxRetries = 2,
    retryDelay = 3000,
    endpoints = [DEFAULT_ENDPOINTS[0]], // POST usually only works on main endpoint
    signal
  } = options;

  const errors: Array<{ endpoint: string; error: string }> = [];

  for (const endpoint of endpoints) {
    console.log(`[overpassHelper] Trying POST endpoint: ${endpoint}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
        
        // Also listen to external signal
        if (signal) {
          signal.addEventListener('abort', () => controller.abort());
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          body: query,
          headers: {
            'Content-Type': 'text/plain',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', () => controller.abort());

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();

        if (!data.elements || !Array.isArray(data.elements)) {
          throw new Error('Invalid response format');
        }

        console.log(`[overpassHelper] ✅ POST success from ${endpoint}: ${data.elements.length} elements`);
        return data;

      } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[overpassHelper] POST attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          errors.push({ endpoint, error: errorMsg });
        }
      }
    }
  }

  throw new Error(`All POST endpoints failed. Errors: ${errors.map(e => e.error).join('; ')}`);
}

