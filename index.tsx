

/**
 * This script handles the interactivity for the HVM dashboard.
 * - Initializes a clean OpenStreetMap map using Leaflet.js.
 * - Sets up event listeners for user controls in the sidebar.
 * - Manages tooltip display for info icons.
 * - Implements map search functionality using the Nominatim API.
 * - Allows users to draw paths and polygons on the map.
 * - Dynamically analyzes drawn polygons for intersecting roads via Overpass API.
 * - Generates a PDF risk report with an AI-powered summary.
 */

import { GoogleGenAI, Type } from "@google/genai";

// Extend the Window interface to include jspdf for TypeScript.
declare global {
    interface Window {
      jspdf: any;
    }
}

// Declare global variables from included libraries to satisfy TypeScript.
declare const L: any;
declare const jsPDF: any;
declare const html2canvas: any;

// App state
let map: any; // Module-scoped map object
let tileLayer: any; // Module-scoped tile layer object
let searchMarker: any = null; // To keep track of the current search marker
let isDrawingMode = false;
let waypoints: any[] = [];
let waypointMarkers: any[] = [];
let pathLine: any = null;
let drawnPolygon: any = null;
let polygonLabel: any = null; // To store the label for the polygon
let threatMarkersMap = new Map<string, any[]>(); // Maps street name to an array of its marker layers
let threatsMap = new Map<string, { entryPoints: any[], pathSegments: any[][], totalLength: number }>(); // To store analysis data for report
let generatedPdf: any = null; // To hold the generated PDF object
let productDatabase: any[] = []; // To cache the product data

// Internationalization (i18n) state
let currentLanguage = 'de';
let translations: any = {};


// ===============================================
// I18n & TRANSLATION FUNCTIONS
// ===============================================

/**
 * Retrieves a nested property from an object using a string path.
 * @param obj The object to search.
 * @param path The string path (e.g., 'nav.header').
 * @returns The value of the property or undefined if not found.
 */
function getProperty(obj: any, path: string) {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
}

/**
 * Main translation function.
 * @param key The key for the translation string (e.g., 'alerts.noPolygon').
 * @param replacements An object of placeholders to replace in the string.
 * @returns The translated string.
 */
function t(key: string, replacements?: { [key: string]: string | number }): string {
    let text = getProperty(translations[currentLanguage], key);
    if (typeof text !== 'string') {
        console.warn(`Translation key not found for language '${currentLanguage}': ${key}`);
        return key; // Return the key as a fallback
    }
    if (replacements) {
        for (const placeholder in replacements) {
            text = text.replace(`{${placeholder}}`, String(replacements[placeholder]));
        }
    }
    return text;
}

/**
 * Applies the current language's translations to all tagged DOM elements.
 */
async function translateUI() {
    if (!translations[currentLanguage]) {
        await loadTranslations();
    }
    
    document.querySelectorAll('[data-translate-key]').forEach(element => {
        const key = element.getAttribute('data-translate-key')!;
        const translatedText = t(key);
        if (element.hasAttribute('placeholder')) {
             (element as HTMLInputElement).placeholder = translatedText;
        } else if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'text') {
             (element as HTMLInputElement).value = translatedText;
        }
        else {
            // Find the deepest text node if any, otherwise set textContent
            const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
            if (textNode) {
                textNode.textContent = translatedText;
            } else {
                 element.textContent = translatedText;
            }
        }
    });

     document.querySelectorAll('[data-translate-key-placeholder]').forEach(element => {
        const key = element.getAttribute('data-translate-key-placeholder')!;
        (element as HTMLInputElement).placeholder = t(key);
    });

    document.querySelectorAll('[data-translate-key-aria]').forEach(element => {
        const key = element.getAttribute('data-translate-key-aria')!;
        element.setAttribute('aria-label', t(key));
    });
    
    document.querySelectorAll('[data-translate-key-tooltip]').forEach(element => {
        const key = element.getAttribute('data-translate-key-tooltip')!;
        (element as HTMLElement).dataset.tooltip = t(key);
    });
    
    // Special handling for buttons with icons
    const toggleDrawModeBtn = document.getElementById('toggle-draw-mode');
    if (toggleDrawModeBtn) {
       const textSpan = toggleDrawModeBtn.querySelector('span');
       if (textSpan) {
           textSpan.textContent = isDrawingMode ? t('map.setWaypointsActive') : t('map.setWaypoints');
       }
    }
}

/**
 * Fetches the translation data from the JSON file.
 */
async function loadTranslations() {
    try {
        const response = await fetch('translations.json');
        if (!response.ok) throw new Error('Failed to load translations file.');
        translations = await response.json();
    } catch (error) {
        console.error("Could not load translations:", error);
    }
}

/**
 * Sets the application language and updates the UI.
 * @param lang The language code to set (e.g., 'de' or 'en').
 */
async function setLanguage(lang: string) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });

    await translateUI();

    // Re-render UI components that depend on the language
    if (threatsMap.size > 0) {
        renderThreatList();
    }
    if (document.querySelector('.product-recommendations-container')?.classList.contains('hidden') === false) {
        await updateProductRecommendations();
    }
}


// ===============================================
// CORE APPLICATION LOGIC
// ===============================================

/**
 * Initializes the OpenStreetMap map using Leaflet.
 */
function initOpenStreetMap(): void {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("Map container element not found.");
        return;
    }
    
    const mapCenter: [number, number] = [51.7189, 8.7575]; // Paderborn, Domplatz
    map = L.map(mapDiv, {
      zoomControl: false, // Disable default zoom control
      preferCanvas: true // Use canvas renderer for better performance with html2canvas
    }).setView(mapCenter, 16);

    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
}

/**
 * Clears the threat markers (red circles and lines) and the list from the map and UI.
 */
const clearThreatAnalysis = () => {
    threatMarkersMap.forEach(markers => {
        markers.forEach(marker => map.removeLayer(marker));
    });
    threatMarkersMap.clear();
    threatsMap.clear();
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (threatList) {
        threatList.innerHTML = '';
    }
    const productRecommendationsContainer = document.querySelector('.product-recommendations-container') as HTMLElement;
    if (productRecommendationsContainer) {
        productRecommendationsContainer.classList.add('hidden');
    }
};

/**
 * Finds the intersection point of two line segments.
 * @param p1 - Start of line 1
 * @param p2 - End of line 1
 * @param p3 - Start of line 2
 * @param p4 - End of line 2
 * @returns The intersection point {lat, lon} or null if they don't intersect.
 */
function getLineSegmentIntersection(
    p1: { lat: number; lon: number }, p2: { lat: number; lon: number },
    p3: { lat: number; lon: number }, p4: { lat: number; lon: number }
): { lat: number; lon: number } | null {
    // Using lat for y and lon for x
    const x1 = p1.lon, y1 = p1.lat;
    const x2 = p2.lon, y2 = p2.lat;
    const x3 = p3.lon, y3 = p3.lat;
    const x4 = p4.lon, y4 = p4.lat;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) {
        return null; // Parallel or collinear
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

    if (t > 0 && t < 1 && u > 0 && u < 1) { // Strict intersection (not on endpoints)
        return {
            lat: y1 + t * (y2 - y1),
            lon: x1 + t * (x2 - x1),
        };
    }
    return null;
}

/**
 * Checks if a point is inside a polygon using the ray-casting algorithm.
 * @param point - The point to check {lat, lon}.
 * @param polygon - An array of polygon vertices [{lat, lon}, ...].
 * @returns true if the point is inside, false otherwise.
 */
const isPointInPolygon = (point: { lat: number, lon: number }, polygon: { lat: number, lon: number }[]): boolean => {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lon, yi = polygon[i].lat;
        const xj = polygon[j].lon, yj = polygon[j].lat;
        const intersect = ((yi > point.lat) !== (yj > point.lat))
            && (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
};

/**
 * Calculates the distance between two points in meters using the Haversine formula.
 * @param p1 - Point 1 {lat, lon}
 * @param p2 - Point 2 {lat, lon}
 * @returns The distance in meters.
 */
function getHaversineDistance(p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number {
    const R = 6371e3; // Radius of Earth in meters
    const phi1 = p1.lat * Math.PI / 180;
    const phi2 = p2.lat * Math.PI / 180;
    const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
    const deltaLambda = (p2.lon - p1.lon) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
}

/**
 * Calculates the angle at point p2 formed by the line segment p1-p2-p3.
 * @param p1 - First point {lat, lon}
 * @param p2 - The vertex {lat, lon}
 * @param p3 - Third point {lat, lon}
 * @returns The angle in degrees (0-180). A straight line is 180.
 */
function getAngle(p1: { lat: number, lon: number }, p2: { lat: number, lon: number }, p3: { lat: number, lon: number }): number {
    const v1 = { x: p1.lon - p2.lon, y: p1.lat - p2.lat };
    const v2 = { x: p3.lon - p2.lon, y: p3.lat - p2.lat };

    const dotProduct = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    if (mag1 === 0 || mag2 === 0) return 180; // Treat as a straight line if points are identical

    const cosTheta = dotProduct / (mag1 * mag2);
    const clampedCosTheta = Math.max(-1, Math.min(1, cosTheta)); // Clamp for float precision errors
    const angleRad = Math.acos(clampedCosTheta);
    
    return angleRad * (180 / Math.PI);
}

/**
 * Returns the theoretical min/max acceleration range for a given vehicle weight.
 * @param vehicleWeight - The selected vehicle weight from the dropdown.
 * @returns A tuple [minAcceleration, maxAcceleration] in m/s² or null.
 */
function getAccelerationRange(vehicleWeight: string): [number, number] | null {
    switch (vehicleWeight) {
        case '500': return [4.0, 6.0];    // Motorrad
        case '3500': return [3.0, 4.0];   // KFZ < 3.5t
        case '7500': return [1.5, 2.5];   // LKW < 7.5t
        case '12000': return [1.0, 1.5];  // LKW < 12t
        case '40000': return [0.5, 1.0];  // LKW < 40t
        default: return null;
    }
}

/**
 * Calculates the final velocity based on acceleration and distance, assuming starting from rest.
 * Uses the formula v = sqrt(2 * a * s).
 * @param acceleration - The vehicle's acceleration in m/s².
 * @param distance - The distance in meters.
 * @returns The final velocity in km/h.
 */
function calculateVelocity(acceleration: number, distance: number): number {
    if (distance <= 0) return 0;
    // v = sqrt(2 * a * s)
    const velocityInMs = Math.sqrt(2 * acceleration * distance);
    // Convert m/s to km/h (1 m/s = 3.6 km/h)
    return velocityInMs * 3.6;
}

/**
 * Renders the list of identified threats into the UI based on the current state of threatsMap.
 */
function renderThreatList() {
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (!threatList) return;
    
    threatList.innerHTML = '';

    if (threatsMap.size === 0) {
        return; // Nothing to render
    }

    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    const selectedWeight = vehicleSelect.value;
    const accelerationRange = getAccelerationRange(selectedWeight);

    threatsMap.forEach((data, name) => {
        if (data.entryPoints.length === 0) return;

        const li = document.createElement('li');
        const lengthInMeters = Math.round(data.totalLength);
        
        let speedText = '';
        if (accelerationRange && lengthInMeters > 0) {
            const [minAcc, maxAcc] = accelerationRange;
            const minSpeed = Math.round(calculateVelocity(minAcc, lengthInMeters));
            const maxSpeed = Math.round(calculateVelocity(maxAcc, lengthInMeters));
            speedText = ` | ${t('threats.speed')}: ${minSpeed}-${maxSpeed} km/h`;
        }

        li.textContent = `${name} (${lengthInMeters} m)${speedText}`;
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');

        li.addEventListener('click', () => {
            threatList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
            li.classList.add('active');
            
            const markersToZoom = threatMarkersMap.get(name);
            if (markersToZoom && markersToZoom.length > 0) {
                const featureGroup = L.featureGroup(markersToZoom);
                map.fitBounds(featureGroup.getBounds().pad(0.5));
            }
        });
         li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                li.click();
            }
        });

        threatList.appendChild(li);
    });

    if (threatList.children.length === 0) {
        const li = document.createElement('li');
        li.textContent = t('threats.noCrossingWaysBoundary');
        threatList.appendChild(li);
    }
}


/**
 * Analyzes the drawn polygon to identify intersecting ways (roads, paths, etc.) using the Overpass API.
 * It marks the entry points and highlights the approach path to the polygon.
 */
const analyzeAndMarkThreats = async () => {
    if (!drawnPolygon) {
        alert(t('alerts.noPolygon'));
        return;
    }

    const loadingIndicator = document.querySelector('.loading-indicator') as HTMLElement;
    if (!loadingIndicator) return;
    
    clearThreatAnalysis();
    loadingIndicator.classList.remove('hidden');

    try {
        const bounds = drawnPolygon.getBounds();
        const buffer = 0.002; 
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const bbox = `${southWest.lat - buffer},${southWest.lng - buffer},${northEast.lat + buffer},${northEast.lng + buffer}`;
        
        const query = `
            [out:json][timeout:25];
            (
              way["highway"](bbox:${bbox});
              way["railway"="tram"](bbox:${bbox});
            );
            (._;>;);
            out;
        `;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(t('alerts.overpassError', { status: response.status }));
        }
        const data = await response.json();

        const nodes: { [id: number]: { lat: number, lon: number } } = {};
        const ways: { [id: number]: { name: string, nodes: number[], id: number } } = {};

        data.elements.forEach((el: any) => {
            if (el.type === 'node') {
                nodes[el.id] = { lat: el.lat, lon: el.lon };
            } else if (el.type === 'way' && el.tags && (el.tags.highway || el.tags.railway)) {
                if (el.tags.name) {
                    ways[el.id] = { name: el.tags.name, nodes: el.nodes, id: el.id };
                }
            }
        });

        const threats = new Map<string, { entryPoints: {lat: number, lon: number}[], pathSegments: {lat: number, lon: number}[][], totalLength: number }>();
        const polygonVertices = drawnPolygon.getLatLngs()[0].map((p: any) => ({ lat: p.lat, lon: p.lng }));

        for (const wayId in ways) {
            const way = ways[wayId];
            const wayNodes = way.nodes.map(id => ({ id, ...nodes[id] })).filter(n => n.lat && n.lon);
            if (wayNodes.length < 2) continue;

            const wayThreatSegments: { lat: number, lon: number }[][] = [];
            const wayEntryPoints: { lat: number, lon: number }[] = [];

            for (let i = 0; i < wayNodes.length - 1; i++) {
                const prevNode = wayNodes[i];
                const currNode = wayNodes[i + 1];
                const isPrevIn = isPointInPolygon(prevNode, polygonVertices);
                const isCurrIn = isPointInPolygon(currNode, polygonVertices);

                if (isPrevIn !== isCurrIn) {
                    let intersectionPoint: { lat: number; lon: number } | null = null;
                    for (let j = 0; j < polygonVertices.length; j++) {
                        const polyP1 = polygonVertices[j];
                        const polyP2 = polygonVertices[(j + 1) % polygonVertices.length];
                        const intersection = getLineSegmentIntersection(prevNode, currNode, polyP1, polyP2);
                        if (intersection) {
                            intersectionPoint = intersection;
                            break;
                        }
                    }
                    
                    if (intersectionPoint) {
                        wayEntryPoints.push(intersectionPoint);
                        const pathSegment: { lat: number, lon: number }[] = [intersectionPoint];
                        let traceStartIndex: number;
                        let traceDirection: number;

                        if (isCurrIn) {
                            pathSegment.push({ lat: prevNode.lat, lon: prevNode.lon });
                            traceStartIndex = i - 1;
                            traceDirection = -1;
                        } else {
                            pathSegment.push({ lat: currNode.lat, lon: currNode.lon });
                            traceStartIndex = i + 1;
                            traceDirection = 1;
                        }
                        
                        for (let k = traceStartIndex; k >= 0 && k < wayNodes.length; k += traceDirection) {
                            const traceNode = wayNodes[k];
                            if (pathSegment.length >= 2) {
                                const p1 = pathSegment[pathSegment.length - 2];
                                const p2 = pathSegment[pathSegment.length - 1];
                                const p3 = { lat: traceNode.lat, lon: traceNode.lon };
                                const angle = getAngle(p1, p2, p3);
                                if (angle < 150) break; 
                            }
                            pathSegment.push({ lat: traceNode.lat, lon: traceNode.lon });
                        }
                        wayThreatSegments.push(pathSegment);
                    }
                }
            }
            
            if (wayEntryPoints.length > 0) {
                if (!threats.has(way.name)) {
                    threats.set(way.name, { entryPoints: [], pathSegments: [], totalLength: 0 });
                }
                const threatData = threats.get(way.name)!;
                threatData.entryPoints.push(...wayEntryPoints);
                threatData.pathSegments.push(...wayThreatSegments);

                let segmentsLength = 0;
                wayThreatSegments.forEach(segment => {
                    for (let i = 0; i < segment.length - 1; i++) {
                        segmentsLength += getHaversineDistance(segment[i], segment[i + 1]);
                    }
                });
                threatData.totalLength += segmentsLength;
            }
        }
        
        threatsMap = threats;
        
        if (threatsMap.size > 0) {
             threatsMap.forEach((data, name) => {
                if (data.entryPoints.length === 0) return;
                const currentStreetMarkers: any[] = [];
                data.entryPoints.forEach(point => {
                    const threatCircle = L.circle([point.lat, point.lon], {
                        radius: 5, color: 'red', fillColor: '#f03', fillOpacity: 1, weight: 2
                    }).addTo(map).bindPopup(`<b>${t('threats.popupHeader')}</b><br>${name}`);
                    currentStreetMarkers.push(threatCircle);
                });
                data.pathSegments.forEach(segment => {
                    if (segment.length > 1) {
                        const latLngsSegment = segment.map(p => [p.lat, p.lon]);
                        const threatPath = L.polyline(latLngsSegment, { color: 'red', weight: 4, opacity: 0.8 }).addTo(map);
                        currentStreetMarkers.push(threatPath);
                    }
                });
                if (currentStreetMarkers.length > 0) {
                    threatMarkersMap.set(name, currentStreetMarkers);
                }
            });
            renderThreatList(); // Render the list from the new data
            
            const productRecommendationsContainer = document.querySelector('.product-recommendations-container') as HTMLElement;
            if (productRecommendationsContainer) {
                productRecommendationsContainer.classList.remove('hidden');
                await updateProductRecommendations();
            }
        } else {
            const threatList = document.querySelector('.threat-list') as HTMLOListElement;
            const li = document.createElement('li');
            li.textContent = t('threats.noCrossingWaysArea');
            threatList.appendChild(li);
        }

    } catch (error) {
        console.error("Fehler bei der Gefahrenanalyse:", error);
        alert(t('alerts.analysisError'));
        const threatList = document.querySelector('.threat-list') as HTMLOListElement;
        const li = document.createElement('li');
        li.textContent = t('threats.analysisFailed');
        threatList.appendChild(li);
    } finally {
        loadingIndicator.classList.add('hidden');
    }
};

/**
 * Generates structured content for the risk report using the Gemini API.
 * @param context - All necessary data for the AI prompt.
 * @returns A structured object with content for each report section.
 */
async function getAIReportSections(context: any): Promise<any> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = t('ai.reportPrompt', {
            locationName: context.locationName,
            assetToProtect: context.assetToProtect,
            securityLevel: context.securityLevel,
            protectionGrade: context.protectionGrade,
            threatList: context.threatList,
            protectionPeriod: context.protectionPeriod,
            productType: context.productType,
            penetration: context.penetration,
            debrisDistance: context.debrisDistance,
            language: currentLanguage === 'de' ? 'German' : 'English'
        });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        purpose: { type: Type.STRING },
                        threatAnalysis: { type: Type.STRING },
                        vulnerabilities: { type: Type.STRING },
                        hvmMeasures: { type: Type.STRING },
                        siteConsiderations: { type: Type.STRING },
                        operationalImpact: { type: Type.STRING }
                    },
                    required: ["purpose", "threatAnalysis", "vulnerabilities", "hvmMeasures", "siteConsiderations", "operationalImpact"]
                }
            }
        });
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error("Fehler bei der Gemini-API-Anfrage für den Bericht:", error);
        alert(t('alerts.geminiError'));
        return null;
    }
}

/**
 * Gets a human-readable name for a geographic coordinate using reverse geocoding.
 * @param center - The lat/lng coordinates.
 * @returns A string representing the location name.
 */
async function getReportLocationName(center: any): Promise<string> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${center.lat}&lon=${center.lng}&zoom=18&addressdetails=1`;
    try {
        const response = await fetch(url, { headers: { 'Accept-Language': currentLanguage } });
        if (!response.ok) return "Unknown Location";
        const data = await response.json();
        return data.display_name || "Unknown Location";
    } catch (error) {
        console.error("Fehler beim Reverse Geocoding:", error);
        return "Could not determine location";
    }
}

/**
 * Updates the product recommendation section based on vehicle selection.
 */
async function updateProductRecommendations() {
    if (productDatabase.length === 0) {
        try {
            const response = await fetch('product-database.json');
            if (!response.ok) throw new Error('Product database fetch failed');
            productDatabase = await response.json();
        } catch (error) {
            console.error(t('alerts.productDbError'), error);
            const pollerRecommendationEl = document.querySelector('#poller-category-header small');
            const barrierRecommendationEl = document.querySelector('#barrier-category-header small');
            if (pollerRecommendationEl) pollerRecommendationEl.textContent = t('products.dbError');
            if (barrierRecommendationEl) barrierRecommendationEl.textContent = t('products.dbError');
            return;
        }
    }
    
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    const selectedWeight = vehicleSelect.value;
    
    const pollerRecommendationEl = document.querySelector('#poller-category-header small');
    const barrierRecommendationEl = document.querySelector('#barrier-category-header small');
    
    if (pollerRecommendationEl) pollerRecommendationEl.textContent = t('products.resistanceHigh');
    if (barrierRecommendationEl) barrierRecommendationEl.textContent = t('products.resistanceMedium');

    if (selectedWeight === 'alle') return;
    
    const pollerKeywords = ['bollard', 'poller'];
    const barrierKeywords = ['barrier', 'barriere', 'gate'];

    const recommendedPoller = productDatabase.find(p => 
        p.vehicleWeight === selectedWeight && p.type && pollerKeywords.some(kw => p.type.toLowerCase().includes(kw))
    );
    const recommendedBarrier = productDatabase.find(p => 
        p.vehicleWeight === selectedWeight && p.type && barrierKeywords.some(kw => p.type.toLowerCase().includes(kw))
    );

    if (pollerRecommendationEl) {
        pollerRecommendationEl.textContent = recommendedPoller 
            ? `${t('products.recommendation')} ${recommendedPoller.type}` 
            : t('products.noRecommendation');
    }
    if (barrierRecommendationEl) {
        barrierRecommendationEl.textContent = recommendedBarrier
            ? `${t('products.recommendation')} ${recommendedBarrier.type}`
            : t('products.noRecommendation');
    }
}

function getSecurityLevelText(value: number): string {
    if (value < 33) return t('sidebar.low');
    if (value < 66) return t('products.resistanceMedium');
    return t('sidebar.high');
}

function findBestProductMatch() {
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    const selectedWeight = parseInt(vehicleSelect.value, 10);
    if (isNaN(selectedWeight)) return null;

    let bestMatch = null;
    let minPenetration = Infinity;

    for (const product of productDatabase) {
        const productWeight = parseInt(product.vehicleWeight, 10);
        const penetration = parseFloat(product.penetration);

        if (!isNaN(productWeight) && !isNaN(penetration) && productWeight >= selectedWeight) {
            if (penetration < minPenetration) {
                minPenetration = penetration;
                bestMatch = product;
            }
        }
    }
    return bestMatch;
}

/**
 * Generates the full risk report as a PDF, filling in missing information with AI-generated placeholders.
 */
async function generateRiskReport() {
    const reportIframe = document.getElementById('report-iframe') as HTMLIFrameElement;
    const loadingOverlay = document.querySelector('.report-loading-overlay') as HTMLElement;
    const downloadReportBtn = document.getElementById('download-report-btn') as HTMLButtonElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const reportPreviewArea = document.getElementById('report-preview-area') as HTMLElement;
    
    loadingOverlay.classList.remove('view-hidden');
    downloadReportBtn.disabled = true;

    let canvas = null;

    try {
        if (drawnPolygon) {
            // Temporarily switch views to make the map visible for capture
            reportPreviewArea.classList.add('view-hidden');
            mapDiv.classList.remove('view-hidden');

            // Wait for the map to be fully rendered before taking the screenshot
            await new Promise<void>(resolve => {
                map.invalidateSize(); // Crucial for Leaflet to recognize new container size/visibility

                const resolveFn = () => requestAnimationFrame(() => setTimeout(resolve, 250));
                
                let moveEndTimeoutId: number;

                // The 'load' event on the tile layer is the best signal that map images are ready.
                tileLayer.once('load', () => {
                    clearTimeout(moveEndTimeoutId);
                    resolveFn();
                });

                // 'moveend' is a fallback. If tiles are cached, 'load' may not fire.
                map.once('moveend', () => {
                    moveEndTimeoutId = window.setTimeout(resolveFn, 500);
                });
                
                // Trigger the process
                map.fitBounds(drawnPolygon.getBounds(), { animate: false });
            });
            
            // Now that the map is ready and visible, capture it.
            canvas = await html2canvas(mapDiv, {
                useCORS: true,
                logging: false,
                onclone: (doc) => {
                    // Ensure popups are not visible in the screenshot
                    doc.querySelectorAll('.leaflet-popup-pane > *').forEach(p => (p as HTMLElement).style.display = 'none');
                }
            });
        }

        const locationName = drawnPolygon ? await getReportLocationName(drawnPolygon.getBounds().getCenter()) : t('report.undefinedLocation');
        
        const assetInput = document.getElementById('asset-to-protect') as HTMLInputElement;
        const assetToProtect = assetInput.value.trim() || t('report.undefinedAsset');
        
        const threatList = threatsMap.size > 0 ? Array.from(threatsMap.keys()).join(', ') : t('report.noThreatAnalysis');

        // --- Gather all context for the AI ---
        const securityRiskSlider = document.getElementById('security-risk-slider') as HTMLInputElement;
        const productClassSlider = document.getElementById('product-class-slider') as HTMLInputElement;
        const protectionPeriodSelect = document.getElementById('protection-period-select') as HTMLSelectElement;
        const protectionProductSelect = document.getElementById('protection-product-select') as HTMLSelectElement;
        const bestProduct = findBestProductMatch();

        const context = {
            locationName: locationName,
            assetToProtect: assetToProtect,
            securityLevel: getSecurityLevelText(parseInt(securityRiskSlider.value)),
            protectionGrade: getSecurityLevelText(parseInt(productClassSlider.value)),
            threatList: threatList,
            protectionPeriod: protectionPeriodSelect.options[protectionPeriodSelect.selectedIndex].text,
            productType: protectionProductSelect.options[protectionProductSelect.selectedIndex].text,
            penetration: bestProduct ? bestProduct.penetration : t('report.undefinedValue'),
            debrisDistance: bestProduct ? (bestProduct.debrisDistance || t('report.undefinedValue')) : t('report.undefinedValue'),
        };
        
        const aiSections = await getAIReportSections(context);
        if (!aiSections) {
             throw new Error("AI did not return report sections.");
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const addWatermarkToCurrentPage = () => {
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            pdf.saveGraphicsState();
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(120);
            pdf.setTextColor(200, 200, 200);
            if (jsPDF.GState) {
                 const gState = new jsPDF.GState({ opacity: 0.2 });
                 pdf.setGState(gState);
            }
            pdf.text(t('report.watermark'), (pageWidth / 2) + 50, (pageHeight / 2) + 50, { align: 'center', angle: 45 });
            pdf.restoreGraphicsState();
        };

        const page_margin = 20;
        const page_width = pdf.internal.pageSize.getWidth();
        const content_width = page_width - (page_margin * 2);
        let currentY = 25;

        const addSection = (titleKey: string, content: string) => {
            if (currentY > 250) { // Check for page break before adding section
                pdf.addPage();
                addWatermarkToCurrentPage();
                currentY = 25;
            }
            pdf.setFont('helvetica', 'bold').setFontSize(14).text(t(titleKey), page_margin, currentY);
            currentY += 7;
            const textLines = pdf.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(content, content_width);
            if (currentY + (textLines.length * 5) > 280) { // Check for page break before adding content
                pdf.addPage();
                addWatermarkToCurrentPage();
                currentY = 25;
            }
            pdf.text(textLines, page_margin, currentY);
            currentY += (textLines.length * 5) + 10;
        };

        addWatermarkToCurrentPage();
        
        // Report Header
        pdf.setFont('helvetica', 'bold').setFontSize(18).text(t('report.mainTitle', { locationName: locationName }), page_margin, currentY);
        currentY += 5;
        pdf.setDrawColor(30, 144, 255).setLineWidth(0.5).line(page_margin, currentY, page_width - page_margin, currentY);
        currentY += 15;

        // --- Sections from AI ---
        addSection('report.sections.purpose.title', aiSections.purpose);
        
        // Section 2: Threat Analysis + List
        addSection('report.sections.threatAnalysis.title', aiSections.threatAnalysis);
        if (threatsMap.size > 0) {
            currentY -= 5; // Reduce space before list
            pdf.setFont('helvetica', 'normal').setFontSize(11);
            const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
            const selectedWeight = vehicleSelect.value;
            const accelerationRange = getAccelerationRange(selectedWeight);
            threatsMap.forEach((data, name) => {
                let reportLine = `• ${name} (${Math.round(data.totalLength)} m)`;
                if (accelerationRange && data.totalLength > 0) {
                    const [minAcc, maxAcc] = accelerationRange;
                    const minSpeed = Math.round(calculateVelocity(minAcc, data.totalLength));
                    const maxSpeed = Math.round(calculateVelocity(maxAcc, data.totalLength));
                    reportLine += ` | ${t('threats.speed')}: ${minSpeed}-${maxSpeed} km/h`;
                }
                const splitLines = pdf.splitTextToSize(reportLine, content_width - 5);
                if (currentY + (splitLines.length * 7) > 280) {
                    pdf.addPage(); addWatermarkToCurrentPage(); currentY = 25;
                }
                pdf.text(splitLines, page_margin + 5, currentY);
                currentY += (splitLines.length * 6);
            });
            currentY += 10;
        }

        addSection('report.sections.vulnerabilities.title', aiSections.vulnerabilities);
        addSection('report.sections.hvmMeasures.title', aiSections.hvmMeasures);
        
        // Section 5: Site Considerations + Map Image
        addSection('report.sections.siteConsiderations.title', aiSections.siteConsiderations);
        if (canvas) {
            const imgRatio = canvas.height / canvas.width;
            const imgHeight = content_width * imgRatio;
            if (currentY + imgHeight > 280) {
                pdf.addPage(); addWatermarkToCurrentPage(); currentY = 25;
            }
            pdf.addImage(canvas, 'PNG', page_margin, currentY, content_width, imgHeight);
            currentY += imgHeight + 10;
        } else {
             const placeholderText = t('report.noMapAvailable');
             const textLines = pdf.setFont('helvetica', 'italic').setFontSize(10).splitTextToSize(placeholderText, content_width);
             if (currentY + (textLines.length * 5) > 280) { // Check for page break
                 pdf.addPage();
                 addWatermarkToCurrentPage();
                 currentY = 25;
             }
             pdf.text(textLines, page_margin, currentY);
             currentY += (textLines.length * 5) + 10;
        }


        addSection('report.sections.operationalImpact.title', aiSections.operationalImpact);
        
        // Switch back to report view before loading the PDF
        mapDiv.classList.add('view-hidden');
        reportPreviewArea.classList.remove('view-hidden');
        
        reportIframe.src = pdf.output('datauristring');
        generatedPdf = pdf;
        downloadReportBtn.disabled = false;
        
    } catch (error) {
        console.error("Fehler bei der Erstellung des Berichts:", error);
        alert(t('alerts.reportCreationError'));
         // Ensure we switch back to the report view on error
        mapDiv.classList.add('view-hidden');
        reportPreviewArea.classList.remove('view-hidden');
    } finally {
        loadingOverlay.classList.add('view-hidden');
    }
}

/**
 * Triggers the download of the generated PDF report.
 */
function downloadRiskReport() {
    if (generatedPdf) {
        generatedPdf.save(t('report.reportFilename'));
    } else {
        alert(t('alerts.noReportToDownload'));
    }
}

// ===============================================
// EVENT LISTENERS & INITIALIZATION
// ===============================================
document.addEventListener('DOMContentLoaded', async () => {
    initOpenStreetMap();
    await loadTranslations();

    const savedLang = localStorage.getItem('language') || 'de';
    await setLanguage(savedLang);

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const lang = (event.currentTarget as HTMLElement).dataset.lang;
            if (lang && lang !== currentLanguage) {
                setLanguage(lang);
            }
        });
    });
    
    const tooltip = document.getElementById('tooltip') as HTMLElement;
    const infoIcons = document.querySelectorAll('.info-icon');
    infoIcons.forEach(icon => {
        icon.addEventListener('mouseover', (event) => {
            const target = event.currentTarget as HTMLElement;
            const tooltipText = target.dataset.tooltip || '';
            tooltip.textContent = tooltipText;
            tooltip.style.opacity = '1';
            const rect = target.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
        });
        icon.addEventListener('mouseout', () => {
            tooltip.style.opacity = '0';
        });
    });
    
    const searchInput = document.getElementById('map-search-input') as HTMLInputElement;
    const searchButton = document.getElementById('map-search-button') as HTMLButtonElement;
    
    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
        try {
            const response = await fetch(url, { headers: { 'Accept-Language': currentLanguage } });
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                map.setView([lat, lon], 15);
                if (searchMarker) map.removeLayer(searchMarker);
                searchMarker = L.marker([lat, lon]).addTo(map).bindPopup(`<b>${display_name}</b>`).openPopup();
            } else {
                alert(t('alerts.locationNotFound'));
            }
        } catch (error) {
            console.error('Fehler bei der Kartensuche:', error);
            alert(t('alerts.searchError'));
        }
    };
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') handleSearch(); });
    
    const toggleDrawModeBtn = document.getElementById('toggle-draw-mode') as HTMLButtonElement;
    const resetDrawingBtn = document.getElementById('reset-drawing') as HTMLButtonElement;
    const mapContainer = document.getElementById('map');

    const setDrawingMode = (enabled: boolean) => {
        isDrawingMode = enabled;
        const textSpan = toggleDrawModeBtn.querySelector('span');
        if (enabled) {
            toggleDrawModeBtn.classList.add('active');
            if (textSpan) textSpan.textContent = t('map.setWaypointsActive');
            mapContainer?.classList.add('drawing-mode');
        } else {
            toggleDrawModeBtn.classList.remove('active');
            if (textSpan) textSpan.textContent = t('map.setWaypoints');
            mapContainer?.classList.remove('drawing-mode');
        }
    };

    const resetDrawing = () => {
        waypointMarkers.forEach(marker => map.removeLayer(marker));
        waypointMarkers = [];
        if (pathLine) map.removeLayer(pathLine);
        pathLine = null;
        if (drawnPolygon) map.removeLayer(drawnPolygon);
        drawnPolygon = null;
        if (polygonLabel) map.removeLayer(polygonLabel);
        polygonLabel = null;
        waypoints = [];
        if (isDrawingMode) setDrawingMode(false);
    };
    
    const updatePathLine = () => {
        if (pathLine) map.removeLayer(pathLine);
        if (waypoints.length > 1) pathLine = L.polyline(waypoints, { color: 'var(--accent-color)', weight: 3 }).addTo(map);
    };

    const closePolygon = () => {
        if (waypoints.length < 3) return;
        if (drawnPolygon) map.removeLayer(drawnPolygon);
        drawnPolygon = L.polygon(waypoints, { color: 'yellow', fillColor: '#FFFF00', fillOpacity: 0.3, weight: 2 }).addTo(map);
        const polygonCenter = drawnPolygon.getBounds().getCenter();
        polygonLabel = L.marker(polygonCenter, { icon: L.divIcon({ className: 'polygon-label', html: t('map.securityAreaLabel'), iconSize: [150, 24] }) }).addTo(map);
        if (pathLine) map.removeLayer(pathLine);
        pathLine = null;
        waypointMarkers.forEach(marker => map.removeLayer(marker));
        waypointMarkers = [];
        waypoints = [];
        setDrawingMode(false);
    };

    const onMapClick = (e: any) => {
        if (!isDrawingMode) return;
        const newWaypoint = e.latlng;
        const marker = L.marker(newWaypoint).addTo(map);
        if (waypoints.length === 0) {
            marker.on('click', () => { if (isDrawingMode && waypoints.length >= 3) closePolygon(); });
        }
        waypoints.push(newWaypoint);
        waypointMarkers.push(marker);
        updatePathLine();
    };

    map.on('click', onMapClick);

    const navLinks = document.querySelectorAll('.main-nav a');
    const analyzeThreatsBtn = document.getElementById('analyze-threats') as HTMLButtonElement;
    const createReportBtn = document.getElementById('create-report-btn') as HTMLButtonElement;
    const downloadReportBtn = document.getElementById('download-report-btn') as HTMLButtonElement;
    const reportIframe = document.getElementById('report-iframe') as HTMLIFrameElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const reportPreviewArea = document.getElementById('report-preview-area') as HTMLElement;
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;

    navLinks.forEach(link => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const clickedLink = event.currentTarget as HTMLAnchorElement;
            const newTabId = clickedLink.id;

            navLinks.forEach(l => l.classList.remove('active'));
            clickedLink.classList.add('active');

            if (newTabId === 'nav-param-input') {
                resetDrawing();
                clearThreatAnalysis();
                generatedPdf = null;
            }
            if (newTabId === 'nav-marking-area') {
                clearThreatAnalysis();
                generatedPdf = null;
            }
            if (newTabId === 'nav-threat-analysis') {
                generatedPdf = null;
            }
             if (newTabId === 'nav-product-selection') {
                await updateProductRecommendations();
            }
            
            toggleDrawModeBtn.classList.add('hidden');
            resetDrawingBtn.classList.add('hidden');
            analyzeThreatsBtn.classList.add('hidden');
            createReportBtn.classList.add('hidden');
            downloadReportBtn.classList.add('hidden');
            
            const isReportView = newTabId === 'nav-risk-report';
            mapDiv.classList.toggle('view-hidden', isReportView);
            reportPreviewArea.classList.toggle('view-hidden', !isReportView);
            
            if (map) {
                // Invalidate size only if the map is becoming visible
                if (!isReportView) {
                    map.invalidateSize();
                }
            }

            if (!generatedPdf) {
                reportIframe.src = 'about:blank';
                downloadReportBtn.disabled = true;
            }

            if (newTabId === 'nav-marking-area') {
                toggleDrawModeBtn.classList.remove('hidden');
                resetDrawingBtn.classList.remove('hidden');
            } else if (newTabId === 'nav-threat-analysis') {
                analyzeThreatsBtn.classList.remove('hidden');
            } else if (newTabId === 'nav-risk-report') {
                createReportBtn.classList.remove('hidden');
                downloadReportBtn.classList.remove('hidden');
                downloadReportBtn.disabled = !generatedPdf;
            }
        });
    });

    vehicleSelect.addEventListener('change', async () => {
        if (threatsMap.size > 0) {
             await analyzeAndMarkThreats();
        }
        if (document.querySelector('.product-recommendations-container')?.classList.contains('hidden') === false) {
             await updateProductRecommendations();
        }
    });

    toggleDrawModeBtn.addEventListener('click', () => {
        if (drawnPolygon) resetDrawing();
        setDrawingMode(!isDrawingMode);
    });

    resetDrawingBtn.addEventListener('click', () => {
        resetDrawing();
        clearThreatAnalysis();
    });
    
    analyzeThreatsBtn.addEventListener('click', analyzeAndMarkThreats);
    createReportBtn.addEventListener('click', generateRiskReport);
    downloadReportBtn.addEventListener('click', downloadRiskReport);

    // Set initial state
    document.getElementById('nav-param-input')?.click();
});