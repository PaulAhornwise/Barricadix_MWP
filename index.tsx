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

import { GoogleGenAI } from "@google/genai";

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

let map: any; // Module-scoped map object to be accessible by multiple functions
let searchMarker: any = null; // To keep track of the current search marker

// State for drawing functionality
let isDrawingMode = false;
let waypoints: any[] = [];
let waypointMarkers: any[] = [];
let pathLine: any = null;
let drawnPolygon: any = null;
let polygonLabel: any = null; // To store the label for the polygon
let threatMarkersMap = new Map<string, any[]>(); // Maps street name to an array of its marker layers
let threatsMap = new Map<string, { entryPoints: any[], pathSegments: any[][], totalLength: number }>(); // To store analysis data for report
let generatedPdf: any = null; // To hold the generated PDF object

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
      zoomControl: false // Disable default zoom control
    }).setView(mapCenter, 16);

    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
 * Analyzes the drawn polygon to identify intersecting ways (roads, paths, etc.) using the Overpass API.
 * It marks the entry points and highlights the approach path to the polygon. The path tracing ignores intersections
 * and only stops at sharp turns (>30 degrees).
 */
const analyzeAndMarkThreats = async () => {
    if (!drawnPolygon) {
        alert("Bitte markieren Sie zuerst einen Sicherheitsbereich unter dem Reiter 'Sicherheitsbereich markieren'.");
        return;
    }

    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    const loadingIndicator = document.querySelector('.loading-indicator') as HTMLElement;

    if (!threatList || !loadingIndicator) return;
    
    clearThreatAnalysis();
    loadingIndicator.classList.remove('hidden');

    try {
        const bounds = drawnPolygon.getBounds();
        // Buffer to query a larger area, ensuring we catch nearby intersections. ~200m buffer.
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
            throw new Error(`Overpass API request failed with status ${response.status}`);
        }
        const data = await response.json();

        // Pre-process data to find all nodes and ways
        const nodes: { [id: number]: { lat: number, lon: number } } = {};
        const ways: { [id: number]: { name: string, nodes: number[], id: number } } = {};

        data.elements.forEach((el: any) => {
            if (el.type === 'node') {
                nodes[el.id] = { lat: el.lat, lon: el.lon };
            } else if (el.type === 'way' && el.tags && (el.tags.highway || el.tags.railway)) {
                if (el.tags.name) { // Only consider named ways
                    ways[el.id] = { name: el.tags.name, nodes: el.nodes, id: el.id };
                }
            }
        });

        // Analyze ways for polygon intersection and trace approach paths
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

                if (isPrevIn !== isCurrIn) { // Segment crosses the boundary
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

                        if (isCurrIn) { // Way is entering, trace backwards from prevNode
                            pathSegment.push({ lat: prevNode.lat, lon: prevNode.lon });
                            traceStartIndex = i - 1;
                            traceDirection = -1;
                        } else { // Way is exiting, trace forwards from currNode
                            pathSegment.push({ lat: currNode.lat, lon: currNode.lon });
                            traceStartIndex = i + 1;
                            traceDirection = 1;
                        }
                        
                        for (let k = traceStartIndex; k >= 0 && k < wayNodes.length; k += traceDirection) {
                            const traceNode = wayNodes[k];
                            
                            // Check angle condition before adding the new node
                            if (pathSegment.length >= 2) {
                                const p1 = pathSegment[pathSegment.length - 2];
                                const p2 = pathSegment[pathSegment.length - 1];
                                const p3 = { lat: traceNode.lat, lon: traceNode.lon };
                                const angle = getAngle(p1, p2, p3);

                                // Turn angle is 180 - angle. Stop if turn > 30 degrees (i.e., angle < 150)
                                if (angle < 150) {
                                    break; 
                                }
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
             threatList.innerHTML = '';
             threatsMap.forEach((data, name) => {
                if (data.entryPoints.length === 0) return;

                const li = document.createElement('li');
                const lengthInMeters = Math.round(data.totalLength);
                li.textContent = `${name} (${lengthInMeters} m)`;
                li.setAttribute('role', 'button');
                li.setAttribute('tabindex', '0');
                
                const currentStreetMarkers: any[] = [];

                data.entryPoints.forEach(point => {
                    const threatCircle = L.circle([point.lat, point.lon], {
                        radius: 5,
                        color: 'red',
                        fillColor: '#f03',
                        fillOpacity: 1,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Zufahrt</b><br>${name}`);
                    currentStreetMarkers.push(threatCircle);
                });

                data.pathSegments.forEach(segment => {
                    if (segment.length > 1) {
                        const latLngsSegment = segment.map(p => [p.lat, p.lon]);
                        const threatPath = L.polyline(latLngsSegment, {
                            color: 'red',
                            weight: 4,
                            opacity: 0.8
                        }).addTo(map);
                        currentStreetMarkers.push(threatPath);
                    }
                });

                if (currentStreetMarkers.length > 0) {
                    threatMarkersMap.set(name, currentStreetMarkers);
                    
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
                }
            });
            
            if (threatList.children.length === 0) {
                const li = document.createElement('li');
                li.textContent = 'Keine querenden Wege an der Grenze gefunden.';
                threatList.appendChild(li);
            }
        } else {
            const li = document.createElement('li');
            li.textContent = 'Keine querenden Wege im markierten Bereich gefunden.';
            threatList.appendChild(li);
        }

    } catch (error) {
        console.error("Fehler bei der Gefahrenanalyse:", error);
        alert("Bei der Analyse ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.");
        const li = document.createElement('li');
        li.textContent = 'Analyse fehlgeschlagen.';
        threatList.appendChild(li);
    } finally {
        loadingIndicator.classList.add('hidden');
    }
};

/**
 * Generates an AI-powered risk assessment using the Gemini API.
 * @param locationName - The name of the location being analyzed.
 * @param threatList - A list of identified threat street names.
 * @returns A string containing the AI-generated analysis.
 */
async function getAIAnalysis(locationName: string, threatList: string[]): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Erstelle eine kurze, professionelle Lagebeurteilung für einen Risikobericht zum Thema "Schutz vor Überfahrttaten" für den folgenden Standort: ${locationName}. Berücksichtige dabei die folgenden identifizierten Zufahrtswege: ${threatList.join(', ')}. Der Text sollte die allgemeine Bedrohungslage kontextualisieren, auf die spezifischen Schwachstellen hinweisen und in einem sachlichen, klaren Ton verfasst sein. Formuliere den Text als Fließtext mit 2-3 Absätzen.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        return response.text;
    } catch (error) {
        console.error("Fehler bei der Gemini-API-Anfrage:", error);
        return "Die KI-gestützte Analyse konnte aufgrund eines Fehlers nicht generiert werden.";
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
        const response = await fetch(url, { headers: { 'Accept-Language': 'de,en' } });
        if (!response.ok) return "Unbekannter Standort";
        const data = await response.json();
        return data.display_name || "Unbekannter Standort";
    } catch (error) {
        console.error("Fehler beim Reverse Geocoding:", error);
        return "Standort konnte nicht ermittelt werden";
    }
}

/**
 * Generates the full risk report as a PDF.
 */
async function generateRiskReport() {
    if (!drawnPolygon || threatsMap.size === 0) {
        alert("Bitte führen Sie zuerst eine vollständige Gefahrenanalyse durch (Bereich markieren und Zufahrten analysieren).");
        return;
    }
    
    const reportIframe = document.getElementById('report-iframe') as HTMLIFrameElement;
    const loadingOverlay = document.querySelector('.report-loading-overlay') as HTMLElement;
    const downloadReportBtn = document.getElementById('download-report-btn') as HTMLButtonElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const reportPreviewArea = document.getElementById('report-preview-area') as HTMLElement;
    
    loadingOverlay.classList.remove('hidden');
    downloadReportBtn.disabled = true;

    reportPreviewArea.classList.add('hidden');
    mapDiv.classList.remove('hidden');

    await new Promise<void>(resolve => {
        map.invalidateSize(); 
        map.fitBounds(drawnPolygon.getBounds());
        map.once('moveend', () => {
            setTimeout(resolve, 400); 
        });
    });

    try {
        const locationName = await getReportLocationName(drawnPolygon.getBounds().getCenter());
        const threatList = Array.from(threatsMap.keys());
        const aiText = await getAIAnalysis(locationName, threatList);

        const canvas = await html2canvas(mapDiv, {
            useCORS: true,
            logging: false,
            onclone: (doc) => {
                const popups = doc.querySelectorAll('.leaflet-popup-pane > *');
                popups.forEach(p => (p as HTMLElement).style.display = 'none');
            }
        });
        const mapImageData = canvas.toDataURL('image/jpeg', 0.9);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const page_margin = 20;
        const page_width = pdf.internal.pageSize.getWidth();
        const content_width = page_width - (page_margin * 2);

        pdf.setFont('helvetica', 'bold').setFontSize(22).text('Risikobericht', page_margin, 25);
        pdf.setDrawColor(30, 144, 255).setLineWidth(0.5).line(page_margin, 28, page_width - page_margin, 28);
        
        pdf.setFont('helvetica', 'bold').setFontSize(14).text('Analysierter Bereich:', page_margin, 40);
        pdf.setFont('helvetica', 'normal').setFontSize(12).text(locationName, page_margin, 47, { maxWidth: content_width });

        let currentY = 65;
        pdf.setFont('helvetica', 'bold').setFontSize(14).text('Lagebeurteilung (KI-gestützt)', page_margin, currentY);
        currentY += 7;
        const aiTextLines = pdf.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(aiText, content_width);
        pdf.text(aiTextLines, page_margin, currentY);
        currentY += (aiTextLines.length * 5) + 10;

        pdf.setFont('helvetica', 'bold').setFontSize(14).text('Visuelle Analyse', page_margin, currentY);
        currentY += 7;
        const imgProps = pdf.getImageProperties(mapImageData);
        const imgHeight = (imgProps.height * content_width) / imgProps.width;
        if (currentY + imgHeight > 270) {
            pdf.addPage();
            currentY = 25;
        }
        pdf.addImage(mapImageData, 'JPEG', page_margin, currentY, content_width, imgHeight);
        currentY += imgHeight + 10;
        
        if (currentY > 250) {
            pdf.addPage();
            currentY = 25;
        }

        pdf.setFont('helvetica', 'bold').setFontSize(14).text('Identifizierte Eindringungsgefahren', page_margin, currentY);
        currentY += 10;
        pdf.setFont('helvetica', 'normal').setFontSize(11);
        threatList.forEach(threat => {
            if (currentY > 280) {
                pdf.addPage();
                currentY = 25;
            }
            pdf.text(`• ${threat}`, page_margin + 5, currentY);
            currentY += 7;
        });

        reportIframe.src = pdf.output('datauristring');
        generatedPdf = pdf;
        downloadReportBtn.disabled = false;
        
    } catch (error) {
        console.error("Fehler bei der Erstellung des Berichts:", error);
        alert("Der Bericht konnte nicht erstellt werden. Details finden Sie in der Konsole.");
    } finally {
        setTimeout(() => {
            mapDiv.classList.add('hidden');
            reportPreviewArea.classList.remove('hidden');
            loadingOverlay.classList.add('hidden');
        }, 0);
    }
}


/**
 * Triggers the download of the generated PDF report.
 */
function downloadRiskReport() {
    if (generatedPdf) {
        generatedPdf.save('Risikobericht-BarricadiX.pdf');
    } else {
        alert("Es wurde noch kein Bericht erstellt, der heruntergeladen werden könnte.");
    }
}

// Wait for the DOM to be fully loaded before setting up event listeners
document.addEventListener('DOMContentLoaded', () => {
    initOpenStreetMap();
    
    const allSelects = document.querySelectorAll('.sidebar select');
    allSelects.forEach(select => {
        select.addEventListener('change', (event) => {
            const target = event.target as HTMLSelectElement;
            console.log(`'${target.name}' changed to '${target.value}'. In a real app, this would trigger a data refetch and map/product update.`);
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
    
    const securitySlider = document.getElementById('security-risk-slider');
    securitySlider?.addEventListener('input', (e) => (e.target as HTMLInputElement).value);
    const productClassSlider = document.getElementById('product-class-slider');
    productClassSlider?.addEventListener('input', (e) => (e.target as HTMLInputElement).value);

    const searchInput = document.getElementById('map-search-input') as HTMLInputElement;
    const searchButton = document.getElementById('map-search-button') as HTMLButtonElement;
    
    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
        try {
            const response = await fetch(url, { headers: { 'Accept-Language': 'de,en' } });
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                map.setView([lat, lon], 15);
                if (searchMarker) map.removeLayer(searchMarker);
                searchMarker = L.marker([lat, lon]).addTo(map).bindPopup(`<b>${display_name}</b>`).openPopup();
            } else {
                alert('Standort nicht gefunden.');
            }
        } catch (error) {
            console.error('Fehler bei der Kartensuche:', error);
            alert('Bei der Suche ist ein Fehler aufgetreten.');
        }
    };
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') handleSearch(); });
    
    const toggleDrawModeBtn = document.getElementById('toggle-draw-mode') as HTMLButtonElement;
    const resetDrawingBtn = document.getElementById('reset-drawing') as HTMLButtonElement;
    const mapContainer = document.getElementById('map');

    const setDrawingMode = (enabled: boolean) => {
        isDrawingMode = enabled;
        if (enabled) {
            toggleDrawModeBtn.classList.add('active');
            toggleDrawModeBtn.innerHTML = `<i class="fas fa-check"></i> Zeichnen aktiv`;
            mapContainer?.classList.add('drawing-mode');
        } else {
            toggleDrawModeBtn.classList.remove('active');
            toggleDrawModeBtn.innerHTML = `<i class="fas fa-pencil-alt"></i> Wegpunkte setzen`;
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
        polygonLabel = L.marker(polygonCenter, { icon: L.divIcon({ className: 'polygon-label', html: 'Sicherheitsbereich', iconSize: [150, 24] }) }).addTo(map);
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

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
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
            
            toggleDrawModeBtn.classList.add('hidden');
            resetDrawingBtn.classList.add('hidden');
            analyzeThreatsBtn.classList.add('hidden');
            createReportBtn.classList.add('hidden');
            downloadReportBtn.classList.add('hidden');
            
            const isReportView = newTabId === 'nav-risk-report';
            mapDiv.classList.toggle('hidden', isReportView);
            reportPreviewArea.classList.toggle('hidden', !isReportView);
            if (isReportView && map) map.invalidateSize();

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