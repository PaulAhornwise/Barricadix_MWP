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

console.log('🔥🔥🔥 INDEX.TSX LOADED - VERSION: 2025-10-14-NRW-PROVIDER-DEBUG 🔥🔥🔥');

import { GoogleGenerativeAI } from "@google/generative-ai";
// React-basierte Chatbot-Komponente ist als separate Datei vorhanden.
// Import optional, Compiler kann ohne explizites React import arbeiten (no JSX here).
import { createElement } from "react";
import type {} from "react-dom";
import ZufahrtsschutzChatbot from "./ZufahrtsschutzChatbot";
import { createRoot } from "react-dom/client";
import "./src/styles/map3d-layout.css";
import { fetchOsmBundleForPolygon, osmCache, OsmBundle } from './src/utils/osm.js';
import { OsmSpeedLimiter, SpeedLimitConfig } from './src/utils/osmSpeedLimits.js';
import { WeatherCondition, parseMaxspeed } from './src/utils/osmParse.js';
// Entry Detection System Integration
import { integrateEntryDetectionWithExistingOSM, addEntryDetectionStyles } from './src/features/map/integration/entryDetectionIntegration.js';
// Geodata Provider Abstraction - NRW Integration
// Note: Functions will be imported dynamically to avoid build issues

// 3D Mode Integration (deck.gl)
import { enter3DDeck, exit3DDeck, threeDDeckState } from './src/features/map/threeDModeDeck';
import { ensureDeckMount } from './src/features/map/ui/ensureDeckMount';
import { jsPDF } from 'jspdf';
import { sanitizeDe } from './src/features/tender/createTenderPdf';
import type { EntryCandidate } from './src/shared/graph/types';

// Extend the Window interface to include jspdf, docx, and saveAs for TypeScript.
declare global {
    interface Window {
      jspdf: any;
      docx: any;
      saveAs: (blob: Blob, filename: string) => void;
    }
}

// Declare global variables from included libraries to satisfy TypeScript.
declare const L: any;
declare const html2canvas: any;

// ===============================================
// AUTHENTICATION SYSTEM
// ===============================================

const CORRECT_PASSWORD = '1919';
const AUTH_SESSION_KEY = 'barricadix_authenticated';

/**
 * Initialize authentication system
 */
function initAuth() {
    // Always show welcome screen first (for testing purposes)
    // Check if user is already authenticated
    // if (sessionStorage.getItem(AUTH_SESSION_KEY) === 'true') {
    //     showMainApp();
    //     return;
    // }
    
    // Show welcome screen and set up auth form
    showWelcomeScreen();
    setupAuthForm();
}

/**
 * Show the welcome screen
 */
function showWelcomeScreen() {
    const welcomeScreen = document.getElementById('welcome-screen');
    const appContainer = document.getElementById('app-container');
    
    if (welcomeScreen && appContainer) {
        welcomeScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    }
}

/**
 * Show the main application
 */
function showMainApp() {
    console.log('🎯 SHOW MAIN APP CALLED!');
    const welcomeScreen = document.getElementById('welcome-screen');
    const appContainer = document.getElementById('app-container');
    
    if (welcomeScreen && appContainer) {
        console.log('🎯 Hiding welcome screen, showing app container...');
        welcomeScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        
        // Initialize the main app only after authentication
        initializeApp();
        
        // Force map to recalculate size after showing main app
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
                console.log('Map size invalidated after showing main app');
            }
        }, 200);
        
        // Additional invalidation for safety
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
                console.log('Map size invalidated - final check');
            }
        }, 500);
    }
}

/**
 * Set up authentication form event handlers
 */
function setupAuthForm() {
    const authForm = document.getElementById('auth-form');
    const passwordInput = document.getElementById('password-input') as HTMLInputElement;
    const authError = document.getElementById('auth-error');
    const authButton = document.getElementById('auth-submit');
    
    if (!authForm || !passwordInput || !authError || !authButton) {
        console.error('Auth form elements not found');
        return;
    }
    
    // Handle form submission
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        attemptLogin(passwordInput.value);
    });
    
    // Handle Enter key in password field
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attemptLogin(passwordInput.value);
        }
    });
    
    // Clear error when user starts typing
    passwordInput.addEventListener('input', () => {
        hideAuthError();
    });
    
    // Focus password input
    passwordInput.focus();
}

/**
 * Attempt to log in with provided password
 */
function attemptLogin(password: string) {
    const authError = document.getElementById('auth-error');
    const authButton = document.getElementById('auth-submit');
    const passwordInput = document.getElementById('password-input') as HTMLInputElement;
    
    if (!authError || !authButton || !passwordInput) return;
    
    // Disable form during authentication
    authButton.style.opacity = '0.7';
    authButton.style.pointerEvents = 'none';
    passwordInput.disabled = true;
    
    // Simulate slight delay for better UX
    setTimeout(() => {
        if (password === CORRECT_PASSWORD) {
            // Successful authentication
            sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
            
            // Add success animation
            authButton.innerHTML = '<i class="fas fa-check"></i> Erfolgreich!';
            authButton.style.background = 'linear-gradient(45deg, #10b981, #059669)';
            
            setTimeout(() => {
                showMainApp();
            }, 800);
        } else {
            // Failed authentication
            showAuthError();
            
            // Re-enable form
            authButton.style.opacity = '1';
            authButton.style.pointerEvents = 'auto';
            passwordInput.disabled = false;
            passwordInput.value = '';
            passwordInput.focus();
            
            // Reset button text
            authButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Anmelden';
        }
    }, 500);
}

/**
 * Show authentication error
 */
function showAuthError() {
    const authError = document.getElementById('auth-error');
    if (authError) {
        authError.style.display = 'flex';
        setTimeout(() => {
            authError.style.display = 'none';
        }, 3000);
    }
}

/**
 * Hide authentication error
 */
function hideAuthError() {
    const authError = document.getElementById('auth-error');
    if (authError) {
        authError.style.display = 'none';
    }
}

/**
 * Logout function (can be called from anywhere in the app)
 */
function logout() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    showWelcomeScreen();
    setupAuthForm();
}

// Make logout available globally
(window as any).logout = logout;

// Make current tab available globally for debugging
(window as any).getCurrentTab = () => currentActiveTab;

// App state
let map: any; // Module-scoped map object
// tileLayer removed - provider system handles basemap tiles
let threatLayerGroup: any = null; // Group for all threat overlays to clear in one go
let searchMarker: any = null; // To keep track of the current search marker
let isDrawingMode = false;
let waypoints: any[] = [];

// 3D Mode state
// 3D state is now managed in threeDModeDeck.ts
// Cesium container root removed - using deck.gl now
let currentActiveTab = 'nav-marking-area'; // Track current active tab
let waypointMarkers: any[] = [];
let pathLine: any = null;
let drawnPolygon: any = null; // Deprecated - use drawnPolygons array
let polygonLabel: any = null; // Deprecated - use polygonLabels array
let drawnPolygons: Array<{polygon: any, label: any, id: string}> = []; // Array of security area polygons
let threatMarkersMap = new Map<string, any[]>(); // Maps street name to an array of its marker layers
let threatsMap = new Map<string, { entryPoints: {lat: number, lon: number, distance: number}[], pathSegments: any[][], totalLength: number, threatLevel?: number, roadType?: string, maxSpeed?: number }>(); // To store analysis data for report
let manualEntryMode = false;
let manualEntryButton: HTMLButtonElement | null = null;
let manualEntryIdCounter = 0;
let drawingCandidateId: string | null = null;
let manualPathsMap = new Map<string, any[]>(); // Store manual paths: candidateId -> array of path segments

// OSM Speed Limits Integration
let osmSpeedLimiter: OsmSpeedLimiter | null = null;
let currentOsmData: OsmBundle | null = null;
let osmLoadingController: AbortController | null = null;
let osmDebounceTimeout: number | null = null;
let generatedPdf: any = null; // To hold the generated PDF object
let generatedPdfUrl: string | null = null; // Object URL for iframe preview
let generatedPdfFilename: string = ''; // To store the generated PDF filename
let generatedTenderPdf: any = null; // To hold the generated Tender PDF object
let generatedTenderPdfUrl: string | null = null; // Object URL for tender iframe preview
let generatedWordBlob: Blob | null = null; // To hold the generated Word document
let generatedWordFilename: string = ''; // To store the generated Word filename

// Street highlighting system
let highlightedStreetName: string | null = null;
let originalStreetStyles = new Map<string, any[]>(); // Store original styles for reset

// Manual threat editing system
let isEditMode = false;
let manuallyRemovedThreats = new Set<string>(); // Track manually removed threats
let manuallyAddedThreats = new Map<string, any>(); // Track manually added threats
let productDatabase: any[] = []; // To cache the product data
let pinnedTooltips: Array<{element: HTMLElement, marker: any, latLng: any}> = []; // Track pinned tooltips for map movement
let pinnedProducts: Array<{streetName: string, maxSpeed: number, product: any, marker?: any}> = []; // Track pinned products for tender generation

// Internationalization (i18n) state
let currentLanguage = 'de';
let translations: any = null; // Will be set to embeddedTranslations after definition

// Embedded translations to avoid loading issues
const embeddedTranslations = {
    "de": {
        "header": {
            "planning": "Planer",
            "manufacturer": "Hersteller"
        },
        "nav": {
            "paramInput": "Parameter",
            "markingArea": "Sicherheitsbereich",
            "threatAnalysis": "Zufahrtanalyse",
            "riskReport": "Risikobericht",
            "productSelection": "Produktauswahl",
            "projectDescription": "Ausschreibung",
            "publishProject": "Projektausschreibung veröffentlichen"
        },
        "aria": {
            "search": "Suche",
            "email": "E-Mail",
            "settings": "Einstellungen"
        },
        "user": {
            "loggedIn": "Angemeldet: BarricadiX Admin"
        },
        "sidebar": {
            "osmLimits": {
                "title": "Einfluss auf Geschwindigkeit:",
                "maxspeed": "Tempolimit",
                "trafficCalming": "Verkehrsberuhiger",
                "weather": "Wetter",
                "weatherOptions": {
                    "dry": "trocken",
                    "wet": "nass",
                    "snow": "Schnee",
                    "ice": "Eis"
                },
                "surface": "Fahrbahnbelag"
            },
            "trafficData": "Parameterwahl",
            "vehicleSelect": "Fahrzeugauswahl",
            "accessRoads": "Zufahrten",
            "curbs": "Bordsteinkanten",
            "obstacles": "Hindernisse",
            "protectionSelection": "Schutzauswahl",
            "protectionPeriod": "Schutzzeitraum",
            "protectionProducts": "Schutzprodukte",
            "productProperty": "Produkteigenschaft",
            "riskAssessment": "Risikobewertung",
            "assetToProtect": "Was geschützt werden soll",
            "securityRisk": "Sicherheitsrisiko",
            "recommendedProductClass": "Empfohlene Produktklasse",
            "low": "niedrig",
            "high": "hoch",
            "options": {
                "vehicle": {
                    "all": "alle",
                    "motorcycle": "Motorrad",
                    "car_light": "KFZ <3.5t",
                    "truck_light": "LKW <7.5t",
                    "truck_medium": "LKW <12t",
                    "truck_heavy": "LKW <40t"
                },
                "access": {
                    "all": "alle",
                    "meadow": "Wiese",
                    "forest_path": "Waldweg",
                    "pedestrian_path": "Fußgängerweg",
                    "one_way": "Einbahnstraße",
                    "two_lane": "Zweispur",
                    "three_lane": "Dreispur",
                    "four_lane": "Vierspur"
                },
                "curbs": {
                    "yes": "ja",
                    "no": "nein"
                },
                "obstacles": {
                    "none": "keine",
                    "trees": "Bäume",
                    "posts": "Pfosten",
                    "bins": "Mülltonnen"
                },
                "period": {
                    "permanent": "dauerhaft",
                    "temporary": "temporär",
                    "eventual": "eventuell"
                },
                "products": {
                    "bollard": "Poller",
                    "barrier": "Barriere",
                    "post": "Pfosten",
                    "ditch": "Graben"
                },
                "property": {
                    "automatic_rigid": "aut./starr",
                    "retractable": "versenkbar",
                    "removable": "entfernbar"
                }
            }
        },
        "products": {
            "resistanceMedium": "Widerstandsmedium",
            "resistanceHigh": "Hoher Widerstand",
            "resistanceLow": "Niedriger Widerstand",
            "contactAdvice": "Kontaktempfehlung",
            "requiredSpeed": "Erforderliche Geschwindigkeit",
            "noSuitableProduct": "Kein passendes Produkt in der Datenbank gefunden. Bitte kontaktieren Sie einen zertifizierten Sicherheitsberater",
            "pinned": "Angepinnt",
            "clickToPin": "Klicken zum Anpinnen"
        },

        "ai": {
            "reportPrompt": `ROLLE:
Du bist ein erfahrener Ingenieur für Zufahrtsschutz bei BarricadiX GmbH und erstellst eine technische Risikobewertung.

🚫 ABSOLUT VERBOTEN - NIEMALS GENERIEREN:
- Anreden wie "Sehr geehrte Damen und Herren" oder "Liebe Leserinnen"
- Persönliche Formulierungen (Ich-Form, Brief-Stil)
- Zahlenfolgen wie "1, 2, 3, 4, 5..." oder "10, 20, 30..."
- Wiederholte Wörter, Phrasen oder Sätze
- Platzhalter wie "[...]", "..." oder "###"
- Aufzählungen mit mehr als 5 Punkten
- Fiktive Straßennamen (NUR die übergebenen verwenden)
- Das Wort "Gutachten" (nutze "Risikobewertung")

✅ PFLICHT - SCHREIBSTIL:
- SACHLICH, UNPERSÖNLICH, WISSENSCHAFTLICH
- Passiv-Konstruktionen verwenden ("Es wurde ermittelt..." statt "Wir haben ermittelt...")
- 300-500 Wörter pro Kapitel als zusammenhängender Fließtext
- Fachlich korrekt nach DIN SPEC 91414-1/-2, DIN ISO 22343-1/-2
- Formaler technischer Berichtsstil
- Produktneutral (keine Herstellernamen)

NORMEN:
- DIN SPEC 91414-1:2021 (Risikobeurteilung, Sicherungsgrade SG0-SG4)
- DIN SPEC 91414-2:2022 (Planung von Zufahrtsschutzkonzepten)
- DIN ISO 22343-1/-2:2025 (Fahrzeugsicherheitsbarrieren)
- TR „Mobile Fahrzeugsperren" (SK1/SK2)
- ProPK-Handreichung „Schutz vor Überfahrtaten"

SCHUTZKLASSEN:
- SK1: 250-800 kJ (Pkw, leichte Transporter)
- SK2: 800-1950 kJ (schwere Lkw)

ENERGIESTUFEN:
- E1: <250 kJ | E2: 250-800 kJ | E3: 800-1950 kJ | E4: >1950 kJ

DATEN:
- Schutzgut: {assetToProtect}
- Standort: {locationName}
- Zeitraum: {protectionPeriod}
- Sicherungsgrad: {protectionGrade}
- Bedrohungsniveau: {averageThreatLevel}/10
- Zufahrten: {threatList}
- Kritischste Zufahrten: {highestThreatRoads}
- Empfohlene Systeme: {recommendedProductTypes}

AUSGABEFORMAT:
- Genau 11 Kapitel, durchnummeriert von 1 bis 11
- Jedes Kapitel beginnt mit "**X. Kapiteltitel**" (wobei X die Nummer ist)
- Jedes Kapitel enthält 2-3 prägnante Absätze (max. 250-400 Wörter)
- KNAPP und PRÄZISE formulieren, keine Wiederholungen
- Zwischen den Kapiteln eine Leerzeile
- KEIN JSON, KEIN Markdown außer den Kapitelüberschriften

**1. Auftrag, Zielsetzung und Geltungsbereich**
WICHTIG: Formuliere einen sachlichen Fließtext. KEINE Anrede, KEINE Briefform, KEIN "Sehr geehrte..."!

Die vorliegende fahrdynamische Risikobewertung wurde im Auftrag der Stadt {clientCity} durch die BarricadiX GmbH erstellt. Gegenstand der Untersuchung ist die Analyse und Bewertung des Zufahrtsschutzes für das Schutzgut "{assetToProtect}" am Standort {locationName}.

Der räumliche Geltungsbereich umfasst den definierten Schutzperimeter einschließlich aller identifizierten Zufahrtsvektoren. Der zeitliche Geltungsbereich erstreckt sich auf den Zeitraum {protectionPeriod}. Zielsetzung ist die Identifikation, Bewertung und Klassifizierung aller potenziellen Anfahrtskorridore nach fahrdynamischen Gesichtspunkten sowie die Ableitung geeigneter Schutzmaßnahmen.

Diese technische Risikobewertung dient als Planungsgrundlage für die Konzeption temporärer oder permanenter Fahrzeugsicherheitsbarrieren. Sie ersetzt keine hoheitliche Gefährdungsbewertung durch die zuständigen Sicherheitsbehörden.

**2. Normative Grundlagen und Referenzen**
Formuliere KNAPP (max. 250 Wörter): Die Risikobewertung basiert auf DIN SPEC 91414-1:2021 (Risikobeurteilung, Sicherungsgrade SG0-SG4), DIN SPEC 91414-2:2022 (Planung), DIN ISO 22343-1/-2:2025 (Fahrzeugsicherheitsbarrieren), TR "Mobile Fahrzeugsperren" (Schutzklassen SK1/SK2) und ProPK-Handreichung "Schutz vor Überfahrtaten". Erläutere kurz die Bedeutung dieser Normen.

**3. Beschreibung des Schutzbereichs**
Formuliere einen sachlichen, beschreibenden Text (KEINE Anrede, KEINE Brief-Form):

Der untersuchte Schutzbereich befindet sich in {locationContext}. Die städtebauliche Situation ist gekennzeichnet durch die typische Innenstadtlage mit verdichteter Bebauung. Die Nutzung des Bereichs umfasst {assetToProtect}. Im Rahmen der Ortsbegehung und GIS-Analyse wurden die folgenden Zufahrtswege identifiziert: {threatList}. Die Verkehrsflächen weisen unterschiedliche Fahrbahnbreiten und Oberflächenbeschaffenheiten auf. Besondere örtliche Gegebenheiten werden bei der fahrdynamischen Analyse berücksichtigt.

**4. Bedrohungsanalyse und Täterverhalten**
Analysiere sachlich ohne persönliche Anrede:

Die Bedrohungsanalyse berücksichtigt das Szenario "Vehicle-as-a-Weapon" (VaW) gemäß aktueller Erkenntnisse der Sicherheitsbehörden. Relevante Fahrzeugkategorien umfassen Personenkraftwagen (1.200-1.800 kg), Transporter (bis 3.500 kg) sowie Lastkraftwagen verschiedener Gewichtsklassen (7.500-30.000 kg). Bei intentionalen Anschlägen ist von maximaler Beschleunigung bis zum Aufprallpunkt auszugehen. Die Zielattraktivität wird nach dem ProPK-Gefährdungsraster bewertet: Personendichte, Symbolkraft und mediale Reichweite. Die spezifische Gefährdungsanalyse ergibt: {hazardAssessment}.

**5. Methodik der BarricadiX-Analyse**
WICHTIG: Formuliere einen wissenschaftlich-technischen Fließtext OHNE persönliche Anreden. Verwende Passiv-Konstruktionen.

Die vorliegende Risikobewertung basiert methodisch auf den normativen Grundlagen der DIN SPEC 91414-1/-2 sowie der Technischen Richtlinie "Mobile Fahrzeugsperren" des Bundesministeriums des Innern. Zur Identifikation potenzieller Anfahrtskorridore wird eine GIS-gestützte Analyse validierter Geo-Informationsdaten durchgeführt. Die räumliche Abgrenzung des Schutzperimeters ermöglicht die systematische Erfassung aller Zufahrtsvektoren.

Die fahrdynamische Modellierung erfolgt nach dem Newton-Euler-Formalismus der klassischen Mehrkörperdynamik. Die energetische Betrachtung basiert auf der vektoriellen Formulierung der Bewegungsgleichungen starrer Körper. Für jede identifizierte Zufahrt wird die effektive Anfahrtsstrecke (s) unter Berücksichtigung von Kurvenradien, Fahrbahnbreiten, Neigungen und geschwindigkeitsreduzierenden Hindernissen ermittelt.

Die Berechnung der maximalen Aufprallgeschwindigkeit erfolgt über die kinematische Grundgleichung v = sqrt(2·a·s) unter Annahme konstanter Beschleunigung. Die resultierende kinetische Aufprallenergie E_kin = 0,5·m·v² wird für zehn normative Prüffahrzeugklassen gemäß IWA 14-1 / PAS 68 (von M1/Pkw mit 1.500 kg bis N3G/4-Achser mit 36.000 kg) ermittelt und in Energiestufen E1-E4 klassifiziert. Diese Klassifizierung bildet die Grundlage für die Ableitung erforderlicher Schutzklassen gemäß TR Mobile Fahrzeugsperren.

**6. Fahrdynamische Analyse und Maximalenergien**
Formuliere sachlich (KEINE Anrede, KEINE Brief-Form, KEINE Ich-Perspektive):

Die fahrdynamische Analyse umfasst die systematische Berechnung der maximalen Aufprallenergie für jede identifizierte Zufahrt unter Berücksichtigung der neun Referenz-Fahrzeugklassen. Die Ergebnisse werden in die Energiekategorien E1 (unter 250 kJ), E2 (250-800 kJ), E3 (800-1950 kJ) und E4 (über 1950 kJ) klassifiziert.

Als kritischste Zufahrten wurden identifiziert: {highestThreatRoads}. Die Worst-Case-Betrachtung erfolgt mit einem 30-Tonnen-Lastkraftwagen unter Annahme maximaler Beschleunigung. Die detaillierten Berechnungsergebnisse sind dem Anhang zu entnehmen.

**7. Risikoanalyse nach ALARP-Prinzip**
Formuliere sachlich (KEINE persönliche Anrede, KEIN Brief-Stil):

Die Risikobewertung erfolgt nach dem ALARP-Prinzip ("As Low As Reasonably Practicable"). Dieses etablierte Konzept des Risikomanagements unterscheidet drei Bereiche:

Der inakzeptable Bereich umfasst Zufahrten mit E4-Energien (über 1950 kJ) ohne Schutzmaßnahmen. Hier ist die Installation von Hochsicherheitsbarrieren zwingend erforderlich. Der ALARP-Bereich betrifft Zufahrten mit E2- und E3-Energien, bei denen eine Kosten-Nutzen-Abwägung zwischen Schutzwirkung und Aufwand durchzuführen ist. Der akzeptable Bereich beinhaltet Zufahrten mit E1-Energien (unter 250 kJ), bei denen einfache Absperrungen ausreichend sind.

Für den vorliegenden Schutzbereich ergibt die Analyse ein durchschnittliches Bedrohungsniveau von {averageThreatLevel}/10. Die Eintrittswahrscheinlichkeit wird anhand des Veranstaltungstyps und der Symbolkraft bewertet. Das potenzielle Schadensausmaß ist bei der zu erwartenden Personendichte als sehr hoch einzustufen.

**8. Schutzzieldefinition und Sicherungsgrad**
Das Schutzziel für {assetToProtect} wird wie folgt definiert: Verhinderung des unberechtigten Eindringens mehrspuriger Kraftfahrzeuge in den definierten Schutzbereich. Der abgeleitete Sicherungsgrad {protectionGrade} ergibt sich aus der Risikoanalyse und den Anforderungen gemäß DIN SPEC 91414-1 und ISO 22343. Die konkreten Leistungsanforderungen an die Fahrzeugsicherheitsbarrieren werden aus den ermittelten Energiestufen abgeleitet.

**9. Schutzkonzept und Maßnahmenempfehlungen**
Basierend auf der fahrdynamischen Analyse wird folgendes Schutzkonzept empfohlen: Die Zufahrten werden in drei Kategorien eingeteilt - Kategorie A (hochkritisch, SK2-Barrieren erforderlich), Kategorie B (mittlerer Schutzbedarf, SK1-Barrieren ausreichend) und Kategorie C (geringer Schutzbedarf, einfache Sperren). Als Systemtypen werden empfohlen: {recommendedProductTypes}. Bei der Planung sind BOS-Zufahrten und Rettungswege gemäß DIN 14090 zu berücksichtigen.

**10. Restgefahren und Betriebskonzept**
Auch bei Umsetzung der empfohlenen Maßnahmen verbleiben Restgefahren: atypische Fahrzeuge außerhalb der Referenzklassen, kombinierte Angriffsszenarien sowie mögliche Fehlbedienungen. Diese Grenzen technischer Maßnahmen sind im Betriebskonzept zu berücksichtigen. Das Betriebskonzept umfasst Personalschulung, definierte Wartungsintervalle, Überwachungsroutinen sowie ein Notfall- und Räumungskonzept. Eine Überprüfung der Risikobewertung wird in 12-monatigen Intervallen empfohlen.

**11. Fazit und Handlungsempfehlung**
WICHTIG: Formuliere eine sachliche Zusammenfassung (KEINE persönliche Anrede wie "Sehr geehrte..."):

Die vorliegende fahrdynamische Risikobewertung identifiziert die kritischen Zufahrten zum Schutzbereich und klassifiziert diese nach Energiestufen. Mit der Umsetzung der empfohlenen SK1- und SK2-Maßnahmen kann das Risiko auf ein ALARP-konformes Niveau reduziert werden. Der Stadt {clientCity} wird empfohlen, die Detailplanung in Abstimmung mit den zuständigen Sicherheitsbehörden durchzuführen. Als nächste Schritte sind vorgesehen: Abstimmung mit Ordnungsbehörden, Detailplanung der Sperrstellen, Ausschreibung und Umsetzung. Diese technische Risikobewertung bildet die Planungsgrundlage und ist im Rahmen des Sicherheitskonzepts mit den zuständigen Behörden abzustimmen.`,
            "chatbot": {
                "title": "Zufahrtsschutz-Assistent",
                "welcome": "Willkommen zum Zufahrtsschutz-Assistenten. Ich stelle nur Fragen, die noch fehlen oder unsicher sind. Bereit?",
                "assetQuestion": "Welche Schutzgüter möchten Sie absichern?",
                "assetOptions": "Menschenmenge,Gebäude,KRITIS-Prozess,Veranstaltungsfläche",
                "assetPlaceholder": "z. B. Menschenmenge, Bühne",
                "assetQuestionInfo": "Grundlage für Schutzziel & Schutzklasse (DIN SPEC 91414-2 / ISO 22343-2)",
                "inputPlaceholder": "Antwort eingeben...",
                "sendButton": "Senden",
                "stakeholderQuestion": "Wer sind die relevanten Stakeholder (Behörden, Veranstalter, Betreiber)?",
                "stakeholderOptions": "Behörden,Veranstalter,Betreiber",
                "restRiskQuestion": "Welches akzeptable Restrisiko gilt?",
                "restRiskOptions": "niedrig,mittel,hoch",
                "restRiskQuestionInfo": "Steuert Schutzklasse/Sicherungsgrad (DIN SPEC 91414-2)",
                "operationalQuestion": "Betriebsanforderungen (mehrfach wählbar)",
                "operationalOptions": "Feuerwehrzufahrt,Fluchtwege,Verkehrssicherheit,Betriebssicherheit",
                "threatQuestion": "Welche Art fahrzeuggestützter Bedrohung ist zu erwarten?",
                "threatOptions": "intentional,unbeabsichtigt,beides",
                "vehicleTypesQuestion": "Welche Fahrzeugtypen sind relevant?",
                "vehicleOptions": "PKW,Transporter,LKW,Bus",
                "accessCorridorsQuestion": "Wo könnten Fahrzeuge eindringen? (Karte markieren oder beschreiben)",
                "accessCorridorsPlaceholder": "Polyline/Polygon auswählen oder kurz beschreiben",
                "speedQuestion": "Maximale Zufahrtsgeschwindigkeit (km/h)",
                "speedQuestionInfo": "Pflichtparameter für FSB-Performance (ISO 22343-2/-1)",
                "angleQuestion": "Wahrscheinlicher Anprallwinkel (°)",
                "angleQuestionInfo": "Pflichtparameter für FSB-Performance (ISO 22343-2/-1)",
                "groundQuestion": "Untergrund/Fundamente am Standort",
                "groundOptions": "Asphalt,Beton,Pflaster,Erde,Unbekannt",
                "riskMatrixQuestion": "Risikobewertung: Eintrittswahrscheinlichkeit & Schadensausmaß",
                "riskMatrixOptions": "EW:niedrig|SA:gering,EW:niedrig|SA:mittel,EW:mittel|SA:mittel,EW:hoch|SA:schwer",
                "riskMatrixQuestionInfo": "Erzeugt Sicherungsgrad & Schutzklasse (DIN SPEC 91414-2)",
                "infoPrefix": "Hinweis: ",
                "completionMessage": "Danke! Alle erforderlichen Angaben sind vorhanden. Möchten Sie den normkonformen PDF-Plan erzeugen?"
            },
            "error": "Fehler bei der KI-Analyse",
            "retry": "Erneut versuchen",
            "loading": "KI-Analyse wird erstellt...",
            "timeout": "Zeitüberschreitung bei der Analyse",
            "networkError": "Netzwerkfehler bei der KI-Analyse",
            "serviceUnavailable": "KI-Service vorübergehend nicht verfügbar"
        },
        "manufacturer": {
            "title": "Herstelleransicht",
            "subtitle": "Verwalten Sie Ihren Produktkatalog und Kundenanfragen",
            "products": "Produkte",
            "quotations": "Angebote",
            "customers": "Kunden",
            "analytics": "Analysen",
            "manageCatalog": "Verwalten Sie Ihren Produktkatalog",
            "createQuotations": "Erstellen und verwalten Sie Angebote",
            "manageContacts": "Verwalten Sie Ihre Kundenkontakte",
            "businessAnalytics": "Betriebs- und Verkaufsanalysen",
            "open": "Öffnen",
            "nav": {
                "products": "Produkte",
                "quotations": "Angebote",
                "customers": "Kunden",
                "analytics": "Analysen",
                "settings": "Einstellungen"
            },
            "sidebar": {
                "productManagement": "Produktverwaltung",
                "productCategory": "Produktkategorie",
                "productStatus": "Produktstatus",
                "customerManagement": "Kundenverwaltung",
                "customerType": "Kundentyp",
                "customerRegion": "Region",
                "analytics": "Analysen",
                "dateRange": "Zeitraum",
                "options": {
                    "category": {
                        "all": "Alle Kategorien",
                        "bollards": "Poller",
                        "barriers": "Barrieren",
                        "posts": "Pfosten",
                        "ditches": "Gräben"
                    },
                    "status": {
                        "all": "Alle Status",
                        "active": "Aktiv",
                        "inactive": "Inaktiv",
                        "draft": "Entwurf"
                    },
                    "customerType": {
                        "all": "Alle Typen",
                        "private": "Privat",
                        "business": "Geschäft",
                        "government": "Behörde"
                    },
                    "region": {
                        "all": "Alle Regionen",
                        "north": "Nord",
                        "south": "Süd",
                        "east": "Ost",
                        "west": "West"
                    },
                    "dateRange": {
                        "7days": "Letzte 7 Tage",
                        "30days": "Letzte 30 Tage",
                        "90days": "Letzte 90 Tage",
                        "1year": "Letztes Jahr"
                    },
                    "manufacturer": {
                        "all": "Alle Hersteller"
                    },
                    "standard": {
                        "all": "Alle Standards"
                    },
                    "vehicleType": {
                        "all": "Alle Fahrzeugtypen"
                    }
                },
                "productDatabase": {
                    "title": "Produktdatenbank",
                    "subtitle": "Technische Daten und Spezifikationen aller verfügbaren Produkte",
                    "search": "Produktsuche",
                    "searchPlaceholder": "Produktname, Hersteller, Standard oder Fahrzeugtyp eingeben...",
                    "filterBy": "Filtern nach",
                    "manufacturer": "Hersteller",
                    "type": "Typ",
                    "standard": "Standard",
                    "productType": "Produkttyp",
                    "cluster": "Cluster",
                    "performance": "Leistungsbewertung",
                    "dimensions": "Abmessungen",
                    "foundation": "Fundamenttiefe",
                    "material": "Material",
                    "vehicleWeight": "Fahrzeuggewicht (kg)",
                    "vehicleType": "Fahrzeugtyp",
                    "speed": "Geschwindigkeit (km/h)",
                    "impactAngle": "Anprallwinkel (°)",
                    "penetration": "Penetration (m)",
                    "debrisDistance": "Trümmerdistanz (m)",
                    "actions": "Aktionen",
                    "noProducts": "Keine Produkte gefunden",
                    "loading": "Produkte werden geladen...",
                    "technicalSpecs": "Technische Spezifikationen",
                    "performanceData": "Leistungsdaten",
                    "certification": "Zertifizierung",
                    "certificationStandard": "Zertifizierungsstandard",
                    "testConditions": "Testbedingungen",
                    "atSpeed": "bei",
                    "viewDetails": "Details anzeigen",
                    "closeDetails": "Schließen",
                    "exportData": "Daten exportieren",
                    "printSpecs": "Spezifikationen drucken",
                    "modal": {
                        "title": "Produktdetails",
                        "technicalSpecs": "Technische Spezifikationen",
                        "performanceData": "Leistungsdaten",
                        "certification": "Zertifizierung",
                        "exportData": "Daten exportieren",
                        "printSpecs": "Spezifikationen drucken"
                    },
                    "toggleToGrid": "Kachelansicht",
                    "toggleToTable": "Tabellenansicht",
                    "table": {
                        "manufacturer": "Hersteller",
                        "type": "Typ",
                        "standard": "Standard",
                        "vehicleWeight": "Fahrzeuggewicht (kg)",
                        "vehicleType": "Fahrzeugtyp",
                        "speed": "Geschwindigkeit (km/h)",
                        "impactAngle": "Anprallwinkel (°)",
                        "penetration": "Penetration (m)",
                        "debrisDistance": "Trümmerdistanz (m)",
                        "actions": "Aktionen"
                    }
                }
            }
        },
        "tooltips": {
            "securityRisk": "Informationen zum Sicherheitsrisiko.",
            "productClass": "Informationen zur empfohlenen Produktklasse."
        },
        "report": {
            "mainTitle": "Risikobewertung für Zufahrtsschutz",
            "watermark": "VERTRAULICH",
            "undefinedAsset": "Nicht definiertes Schutzgut",
            "undefinedValue": "Nicht definierter Wert",
            "noThreatAnalysis": "Keine Gefahrenanalyse verfügbar",
            "generating": "Bericht wird generiert...",
            "status": {
                "draft": "Entwurf",
                "final": "Final",
                "approved": "Genehmigt"
            },
            "metadata": {
                "date": "Datum",
                "author": "Autor",
                "version": "Version",
                "classification": "Klassifizierung"
            },
            "sections": {
                "chapter1": { "title": "1. Auftrag, Zielsetzung und Geltungsbereich" },
                "chapter2": { "title": "2. Normative Grundlagen und Referenzen" },
                "chapter3": { "title": "3. Beschreibung des Veranstaltungsbereichs" },
                "chapter4": { "title": "4. Bedrohungsanalyse und Täterverhalten" },
                "chapter5": { "title": "5. Methodik der BarricadiX-Analyse" },
                "chapter6": { "title": "6. Fahrdynamische Analyse und Maximalenergien" },
                "chapter7": { "title": "7. Risikoanalyse nach dem ALARP-Prinzip" },
                "chapter8": { "title": "8. Schutzzieldefinition" },
                "chapter9": { "title": "9. Schutzkonzept und produktoffene Empfehlungen" },
                "chapter10": { "title": "10. Restgefahren und Grenzen" },
                "chapter11": { "title": "11. Schlussfolgerungen und Empfehlung" },
                "purpose": {
                    "title": "Zweck und Zielsetzung",
                    "description": "Dieser Bericht dient der Bewertung der Sicherheitsrisiken für die zu schützenden Zufahrten und der Empfehlung geeigneter Schutzmaßnahmen."
                },
                "threatAnalysis": {
                    "title": "Gefahrenanalyse",
                    "description": "Analyse der identifizierten Bedrohungen und deren potenzielle Auswirkungen."
                },
                "riskAssessment": {
                    "title": "Risikobewertung",
                    "description": "Bewertung der identifizierten Risiken und deren Klassifizierung."
                },
                "recommendations": {
                    "title": "Empfehlungen",
                    "description": "Konkrete Handlungsempfehlungen für die Implementierung von Schutzmaßnahmen."
                },
                "vulnerabilities": {
                    "title": "Schwachstellenanalyse",
                    "description": "Identifizierung und Bewertung von Sicherheitsschwachstellen."
                },
                "hvmMeasures": {
                    "title": "HVM-Schutzmaßnahmen",
                    "description": "Spezifische Schutzmaßnahmen gegen High-Velocity Missile Angriffe."
                },
                "siteConsiderations": {
                    "title": "Standortbetrachtungen",
                    "description": "Besondere Aspekte des Standorts und der Umgebung."
                },
                "operationalImpact": {
                    "title": "Betriebliche Auswirkungen",
                    "description": "Auswirkungen der Schutzmaßnahmen auf den laufenden Betrieb."
                }
            },
            "threatsTable": {
                "title": "Identifizierte Bedrohungen",
                "street": "Straße",
                "distance": "Strecke",
                "maxSpeed": "Max. erreichbare Geschw."
            },
            "identifiedCorridors": "{count} identifizierte Korridore",
            "noChatGeometry": "keine Geometrie aus Chatbot übergeben",
            "actions": {
                "save": "Speichern",
                "print": "Drucken",
                "export": "Exportieren",
                "share": "Teilen"
            },
            "generation": {
                "failed": "Berichterstellung fehlgeschlagen",
                "networkError": "Netzwerkfehler bei der Berichterstellung",
                "retry": "Bericht erneut generieren",
                "loading": "Bericht wird erstellt..."
            },
            "ai": {
                "error": "Fehler bei der KI-Berichterstellung",
                "loading": "KI-Bericht wird generiert...",
                "timeout": "Zeitüberschreitung bei der KI-Berichterstellung"
            },
            "keyFacts": {
                "title": "Eckdaten des Zufahrtsschutzkonzepts",
                "location": "Standort",
                "asset": "Schutzgut",
                "securityLevel": "Sicherheitsniveau",
                "protectionGrade": "Sicherungsgrad",
                "dataBasis": "Datenbasis: {source}, Stand: {date}"
            },
            "threatListIntro": "Aus der GIS-Analyse der Anfahrkorridore ergeben sich folgende Zufahrten mit potenziell kritischen Annäherungswegen:"
        },
        "threats": {
            "title": "Gefahrenanalyse",
            "speed": "Geschwindigkeit",
            "analysisFailed": "Gefahrenanalyse fehlgeschlagen",
            "noCrossingWaysBoundary": "Keine kreuzenden Wege an der Grenze gefunden",
            "popupHeader": "Gefahreninformationen",
            "loading": "Lade Gefahrenanalyse...",
            "minimize": "Minimieren",
            "maximize": "Maximieren",
            "close": "Schließen",
            "editMode": "Zufahrten bearbeiten",
            "manualEntry": "Manuelle Zufahrt"
        },
        "map": {
            "createReport": "Bericht erstellen",
            "downloadReport": "Bericht herunterladen",
            "searchPlaceholder": "Recklinghausen",
            "searchButton": "Suchen",
            "setWaypoints": "Wegpunkte setzen",
            "setWaypointsActive": "Zeichnen aktiv",
            "reset": "Zurücksetzen",
            "securityAreaLabel": "Sicherheitsbereich",
            "securityArea": "Sicherheitsbereich",
            "analyzeAccess": "Zufahrt analysieren"
        },
        "placeholders": {
            "assetToProtect": "Bitte eintragen"
        },
        "alerts": {
            "noPolygon": "Bitte zeichnen Sie zuerst einen Sicherheitsbereich auf der Karte.",
            "overpassError": "Fehler beim Laden der Straßendaten (Status: {status}).",
            "analysisError": "Fehler bei der Gefahrenanalyse. Bitte versuchen Sie es erneut.",
            "invalidPolygon": "Ungültiges Polygon. Bitte zeichnen Sie den Sicherheitsbereich neu.",
            "emptyPolygon": "Das gezeichnete Polygon hat keine gültigen Koordinaten.",
            "polygonCoordinateError": "Fehler beim Verarbeiten der Polygon-Koordinaten.",
            "locationNotFound": "Standort nicht gefunden. Bitte überprüfen Sie die Eingabe.",
            "noThreatsFound": "Keine Bedrohungen in diesem Bereich gefunden.",
            "reportGenerationError": "Fehler beim Erstellen des Berichts. Bitte versuchen Sie es erneut.",
            "reportCreationError": "Fehler bei der Berichtserstellung. Bitte versuchen Sie es erneut.",
            "geminiError": "Die KI-gestützte Analyse konnte aufgrund eines Fehlers nicht generiert werden."
        },


    },
    "en": {
        "header": {
            "planning": "Planner",
            "manufacturer": "Manufacturer"
        },
        "nav": {
            "paramInput": "Parameters",
            "markingArea": "Security Area",
            "threatAnalysis": "Threat Analysis",
            "riskReport": "Risk Report",
            "productSelection": "Product Selection",
            "projectDescription": "Specification",
            "publishProject": "Publish Project Specification"
        },
        "aria": {
            "search": "Search",
            "email": "Email",
            "settings": "Settings"
        },
        "user": {
            "loggedIn": "Logged in: BarricadiX Admin"
        },
        "sidebar": {
            "osmLimits": {
                "title": "Speed Influence:",
                "maxspeed": "Speed limit",
                "trafficCalming": "Traffic calming",
                "weather": "Weather",
                "weatherOptions": {
                    "dry": "dry",
                    "wet": "wet",
                    "snow": "snow",
                    "ice": "ice"
                },
                "surface": "Road surface"
            },
            "trafficData": "Parameter Selection",
            "vehicleSelect": "Vehicle Selection",
            "accessRoads": "Access Roads",
            "curbs": "Curbs",
            "obstacles": "Obstacles",
            "protectionSelection": "Protection Selection",
            "protectionPeriod": "Protection Period",
            "protectionProducts": "Protection Products",
            "productProperty": "Product Property",
            "riskAssessment": "Risk Assessment",
            "assetToProtect": "What to Protect",
            "securityRisk": "Security Risk",
            "recommendedProductClass": "Recommended Product Class",
            "low": "low",
            "high": "high",
            "options": {
                "vehicle": {
                    "all": "all",
                    "motorcycle": "Motorcycle",
                    "car_light": "Car <3.5t",
                    "truck_light": "Truck <7.5t",
                    "truck_medium": "Truck <12t",
                    "truck_heavy": "Truck <40t"
                },
                "access": {
                    "all": "all",
                    "meadow": "Meadow",
                    "forest_path": "Forest Path",
                    "pedestrian_path": "Pedestrian Path",
                    "one_way": "One Way",
                    "two_lane": "Two Lane",
                    "three_lane": "Three Lane",
                    "four_lane": "Four Lane"
                },
                "curbs": {
                    "yes": "yes",
                    "no": "no"
                },
                "obstacles": {
                    "none": "none",
                    "trees": "Trees",
                    "posts": "Posts",
                    "bins": "Bins"
                },
                "period": {
                    "permanent": "permanent",
                    "temporary": "temporary",
                    "eventual": "eventual"
                },
                "products": {
                    "bollard": "Bollard",
                    "barrier": "Barrier",
                    "post": "Post",
                    "ditch": "Ditch"
                },
                "property": {
                    "automatic_rigid": "auto/rigid",
                    "retractable": "retractable",
                    "removable": "removable"
                }
            }
        },
        "products": {
            "resistanceMedium": "Resistance Medium",
            "resistanceHigh": "High Resistance",
            "resistanceLow": "Low Resistance",
            "contactAdvice": "Contact Recommendation",
            "requiredSpeed": "Required Speed",
            "noSuitableProduct": "No suitable product found in database. Please contact a certified security consultant",
            "pinned": "Pinned",
            "clickToPin": "Click to pin"
        },
        "ai": {
            "reportPrompt": `You are a security planner specializing in Hostile Vehicle Mitigation (HVM) and protection against vehicle ramming attacks.
You work according to standards:
- DIN SPEC 91414-2 (Operational planning and application guidelines, incl. Annex E "Operational requirements for an access protection concept"),
- DIN ISO 22343-2 (Application – especially chapters on operational requirements and maintenance/inspection),
- DIN SPEC 91414-1, TR "Mobile Vehicle Barriers", relevant police guidance on vehicle attacks,
- Police requirements catalog "Specialist Planning Access Protection".

Context variables:
- {locationName}, {assetToProtect}, {securityLevel}, {protectionGrade},
- {protectionPeriod}, {locationContext},
- {threatList}, {averageThreatLevel}, {threatLevelDistribution}, {highestThreatRoads},
- {recommendedProductTypes}, {productType}, {productTypeJustification},
- {penetration}, {debrisDistance} (if set),
- {hazardAssessment} (results from the hazard analysis input dialog, including rated factors and risk classification).

Use these values to formulate the report specifically for the project. Do not invent place or street names and do not adopt names from examples – everything must come from the current context. Integrate the hazard analysis results ({hazardAssessment}) meaningfully into the risk assessment and vulnerability analysis.

Goal:
The report is to be understood as an **operational requirement** in the sense of DIN SPEC 91414-2 Annex E (Table E.1). It comprehensibly documents what the operator can expect from the access protection concept, from planning to implementation and operation.

Output EXACTLY 6 text blocks, separated by an empty line (two newlines).
Each block starts with its bold header name (e.g. **purpose**). No other headers. No JSON, no code fences.

The blocks are:

**purpose**
Cover the following points (Master Data / Assignment / Basics):
- Designation of the project / access protection concept for {assetToProtect} at location {locationName}.
- Client, operator, specialist planner, contact point (if unknown, define generically as placeholder).
- Fundamental goals and functions of the access protection concept.
- Description of the protection zone(s) and operating times ({protectionPeriod}).
- Used basics (e.g. site plans, standards DIN SPEC 91414-2, DIN ISO 22343-2).

**threatAnalysis**
Cover the following points (Risk Assessment):
- Risk identification: Vehicle-as-a-Weapon acts, vehicle types, attack possibilities.
- Police threat assessment (if known or generically referenced).
- Evaluation using qualitative risk matrix (probability of occurrence × extent of damage).
- Explanation of the threat situation based on {averageThreatLevel} and {threatLevelDistribution}.
- Integration of hazard analysis results ({hazardAssessment}): Rated factors (event-related, spatial, security-related, attack-influencing), total score and risk classification.
- Derivation of the protection grade {protectionGrade} and classification (SG0–SG4).

**vulnerabilities**
Cover the following points (Vulnerability Analysis according to Table E.1):
- Definition and description of the protection zone.
- Topography, location, structural weaknesses, and nature of the locality ({locationContext}).
- Identification of all access possibilities based on {threatList} (number, lengths, speeds).
- Access authorizations and usage times (delivery traffic, residents, public transport).
- Requirements of BOS (fire brigade, rescue service, police) and other conditions.

**hvmMeasures**
Cover the following points (Concept / System Selection):
- Formulation of protection goals (e.g. preventing unauthorized entry, limiting penetration depth).
- Product-neutral pre-selection of suitable protection systems based on {recommendedProductTypes} and {productType} (with justification {productTypeJustification}).
- Requirements for tested vehicle security barriers (DIN ISO 22343-1, IWA 14, TR "Mobile Vehicle Barriers").
- Derivation of performance requirements from the driving dynamics analysis (penetration depth {penetration}, debris flight {debrisDistance}).
- Reference to necessary deviations or modifications.

**siteConsiderations**
Cover the following points (Integration / Location):
- Integration of measures into the urban context ({locationContext}) and usage.
- Consideration of accessibility and cityscape ("Security by Design").
- Coordination with stakeholders (operator, residents, businesses, authorities).
- Impact on traffic, logistics, and accessibility.

**operationalImpact**
Cover the following points (Operational requirements in the sense of DIN SPEC 91414-2 / DIN ISO 22343-2):
- Operating times and operating states (open/closed, setup/dismantling times).
- Operation, personnel requirements, training, and briefing.
- Maintenance, upkeep, and regular inspections (reference to ISO 22343-2 Chap. 15/16).
- Documentation (test certificates, protocols, operating instructions).
- Reporting obligations for changes, handling of deviations and residual risks.
- Concluding note: This report is a technical operational requirement and does not replace a sovereign threat assessment by the police.`,
            "chatbot": {
                "title": "Access Protection Assistant",
                "welcome": "Welcome to the Access Protection Assistant. I only ask questions that are still missing or uncertain. Ready?",
                "assetQuestion": "Which protective assets would you like to secure?",
                "assetOptions": "Crowd,Building,KRITIS Process,Event Area",
                "assetPlaceholder": "e.g. Crowd, Stage",
                "assetQuestionInfo": "Basis for Protection Goal & Protection Class (DIN SPEC 91414-2 / ISO 22343-2)",
                "inputPlaceholder": "Enter answer...",
                "sendButton": "Send",
                "stakeholderQuestion": "Who are the relevant stakeholders (authorities, organizers, operators)?",
                "stakeholderOptions": "Authorities,Organizers,Operators",
                "restRiskQuestion": "What acceptable residual risk applies?",
                "restRiskOptions": "low,medium,high",
                "restRiskQuestionInfo": "Controls protection class/security level (DIN SPEC 91414-2)",
                "operationalQuestion": "Operational requirements (multiple choice)",
                "operationalOptions": "Fire brigade access,Escape routes,Traffic safety,Operational safety",
                "threatQuestion": "What type of vehicle-based threat is expected?",
                "threatOptions": "intentional,unintentional,both",
                "vehicleTypesQuestion": "Which vehicle types are relevant?",
                "vehicleOptions": "Car,Van,Truck,Bus",
                "accessCorridorsQuestion": "Where could vehicles penetrate? (Mark on map or describe)",
                "accessCorridorsPlaceholder": "Select polyline/polygon or describe briefly",
                "speedQuestion": "Maximum access speed (km/h)",
                "speedQuestionInfo": "Mandatory parameter for FSB performance (ISO 22343-2/-1)",
                "angleQuestion": "Probable impact angle (°)",
                "angleQuestionInfo": "Mandatory parameter for FSB performance (ISO 22343-2/-1)",
                "groundQuestion": "Ground/foundations at the site",
                "groundOptions": "Asphalt,Concrete,Paving,Earth,Unknown",
                "riskMatrixQuestion": "Risk assessment: probability of occurrence & extent of damage",
                "riskMatrixOptions": "Prob:low|Damage:minor,Prob:low|Damage:medium,Prob:medium|Damage:medium,Prob:high|Damage:severe",
                "riskMatrixQuestionInfo": "Generates security level & protection class (DIN SPEC 91414-2)",
                "infoPrefix": "Note: ",
                "completionMessage": "Thank you! All required information is available. Would you like to generate the standards-compliant PDF plan?"
            },
            "error": "Error in AI analysis",
            "retry": "Try again",
            "loading": "AI analysis is being created...",
            "timeout": "Analysis timeout",
            "networkError": "Network error in AI analysis",
            "serviceUnavailable": "AI service temporarily unavailable"
        },
        "manufacturer": {
            "title": "Manufacturer View",
            "subtitle": "Manage your product catalog and customer inquiries",
            "products": "Products",
            "quotations": "Quotations",
            "customers": "Customers",
            "analytics": "Analytics",
            "manageCatalog": "Manage your product catalog",
            "createQuotations": "Create and manage quotations",
            "manageContacts": "Manage your customer contacts",
            "businessAnalytics": "Business and sales analytics",
            "open": "Open",
            "nav": {
                "products": "Products",
                "quotations": "Quotations",
                "customers": "Customers",
                "analytics": "Analytics",
                "settings": "Settings"
            },
            "sidebar": {
                "productManagement": "Product Management",
                "productCategory": "Product Category",
                "productStatus": "Product Status",
                "customerManagement": "Customer Management",
                "customerType": "Customer Type",
                "customerRegion": "Region",
                "analytics": "Analytics",
                "dateRange": "Date Range",
                "options": {
                    "category": {
                        "all": "All Categories",
                        "bollards": "Bollards",
                        "barriers": "Barriers",
                        "posts": "Posts",
                        "ditches": "Ditches"
                    },
                    "status": {
                        "all": "All Status",
                        "active": "Active",
                        "inactive": "Inactive",
                        "draft": "Draft"
                    },
                    "customerType": {
                        "all": "All Types",
                        "private": "Private",
                        "business": "Business",
                        "government": "Government"
                    },
                    "region": {
                        "all": "All Regions",
                        "north": "North",
                        "south": "South",
                        "east": "East",
                        "west": "West"
                    },
                    "dateRange": {
                        "7days": "Last 7 Days",
                        "30days": "Last 30 Days",
                        "90days": "Last 90 Days",
                        "1year": "Last Year"
                    },
                    "manufacturer": {
                        "all": "All Manufacturers"
                    },
                    "standard": {
                        "all": "All Standards"
                    },
                    "vehicleType": {
                        "all": "All Vehicle Types"
                    }
                },
                "productDatabase": {
                    "title": "Product Database",
                    "subtitle": "Technical data and specifications of all available products",
                    "search": "Product Search",
                    "searchPlaceholder": "Enter product name, manufacturer, standard or vehicle type...",
                    "filterBy": "Filter by",
                    "manufacturer": "Manufacturer",
                    "type": "Type",
                    "standard": "Standard",
                    "productType": "Product Type",
                    "cluster": "Cluster",
                    "performance": "Performance Rating",
                    "dimensions": "Dimensions",
                    "foundation": "Foundation Depth",
                    "material": "Material",
                    "vehicleWeight": "Vehicle Weight (kg)",
                    "vehicleType": "Vehicle Type",
                    "speed": "Speed (km/h)",
                    "impactAngle": "Impact Angle (°)",
                    "penetration": "Penetration (m)",
                    "debrisDistance": "Debris Distance (m)",
                    "actions": "Actions",
                    "noProducts": "No products found",
                    "loading": "Loading products...",
                    "technicalSpecs": "Technical Specifications",
                    "performanceData": "Performance Data",
                    "certification": "Certification",
                    "certificationStandard": "Certification Standard",
                    "testConditions": "Test Conditions",
                    "atSpeed": "at",
                    "viewDetails": "View Details",
                    "closeDetails": "Close",
                    "exportData": "Export Data",
                    "printSpecs": "Print Specifications",
                    "modal": {
                        "title": "Product Details",
                        "technicalSpecs": "Technical Specifications",
                        "performanceData": "Performance Data",
                        "certification": "Certification",
                        "exportData": "Export Data",
                        "printSpecs": "Print Specifications"
                    },
                    "toggleToGrid": "Grid View",
                    "toggleToTable": "Table View",
                    "table": {
                        "manufacturer": "Manufacturer",
                        "type": "Type",
                        "standard": "Standard",
                        "vehicleWeight": "Vehicle Weight (kg)",
                        "vehicleType": "Vehicle Type",
                        "speed": "Speed (km/h)",
                        "impactAngle": "Impact Angle (°)",
                        "penetration": "Penetration (m)",
                        "debrisDistance": "Debris Distance (m)",
                        "actions": "Actions"
                    }
                }
            }
        },
        "tooltips": {
            "securityRisk": "Information about security risk.",
            "productClass": "Information about recommended product class."
        },
        "report": {
            "mainTitle": "Risk Assessment for Access Protection",
            "watermark": "CONFIDENTIAL",
            "undefinedAsset": "Undefined asset",
            "undefinedValue": "Undefined value",
            "noThreatAnalysis": "No threat analysis available",
            "generating": "Generating report...",
            "identifiedCorridors": "{count} identified corridors",
            "noChatGeometry": "no geometry from chatbot",
            "status": {
                "draft": "Draft",
                "final": "Final",
                "approved": "Approved"
            },
            "metadata": {
                "date": "Date",
                "author": "Author",
                "version": "Version",
                "classification": "Classification"
            },
            "sections": {
                "chapter1": { "title": "1. Assignment, Objectives and Scope" },
                "chapter2": { "title": "2. Normative Framework and References" },
                "chapter3": { "title": "3. Description of the Event Area" },
                "chapter4": { "title": "4. Threat Analysis and Perpetrator Behavior" },
                "chapter5": { "title": "5. BarricadiX Analysis Methodology" },
                "chapter6": { "title": "6. Vehicle Dynamics Analysis and Maximum Energies" },
                "chapter7": { "title": "7. Risk Analysis according to ALARP Principle" },
                "chapter8": { "title": "8. Protection Goal Definition" },
                "chapter9": { "title": "9. Protection Concept and Product-Neutral Recommendations" },
                "chapter10": { "title": "10. Residual Risks and Limitations" },
                "chapter11": { "title": "11. Conclusions and Recommendations" },
                "purpose": {
                    "title": "Purpose and Objectives",
                    "description": "This report serves to assess security risks for the access routes to be protected and to recommend appropriate protective measures."
                },
                "threatAnalysis": {
                    "title": "Threat Analysis",
                    "description": "Analysis of identified threats and their potential impacts."
                },
                "riskAssessment": {
                    "title": "Risk Assessment",
                    "description": "Assessment of identified risks and their classification."
                },
                "recommendations": {
                    "title": "Recommendations",
                    "description": "Concrete action recommendations for implementing protective measures."
                },
                "vulnerabilities": {
                    "title": "Vulnerability Analysis",
                    "description": "Identification and assessment of security vulnerabilities."
                },
                "hvmMeasures": {
                    "title": "HVM Protection Measures",
                    "description": "Specific protection measures against High-Velocity Missile attacks."
                },
                "siteConsiderations": {
                    "title": "Site Considerations",
                    "description": "Special aspects of the site and environment."
                },
                "operationalImpact": {
                    "title": "Operational Impact",
                    "description": "Impact of protection measures on ongoing operations."
                }
            },
            "threatsTable": {
                "title": "Identified Threats",
                "street": "Street",
                "distance": "Distance",
                "maxSpeed": "Max. achievable speed"
            },
            "actions": {
                "save": "Save",
                "print": "Print",
                "export": "Export",
                "share": "Share"
            },
            "generation": {
                "failed": "Report generation failed",
                "networkError": "Network error in report generation",
                "retry": "Generate report again",
                "loading": "Report is being created..."
            },
            "ai": {
                "error": "Error in AI report generation",
                "loading": "AI report is being generated...",
                "timeout": "Timeout in AI report generation"
            },
            "keyFacts": {
                "title": "Key Facts of the Access Protection Concept",
                "location": "Location",
                "asset": "Asset to Protect",
                "securityLevel": "Security Level",
                "protectionGrade": "Protection Grade",
                "dataBasis": "Data basis: {source}, as of: {date}"
            },
            "threatListIntro": "Based on the GIS analysis of approach corridors, the following access routes show potentially critical approach paths:"
        },
        "threats": {
            "title": "Threat Analysis",
            "speed": "Speed",
            "analysisFailed": "Threat analysis failed",
            "noCrossingWaysBoundary": "No crossing ways found at boundary",
            "popupHeader": "Threat Information",
            "loading": "Loading threat analysis...",
            "minimize": "Minimize",
            "maximize": "Maximize",
            "close": "Close",
            "editMode": "Edit access points",
            "manualEntry": "Manual Access"
        },
        "map": {
            "createReport": "Create Report",
            "downloadReport": "Download Report",
            "searchPlaceholder": "Recklinghausen",
            "searchButton": "Search",
            "setWaypoints": "Set Waypoints",
            "setWaypointsActive": "Drawing Active",
            "reset": "Reset",
            "securityAreaLabel": "Security Area",
            "securityArea": "Security Area",
            "analyzeAccess": "Analyze Access"
        },
        "placeholders": {
            "assetToProtect": "Please enter"
        },
        "alerts": {
            "noPolygon": "Please draw a security area on the map first.",
            "overpassError": "Error loading road data (Status: {status}).",
            "analysisError": "Error in threat analysis. Please try again.",
            "invalidPolygon": "Invalid polygon. Please redraw the security area.",
            "emptyPolygon": "The drawn polygon has no valid coordinates.",
            "polygonCoordinateError": "Error processing polygon coordinates.",
            "locationNotFound": "Location not found. Please check your input.",
            "noThreatsFound": "No threats found in this area.",
            "reportGenerationError": "Error creating report. Please try again.",
            "reportCreationError": "Error in report generation. Please try again.",
            "geminiError": "The AI-powered analysis could not be generated due to an error."
        }

    }
};

// Set translations to use embedded translations by default
translations = embeddedTranslations;


// ===============================================
// VIEW SWITCHER FUNCTIONS
// ===============================================

function initViewSwitcher() {
    console.log('Initializing view switcher...');
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
        const planningBtn = document.getElementById('planning-view-btn');
        const manufacturerBtn = document.getElementById('manufacturer-view-btn');
        console.log('Planning button:', planningBtn);
        console.log('Manufacturer button:', manufacturerBtn);
        
        if (planningBtn && manufacturerBtn) {
            planningBtn.addEventListener('click', () => {
                console.log('Planning button clicked');
                switchToPlanningView();
            });
            
            manufacturerBtn.addEventListener('click', () => {
                console.log('Manufacturer button clicked');
                switchToManufacturerView();
            });
            
            console.log('View switcher initialized successfully');
        } else {
            console.error('View switcher buttons not found!');
        }
        
        // Close manufacturer button removed for cleaner design
        
        // Initialize manufacturer navigation tabs
        const manufacturerTabs = document.querySelectorAll('.manufacturer-tab');
        manufacturerTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = e.target as HTMLElement;
                
                // Remove active class from all tabs
                manufacturerTabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                targetTab.classList.add('active');
                
                // Handle tab-specific content (can be expanded later)
                const tabId = targetTab.id;
                console.log('Manufacturer tab clicked:', tabId);
                
                // Show notification for now
                const tabName = targetTab.textContent || 'Tab';
                showNotification(`${tabName} wird geladen...`, 'info');
            });
        });
        
        console.log('Manufacturer navigation tabs initialized');
        
        // Initialize product database functionality after translations are loaded
        setTimeout(() => {
            console.log('🔥 ABOUT TO CALL initProductDatabase from initViewSwitcher...');
            initProductDatabase();
        }, 500);
    }, 100);
}

// Function to switch to planning view
function switchToPlanningView() {
    const planningBtn = document.getElementById('planning-view-btn');
    const manufacturerBtn = document.getElementById('manufacturer-view-btn');
    
    if (planningBtn && manufacturerBtn) {
        planningBtn.classList.add('active');
        manufacturerBtn.classList.remove('active');
    }
    
    // Show planning view content
    showPlanningView();
}

// Function to switch to manufacturer view
function switchToManufacturerView() {
    console.log('🎯 SWITCHING TO MANUFACTURER VIEW...');
    const planningBtn = document.getElementById('planning-view-btn');
    const manufacturerBtn = document.getElementById('manufacturer-view-btn');
    
    if (planningBtn && manufacturerBtn) {
        manufacturerBtn.classList.add('active');
        planningBtn.classList.remove('active');
    }
    
    // Show manufacturer view content
    showManufacturerView();
    
    // Initialize product database when switching to manufacturer view
    console.log('🔥 INITIALIZING PRODUCT DATABASE FOR MANUFACTURER VIEW...');
    setTimeout(() => {
        initProductDatabase();
    }, 100);
}

// Function to show planning view
function showPlanningView() {
    console.log('Switching to planning view...');
    
    // Clear any pinned product tooltips when switching views
    clearProductTooltips();
    
    // Hide manufacturer view completely
    const manufacturerView = document.getElementById('manufacturer-view');
    if (manufacturerView) {
        (manufacturerView as HTMLElement).style.display = 'none';
        console.log('Manufacturer view hidden');
    }
    
    // Clear manufacturer sidebar content
    const manufacturerSidebar = document.querySelector('.manufacturer-sidebar');
    if (manufacturerSidebar) {
        manufacturerSidebar.innerHTML = '';
    }
    
    // Show planning view
    const planningView = document.getElementById('planning-view');
    if (planningView) {
        (planningView as HTMLElement).style.display = 'block';
        console.log('Planning view shown');
    }
    
    // Restore all planning view elements
    // restorePlanningViewElements(); // Function moved to bottom
    
    // CRITICAL: Remove ALL view-hidden classes from map elements
    const mapElements = [
        'map',
        'map-area', 
        'sidebar',
        'map-tabs',
        'map-toolbar',
        'chatbot-react-root'
    ];
    
    mapElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('view-hidden');
            element.style.display = 'block';
            element.style.visibility = 'visible';
            element.style.opacity = '1';
            console.log(`${elementId} restored and view-hidden removed`);
        }
    });
    
    // CRITICAL: Re-initialize the map completely
    if (map) {
        console.log('Destroying existing map...');
        map.remove(); // Remove existing map
        map = null;
    }
    
    // Wait a bit for DOM cleanup, then re-initialize
    setTimeout(async () => {
        console.log('Re-initializing map...');
        await initOpenStreetMap();
        
        // Restore map state if available
        if ((window as any).savedMapState) {
            const savedState = (window as any).savedMapState;
            if (map) {
                map.setView(savedState.center, savedState.zoom);
                console.log('Map state restored:', savedState.center, 'zoom:', savedState.zoom);
                
                // Force map update
                map.invalidateSize();
                setTimeout(() => map?.invalidateSize(), 100);
                setTimeout(() => map?.invalidateSize(), 300);
            }
        }
    }, 100);
    
    // Restore chatbot state if it was open
    if ((window as any).savedChatbotState && (window as any).savedChatbotState.open) {
        console.log('Restoring chatbot state...');
        // Trigger chatbot to open if it was previously open
        const chatbotButton = document.querySelector('#chatbot-react-root [aria-label="Zufahrtsschutz-Assistent öffnen"]');
        if (chatbotButton) {
            (chatbotButton as HTMLElement).click();
            console.log('Chatbot button clicked');
        }
    }
    
    showNotification('Planungs-Ansicht aktiviert - Map neu initialisiert', 'success');
    console.log('Planning view switch completed with map re-initialization');
}

// Function to show manufacturer view
function showManufacturerView() {
    // Clear any pinned product tooltips when switching views
    clearProductTooltips();
    
    // Save current map state before switching
    if (map) {
        (window as any).savedMapState = {
            center: map.getCenter(),
            zoom: map.getZoom(),
            waypoints: waypoints,
            drawnPolygon: drawnPolygon ? drawnPolygon.getLatLngs()[0] : null,
            waypointMarkers: waypointMarkers.length > 0,
            pathLine: pathLine !== null
        };
    }
    
    // Save chatbot state
    const chatbotPanel = document.querySelector('#chatbot-react-root aside[aria-label="Zufahrtsschutz-Assistent Panel"]');
    (window as any).savedChatbotState = {
        open: chatbotPanel && !chatbotPanel.classList.contains('hidden')
    };
    
    // Hide planning view completely
    const planningView = document.getElementById('planning-view');
    if (planningView) {
        (planningView as HTMLElement).style.display = 'none';
    }
    
    // Show manufacturer view as full page
    const manufacturerView = document.getElementById('manufacturer-view');
    if (manufacturerView) {
        (manufacturerView as HTMLElement).style.display = 'block';
        (manufacturerView as HTMLElement).style.position = 'relative';
        (manufacturerView as HTMLElement).style.width = '100%';
        (manufacturerView as HTMLElement).style.height = '100%';
        (manufacturerView as HTMLElement).style.zIndex = 'auto';
        (manufacturerView as HTMLElement).style.backgroundColor = 'transparent';
    }
    
    // Hide sidebar completely for manufacturer view
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) (sidebar as HTMLElement).style.display = 'none';
    
    // Hide map area completely for manufacturer view
    const mapArea = document.getElementById('map-area');
    if (mapArea) {
        mapArea.style.display = 'none';
        mapArea.style.visibility = 'hidden';
        mapArea.style.opacity = '0';
        mapArea.classList.add('view-hidden'); // CSS-Klasse hinzufügen
    }
    
    // Hide map container completely for manufacturer view
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.style.display = 'none';
        mapContainer.style.visibility = 'hidden';
        mapContainer.style.opacity = '0';
        mapContainer.classList.add('view-hidden'); // CSS-Klasse hinzufügen
    }
    
    // Hide map tabs and toolbar for manufacturer view
    const mapTabs = document.getElementById('map-tabs');
    const mapToolbar = document.getElementById('map-toolbar');
    if (mapTabs) {
        mapTabs.style.display = 'none';
        mapTabs.classList.add('view-hidden'); // CSS-Klasse hinzufügen
    }
    if (mapToolbar) {
        mapToolbar.style.display = 'none';
        mapToolbar.classList.add('view-hidden'); // CSS-Klasse hinzufügen
    }
    
    // Populate manufacturer sidebar with filters
    populateManufacturerSidebarWithFilters();
    
    // Translate manufacturer view after showing it
    setTimeout(() => {
        translateUI(); // Use the main translation function
    }, 50);
    
    showNotification('Hersteller-Ansicht aktiviert', 'success');
}

/**
 * Populate manufacturer sidebar with filter content
 */
function populateManufacturerSidebarWithFilters() {
    console.log('Populating manufacturer sidebar with filters...');
    
    const sidebar = document.querySelector('.manufacturer-sidebar');
    if (!sidebar) {
        console.warn('Manufacturer sidebar not found');
        return;
    }
    
    // Calculate real product counts
    const counts = calculateProductCounts();

    // Clear existing content
    sidebar.innerHTML = '';

    // Get German labels if current language is German
    const isGerman = currentLanguage === 'de';
    
    const labels = {
        vehicleMass: isGerman ? 'Fahrzeuggewicht (kg)' : 'Vehicle Mass (kg)',
        impactSpeed: isGerman ? 'Anprallgeschwindigkeit (km/h)' : 'Impact Speed (Km/h)',
        impactAngle: isGerman ? 'Anprallwinkel (°)' : 'Impact Angle (°)',
        penetrationDistance: isGerman ? 'Eindringtiefe (m)' : 'Penetration Distance (m)',
        standard: isGerman ? 'Standard' : 'Standard',
        foundation: isGerman ? 'Fundament' : 'Foundation',
        operation: isGerman ? 'Betrieb' : 'Operation',
        deployment: isGerman ? 'Einsatz' : 'Deployment',
        categories: isGerman ? 'Kategorien / VSB-Art' : 'Categories / Style of VSB',
        manufacturer: isGerman ? 'Hersteller' : 'Manufacturer',
        to: isGerman ? 'bis' : 'to',
        reset: isGerman ? 'Zurücksetzen' : 'Reset',
        allManufacturers: isGerman ? 'Alle Hersteller' : 'All Manufacturers'
    };

    // Create filter content that matches the existing sidebar style
    const filterContentHTML = `
        <section class="sidebar-section">
            <div class="filter-content">
            
        <!-- Vehicle Mass Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('vehicle-mass')">
                <label>${labels.vehicleMass}</label>
                <span class="dropdown-icon" id="vehicle-mass-icon">▼</span>
            </div>
            <div class="dropdown-content" id="vehicle-mass-content" style="display: none;">
                <div class="checkbox-group">
                    ${generateVehicleMassOptions(counts.vehicleMass)}
                </div>
            </div>
        </div>

            <!-- Impact Speed Filter -->
            <div class="form-group collapsible-range-group">
                <div class="range-header" onclick="toggleRangeInput('impact-speed')">
                    <label>${labels.impactSpeed}</label>
                    <span class="dropdown-icon" id="impact-speed-icon">▼</span>
                </div>
                <div class="range-content" id="impact-speed-content" style="display: none;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" id="min-speed" value="16" min="0" max="200" class="form-control" style="flex: 1;">
                        <span style="font-size: 12px; color: var(--secondary-text);">${labels.to}</span>
                        <input type="number" id="max-speed" value="112" min="0" max="200" class="form-control" style="flex: 1;">
                    </div>
                </div>
            </div>

            <!-- Impact Angle Filter -->
            <div class="form-group collapsible-range-group">
                <div class="range-header" onclick="toggleRangeInput('impact-angle')">
                    <label>${labels.impactAngle}</label>
                    <span class="dropdown-icon" id="impact-angle-icon">▼</span>
                </div>
                <div class="range-content" id="impact-angle-content" style="display: none;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" id="min-angle" value="15" min="0" max="180" class="form-control" style="flex: 1;">
                        <span style="font-size: 12px; color: var(--secondary-text);">${labels.to}</span>
                        <input type="number" id="max-angle" value="90" min="0" max="180" class="form-control" style="flex: 1;">
                    </div>
                </div>
            </div>

            <!-- Penetration Distance Filter -->
            <div class="form-group collapsible-range-group">
                <div class="range-header" onclick="toggleRangeInput('penetration-distance')">
                    <label>${labels.penetrationDistance}</label>
                    <span class="dropdown-icon" id="penetration-distance-icon">▼</span>
                </div>
                <div class="range-content" id="penetration-distance-content" style="display: none;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" id="min-distance" value="0" min="0" max="100" step="0.1" class="form-control" style="flex: 1;">
                        <span style="font-size: 12px; color: var(--secondary-text);">${labels.to}</span>
                        <input type="number" id="max-distance" value="60" min="0" max="100" step="0.1" class="form-control" style="flex: 1;">
                    </div>
                </div>
            </div>

        <!-- Standards Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('standards')">
                <label>${labels.standard}</label>
                <span class="dropdown-icon" id="standards-icon">▼</span>
            </div>
            <div class="dropdown-content" id="standards-content" style="display: none;">
                <div class="checkbox-group">
                    ${generateStandardOptions(counts.standard)}
                </div>
            </div>
        </div>

        <!-- Foundation Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('foundation')">
                <label>${labels.foundation}</label>
                <span class="dropdown-icon" id="foundation-icon">▼</span>
            </div>
            <div class="dropdown-content" id="foundation-content" style="display: none;">
                <div class="checkbox-group">
                    ${generateFoundationOptions(counts.foundation)}
                </div>
            </div>
        </div>

        <!-- Operation Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('operation')">
                <label>${labels.operation}</label>
                <span class="dropdown-icon" id="operation-icon">▼</span>
            </div>
            <div class="dropdown-content" id="operation-content" style="display: none;">
                <div class="checkbox-group">
                    ${generateOperationOptions(counts.operation)}
                </div>
            </div>
        </div>

        <!-- Deployment Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('deployment')">
                <label>${labels.deployment}</label>
                <span class="dropdown-icon" id="deployment-icon">▼</span>
            </div>
            <div class="dropdown-content" id="deployment-content" style="display: none;">
                <div class="checkbox-group">
                    ${generateDeploymentOptions(counts.deployment)}
                </div>
            </div>
        </div>

        <!-- Categories Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('categories')">
                <label>${labels.categories}</label>
                <span class="dropdown-icon" id="categories-icon">▼</span>
            </div>
            <div class="dropdown-content" id="categories-content" style="display: none;">
                <div class="hierarchical-checkbox">
                    ${generateCategoriesOptions(counts.category)}
                </div>
            </div>
        </div>

        <!-- Manufacturer Filter -->
        <div class="form-group collapsible-dropdown-group">
            <div class="dropdown-header" onclick="toggleDropdown('manufacturer')">
                <label>${labels.manufacturer}</label>
                <span class="dropdown-icon" id="manufacturer-icon">▼</span>
            </div>
            <div class="dropdown-content" id="manufacturer-content" style="display: none;">
                <select id="manufacturer-select" class="form-control">
                    <option value="">${labels.allManufacturers}</option>
                    ${generateManufacturerOptions(counts.manufacturer)}
                </select>
            </div>
        </div>
            
            <!-- Reset Button immediately below menu items -->
            <button id="reset-all-filters" class="reset-button" style="
                background: var(--accent-color);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                margin-top: 16px;
                width: 100%;
            ">${labels.reset}</button>
            </div>
        </section>
    `;

    sidebar.innerHTML = filterContentHTML;

    // Add event listeners
    setupFilterSidebarEvents();

    // Apply initial filters and display products
    setTimeout(() => {
        applyFiltersAndUpdateDisplay();
    }, 100);

    console.log('Manufacturer sidebar populated with filters successfully');
}

// Function to restore map state
function restoreMapState() {
    if (!(window as any).savedMapState) return;
    
    const state = (window as any).savedMapState;
    
    // For now, just restore the map view and zoom
    // The complex state restoration can be implemented later
    console.log('Restoring map state:', state);
    
    // Note: Full state restoration requires refactoring the drawing functions
    // to be accessible from this scope. For now, we just restore the view.
    
    // TODO: Implement full state restoration when needed
    return state; // Return state to indicate function was called
}

// Export function to prevent "unused" warning
(window as any).restoreMapState = restoreMapState;

// ===============================================
// PRODUCT DATABASE FUNCTIONS
// ===============================================

/**
 * Initialize the product database functionality
 */
function initProductDatabase() {
    console.log('🚀 INITIALIZING PRODUCT DATABASE...');
    
    // Apply translations to product database elements first
    translateProductDatabase();
    
    // Load product data
    console.log('🔍 About to call loadProductDatabase...');
    loadProductDatabase();
    
    // Initialize search and filter functionality
    initProductSearchAndFilters();
    
    // Initialize modal functionality
    initProductModal();
}

/**
 * Load the product database from the JSON file with optimizations
 */
async function loadProductDatabase() {
    // Show loading indicator
    const loadingIndicator = document.getElementById('products-loading');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
    
    try {
        // Use fetch without cache during development to ensure latest data
        const response = await fetch(`${import.meta.env.BASE_URL}product-database.json`, {
            cache: 'no-cache' // Disable cache to get latest data
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const products = await response.json();
        console.log('✅ Product database loaded:', products.length, 'products');
        
        // Store products globally with memory optimization
        (window as any).productDatabase = products;
        
        // Populate filters efficiently
        populateProductFilters(products);
        
        // Display products with optimized rendering
        displayProducts(products);
        
        // Hide loading indicator
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        // Re-apply translations to ensure all elements are properly translated
        translateProductDatabase();
        
        // Initialize view toggle after products are loaded
        // This ensures the correct initial view is set
        setTimeout(() => {
            const toggleBtn = document.getElementById('toggle-view-btn');
            if (toggleBtn) {
                setView('grid'); // Set initial view to grid (Kachelansicht)
            }
            // Initialize filter system AFTER products are loaded and displayed
            initializeFilterSystem();
        }, 100);
        
    } catch (error) {
        console.error('Error loading product database:', error);
        showNotification('Fehler beim Laden der Produktdatenbank', 'error');
        
        // Show error message
        const noProducts = document.getElementById('no-products');
        if (noProducts) {
            noProducts.style.display = 'block';
            noProducts.textContent = 'Fehler beim Laden der Produktdatenbank';
        }
    }
}

/**
 * Populate the filter dropdowns with unique values from the product database
 */
function populateProductFilters(products: any[]) {
    // Manufacturer filter - count products per manufacturer and sort alphabetically
    const manufacturerFilter = document.getElementById('manufacturer-filter') as HTMLSelectElement;
    if (manufacturerFilter) {
        // Clear existing options except the first "Alle Hersteller" option
        while (manufacturerFilter.options.length > 1) {
            manufacturerFilter.remove(1);
        }
        
        // Count products per manufacturer
        const manufacturerCounts: { [key: string]: number } = {};
        products.forEach(p => {
            if (p.manufacturer) {
                manufacturerCounts[p.manufacturer] = (manufacturerCounts[p.manufacturer] || 0) + 1;
            }
        });
        
        // Sort manufacturers alphabetically (case-insensitive)
        const sortedManufacturers = Object.entries(manufacturerCounts)
            .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
        
        // Add options with count
        sortedManufacturers.forEach(([manufacturer, count]) => {
            const option = document.createElement('option');
            option.value = manufacturer;
            option.textContent = `${manufacturer} (${count})`;
            manufacturerFilter.appendChild(option);
        });
        
        console.log(`Populated manufacturer filter with ${sortedManufacturers.length} manufacturers`);
    }
    
    // Standard filter (NEW DATABASE STRUCTURE)
    const standardFilter = document.getElementById('standard-filter') as HTMLSelectElement;
    if (standardFilter) {
        // Clear existing options except the first "Alle Standards" option
        while (standardFilter.options.length > 1) {
            standardFilter.remove(1);
        }
        
        // Count products per standard
        const standardCounts: { [key: string]: number } = {};
        products.forEach(p => {
            const standard = p.technical_data?.standard;
            if (standard) {
                standardCounts[standard] = (standardCounts[standard] || 0) + 1;
            }
        });
        
        // Sort standards alphabetically
        const sortedStandards = Object.entries(standardCounts)
            .sort((a, b) => a[0].localeCompare(b[0]));
        
        sortedStandards.forEach(([standard, count]) => {
            const option = document.createElement('option');
            option.value = standard;
            option.textContent = `${standard} (${count})`;
            standardFilter.appendChild(option);
        });
    }
    
    // Material filter (NEW DATABASE STRUCTURE - replacing vehicle type)
    const vehicleTypeFilter = document.getElementById('vehicle-type-filter') as HTMLSelectElement;
    if (vehicleTypeFilter) {
        // Clear existing options except the first option
        while (vehicleTypeFilter.options.length > 1) {
            vehicleTypeFilter.remove(1);
        }
        
        // Count products per material
        const materialCounts: { [key: string]: number } = {};
        products.forEach(p => {
            const material = p.technical_data?.material;
            if (material) {
                materialCounts[material] = (materialCounts[material] || 0) + 1;
            }
        });
        
        // Sort materials alphabetically
        const sortedMaterials = Object.entries(materialCounts)
            .sort((a, b) => a[0].localeCompare(b[0]));
        
        sortedMaterials.forEach(([material, count]) => {
            const option = document.createElement('option');
            option.value = material;
            option.textContent = `${material} (${count})`;
            vehicleTypeFilter.appendChild(option);
        });
    }
}

/**
 * Display products in the table - optimized to prevent flickering
 */
function displayProducts(products: any[]) {
    // Display in table view (synchronous)
    displayProductsTable(products);
    
    // Display in grid view (synchronous with debounce)
    displayProductsGrid(products);
}

/**
 * Display products in table format
 */
function displayProductsTable(products: any[]) {
    console.log('displayProductsTable called with', products.length, 'products');
    const tbody = document.getElementById('products-tbody');
    if (!tbody) {
        console.error('products-tbody not found');
        return;
    }
    
    console.log('Clearing tbody and adding', products.length, 'rows');
    tbody.innerHTML = '';
    
    if (products.length === 0) {
        console.log('No products to display');
        const noProducts = document.getElementById('no-products');
        if (noProducts) {
            noProducts.style.display = 'block';
        }
        return;
    }
    
    // Hide no products message
    const noProducts = document.getElementById('no-products');
    if (noProducts) {
        noProducts.style.display = 'none';
    }
    
    // Clean products before displaying in table
    const cleanedProducts = removeDuplicateProducts(products);
    
    cleanedProducts.forEach((product, index) => {
        const row = document.createElement('tr');
        // Get confidence indicator
        const confidence = product.product_type_confidence || 0;
        const confidenceIcon = confidence >= 0.9 ? '🟢' : 
                              confidence >= 0.7 ? '🟡' : 
                              confidence >= 0.5 ? '🟠' : '🔴';
        
        row.innerHTML = `
            <td>${product.manufacturer || 'N/A'}</td>
            <td>${product.product_name || 'N/A'}</td>
            <td><span title="Produkttyp: ${product.product_type || 'N/A'}">${product.product_type || 'N/A'}</span></td>
            <td><span title="Cluster: ${product.product_cluster || 'N/A'}">${product.product_cluster || 'N/A'}</span></td>
            <td><span title="Vertrauen: ${(confidence * 100).toFixed(0)}%">${confidenceIcon} ${(confidence * 100).toFixed(0)}%</span></td>
            <td>${product.technical_data?.standard || 'N/A'}</td>
            <td>${product.technical_data?.pr_mass_kg || 'N/A'}</td>
            <td>${product.technical_data?.pr_veh || 'N/A'}</td>
            <td>${product.technical_data?.pr_speed_kph || 'N/A'}</td>
            <td>${product.technical_data?.pr_angle_deg || 'N/A'}</td>
            <td>${product.technical_data?.pr_pen_m || 'N/A'}</td>
            <td>${product.technical_data?.pr_debris_m || 'N/A'}</td>
            <td>
                <button class="view-details-btn" data-product-index="${index}">
                    ${t('manufacturer.sidebar.productDatabase.viewDetails')}
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    console.log('Added', cleanedProducts.length, 'rows to table');
    
    // Add click event listeners to view details buttons
    const viewButtons = tbody.querySelectorAll('.view-details-btn');
    viewButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const cleanedIndex = parseInt(target.getAttribute('data-product-index') || '0');
            // Find the original index in the full product database
            const product = cleanedProducts[cleanedIndex];
            const originalProducts = (window as any).productDatabase || [];
            const originalIndex = originalProducts.findIndex((p: any) => 
                p.manufacturer === product.manufacturer && p.product_name === product.product_name
            );
            showProductDetails(originalIndex >= 0 ? originalIndex : cleanedIndex);
        });
    });
}

// Debounce timer for displayProductsGrid to prevent flickering
let displayGridDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastDisplayedProductsHash: string = '';

/**
 * Display products in grid format - optimized to prevent flickering
 */
function displayProductsGrid(products: any[]) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    
    // Cancel any pending debounced render
    if (displayGridDebounceTimer) {
        clearTimeout(displayGridDebounceTimer);
    }
    
    // Create a simple hash to check if products changed
    const productsHash = products.length + '_' + (products[0]?.product_name || '') + '_' + (products[products.length - 1]?.product_name || '');
    
    // Skip if products haven't changed
    if (productsHash === lastDisplayedProductsHash && grid.children.length > 0) {
        return;
    }
    
    // Use requestAnimationFrame for smoother rendering
    displayGridDebounceTimer = setTimeout(() => {
        requestAnimationFrame(() => {
            renderProductGrid(products, grid);
            lastDisplayedProductsHash = productsHash;
        });
    }, 50); // Small debounce to batch rapid filter changes
}

/**
 * Actually render the product grid - called after debounce
 */
function renderProductGrid(products: any[], grid: HTMLElement) {
    grid.innerHTML = '';
    
    if (products.length === 0) {
        const noProductsGrid = document.getElementById('no-products-grid');
        if (noProductsGrid) {
            noProductsGrid.style.display = 'block';
        }
        return;
    }
    
    // Hide no products message
    const noProductsGrid = document.getElementById('no-products-grid');
    if (noProductsGrid) {
        noProductsGrid.style.display = 'none';
    }
    
    // Get translated labels for product cards
    const isGerman = currentLanguage === 'de';
    const cardLabels = {
        noImageAvailable: isGerman ? 'Kein Bild verfügbar' : 'No image available',
        standard: 'Standard',
        testSpeed: isGerman ? 'Testgeschwindigkeit' : 'Test Speed',
        vehicleType: isGerman ? 'Fahrzeugtyp' : 'Vehicle Type',
        impactAngle: isGerman ? 'Anprallwinkel' : 'Impact Angle',
        penetrationDepth: isGerman ? 'Eindringtiefe' : 'Penetration Depth',
        viewDetails: isGerman ? 'Details anzeigen' : 'View Details'
    };
    
    // First, remove duplicates and invalid products
    const cleanedProducts = removeDuplicateProducts(products);
    
    // Sort products: products with database images first (synchronous - no flickering)
    const sortedProducts = sortProductsByImageAvailability(cleanedProducts);
    
    // Debug: Log first few products to see sorting
    console.log('First 5 products after sorting:', sortedProducts.slice(0, 5).map(p => ({
        product_name: p.product_name,
        hasRealImage: p.hasRealImage,
        manufacturer: p.manufacturer
    })));
    
    // Debug: Count products with and without real images
    const productsWithImages = sortedProducts.filter(p => p.hasRealImage);
    const productsWithoutImages = sortedProducts.filter(p => !p.hasRealImage);
    console.log(`Products WITH real images: ${productsWithImages.length}, WITHOUT real images: ${productsWithoutImages.length}, total: ${sortedProducts.length}`);
    
    sortedProducts.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Generate product image path based on product type
        const productImage = generateProductImagePath(product);
        console.log(`🖼️ Product ${index + 1}: ${product.product_name} -> Image: ${productImage}`);
        
        // Check if product actually has a real image
        const hasValidType = product.hasRealImage;
        console.log(`🖼️ Product ${index + 1} has real image: ${hasValidType}`);
        
        // Add special class for first 20 products with valid types
        if (hasValidType && index < 20) {
            card.className = 'product-card product-card-priority';
        }
        

        
        card.innerHTML = `
            <div class="product-card-image ${!hasValidType ? 'no-image' : ''}">
                <img src="${productImage}" alt="${product.product_name || 'Produkt'}" 
                     loading="lazy" decoding="async"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                     class="product-image">
                <div class="product-image-placeholder" style="display: none;">
                    <i class="fas fa-image"></i>
                    <span>${cardLabels.noImageAvailable}</span>
                </div>
            </div>
            <div class="product-card-content">
                <div class="product-card-header">
                    <div class="product-card-title">${product.product_name || 'N/A'}</div>
                    <div class="product-card-manufacturer">${product.manufacturer || 'N/A'}</div>
                </div>
                <!-- Kategorisierung ausgeblendet / Classification hidden -->
                <div class="product-card-specs">
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${cardLabels.standard}</div>
                        <div class="product-card-spec-value">${product.technical_data?.standard || 'N/A'}</div>
                    </div>
                    <div class="product-card-spec highlight-speed">
                        <div class="product-card-spec-label">${cardLabels.testSpeed}</div>
                        <div class="product-card-spec-value"><strong>${product.technical_data?.pr_speed_kph || 'N/A'} km/h</strong></div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${cardLabels.vehicleType}</div>
                        <div class="product-card-spec-value">${product.technical_data?.pr_veh || 'N/A'}</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${cardLabels.impactAngle}</div>
                        <div class="product-card-spec-value">${product.technical_data?.pr_angle_deg || 'N/A'}°</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${cardLabels.penetrationDepth}</div>
                        <div class="product-card-spec-value">${product.technical_data?.pr_pen_m || 'N/A'} m</div>
                    </div>
                </div>
                <div class="product-card-actions">
                    <button class="product-card-btn secondary" data-product-index="${index}">
                        ${cardLabels.viewDetails}
                    </button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
    
    // Add click event listeners to product cards
    const productCards = grid.querySelectorAll('.product-card');
    productCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('product-card-btn')) {
                const sortedIndex = parseInt(target.getAttribute('data-product-index') || '0');
                // Find the original index in the full product database
                const product = sortedProducts[sortedIndex];
                const originalProducts = (window as any).productDatabase || [];
                const originalIndex = originalProducts.findIndex((p: any) => 
                    p.manufacturer === product.manufacturer && p.product_name === product.product_name
                );
                showProductDetails(originalIndex >= 0 ? originalIndex : sortedIndex);
            }
        });
    });
}

/**
 * Remove duplicate products and filter out invalid entries
 */
function removeDuplicateProducts(products: any[]): any[] {
    console.log('Removing duplicates from', products.length, 'products');
    
    // Filter out products with empty or missing product names (NEW DATABASE STRUCTURE)
    const validProducts = products.filter((product: any) => {
        const hasProductName = product.product_name && product.product_name.trim() !== '';
        const hasManufacturer = product.manufacturer && product.manufacturer.trim() !== '';
        
        if (!hasProductName) {
            console.log('🔍 Filtering out product with empty product_name:', {
                product_name: product.product_name,
                manufacturer: product.manufacturer,
                keys: Object.keys(product),
                fullProduct: product
            });
        }
        if (!hasManufacturer) {
            console.log('Filtering out product with empty manufacturer:', product);
        }
        
        return hasProductName && hasManufacturer;
    });
    
    console.log('Valid products after filtering:', validProducts.length);
    
            // Remove duplicates based on manufacturer + product_name combination (NEW DATABASE STRUCTURE)
        const uniqueProducts = validProducts.filter((product: any, index: number, array: any[]) => {
            const key = `${product.manufacturer.trim()}|${product.product_name.trim()}`;
            const isDuplicate = array.findIndex((p: any) => `${p.manufacturer.trim()}|${p.product_name.trim()}` === key) !== index;
            return !isDuplicate;
        });
        
        // Minimal logging for production
        if (import.meta.env.DEV) {
            console.log('Unique products after deduplication:', uniqueProducts.length);
            console.log('Removed', products.length - uniqueProducts.length, 'duplicates and invalid entries');
        }
    
    return uniqueProducts;
}

/**
 * Sort products by image availability - optimized synchronous version
 * Uses database metadata (product_image_file) for instant sorting without async image loading
 * This prevents flickering by avoiding multiple DOM re-renders during async operations
 */
function sortProductsByImageAvailability(products: any[]): any[] {
    // Use synchronous sorting based on database metadata (product_image_file field)
    const productsWithImageStatus = products.map((product) => {
        const hasDatabaseFilename = product.product_image_file && 
            product.product_image_file !== null && 
            product.product_image_file.trim() !== '' &&
            product.product_image_file !== 'N/A';
        
        return {
            ...product,
            hasRealImage: hasDatabaseFilename,
            hasDatabaseFilename: hasDatabaseFilename
        };
    });
    
    // Sort by priority: Products with database image filename first
    return productsWithImageStatus.sort((a: any, b: any) => {
        if (a.hasDatabaseFilename && !b.hasDatabaseFilename) return -1;
        if (!a.hasDatabaseFilename && b.hasDatabaseFilename) return 1;
        return 0;
    });
}



/**
 * Generate product image path based on product_image_file or product name (NEW DATABASE STRUCTURE)
 */
function generateProductImagePath(product: any): string {
    console.log('🖼️ === GENERATING IMAGE PATH ===');
    console.log('🖼️ Product:', {
        name: product.product_name,
        manufacturer: product.manufacturer,
        image_file: product.product_image_file
    });
    console.log('🖼️ BASE_URL:', import.meta.env.BASE_URL);

    // Priority 1: Use product_image_file if available (NEW DATABASE STRUCTURE)
    if (product.product_image_file && product.product_image_file !== null && product.product_image_file.trim() !== '') {
        // Handle both absolute paths (/images/file.jpg) and relative paths (file.jpg)
        let imageFromDatabase: string;
        if (product.product_image_file.startsWith('/images/')) {
            // Already has /images/ prefix, just prepend BASE_URL (handle trailing slash)
            const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
                ? import.meta.env.BASE_URL 
                : `${import.meta.env.BASE_URL}/`;
            imageFromDatabase = `${baseUrl}${product.product_image_file.slice(1)}`; // slice(1) removes leading /
        } else {
            // Relative path, prepend BASE_URL and images/
            imageFromDatabase = `${import.meta.env.BASE_URL}images/${product.product_image_file}`;
        }
        console.log('🖼️ ✅ Using database image file:', product.product_image_file);
        console.log('🖼️ ✅ Full image path from database:', imageFromDatabase);
        
        // Test if image exists by creating a test image element
        const testImg = new Image();
        testImg.onload = () => console.log('🖼️ ✅ Image exists and loaded:', imageFromDatabase);
        testImg.onerror = () => console.log('🖼️ ❌ Image failed to load:', imageFromDatabase);
        testImg.src = imageFromDatabase;
        
        return imageFromDatabase;
    }
    
    // Priority 2: Fallback to product name-based naming if no database filename
    if (!product.product_name || product.product_name === '') {
        const defaultPath = `${import.meta.env.BASE_URL}images/default_product_img01.jpg`;
        console.log('Using default image path:', defaultPath);
        return defaultPath;
    }
    
    // Clean product name for filename matching
    let cleanName = product.product_name
        .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special characters except spaces, hyphens, underscores
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[_-]+/g, '_') // Replace multiple hyphens/underscores with single
        .trim();
    
    console.log('Original product name:', product.product_name);
    console.log('Cleaned product name:', cleanName);
    console.log('No product_image_file found, using name-based fallback');
    
    // Try different image naming patterns
    const imagePatterns = [
        `${cleanName}_img01.jpg`,
        `${cleanName}_img02.jpg`,
        `${cleanName}_img03.jpg`,
        `${cleanName}.jpg`,
        `${cleanName}_01.jpg`,
        `${cleanName}_02.jpg`
    ];
    
    // Return the first pattern (we'll let the browser handle 404s)
    const finalPath = `${import.meta.env.BASE_URL}images/${imagePatterns[0]}`;
    console.log('Final image path (name-based):', finalPath);
    console.log('Available patterns:', imagePatterns);
    
    return finalPath;
}

/**
 * Initialize search and filter functionality
 */
function initProductSearchAndFilters() {
    const searchInput = document.getElementById('product-search') as HTMLInputElement;
    const searchBtn = document.getElementById('search-btn');
    const manufacturerFilter = document.getElementById('manufacturer-filter') as HTMLSelectElement;
    const standardFilter = document.getElementById('standard-filter') as HTMLSelectElement;
    const vehicleTypeFilter = document.getElementById('vehicle-type-filter') as HTMLSelectElement;
    
    if (searchInput) {
        searchInput.addEventListener('input', filterProducts);
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', filterProducts);
    }
    
    if (manufacturerFilter) {
        manufacturerFilter.addEventListener('change', filterProducts);
    }
    
    if (standardFilter) {
        standardFilter.addEventListener('change', filterProducts);
    }
    
    if (vehicleTypeFilter) {
        vehicleTypeFilter.addEventListener('change', filterProducts);
    }
    
    // Speed filter
    const speedFilter = document.getElementById('speed-filter');
    if (speedFilter) {
        speedFilter.addEventListener('change', filterProducts);
    }
    
    // NOTE: Planning parameters (productPropertySelect, vehicleSelect) do NOT trigger filterProducts
    // They are only used in the planning view, not in the manufacturer product database view
    // The filterProducts function only applies the visible filters in the manufacturer view
    
    // Initialize view toggle functionality
    initViewToggle();
}

/**
 * Initialize view toggle functionality
 */
function initViewToggle() {
    console.log('initViewToggle called');
    const toggleBtn = document.getElementById('toggle-view-btn');
    if (!toggleBtn) {
        console.error('Toggle button not found in initViewToggle');
        return;
    }
    
    console.log('Toggle button found, adding click listener');
    toggleBtn.addEventListener('click', toggleView);
    
    // Set initial view to grid (Kachelansicht)
    console.log('Setting initial view to grid');
    setView('grid');
}

/**
 * Toggle between table and grid view
 */
function toggleView() {
    console.log('toggleView called');
    const toggleBtn = document.getElementById('toggle-view-btn');
    if (!toggleBtn) {
        console.error('Toggle button not found');
        return;
    }
    
    const currentView = toggleBtn.getAttribute('data-view');
    console.log('Current view:', currentView);
    const newView = currentView === 'table' ? 'grid' : 'table';
    console.log('Switching to view:', newView);
    
    setView(newView);
}

/**
 * Set the current view (table or grid)
 */
function setView(view: 'table' | 'grid') {
    console.log('setView called with:', view);
    const toggleBtn = document.getElementById('toggle-view-btn');
    const tableContainer = document.getElementById('products-table-container');
    const gridContainer = document.getElementById('products-grid-container');
    
    console.log('Elements found:', {
        toggleBtn: !!toggleBtn,
        tableContainer: !!tableContainer,
        gridContainer: !!gridContainer
    });
    
    if (!toggleBtn || !tableContainer || !gridContainer) {
        console.error('Required elements not found');
        return;
    }
    
    // Update button state
    toggleBtn.setAttribute('data-view', view);
    console.log('Button data-view updated to:', view);
    
    // Update button text and icon
    const buttonText = toggleBtn.querySelector('span');
    const buttonIcon = toggleBtn.querySelector('i');
    
    if (view === 'grid') {
        console.log('Switching to grid view');
        // Show grid, hide table
        tableContainer.style.display = 'none';
        gridContainer.style.display = 'block';
        
        // Update button to show "back to table"
        if (buttonText) buttonText.textContent = t('manufacturer.sidebar.productDatabase.toggleToTable');
        if (buttonIcon) buttonIcon.className = 'fas fa-table';
    } else {
        console.log('Switching to table view');
        // Show table, hide grid
        tableContainer.style.display = 'block';
        gridContainer.style.display = 'none';
        
        // Ensure table is visible and has data
        const productsTable = document.getElementById('products-table');
        if (productsTable) {
            productsTable.style.display = 'table';
            console.log('Table display set to table');
        }
        
        // Update button to show "back to grid"
        if (buttonText) buttonText.textContent = t('manufacturer.sidebar.productDatabase.toggleToGrid');
        if (buttonIcon) buttonIcon.className = 'fas fa-th-large';
        
        console.log('Table view activated, table should be visible now');
    }
    
    console.log('View switch completed');
}

// Debounce timer for filter operations to prevent rapid re-renders
let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
// Store last search term to detect actual changes
let lastSearchTerm: string = '';
// Flag to prevent filter from running during initialization
let filterInitialized: boolean = false;

/**
 * Normalize text for search - handles special characters (ö, ä, ü etc.)
 */
function normalizeSearchText(text: string): string {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/ö/g, 'o').replace(/ä/g, 'a').replace(/ü/g, 'u')
        .replace(/ß/g, 'ss');
}

/**
 * Filter products based on search input and filter selections
 * This is the MAIN filter function for the manufacturer view
 */
function filterProducts() {
    // Don't run filter until initialization is complete
    if (!filterInitialized) {
        console.log('⏳ Filter skipped - not yet initialized');
        return;
    }
    
    // Cancel any pending filter operation
    if (filterDebounceTimer) {
        clearTimeout(filterDebounceTimer);
    }
    
    // Debounce filter to prevent rapid re-renders
    filterDebounceTimer = setTimeout(() => {
        executeFilterProducts();
    }, 150);
}

/**
 * Execute the actual filter logic - called after debounce
 * This delegates to applyFiltersAndUpdateDisplay to combine all filter systems
 */
function executeFilterProducts() {
    // Delegate to the combined filter function
    applyFiltersAndUpdateDisplay();
}

/**
 * Initialize filter system - call this after products are loaded
 */
function initializeFilterSystem() {
    filterInitialized = true;
    console.log('✅ Filter system initialized');
}

/**
 * Get maximum detected speed from threat analysis
 */
function getMaxDetectedSpeed(): number {
    if (threatsMap.size === 0) return 0;
    
    let maxSpeed = 0;
    threatsMap.forEach((threatData) => {
        if (threatData.maxSpeed && threatData.maxSpeed > maxSpeed) {
            maxSpeed = threatData.maxSpeed;
        }
    });
    
    return maxSpeed;
}

/**
 * Apply translations to product database elements
 */
function translateProductDatabase() {
    console.log('Translating product database elements...');
    
    // This function is now DEPRECATED since all elements use data-translate-key
    // The translateManufacturerView() function handles all translations automatically
    // We keep this function for backward compatibility but it does nothing
    
    console.log('Product database elements now use automatic translation via data-translate-key');
}

/**
 * Initialize product modal functionality
 */
function initProductModal() {
    const closeModalBtn = document.getElementById('close-modal');
    const exportBtn = document.getElementById('export-product');
    const printBtn = document.getElementById('print-product');
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('product-modal');
            if (modal) {
                modal.style.display = 'none';
                // Clear stored product index
                (modal as any).currentProductIndex = undefined;
            }
        });
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', exportProductData);
    }
    
    if (printBtn) {
        printBtn.addEventListener('click', printProductSpecs);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                // Clear stored product index
                (modal as any).currentProductIndex = undefined;
            }
        });
    }
}

/**
 * Show product details in modal - with full translation support
 */
function showProductDetails(productIndex: number) {
    const products = (window as any).productDatabase || [];
    const product = products[productIndex];
    
    if (!product) return;
    
    // Get translations for modal labels
    const isGerman = currentLanguage === 'de';
    const labels = {
        productName: isGerman ? 'Produktname' : 'Product Name',
        standardTestedTo: isGerman ? 'Standard getestet nach' : 'Standard Tested To',
        downloadDate: isGerman ? 'Download Datum' : 'Download Date',
        productClassification: isGerman ? 'Produktklassifizierung' : 'Product Classification',
        productType: isGerman ? 'Produkttyp' : 'Product Type',
        cluster: 'Cluster',
        confidenceValue: isGerman ? 'Vertrauenswert' : 'Confidence Value',
        detectionSource: isGerman ? 'Erkennungsquelle' : 'Detection Source',
        testParameters: isGerman ? 'Testparameter' : 'Test Parameters',
        vehicleWeight: isGerman ? 'Fahrzeuggewicht' : 'Vehicle Weight',
        vehicleType: isGerman ? 'Fahrzeugtyp' : 'Vehicle Type',
        testSpeed: isGerman ? 'Testgeschwindigkeit' : 'Test Speed',
        impactAngle: isGerman ? 'Anprallwinkel' : 'Impact Angle',
        penetrationDepth: isGerman ? 'Eindringtiefe' : 'Penetration Depth',
        debrisSpread: isGerman ? 'Trümmerstreuweite' : 'Debris Spread',
        datasheetUrl: isGerman ? 'Datenblatt URL' : 'Datasheet URL',
        productImage: isGerman ? 'Produktbild' : 'Product Image'
    };
    
    // Update modal content
    const modalProductName = document.getElementById('modal-product-name');
    if (modalProductName) {
        modalProductName.textContent = `${product.manufacturer} - ${product.product_name}`;
    }
    
    // Technical specifications
    const technicalSpecs = document.getElementById('modal-technical-specs');
    if (technicalSpecs) {
        technicalSpecs.innerHTML = `
            <p><strong>${t('manufacturer.sidebar.productDatabase.manufacturer')}:</strong> ${product.manufacturer || 'N/A'}</p>
            <p><strong>${labels.productName}:</strong> ${product.product_name || 'N/A'}</p>
            <p><strong>${t('manufacturer.sidebar.productDatabase.standard')}:</strong> ${product.technical_data?.standard || 'N/A'}</p>
            <p><strong>${t('manufacturer.sidebar.productDatabase.dimensions')}:</strong> ${product.technical_data?.dimensions || 'N/A'}</p>
            <p><strong>${t('manufacturer.sidebar.productDatabase.material')}:</strong> ${product.technical_data?.material || 'N/A'}</p>
        `;
    }
    
    // Performance data
    const performanceData = document.getElementById('modal-performance-data');
    if (performanceData) {
        performanceData.innerHTML = `
            <p><strong>${t('manufacturer.sidebar.productDatabase.performance')}:</strong> ${product.technical_data?.performance_rating || 'N/A'}</p>
            <p><strong>${t('manufacturer.sidebar.productDatabase.foundation')}:</strong> ${product.technical_data?.foundation_depth || 'N/A'}</p>
            <p><strong>${labels.standardTestedTo}:</strong> ${product.technical_data?.standard_tested_to || 'N/A'}</p>
            <p><strong>${labels.downloadDate}:</strong> ${product.technical_data?.download_date || 'N/A'}</p>
            <div style="margin-top: 20px; padding: 15px; background-color: rgba(30, 144, 255, 0.15); border-radius: 8px; border: 1px solid rgba(30, 144, 255, 0.3);">
                <h4 style="margin-bottom: 12px; color: #1e90ff;">🏷️ ${labels.productClassification}</h4>
                <p><strong>${labels.productType}:</strong> ${product.product_type || 'N/A'}</p>
                <p><strong>${labels.cluster}:</strong> ${product.product_cluster || 'N/A'}</p>
                <p><strong>${labels.confidenceValue}:</strong> ${product.product_type_confidence ? (product.product_type_confidence * 100).toFixed(0) + '%' : 'N/A'}</p>
                <p><strong>${labels.detectionSource}:</strong> ${product.product_type_source || 'N/A'}</p>
            </div>
            <div style="margin-top: 20px; padding: 15px; background-color: rgba(255, 193, 7, 0.15); border-radius: 8px; border: 1px solid rgba(255, 193, 7, 0.3);">
                <h4 style="margin-bottom: 12px; color: #ffc107;">⚡ ${labels.testParameters}</h4>
                <p><strong>${labels.vehicleWeight}:</strong> ${product.technical_data?.pr_mass_kg || 'N/A'} kg</p>
                <p><strong>${labels.vehicleType}:</strong> ${product.technical_data?.pr_veh || 'N/A'}</p>
                <p><strong>${labels.testSpeed}:</strong> ${product.technical_data?.pr_speed_kph || 'N/A'} km/h</p>
                <p><strong>${labels.impactAngle}:</strong> ${product.technical_data?.pr_angle_deg || 'N/A'}°</p>
                <p><strong>${labels.penetrationDepth}:</strong> ${product.technical_data?.pr_pen_m || 'N/A'} m</p>
                <p><strong>${labels.debrisSpread}:</strong> ${product.technical_data?.pr_debris_m || 'N/A'} m</p>
            </div>
        `;
    }
    
    // Certification
    const certification = document.getElementById('modal-certification');
    if (certification) {
        certification.innerHTML = `
            <p><strong>${t('manufacturer.sidebar.productDatabase.standard')}:</strong> ${product.technical_data?.standard || 'N/A'}</p>
            <p><strong>${labels.datasheetUrl}:</strong> ${product.datasheet_url ? `<a href="${product.datasheet_url}" target="_blank" style="color: #1e90ff;">${product.datasheet_url}</a>` : 'N/A'}</p>
            <p><strong>${labels.productImage}:</strong> ${product.product_image_file || 'N/A'}</p>
        `;
    }
    
    // Show modal
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Store current product index for language switching
        (modal as any).currentProductIndex = productIndex;
        
        // Translate modal section headings
        const sectionHeadings = modal.querySelectorAll('[data-translate-key]');
        sectionHeadings.forEach(element => {
            const key = element.getAttribute('data-translate-key');
            if (key) {
                const translatedText = t(key);
                if (translatedText && translatedText !== key) {
                    element.textContent = translatedText;
                }
            }
        });
        
        // Translate modal buttons
        const exportBtn = modal.querySelector('[data-translate-key="manufacturer.sidebar.productDatabase.modal.exportData"]');
        if (exportBtn) {
            exportBtn.textContent = t('manufacturer.sidebar.productDatabase.modal.exportData');
        }
        const printBtn = modal.querySelector('[data-translate-key="manufacturer.sidebar.productDatabase.modal.printSpecs"]');
        if (printBtn) {
            printBtn.textContent = t('manufacturer.sidebar.productDatabase.modal.printSpecs');
        }
    }
}

/**
 * Export product data
 */
function exportProductData() {
    // Implementation for exporting product data
    showNotification('Export-Funktionalität wird implementiert...', 'info');
}

/**
 * Print product specifications
 */
function printProductSpecs() {
    // Implementation for printing product specifications
    showNotification('Druck-Funktionalität wird implementiert...', 'info');
}

// Helper function to show notifications
function showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `custom-notification custom-notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'info' ? '#2563eb' : type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : '#ef4444'};
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 400px;
        font-family: 'Open Sans', sans-serif;
        font-size: 14px;
        line-height: 1.4;
    `;
    
    document.body.appendChild(notification);
    
    // Add close button functionality
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => notification.remove());
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

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
    // Always use embedded translations to avoid any loading issues
    const translationSource = embeddedTranslations[currentLanguage as keyof typeof embeddedTranslations];
    
    if (!translationSource) {
        console.warn(`No translations for language: ${currentLanguage}`);
        return key;
    }
    
    let text = getProperty(translationSource, key);
    
    // If not found, return the key
    if (typeof text !== 'string') {
        console.warn(`Translation key not found: ${key}`);
        return key;
    }
    
    // Replace placeholders
    if (replacements) {
        for (const placeholder in replacements) {
            text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(replacements[placeholder]));
        }
    }
    
    return text;
}

/**
 * Provides fallback text for missing translation keys
 * @param key The missing translation key
 * @returns A user-friendly fallback text or null
 */
function getFallbackText(key: string): string | null {
    const fallbackMap: { [key: string]: string } = {
        'sidebar.trafficData': 'Parameterwahl',
        'sidebar.vehicleSelect': 'Fahrzeugauswahl',
        'sidebar.accessRoads': 'Zufahrten',
        'sidebar.curbs': 'Bordsteinkanten',
        'sidebar.obstacles': 'Hindernisse',
        'sidebar.protectionSelection': 'Schutzauswahl',
        'sidebar.protectionPeriod': 'Schutzzeitraum',
        'sidebar.protectionProducts': 'Schutzprodukte',
        'sidebar.productProperty': 'Produkteigenschaft',
        'sidebar.riskAssessment': 'Risikobewertung',
        'sidebar.assetToProtect': 'Was geschützt werden soll',
        'sidebar.securityRisk': 'Sicherheitsrisiko',
        'sidebar.recommendedProductClass': 'Empfohlene Produktklasse',
        'sidebar.low': 'niedrig',
        'sidebar.high': 'hoch',
        'nav.paramInput': 'Parameter',
        'nav.markingArea': 'Sicherheitsbereich',
        'nav.threatAnalysis': 'Zufahrtanalyse',
        'nav.riskReport': 'Risikobericht',
        'nav.productSelection': 'Produktauswahl',
        'nav.projectDescription': 'Ausschreibung',
        'header.planning': 'Planung',
        'header.manufacturer': 'Hersteller'
    };
    
    return fallbackMap[key] || null;
}

/**
 * Applies the current language's translations to all tagged DOM elements.
 */
async function translateUI() {
    console.log('Starting UI translation...');
    
    if (!translations[currentLanguage]) {
        console.warn(`No translations for language '${currentLanguage}', attempting to load...`);
        await loadTranslations();
        
        if (!translations[currentLanguage]) {
            console.error(`Failed to load translations for language '${currentLanguage}'`);
            return;
        }
    }
    
    let translatedElements = 0;
    let failedElements = 0;
    
    // First, translate all elements with data-translate-key
    document.querySelectorAll('[data-translate-key]').forEach(element => {
        try {
            const key = element.getAttribute('data-translate-key')!;
            const translatedText = t(key);
            
            if (translatedText && translatedText !== key) {
                if (element.hasAttribute('placeholder')) {
                    (element as HTMLInputElement).placeholder = translatedText;
                } else if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'text') {
                    (element as HTMLInputElement).value = translatedText;
                } else {
                    // Find the deepest text node if any, otherwise set textContent
                    const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
                    if (textNode) {
                        textNode.textContent = translatedText;
                    } else {
                        element.textContent = translatedText;
                    }
                }
                translatedElements++;
            } else {
                console.warn(`Translation failed for key: ${key}`);
                failedElements++;
            }
        } catch (error) {
            console.error(`Error translating element:`, error);
            failedElements++;
        }
    });

    // Translate placeholders
    document.querySelectorAll('[data-translate-key-placeholder]').forEach(element => {
        try {
            const key = element.getAttribute('data-translate-key-placeholder')!;
            const translatedText = t(key);
            if (translatedText && translatedText !== key) {
                (element as HTMLInputElement).placeholder = translatedText;
                translatedElements++;
            }
        } catch (error) {
            console.error(`Error translating placeholder:`, error);
            failedElements++;
        }
    });

    // Translate aria-labels
    document.querySelectorAll('[data-translate-key-aria]').forEach(element => {
        try {
            const key = element.getAttribute('data-translate-key-aria')!;
            const translatedText = t(key);
            if (translatedText && translatedText !== key) {
                element.setAttribute('aria-label', translatedText);
                translatedElements++;
            }
        } catch (error) {
            console.error(`Error translating aria-label:`, error);
            failedElements++;
        }
    });
    
    // Translate tooltips
    document.querySelectorAll('[data-translate-key-tooltip]').forEach(element => {
        try {
            const key = element.getAttribute('data-translate-key-tooltip')!;
            const translatedText = t(key);
            if (translatedText && translatedText !== key) {
                (element as HTMLElement).dataset.tooltip = translatedText;
                translatedElements++;
            }
        } catch (error) {
            console.error(`Error translating tooltip:`, error);
            failedElements++;
        }
    });
    
    // Special handling for buttons with icons
    const toggleDrawModeBtn = document.getElementById('toggle-draw-mode');
    if (toggleDrawModeBtn) {
       const textSpan = toggleDrawModeBtn.querySelector('span');
       if (textSpan) {
           const translatedText = isDrawingMode ? t('map.setWaypointsActive') : t('map.setWaypoints');
           if (translatedText && translatedText !== 'map.setWaypointsActive' && translatedText !== 'map.setWaypoints') {
               textSpan.textContent = translatedText;
               translatedElements++;
           }
       }
    }
    
    console.log(`UI translation completed: ${translatedElements} elements translated, ${failedElements} failed`);
    
    // Translate product tiles in manufacturer view
    translateProductTiles();
    
    // Re-render product cards if manufacturer view is active
    const manufacturerView = document.getElementById('manufacturer-view');
    if (manufacturerView && manufacturerView.style.display !== 'none') {
        const products = (window as any).productDatabase;
        if (products && products.length > 0) {
            console.log('Re-rendering product cards for language change');
            displayProducts(products);
        }
        
        // Re-render product modal if it's open
        const modal = document.getElementById('product-modal');
        if (modal && modal.style.display === 'block') {
            const currentProductIndex = (modal as any).currentProductIndex;
            if (currentProductIndex !== undefined) {
                console.log('Re-rendering product modal for language change');
                showProductDetails(currentProductIndex);
            }
        }
    }
    
    // Force refresh of all text content that might have been missed
    setTimeout(() => {
        let refreshCount = 0;
        document.querySelectorAll('[data-translate-key]').forEach(element => {
            try {
                const key = element.getAttribute('data-translate-key')!;
                const translatedText = t(key);
                if (translatedText && translatedText !== key && element.textContent !== translatedText) {
                    element.textContent = translatedText;
                    refreshCount++;
                }
            } catch (error) {
                console.error(`Error in refresh translation:`, error);
            }
        });
        if (refreshCount > 0) {
            console.log(`Refreshed ${refreshCount} elements`);
        }
    }, 200); // Increased timeout for better reliability
}

/**
 * Fetches the translation data from the JSON file.
 */
async function loadTranslations() {
    // Translation file loading disabled to avoid conflicts
    console.log('Translation file loading disabled to avoid conflicts');
    
    // Always use embedded translations to avoid conflicts
    console.log('Using embedded translations to avoid conflicts');
        translations = embeddedTranslations;
}

/**
 * Sets the application language and updates the UI.
 * @param lang The language code to set (e.g., 'de' or 'en').
 */
async function setLanguage(lang: string) {
    console.log(`Setting language to: ${lang}`);
    
    // Store current map state before language change
    const currentMapState = {
        center: map ? map.getCenter() : null,
        zoom: map ? map.getZoom() : null,
        drawnPolygon: drawnPolygon ? drawnPolygon.getLatLngs() : null,
        threatsMap: new Map(threatsMap),
        waypoints: [...waypoints]
    };
    
    console.log('Current map state:', currentMapState);
    
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });

    await translateUI();

    // Also translate manufacturer view if it's visible
    const manufacturerView = document.getElementById('manufacturer-view');
    if (manufacturerView && manufacturerView.style.display !== 'none') {
        translateUI(); // Use the main translation function
        // Refresh the filter sidebar with new language labels
        populateManufacturerSidebarWithFilters();
    }
    
    // Always translate chatbot when language changes
    translateChatbot();
    
    // Dispatch event for React components to re-render
    window.dispatchEvent(new Event('languageChanged'));

    // Restore map state after language change
    if (map && currentMapState.center && currentMapState.zoom) {
        console.log('Restoring map state after language change');
        
        // Wait for translations to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            // Restore map view
            map.setView(currentMapState.center, currentMapState.zoom, { animate: false });
            
            // Restore drawn polygon if it existed
            if (currentMapState.drawnPolygon && currentMapState.drawnPolygon.length > 0) {
                console.log('Restoring drawn polygon');
                
                // Clear existing polygon
                if (drawnPolygon) {
                    map.removeLayer(drawnPolygon);
                }
                
                // Recreate polygon with stored coordinates (backward compatibility)
                drawnPolygon = L.polygon(currentMapState.drawnPolygon, {
                    color: 'yellow',
                    fillColor: '#FFFF00',
                    fillOpacity: 0.3,
                    weight: 2
                }).addTo(map);
                attachManualEntryHandlersToPolygon(drawnPolygon);
                
                const center = drawnPolygon.getBounds().getCenter();
                polygonLabel = L.marker(center, {
                    icon: L.divIcon({
                        className: 'polygon-label',
                        html: `<div>${t('map.securityAreaLabel')} 1</div>`,
                        iconSize: [150, 24]
                    })
                }).addTo(map);
                
                // Add to polygons array
                drawnPolygons.push({
                    polygon: drawnPolygon,
                    label: polygonLabel,
                    id: `polygon-${Date.now()}`
                });
            }
            
            // Restore threats map
            if (currentMapState.threatsMap.size > 0) {
                console.log('Restoring threats map');
                threatsMap = currentMapState.threatsMap;
                
                // Re-render threat list
                if (threatsMap.size > 0) {
                    renderThreatList();
                }
            }
            
            // Restore waypoints if they existed
            if (currentMapState.waypoints.length > 0) {
                console.log('Restoring waypoints');
                waypoints = currentMapState.waypoints;
                
                // Recreate waypoint markers and path
                waypoints.forEach((waypoint, index) => {
                    const marker = L.marker(waypoint, {
                        icon: L.divIcon({
                            className: 'waypoint-marker',
                            html: `<div style="background: #ff7800; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${index + 1}</div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })
                    }).addTo(map);
                    waypointMarkers.push(marker);
                });
                
                // Recreate path line
                if (waypoints.length > 1) {
                    pathLine = L.polyline(waypoints, {
                        color: '#ff7800',
                        weight: 3,
                        opacity: 0.8,
                        dashArray: '10, 10'
                    }).addTo(map);
                }
            }
            
            // Force map update
            map.invalidateSize();
            
            console.log('Map state restored successfully');
            
        } catch (error) {
            console.error('Error restoring map state:', error);
        }
    }

    // Re-render UI components that depend on the language
    if (threatsMap.size > 0) {
        renderThreatList();
    }
    if (document.querySelector('.product-recommendations-container')?.classList.contains('hidden') === false) {
        await updateProductRecommendations();
    }
    
    console.log(`Language change to ${lang} completed`);
}


// ===============================================
// CORE APPLICATION LOGIC
// ===============================================

/**
 * Initializes the OpenStreetMap map using Leaflet.
 */
async function initOpenStreetMap(): Promise<void> {
    console.log('🔥🔥🔥 INIT OPEN STREET MAP CALLED 🔥🔥🔥');
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("Map container element not found.");
        return;
    }
    
    // Ensure map container is visible and properly sized
    mapDiv.style.display = 'block';
    mapDiv.style.visibility = 'visible';
    mapDiv.style.opacity = '1';
    mapDiv.classList.remove('view-hidden');
    
    console.log('Map container prepared for initialization');
    
    // Test: Simple provider system initialization
    console.log('🚀 Starting provider system initialization...');
    try {
        // Try to initialize provider system
        const { initializeProviderSystem } = await import('./src/core/geodata/integration/indexIntegration.js');
        await initializeProviderSystem();
        console.log('✅ Provider system initialized successfully');
    } catch (error) {
        console.error('❌ Provider system initialization failed:', error);
        console.log('⚠️ Continuing with standard map initialization...');
        // Continue with normal initialization
    }
    
    const mapCenter: [number, number] = [51.6139, 7.1979]; // Recklinghausen (Altstadt)
    map = L.map(mapDiv, {
      zoomControl: false, // Disable default zoom control
      preferCanvas: true // Use canvas renderer for better performance with html2canvas
    }).setView(mapCenter, 16);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Provider system initialization with EPSG:4326 (correct CRS!)
    console.log('🗺️ Starting provider system initialization...');
    try {
        console.log('📦 Importing provider system modules...');
        const { pickProvider, getCurrentMapBbox4326 } = await import('./src/core/geodata/index.js');
        console.log('✅ Provider modules imported successfully');
        
        console.log('📍 Getting current map bounding box (EPSG:4326)...');
        const bbox4326 = getCurrentMapBbox4326(map);
        console.log('📍 Map bbox4326 (lon/lat):', bbox4326);
        
        console.log('🔍 Picking provider based on location...');
        const provider = await pickProvider(bbox4326);
        console.log(`🎯 Selected provider: ${provider.id}`);
        
        // Add basemap from selected provider
        let basemapLayer: any = null;
        if (provider.makeBasemapLayer) {
            console.log(`🗺️ Creating basemap layer from ${provider.id} provider...`);
            basemapLayer = provider.makeBasemapLayer();
        } else {
            console.warn(`⚠️ Provider ${provider.id} has no makeBasemapLayer, using OSM fallback`);
            const { osmProvider } = await import('./src/core/geodata/index.js');
            basemapLayer = osmProvider.makeBasemapLayer?.();
        }
        
        if (basemapLayer) {
            basemapLayer.addTo(map);
            (map as any)._currentBasemapLayer = basemapLayer; // Store for easy removal
            console.log(`✅ Basemap loaded from ${provider.id} provider`);
        }
        
        // Add simple source attribution
        console.log('📝 Adding source attribution...');
        const attributionDiv = document.createElement('div');
        attributionDiv.id = 'provider-attribution';
        attributionDiv.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(255, 255, 255, 0.9);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            color: #333;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            z-index: 1000;
            pointer-events: none;
        `;
        attributionDiv.textContent = provider.id === 'nrw' ? 'Quelle: GEOBASIS.NRW' : 'Quelle: OSM';
        mapDiv.appendChild(attributionDiv);
        console.log(`📝 Attribution added: ${attributionDiv.textContent}`);
        
        // Store provider globally for data fetching
        (window as any).currentProvider = provider;
        console.log('💾 Provider stored globally for data fetching');
        
        // Add event listeners for automatic provider switching
        console.log('🔄 Adding event listeners for automatic provider switching...');
        addProviderSwitchingListeners(map);
        
    } catch (error) {
        console.error('❌ Provider system failed:', error);
        console.warn('⚠️ Falling back to standard OSM');
        // Fallback to standard OSM tiles
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
        console.log('✅ OSM fallback basemap added');
    }
    
    // Store the map reference globally for provider system
    (window as any).map = map;
    
    // Force map to calculate correct size after initialization
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            console.log('Map size invalidated after initialization');
        }
    }, 100);
    
    // Additional invalidation after map is ready (provider system handles tile loading)
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            console.log('Map size invalidated after provider initialization');
        }
    }, 500);
    
        // Add event listeners for map movement to update pinned tooltips (throttled for performance)
    let moveTimeout: number | undefined;
    map.on('move', () => {
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = window.setTimeout(() => {
            // console.log('Map move event triggered'); // Reduced logging
            // Use requestAnimationFrame for better performance
            requestAnimationFrame(() => {
        updatePinnedTooltipPositions();
                updateDeletionBubblePosition();
            });
        }, 150); // Increased debounce time for better performance
    });
    map.on('zoom', () => {
        console.log('Map zoom event triggered');
        updatePinnedTooltipPositions();
        updateDeletionBubblePosition();
    });
    
    // Additional protection against zoom animation errors
    map.on('zoomstart', () => {
        // Temporarily disable problematic popup animations during zoom
        console.log('Zoom started - protecting popups');
    });
    
    map.on('zoomend', () => {
        // Re-enable popup functionality after zoom completes
        console.log('Zoom ended - re-enabling popups');
        updatePinnedTooltipPositions();
        
        // Reset street highlighting when zooming out significantly
        const currentZoom = map.getZoom();
        if (currentZoom < 14 && highlightedStreetName) {
            console.log(`🔍 Zoom level ${currentZoom} - resetting street highlighting`);
            resetStreetHighlighting();
        }
    });
    map.on('resize', () => {
        console.log('Map resize event triggered');
        updatePinnedTooltipPositions();
    });
    
    console.log('Map initialized successfully');
    
    // Initialize 3D mode with delay to ensure DOM is ready
    setTimeout(() => {
        initialize3DModeDeck();
        add3DToggleEventListener();
        addBasemapToggleEventListener();
    }, 100);
}

/**
 * Initialize 3D mode components and state
 */
function initialize3DModeDeck(): void {
    console.log('🌍 Initializing 3D mode with deck.gl...');
    
    try {
        // Ensure deck mount exists
        const deckMountEl = ensureDeckMount();
        console.info("[3D] deck mount ready", deckMountEl);
        
        // Make the toggle function globally available
        (window as any).handle3DToggle = handle3DToggleDeck;
        console.log('✅ 3D toggle function exposed globally');
        
        console.log('✅ 3D mode with deck.gl initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing 3D mode:', error);
    }
}

/**
 * Add event listener for the 3D toggle button
 */
function add3DToggleEventListener(): void {
    console.log('🎛️ Adding 3D toggle button event listener...');
    
    const toggleButton = document.getElementById('3d-toggle-btn');
    if (!toggleButton) {
        console.error('❌ 3D toggle button not found');
        return;
    }
    
    toggleButton.addEventListener('click', async () => {
        console.log('🔄 3D toggle button clicked');
        await handle3DToggleDeck();
    });
    
    console.log('✅ 3D toggle button event listener added');
}

/**
 * Add event listener for the basemap toggle button (settings button)
 */
function addBasemapToggleEventListener(): void {
    console.log('🗺️ Adding basemap toggle button event listener...');
    
    const settingsButton = document.getElementById('map-settings-btn');
    if (!settingsButton) {
        console.error('❌ Map settings button not found');
        return;
    }
    
    settingsButton.addEventListener('click', async () => {
        console.log('🔄 Map settings button clicked - toggling basemap');
        
        if (!map) {
            console.error('❌ Map not initialized');
            return;
        }
        
        try {
            const { toggleBasemapProvider } = await import('./src/core/geodata/integration/mapIntegration.js');
            await toggleBasemapProvider(map);
            console.log('✅ Basemap toggled successfully');
        } catch (error) {
            console.error('❌ Failed to toggle basemap:', error);
        }
    });
    
    console.log('✅ Basemap toggle button event listener added');
}


/**
 * Handle 3D mode toggle
 */
async function handle3DToggleDeck(): Promise<void> {
    console.log('🔄 Toggling 3D mode with deck.gl...');
    
    if (!map) {
        console.error('❌ Map not initialized');
        return;
    }
    
    try {
        console.info("[3D] toggle clicked. is3D=", threeDDeckState.is3D);
        
        // Ensure deck mount exists
        const deckMountEl = ensureDeckMount();
        console.info("[3D] deck mount ready", deckMountEl);
        
        if (threeDDeckState.is3D) {
            // Exit 3D mode
            console.log('🚪 Exiting 3D mode...');
            exit3DDeck(map, deckMountEl);
        } else {
            // Enter 3D mode
            console.log('🚀 Entering 3D mode...');
            await enter3DDeck(map, deckMountEl);
        }
        
        // Update toggle button state
        update3DToggleButton();
    } catch (e) {
        console.error("[3D] toggle error", e);
        alert("3D konnte nicht geladen werden. Details in der Konsole.");
    }
}

/**
 * Update the 3D toggle button state
 */
function update3DToggleButton(): void {
    console.log('🔄 3D toggle button state updated:', threeDDeckState.is3D);
    
    // Update the HTML toggle button
    const toggleButton = document.getElementById('3d-toggle-btn');
    const toggleText = document.getElementById('3d-toggle-text');
    
    if (toggleButton && toggleText) {
        if (threeDDeckState.is3D) {
            toggleText.textContent = '2D';
            toggleButton.title = 'Zu 2D wechseln';
            toggleButton.classList.add('in-3d-mode');
        } else {
            toggleText.textContent = '3D';
            toggleButton.title = 'Zu 3D wechseln';
            toggleButton.classList.remove('in-3d-mode');
        }
    }
    
}

/**
 * Add event listeners for automatic provider switching when map moves.
 * 
 * @param map Leaflet map instance
 */
function addProviderSwitchingListeners(map: any): void {
    console.log('🔄 Adding provider switching event listeners...');
    
    // Debounce timer to avoid too frequent provider checks
    let providerCheckTimeout: NodeJS.Timeout | null = null;
    
    const checkProviderChange = async () => {
        if (providerCheckTimeout) {
            clearTimeout(providerCheckTimeout);
        }
        
        providerCheckTimeout = setTimeout(async () => {
            console.log('🔄 Map moved - checking if provider should change...');
            
            try {
                // Import provider functions
                const { pickProvider, getCurrentMapBbox4326 } = await import('./src/core/geodata/index.js');
                
                // Get current map bounds
                const bbox4326 = getCurrentMapBbox4326(map);
                console.log('📍 Current map bbox4326:', bbox4326);
                
                // Pick new provider
                const newProvider = await pickProvider(bbox4326);
                console.log(`🔍 New provider would be: ${newProvider.id}`);
                
                // Check if provider changed
                const currentProvider = (window as any).currentProvider;
                if (!currentProvider || newProvider.id !== currentProvider.id) {
                    console.log(`🔄 Provider change detected: ${currentProvider?.id || 'none'} → ${newProvider.id}`);
                    
                    // Remove current basemap layer
                    const currentBasemapLayer = (map as any)._currentBasemapLayer;
                    if (currentBasemapLayer) {
                        map.removeLayer(currentBasemapLayer);
                        console.log('🗑️ Removed current basemap layer');
                    }
                    
                    // Add new basemap layer
                    let newBasemapLayer: any = null;
                    if (newProvider.makeBasemapLayer) {
                        newBasemapLayer = newProvider.makeBasemapLayer();
                        newBasemapLayer.addTo(map);
                        (map as any)._currentBasemapLayer = newBasemapLayer;
                        console.log(`✅ Added new basemap layer from ${newProvider.id}`);
                    }
                    
                    // Update attribution
                    const attributionDiv = document.getElementById('provider-attribution');
                    if (attributionDiv) {
                        attributionDiv.textContent = newProvider.id === 'nrw' ? 'Quelle: GEOBASIS.NRW' : 'Quelle: OSM';
                        console.log(`📝 Updated attribution: ${attributionDiv.textContent}`);
                    }
                    
                    // Store new provider globally
                    (window as any).currentProvider = newProvider;
                    console.log(`💾 Updated global provider to: ${newProvider.id}`);
                    
                    // Show notification if switching from NRW to OSM
                    if (currentProvider?.id === 'nrw' && newProvider.id === 'osm') {
                        console.log('ℹ️ Switched from NRW to OSM - showing notification');
                        // You could add a toast notification here
                    }
                } else {
                    console.log('✅ Provider unchanged, no action needed');
                }
            } catch (error) {
                console.error('❌ Error checking provider change:', error);
            }
        }, 1500); // 1.5 second debounce to avoid too frequent checks
    };
    
    // Listen for map movement events
    map.on('moveend', checkProviderChange);
    map.on('zoomend', checkProviderChange);
    
    console.log('✅ Provider switching event listeners added');
}

/**
 * Restores threat analysis display if analysis data exists
 */
const restoreThreatAnalysis = () => {
    // Only restore if we have threat data
    if (threatsMap.size === 0 && (!(window as any).entryDetectionManager || !(window as any).entryDetectionManager.candidates || (window as any).entryDetectionManager.candidates.length === 0)) {
        return;
    }
    
    // Recreate threat markers if we have threat data
    if (threatsMap.size > 0) {
        // Recreate threat layer group
        if (threatLayerGroup) {
            try { threatLayerGroup.clearLayers(); map.removeLayer(threatLayerGroup); } catch {}
        }
        threatLayerGroup = L.layerGroup().addTo(map);
        
        // Recreate markers for each threat
        threatsMap.forEach((data, name) => {
            if (data.entryPoints.length === 0) return;
            
            // Choose color by estimated speed (worst-case acceleration)
            const vehicleSelectEl = document.getElementById('vehicle-select') as HTMLSelectElement;
            const selectedWeightVal = vehicleSelectEl?.value || 'alle';
            const accRange = getAccelerationRange(selectedWeightVal);
            const usedAcc = accRange ? accRange[1] : 3.0;
            
            let circleColor, fillColor, radius;
            const threatLevel = Math.min(Math.round(usedAcc * 10), 10);
            
            if (threatLevel >= 8) {
                // High threat - Red circles
                circleColor = '#DC143C';  // Crimson
                fillColor = '#FF6347';    // Tomato
                radius = 6;
            } else if (threatLevel >= 5) {
                // Medium threat - Orange circles
                circleColor = '#FF8C00';  // Dark orange
                fillColor = '#FFA500';    // Orange
                radius = 5;
            } else {
                // Minimal threat - Yellow circles
                circleColor = '#DAA520';  // Goldenrod
                fillColor = '#FFD700';    // Gold
                radius = 4;
            }
            
            const currentStreetMarkers: any[] = [];
            data.entryPoints.forEach(point => {
                const threatDescription = `
                    <b>${t('threats.popupHeader')}</b><br>
                    <b>Straße:</b> ${name}<br>
                    <b>Straßentyp:</b> ${data.roadType || 'unbekannt'}<br>
                    <b>Bedrohungslevel:</b> ${threatLevel}/10<br>
                    <b>Max. Geschwindigkeit:</b> ${data.maxSpeed || 'unbekannt'} km/h
                `;
                
                const threatCircle = L.circle([point.lat, point.lon], {
                    radius: radius, 
                    color: circleColor, 
                    fillColor: fillColor, 
                    fillOpacity: 0.8, 
                    weight: 3
                }).bindPopup(threatDescription);
                threatLayerGroup.addLayer(threatCircle);
                currentStreetMarkers.push(threatCircle);
            });
            
            // Store markers
            threatMarkersMap.set(name, currentStreetMarkers);
        });
    }
    
    // Recreate Entry Detection markers if they exist
    if ((window as any).entryDetectionManager && (window as any).entryDetectionManager.candidates && (window as any).entryDetectionManager.candidates.length > 0) {
        createEntryDetectionMarkers();
    }
    
    // Recreate threat list
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (threatList) {
        // Clear existing content first
        threatList.innerHTML = '';
        
        // Render threat list if we have threat data
        if (threatsMap.size > 0) {
            renderThreatList();
        }
        
        // Add Entry Detection results if they exist
        if ((window as any).entryDetectionManager && (window as any).entryDetectionManager.candidates && (window as any).entryDetectionManager.candidates.length > 0) {
            addEntryDetectionResultsToThreatList(threatList);
        }
        
        // Update title
        updateThreatListTitle(threatsMap.size > 0 || ((window as any).entryDetectionManager && (window as any).entryDetectionManager.candidates && (window as any).entryDetectionManager.candidates.length > 0));
    }
    
    // Show threat panel if we have data
    const threatPanel = document.getElementById('floating-threats');
    if (threatPanel && (threatsMap.size > 0 || ((window as any).entryDetectionManager && (window as any).entryDetectionManager.candidates && (window as any).entryDetectionManager.candidates.length > 0))) {
        threatPanel.classList.remove('view-hidden');
    }
    
    console.log('✅ Threat analysis restored');
};

/**
 * Updates the threat list after entry point deletion
 */
const updateThreatListAfterDeletion = () => {
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (threatList) {
        // Clear and rebuild threat list
        threatList.innerHTML = '';
        if (threatsMap.size > 0) {
            renderThreatList();
        }
        addEntryDetectionResultsToThreatList(threatList);
        
        // Update title
        const manager = (window as any).entryDetectionManager;
        updateThreatListTitle(threatsMap.size > 0 || (manager && manager.candidates && manager.candidates.length > 0));
    }
};

const clearEntryDetectionMarkers = () => {
    const entryMarkers = threatMarkersMap.get('entry-detection');
    if (!entryMarkers) return;

    entryMarkers.forEach(marker => {
        if (threatLayerGroup && threatLayerGroup.hasLayer(marker)) {
            threatLayerGroup.removeLayer(marker);
        } else if (map && map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });

    threatMarkersMap.set('entry-detection', []);
};

const createManualEntryCandidate = (latlng: any, id: string): EntryCandidate => {
    const coordinate: [number, number] = [latlng.lng, latlng.lat];
    return {
        id,
        intersectionPoint: coordinate,
        pathNodeIds: [],
        path: {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [coordinate]
            },
            properties: {}
        } as any,
        distanceMeters: Math.max(100, 120),
        straightness: 1,
        continuity: 1,
        confidence: 0.95,
        wayIds: [],
        manual: true
    };
};

const hasManualCandidateNear = (manager: any, latlng: any): boolean => {
    if (!manager?.candidates) return false;
    return manager.candidates.some((candidate: EntryCandidate) => {
        if (!candidate.manual) return false;
        const candidateLatLng = L.latLng(candidate.intersectionPoint[1], candidate.intersectionPoint[0]);
        return candidateLatLng.distanceTo(latlng) < 2;
    });
};

const addManualEntryPoint = (latlng: any) => {
    const manager = (window as any).entryDetectionManager;
    if (!manager) return;
    
    if (hasManualCandidateNear(manager, latlng)) {
        showNotification('In der Nähe existiert bereits eine manuelle Zufahrt.', 'warning');
        return;
    }
    
    const id = `manual-${Date.now()}-${manualEntryIdCounter++}`;
    const candidate = createManualEntryCandidate(latlng, id);
    manager.addManualCandidate(candidate);
    
    clearEntryDetectionMarkers();
    createEntryDetectionMarkers();
    updateThreatListAfterDeletion();
    showNotification('Manuelle Zufahrt hinzugefügt. Analyse aktualisieren, um Wege neu zu berechnen.', 'success');
};

const setManualEntryMode = (enabled: boolean, silent = false) => {
    if (enabled && drawnPolygons.length === 0 && !drawnPolygon) {
        if (!silent) {
            showNotification('Bitte zeichnen Sie zuerst einen Sicherheitsbereich.', 'warning');
        }
        enabled = false;
    }
    
    manualEntryMode = enabled;
    if (manualEntryButton) {
        manualEntryButton.classList.toggle('active', enabled);
        manualEntryButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    
    if (!silent) {
        showNotification(
            enabled 
                ? 'Manueller Zufahrtsmodus aktiv. Rechtsklick auf die Außenkante setzt eine neue Zufahrt.' 
                : 'Manueller Zufahrtsmodus beendet.',
            'info'
        );
    }
};

const updateManualEntryButtonAvailability = (enabled: boolean) => {
    if (!manualEntryButton) return;
    manualEntryButton.disabled = !enabled;
    manualEntryButton.classList.toggle('disabled', !enabled);
    if (!enabled && manualEntryMode) {
        setManualEntryMode(false, true);
    }
};

const attachManualEntryHandlersToPolygon = (polygon: any) => {
    if (!polygon || (polygon as any)._manualEntryHandlerAttached) return;
    
    polygon.on('contextmenu', (e: any) => {
        if (currentActiveTab !== 'nav-threat-analysis') {
            return;
        }
        
        // Auto-enable manual mode if user right-clicks on polygon in threat analysis tab
        if (!manualEntryMode) {
            setManualEntryMode(true);
        }
        
        e.originalEvent?.preventDefault?.();
        addManualEntryPoint(e.latlng);
    });
    
    (polygon as any)._manualEntryHandlerAttached = true;
};

/**
 * Creates a local deletion bubble next to an entry point marker
 */
const createDeletionBubble = (marker: any, candidate: any, isErschliessung: boolean) => {
    // Remove any existing deletion bubble
    const existingBubble = document.getElementById('deletion-bubble');
    if (existingBubble) {
        existingBubble.remove();
    }

    // Get marker position
    const markerLatLng = marker.getLatLng();
    const markerPoint = map.latLngToContainerPoint(markerLatLng);
    
    // Create bubble element
    const bubble = document.createElement('div');
    bubble.id = 'deletion-bubble';
    bubble.style.cssText = `
        position: absolute;
        left: ${markerPoint.x + 15}px;
        top: ${markerPoint.y - 10}px;
        background: rgba(12, 47, 77, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        color: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        min-width: 200px;
        max-width: 250px;
        pointer-events: auto;
    `;

    // Create bubble content
    bubble.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #FFD700;">
                🗑️ Zufahrtspunkt löschen
            </div>
            <button id="close-deletion-bubble" style="
                background: none;
                border: none;
                color: #ccc;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">×</button>
        </div>
        <div style="display: flex; gap: 8px;">
            <button id="confirm-deletion" style="
                background: #dc3545;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                flex: 1;
                transition: background-color 0.2s;
            " onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">
                Entfernen
            </button>
        </div>
    `;

    // Add to map container
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.appendChild(bubble);
    }

    // Add event listeners
    const closeBtn = document.getElementById('close-deletion-bubble');
    const confirmBtn = document.getElementById('confirm-deletion');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            bubble.remove();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            // Delete the entry point
            deleteEntryPoint(marker, candidate);
            bubble.remove();
        });
    }

    // Close bubble when clicking outside
    const closeOnOutsideClick = (e: MouseEvent) => {
        if (!bubble.contains(e.target as Node)) {
            bubble.remove();
            document.removeEventListener('click', closeOnOutsideClick);
        }
    };

    // Delay the outside click listener to prevent immediate closure
    setTimeout(() => {
        document.addEventListener('click', closeOnOutsideClick);
    }, 100);

    return bubble;
};

/**
 * Updates the position of the deletion bubble when map is moved or zoomed
 */
const updateDeletionBubblePosition = () => {
    const bubble = document.getElementById('deletion-bubble');
    if (!bubble || !map) return;

    // Find the marker that this bubble belongs to
    const entryMarkers = threatMarkersMap.get('entry-detection');
    if (!entryMarkers || entryMarkers.length === 0) return;

    // For now, we'll just remove the bubble on map move/zoom
    // In a more sophisticated implementation, we could track which marker the bubble belongs to
    bubble.remove();
};

/**
 * Deletes an entry point and updates the UI
 */
const deleteEntryPoint = (marker: any, candidate: any) => {
    console.log(`🗑️ Starting deletion of entry point ${candidate.id}`);
    
    // Handle deletion from threatsMap
    if (candidate.fromThreatsMap && candidate.streetName) {
        const threatData = threatsMap.get(candidate.streetName);
        if (threatData) {
            // Remove this entry point from threatsMap
            const candidateLat = candidate.intersectionPoint[1];
            const candidateLng = candidate.intersectionPoint[0];
            threatData.entryPoints = threatData.entryPoints.filter((ep: any) => {
                const distance = Math.sqrt(Math.pow(ep.lat - candidateLat, 2) + Math.pow(ep.lon - candidateLng, 2));
                return distance > 0.0001; // ~10 meters tolerance
            });
            
            // If no entry points left, remove the entire threat
            if (threatData.entryPoints.length === 0) {
                threatsMap.delete(candidate.streetName);
                const markers = threatMarkersMap.get(candidate.streetName);
                if (markers) {
                    markers.forEach(m => {
                        if (threatLayerGroup && threatLayerGroup.hasLayer(m)) {
                            threatLayerGroup.removeLayer(m);
                        } else if (map && map.hasLayer(m)) {
                            map.removeLayer(m);
                        }
                    });
                    threatMarkersMap.delete(candidate.streetName);
                }
            } else {
                // Re-render threats for this street
                const markers = threatMarkersMap.get(candidate.streetName);
                if (markers) {
                    markers.forEach(m => {
                        if (threatLayerGroup && threatLayerGroup.hasLayer(m)) {
                            threatLayerGroup.removeLayer(m);
                        } else if (map && map.hasLayer(m)) {
                            map.removeLayer(m);
                        }
                    });
                    threatMarkersMap.delete(candidate.streetName);
                }
            }
            
            // Re-render threat list and markers
            renderThreatList();
            createEntryDetectionMarkers();
            updateThreatListAfterDeletion();
            return;
        }
    }
    
    // Clear manual path layers if applicable
    if (candidate.manual) {
        clearManualPath(candidate.id);
    }
    
    // Get marker position for comprehensive cleanup
    const markerLatLng = marker.getLatLng();
    console.log(`📍 Marker position: ${markerLatLng.lat}, ${markerLatLng.lng}`);
    
    // 1. Delete from manager
    const manager = (window as any).entryDetectionManager;
    if (manager) {
        manager.deleteCandidate(candidate.id);
        console.log(`✅ Removed from entryDetectionManager`);
    }
    
    // 2. COMPREHENSIVE LAYER CLEANUP - Remove ALL markers at this position
    let removedCount = 0;
    const layersToRemove: any[] = [];
    
    // Find all layers that might be at this position
    map.eachLayer((layer: any) => {
        // PROTECT: Never remove any security area polygon
        const isPolygon = drawnPolygons.some(item => item.polygon === layer) || layer === drawnPolygon;
        if (isPolygon) {
            console.log(`🛡️ PROTECTED: Skipping security area polygon - cannot be deleted from threat analysis tab`);
            console.warn(`⚠️ SECURITY: Attempted to delete security area polygon from threat analysis tab - this is not allowed!`);
            return;
        }
        
        // PROTECT: Never remove any polygon label
        const isLabel = drawnPolygons.some(item => item.label === layer) || layer === polygonLabel;
        if (isLabel) {
            console.log(`🛡️ PROTECTED: Skipping polygon label - cannot be deleted from threat analysis tab`);
            return;
        }
        
        // PROTECT: Never remove search marker
        if (layer === searchMarker) {
            console.log(`🛡️ PROTECTED: Skipping search marker - cannot be deleted from threat analysis tab`);
            return;
        }
        
        // PROTECT: Never remove waypoint markers
        if (waypointMarkers.includes(layer)) {
            console.log(`🛡️ PROTECTED: Skipping waypoint marker - cannot be deleted from threat analysis tab`);
            return;
        }
        
        if (layer instanceof L.Circle) {
            const layerLatLng = layer.getLatLng();
            const distance = markerLatLng.distanceTo(layerLatLng);
            
            // Remove circles within 2 meters of the target position
            if (distance < 2) {
                console.log(`🎯 Found circle at distance ${distance.toFixed(2)}m - marking for removal`);
                layersToRemove.push(layer);
            }
        } else if (layer instanceof L.Polyline) {
            // Check if this polyline is related to the entry point
            const latLngs = layer.getLatLngs();
            if (latLngs && latLngs.length > 0) {
                // Check if any point of the polyline is near the marker
                let isRelated = false;
                for (const point of latLngs) {
                    const pointLatLng = Array.isArray(point) ? L.latLng(point[0], point[1]) : point;
                    const distance = markerLatLng.distanceTo(pointLatLng);
                    if (distance < 10) { // 10m tolerance for path segments
                        isRelated = true;
                        break;
                    }
                }
                
                if (isRelated) {
                    console.log(`🛣️ Found related polyline path - marking for removal`);
                    layersToRemove.push(layer);
                }
            }
        } else if (layer instanceof L.Marker) {
            // Handle regular markers (including those with divIcon)
            const layerLatLng = layer.getLatLng();
            const distance = markerLatLng.distanceTo(layerLatLng);
            
            // Remove markers within 2 meters of the target position
            if (distance < 2) {
                console.log(`📍 Found marker at distance ${distance.toFixed(2)}m - marking for removal`);
                layersToRemove.push(layer);
            }
        }
    });
    
    // Remove all identified layers
    layersToRemove.forEach((layer, index) => {
        try {
            if (threatLayerGroup && threatLayerGroup.hasLayer(layer)) {
                threatLayerGroup.removeLayer(layer);
            } else {
                map.removeLayer(layer);
            }
            removedCount++;
            console.log(`🗑️ Removed layer ${index + 1}/${layersToRemove.length}`);
        } catch (error) {
            console.warn(`⚠️ Failed to remove layer ${index + 1}:`, error);
        }
    });
    
    console.log(`✅ Removed ${removedCount} layers from map`);
    
    // 3. Clean up threatMarkersMap - remove ALL references to markers at this position
    threatMarkersMap.forEach((markers, key) => {
        const originalLength = markers.length;
        const filteredMarkers = markers.filter(m => {
            // PROTECT: Never remove any security area polygon
            const isPolygon = drawnPolygons.some(item => item.polygon === m) || m === drawnPolygon;
            if (isPolygon) {
                console.log(`🛡️ PROTECTED: Keeping security area polygon in ${key}`);
                return true;
            }
            
            // PROTECT: Never remove any polygon label
            const isLabel = drawnPolygons.some(item => item.label === m) || m === polygonLabel;
            if (isLabel) {
                console.log(`🛡️ PROTECTED: Keeping polygon label in ${key}`);
                return true;
            }
            
            // PROTECT: Never remove search marker
            if (m === searchMarker) {
                console.log(`🛡️ PROTECTED: Keeping search marker in ${key}`);
                return true;
            }
            
            // PROTECT: Never remove waypoint markers
            if (waypointMarkers.includes(m)) {
                console.log(`🛡️ PROTECTED: Keeping waypoint marker in ${key}`);
                return true;
            }
            
            if (m && m.getLatLng) {
                const mLatLng = m.getLatLng();
                const distance = markerLatLng.distanceTo(mLatLng);
                return distance >= 2; // Keep markers that are NOT at this position
            } else if (m && m.getLatLngs) {
                // Handle polylines - check if any point is near the marker
                const latLngs = m.getLatLngs();
                if (latLngs && latLngs.length > 0) {
                    for (const point of latLngs) {
                        const pointLatLng = Array.isArray(point) ? L.latLng(point[0], point[1]) : point;
                        const distance = markerLatLng.distanceTo(pointLatLng);
                        if (distance < 10) {
                            return false; // Remove this polyline
                        }
                    }
                }
                return true; // Keep polyline if no points are near
            }
            return m !== marker; // Fallback: remove exact match
        });
        
        if (filteredMarkers.length !== originalLength) {
            threatMarkersMap.set(key, filteredMarkers);
            console.log(`🧹 Cleaned ${key}: ${originalLength} → ${filteredMarkers.length} layers`);
        }
    });
    
    // 4. Update threat list
    updateThreatListAfterDeletion();
    
    console.log(`✅ Entry point ${candidate.id} completely deleted (${removedCount} layers removed)`);
    
    // DEBUG: Log all remaining layers for analysis
    console.log(`🔍 DEBUG: Analyzing all remaining layers on map:`);
    let layerCount = 0;
    map.eachLayer((layer: any) => {
        layerCount++;
        if (layer instanceof L.Circle) {
            const pos = layer.getLatLng();
            console.log(`  Layer ${layerCount}: L.Circle at ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} (radius: ${layer.options.radius})`);
        } else if (layer instanceof L.Marker) {
            const pos = layer.getLatLng();
            console.log(`  Layer ${layerCount}: L.Marker at ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
        } else if (layer instanceof L.Polyline) {
            const latLngs = layer.getLatLngs();
            console.log(`  Layer ${layerCount}: L.Polyline with ${latLngs.length} points`);
        } else if (layer instanceof L.Polygon) {
            console.log(`  Layer ${layerCount}: L.Polygon (security area)`);
        } else {
            console.log(`  Layer ${layerCount}: ${layer.constructor.name} (unknown type)`);
        }
    });
    console.log(`🔍 DEBUG: Total layers on map: ${layerCount}`);
    
    // 5. FINAL SAFETY CHECK - Ensure no orphaned markers or paths remain
    setTimeout(() => {
        const remainingLayers: any[] = [];
        map.eachLayer((layer: any) => {
            // PROTECT: Never remove any security area polygon
            const isPolygon = drawnPolygons.some(item => item.polygon === layer) || layer === drawnPolygon;
            if (isPolygon) {
                console.log(`🛡️ PROTECTED: Skipping security area polygon in final check`);
                return;
            }
            
            // PROTECT: Never remove any polygon label
            const isLabel = drawnPolygons.some(item => item.label === layer) || layer === polygonLabel;
            if (isLabel) {
                console.log(`🛡️ PROTECTED: Skipping polygon label in final check`);
                return;
            }
            
            // PROTECT: Never remove search marker
            if (layer === searchMarker) {
                console.log(`🛡️ PROTECTED: Skipping search marker in final check`);
                return;
            }
            
            // PROTECT: Never remove waypoint markers
            if (waypointMarkers.includes(layer)) {
                console.log(`🛡️ PROTECTED: Skipping waypoint marker in final check`);
                return;
            }
            
            if (layer instanceof L.Circle) {
                const layerLatLng = layer.getLatLng();
                const distance = markerLatLng.distanceTo(layerLatLng);
                if (distance < 2) {
                    remainingLayers.push(layer);
                }
            } else if (layer instanceof L.Polyline) {
                // Check for remaining path segments
                const latLngs = layer.getLatLngs();
                if (latLngs && latLngs.length > 0) {
                    let isRelated = false;
                    for (const point of latLngs) {
                        const pointLatLng = Array.isArray(point) ? L.latLng(point[0], point[1]) : point;
                        const distance = markerLatLng.distanceTo(pointLatLng);
                        if (distance < 10) {
                            isRelated = true;
                            break;
                        }
                    }
                    if (isRelated) {
                        remainingLayers.push(layer);
                    }
                }
            } else if (layer instanceof L.Marker) {
                // Check for remaining markers
                const layerLatLng = layer.getLatLng();
                const distance = markerLatLng.distanceTo(layerLatLng);
                if (distance < 2) {
                    remainingLayers.push(layer);
                }
            }
        });
        
        if (remainingLayers.length > 0) {
            console.warn(`⚠️ Found ${remainingLayers.length} remaining layers at position - removing them`);
            remainingLayers.forEach(layer => {
                try {
                    map.removeLayer(layer);
                } catch (error) {
                    console.warn('Failed to remove remaining layer:', error);
                }
            });
        }
    }, 100); // Small delay to ensure all operations are complete
};

/**
 * Clears the threat markers (red circles and lines) and the list from the map and UI.
 */
const clearThreatAnalysis = (options?: { preserveManualEntries?: boolean }) => {
    const preserveManualEntries = options?.preserveManualEntries ?? false;
    // Reset any street highlighting
    resetStreetHighlighting();
    
    // Exit edit mode if active
    if (isEditMode) {
        isEditMode = false;
        const editBtn = document.getElementById('edit-threats-btn');
        if (editBtn) {
            editBtn.classList.remove('active');
            editBtn.title = 'Zufahrten bearbeiten';
        }
        disableMapClickForThreatAddition();
    }
    
    // Clear manual editing data
    manuallyRemovedThreats.clear();
    manuallyAddedThreats.clear();
    
    // Remove grouped layers if present
    if (threatLayerGroup) {
        try {
            threatLayerGroup.clearLayers();
            map.removeLayer(threatLayerGroup);
        } catch (e) { /* noop */ }
        threatLayerGroup = null;
    }
    threatMarkersMap.forEach(markers => {
        markers.forEach(marker => map.removeLayer(marker));
    });
    threatMarkersMap.clear();
    
    // Clear Entry Detection results
    if ((window as any).entryDetectionManager) {
        (window as any).entryDetectionManager.clearCandidates(preserveManualEntries);
    }
    
    if (!preserveManualEntries) {
        setManualEntryMode(false, true);
    }
    threatsMap.clear();
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (threatList) {
        threatList.innerHTML = '';
    }
    const floating = document.getElementById('floating-threats');
    if (floating) floating.classList.add('view-hidden');
    
    // Reset title to default
    updateThreatListTitle(false);
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
 * Determines if two road names should be combined as the same road
 * @param road1 - First road name
 * @param road2 - Second road name  
 * @returns true if roads should be combined
 */
function shouldCombineRoads(road1: string, road2: string): boolean {
    // Remove IDs and common suffixes for comparison
    const clean1 = road1.replace(/\(ID:\d+\)/g, '').replace(/(straße|weg|gasse|platz|allee)$/i, '').trim().toLowerCase();
    const clean2 = road2.replace(/\(ID:\d+\)/g, '').replace(/(straße|weg|gasse|platz|allee)$/i, '').trim().toLowerCase();
    
    // Same name without suffix
    if (clean1 === clean2 && clean1.length > 2) return true;
    
    // Very similar names (Levenshtein distance)
    if (getLevenshteinDistance(clean1, clean2) <= 1 && Math.min(clean1.length, clean2.length) > 3) return true;
    
    // Same road with different types (Hauptstraße vs Hauptweg)
    const baseName1 = clean1.replace(/^(haupt|neben|ober|unter|neu|alt)\s*/i, '');
    const baseName2 = clean2.replace(/^(haupt|neben|ober|unter|neu|alt)\s*/i, '');
    if (baseName1 === baseName2 && baseName1.length > 2) return true;
    
    return false;
}

/**
 * Calculates Levenshtein distance between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Distance value
 */
function getLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,    // deletion
                matrix[j - 1][i] + 1,    // insertion
                matrix[j - 1][i - 1] + indicator  // substitution
            );
        }
    }
    
    return matrix[str2.length][str1.length];
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
 * Calculates extended acceleration distance by considering connected road segments
 * @param wayNodes - Nodes of the current way
 * @param startIndex - Starting index for calculation
 * @param allWays - All available ways for connection analysis
 * @param maxDistance - Maximum additional distance to consider
 * @returns Additional acceleration distance in meters
 */
function calculateExtendedAccelerationDistance(
    wayNodes: any[], 
    startIndex: number, 
    allWays: any, 
    maxDistance: number = 1000
): number {
    let additionalDistance = 0;
    
    // Try to find connected ways that could provide additional acceleration distance
    if (startIndex > 0) {
        const startNode = wayNodes[0];
        
        // Look for ways that connect to our start node
        for (const [, wayData] of Object.entries(allWays)) {
            const otherWay = wayData as any;
            if (otherWay.nodes && otherWay.nodes.length > 1) {
                const otherWayNodes = otherWay.nodes;
                
                // Check if this way connects to our start
                const lastNodeOfOther = otherWayNodes[otherWayNodes.length - 1];
                const firstNodeOfOther = otherWayNodes[0];
                
                if (lastNodeOfOther === startNode.id || firstNodeOfOther === startNode.id) {
                    // This way connects - calculate its length up to reasonable limit
                    let connectionDistance = 0;
                    for (let i = 0; i < Math.min(otherWayNodes.length - 1, 10); i++) {
                        // Estimate distance (simplified calculation)
                        connectionDistance += 50; // Average segment length estimate
                        if (connectionDistance >= maxDistance) break;
                    }
                    additionalDistance = Math.max(additionalDistance, connectionDistance);
                    break; // Use first good connection found
                }
            }
        }
    }
    
    return Math.min(additionalDistance, maxDistance);
}

/**
 * Highlights a specific street by making its markers thicker
 * @param streetName - Name of the street to highlight
 */
function highlightStreet(streetName: string) {
    // Reset any previously highlighted street
    resetStreetHighlighting();
    
    const streetMarkers = threatMarkersMap.get(streetName);
    if (!streetMarkers || streetMarkers.length === 0) return;
    
    highlightedStreetName = streetName;
    const originalStyles: any[] = [];
    
    streetMarkers.forEach((marker) => {
        // Store original style
        const originalStyle = {
            weight: marker.options.weight || 5,
            opacity: marker.options.opacity || 0.9
        };
        originalStyles.push(originalStyle);
        
        // Apply highlighted style (thicker and more opaque)
        if (marker.setStyle) {
            marker.setStyle({
                weight: (originalStyle.weight || 5) * 2, // Double the thickness
                opacity: Math.min((originalStyle.opacity || 0.9) + 0.2, 1.0) // Increase opacity
            });
        }
    });
    
    // Store original styles for later reset
    originalStreetStyles.set(streetName, originalStyles);
    
    console.log(`🎯 Highlighted street: ${streetName}`);
}

/**
 * Resets street highlighting to normal thickness
 */
function resetStreetHighlighting() {
    if (!highlightedStreetName) return;
    
    const streetMarkers = threatMarkersMap.get(highlightedStreetName);
    const originalStyles = originalStreetStyles.get(highlightedStreetName);
    
    if (streetMarkers && originalStyles) {
        streetMarkers.forEach((marker, index) => {
            const originalStyle = originalStyles[index];
            if (marker.setStyle && originalStyle) {
                marker.setStyle({
                    weight: originalStyle.weight,
                    opacity: originalStyle.opacity
                });
            }
        });
    }
    
    // Clean up
    originalStreetStyles.delete(highlightedStreetName);
    highlightedStreetName = null;
    
    console.log('🔄 Reset street highlighting');
}

/**
 * Toggle edit mode for manual threat editing
 */
function toggleEditMode() {
    isEditMode = !isEditMode;
    const editBtn = document.getElementById('edit-threats-btn');
    
    if (editBtn) {
        if (isEditMode) {
            editBtn.classList.add('active');
            editBtn.title = 'Edit-Modus beenden';
            console.log('🔧 Edit-Modus aktiviert - Klicken Sie auf Zufahrten zum Entfernen oder auf die Karte zum Hinzufügen');
            
            // Enable map click for adding new threats
            setupMapClickForThreatAddition();
            
            // Add delete buttons to existing threats
            addDeleteButtonsToThreats();
            
        } else {
            editBtn.classList.remove('active');
            editBtn.title = 'Zufahrten bearbeiten';
            console.log('🔧 Edit-Modus deaktiviert');
            
            // Disable map click handler
            disableMapClickForThreatAddition();
            
            // Remove delete buttons
            removeDeleteButtonsFromThreats();
        }
    }
}

/**
 * Add delete buttons to existing threat list items
 */
function addDeleteButtonsToThreats() {
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (!threatList) return;
    
    threatList.querySelectorAll('li').forEach((li) => {
        if (!li.querySelector('.delete-threat-btn')) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-threat-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Zufahrt entfernen';
            deleteBtn.style.cssText = `
                float: right;
                background: rgba(239, 68, 68, 0.2);
                border: none;
                color: #ef4444;
                padding: 2px 6px;
                border-radius: 3px;
                cursor: pointer;
                margin-left: 8px;
                font-size: 12px;
            `;
            
            // Extract street name from li text
            const streetName = li.textContent?.split(' (')[0]?.replace(/^[🔴🟠🟡🟢⚪]\s/, '') || '';
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeThreatManually(streetName, li);
            });
            
            li.appendChild(deleteBtn);
        }
    });
}

/**
 * Remove delete buttons from threat list items
 */
function removeDeleteButtonsFromThreats() {
    document.querySelectorAll('.delete-threat-btn').forEach(btn => btn.remove());
}

/**
 * Remove a threat manually
 */
function removeThreatManually(streetName: string, listItem: HTMLLIElement) {
    console.log(`🗑️ Manually removing threat: ${streetName}`);
    
    // Add to manually removed set
    manuallyRemovedThreats.add(streetName);
    
    // Remove from threats map
    if (threatsMap.has(streetName)) {
        threatsMap.delete(streetName);
    }
    
    // Remove visual markers
    const markers = threatMarkersMap.get(streetName);
    if (markers) {
        markers.forEach(marker => {
            if (threatLayerGroup && threatLayerGroup.hasLayer(marker)) {
                threatLayerGroup.removeLayer(marker);
            }
        });
        threatMarkersMap.delete(streetName);
    }
    
    // Remove from list
    listItem.remove();
    
    // Update threat list title
    updateThreatListTitle(threatsMap.size > 0);
    
    console.log(`✅ Threat "${streetName}" removed manually`);
}

/**
 * Setup map click handler for adding new threats
 */
function setupMapClickForThreatAddition() {
    if (map) {
        map.getContainer().style.cursor = 'crosshair';
        map.on('click', handleMapClickForThreatAddition);
    }
}

/**
 * Disable map click handler for adding threats
 */
function disableMapClickForThreatAddition() {
    if (map) {
        map.getContainer().style.cursor = '';
        map.off('click', handleMapClickForThreatAddition);
    }
}

/**
 * Handle map click for adding new threats
 */
function handleMapClickForThreatAddition(e: any) {
    const { lat, lng } = e.latlng;
    console.log(`🎯 Adding new threat at: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    
    // Create a new threat entry
    const threatName = `Manueller Zufahrtspunkt ${Date.now()}`;
    
    // Calculate acceleration distance from click point to security area
    const clickPoint = { lat, lon: lng };
    const accelerationDistance = calculateAccelerationDistanceToSecurityArea(clickPoint);
    
    // Create threat data
    const threatData = {
        entryPoints: [{
            lat: lat,
            lon: lng,
            distance: accelerationDistance
        }],
        pathSegments: [[clickPoint]], // Simple single-point segment
        totalLength: accelerationDistance,
        threatLevel: 5, // Default threat level
        roadType: 'manual',
        maxSpeed: 50 // Default speed limit
    };
    
    // Add to threats map
    threatsMap.set(threatName, threatData);
    manuallyAddedThreats.set(threatName, threatData);
    
    // Create visual markers
    createThreatMarkers(threatName, threatData);
    
    // Re-render threat list
    renderThreatList();
    
    console.log(`✅ Manual threat "${threatName}" added with ${accelerationDistance}m acceleration distance`);
}

/**
 * Calculate acceleration distance from a point to the security area
 */
function calculateAccelerationDistanceToSecurityArea(point: {lat: number, lon: number}): number {
    const activePolygon = drawnPolygons.length > 0 ? drawnPolygons[drawnPolygons.length - 1].polygon : drawnPolygon;
    if (!activePolygon) return 100; // Default if no security area defined
    
    const polygonVertices = activePolygon.getLatLngs()[0].map((ll: any) => ({lat: ll.lat, lon: ll.lng}));
    
    // Find closest point on polygon boundary
    let minDistance = Infinity;
    
    for (let i = 0; i < polygonVertices.length; i++) {
        const p1 = polygonVertices[i];
        const p2 = polygonVertices[(i + 1) % polygonVertices.length];
        
        // Calculate distance from point to line segment
        const distance = getDistanceToLineSegment(point, p1, p2);
        minDistance = Math.min(minDistance, distance);
    }
    
    return Math.max(minDistance, 10); // Minimum 10m
}

/**
 * Calculate distance from point to line segment
 */
function getDistanceToLineSegment(point: {lat: number, lon: number}, lineStart: {lat: number, lon: number}, lineEnd: {lat: number, lon: number}): number {
    // Simplified distance calculation using Haversine
    const distToStart = getHaversineDistance(point, lineStart);
    const distToEnd = getHaversineDistance(point, lineEnd);
    const distToMidpoint = getHaversineDistance(point, {
        lat: (lineStart.lat + lineEnd.lat) / 2,
        lon: (lineStart.lon + lineEnd.lon) / 2
    });
    
    return Math.min(distToStart, distToEnd, distToMidpoint);
}

/**
 * Create visual markers for a threat
 */
function createThreatMarkers(streetName: string, threatData: any) {
    if (!threatLayerGroup) return;
    
    const markers: any[] = [];
    
    // Create entry point markers
    threatData.entryPoints.forEach((point: any) => {
        const circle = L.circle([point.lat, point.lon], {
            radius: 6,
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.8,
            weight: 3
        });
        
        const popupContent = `
            <b>Manueller Zufahrtspunkt</b><br>
            <b>Name:</b> ${streetName}<br>
            <b>Beschleunigungsweg:</b> ${Math.round(point.distance)}m
        `;
        
        circle.bindPopup(popupContent);
        threatLayerGroup.addLayer(circle);
        markers.push(circle);
    });
    
    // Store markers
    threatMarkersMap.set(streetName, markers);
}

/**
 * Setup minimize/close functionality for threat panel
 */
function setupThreatPanelControls() {
    const editBtn = document.getElementById('edit-threats-btn');
    const minimizeBtn = document.getElementById('minimize-threats-btn');
    const closeBtn = document.getElementById('close-threats-btn');
    const threatPanel = document.getElementById('floating-threats');
    
    // Edit mode toggle
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleEditMode();
        });
    }
    
    if (minimizeBtn && threatPanel) {
        minimizeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Toggle the minimized class
            threatPanel.classList.toggle('minimized');
            const isMinimized = threatPanel.classList.contains('minimized');
            
            // Also manually set styles as backup
            const threatPanelContent = threatPanel.querySelector('.threat-panel-content') as HTMLElement;
            if (threatPanelContent) {
                if (isMinimized) {
                    threatPanelContent.style.maxHeight = '0';
                    threatPanelContent.style.opacity = '0';
                    threatPanelContent.style.padding = '0';
                    threatPanelContent.style.margin = '0';
                    threatPanelContent.style.overflow = 'hidden';
                } else {
                    threatPanelContent.style.maxHeight = '';
                    threatPanelContent.style.opacity = '';
                    threatPanelContent.style.padding = '';
                    threatPanelContent.style.margin = '';
                    threatPanelContent.style.overflow = '';
                }
            }
            
            console.log('Panel minimized state changed:', isMinimized);
            
            // Update tooltip with translation
            minimizeBtn.title = isMinimized ? t('threats.maximize') : t('threats.minimize');
            
            // Update button icon
            const icon = minimizeBtn.querySelector('i');
            if (icon) {
                if (isMinimized) {
                    icon.className = 'fas fa-plus';
                } else {
                    icon.className = 'fas fa-minus';
                }
            }
        });
    }
    
    if (closeBtn && threatPanel) {
        closeBtn.addEventListener('click', () => {
            threatPanel.classList.add('view-hidden');
            // Also clear the threat analysis
            clearThreatAnalysis();
        });
    }
}

/**
 * Renders the list of identified threats into the UI based on the current state of threatsMap.
 */
function renderThreatList() {
    const threatList = document.querySelector('.threat-list') as HTMLOListElement;
    if (!threatList) return;
    
    threatList.innerHTML = '';

    if (threatsMap.size === 0) {
        // Reset title to default when no threats
        updateThreatListTitle();
        return; // Nothing to render
    }

    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    const selectedWeight = vehicleSelect.value;
    const accelerationRange = getAccelerationRange(selectedWeight);

    const threatsArray = Array.from(threatsMap.entries()).map(([name, data]) => {
        if (data.entryPoints.length === 0) return null;
        
        const lengthInMeters = Math.round(data.totalLength);
        let maxSpeed = 0;
        
        if (accelerationRange && lengthInMeters > 0) {
            const [, maxAcc] = accelerationRange;
            // Use OSM-enhanced velocity calculation if available
            const pathCoords = data.entryPoints.length > 0 ? [{lat: data.entryPoints[0].lat, lng: data.entryPoints[0].lon}] : undefined;
            maxSpeed = Math.round(calculateVelocityWithOsm(maxAcc, lengthInMeters, pathCoords));
        }
        
        // Enhanced threat data for report generation
        const threatLevel = data.threatLevel || 5;
        const roadType = data.roadType || 'unbekannt';
        const roadMaxSpeed = data.maxSpeed || 50;
        
        return { 
            name, 
            data, 
            maxSpeed, 
            lengthInMeters, 
            threatLevel, 
            roadType, 
            roadMaxSpeed 
        };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    // Sort by threat level first, then by maxSpeed
    threatsArray.sort((a: any, b: any) => {
        // Primary sort: threat level (descending)
        if (a.threatLevel !== b.threatLevel) {
            return b.threatLevel - a.threatLevel;
        }
        // Secondary sort: maxSpeed (descending)
        return b.maxSpeed - a.maxSpeed;
    });

    threatsArray.forEach(({ name, maxSpeed, lengthInMeters, threatLevel, roadType }) => {
        const li = document.createElement('li');
        
        // Enhanced format with threat level indicator
        const threatIcon = threatLevel >= 9 ? '🔴' : 
                         threatLevel >= 7 ? '🟠' : 
                         threatLevel >= 5 ? '🟡' : 
                         threatLevel >= 3 ? '🟢' : '⚪';
        
                // Format: Icon Straßenname (Type/Threat Level) - Beschleunigungsstrecke / Endgeschwindigkeit
        let displayText = `${threatIcon} ${name}`;
        displayText += ` (${roadType}, Level ${threatLevel})`;
        displayText += ` - ${lengthInMeters} m`;
        if (maxSpeed > 0) {
            displayText += ` / ${maxSpeed} km/h`;
        }

        li.textContent = displayText;
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');

        li.addEventListener('click', () => {
            threatList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
            li.classList.add('active');
            
            const markersToZoom = threatMarkersMap.get(name);
            if (markersToZoom && markersToZoom.length > 0) {
                const featureGroup = L.featureGroup(markersToZoom);
                map.fitBounds(featureGroup.getBounds().pad(0.5));
                
                // Highlight the selected street
                highlightStreet(name);
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
    
    // Add Entry Detection results if available
    addEntryDetectionResultsToThreatList(threatList);
    
    // Update the title to show analysis format
    updateThreatListTitle(true);
    
    // Add delete buttons if in edit mode
    if (isEditMode) {
        addDeleteButtonsToThreats();
    }
}

/**
 * Updates the threat list title to show analysis format
 */
function updateThreatListTitle(showAnalysisFormat: boolean = false) {
    const titleElement = document.querySelector('#floating-threats h4');
    if (!titleElement) return;
    
    if (showAnalysisFormat) {
        // Title format: "Gefahrenanalyse (Strecke / Endgeschw.)"
        titleElement.textContent = `${t('threats.title')} (Strecke / Endgeschw.)`;
    } else {
        // Default title
        titleElement.textContent = t('threats.title');
    }
}

/**
 * Analyzes the drawn polygon for potential vehicle threats.
 * It marks the entry points and highlights the approach path to the polygon.
 */
const analyzeAndMarkThreats = async () => {
    // Check if we have any polygons
    if (drawnPolygons.length === 0 && !drawnPolygon) {
        alert(t('alerts.noPolygon'));
        return;
    }
    
    // Validate all polygons are closed
    const polygonsToAnalyze = drawnPolygons.length > 0 ? drawnPolygons : 
        (drawnPolygon ? [{ polygon: drawnPolygon, label: polygonLabel, id: 'legacy' }] : []);
    
    if (polygonsToAnalyze.length === 0) {
        alert(t('alerts.noPolygon'));
        return;
    }
    
    // Check if any polygon is still being drawn (has active waypoints)
    if (isDrawingMode && waypoints.length > 0) {
        alert('Bitte schließen Sie zuerst alle Sicherheitsbereiche, bevor Sie die Gefahrenanalyse starten.');
        return;
    }
    
    // Validate all polygons are properly closed
    for (let i = 0; i < polygonsToAnalyze.length; i++) {
        const { polygon } = polygonsToAnalyze[i];
        if (!polygon.getLatLngs || typeof polygon.getLatLngs !== 'function') {
            console.error(`Invalid polygon ${i + 1} - missing getLatLngs method`);
            alert(`Sicherheitsbereich ${i + 1} ist ungültig. Bitte zeichnen Sie ihn neu.`);
            return;
        }
        
        const polygonCoords = polygon.getLatLngs();
        if (!polygonCoords || polygonCoords.length === 0 || (polygonCoords[0] && polygonCoords[0].length < 3)) {
            console.error(`Polygon ${i + 1} is not closed properly`);
            alert(`Sicherheitsbereich ${i + 1} ist nicht geschlossen. Bitte schließen Sie ihn zuerst.`);
            return;
        }
    }
    
    console.log(`Analyzing threats for ${polygonsToAnalyze.length} security area(s)`);
    
    // For now, analyze the first polygon (can be extended to analyze all)
    const primaryPolygon = polygonsToAnalyze[0].polygon;
    const polygonCoords = primaryPolygon.getLatLngs();

    const loadingIndicator = document.querySelector('.loading-indicator') as HTMLElement;
    if (!loadingIndicator) return;
    
    clearThreatAnalysis({ preserveManualEntries: true });
    loadingIndicator.classList.remove('hidden');

    try {
        const bounds = primaryPolygon.getBounds();
        if (!bounds || !bounds.isValid()) {
            throw new Error('Invalid polygon bounds');
        }

        const buffer = 0.005; // Increased buffer for better road detection 
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const bbox = `${southWest.lat - buffer},${southWest.lng - buffer},${northEast.lat + buffer},${northEast.lng + buffer}`;
        
        console.log('Analysis bounds:', bbox);
        console.log('🔧 THREAT ANALYSIS: Using enhanced query with', 
                   'residential + service + track + cycleway + access roads');
        
        // Define exclusion patterns for filtering unwanted ways BEFORE they are used
        const exclusionPatterns = {
            names: [
                /bikepark/i, /bike\s*park/i, /mountainbike/i, /mtb/i,
                /singletrail/i, /trail/i, /downhill/i, /freeride/i,
                /pumptrack/i, /pump\s*track/i, /bmx/i,
                /skatepark/i, /skate\s*park/i,
                /spielplatz/i, /playground/i,
                /golfplatz/i, /golf/i,
                /wanderweg/i, /hiking/i, /spazierweg/i,
                /serpentin/i, /kurve/i, /schleife/i
            ],
            tags: {
                'sport': ['cycling', 'mtb', 'bmx', 'skateboard', 'golf', 'hiking'],
                'leisure': ['park', 'playground', 'sports_centre', 'track', 'golf_course'],
                'tourism': ['attraction', 'viewpoint'],
                'mtb': ['yes', 'designated'],
                'motor_vehicle': ['no', 'private'],  // Removed 'destination' - Anliegerstraßen sind OK
                'access': ['private', 'no', 'forestry', 'agricultural']
            }
        };
        
        // ============================================================
        // PROVIDER-SYSTEM INTEGRATION für Threat Analysis
        // Priorisiert NRW WFS-Daten über OSM Overpass
        // ============================================================
        let data: { elements: any[] } = { elements: [] };
        let dataSource = 'unknown';
        
        try {
            // STRATEGIE 1: Versuche Provider-System (NRW WFS oder OSM via Provider)
            console.log('🗺️ THREAT ANALYSIS: Attempting Provider System...');
            
            // Extrahiere Polygon-Koordinaten für Provider
            const flatCoords = (polygonCoords as any).flat ? (polygonCoords as any).flat() : polygonCoords;
            const providerPolygonCoords = flatCoords.map((p: any) => ({ lat: p.lat, lng: p.lng }));
            
            try {
                // Importiere Provider-System
                const { fetchRoadNetworkForPolygon } = await import('./src/core/geodata/integration/entryDetectionIntegration.js');
                const { getCurrentProviderId } = await import('./src/core/geodata/integration/mapIntegration.js');
                
                // Hole Daten vom Provider
                const providerData = await fetchRoadNetworkForPolygon(providerPolygonCoords);
                const providerId = getCurrentProviderId();
                
                if (providerData && providerData.nodes && providerData.ways && providerData.ways.length > 0) {
                    console.log(`✅ THREAT ANALYSIS: Provider ${providerId.toUpperCase()} lieferte ${providerData.nodes.length} nodes, ${providerData.ways.length} ways`);
                    dataSource = providerId;
                    
                    // Konvertiere Provider-Daten in das erwartete Overpass-Format
                    const convertedElements: any[] = [];
                    
                    // Konvertiere Nodes
                    for (const node of providerData.nodes) {
                        convertedElements.push({
                            type: 'node',
                            id: node.id,
                            lat: node.lat,
                            lon: node.lon
                        });
                    }
                    
                    // Konvertiere Ways
                    for (const way of providerData.ways) {
                        const tags = way.tags || {};
                        // Setze highway-Tag, falls nicht vorhanden (wichtig für NRW-Daten)
                        if (!tags.highway && !tags.railway) {
                            tags.highway = 'road'; // Default für NRW-Straßendaten
                        }
                        
                        convertedElements.push({
                            type: 'way',
                            id: way.id,
                            nodes: way.nodeIds,
                            tags: tags
                        });
                    }
                    
                    data = { elements: convertedElements };
                    console.log(`🎯 THREAT ANALYSIS: Konvertierte ${convertedElements.length} Elemente aus ${providerId.toUpperCase()}`);
                } else {
                    throw new Error('Provider returned empty or invalid data');
                }
            } catch (providerError) {
                console.warn('⚠️ THREAT ANALYSIS: Provider-System fehlgeschlagen:', providerError);
                console.log('🔄 THREAT ANALYSIS: Fallback zu Overpass API...');
                
                // STRATEGIE 2: Fallback zu Overpass API
                const { fetchOverpassWithFallback, createThreatAnalysisQuery } = await import('./src/utils/overpassHelper.js');
                const query = createThreatAnalysisQuery(bbox, 25);
                console.log('🔍 THREAT ANALYSIS Overpass Query:', query);
                
                data = await fetchOverpassWithFallback(query, {
                    timeout: 25,
                    maxRetries: 2,
                    retryDelay: 2000
                });
                dataSource = 'osm-overpass';
            }
            
            const elementCount = data?.elements?.length || 0;
            console.log(`🎯 THREAT ANALYSIS: ${elementCount} Elemente von ${dataSource.toUpperCase()}`);
            
            // Count different road types for better debugging
            const roadTypes: Record<string, number> = {};
            data?.elements?.forEach((el: any) => {
                if (el.type === 'way' && el.tags?.highway) {
                    roadTypes[el.tags.highway] = (roadTypes[el.tags.highway] || 0) + 1;
                }
            });
            console.log('📊 Road types found:', roadTypes);
            
            // Count excluded ways for user feedback
            let excludedCount = 0;
            data?.elements?.forEach((el: any) => {
                if (el.type === 'way' && el.tags?.highway) {
                    let roadName = el.tags.name;
                    if (!roadName) {
                        if (el.tags.highway === 'residential') roadName = `Wohnstraße (ID:${el.id})`;
                        else if (el.tags.highway === 'service') roadName = `Erschließungsstraße (ID:${el.id})`;
                        else roadName = `${el.tags.highway} (ID:${el.id})`;
                    }
                    
                    if (shouldExcludeWay(roadName, el, [])) { // Empty nodes for pre-check
                        excludedCount++;
                    }
                }
            });
            
            console.log(`🚫 Pre-filtering: ${excludedCount} recreational/restricted ways will be excluded from threat analysis`);
            console.log(`📡 Datenquelle: ${dataSource === 'nrw' ? 'GEOBASIS.NRW (ATKIS)' : dataSource === 'osm' ? 'OpenStreetMap (Provider)' : 'OpenStreetMap (Overpass)'}`);
            
        } catch (error) {
            console.error('🚨 THREAT ANALYSIS Data fetch error:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            alert(`Fehler bei der Gefahrenanalyse: ${errorMsg}. Bitte versuchen Sie es später erneut.`);
            loadingIndicator.classList.add('hidden');
            return;
        }

        const nodes: { [id: number]: { lat: number, lon: number } } = {};
        const ways: { [id: number]: { name: string, nodes: number[], id: number } } = {};

        console.log(`🔍 THREAT ANALYSIS: Processing ${data.elements.length} OSM elements`);
        
        let nodeCount = 0;
        let wayCount = 0;
        let skippedWayCount = 0;

        data.elements.forEach((el: any) => {
            if (el.type === 'node') {
                nodes[el.id] = { lat: el.lat, lon: el.lon };
                nodeCount++;
            } else if (el.type === 'way' && el.tags && (el.tags.highway || el.tags.railway)) {
                // Enhanced name detection for unnamed roads
                let roadName = el.tags.name;
                if (!roadName) {
                    // Generate descriptive name for unnamed roads - German translations
                    const highwayTranslations: { [key: string]: string } = {
                        'residential': 'Wohnstraße',
                        'service': 'Erschließungsstraße',
                        'unclassified': 'Nebenstraße',
                        'track': 'Wirtschaftsweg',
                        'footway': 'Fußweg (unbennant)',
                        'path': 'Pfad (unbennant)',
                        'cycleway': 'Radweg',
                        'pedestrian': 'Fußgängerzone',
                        'living_street': 'Verkehrsberuhigter Bereich',
                        'tertiary': 'Kreisstraße',
                        'secondary': 'Landesstraße',
                        'primary': 'Bundesstraße'
                    };
                    const translatedType = highwayTranslations[el.tags.highway] || el.tags.highway || 'Straße';
                    if (el.tags.ref) roadName = el.tags.ref;
                    else roadName = `${translatedType} (ID:${el.id})`;
                }
                // Check if nodes array exists before adding to ways
                if (el.nodes && Array.isArray(el.nodes) && el.nodes.length > 0) {
                    ways[el.id] = { name: roadName, nodes: el.nodes, id: el.id };
                    wayCount++;
                } else {
                    console.warn(`⚠️ THREAT ANALYSIS: Way ${el.id} has no valid nodes array, skipping`);
                    skippedWayCount++;
                }
                // console.log(`🛣️ THREAT ANALYSIS: Found road "${roadName}" (${el.tags.highway}, ${el.nodes.length} nodes)`); // Reduced logging for performance
            } else if (el.type === 'way') {
                skippedWayCount++;
            }
        });
        
        console.log(`📊 THREAT ANALYSIS: Found ${nodeCount} nodes, ${wayCount} ways (highways/railways), ${skippedWayCount} other ways`);
        console.log(`📊 THREAT ANALYSIS: Ways object contains ${Object.keys(ways).length} entries`);

        // REMOVED: threat priority levels - all road types treated equally for access identification
        // Speed limits will still be used for velocity calculations

        // exclusionPatterns bereits oben definiert

        // Function to analyze path geometry for serpentine patterns
        function isSerpentinePath(wayNodes: any[]): boolean {
            if (wayNodes.length < 4) return false;
            
            let directionChanges = 0;
            let totalAngleChange = 0;
            
            for (let i = 1; i < wayNodes.length - 1; i++) {
                const prev = wayNodes[i - 1];
                const curr = wayNodes[i];
                const next = wayNodes[i + 1];
                
                // Calculate bearing changes
                const bearing1 = Math.atan2(curr.lat - prev.lat, curr.lon - prev.lon);
                const bearing2 = Math.atan2(next.lat - curr.lat, next.lon - curr.lon);
                
                let angleDiff = Math.abs(bearing2 - bearing1);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                
                totalAngleChange += angleDiff;
                
                // Count significant direction changes (> 45 degrees)
                if (angleDiff > Math.PI / 4) {
                    directionChanges++;
                }
            }
            
            // Average angle change per segment
            const avgAngleChange = totalAngleChange / (wayNodes.length - 2);
            
            // Criteria for serpentine path:
            // - Many direction changes relative to path length
            // - High average angle change
            const isSerpentine = (directionChanges / wayNodes.length > 0.3) && (avgAngleChange > Math.PI / 6);
            
            if (isSerpentine) {
                console.log(`🐍 SERPENTINE detected: ${directionChanges} direction changes, avg angle: ${(avgAngleChange * 180 / Math.PI).toFixed(1)}°`);
            }
            
            return isSerpentine;
        }

        // Function to check if a way should be excluded from threat analysis
        function shouldExcludeWay(wayName: string, wayElement: any, wayNodes: any[]): boolean {
            // Check name patterns
            for (const pattern of exclusionPatterns.names) {
                if (pattern.test(wayName)) {
                    console.log(`🚫 EXCLUDED by name pattern "${pattern}": ${wayName}`);
                    return true;
                }
            }
            
            // Check OSM tags
            if (wayElement?.tags) {
                for (const [tagKey, values] of Object.entries(exclusionPatterns.tags)) {
                    const tagValue = wayElement.tags[tagKey];
                    if (tagValue && values.includes(tagValue)) {
                        // Special handling: Don't exclude normal roads that just happen to allow bikes/foot
                        if ((tagKey === 'bicycle' || tagKey === 'foot') && 
                            wayElement.tags.highway && 
                            !['cycleway', 'footway', 'path'].includes(wayElement.tags.highway)) {
                            // This is a normal road that allows bikes/foot - don't exclude
                            continue;
                        }
                        console.log(`🚫 EXCLUDED by tag ${tagKey}=${tagValue}: ${wayName}`);
                        return true;
                    }
                }
                
                // Additional checks for recreational facilities
                if (wayElement.tags.leisure || wayElement.tags.sport || wayElement.tags.tourism) {
                    console.log(`🚫 EXCLUDED as recreational facility: ${wayName}`);
                    return true;
                }
                
                // Check for strict motor vehicle restrictions (but allow 'destination')
                if (wayElement.tags.motor_vehicle === 'no' || 
                    wayElement.tags.motorcar === 'no' ||
                    wayElement.tags.vehicle === 'no') {
                    console.log(`🚫 EXCLUDED by motor vehicle restriction: ${wayName}`);
                    return true;
                }
                
                // Allow motor_vehicle=destination (Anliegerstraßen are legitimate access routes)
                
                // Check for private access or completely restricted access
                if (wayElement.tags.access === 'private' || 
                    wayElement.tags.access === 'no') {
                    console.log(`🚫 EXCLUDED by access restriction: ${wayName}`);
                    return true;
                }
                
                // Only exclude if it's ONLY for bicycles/pedestrians (not mixed use)
                if ((wayElement.tags.bicycle === 'designated' && wayElement.tags.highway === 'cycleway') ||
                    (wayElement.tags.foot === 'designated' && wayElement.tags.highway === 'footway')) {
                    console.log(`🚫 EXCLUDED as dedicated bike/foot path: ${wayName}`);
                    return true;
                }
            }
            
            // Check for serpentine geometry (characteristic of bike trails)
            if (isSerpentinePath(wayNodes)) {
                console.log(`🚫 EXCLUDED as serpentine path (likely recreational): ${wayName}`);
                return true;
            }
            
            return false;
        }

        const threats = new Map<string, { 
            entryPoints: {lat: number, lon: number, distance: number}[], 
            pathSegments: {lat: number, lon: number}[][], 
            totalLength: number,
            threatLevel: number,
            roadType: string,
            maxSpeed: number
        }>();
        
        // Enhanced polygon coordinate extraction with validation
        let polygonVertices: { lat: number, lon: number }[] = [];
        
        try {
            // Handle different polygon coordinate structures
            if (Array.isArray(polygonCoords[0])) {
                // Multi-polygon or complex structure
                if (Array.isArray(polygonCoords[0][0])) {
                    // Nested array structure
                    polygonVertices = polygonCoords[0][0].map((p: any) => ({ 
                        lat: p.lat || p.lat, 
                        lon: p.lng || p.lon 
                    }));
                } else {
                    // Simple array structure
                    polygonVertices = polygonCoords[0].map((p: any) => ({ 
                        lat: p.lat || p.lat, 
                        lon: p.lng || p.lon 
                    }));
                }
            } else {
                // Direct coordinate structure
                polygonVertices = polygonCoords.map((p: any) => ({ 
                    lat: p.lat || p.lat, 
                    lon: p.lng || p.lon 
                }));
            }
            
            // Validate extracted coordinates
            if (polygonVertices.length < 3) {
                throw new Error('Invalid polygon: insufficient vertices');
            }
            
            // Ensure all coordinates are valid numbers
            polygonVertices = polygonVertices.filter(coord => 
                typeof coord.lat === 'number' && 
                typeof coord.lon === 'number' && 
                !isNaN(coord.lat) && 
                !isNaN(coord.lon)
            );
            
            if (polygonVertices.length < 3) {
                throw new Error('Invalid polygon: insufficient valid coordinates');
            }
            
            console.log(`🔸 THREAT ANALYSIS: Extracted ${polygonVertices.length} valid polygon vertices:`, polygonVertices);
            
        } catch (error) {
            console.error('Error extracting polygon coordinates:', error);
            alert(t('alerts.polygonCoordinateError'));
            loadingIndicator.classList.add('hidden');
            return;
        }

        console.log(`🔄 THREAT ANALYSIS: Processing ${Object.keys(ways).length} ways for threat detection`);
        
        let processedWays = 0;
        let excludedWays = 0;
        let validThreats = 0;

        for (const wayId in ways) {
            // First check if the property actually exists and is not inherited
            if (!ways.hasOwnProperty(wayId)) {
                continue;
            }
            
            const way = ways[wayId];
            
            // Safety check
            if (!way || !way.nodes) {
                console.warn(`⚠️ Invalid way data for ID ${wayId}:`, way);
                console.warn(`⚠️ Way type:`, typeof way);
                console.warn(`⚠️ Way keys:`, way ? Object.keys(way) : 'way is null/undefined');
                console.warn(`⚠️ wayId type:`, typeof wayId);
                continue;
            }
            
            const wayNodes = way.nodes.map(id => ({ id, ...nodes[id] })).filter(n => n.lat && n.lon);
            if (wayNodes.length < 2) continue;
            
            processedWays++;

            const wayThreatSegments: { lat: number, lon: number }[][] = [];
            const wayEntryPoints: { lat: number, lon: number, distance: number }[] = [];

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
                        // Calculate FULL acceleration distance - not just to intersection point
                        // This includes the entire road segment that can be used for acceleration
                        let approachDistance = 0;
                        
                        // Calculate total distance from start of way to intersection point
                        for (let k = 0; k < i; k++) {
                            approachDistance += getHaversineDistance(wayNodes[k], wayNodes[k + 1]);
                        }
                        // Add distance from prevNode to intersection point
                        approachDistance += getHaversineDistance(prevNode, intersectionPoint);
                        
                        // ENHANCEMENT: Add additional acceleration distance beyond intersection
                        // Vehicles don't stop at intersections - they continue accelerating
                        let additionalAccelerationDistance = 0;
                        
                        if (isCurrIn) {
                            // Coming from outside - calculate how much road continues inside security area
                            for (let k = i + 1; k < wayNodes.length - 1; k++) {
                                const nextNode = wayNodes[k];
                                const afterNext = wayNodes[k + 1];
                                
                                // Check if still inside security area
                                const isNextIn = isPointInPolygon(nextNode, polygonVertices);
                                const isAfterNextIn = isPointInPolygon(afterNext, polygonVertices);
                                
                                if (isNextIn) {
                                    additionalAccelerationDistance += getHaversineDistance(nextNode, afterNext);
                                    // Continue until we exit the security area or reach reasonable limit
                                    if (!isAfterNextIn || additionalAccelerationDistance > 1000) { // Max 1km additional
                                        break;
                                    }
                                } else {
                                    break;
                                }
                            }
                        } else {
                            // Going from inside to outside - add distance before intersection
                            // This represents the full available acceleration path before reaching security area
                            // (Distance calculation already included in approachDistance above)
                            
                            // Add potential approach distance from connected roads
                            // This simulates continuous acceleration from further away
                            const estimatedApproachExtension = Math.min(approachDistance * 0.5, 500); // Max 500m extension
                            const connectedRoadDistance = calculateExtendedAccelerationDistance(wayNodes, i, ways, 800);
                            additionalAccelerationDistance = Math.max(estimatedApproachExtension, connectedRoadDistance);
                        }
                        
                        // Total acceleration distance includes intersection crossing
                        const totalAccelerationDistance = approachDistance + additionalAccelerationDistance;
                        
                        // Create entry point with enhanced distance calculation
                        const entryPointWithDistance = {
                            lat: intersectionPoint.lat,
                            lon: intersectionPoint.lon,
                            distance: Math.max(totalAccelerationDistance, 10) // Use full acceleration distance, minimum 10m
                        };
                        
                        console.log(`📍 ENHANCED ENTRY POINT: Creating entry point for way "${way.name}" - Base: ${Math.round(approachDistance)}m, Additional: ${Math.round(additionalAccelerationDistance)}m, Total: ${Math.round(totalAccelerationDistance)}m`);
                        
                        wayEntryPoints.push(entryPointWithDistance);
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
                                // More permissive angle threshold for better path tracing
                                if (angle < 120) break; 
                            }
                            pathSegment.push({ lat: traceNode.lat, lon: traceNode.lon });
                        }
                        wayThreatSegments.push(pathSegment);
                    }
                }
            }
            
            if (wayEntryPoints.length > 0) {
                // Find highway type from original OSM data
                const wayElement = data.elements.find((el: any) => el.id === way.id);
                
                // DISABLED: way exclusion - include all ways initially
                // if (shouldExcludeWay(way.name, wayElement, wayNodes)) {
                //     console.log(`🚫 Skipping recreational/restricted way: ${way.name}`);
                //     excludedWays++;
                //     continue; // Skip this way entirely
                // }
                
                if (!threats.has(way.name)) {
                    const roadType = wayElement?.tags?.highway || 'unknown';
                    // REMOVED: baseThreatLevel calculation - all roads treated equally for access identification
                    
                    // Extract max speed from way tags if available - still used for velocity calculations
                    let maxSpeed = 50; // Default speed
                    const wayData = data.elements.find((el: any) => el.id === way.id);
                    if (wayData?.tags?.maxspeed) {
                        const speedMatch = wayData.tags.maxspeed.match(/\d+/);
                        if (speedMatch) {
                            maxSpeed = parseInt(speedMatch[0]);
                        }
                    }
                    
                    // Set uniform threat level for all road types (no road type discrimination)
                    const uniformThreatLevel = 5; // Neutral threat level for all roads
                    
                    threats.set(way.name, { 
                        entryPoints: [], 
                        pathSegments: [], 
                        totalLength: 0,
                        threatLevel: uniformThreatLevel, // Uniform level for all roads
                        roadType: roadType, // Keep for informational purposes
                        maxSpeed: maxSpeed // Keep for velocity calculations
                    });
                    validThreats++;
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
        
        console.log(`📊 THREAT ANALYSIS Results: ${processedWays} ways processed, ${excludedWays} excluded, ${validThreats} valid threats found`);
        
        // Enhanced post-processing: Connect related road segments
        const connectedThreats = new Map<string, { entryPoints: {lat: number, lon: number, distance: number}[], pathSegments: {lat: number, lon: number}[][], totalLength: number, threatLevel: number, roadType: string, maxSpeed: number }>();
        
        for (const [roadName, threatData] of threats) {
            // Check for similar road names that should be combined
            let combinedName = roadName;
            let combinedData = threatData;
            
            // Look for existing similar roads
            for (const [existingName, existingData] of connectedThreats) {
                if (shouldCombineRoads(roadName, existingName)) {
                    combinedName = existingName;
                    combinedData = {
                        entryPoints: [...existingData.entryPoints, ...threatData.entryPoints],
                        pathSegments: [...existingData.pathSegments, ...threatData.pathSegments],
                        totalLength: existingData.totalLength + threatData.totalLength,
                        threatLevel: Math.max(existingData.threatLevel, threatData.threatLevel), // Use highest threat level
                        roadType: existingData.threatLevel >= threatData.threatLevel ? existingData.roadType : threatData.roadType,
                        maxSpeed: Math.max(existingData.maxSpeed, threatData.maxSpeed) // Use highest speed
                    };
                    break;
                }
            }
            
            connectedThreats.set(combinedName, combinedData);
        }
        
        threatsMap = connectedThreats;
        
        if (threatsMap.size > 0) {
            // Prepare a group to hold all overlays so we can clear them reliably later
            if (threatLayerGroup) {
                try { threatLayerGroup.clearLayers(); map.removeLayer(threatLayerGroup); } catch {}
            }
            threatLayerGroup = L.layerGroup().addTo(map);

            // Choose color by estimated speed (worst-case acceleration)
            const vehicleSelectEl = document.getElementById('vehicle-select') as HTMLSelectElement;
            const selectedWeightVal = vehicleSelectEl?.value || 'alle';
            const accRange = getAccelerationRange(selectedWeightVal);
            const usedAcc = accRange ? accRange[1] : 3.0;

            threatsMap.forEach((data, name) => {
                if (data.entryPoints.length === 0) return;
                
                // Determine visual threat level based on threat priority
                const threatLevel = data.threatLevel || 5;
                let circleColor = 'red';
                let fillColor = '#f03';
                let radius = 5;
                
                if (threatLevel >= 9) {
                    // Critical threat - Large red circles
                    circleColor = '#8B0000'; // Dark red
                    fillColor = '#DC143C';   // Crimson
                    radius = 10;
                } else if (threatLevel >= 7) {
                    // High threat - Medium red circles  
                    circleColor = '#B22222'; // Fire brick
                    fillColor = '#FF6347';   // Tomato
                    radius = 8;
                } else if (threatLevel >= 5) {
                    // Medium threat - Standard red circles
                    circleColor = 'red';
                    fillColor = '#f03';
                    radius = 6;
                } else if (threatLevel >= 3) {
                    // Low threat - Orange circles
                    circleColor = '#FF8C00'; // Dark orange
                    fillColor = '#FFA500';   // Orange
                    radius = 5;
                } else {
                    // Minimal threat - Yellow circles
                    circleColor = '#DAA520'; // Goldenrod
                    fillColor = '#FFD700';   // Gold
                    radius = 4;
                }
                
                const currentStreetMarkers: any[] = [];
                data.entryPoints.forEach(point => {
                    const threatDescription = `
                        <b>${t('threats.popupHeader')}</b><br>
                        <b>Straße:</b> ${name}<br>
                        <b>Straßentyp:</b> ${data.roadType || 'unbekannt'}<br>
                        <b>Bedrohungslevel:</b> ${threatLevel}/10<br>
                        <b>Max. Geschwindigkeit:</b> ${data.maxSpeed || 'unbekannt'} km/h
                    `;
                    
                    const threatCircle = L.circle([point.lat, point.lon], {
                        radius: radius, 
                        color: circleColor, 
                        fillColor: fillColor, 
                        fillOpacity: 0.8, 
                        weight: 3
                    }).bindPopup(threatDescription);
                    threatLayerGroup.addLayer(threatCircle);
                    currentStreetMarkers.push(threatCircle);
                });
                data.pathSegments.forEach(segment => {
                    if (segment.length > 1) {
                        const latLngsSegment = segment.map(p => [p.lat, p.lon]);
                        // Determine segment length to estimate speed
                        let segLen = 0;
                        for (let i = 0; i < segment.length - 1; i++) {
                            segLen += getHaversineDistance(segment[i], segment[i+1]);
                        }
                        const vKmH = calculateVelocity(usedAcc, segLen);
                        let color = '#e74c3c'; // default red (>= 50-70 km/h)
                        if (vKmH <= 30) color = '#39b54a';
                        else if (vKmH <= 50) color = '#f1c40f';

                        const threatPath = L.polyline(latLngsSegment, { color, weight: 5, opacity: 0.9 });
                        threatLayerGroup.addLayer(threatPath);
                        currentStreetMarkers.push(threatPath);
                    }
                });
                if (currentStreetMarkers.length > 0) {
                    threatMarkersMap.set(name, currentStreetMarkers);
                }
            });
            renderThreatList(); // Render the list from the new data
            // Show floating panel on the map
            const floating = document.getElementById('floating-threats');
            if (floating) {
                floating.classList.remove('view-hidden');
                floating.classList.remove('minimized'); // Ensure it's expanded when shown
            }
            
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
            const floating = document.getElementById('floating-threats');
            if (floating) {
                floating.classList.remove('view-hidden');
                floating.classList.remove('minimized'); // Ensure it's expanded when shown
            }
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
        
        // Trigger Entry Detection after threat analysis
        console.log('🔍 Triggering Entry Detection after threat analysis...');
        if ((window as any).entryDetectionManager && currentOsmData) {
            await (window as any).entryDetectionManager.detectEntries(drawnPolygon, currentOsmData);
            
            // Create visual markers for Entry Detection candidates
            console.log('🎯 Creating Entry Detection markers...');
            createEntryDetectionMarkers();
        }
        
        // Update product filter after threat analysis completes
        filterProducts();
    }
};

/**
 * Generates structured content for the risk report using the Gemini API.
 * @param context - All necessary data for the AI prompt.
 * @returns A structured object with content for each report section.
 */
async function getAIReportSections(context: any): Promise<any> {
    try {
        const isGithubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
        const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY) as string | undefined;
        
        // DEBUG: API Key Status
        console.log('🔑 API Key Debug:', {
            hasApiKey: !!apiKey,
            keyLength: apiKey?.length || 0,
            keyPrefix: apiKey?.substring(0, 10) + '...' || 'NONE',
            isGithubPages: isGithubPages
        });
        
        if (!apiKey || isGithubPages) {
            // Public demo (GitHub Pages) oder kein Key vorhanden: erzeugen wir statische Platzhalterabschnitte
            console.warn('AI disabled for public/demo build. Using placeholder report sections.');
            return buildReportFromStateFallback(context);
        }
        const ai = new GoogleGenerativeAI(apiKey);
        // Calculate average threat level for recommendations
        const threats = Array.from(threatsMap.values());
        const avgThreatLevel = threats.length > 0 ? 
            threats.reduce((sum, t) => sum + (t.threatLevel || 5), 0) / threats.length : 5;
        
        // Generate intelligent product type recommendations
        const locationContext = generateLocationContext();
        const recommendedProductTypes = recommendProductTypes({
            assetToProtect: context.assetToProtect || '',
            securityLevel: context.securityLevel || 'medium',
            protectionGrade: context.protectionGrade || 'permanent',
            locationContext: locationContext,
            threatLevel: avgThreatLevel
        });
        
        // Enhanced context with threat level analysis, product recommendations, and vehicle dynamics
        // Get client city from hazard analysis
        const hazardFormData = (typeof getHazardAnalysisFormData === 'function') ? getHazardAnalysisFormData() : null;
        const clientCity = hazardFormData?.city || context.locationName?.split(',')[0]?.trim() || 'Kommune';
        
        const enhancedContext = {
            ...context,
            clientCity: clientCity,
            threatAnalysis: generateThreatAnalysisText(),
            highestThreatRoads: getHighestThreatRoads(),
            threatLevelDistribution: getThreatLevelDistribution(),
            locationContext: locationContext,
            recommendedProductTypes: recommendedProductTypes.join(', '),
            averageThreatLevel: avgThreatLevel.toFixed(1),
            productTypeJustification: generateProductTypeJustification(recommendedProductTypes, context.assetToProtect || '', locationContext, avgThreatLevel),
            hazardAssessment: buildHazardAssessmentSummary(),
            // Neue fahrdynamische Daten für Risikobewertung
            vehicleDynamicsTable: calculateVehicleDynamicsTable(),
            energyClassification: getEnergyClassificationSummary()
        };
        
        const prompt = t('ai.reportPrompt', enhancedContext) + 
        `\n\n========== DETAILDATEN FÜR RISIKOBEWERTUNG ==========

ENHANCED THREAT ANALYSIS:
${enhancedContext.threatAnalysis}

HIGHEST THREAT ROADS:
${enhancedContext.highestThreatRoads}

THREAT LEVEL DISTRIBUTION:
${enhancedContext.threatLevelDistribution}

HAZARD ANALYSIS (GEFÄHRDUNGSANALYSE ZUFAHRTSSCHUTZ):
${enhancedContext.hazardAssessment}

========== FAHRDYNAMISCHE ANALYSE ==========

${enhancedContext.vehicleDynamicsTable}

========== ENERGIEKLASSIFIZIERUNG ==========

${enhancedContext.energyClassification}

========== EMPFEHLUNGEN ==========

RECOMMENDED PRODUCT TYPES:
${enhancedContext.recommendedProductTypes}

PRODUCT TYPE JUSTIFICATION:
${enhancedContext.productTypeJustification}

LOCATION CONTEXT: ${enhancedContext.locationContext}
AVERAGE THREAT LEVEL: ${enhancedContext.averageThreatLevel}/10

========== AUSGABEANWEISUNGEN ==========

WICHTIG: 
1. Erstelle den Bericht in ${currentLanguage === 'de' ? 'deutscher' : 'englischer'} Sprache.
2. Verwende formellen Berichtsstil / Verwaltungsdeutsch.
3. Integriere die fahrdynamischen Berechnungen (Geschwindigkeiten, Energien, Energiestufen) in Kapitel 5 und 6.
4. Leite Schutzklassen (SK1/SK2) und Schutzkategorien (A/B/C) nachvollziehbar aus den Energiestufen ab.
5. Wende das ALARP-Prinzip in Kapitel 7 an.
6. Formuliere produktoffen/produktneutral - keine Herstellernamen.
7. Jedes der 11 Kapitel sollte 2-4 Absätze umfassen.
8. Gesamtumfang: mindestens 2000 Wörter.`;

        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const response = await model.generateContent(prompt);
        const result = response.response;
        const text = result.text().trim();
        console.log('📄 AI Response length:', text.length, 'characters');
        
        // Parse AI response - look for chapter headers
        let aiSections: any = {};
        
        // Try JSON first
        try {
            aiSections = JSON.parse(text);
            console.log('✅ Parsed as JSON');
        } catch (e) {
            // Parse by chapter headers (robust parsing)
            console.log('📝 Parsing by chapter headers...');
            
            // Regex patterns for chapter headers
            const chapterPatterns = [
                /\*\*(\d+)\.\s*[^*]+\*\*\n*/g,  // **1. Title**
                /##\s*(\d+)\.\s*[^\n]+\n*/g,    // ## 1. Title
                /(?:^|\n)(\d+)\.\s+[A-ZÄÖÜ][^\n]+\n/g  // 1. Title (at start of line)
            ];
            
            // Split by chapter headers
            const chapterTexts: string[] = [];
            let workingText = text;
            
            // Find all chapter markers
            const markers: {index: number, chapter: number}[] = [];
            for (const pattern of chapterPatterns) {
                let match;
                while ((match = pattern.exec(text)) !== null) {
                    const chapterNum = parseInt(match[1]);
                    if (chapterNum >= 1 && chapterNum <= 11) {
                        markers.push({ index: match.index, chapter: chapterNum });
                    }
                }
            }
            
            // Sort markers and extract text between them
            markers.sort((a, b) => a.index - b.index);
            
            if (markers.length >= 5) {
                console.log(`📊 Found ${markers.length} chapter markers`);
                for (let i = 0; i < markers.length; i++) {
                    const start = markers[i].index;
                    const end = i < markers.length - 1 ? markers[i + 1].index : text.length;
                    const chapterContent = text.substring(start, end).trim();
                    // Remove header from content
                    const cleanContent = chapterContent.replace(/^\*\*\d+\.[^*]+\*\*\s*|^##\s*\d+\.[^\n]+\n|^\d+\.\s+[^\n]+\n/, '').trim();
                    chapterTexts[markers[i].chapter - 1] = cleanContent;
                }
            } else {
                // Fallback: split by double newlines
                console.log('⚠️ Few markers found, using newline split');
                const blocks = text.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
                for (let i = 0; i < Math.min(blocks.length, 11); i++) {
                    chapterTexts[i] = blocks[i];
                }
            }
            
            // Map to aiSections object
            aiSections = {
                chapter1_auftrag: chapterTexts[0] || '',
                chapter2_normen: chapterTexts[1] || '',
                chapter3_bereich: chapterTexts[2] || '',
                chapter4_bedrohung: chapterTexts[3] || '',
                chapter5_methodik: chapterTexts[4] || '',
                chapter6_fahrdynamik: chapterTexts[5] || '',
                chapter7_risiko: chapterTexts[6] || '',
                chapter8_schutzziel: chapterTexts[7] || '',
                chapter9_konzept: chapterTexts[8] || '',
                chapter10_restgefahren: chapterTexts[9] || '',
                chapter11_empfehlung: chapterTexts[10] || ''
            };
        }
        
        // Fill in default content for empty chapters using context data
        const defaultContent = {
            chapter1_auftrag: `Die vorliegende fahrdynamische Risikobewertung wurde im Auftrag der Stadt ${context.locationName?.split(',')[0] || 'Recklinghausen'} durch die BarricadiX GmbH erstellt. Gegenstand der Untersuchung ist die Analyse und Bewertung des Zufahrtsschutzes für "${context.assetToProtect || 'den definierten Schutzbereich'}" am Standort ${context.locationName || 'Standort'}. Der räumliche Geltungsbereich umfasst den definierten Schutzperimeter einschließlich aller identifizierten Zufahrtsvektoren. Zeitraum: ${context.protectionPeriod || 'temporär'}.`,
            chapter2_normen: `Diese Risikobewertung basiert auf den folgenden normativen Grundlagen: DIN SPEC 91414-1:2021 (Risikobeurteilung und Sicherungsgrade), DIN SPEC 91414-2:2022 (Planung von Zufahrtsschutzkonzepten), DIN ISO 22343-1/-2:2025 (Fahrzeugsicherheitsbarrieren), TR "Mobile Fahrzeugsperren" des BMI (Schutzklassen SK1/SK2) sowie die ProPK-Handreichung "Schutz vor Überfahrtaten".`,
            chapter3_bereich: `Der untersuchte Schutzbereich befindet sich in ${context.locationName || 'der Innenstadt'}. Die städtebauliche Situation ist gekennzeichnet durch die typische Innenstadtlage. Im Rahmen der GIS-Analyse wurden ${context.threatCount || 'mehrere'} Zufahrtswege identifiziert.`,
            chapter4_bedrohung: `Die Bedrohungsanalyse berücksichtigt das Szenario "Vehicle-as-a-Weapon" (VaW). Relevante Prüffahrzeugkategorien gemäß IWA 14-1 umfassen M1/Pkw (1.500 kg), N1/Transporter (3.500 kg) bis N3G/4-Achser (36.000 kg). Das durchschnittliche Bedrohungsniveau liegt bei ${context.averageThreatLevel || '5.0'}/10.`,
            chapter5_methodik: `Die fahrdynamische Modellierung erfolgt nach dem Newton-Euler-Formalismus der klassischen Mehrkörperdynamik. Die Berechnung der maximalen Aufprallgeschwindigkeit erfolgt nach v = √(2·a·s), die kinetische Energie nach E = 0,5·m·v². Es werden zehn normative Prüffahrzeugklassen gemäß IWA 14-1 / PAS 68 (M1 bis N3G, 1.500 kg bis 36.000 kg) berücksichtigt.`,
            chapter6_fahrdynamik: `Die fahrdynamische Analyse umfasst die systematische Berechnung der maximalen Aufprallenergie für jede identifizierte Zufahrt. Die Ergebnisse werden in die Energiekategorien E1 (<250 kJ), E2 (250-800 kJ), E3 (800-1950 kJ) und E4 (>1950 kJ) klassifiziert. Die detaillierten Berechnungen sind dem Anhang zu entnehmen.`,
            chapter7_risiko: `Die Risikobewertung erfolgt nach dem ALARP-Prinzip ("As Low As Reasonably Practicable"). Zufahrten mit E4-Energien erfordern Hochsicherheitsbarrieren, E2-E3 Energien erfordern eine Kosten-Nutzen-Abwägung, E1-Energien erlauben einfache Absperrungen.`,
            chapter8_schutzziel: `Das Schutzziel besteht in der Verhinderung des unberechtigten Eindringens mehrspuriger Kraftfahrzeuge in den Schutzbereich. Der abgeleitete Sicherungsgrad ${context.protectionGrade || 'SG2'} ergibt sich aus der Risikoanalyse gemäß DIN SPEC 91414-1.`,
            chapter9_konzept: `Basierend auf der Analyse werden die Zufahrten kategorisiert: Kategorie A (hochkritisch, SK2-Barrieren), Kategorie B (mittlerer Schutzbedarf, SK1-Barrieren) und Kategorie C (geringer Schutzbedarf, einfache Sperren). Empfohlene Systemtypen: ${context.recommendedProductTypes || 'Poller, mobile Sperren, Betonelemente'}.`,
            chapter10_restgefahren: `Auch bei Umsetzung der Maßnahmen verbleiben Restgefahren: atypische Fahrzeuge, kombinierte Angriffsszenarien sowie mögliche Fehlbedienungen. Das Betriebskonzept umfasst Personalschulung, Wartungsintervalle und ein Notfallkonzept. Überprüfung der Risikobewertung in 12-monatigen Intervallen.`,
            chapter11_empfehlung: `Mit der Umsetzung der empfohlenen SK1- und SK2-Maßnahmen kann das Risiko auf ein ALARP-konformes Niveau reduziert werden. Die Detailplanung sollte in Abstimmung mit den zuständigen Sicherheitsbehörden erfolgen. Nächste Schritte: Abstimmung, Detailplanung, Ausschreibung, Umsetzung.`
        };
        
        // Apply defaults for empty chapters
        for (const [key, defaultText] of Object.entries(defaultContent)) {
            if (!aiSections[key] || aiSections[key].length < 50) {
                console.log(`⚠️ Using default for ${key} (was ${aiSections[key]?.length || 0} chars)`);
                aiSections[key] = defaultText;
            }
        }
        
        console.log('📊 Chapter lengths:', Object.entries(aiSections).map(([k, v]) => `${k}: ${(v as string).length}`).join(', '));
        
        // KI-Text nachträglich übersetzen, falls er in der falschen Sprache ist
        return translateAISections(aiSections);

    } catch (error) {
        console.error("Fehler bei der Gemini-API-Anfrage für den Bericht:", error);
        console.warn("Using fallback report sections due to AI error");
        // Fallback to static sections instead of null
        return buildReportFromStateFallback(context);
    }
}

/**
 * Übersetzt KI-generierte Berichtsabschnitte in die gewählte Sprache
 * @param aiSections - Die von der KI generierten Berichtsabschnitte
 * @returns Übersetzte Berichtsabschnitte
 */
function translateAISections(aiSections: any): any {
    // Prüfe, ob der Text bereits in der richtigen Sprache ist
    const isGerman = currentLanguage === 'de';
    const sampleText = aiSections.purpose || aiSections.threatAnalysis || '';
    
    // Einfache Erkennung der Sprache (Deutsch vs. Englisch)
    const germanWords = ['der', 'die', 'das', 'und', 'für', 'von', 'mit', 'bei', 'auf', 'in', 'an', 'zu', 'zur', 'zum'];
    const englishWords = ['the', 'and', 'for', 'of', 'with', 'at', 'on', 'in', 'to', 'from', 'by', 'as', 'is', 'are'];
    
    const germanCount = germanWords.filter(word => sampleText.toLowerCase().includes(word)).length;
    const englishCount = englishWords.filter(word => sampleText.toLowerCase().includes(word)).length;
    
    const textIsGerman = germanCount > englishCount;
    const needsTranslation = (isGerman && !textIsGerman) || (!isGerman && textIsGerman);
    
    if (!needsTranslation) {
        console.log('AI text is already in correct language, no translation needed');
        return aiSections;
    }
    
    console.log('AI text needs translation. Current language:', currentLanguage, 'Text language:', textIsGerman ? 'German' : 'English');
    
    // Übersetze alle Abschnitte
    const translatedSections: any = {};
    
    for (const [key, text] of Object.entries(aiSections)) {
        if (typeof text === 'string') {
            translatedSections[key] = translateAIText(text, isGerman);
        } else {
            translatedSections[key] = text;
        }
    }
    
    return translatedSections;
}

/**
 * Übersetzt einen einzelnen KI-Text in die gewählte Sprache
 * @param text - Der zu übersetzende Text
 * @param targetGerman - Zielsprache ist Deutsch
 * @returns Übersetzter Text
 */
function translateAIText(text: string, targetGerman: boolean): string {
    if (targetGerman) {
        // Übersetze von Englisch nach Deutsch
        return text
            .replace(/\bThis report\b/gi, 'Dieser Bericht')
            .replace(/\baims to\b/gi, 'zielt darauf ab')
            .replace(/\bidentify\b/gi, 'zu identifizieren')
            .replace(/\bassess\b/gi, 'zu bewerten')
            .replace(/\bmitigate\b/gi, 'zu mindern')
            .replace(/\bpotential\b/gi, 'potenzielle')
            .replace(/\brisks\b/gi, 'Risiken')
            .replace(/\bassets\b/gi, 'Schutzgüter')
            .replace(/\bensuring\b/gi, 'um sicherzustellen')
            .replace(/\bbusiness continuity\b/gi, 'Geschäftskontinuität')
            .replace(/\bstrategic\b/gi, 'strategische')
            .replace(/\bsecurity\b/gi, 'Sicherheits')
            .replace(/\binvestments\b/gi, 'Investitionen')
            .replace(/\bThe primary threat\b/gi, 'Die primäre Bedrohung')
            .replace(/\bis\b/gi, 'ist')
            .replace(/\buse of vehicles\b/gi, 'die Nutzung von Fahrzeugen')
            .replace(/\bvehicle as weapon\b/gi, 'Fahrzeug als Waffe')
            .replace(/\bram attack\b/gi, 'Rammangriff')
            .replace(/\bvehicle impact\b/gi, 'Fahrzeuganprall')
            .replace(/\bcrash barrier\b/gi, 'Anprallbarriere')
            .replace(/\bsecurity barrier\b/gi, 'Sicherheitsbarriere')
            .replace(/\bpenetration depth\b/gi, 'Eindringtiefe')
            .replace(/\bdebris scatter\b/gi, 'Trümmerstreuung')
            .replace(/\bas\b/gi, 'als')
            .replace(/\bweapon\b/gi, 'Waffe')
            .replace(/\bPotential\b/gi, 'Potenzielle')
            .replace(/\badversaries\b/gi, 'Gegner')
            .replace(/\binclude\b/gi, 'umfassen')
            .replace(/\bstate-sponsored\b/gi, 'staatsgestützte')
            .replace(/\bterrorist\b/gi, 'terroristische')
            .replace(/\bvehicle threats\b/gi, 'Fahrzeugbedrohungen')
            .replace(/\bvehicle attacks\b/gi, 'Fahrzeugangriffe')
            .replace(/\bram attacks\b/gi, 'Rammangriffe')
            .replace(/\battacks\b/gi, 'Angriffe')
            .replace(/\bGiven\b/gi, 'Angesichts')
            .replace(/\bglobal\b/gi, 'globaler')
            .replace(/\btrends\b/gi, 'Trends')
            .replace(/\band\b/gi, 'und')
            .replace(/\bthe\b/gi, 'der')
            .replace(/\bof\b/gi, 'von')
            .replace(/\bto\b/gi, 'zu')
            .replace(/\bin\b/gi, 'in')
            .replace(/\bon\b/gi, 'auf')
            .replace(/\bat\b/gi, 'bei')
            .replace(/\bwith\b/gi, 'mit')
            .replace(/\bfor\b/gi, 'für')
            .replace(/\bfrom\b/gi, 'von')
            .replace(/\bby\b/gi, 'durch')
            .replace(/\bas\b/gi, 'als')
            .replace(/\bis\b/gi, 'ist')
            .replace(/\bare\b/gi, 'sind')
            .replace(/\bwas\b/gi, 'war')
            .replace(/\bwere\b/gi, 'waren')
            .replace(/\bwill\b/gi, 'wird')
            .replace(/\bwould\b/gi, 'würde')
            .replace(/\bcould\b/gi, 'könnte')
            .replace(/\bshould\b/gi, 'sollte')
            .replace(/\bmay\b/gi, 'kann')
            .replace(/\bmight\b/gi, 'könnte')
            .replace(/\bcan\b/gi, 'kann');
    } else {
        // Übersetze von Deutsch nach Englisch
        return text
            .replace(/\bDieser Bericht\b/gi, 'This report')
            .replace(/\bzielt darauf ab\b/gi, 'aims to')
            .replace(/\bzu identifizieren\b/gi, 'identify')
            .replace(/\bzu bewerten\b/gi, 'assess')
            .replace(/\bzu mindern\b/gi, 'mitigate')
            .replace(/\bpotenzielle\b/gi, 'potential')
            .replace(/\bRisiken\b/gi, 'risks')
            .replace(/\bSchutzgüter\b/gi, 'assets')
            .replace(/\bum sicherzustellen\b/gi, 'ensuring')
            .replace(/\bGeschäftskontinuität\b/gi, 'business continuity')
            .replace(/\bstrategische\b/gi, 'strategic')
            .replace(/\bSicherheits\b/gi, 'security')
            .replace(/\bInvestitionen\b/gi, 'investments')
            .replace(/\bDie primäre Bedrohung\b/gi, 'The primary threat')
            .replace(/\bist\b/gi, 'is')
            .replace(/\bdie Nutzung von Fahrzeugen\b/gi, 'use of vehicles')
            .replace(/\bals\b/gi, 'as')
            .replace(/\bWaffe\b/gi, 'weapon')
            .replace(/\bPotenzielle\b/gi, 'Potential')
            .replace(/\bGegner\b/gi, 'adversaries')
            .replace(/\bumfassen\b/gi, 'include')
            .replace(/\bstaatsgestützte\b/gi, 'state-sponsored')
            .replace(/\bterroristische\b/gi, 'terrorist')
            .replace(/\bFahrzeugbedrohungen\b/gi, 'vehicle threats')
            .replace(/\bFahrzeugangriffe\b/gi, 'vehicle attacks')
            .replace(/\bRammangriffe\b/gi, 'ram attacks')
            .replace(/\bAngriffe\b/gi, 'attacks')
            .replace(/\bAngesichts\b/gi, 'Given')
            .replace(/\bglobaler\b/gi, 'global')
            .replace(/\bTrends\b/gi, 'trends')
            .replace(/\bund\b/gi, 'and')
            .replace(/\bder\b/gi, 'the')
            .replace(/\bvon\b/gi, 'of')
            .replace(/\bzu\b/gi, 'to')
            .replace(/\bin\b/gi, 'in')
            .replace(/\bauf\b/gi, 'on')
            .replace(/\bbei\b/gi, 'at')
            .replace(/\bmit\b/gi, 'with')
            .replace(/\bfür\b/gi, 'for')
            .replace(/\bdurch\b/gi, 'by')
            .replace(/\bist\b/gi, 'is')
            .replace(/\bsind\b/gi, 'are')
            .replace(/\bwar\b/gi, 'was')
            .replace(/\bwaren\b/gi, 'were')
            .replace(/\bwird\b/gi, 'will')
            .replace(/\bwürde\b/gi, 'would')
            .replace(/\bkönnte\b/gi, 'could')
            .replace(/\bsollte\b/gi, 'should')
            .replace(/\bkann\b/gi, 'may');
    }
}

function buildReportFromStateFallback(context: any) {
    try {
        const ps = (window as any).planningState || {};
        const undefinedValue = t('report.undefinedValue');
        const rawAssets = ps.schutzgüter ?? ps.schutzgueter;
        const assetList = Array.isArray(rawAssets)
            ? rawAssets.filter(Boolean)
            : rawAssets
                ? [rawAssets]
                : [];
        const assetDescriptor = assetList.length > 0
            ? assetList.join(', ')
            : (context.assetToProtect && context.assetToProtect !== t('report.undefinedAsset')
                ? context.assetToProtect
                : t('report.undefinedAsset'));
        const locationName = context.locationName || t('report.undefinedLocation');
        const securityLevelText = context.securityLevel || undefinedValue;
        const protectionGradeText = context.protectionGrade || undefinedValue;
        const protectionPeriodText = context.protectionPeriod || undefinedValue;
        const productTypeText = context.productType || undefinedValue;
        const penetrationText = context.penetration || undefinedValue;
        const debrisDistanceText = context.debrisDistance || undefinedValue;
        const groundText = ps.risiko?.site?.untergrund || undefinedValue;
        const residualRiskText = ps.restrisiko?.klasse || protectionGradeText;
        
        // Get hazard analysis data
        const hazardData = (typeof getHazardAnalysisFormData === 'function') ? getHazardAnalysisFormData() : null;
        const hazardCity = hazardData?.city || '';
        const hazardArea = hazardData?.area || '';
        const hazardDamageLabel = hazardData?.expectedDamageLabel || '';
        const hazardAvgScore = hazardData?.averageScore || 0;
        const hazardTotalScore = hazardData?.totalScore || 0;
        const hazardMaxScore = hazardData?.maxPossibleScore || 0;
        
        // Derive risk classification from hazard assessment
        let hazardRiskClass = '';
        if (hazardAvgScore > 0) {
            if (hazardAvgScore <= 1.5) hazardRiskClass = currentLanguage === 'de' ? 'NIEDRIG' : 'LOW';
            else if (hazardAvgScore <= 2.0) hazardRiskClass = currentLanguage === 'de' ? 'MITTEL' : 'MEDIUM';
            else if (hazardAvgScore <= 2.5) hazardRiskClass = currentLanguage === 'de' ? 'ERHÖHT' : 'ELEVATED';
            else hazardRiskClass = currentLanguage === 'de' ? 'HOCH' : 'HIGH';
        }
        
        // Extract rated factors by category for detailed reporting
        const ratedFactors = hazardData?.factors?.filter((f: any) => f.value !== null) || [];
        const anlassBelange = ratedFactors.filter((f: any) => f.category === 'Anlassbezogene Belange');
        const raumBelange = ratedFactors.filter((f: any) => f.category === 'Räumliche Belange');
        const securityBelange = ratedFactors.filter((f: any) => f.category === 'Weitere Sicherheitsbelange');
        const tatBelange = ratedFactors.filter((f: any) => f.category === 'Tatbeeinflussende Belange');
        
        const corridorNamesFromState = Array.isArray(ps.risiko?.site?.anfahrkorridore)
            ? ps.risiko.site.anfahrkorridore
                .map((corr: any) => corr?.name || corr?.bezeichnung || corr?.label || corr?.strasse || corr?.straße)
                .filter(Boolean)
            : [];
        const corridorNamesFromMap = Array.from(threatsMap.keys());
        const corridorNames = Array.from(new Set([...corridorNamesFromState, ...corridorNamesFromMap]));
        const corridorCount = corridorNames.length;
        const corridorSentence = corridorNames.length > 0
            ? (currentLanguage === 'de'
                ? `${corridorNames.length} Zufahrten (${corridorNames.join(', ')})`
                : `${corridorNames.length} access routes (${corridorNames.join(', ')})`)
            : (currentLanguage === 'de'
                ? 'keine detaillierten Zufahrten dokumentiert'
                : 'no detailed access routes documented');
        
        const threatsArray = Array.from(threatsMap.entries());
        const averageThreatLevelValue = threatsArray.length > 0
            ? threatsArray.reduce((sum, [, data]) => sum + (data.threatLevel || 5), 0) / threatsArray.length
            : null;
        const averageThreatLevelText = averageThreatLevelValue
            ? `${averageThreatLevelValue.toFixed(1)}/10`
            : (currentLanguage === 'de' ? 'keine belastbaren Daten' : 'no reliable data');
        
        const longestCorridor = threatsArray.reduce<{ name: string; length: number; maxSpeed: number }>((longest, [name, data]) => {
            const length = Math.round(data.totalLength || 0);
            if (length > longest.length) {
                return { name, length, maxSpeed: data.maxSpeed || 0 };
            }
            return longest;
        }, { name: '', length: 0, maxSpeed: 0 });
        
        const corridorHighlight = longestCorridor.name
            ? (currentLanguage === 'de'
                ? `${longestCorridor.name} mit ca. ${longestCorridor.length} m Beschleunigungsstrecke`
                : `${longestCorridor.name} with roughly ${longestCorridor.length} m of approach distance`)
            : (currentLanguage === 'de'
                ? 'die längeren, nahezu hindernisfreien Achsen'
                : 'the longer, unobstructed approaches');
        
        // Build detailed corridor analysis
        const corridorDetails = threatsArray.map(([name, data]) => {
            const length = Math.round(data.totalLength || 0);
            const minSpeed = Math.round(data.minSpeed || 0);
            const maxSpeed = Math.round(data.maxSpeed || 0);
            return currentLanguage === 'de'
                ? `${name} (${length} m, ${minSpeed}–${maxSpeed} km/h)`
                : `${name} (${length} m, ${minSpeed}–${maxSpeed} km/h)`;
        }).join('; ');
        
        const parseSpeed = (value: any) => {
            if (typeof value === 'number' && !isNaN(value)) return value;
            if (typeof value === 'string') {
                const normalized = parseFloat(value.replace(',', '.'));
                return isNaN(normalized) ? null : normalized;
            }
            return null;
        };
        const plannedSpeed = parseSpeed(ps.risiko?.dynamik?.v_kmh);
        const maxMapSpeed = threatsArray.length > 0
            ? Math.max(...threatsArray.map(([, data]) => data.maxSpeed || 0))
            : null;
        const representativeSpeed = plannedSpeed ?? (maxMapSpeed !== null && isFinite(maxMapSpeed) ? maxMapSpeed : null);
        const speedSentence = representativeSpeed
            ? (currentLanguage === 'de'
                ? `Die erwarteten Annäherungsgeschwindigkeiten liegen bei rund ${Math.round(representativeSpeed)} km/h`
                : `Expected approach speeds are roughly ${Math.round(representativeSpeed)} km/h`)
            : (currentLanguage === 'de'
                ? 'Mangels Messwerten wird mit konservativen Annäherungsgeschwindigkeiten gerechnet'
                : 'In absence of measurements, conservative approach speeds are assumed');
        
        // Build hazard assessment paragraph
        const hazardParagraph = hazardAvgScore > 0
            ? (currentLanguage === 'de'
                ? `Die Gefährdungsanalyse im Eingabedialog ergab eine durchschnittliche Bewertung von ${hazardAvgScore.toFixed(1)} (Gesamtpunktzahl: ${hazardTotalScore}/${hazardMaxScore}), was einer Gefährdungseinstufung "${hazardRiskClass}" entspricht.${hazardDamageLabel ? ` Das erwartete Schadensausmaß wurde als "${hazardDamageLabel}" eingeschätzt.` : ''}`
                : `The hazard analysis input yielded an average rating of ${hazardAvgScore.toFixed(1)} (total score: ${hazardTotalScore}/${hazardMaxScore}), corresponding to a "${hazardRiskClass}" risk classification.${hazardDamageLabel ? ` Expected damage level was assessed as "${hazardDamageLabel}".` : ''}`)
            : '';
        
        // Build detailed factor-based insights with individual factor listings
        const formatFactorList = (factors: any[], categoryName: string) => {
            if (factors.length === 0) return '';
            const factorStrings = factors.map((f: any) => {
                const valueLabel = f.value === 1 ? 'gering' : f.value === 2 ? 'mittel' : f.value === 3 ? 'hoch' : '';
                return `${f.label} (${valueLabel})`;
            });
            return `${categoryName}: ${factorStrings.join(', ')}`;
        };
        
        const formatFactorListEn = (factors: any[], categoryName: string) => {
            if (factors.length === 0) return '';
            const factorStrings = factors.map((f: any) => {
                const valueLabel = f.value === 1 ? 'low' : f.value === 2 ? 'medium' : f.value === 3 ? 'high' : '';
                return `${f.label} (${valueLabel})`;
            });
            return `${categoryName}: ${factorStrings.join(', ')}`;
        };
        
        let factorInsights = '';
        if (ratedFactors.length > 0) {
            if (currentLanguage === 'de') {
                const parts = [];
                parts.push(`Im Rahmen der Gefährdungsanalyse wurden ${ratedFactors.length} Bewertungsfaktoren erfasst:`);
                if (anlassBelange.length > 0) parts.push(formatFactorList(anlassBelange, 'Anlassbezogene Belange'));
                if (raumBelange.length > 0) parts.push(formatFactorList(raumBelange, 'Räumliche Belange'));
                if (securityBelange.length > 0) parts.push(formatFactorList(securityBelange, 'Sicherheitsbelange'));
                if (tatBelange.length > 0) parts.push(formatFactorList(tatBelange, 'Tatbeeinflussende Belange'));
                factorInsights = parts.join(' ');
            } else {
                const parts = [];
                parts.push(`The hazard analysis recorded ${ratedFactors.length} assessment factors:`);
                if (anlassBelange.length > 0) parts.push(formatFactorListEn(anlassBelange, 'Event-related factors'));
                if (raumBelange.length > 0) parts.push(formatFactorListEn(raumBelange, 'Spatial factors'));
                if (securityBelange.length > 0) parts.push(formatFactorListEn(securityBelange, 'Security factors'));
                if (tatBelange.length > 0) parts.push(formatFactorListEn(tatBelange, 'Attack-influencing factors'));
                factorInsights = parts.join(' ');
            }
        }
        
        if (currentLanguage === 'de') {
            const chapter1 = `Diese Betriebsanforderung nach DIN SPEC 91414-2 Anhang E dokumentiert das Zufahrtsschutzkonzept für ${assetDescriptor} am Standort ${locationName}${hazardCity ? ` (${hazardCity}${hazardArea ? ', ' + hazardArea : ''})` : ''}. Das Konzept dient der nachvollziehbaren Planung des Zufahrtsschutzes gegen vorsätzliche Überfahrtaten und orientiert sich an DIN SPEC 91414-2, DIN ISO 22343-2 sowie der polizeilichen Weicht-Handreichung zu Überfahrtaten.

Das angestrebte Sicherheitsniveau wurde als "${securityLevelText}" definiert, woraus sich der Sicherungsgrad "${protectionGradeText}" ableitet. Der Schutzzeitraum ist als "${protectionPeriodText}" festgelegt. Die Betriebsanforderung beschreibt, was der Betreiber vom Zufahrtsschutzkonzept erwarten kann – von der Planung über die Umsetzung bis zum laufenden Betrieb.`;

            const chapter2 = `Als normative Grundlagen dienen DIN SPEC 91414-1/-2 (Zufahrtsschutzkonzepte und Risikobeurteilung), DIN ISO 22343-1/-2 (Fahrzeugsicherheitsbarrieren – Leistungsanforderungen und Anwendung), die Technische Richtlinie „Mobile Fahrzeugsperren" sowie einschlägige polizeiliche Handreichungen.

Die DIN SPEC 91414-2 definiert den Prozess der Risikobeurteilung und Sicherungsgradermittlung für den Zufahrtsschutz. DIN ISO 22343-1 legt die Prüfmethoden für Fahrzeugsicherheitsbarrieren fest, während DIN ISO 22343-2 die Anwendungsregeln und Leistungsanforderungen spezifiziert. Ergänzend werden PAS 68/69 (UK), IWA 14-1/-2 (international) sowie die ASTM F2656 (USA) als anerkannte Prüfstandards herangezogen.

Dieser Bericht ersetzt keine hoheitliche Gefährdungsbewertung der zuständigen Sicherheitsbehörden.`;

            const chapter3 = `Der zu schützende Bereich umfasst ${assetDescriptor} am Standort ${locationName}${hazardCity ? ` in ${hazardCity}` : ''}${hazardArea ? ` (${hazardArea})` : ''}. Die GIS-gestützte Analyse des Schutzbereichs identifizierte ${corridorSentence}.

Der Schutzbereich ist charakterisiert durch seine städtebauliche Einbettung und die vorhandene Infrastruktur. Die Zufahrtsmöglichkeiten variieren hinsichtlich Breite, Länge der Beschleunigungsstrecke und vorhandener natürlicher Hindernisse. Besonders kritisch erscheint ${corridorHighlight}.

Die Bodengegebenheiten (${groundText}) beeinflussen die Auswahlmöglichkeiten für Fahrzeugsicherheitsbarrieren und deren Verankerungsmethoden.`;

            const chapter4 = `${speedSentence}. Die Bedrohungsszenarien folgen dem polizeilichen Vehicle-as-a-Weapon-Bild und berücksichtigen unterschiedliche Fahrzeugmassen von PKW bis hin zu schweren Nutzfahrzeugen. Die GIS-Analyse identifizierte ${corridorSentence} mit einem durchschnittlichen Bedrohungsniveau von ${averageThreatLevelText}.

${hazardParagraph} ${factorInsights}

Die Risikobewertung erfolgt qualitativ nach einer Matrix aus Eintrittswahrscheinlichkeit und Schadensausmaß gemäß DIN SPEC 91414-2. Hieraus leitet sich der Sicherungsgrad ${protectionGradeText} ab. Es wird ausdrücklich darauf hingewiesen, dass die konkrete Gefährdungsbewertung originär bei den zuständigen Sicherheitsbehörden liegt.`;

            const chapter5 = `Die BarricadiX-Analysemethodik kombiniert GIS-gestützte Geländeanalyse mit fahrdynamischen Berechnungen nach den Grundsätzen der DIN ISO 22343-2. Für jede identifizierte Zufahrt werden Beschleunigungsstrecke, erreichbare Geschwindigkeit und resultierende kinetische Energie ermittelt.

Die Berechnung der Aufprallgeschwindigkeit erfolgt nach der Formel v = √(2·a·s), wobei a die fahrzeugklassenspezifische Beschleunigung und s die effektive Anfahrtsstrecke bezeichnet. Die kinetische Energie E = ½·m·v² bestimmt die erforderliche Leistungsklasse der Fahrzeugsicherheitsbarriere.

Die Fahrzeugklassen nach DIN ISO 22343-2 (2025) reichen von M1 (PKW, 1.500 kg) über N1G (Pick-up, 2.500 kg) bis N3G (4-achsiger Frontlenker, 30.000 kg). Jede Klasse hat charakteristische Beschleunigungswerte, die in die Energieberechnung einfließen.`;

            const chapter6 = `Die fahrdynamische Analyse berechnet für jede Zufahrt die maximal erreichbaren Geschwindigkeiten und resultierenden Anprallenergien. Insgesamt wurden ${corridorCount} Zufahrten analysiert: ${corridorDetails || corridorSentence}.

Die Energiestufen nach DIN ISO 22343-2 klassifizieren die Anprallenergie: E1 (< 250 kJ), E2 (250-800 kJ), E3 (800-1.950 kJ) und E4 (> 1.950 kJ). Aus der Energiestufe leitet sich direkt die erforderliche Schutzklasse der Barriere ab.

Die detaillierten Berechnungsergebnisse für alle Fahrzeugklassen und Zufahrten sind im Anhang A dokumentiert, einschließlich der Worst-Case-Szenarien für die kritischsten Kombinationen aus Fahrzeugmasse, Beschleunigung und Anfahrtsstrecke.`;

            const chapter7 = `Die Schwachstellenanalyse nach DIN SPEC 91414-2 untersucht systematisch die Übergänge von Zone 0 (öffentlicher Verkehrsraum) über die Übergangszone hin zur Schutzzone und identifiziert lange, hindernisarme Achsen als besonders kritisch.

Insgesamt wurden ${corridorCount} Zufahrtsmöglichkeiten identifiziert: ${corridorDetails || corridorSentence}. Besonders kritisch erscheint ${corridorHighlight}, da hier weite Beschleunigungsräume ohne natürliche Hindernisse vorliegen. Die vorhandenen Boden- und Umfeldbedingungen (${groundText}) bieten nur begrenzten natürlichen Verzögerungsraum.

Das ALARP-Prinzip (As Low As Reasonably Practicable) fordert die Reduzierung von Risiken auf ein vernünftigerweise erreichbares Minimum unter Berücksichtigung von Verhältnismäßigkeit und Machbarkeit.`;

            const chapter8 = `Aus der Risikoanalyse leitet sich der Sicherungsgrad ${protectionGradeText} ab. Dieser definiert die Mindestanforderungen an die einzusetzenden Fahrzeugsicherheitsbarrieren gemäß DIN SPEC 91414-2.

Die Sicherungsgrade SG0 bis SG4 korrespondieren mit steigenden Schutzanforderungen, wobei SG0 keinen besonderen Schutz und SG4 den höchsten Schutz gegen schwere Fahrzeuge bei hohen Geschwindigkeiten darstellt. Die Zuordnung berücksichtigt die maximal zu erwartende kinetische Energie an jeder Zufahrt.

Das Schutzziel umfasst: Verhinderung des Durchbruchs in die Schutzzone, Begrenzung der Eindringtiefe auf akzeptable Werte, Minimierung der Trümmerstreuung und Schutz der angrenzenden Fußgängerbereiche.`;

            const chapter9 = `Aus der Schwachstellenanalyse ergeben sich konkrete Schutzziele: Durchbruch verhindern, Geschwindigkeit vor Aufprall reduzieren und angrenzende Fußgängerbereiche schützen. Der abgeleitete Sicherungsgrad ${protectionGradeText} definiert die Leistungsanforderungen.

Empfohlen werden zertifizierte HVM-Komponenten der Kategorie "${productTypeText}" für den Schutzzeitraum "${protectionPeriodText}". Die Systeme sollten Eindringtiefen von etwa ${penetrationText} m und Trümmerstrecken von ${debrisDistanceText} m einhalten. Alle eingesetzten Barrieren müssen nach anerkannten Prüfstandards (IWA 14-1/-2, DIN ISO 22343-1/-2, PAS 68/69) zertifiziert sein.

Die finale Produktauswahl ist mit Polizei und Fachplanern abzustimmen. Bei Abweichungen von den allgemein anerkannten Regeln der Technik sind diese zu benennen, zu begründen und auf verbleibende Risiken hinzuweisen.`;

            const chapter10 = `Die Integration der HVM-Maßnahmen folgt den Prinzipien von „Security by Design": Schutzmaßnahmen werden möglichst unauffällig in den städtebaulichen Kontext eingebettet, ohne die Nutzung des öffentlichen Raums unnötig einzuschränken. Die vorhandenen Untergründe (${groundText}) und Nutzungsmuster werden berücksichtigt.

Flucht- und Rettungswege sowie Feuerwehrzufahrten müssen jederzeit gewährleistet bleiben. Dies erfordert ggf. durchfahrbare oder entnehmbare Sperrelemente mit definierten Öffnungszeiten und -verfahren. Die Barrierefreiheit des öffentlichen Raums ist zu erhalten; Durchgangsbreiten müssen den Anforderungen entsprechen.

Die Abstimmung mit allen Beteiligten (Betreiber, Anwohner, Gewerbe, Behörden) ist dokumentiert zu führen. Auswirkungen auf Lieferverkehr, Logistik und allgemeine Erreichbarkeit sind zu minimieren und in das Betriebskonzept zu integrieren.`;

            const chapter11 = `Für den Betrieb des Zufahrtsschutzkonzepts sind klare Verantwortlichkeiten festzulegen. Der Betreiber/Risikoverantwortliche trägt die Gesamtverantwortung für Auf- und Abbau, regelmäßige Kontrollen, Winterdienst und das Freihalten der Schlüsselflächen.

Die Betriebszustände (offen/geschlossen, auf-/abgebaut) sind klar zu definieren. Personal muss geschult und eingewiesen werden; Bedienungsanweisungen sind vorzuhalten. Wartung, Instandhaltung und regelmäßige Inspektionen erfolgen gemäß DIN ISO 22343-2 Kapitel 15/16.

Bei wesentlichen Änderungen bestehen Meldepflichten gegenüber Betreiber und Polizei. Trotz technischer und organisatorischer Maßnahmen verbleibt ein Restrisiko (aktuelles Niveau: ${residualRiskText}), das nur durch kontinuierliche Lagebewertung und regelmäßige Überprüfung des Konzepts adressiert werden kann. Dieser Bericht ersetzt keine hoheitliche Gefährdungsbewertung der zuständigen Sicherheitsbehörden.`;

            return {
                // Keys für PDF-Generierung (alte Struktur)
                purpose: chapter1,
                threatAnalysis: chapter4,
                vulnerabilities: chapter7,
                hvmMeasures: chapter9,
                siteConsiderations: chapter10,
                operationalImpact: chapter11,
                // Keys für Word-Generierung (neue chapter_* Struktur)
                chapter1_auftrag: chapter1,
                chapter2_normen: chapter2,
                chapter3_bereich: chapter3,
                chapter4_bedrohung: chapter4,
                chapter5_methodik: chapter5,
                chapter6_fahrdynamik: chapter6,
                chapter7_risiko: chapter7,
                chapter8_schutzziel: chapter8,
                chapter9_konzept: chapter9,
                chapter10_restgefahren: chapter10,
                chapter11_empfehlung: chapter11
            };
        } else {
            const chapter1_en = `This operational requirement according to DIN SPEC 91414-2 Annex E documents the access protection concept for ${assetDescriptor} at ${locationName}${hazardCity ? ` (${hazardCity}${hazardArea ? ', ' + hazardArea : ''})` : ''}. The concept serves to plan access protection against deliberate hostile vehicle attacks in a traceable manner.

The target security level was defined as "${securityLevelText}", resulting in protection grade "${protectionGradeText}". The protection period is set as "${protectionPeriodText}". This operational requirement describes what the operator can expect from the access protection concept – from planning through implementation to ongoing operation.`;

            const chapter2_en = `Normative foundations include DIN SPEC 91414-1/-2 (access protection concepts and risk assessment), DIN ISO 22343-1/-2 (vehicle security barriers – performance requirements and application), the Technical Guideline "Mobile Vehicle Barriers" and relevant police guidance.

DIN SPEC 91414-2 defines the risk assessment process and protection grade determination for access protection. DIN ISO 22343-1 specifies test methods for vehicle security barriers, while DIN ISO 22343-2 defines application rules and performance requirements. Additionally, PAS 68/69 (UK), IWA 14-1/-2 (international) and ASTM F2656 (USA) are recognized as test standards.

This report does not replace a sovereign threat assessment by the competent security authorities.`;

            const chapter3_en = `The protection area comprises ${assetDescriptor} at ${locationName}${hazardCity ? ` in ${hazardCity}` : ''}${hazardArea ? ` (${hazardArea})` : ''}. The GIS-based analysis identified ${corridorSentence}.

The protection area is characterized by its urban integration and existing infrastructure. Access possibilities vary in width, acceleration distance length and presence of natural obstacles. Particularly critical appears ${corridorHighlight}.

Ground conditions (${groundText}) influence the selection options for vehicle security barriers and their anchoring methods.`;

            const chapter4_en = `${speedSentence}. Threat scenarios follow police experience with vehicle-as-a-weapon incidents involving different vehicle masses from cars to heavy commercial vehicles. The GIS analysis identified ${corridorSentence} with an average threat level of ${averageThreatLevelText}.

${hazardParagraph} ${factorInsights}

Risk assessment is performed qualitatively using a matrix of likelihood and impact according to DIN SPEC 91414-2. This derives protection grade ${protectionGradeText}. It is expressly noted that the specific threat assessment is the responsibility of the competent security authorities.`;

            const chapter5_en = `The BarricadiX analysis methodology combines GIS-based terrain analysis with vehicle dynamics calculations according to DIN ISO 22343-2 principles. For each identified access point, acceleration distance, achievable speed and resulting kinetic energy are determined.

Impact velocity is calculated using the formula v = √(2·a·s), where a is the vehicle class-specific acceleration and s is the effective approach distance. Kinetic energy E = ½·m·v² determines the required performance class of the vehicle security barrier.

Vehicle classes according to DIN ISO 22343-2 (2025) range from M1 (car, 1,500 kg) through N1G (pickup, 2,500 kg) to N3G (4-axle cab-over, 30,000 kg). Each class has characteristic acceleration values that feed into energy calculations.`;

            const chapter6_en = `The vehicle dynamics analysis calculates maximum achievable speeds and resulting impact energies for each access point. A total of ${corridorCount} access points were analyzed: ${corridorDetails || corridorSentence}.

Energy levels according to DIN ISO 22343-2 classify impact energy: E1 (< 250 kJ), E2 (250-800 kJ), E3 (800-1,950 kJ) and E4 (> 1,950 kJ). The energy level directly derives the required barrier protection class.

Detailed calculation results for all vehicle classes and access points are documented in Appendix A, including worst-case scenarios for the most critical combinations of vehicle mass, acceleration and approach distance.`;

            const chapter7_en = `The vulnerability analysis according to DIN SPEC 91414-2 systematically examines transitions from Zone 0 (public traffic area) through the transition zone to the protection zone and identifies long, unobstructed alignments as particularly critical.

A total of ${corridorCount} access possibilities were identified: ${corridorDetails || corridorSentence}. Particularly critical appears ${corridorHighlight}, as wide acceleration spaces without natural obstacles exist here. Existing ground and environmental conditions (${groundText}) offer only limited natural deceleration space.

The ALARP principle (As Low As Reasonably Practicable) requires reduction of risks to a reasonably achievable minimum considering proportionality and feasibility.`;

            const chapter8_en = `From the risk analysis, protection grade ${protectionGradeText} is derived. This defines minimum requirements for vehicle security barriers according to DIN SPEC 91414-2.

Protection grades SG0 to SG4 correspond to increasing protection requirements, with SG0 representing no special protection and SG4 the highest protection against heavy vehicles at high speeds. Assignment considers the maximum expected kinetic energy at each access point.

Protection goals include: preventing breakthrough into the protection zone, limiting penetration depth to acceptable values, minimizing debris scatter and protecting adjacent pedestrian areas.`;

            const chapter9_en = `The vulnerability analysis yields specific protection goals: prevent breakthrough, reduce speed before impact and protect adjacent pedestrian areas. The derived protection grade ${protectionGradeText} defines performance requirements.

Certified HVM components of category "${productTypeText}" are recommended for protection period "${protectionPeriodText}". Systems should maintain penetration depths of approximately ${penetrationText} m and debris throw distances of ${debrisDistanceText} m. All deployed barriers must be certified according to recognized test standards.

Final product selection must be coordinated with police and specialist planners. Any deviations from generally accepted technical rules must be identified, justified and residual risks noted.`;

            const chapter10_en = `Integration of HVM measures follows "Security by Design" principles: protective measures are embedded as unobtrusively as possible into the urban context without unnecessarily restricting use of public space. Existing ground conditions (${groundText}) and usage patterns are considered.

Escape and rescue routes as well as fire brigade access must be guaranteed at all times. This may require passable or removable barrier elements with defined opening times and procedures. Accessibility of public space must be maintained; passage widths must meet requirements.

Coordination with all stakeholders (operator, residents, businesses, authorities) must be documented. Impacts on delivery traffic, logistics and general accessibility are to be minimized and integrated into the operating concept.`;

            const chapter11_en = `Clear responsibilities must be established for operation of the access protection concept. The operator/risk owner bears overall responsibility for setup and dismantling, regular inspections, winter maintenance and keeping key areas clear.

Operating states (open/closed, set up/dismantled) must be clearly defined. Personnel must be trained and briefed; operating instructions must be available. Maintenance, upkeep and regular inspections follow DIN ISO 22343-2 Chapters 15/16.

Reporting obligations to operator and police exist for significant changes. Despite technical and organizational measures, residual risk remains (current level: ${residualRiskText}), which can only be addressed through continuous situational assessment and regular review of the concept. This report does not replace a sovereign threat assessment by the competent security authorities.`;

            return {
                // Keys for PDF generation (legacy structure)
                purpose: chapter1_en,
                threatAnalysis: chapter4_en,
                vulnerabilities: chapter7_en,
                hvmMeasures: chapter9_en,
                siteConsiderations: chapter10_en,
                operationalImpact: chapter11_en,
                // Keys for Word generation (new chapter_* structure)
                chapter1_auftrag: chapter1_en,
                chapter2_normen: chapter2_en,
                chapter3_bereich: chapter3_en,
                chapter4_bedrohung: chapter4_en,
                chapter5_methodik: chapter5_en,
                chapter6_fahrdynamik: chapter6_en,
                chapter7_risiko: chapter7_en,
                chapter8_schutzziel: chapter8_en,
                chapter9_konzept: chapter9_en,
                chapter10_restgefahren: chapter10_en,
                chapter11_empfehlung: chapter11_en
            };
        }
    } catch {
        if (currentLanguage === 'de') {
            return {
                purpose: `Schutzziel und Rahmenbedingungen für ${context.locationName}.`,
                threatAnalysis: `Zusammenfassung der Gefahren basierend auf Karten-/Chat-Eingaben.`,
                vulnerabilities: `Allgemeine Schwachstellen am Standort.`,
                hvmMeasures: `Empfohlene HVM‑Maßnahmen gemäß Annahmen.`,
                siteConsiderations: `Standortspezifische Hinweise.`,
                operationalImpact: `Betriebliche Auswirkungen und Gestaltung.`
            };
        } else {
            return {
                purpose: `Protection objective and framework conditions for ${context.locationName}.`,
                threatAnalysis: `Summary of hazards based on map/chat inputs.`,
                vulnerabilities: `General vulnerabilities at the site.`,
                hvmMeasures: `Recommended HVM measures according to assumptions.`,
                siteConsiderations: `Site-specific notes.`,
                operationalImpact: `Operational impacts and design.`
            };
        }
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
 * Updates the product recommendation section and map with interactive tooltips
 */
async function updateProductRecommendations() {
    // Get the actual product database from window (where it's stored)
    let products = (window as any).productDatabase || [];
    
    if (products.length === 0) {
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}product-database.json`);
            if (!response.ok) throw new Error('Product database fetch failed');
            products = await response.json();
            // Store in window for future use
            (window as any).productDatabase = products;
        } catch (error) {
            console.error(t('alerts.productDbError'), error);
            return;
        }
    }
    
    // Show the map and threat analysis results for product selection
    await initProductSelectionMap();
}

/**
 * Initialize the product selection map with interactive tooltips
 */
async function initProductSelectionMap() {
    console.log('Initializing product selection map with threat data');
    
    // Make sure the map is visible and properly sized
    const mapDiv = document.getElementById('map');
    if (!mapDiv || !map) {
        console.error('Map not available for product selection');
        return;
    }
    
    mapDiv.classList.remove('view-hidden');
    
    // Invalidate map size to ensure proper display
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            console.log('Map size invalidated for product selection');
        }
    }, 100);
    
    // Check if we have threat analysis data OR Entry Detection data
    const hasThreatData = threatsMap.size > 0;
    const hasEntryDetection = (window as any).entryDetectionManager && 
                              (window as any).entryDetectionManager.candidates && 
                              (window as any).entryDetectionManager.candidates.length > 0;
    
    if (hasThreatData || hasEntryDetection) {
        console.log(`🎯 Product Selection: Has threat data=${hasThreatData}, Has Entry Detection=${hasEntryDetection}`);
        await addProductRecommendationTooltips();
    } else {
        console.log('No threat analysis or entry detection data available for product selection');
    }
}

/**
 * Add interactive product recommendation tooltips to threat markers
 */
async function addProductRecommendationTooltips() {
    console.log('Adding product recommendation tooltips to threat markers');
    
    // Clear existing tooltips first
    clearProductTooltips();
    
    // Iterate through all threat markers and add interactive tooltips
    threatMarkersMap.forEach((markers, streetName) => {
        // Skip Entry Detection markers here - they're handled separately below
        if (streetName === 'entry-detection') {
            return;
        }
        
        const threatData = threatsMap.get(streetName);
        if (!threatData || !markers) return;
        
        markers.forEach((marker, markerIndex) => {
            // Get the speed for this specific entry point using its individual distance
            const maxSpeed = calculateMaxSpeedForSpecificEntryPoint(threatData, markerIndex);
            
            // Find suitable products for this speed requirement
            const recommendedProducts = findProductsForSpeed(maxSpeed);
            
            if (recommendedProducts.length > 0) {
                // Select optimal product based on speed requirement rather than always picking the first
                const selectedProduct = selectOptimalProduct(recommendedProducts, maxSpeed, streetName, markerIndex);
                addInteractiveTooltip(marker, streetName, maxSpeed, selectedProduct, markerIndex);
            } else {
                // No suitable product found - add fallback tooltip
                addNoProductTooltip(marker, streetName, maxSpeed);
                console.log(`No suitable product found for ${streetName} entry point ${markerIndex} (required: ${maxSpeed} km/h)`);
            }
        });
    });
    
    // ⭐ NEW: Process Entry Detection markers for product recommendations
    const entryDetectionMarkers = threatMarkersMap.get('entry-detection');
    const manager = (window as any).entryDetectionManager;
    
    if (entryDetectionMarkers && manager && manager.candidates && manager.candidates.length > 0) {
        console.log(`🎯 Processing ${manager.candidates.length} Entry Detection candidates for Product Selection`);
        
        entryDetectionMarkers.forEach((marker, index) => {
            if (index >= manager.candidates.length) return;
            
            const candidate = manager.candidates[index];
            
            // Calculate speed based on Entry Detection data
            const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
            const selectedWeight = vehicleSelect.value;
            const accelerationRange = getAccelerationRange(selectedWeight);
            
            if (!accelerationRange) {
                console.warn(`⚠️ Cannot calculate speed for Entry Detection candidate ${index + 1} - no acceleration range`);
                return;
            }
            
            // Calculate realistic speed using OSM constraints and improved heuristics
            const speedResult = calculateRealisticSpeedForEntry(
                candidate,
                accelerationRange,
                currentOsmData,
                osmSpeedLimiter
            );
            const maxSpeed = speedResult.speed;

            console.log(`🚗 Entry Detection candidate ${index + 1}:`, {
                pathDistance: candidate.distanceMeters,
                calculatedSpeed: maxSpeed,
                reasoning: speedResult.reasoning
            });
            
            // Find suitable products
            const recommendedProducts = findProductsForSpeed(maxSpeed);
            
            if (recommendedProducts.length > 0) {
                const selectedProduct = selectOptimalProduct(recommendedProducts, maxSpeed, `Zufahrt ${index + 1}`, index);
                addInteractiveTooltip(marker, `Zufahrt ${index + 1}`, maxSpeed, selectedProduct, index);
                console.log(`✅ Added product recommendation for Entry Detection candidate ${index + 1}`);
            } else {
                addNoProductTooltip(marker, `Zufahrt ${index + 1}`, maxSpeed);
                console.log(`❌ No suitable product found for Entry Detection candidate ${index + 1} (required: ${maxSpeed} km/h)`);
            }
        });
    }
}

/**
 * Calculate maximum speed for a specific entry point
 */
function calculateMaxSpeedForSpecificEntryPoint(threatData: any, entryPointIndex: number): number {
    if (!threatData.entryPoints || threatData.entryPoints.length === 0 || entryPointIndex >= threatData.entryPoints.length) {
        return 0;
    }
    
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    const selectedWeight = vehicleSelect.value;
    const accelerationRange = getAccelerationRange(selectedWeight);
    
    if (!accelerationRange) return 0;
    
    const entryPoint = threatData.entryPoints[entryPointIndex];
    // Use the specific distance for this entry point instead of total length
    const distance = entryPoint.distance || threatData.totalLength;

    // Use 75% of max acceleration for more realistic speed calculation
    const realisticAcceleration = accelerationRange[0] +
        (accelerationRange[1] - accelerationRange[0]) * 0.75;

    console.log(`🚗 Calculating speed for entry point ${entryPointIndex}: distance=${distance}m, realistic acceleration=${realisticAcceleration}m/s² (75% of max)`);

    const speed = calculateVelocity(realisticAcceleration, distance);
    const roundedSpeed = Math.round(speed);

    console.log(`🚗 RESULT: Raw speed=${speed}, Rounded speed=${roundedSpeed} km/h for entry point ${entryPointIndex}`);
    console.log(`🚗 Vehicle weight selected: ${selectedWeight}, acceleration range: [${accelerationRange[0]}, ${accelerationRange[1]}]`);

    return roundedSpeed;
}

/**
 * Select the optimal product from recommended products based on speed requirement and street characteristics
 */
function selectOptimalProduct(recommendedProducts: any[], maxSpeed: number, streetName: string, markerIndex?: number): any {
    if (recommendedProducts.length === 1) {
        return recommendedProducts[0];
    }
    
    // Helper function to get product speed
    function getProductSpeed(product: any): number {
        if (product.technical_data?.pr_speed_kph) {
            return parseFloat(product.technical_data.pr_speed_kph);
        }
        if (product.speed) {
            return parseFloat(product.speed);
        }
        // Extract from performance rating as fallback
        if (product.technical_data?.performance_rating) {
            const parts = product.technical_data.performance_rating.split('/');
            if (parts.length >= 3) {
                return parseFloat(parts[2]) || 0;
            }
        }
        return 0;
    }
    
    // Strategy 1: Find product with speed closest to requirement (but still sufficient)
    // This provides variety while maintaining technical appropriateness
    let optimalProduct = recommendedProducts[0];
    let smallestOverhead = Infinity;
    
    for (const product of recommendedProducts) {
        const productSpeed = getProductSpeed(product);
        const overhead = productSpeed - maxSpeed; // How much "over-engineered" the solution is
        
        if (overhead >= 0 && overhead < smallestOverhead) {
            smallestOverhead = overhead;
            optimalProduct = product;
        }
    }
    
    // Strategy 2: Add some variation based on street characteristics and entry point
    // Different entry points should get different products for variety
    if (smallestOverhead < 20) { // If we have multiple very suitable products
        const suitableProducts = recommendedProducts.filter((product: any) => {
            const productSpeed = getProductSpeed(product);
            const overhead = productSpeed - maxSpeed;
            return overhead >= 0 && overhead <= smallestOverhead + 15; // Allow some tolerance
        });
        
        if (suitableProducts.length > 1) {
            // Use street name AND marker index for consistent but varying selection
            const streetHash = streetName.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            
            // Include marker index in hash calculation for variety between entry points
            const combinedHash = streetHash + (markerIndex || 0) * 1000;
            const index = Math.abs(combinedHash) % suitableProducts.length;
            optimalProduct = suitableProducts[index];
            
            console.log(`🔄 Using variation strategy: streetHash=${streetHash}, markerIndex=${markerIndex || 0}, combinedHash=${combinedHash}, selectedIndex=${index}/${suitableProducts.length}`);
        }
    }
    
    console.log(`🎯 Selected product: ${optimalProduct.product_name} (${getProductSpeed(optimalProduct)} km/h) for ${streetName} (required: ${maxSpeed} km/h)`);
    
    return optimalProduct;
}

/**
 * Find products that can handle the required speed
 */
function findProductsForSpeed(requiredSpeed: number): any[] {
    // Get the actual product database from window (where it's stored)
    const products = (window as any).productDatabase || [];
    console.log('🔍 DETAILED ANALYSIS: Finding products for required speed:', requiredSpeed);
    console.log('🔍 Product database size:', products.length);
    
    // Debug: Analyze all speed values in database
    const allSpeeds = products.map((p: any) => {
        let speed = 0;
        if (p.technical_data?.pr_speed_kph) speed = p.technical_data.pr_speed_kph;
        else if (p.speed) speed = parseFloat(p.speed);
        return { name: p.product_name, speed: speed };
    }).filter((p: any) => p.speed > 0).sort((a: any, b: any) => a.speed - b.speed);
    
    console.log('🔍 All products with speeds (sorted):', allSpeeds.slice(0, 10));
    console.log('🔍 Speed range in database:', allSpeeds[0]?.speed, 'to', allSpeeds[allSpeeds.length - 1]?.speed);
    
    if (!products || products.length === 0) {
        console.log('No product database available');
        return [];
    }
    
    // Helper function to extract speed from performance_rating
    function extractSpeedFromPerformanceRating(performanceRating: string): number {
        if (!performanceRating || typeof performanceRating !== 'string') {
            return 0;
        }
        
        // Performance rating format: "V/7500[N2]/64/90:1/9.3"
        // Speed is typically the third number (64 in this example)
        const parts = performanceRating.split('/');
        if (parts.length >= 3) {
            const speedPart = parts[2]; // "64"
            const speed = parseFloat(speedPart);
            if (!isNaN(speed)) {
                return speed;
            }
        }
        return 0;
    }
    
    // Find products that have been tested at speeds higher than required
    const suitableProducts = products.filter((product: any) => {
        let productSpeed = 0;
        
        // Priority 1: Use the new pr_speed_kph field (direct test speed)
        if (product.technical_data && product.technical_data.pr_speed_kph) {
            productSpeed = parseFloat(product.technical_data.pr_speed_kph);
        }
        // Priority 2: Try legacy speed field
        else if (product.speed) {
            productSpeed = parseFloat(product.speed);
        } 
        // Priority 3: Extract from performance rating
        else if (product.technical_data && product.technical_data.performance_rating) {
            productSpeed = extractSpeedFromPerformanceRating(product.technical_data.performance_rating);
        } else if (product.performance_rating) {
            productSpeed = extractSpeedFromPerformanceRating(product.performance_rating);
        }
        
        const isValid = !isNaN(productSpeed) && productSpeed > 0 && productSpeed >= requiredSpeed;
        if (isValid) {
            console.log(`✅ Suitable product found: ${product.product_name} (${productSpeed} km/h >= ${requiredSpeed} km/h)`);
        } else if (productSpeed > 0) {
            console.log(`❌ Product too slow: ${product.product_name} (${productSpeed} km/h < ${requiredSpeed} km/h)`);
        }
        return isValid;
    });
    
    console.log(`🔍 Found ${suitableProducts.length} suitable products out of ${products.length} total products`);
    
    // Debug: Show which products were filtered out and why
    const rejectedProducts = products.filter((product: any) => {
        let productSpeed = 0;
        if (product.technical_data?.pr_speed_kph) productSpeed = product.technical_data.pr_speed_kph;
        else if (product.speed) productSpeed = parseFloat(product.speed);
        return productSpeed > 0 && productSpeed < requiredSpeed;
    });
    
    console.log(`🔍 ${rejectedProducts.length} products were too slow for requirement ${requiredSpeed} km/h`);
    if (rejectedProducts.length > 0) {
        console.log('🔍 First 5 rejected products:', rejectedProducts.slice(0, 5).map((p: any) => ({
            name: p.product_name,
            speed: p.technical_data?.pr_speed_kph || p.speed
        })));
    }
    
    // Sort by speed (highest first) to get the most suitable products
    const sorted = suitableProducts.sort((a: any, b: any) => {
        // Helper function to get speed for sorting
        function getSpeedForSorting(product: any): number {
            if (product.technical_data?.pr_speed_kph) {
                return parseFloat(product.technical_data.pr_speed_kph);
            }
            if (product.speed) {
                return parseFloat(product.speed);
            }
            return extractSpeedFromPerformanceRating(product.technical_data?.performance_rating || product.performance_rating || '0');
        }
        
        const speedA = getSpeedForSorting(a);
        const speedB = getSpeedForSorting(b);
        return speedB - speedA;
    });
    
    if (sorted.length > 0) {
        const bestProduct = sorted[0];
        // Use the same logic as the sorting function to get the actual speed
        let bestSpeed = 0;
        if (bestProduct.technical_data?.pr_speed_kph) {
            bestSpeed = parseFloat(bestProduct.technical_data.pr_speed_kph);
        } else if (bestProduct.speed) {
            bestSpeed = parseFloat(bestProduct.speed);
        } else {
            bestSpeed = extractSpeedFromPerformanceRating(bestProduct.technical_data?.performance_rating || bestProduct.performance_rating || '0');
        }
        console.log(`🏆 Best product selected: ${bestProduct.product_name} (${bestSpeed} km/h)`);
    }
    
    return sorted;
}

/**
 * Add fallback tooltip for threats without suitable products
 */
function addNoProductTooltip(marker: any, streetName: string, maxSpeed: number) {
    // Create popup content for no product case
    const createNoProductContent = () => {
        return `
            <div class="product-tooltip">
                <div class="tooltip-header">
                    <h4>${streetName}</h4>
                    <span class="tooltip-close">×</span>
                </div>
                <div class="tooltip-content">
                    <div class="no-product-info">
                        <div class="warning-icon">
                            <i class="fas fa-exclamation-triangle" style="color: #ff9900; font-size: 2rem; margin-bottom: 12px;"></i>
                        </div>
                        <h5>${t('products.contactAdvice')}</h5>
                        <p><strong>${t('products.requiredSpeed')}:</strong> ${maxSpeed} km/h</p>
                        <div class="contact-message">
                            <p style="text-align: center; font-weight: 500; line-height: 1.5; margin: 16px 0;">
                                ${t('products.noSuitableProduct')}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="tooltip-pin-indicator">
                    <i class="fas fa-info-circle"></i> ${isPinned ? t('products.pinned') || 'Angepinnt' : t('products.clickToPin') || 'Klicken zum Anpinnen'}
                </div>
            </div>
        `;
    };
    
    let leafletPopup: any = null;
    let isPinned = false;
    
    // Add CSS class to marker for hover effects
    const markerIcon = marker.getElement?.();
    if (markerIcon) {
        markerIcon.classList.add('has-tooltip', 'no-product-marker');
    }
    
    // Click event for pinning
    marker.on('click', (e: any) => {
        e.originalEvent.stopPropagation();
        
        if (isPinned) {
            // Unpin the popup
            isPinned = false;
            if (leafletPopup) {
                map.closePopup(leafletPopup);
                leafletPopup = null;
                console.log('No-product popup unpinned');
            }
        } else {
            // Pin the popup
            isPinned = true;
            
            const popupContent = createNoProductContent();
            
            // Safely get marker coordinates with validation
            const markerLatLng = marker.getLatLng ? marker.getLatLng() : 
                                 marker._latlng || marker.latlng || 
                                 { lat: 0, lng: 0 };
            
            // Validate coordinates before creating popup
            if (!markerLatLng || typeof markerLatLng.lat !== 'number' || typeof markerLatLng.lng !== 'number') {
                console.error('Invalid marker coordinates for no-product popup:', markerLatLng);
                return;
            }
            
            try {
                // Store current map view before opening popup
                const currentCenter = map.getCenter();
                const currentZoom = map.getZoom();
                
            leafletPopup = L.popup({
                closeButton: true,
                autoClose: false,
                closeOnClick: false,
                className: 'product-popup no-product-popup',
                offset: [10, -10]
            })
                .setLatLng(markerLatLng)
                .setContent(popupContent);
                
                // Add popup to map without auto-centering
                leafletPopup.addTo(map);
                
                // Restore original map view to prevent jumping
                setTimeout(() => {
                    if (map && currentCenter && typeof currentZoom === 'number') {
                        map.setView(currentCenter, currentZoom, { animate: false });
                    }
                }, 10);
                
                // Override the _animateZoom method to handle errors gracefully
                const originalAnimateZoom = leafletPopup._animateZoom;
                leafletPopup._animateZoom = function(e: any) {
                    try {
                        if (this._latlng && this._latlng.lat && this._latlng.lng) {
                            return originalAnimateZoom.call(this, e);
                        }
                    } catch (error) {
                        console.warn('No-product popup zoom animation error prevented:', error);
                    }
                };
            } catch (error) {
                console.error('Error creating no-product popup:', error);
                return;
            }
            
            console.log(`No-product popup pinned for ${streetName} (${maxSpeed} km/h)`);
            
            // Add close event handler for popup
            leafletPopup.on('remove', () => {
                isPinned = false;
                leafletPopup = null;
                console.log('No-product popup closed');
            });
        }
    });
}

/**
 * Determines if a way represents an "Erschließungsstraße" (access road) based on OSM tags
 */
function isErschliessungsstrasse(way: any): boolean {
    if (!way || !way.tags) return false;
    
    const tags = way.tags;
    
    // Check for highway types that are typically access roads
    const accessRoadTypes = [
        'residential',      // Wohnstraße
        'service',          // Zufahrtsstraße
        'unclassified',     // Unklassifizierte Straße
        'track',            // Feldweg
        'path',             // Fußweg
        'footway',          // Gehweg
        'cycleway',         // Radweg
        'pedestrian'        // Fußgängerzone
    ];
    
    // Check for access-related tags
    const accessTags = [
        'access=private',   // Privater Zugang
        'access=permissive', // Erlaubter Zugang
        'access=delivery',  // Lieferzugang
        'access=emergency', // Notfallzugang
        'access=customers', // Kundenzugang
        'access=residents', // Anwohnerzugang
        'service=driveway', // Einfahrt
        'service=parking_aisle', // Parkplatz-Zufahrt
        'service=alley'     // Gasse
    ];
    
    // Check highway type
    if (tags.highway && accessRoadTypes.includes(tags.highway)) {
        return true;
    }
    
    // Check access tags
    for (const accessTag of accessTags) {
        const [key, value] = accessTag.split('=');
        if (tags[key] === value) {
            return true;
        }
    }
    
    // Check for residential or service area indicators
    if (tags.landuse === 'residential' || tags.landuse === 'commercial') {
        return true;
    }
    
    return false;
}

/**
 * Creates visual markers for Entry Detection candidates on the map
 */

// --- Manual Path Drawing Helpers ---

function clearManualPath(candidateId: string) {
    const pathDataList = manualPathsMap.get(candidateId);
    if (pathDataList) {
        pathDataList.forEach(data => {
            if (data.pathLine) map.removeLayer(data.pathLine);
            if (data.waypointMarkers) {
                data.waypointMarkers.forEach((m: any) => map.removeLayer(m));
            }
        });
        manualPathsMap.delete(candidateId);
    }
}

function startPathDrawingForEntryPoint(candidateId: string) {
    console.log('Starting path drawing for entry point:', candidateId);
    const manager = (window as any).entryDetectionManager;
    if (!manager) {
        showNotification('Entry Detection Manager nicht verfügbar.', 'error');
        return;
    }
    
    const candidate = manager.candidates?.find((c: any) => c.id === candidateId);
    if (!candidate) {
        showNotification('Zufahrtspunkt nicht gefunden.', 'error');
        return;
    }
    
    drawingCandidateId = candidateId;
    
    // Initialize path data if not exists
    if (!manualPathsMap.has(candidateId)) {
        manualPathsMap.set(candidateId, []);
    }
    
    const paths = manualPathsMap.get(candidateId)!;
    
    // Check if there's already a path being drawn
    const existingPath = paths.find(p => p.pathLine && map.hasLayer(p.pathLine));
    if (existingPath) {
        // Continue existing path
        showNotification('Pfadzeichnen fortgesetzt. Klicke auf die Karte um weitere Punkte zu setzen.', 'info');
        return;
    }
    
    // Create new path starting from entry point
    const startPoint = L.latLng(candidate.intersectionPoint[1], candidate.intersectionPoint[0]);
    const pathData = {
        pathLine: null,
        waypointMarkers: [],
        waypoints: [startPoint]
    };
    paths.push(pathData);
    
    // Add initial marker (blue dot) at entry point
    const initialMarker = createWaypointMarker(startPoint, candidate, paths.length - 1, 0);
    pathData.waypointMarkers.push(initialMarker);
    
    // Update button state
    const manualPathBtn = document.getElementById('manual-path-drawing-toggle') as HTMLButtonElement;
    if (manualPathBtn) {
        manualPathBtn.classList.add('active');
        manualPathBtn.setAttribute('aria-pressed', 'true');
    }
    
    showNotification('Pfadzeichnen gestartet. Klicke auf die Karte um Punkte zu setzen. Rechtsklick auf letzten Punkt zum Beenden.', 'info');
}

function startBranchPath(candidate: any, marker: any) {
    console.log('Starting branch path for candidate:', candidate.id);
    const startPoint = marker.getLatLng();
    const manager = (window as any).entryDetectionManager;
    if (!manager) return;
    
    const newId = `manual-${Date.now()}-${manualEntryIdCounter++}`;
    // Create a new candidate initialized at this branch point
    const newCandidate = createManualEntryCandidate(startPoint, newId);
    manager.addManualCandidate(newCandidate);
    
    drawingCandidateId = newId;
    
    if (!manualPathsMap.has(newId)) {
        manualPathsMap.set(newId, []);
    }
    
    const pathData = {
        pathLine: null,
        waypointMarkers: [],
        waypoints: [startPoint]
    };
    manualPathsMap.get(newId)!.push(pathData);
    
    // Add initial marker (blue dot)
    const initialMarker = createWaypointMarker(startPoint, newCandidate, 0, 0);
    pathData.waypointMarkers.push(initialMarker);
    
    showNotification('Abzweigung gestartet. Klicke auf die Karte um Punkte zu setzen. Rechtsklick auf letzten Punkt zum Beenden.', 'info');
    createEntryDetectionMarkers();
}

function finishPathDrawing() {
    if (!drawingCandidateId) {
        console.warn('⚠️ finishPathDrawing: No drawingCandidateId set');
        return;
    }
    console.log('✅ Finishing path drawing for:', drawingCandidateId);
    const candidateId = drawingCandidateId;
    drawingCandidateId = null;
    
    // Get path data
    const paths = manualPathsMap.get(candidateId);
    if (!paths || paths.length === 0) {
        console.warn('⚠️ finishPathDrawing: No paths found for candidate:', candidateId);
        return;
    }
    
    console.log(`📊 Processing ${paths.length} path segment(s)`);
    
    // Process each path segment
    paths.forEach((pathData, pathIndex) => {
        console.log(`📊 Path segment ${pathIndex}: ${pathData.waypoints.length} waypoints, ${pathData.waypointMarkers.length} markers`);
        
        if (pathData.waypoints.length < 2) {
            console.warn(`⚠️ Path segment ${pathIndex} has less than 2 waypoints, skipping`);
            return;
        }
        
        // Hide waypoint markers by removing them from map (we keep them in memory for potential restoration)
        console.log(`👁️ Hiding ${pathData.waypointMarkers.length} waypoint markers...`);
        pathData.waypointMarkers.forEach((marker: any, markerIndex: number) => {
            if (marker) {
                try {
                    // Remove marker from map (most reliable method)
                    if (map.hasLayer(marker)) {
                        map.removeLayer(marker);
                        console.log(`  ✅ Removed marker ${markerIndex} from map`);
                    } else {
                        console.log(`  ℹ️ Marker ${markerIndex} was not on map`);
                    }
                    
                    // Also try to hide via DOM manipulation as backup
                    const element = marker.getElement?.();
                    if (element) {
                        element.style.opacity = '0';
                        element.style.display = 'none';
                        element.style.visibility = 'hidden';
                        console.log(`  ✅ Hidden marker ${markerIndex} via DOM`);
                    }
                    
                    // Mark as hidden for potential restoration later
                    marker._isHidden = true;
                } catch (error) {
                    console.error(`❌ Error hiding marker ${markerIndex}:`, error);
                }
            } else {
                console.warn(`⚠️ Marker ${markerIndex} is null or undefined`);
            }
        });
        console.log(`✅ All ${pathData.waypointMarkers.length} markers hidden`);
        
        // Smooth the path with tangential curves
        console.log(`🔄 Smoothing path with ${pathData.waypoints.length} waypoints...`);
        let smoothedPoints: L.LatLng[];
        try {
            smoothedPoints = smoothPathWithTangentialCurves(pathData.waypoints);
            console.log(`✅ Generated ${smoothedPoints.length} smoothed points`);
            
            if (smoothedPoints.length === 0) {
                console.error('❌ Smoothing returned empty array, using original waypoints');
                smoothedPoints = pathData.waypoints;
            }
        } catch (error) {
            console.error('❌ Error smoothing path:', error);
            smoothedPoints = pathData.waypoints; // Fallback to original
        }
        
        // Replace the path line with smoothed version
        if (pathData.pathLine) {
            console.log('🗑️ Removing old path line...');
            map.removeLayer(pathData.pathLine);
            pathData.pathLine = null;
        }
        
        // Create smoothed polyline
        console.log(`📈 Creating smoothed polyline with ${smoothedPoints.length} points...`);
        try {
            pathData.pathLine = L.polyline(smoothedPoints, { 
                color: '#0ea5e9', 
                weight: 3,
                smoothFactor: 1.0 // Disable Leaflet's built-in smoothing, we do it ourselves
            }).addTo(map);
            console.log('✅ Smoothed polyline created and added to map');
        } catch (error) {
            console.error('❌ Error creating smoothed polyline:', error);
            // Fallback: create with original waypoints
            pathData.pathLine = L.polyline(pathData.waypoints, { 
                color: '#0ea5e9', 
                weight: 3
            }).addTo(map);
        }
        
        // Store smoothed waypoints for later use
        pathData.smoothedWaypoints = smoothedPoints;
        pathData.isSmoothed = true;
        console.log(`✅ Path segment ${pathIndex} finalized and smoothed`);
    });
    
    // Update button state
    const manualPathBtn = document.getElementById('manual-path-drawing-toggle') as HTMLButtonElement;
    if (manualPathBtn) {
        manualPathBtn.classList.remove('active');
        manualPathBtn.setAttribute('aria-pressed', 'false');
    }
    
    calculateSpeedsForManualPaths();
    showNotification('Pfadzeichnen beendet. Pfad wurde geglättet.', 'success');
    createEntryDetectionMarkers();
}

function createWaypointMarker(latlng: any, candidate: any, pathIndex: number, pointIndex: number) {
    const marker = L.circleMarker(latlng, {
        radius: 4,
        color: '#0ea5e9',
        fillColor: '#0ea5e9',
        fillOpacity: 1
    }).addTo(map);
    
    marker.on('contextmenu', (e: any) => {
        L.DomEvent.stopPropagation(e);
        e.originalEvent.preventDefault();
        
        const menu = document.createElement('div');
        menu.className = 'waypoint-context-menu';
        menu.style.cssText = `
            position: absolute;
            left: ${e.originalEvent.clientX}px;
            top: ${e.originalEvent.clientY}px;
            background: white;
            border: 1px solid #ccc;
            padding: 5px;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            min-width: 120px;
        `;
        
        const createBtn = (text: string, color: string, onClick: () => void) => {
            const btn = document.createElement('div');
            btn.textContent = text;
            btn.style.cssText = `padding: 8px 12px; cursor: pointer; color: ${color}; font-family: sans-serif; font-size: 13px;`;
            btn.onmouseover = () => btn.style.background = '#f3f4f6';
            btn.onmouseout = () => btn.style.background = 'transparent';
            btn.onclick = onClick;
            return btn;
        };
        
        menu.appendChild(createBtn('Marker löschen', '#dc2626', () => {
            deleteWaypointsFromIndex(candidate.id, pathIndex, pointIndex);
            document.body.removeChild(menu);
        }));
        
        menu.appendChild(createBtn('Abzweigung', '#0ea5e9', () => {
            startBranchPath(candidate, marker);
            document.body.removeChild(menu);
        }));
        
        // If this is the last marker, add option to continue/finish
        const paths = manualPathsMap.get(candidate.id);
        if (paths && paths[pathIndex] && pointIndex === paths[pathIndex].waypoints.length - 1) {
             menu.appendChild(createBtn('Zeichnen fortsetzen', '#10b981', () => {
                drawingCandidateId = candidate.id;
                showNotification('Pfadzeichnen fortgesetzt.', 'info');
                document.body.removeChild(menu);
            }));
             menu.appendChild(createBtn('Zeichnen beenden', '#6b7280', () => {
                finishPathDrawing();
                document.body.removeChild(menu);
            }));
        }

        document.body.appendChild(menu);
        
        const closeMenu = (ev: any) => {
            if (!menu.contains(ev.target)) {
                if (document.body.contains(menu)) document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    });
    
    // Right click on last marker to finish? Or click?
    // User asked: "Rechtsklick auf den letztgesetzt Pfadpunkt ... Pfadsetzung beenden"
    // This is handled by the context menu above.
    // User also: "Oder durch Klicken auf den Letzten Punkt weiter fort zu setzen."
    marker.on('click', (e: any) => {
        if (drawingCandidateId === candidate.id) {
             // If we are drawing, clicking the last point might toggle finish?
             // Or simply do nothing (continue drawing elsewhere).
             L.DomEvent.stopPropagation(e);
        } else {
             // If not drawing, maybe resume?
             const paths = manualPathsMap.get(candidate.id);
             if (paths && paths[pathIndex] && pointIndex === paths[pathIndex].waypoints.length - 1) {
                 drawingCandidateId = candidate.id;
                 showNotification('Pfadzeichnen fortgesetzt.', 'info');
                 L.DomEvent.stopPropagation(e);
             }
        }
    });
    
    return marker;
}

function deleteWaypointsFromIndex(candidateId: string, pathIndex: number, pointIndex: number) {
    const paths = manualPathsMap.get(candidateId);
    if (!paths || !paths[pathIndex]) return;
    const pathData = paths[pathIndex];
    
    // If path was smoothed, restore original waypoints and show markers again
    if (pathData.isSmoothed) {
        console.log('🔄 Restoring unsmoothed path for editing...');
        
        // Remove smoothed path line
        if (pathData.pathLine) {
            map.removeLayer(pathData.pathLine);
            pathData.pathLine = null;
        }
        
        // Show waypoint markers again by re-adding them to map
        pathData.waypointMarkers.forEach((marker: any, index: number) => {
            if (marker) {
                try {
                    // Re-add to map if it was hidden
                    if (marker._isHidden || !map.hasLayer(marker)) {
                        marker.addTo(map);
                        marker._isHidden = false;
                        
                        // Restore visibility via DOM
                        const element = marker.getElement?.();
                        if (element) {
                            element.style.opacity = '1';
                            element.style.display = '';
                            element.style.visibility = 'visible';
                        }
                        
                        // Restore style
                        if (marker.setStyle) {
                            marker.setStyle({ 
                                opacity: 1, 
                                fillOpacity: 1,
                                color: '#0ea5e9',
                                fillColor: '#0ea5e9'
                            });
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error restoring marker ${index}:`, error);
                }
            }
        });
        
        // Clear smoothed data
        pathData.smoothedWaypoints = null;
        pathData.isSmoothed = false;
        
        // Recreate path line with original waypoints
        if (pathData.waypoints.length > 1) {
            pathData.pathLine = L.polyline(pathData.waypoints, { color: '#0ea5e9', weight: 3 }).addTo(map);
        }
    }
    
    // Remove markers
    for (let i = pointIndex; i < pathData.waypointMarkers.length; i++) {
        map.removeLayer(pathData.waypointMarkers[i]);
    }
    
    pathData.waypoints.splice(pointIndex);
    pathData.waypointMarkers.splice(pointIndex);
    
    if (pathData.waypoints.length === 0) {
        // Path empty?
        if (pathData.pathLine) map.removeLayer(pathData.pathLine);
        paths.splice(pathIndex, 1);
    } else {
        if (pathData.pathLine) {
            // Update path line with remaining waypoints
            pathData.pathLine.setLatLngs(pathData.waypoints);
        }
    }
    
    updateCandidatePath(candidateId);
    calculateSpeedsForManualPaths();
}

function updateCandidatePath(candidateId: string) {
    const manager = (window as any).entryDetectionManager;
    const candidate = manager?.candidates.find((c: any) => c.id === candidateId);
    if (!candidate) return;
    
    const paths = manualPathsMap.get(candidateId);
    if (!paths || paths.length === 0) return;
    
    const pathData = paths[0]; // Main path
    
    // Use smoothed waypoints if available, otherwise use original waypoints
    const waypointsToUse = pathData.smoothedWaypoints || pathData.waypoints;
    const coords = waypointsToUse.map((p: any) => [p.lng, p.lat]);
    
    candidate.path = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {}
    };
    
    // Calculate distance using smoothed waypoints if available
    let dist = 0;
    for (let i = 0; i < waypointsToUse.length - 1; i++) {
        dist += waypointsToUse[i].distanceTo(waypointsToUse[i+1]);
    }
    candidate.distanceMeters = dist;
}

function handleManualPathClick(e: any) {
    if (!drawingCandidateId) return;
    const paths = manualPathsMap.get(drawingCandidateId);
    if (!paths || paths.length === 0) return;
    
    const pathData = paths[paths.length - 1];
    let newPoint = e.latlng;
    
    // Duplicate check (lenient)
    if (pathData.waypoints.length > 0) {
        const last = pathData.waypoints[pathData.waypoints.length - 1];
        if (last.distanceTo(newPoint) < 0.1) return; 
    }
    
    // Try to snap to nearest road if OSM data is available
    if (currentOsmData && currentOsmData.ways) {
        const snappedPoint = findNearestPointOnRoad(newPoint, currentOsmData);
        if (snappedPoint) {
            newPoint = snappedPoint;
        }
    }
    
    pathData.waypoints.push(newPoint);
    
    if (!pathData.pathLine) {
        pathData.pathLine = L.polyline(pathData.waypoints, { color: '#0ea5e9', weight: 3 }).addTo(map);
    } else {
        pathData.pathLine.setLatLngs(pathData.waypoints);
    }
    
    const marker = createWaypointMarker(newPoint, {id: drawingCandidateId}, paths.length - 1, pathData.waypoints.length - 1);
    pathData.waypointMarkers.push(marker);
    
    updateCandidatePath(drawingCandidateId);
}

function findNearestPointOnRoad(point: L.LatLng, osmData: OsmBundle): L.LatLng | null {
    if (!osmData.ways || osmData.ways.length === 0) return null;
    if (!osmData.nodes) return null;
    
    // Build node index for quick lookup
    const nodeIndex = new Map<string, any>();
    osmData.nodes.forEach((node: any) => {
        nodeIndex.set(String(node.id), node);
    });
    
    let closestPoint: L.LatLng | null = null;
    let closestDistance = Infinity;
    const maxSearchDistance = 50; // meters
    
    for (const way of osmData.ways) {
        // Skip pedestrian/cycle paths
        if (way.tags?.highway === 'footway' || way.tags?.highway === 'cycleway' || way.tags?.highway === 'path') {
            continue;
        }
        
        if (!way.nodeIds || way.nodeIds.length < 2) continue;
        
        // Check each segment of the way
        for (let i = 0; i < way.nodeIds.length - 1; i++) {
            const nodeId1 = String(way.nodeIds[i]);
            const nodeId2 = String(way.nodeIds[i + 1]);
            const node1 = nodeIndex.get(nodeId1);
            const node2 = nodeIndex.get(nodeId2);
            
            if (!node1 || !node2) continue;
            
            const segStart = L.latLng(node1.lat, node1.lon);
            const segEnd = L.latLng(node2.lat, node2.lon);
            
            // Find closest point on segment
            const closestOnSegment = closestPointOnSegment(point, segStart, segEnd);
            const distance = point.distanceTo(closestOnSegment) * 111000; // rough conversion to meters
            
            if (distance < maxSearchDistance && distance < closestDistance) {
                closestDistance = distance;
                closestPoint = closestOnSegment;
            }
        }
    }
    
    return closestPoint;
}

/**
 * Smooths a path using tangential curves (quadratic Bezier curves)
 * Creates smooth transitions at waypoints while maintaining tangent continuity
 */
function smoothPathWithTangentialCurves(waypoints: L.LatLng[]): L.LatLng[] {
    console.log(`🔄 smoothPathWithTangentialCurves: Input ${waypoints.length} waypoints`);
    
    if (waypoints.length < 2) {
        console.warn('⚠️ Less than 2 waypoints, returning as-is');
        return waypoints;
    }
    if (waypoints.length === 2) {
        console.log('📏 Only 2 waypoints, returning straight line');
        return waypoints;
    }
    
    const smoothed: L.LatLng[] = [];
    const tension = 0.3; // Controls curve tightness (0 = straight, 1 = very curved)
    
    // Add first point
    smoothed.push(waypoints[0]);
    console.log(`📍 Added first point: ${waypoints[0].lat}, ${waypoints[0].lng}`);
    
    try {
        for (let i = 0; i < waypoints.length - 1; i++) {
            const p0 = waypoints[Math.max(0, i - 1)];
            const p1 = waypoints[i];
            const p2 = waypoints[i + 1];
            const p3 = waypoints[Math.min(waypoints.length - 1, i + 2)];
            
            // Calculate control points for smooth tangential curves
            // For the first segment, use simpler calculation
            if (i === 0) {
                // First segment: curve from p1 to p2
                // Use a simple quadratic curve with control point along the direction
                const dir = calculateDirection(p1, p2);
                const dist = p1.distanceTo(p2);
                const controlDist = Math.min(dist * tension, 15); // Max 15m control distance
                
                // Control point is positioned along the path direction for smooth start
                const controlPoint = calculateOffsetPoint(p1, dir, controlDist);
                
                // Generate curve points
                const numPoints = Math.max(5, Math.min(15, Math.floor(dist / 5))); // Adaptive point count
                const curvePoints = generateQuadraticBezierCurve(p1, controlPoint, p2, numPoints);
                smoothed.push(...curvePoints.slice(1)); // Skip first point (already added)
                console.log(`  📍 Segment 0: Generated ${curvePoints.length - 1} curve points (dist: ${dist.toFixed(1)}m)`);
            } else if (i === waypoints.length - 2) {
                // Last segment: curve from p1 to p2
                const dir = calculateDirection(p1, p2);
                const dist = p1.distanceTo(p2);
                const controlDist = Math.min(dist * tension, 15);
                
                // Control point offset backwards from p2 along the direction
                const controlPoint = calculateOffsetPoint(p2, dir + Math.PI, controlDist);
                const numPoints = Math.max(5, Math.min(15, Math.floor(dist / 5)));
                const curvePoints = generateQuadraticBezierCurve(p1, controlPoint, p2, numPoints);
                smoothed.push(...curvePoints.slice(1));
                console.log(`  📍 Last segment: Generated ${curvePoints.length - 1} curve points (dist: ${dist.toFixed(1)}m)`);
            } else {
                // Middle segments: smooth transition maintaining tangent continuity
                // Calculate incoming and outgoing directions
                const dirIn = calculateDirection(p0, p1);  // Direction into p1
                const dirOut = calculateDirection(p1, p2); // Direction out of p1
                const dirNext = calculateDirection(p2, p3); // Direction out of p2
                
                // For tangent continuity, control points should align with the path directions
                // Control point 1: extends from p1 along the average of incoming/outgoing directions
                const avgDir1 = averageAngle(dirIn, dirOut);
                const dist1 = p1.distanceTo(p2);
                const controlDist1 = Math.min(dist1 * tension * 0.5, 10); // Shorter for tighter curves
                
                // Control point 2: extends backwards from p2 along the average direction
                const avgDir2 = averageAngle(dirOut, dirNext);
                const controlDist2 = Math.min(dist1 * tension * 0.5, 10);
                
                // Control points positioned to create smooth tangential transitions
                const cp1 = calculateOffsetPoint(p1, avgDir1, controlDist1);
                const cp2 = calculateOffsetPoint(p2, avgDir2 + Math.PI, controlDist2);
                
                // Use cubic Bezier for smoother curves in the middle
                const numPoints = Math.max(8, Math.min(20, Math.floor(dist1 / 3)));
                const curvePoints = generateCubicBezierCurve(p1, cp1, cp2, p2, numPoints);
                smoothed.push(...curvePoints.slice(1));
                console.log(`  📍 Middle segment ${i}: Generated ${curvePoints.length - 1} curve points (dist: ${dist1.toFixed(1)}m)`);
            }
        }
        
        // Add last point (if not already added)
        const lastPoint = waypoints[waypoints.length - 1];
        const lastAdded = smoothed[smoothed.length - 1];
        if (!lastAdded || lastAdded.lat !== lastPoint.lat || lastAdded.lng !== lastPoint.lng) {
            smoothed.push(lastPoint);
            console.log(`📍 Added last point: ${lastPoint.lat}, ${lastPoint.lng}`);
        }
        
        console.log(`✅ Smoothing complete: ${smoothed.length} total points generated`);
        return smoothed;
    } catch (error) {
        console.error('❌ Error in smoothPathWithTangentialCurves:', error);
        console.error('Stack:', (error as Error).stack);
        // Return original waypoints as fallback
        return waypoints;
    }
}

/**
 * Calculates the direction (bearing) from point1 to point2 in radians
 */
function calculateDirection(p1: L.LatLng, p2: L.LatLng): number {
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    return Math.atan2(y, x);
}

/**
 * Calculates a point offset from the given point by distance and direction
 */
function calculateOffsetPoint(point: L.LatLng, direction: number, distanceMeters: number): L.LatLng {
    const R = 6371000; // Earth radius in meters
    const lat1 = point.lat * Math.PI / 180;
    const lon1 = point.lng * Math.PI / 180;
    
    const d = distanceMeters / R;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(direction));
    const lon2 = lon1 + Math.atan2(Math.sin(direction) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    
    return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
}

/**
 * Averages two angles, handling wrap-around
 */
function averageAngle(angle1: number, angle2: number): number {
    // Normalize angles to [0, 2π]
    const n1 = ((angle1 % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
    const n2 = ((angle2 % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
    
    // Calculate average, handling wrap-around
    let diff = n2 - n1;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    
    return n1 + diff / 2;
}

/**
 * Generates points along a quadratic Bezier curve
 */
function generateQuadraticBezierCurve(p0: L.LatLng, p1: L.LatLng, p2: L.LatLng, numPoints: number): L.LatLng[] {
    const points: L.LatLng[] = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const lat = (1 - t) * (1 - t) * p0.lat + 2 * (1 - t) * t * p1.lat + t * t * p2.lat;
        const lng = (1 - t) * (1 - t) * p0.lng + 2 * (1 - t) * t * p1.lng + t * t * p2.lng;
        points.push(L.latLng(lat, lng));
    }
    
    return points;
}

/**
 * Generates points along a cubic Bezier curve
 */
function generateCubicBezierCurve(p0: L.LatLng, p1: L.LatLng, p2: L.LatLng, p3: L.LatLng, numPoints: number): L.LatLng[] {
    const points: L.LatLng[] = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        const lat = mt3 * p0.lat + 3 * mt2 * t * p1.lat + 3 * mt * t2 * p2.lat + t3 * p3.lat;
        const lng = mt3 * p0.lng + 3 * mt2 * t * p1.lng + 3 * mt * t2 * p2.lng + t3 * p3.lng;
        points.push(L.latLng(lat, lng));
    }
    
    return points;
}

function closestPointOnSegment(point: L.LatLng, segStart: L.LatLng, segEnd: L.LatLng): L.LatLng {
    const A = point.lat - segStart.lat;
    const B = point.lng - segStart.lng;
    const C = segEnd.lat - segStart.lat;
    const D = segEnd.lng - segStart.lng;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx: number, yy: number;
    
    if (param < 0) {
        xx = segStart.lat;
        yy = segStart.lng;
    } else if (param > 1) {
        xx = segEnd.lat;
        yy = segEnd.lng;
    } else {
        xx = segStart.lat + param * C;
        yy = segStart.lng + param * D;
    }
    
    return L.latLng(xx, yy);
}

function calculateSpeedsForManualPaths() {
    console.log('Calculating speeds for manual paths...');
    const manager = (window as any).entryDetectionManager;
    if (!manager || !manager.candidates) return;
    
    manager.candidates.forEach((candidate: any) => {
        if (!candidate.manual) return;
        const paths = manualPathsMap.get(candidate.id);
        if (!paths || paths.length === 0) return;
        
        const pathData = paths[0];
        const samples = pathData.waypoints.map((p: any, i: number) => {
            let d = 0;
            for(let k=0; k<i; k++) d += pathData.waypoints[k].distanceTo(pathData.waypoints[k+1]);
            return { lat: p.lat, lng: p.lng, distance: d };
        });
        
        if (osmSpeedLimiter && samples.length > 1) {
            try {
                const config = { useMaxspeed: true, useTrafficCalming: true, useSurface: true, weather: 'dry' as any };
                const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
                const accRange = getAccelerationRange(vehicleSelect?.value || '3500');
                const maxAcc = accRange ? accRange[1] : 3.0;
                
                // NOTE: OsmSpeedLimiter might need updating if signatures don't match, 
                // but assuming calculatePathVelocityProfile exists or similar logic
                // If not, we can reuse calculateVelocityWithOsm logic slightly modified
                
                // Let's use calculateVelocityWithOsm which seems robust
                // But calculateVelocityWithOsm takes total distance and maybe coords
                // It applies OSM limits.
                
                const totalDist = samples[samples.length-1].distance;
                const coords = samples.map(s => ({lat: s.lat, lng: s.lng}));
                
                const v = calculateVelocityWithOsm(maxAcc, totalDist, coords);
                candidate.calculatedSpeed = v;
                candidate.hasCalculatedSpeed = true;
                console.log(`Manual path ${candidate.id}: speed = ${v} km/h`);
            } catch (err) {
                console.error("Error calculating speed for manual path:", err);
            }
        }
    });
    createEntryDetectionMarkers();
}

function createEntryDetectionMarkers() {
    const manager = (window as any).entryDetectionManager;
    if (!manager || !manager.candidates || manager.candidates.length === 0) {
        // If no Entry Detection candidates, try to create markers from threatsMap
        if (threatsMap.size > 0) {
            console.log('⚠️ No Entry Detection candidates, but threatsMap has entries. Creating markers from threatsMap...');
            createMarkersFromThreatsMap();
        }
        return;
    }

    clearEntryDetectionMarkers();
    
    if (!threatLayerGroup) {
        threatLayerGroup = L.layerGroup().addTo(map);
    }
    
    // Get OSM data to check for Erschließungsstraßen
    const osmData = (window as any).currentOsmData;
    const waysMap = new Map();
    
    if (osmData && osmData.ways) {
        osmData.ways.forEach((way: any) => {
            waysMap.set(way.id, way);
        });
    }
    
    // Also include entry points from threatsMap that don't have Entry Detection candidates
    const allCandidates = [...manager.candidates];
    
    // Add entry points from threatsMap that aren't already in Entry Detection
    if (threatsMap.size > 0) {
        const existingPoints = new Set(manager.candidates.map((c: any) => {
            const [lng, lat] = c.intersectionPoint;
            return `${lat.toFixed(6)},${lng.toFixed(6)}`;
        }));
        
        threatsMap.forEach((threatData, streetName) => {
            threatData.entryPoints.forEach((entryPoint) => {
                const pointKey = `${entryPoint.lat.toFixed(6)},${entryPoint.lon.toFixed(6)}`;
                if (!existingPoints.has(pointKey)) {
                    // Create a candidate from threat data
                    const candidate = {
                        id: `threat-${streetName}-${entryPoint.lat}-${entryPoint.lon}`,
                        intersectionPoint: [entryPoint.lon, entryPoint.lat],
                        pathNodeIds: [],
                        path: null as any,
                        distanceMeters: entryPoint.distance || threatData.totalLength,
                        straightness: 1,
                        continuity: 1,
                        confidence: 0.8,
                        wayIds: [],
                        manual: false,
                        fromThreatsMap: true,
                        streetName: streetName,
                        threatData: threatData
                    };
                    allCandidates.push(candidate);
                    existingPoints.add(pointKey);
                }
            });
        });
    }
    
    // Calculate center for sorting
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    allCandidates.forEach((c: any) => {
        const [lng, lat] = c.intersectionPoint;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
    });
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Sort clockwise from top-left
    const sortedCandidates = [...allCandidates].sort((a: any, b: any) => {
        const [lngA, latA] = a.intersectionPoint;
        const [lngB, latB] = b.intersectionPoint;
        let angleA = Math.atan2(latA - centerLat, lngA - centerLng) * 180 / Math.PI;
        let angleB = Math.atan2(latB - centerLat, lngB - centerLng) * 180 / Math.PI;
        let azA = (90 - angleA + 360) % 360;
        let azB = (90 - angleB + 360) % 360;
        let sortA = (azA - 315 + 360) % 360; // Start at NW (315 deg)
        let sortB = (azB - 315 + 360) % 360;
        return sortA - sortB;
    });
    
    console.log(`🔍 Processing ${sortedCandidates.length} entry detection candidates (${manager.candidates.length} from Entry Detection, ${sortedCandidates.length - manager.candidates.length} from threatsMap)...`);
    
    sortedCandidates.forEach((candidate: any, index: number) => {
        // Check if this candidate uses Erschließungsstraßen
        let isErschliessung = false;
        if (candidate.wayIds && candidate.wayIds.length > 0) {
            for (const wayId of candidate.wayIds) {
                const way = waysMap.get(wayId);
                if (way && isErschliessungsstrasse(way)) {
                    isErschliessung = true;
                    break;
                }
            }
        }
        
        const isManual = !!candidate.manual;
        const number = index + 1;
        
        // Determine marker color
        // Manual OR High Threat (Red) vs Erschließung (Gold)
        // User wants white number in red circle.
        // Use #DC143C for Red, #FFD700 for Gold.
        
        const bgColor = (isManual || !isErschliessung || candidate.hasCalculatedSpeed) ? '#DC143C' : '#FFD700';
        
        const iconHtml = `<div style="
            background-color: ${bgColor};
            color: white;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px; /* Doubled size from 12px -> 24px requested, 18px fits well in 32px */
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">${number}</div>`;
        
        const marker = L.marker([candidate.intersectionPoint[1], candidate.intersectionPoint[0]], {
            icon: L.divIcon({
                className: 'entry-point-marker',
                html: iconHtml,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            })
        });

        // Add right-click context menu
        marker.on('contextmenu', (e: any) => {
            e.originalEvent.preventDefault();
            
            // Allow context menu if in manual mode OR if it's a manual entry (so we can edit/delete it)
            if (currentActiveTab === 'nav-threat-analysis' && (manualEntryMode || isManual)) {
                // Show full context menu for manual entries too
                const menu = document.createElement('div');
                menu.className = 'waypoint-context-menu';
                menu.style.cssText = `
                    position: absolute;
                    left: ${e.originalEvent.clientX}px;
                    top: ${e.originalEvent.clientY}px;
                    background: white;
                    border: 1px solid #ccc;
                    padding: 5px;
                    border-radius: 4px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 10000;
                    min-width: 150px;
                `;
                
                const createBtn = (text: string, color: string, onClick: () => void) => {
                    const btn = document.createElement('div');
                    btn.textContent = text;
                    btn.style.cssText = `padding: 8px 12px; cursor: pointer; color: ${color}; font-family: sans-serif; font-size: 13px; border-bottom: 1px solid #eee;`;
                    btn.onmouseover = () => btn.style.background = '#f3f4f6';
                    btn.onmouseout = () => btn.style.background = 'transparent';
                    btn.onclick = onClick;
                    return btn;
                };
                
                menu.appendChild(createBtn('Löschen', '#dc2626', () => {
                    deleteEntryPoint(marker, candidate);
                    document.body.removeChild(menu);
                }));
                
                menu.appendChild(createBtn('Abzweigung', '#0ea5e9', () => {
                    startBranchPath(candidate, marker);
                    document.body.removeChild(menu);
                }));
                
                // Start drawing path from this entry point if it's manual
                if (isManual) {
                     menu.appendChild(createBtn('Pfad zeichnen', '#10b981', () => {
                        startPathDrawingForEntryPoint(candidate.id);
                        document.body.removeChild(menu);
                    }));
                }

                document.body.appendChild(menu);
                
                const closeMenu = (ev: any) => {
                    if (!menu.contains(ev.target)) {
                        if (document.body.contains(menu)) document.body.removeChild(menu);
                        document.removeEventListener('click', closeMenu);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeMenu), 0);
                return;
            }
            
            // Standard deletion for non-manual mode or non-manual entries
            if (currentActiveTab === 'nav-threat-analysis') {
                createDeletionBubble(marker, candidate, isErschliessung);
            }
        });
        
        // Popup content
        const popupContent = `
            <div style="min-width: 200px;">
                <b>🚪 Zufahrtspunkt ${number}</b><br>
                <b>Typ:</b> ${isManual ? 'Manuell' : (isErschliessung ? 'Erschließungsstraße' : 'Hauptzufahrt')}<br>
                <b>Confidence:</b> ${Math.round(candidate.confidence * 100)}%<br>
                <b>Distanz:</b> ${Math.round(candidate.distanceMeters)}m<br>
                <b>Geradheit:</b> ${Math.round(candidate.straightness * 100)}%<br>
                <b>Ways:</b> ${candidate.wayIds.length}
            </div>
        `;
        marker.bindPopup(popupContent);
        
        threatLayerGroup?.addLayer(marker);
        
        if (!threatMarkersMap.has('entry-detection')) {
            threatMarkersMap.set('entry-detection', []);
        }
        threatMarkersMap.get('entry-detection')?.push(marker);
    });
    
    console.log(`✅ Created ${sortedCandidates.length} entry detection markers`);
}

/**
 * Creates markers from threatsMap when Entry Detection is not available
 */
function createMarkersFromThreatsMap() {
    if (threatsMap.size === 0) return;
    
    clearEntryDetectionMarkers();
    
    if (!threatLayerGroup) {
        threatLayerGroup = L.layerGroup().addTo(map);
    }
    
    // Collect all entry points from threatsMap
    const allEntryPoints: Array<{point: {lat: number, lon: number}, streetName: string, threatData: any}> = [];
    threatsMap.forEach((threatData, streetName) => {
        threatData.entryPoints.forEach((entryPoint: any) => {
            allEntryPoints.push({
                point: entryPoint,
                streetName: streetName,
                threatData: threatData
            });
        });
    });
    
    if (allEntryPoints.length === 0) return;
    
    // Calculate center for sorting
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    allEntryPoints.forEach(({point}) => {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLng = Math.min(minLng, point.lon);
        maxLng = Math.max(maxLng, point.lon);
    });
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Sort clockwise from top-left
    const sorted = [...allEntryPoints].sort((a, b) => {
        const latA = a.point.lat;
        const lngA = a.point.lon;
        const latB = b.point.lat;
        const lngB = b.point.lon;
        let angleA = Math.atan2(latA - centerLat, lngA - centerLng) * 180 / Math.PI;
        let angleB = Math.atan2(latB - centerLat, lngB - centerLng) * 180 / Math.PI;
        let azA = (90 - angleA + 360) % 360;
        let azB = (90 - angleB + 360) % 360;
        let sortA = (azA - 315 + 360) % 360;
        let sortB = (azB - 315 + 360) % 360;
        return sortA - sortB;
    });
    
    sorted.forEach((entry, index) => {
        const number = index + 1;
        const bgColor = '#DC143C'; // Red for all threats
        
        const iconHtml = `<div style="
            background-color: ${bgColor};
            color: white;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">${number}</div>`;
        
        const marker = L.marker([entry.point.lat, entry.point.lon], {
            icon: L.divIcon({
                className: 'entry-point-marker',
                html: iconHtml,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            })
        });
        
        // Add context menu for deletion
        marker.on('contextmenu', (e: any) => {
            e.originalEvent.preventDefault();
            if (currentActiveTab === 'nav-threat-analysis') {
                const candidate = {
                    id: `threat-${entry.streetName}-${entry.point.lat}-${entry.point.lon}`,
                    intersectionPoint: [entry.point.lon, entry.point.lat],
                    manual: false,
                    fromThreatsMap: true
                };
                createDeletionBubble(marker, candidate, false);
            }
        });
        
        const popupContent = `
            <div style="min-width: 200px;">
                <b>🚪 Zufahrtspunkt ${number}</b><br>
                <b>Straße:</b> ${entry.streetName}<br>
                <b>Distanz:</b> ${Math.round(entry.point.distance || entry.threatData.totalLength)}m<br>
                <b>Geschwindigkeit:</b> ${entry.threatData.maxSpeed || 'unbekannt'} km/h
            </div>
        `;
        marker.bindPopup(popupContent);
        
        threatLayerGroup?.addLayer(marker);
        
        if (!threatMarkersMap.has('entry-detection')) {
            threatMarkersMap.set('entry-detection', []);
        }
        threatMarkersMap.get('entry-detection')?.push(marker);
    });
    
    console.log(`✅ Created ${sorted.length} markers from threatsMap`);
}

/**
 * Add interactive tooltip to a marker
 */
function addInteractiveTooltip(marker: any, streetName: string, maxSpeed: number, product: any, markerIndex?: number) {
    let tooltipElement: HTMLElement | null = null;
    let isPinned = false;
    let leafletPopup: any = null; // For pinned state using Leaflet popup
    
    // Add CSS class to marker for hover effects
    const markerIcon = marker.getElement?.();
    if (markerIcon) {
        markerIcon.classList.add('has-tooltip');
    }
    
    // Create tooltip content
    const createTooltipContent = () => {
        const productImage = generateProductImagePath(product);
        console.log('Tooltip: Product image path generated:', productImage);
        console.log('Tooltip: Product data:', product);
        
        return `
            <div class="product-tooltip">
                <div class="tooltip-header">
                    <h4>${streetName}</h4>
                    <span class="tooltip-close">×</span>
                </div>
                <div class="tooltip-content">
                    <div class="product-image">
                        <img src="${productImage}" alt="${product.product_name || product.type || 'Produkt'}" 
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <div class="product-image-placeholder" style="display: none;">
                            <i class="fas fa-image"></i>
                        </div>
                    </div>
                    <div class="product-info">
                        <h5>${product.product_name || product.type || 'Unbekanntes Produkt'}</h5>
                        <p><strong>Hersteller:</strong> ${product.manufacturer}</p>
                        <p><strong>Getestete Geschw.:</strong> ${product.speed || product.pr_speed_kph || product.technical_data?.pr_speed_kph || 'N/A'} km/h</p>
                        <p><strong>Erforderlich:</strong> ${maxSpeed} km/h</p>
                        <p><strong>Fahrzeugtyp:</strong> ${product.pr_veh || 'N/A'}</p>
                        <p><strong>Standard:</strong> ${product.standard}</p>
                    </div>
                </div>
                <div class="tooltip-pin-indicator ${isPinned ? 'pinned' : ''}">
                    <i class="fas fa-thumbtack"></i> ${isPinned ? 'Angepinnt' : 'Klicken zum Anpinnen'}
                </div>
            </div>
        `;
    };
    
    // Mouse enter event
    marker.on('mouseover', (e: any) => {
        if (isPinned) return; // Don't show hover tooltip if already pinned
        
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'leaflet-tooltip-pane';
        tooltipElement.innerHTML = createTooltipContent();
        
        document.body.appendChild(tooltipElement);
        
        // Position tooltip near mouse
        const updateTooltipPosition = (event: MouseEvent) => {
            if (tooltipElement) {
                tooltipElement.style.left = `${event.clientX + 10}px`;
                tooltipElement.style.top = `${event.clientY - 10}px`;
            }
        };
        
        updateTooltipPosition(e.originalEvent);
        
        // Track mouse movement for tooltip positioning
        document.addEventListener('mousemove', updateTooltipPosition);
        
        // Store the cleanup function
        (tooltipElement as any).cleanup = () => {
            document.removeEventListener('mousemove', updateTooltipPosition);
        };
    });
    
    // Mouse leave event
    marker.on('mouseout', () => {
        if (isPinned) return; // Don't hide if pinned
        
        if (tooltipElement) {
            if ((tooltipElement as any).cleanup) {
                (tooltipElement as any).cleanup();
            }
            document.body.removeChild(tooltipElement);
            tooltipElement = null;
        }
    });
    
    // Click event for pinning/unpinning
    marker.on('click', async (e: any) => {
        e.originalEvent.stopPropagation();
        
        if (isPinned) {
            // Unpin the tooltip/popup
            isPinned = false;
            
            // Close Leaflet popup if it exists
            if (leafletPopup) {
                map.closePopup(leafletPopup);
                leafletPopup = null;
                console.log('Popup unpinned');
            }
            
            // Clean up old tooltip if it exists
            if (tooltipElement) {
                // Remove from pinned tooltips array
                const index = pinnedTooltips.findIndex(pt => pt.element === tooltipElement);
                if (index !== -1) {
                    pinnedTooltips.splice(index, 1);
                }
                
                // Remove from pinned products (legacy UI array)
                const productIndex = pinnedProducts.findIndex(pp => pp.marker === marker);
                if (productIndex !== -1) {
                    pinnedProducts.splice(productIndex, 1);
                }
                
                // Remove from persistent store
                try {
                    const { useTenderSelection } = await import('./src/stores/useTenderSelection');
                    // Find entry by marker/streetName match
                    const storeItems = useTenderSelection.getState().list();
                    const toRemove = storeItems.find(item => item.entryLabel === streetName);
                    if (toRemove) {
                        useTenderSelection.getState().remove(`${toRemove.entryId}:${toRemove.id}`);
                    }
                } catch (err) {
                    console.warn('Failed to remove from tender selection store:', err);
                }
                
                if ((tooltipElement as any).cleanup) {
                    (tooltipElement as any).cleanup();
                }
                document.body.removeChild(tooltipElement);
                tooltipElement = null;
            }
        } else {
            // Pin the tooltip using Leaflet popup
            isPinned = true;
            
            // Remove any existing hover tooltip
            if (tooltipElement && !tooltipElement.classList.contains('pinned-tooltip')) {
                if ((tooltipElement as any).cleanup) {
                    (tooltipElement as any).cleanup();
                }
                document.body.removeChild(tooltipElement);
                tooltipElement = null;
            }
            
            // Create pinned tooltip using Leaflet popup
            const popupContent = createTooltipContent();
            
            // Safely get marker coordinates with validation
            const markerLatLng = marker.getLatLng ? marker.getLatLng() : 
                                 marker._latlng || marker.latlng || 
                                 { lat: 0, lng: 0 };
            
            // Validate coordinates before creating popup
            if (!markerLatLng || typeof markerLatLng.lat !== 'number' || typeof markerLatLng.lng !== 'number') {
                console.error('Invalid marker coordinates for popup:', markerLatLng);
                return;
            }
            
            try {
                // Store current map view before opening popup
                const currentCenter = map.getCenter();
                const currentZoom = map.getZoom();
                
            leafletPopup = L.popup({
                closeButton: true,
                autoClose: false,
                closeOnClick: false,
                className: 'product-popup',
                offset: [10, -10]
            })
                .setLatLng(markerLatLng)
                .setContent(popupContent);
                
                // Add popup to map without auto-centering
                leafletPopup.addTo(map);
                
                // Restore original map view to prevent jumping
                setTimeout(() => {
                    if (map && currentCenter && typeof currentZoom === 'number') {
                        map.setView(currentCenter, currentZoom, { animate: false });
                    }
                }, 10);
            
                // Override the _animateZoom method to handle errors gracefully
                const originalAnimateZoom = leafletPopup._animateZoom;
                leafletPopup._animateZoom = function(e: any) {
                    try {
                        if (this._latlng && this._latlng.lat && this._latlng.lng) {
                            return originalAnimateZoom.call(this, e);
                        }
                    } catch (error) {
                        console.warn('Popup zoom animation error prevented:', error);
                    }
                };
            } catch (error) {
                console.error('Error creating popup:', error);
                return;
            }
            
            console.log(`Popup pinned using Leaflet API at:`, markerLatLng);
            
            // Add to pinned products list (legacy UI array)
            pinnedProducts.push({
                streetName: streetName,
                maxSpeed: maxSpeed,
                product: product,
                marker: marker
            });
            
            // Add to persistent store
            try {
                const { useTenderSelection } = await import('./src/stores/useTenderSelection');
                const entryId = markerIndex !== undefined ? `${streetName}-${markerIndex}` : `${streetName}-${Date.now()}`;
                const productId = product.id || product.product_name || String(Date.now());
                const key = `${entryId}:${productId}`;
                
                // Check if already exists to avoid duplicates
                const existing = useTenderSelection.getState().items[key];
                if (!existing) {
                    useTenderSelection.getState().add({
                        id: productId,
                        name: product.product_name || 'Unbekannt',
                        entryId: entryId,
                        entryLabel: streetName,
                        requiredSpeedKmh: maxSpeed,
                        standards: Array.isArray(product.standard) 
                            ? product.standard 
                            : product.technical_data?.standard 
                            ? [product.technical_data.standard]
                            : [],
                        image: product.product_image_file || undefined,
                        raw: product
                    });
                }
            } catch (err) {
                console.warn('Failed to add to tender selection store:', err);
            }
            
            console.log(`📌 Product pinned: ${streetName} - ${product.product_name}`);
            
            // Add close event handler for popup
            leafletPopup.on('remove', async () => {
                isPinned = false;
                leafletPopup = null;
                // Remove from pinned products (legacy UI array)
                const productIndex = pinnedProducts.findIndex(pp => pp.marker === marker);
                if (productIndex !== -1) {
                    pinnedProducts.splice(productIndex, 1);
                }
                
                // Remove from persistent store
                try {
                    const { useTenderSelection } = await import('./src/stores/useTenderSelection');
                    // Find entry by marker/streetName match
                    const storeItems = useTenderSelection.getState().list();
                    const toRemove = storeItems.find(item => item.entryLabel === streetName);
                    if (toRemove) {
                        useTenderSelection.getState().remove(`${toRemove.entryId}:${toRemove.id}`);
                    }
                } catch (err) {
                    console.warn('Failed to remove from tender selection store:', err);
                }
                console.log('Popup closed');
            });
        }
    });
}

/**
 * Intelligent product type recommendation based on context
 */
function recommendProductTypes(context: {
    assetToProtect: string,
    securityLevel: string,
    protectionGrade: string,
    locationContext: string,
    threatLevel: number
}): string[] {
    const { assetToProtect, securityLevel, protectionGrade, locationContext, threatLevel } = context;
    
    // Asset-based recommendations
    const assetLower = assetToProtect.toLowerCase();
    const locationLower = locationContext.toLowerCase();
    
    let recommendations: string[] = [];
    
    // 🏭 Industrial/Critical Infrastructure
    if (assetLower.includes('atomkraftwerk') || assetLower.includes('nuclear') || 
        assetLower.includes('kraftwerk') || assetLower.includes('power plant')) {
        recommendations = ['Tor', 'Schranke', 'Zaun', 'Poller'];
    }
    // 🏭 General Industrial
    else if (assetLower.includes('industrie') || assetLower.includes('industrial') || 
             assetLower.includes('fabrik') || assetLower.includes('factory') ||
             assetLower.includes('werk') || assetLower.includes('plant')) {
        recommendations = ['Tor', 'Schranke', 'Zaun'];
    }
    // 🏛️ Government/Military
    else if (assetLower.includes('regierung') || assetLower.includes('government') ||
             assetLower.includes('militär') || assetLower.includes('military') ||
             assetLower.includes('ministerium') || assetLower.includes('embassy')) {
        recommendations = ['Tor', 'Zaun', 'Poller', 'Durchfahrtsperre'];
    }
    // 🏥 Critical Services
    else if (assetLower.includes('krankenhaus') || assetLower.includes('hospital') ||
             assetLower.includes('flughafen') || assetLower.includes('airport') ||
             assetLower.includes('bahnhof') || assetLower.includes('station')) {
        recommendations = ['Poller', 'Durchfahrtsperre', 'Zaun'];
    }
    // 🏢 Commercial/Office
    else if (assetLower.includes('büro') || assetLower.includes('office') ||
             assetLower.includes('zentrum') || assetLower.includes('center') ||
             assetLower.includes('gebäude') || assetLower.includes('building')) {
        recommendations = ['Poller', 'Durchfahrtsperre'];
    }
    // 🎪 Events/Public Gatherings  
    else if (assetLower.includes('event') || assetLower.includes('veranstaltung') ||
             assetLower.includes('festival') || assetLower.includes('markt') ||
             assetLower.includes('market') || assetLower.includes('platz') ||
             assetLower.includes('square') || assetLower.includes('innenstadt')) {
        recommendations = ['Poller', 'Durchfahrtsperre']; // NO fences/gates for public events
    }
    // 🏫 Schools/Universities
    else if (assetLower.includes('schule') || assetLower.includes('school') ||
             assetLower.includes('universität') || assetLower.includes('university') ||
             assetLower.includes('campus')) {
        recommendations = ['Poller', 'Durchfahrtsperre', 'Zaun'];
    }
    
    // Location-based adjustments
    if (locationLower.includes('innenstadt') || locationLower.includes('city center') ||
        locationLower.includes('downtown') || locationLower.includes('pedestrian')) {
        // Urban areas prefer less obtrusive solutions
        recommendations = recommendations.filter(type => type !== 'Zaun' && type !== 'Tor');
    }
    
    // Security level adjustments
    if (securityLevel === 'high' || threatLevel >= 8) {
        if (!recommendations.includes('Tor')) recommendations.unshift('Tor');
        if (!recommendations.includes('Zaun')) recommendations.push('Zaun');
    } else if (securityLevel === 'low' || threatLevel <= 4) {
        recommendations = recommendations.filter(type => type !== 'Tor' && type !== 'Schranke');
    }
    
    // Protection grade adjustments  
    if (protectionGrade === 'permanent') {
        if (!recommendations.includes('Zaun')) recommendations.push('Zaun');
    } else if (protectionGrade === 'temporary') {
        recommendations = recommendations.filter(type => type !== 'Zaun' && type !== 'Tor');
        if (!recommendations.includes('Poller')) recommendations.unshift('Poller');
    }
    
    // Default fallback
    if (recommendations.length === 0) {
        recommendations = ['Poller', 'Durchfahrtsperre'];
    }
    
    return [...new Set(recommendations)]; // Remove duplicates
}

/**
 * Generate context description for location
 */
function generateLocationContext(): string {
    // Try to get context from current map view or user inputs
    // Get asset to protect from chatbot planning state
    const planningState = (window as any).planningState || {};
    const assetToProtect = planningState.schutzgüter || planningState.schutzgueter || '';
    
    // Analyze threats to understand location type
    const threats = Array.from(threatsMap.entries());
    let context = 'unbekannt';
    
    if (threats.length > 0) {
        const roadTypes = threats.map(([, data]) => data.roadType).filter(Boolean);
        const hasHighSpeedRoads = threats.some(([, data]) => (data.maxSpeed || 0) > 70);
        const hasResidential = roadTypes.includes('residential');
        const hasPrimary = roadTypes.includes('primary') || roadTypes.includes('motorway');
        
        if (hasHighSpeedRoads && hasPrimary) {
            context = 'industriell/verkehrsreich';
        } else if (hasResidential && !hasPrimary) {
            context = 'wohngebiet';
        } else if (assetToProtect.toLowerCase().includes('innenstadt') || 
                  assetToProtect.toLowerCase().includes('event')) {
            context = 'innenstadt/öffentlich';
        } else {
            context = 'gemischt';
        }
    }
    
    return context;
}

/**
 * Generate justification for recommended product types
 */
function generateProductTypeJustification(recommendedTypes: string[], assetToProtect: string, locationContext: string, threatLevel: number): string {
    let justification = `Basierend auf dem zu schützenden Objekt "${assetToProtect}", dem Standortkontext "${locationContext}" und dem durchschnittlichen Bedrohungslevel von ${threatLevel.toFixed(1)}/10 werden folgende Produkttypen empfohlen:\n\n`;
    
    recommendedTypes.forEach(type => {
        switch(type) {
            case 'Tor':
                justification += `• Tor: Geeignet für kontrollierte Zufahrten mit hohem Sicherheitsbedarf. Ermöglicht selektiven Zugang für autorisierte Fahrzeuge.\n`;
                break;
            case 'Schranke':
                justification += `• Schranke: Ideal für industrielle Bereiche mit häufigem, aber kontrolliertem Fahrzeugverkehr. Bietet schnelle Durchfahrtskontrolle.\n`;
                break;
            case 'Zaun':
                justification += `• Zaun: Permanente Perimetersicherung für Bereiche mit erhöhtem Sicherheitsbedarf. Verhindert unbefugtes Eindringen.\n`;
                break;
            case 'Poller':
                justification += `• Poller: Diskrete Lösung für öffentliche Bereiche. Ermöglicht Fußgängerverkehr bei gleichzeitigem Fahrzeugschutz.\n`;
                break;
            case 'Durchfahrtsperre':
                justification += `• Durchfahrtsperre: Flexible temporäre Lösung für Events oder veränderliche Sicherheitsanforderungen.\n`;
                break;
        }
    });
    
    return justification;
}

/**
 * Generate detailed threat analysis text for AI report
 */
function generateThreatAnalysisText(): string {
    const threats = Array.from(threatsMap.entries());
    if (threats.length === 0) return 'Keine Bedrohungen erkannt.';
    
    const criticalThreats = threats.filter(([, data]) => (data.threatLevel || 5) >= 9);
    const highThreats = threats.filter(([, data]) => (data.threatLevel || 5) >= 7 && (data.threatLevel || 5) < 9);
    const mediumThreats = threats.filter(([, data]) => (data.threatLevel || 5) >= 5 && (data.threatLevel || 5) < 7);
    const lowThreats = threats.filter(([, data]) => (data.threatLevel || 5) < 5);
    
    let analysis = `Gesamtanzahl identifizierter Zufahrten: ${threats.length}\n`;
    analysis += `Kritische Bedrohungen (Level 9-10): ${criticalThreats.length}\n`;
    analysis += `Hohe Bedrohungen (Level 7-8): ${highThreats.length}\n`;
    analysis += `Mittlere Bedrohungen (Level 5-6): ${mediumThreats.length}\n`;
    analysis += `Niedrige Bedrohungen (Level 1-4): ${lowThreats.length}\n`;
    
    return analysis;
}

/**
 * Get highest threat roads for detailed analysis
 */
function getHighestThreatRoads(): string {
    const threats = Array.from(threatsMap.entries())
        .filter(([, data]) => data.threatLevel && data.threatLevel >= 7)
        .sort((a: any, b: any) => (b[1].threatLevel || 0) - (a[1].threatLevel || 0))
        .slice(0, 5);
    
    if (threats.length === 0) return 'Keine Hochrisiko-Zufahrten identifiziert.';
    
    return threats.map(([name, data]) => 
        `${name}: Level ${data.threatLevel}/10 (${data.roadType}, ${data.maxSpeed} km/h, ${Math.round(data.totalLength)}m Beschleunigungsstrecke)`
    ).join('\n');
}

/**
 * Get threat level distribution statistics
 */
function getThreatLevelDistribution(): string {
    const threats = Array.from(threatsMap.values());
    if (threats.length === 0) return 'Keine Daten verfügbar.';
    
    const roadTypes: Record<string, number> = {};
    const speedRanges = { 'unter_30': 0, '30_50': 0, '50_80': 0, 'über_80': 0 };
    
    threats.forEach(data => {
        const type = data.roadType || 'unbekannt';
        roadTypes[type] = (roadTypes[type] || 0) + 1;
        
        const speed = data.maxSpeed || 50;
        if (speed < 30) speedRanges.unter_30++;
        else if (speed <= 50) speedRanges['30_50']++;
        else if (speed <= 80) speedRanges['50_80']++;
        else speedRanges.über_80++;
    });
    
    let distribution = 'Straßentyp-Verteilung:\n';
    Object.entries(roadTypes).forEach(([type, count]) => {
        distribution += `- ${type}: ${count}\n`;
    });
    
    distribution += '\nGeschwindigkeits-Verteilung:\n';
    distribution += `- Unter 30 km/h: ${speedRanges.unter_30}\n`;
    distribution += `- 30-50 km/h: ${speedRanges['30_50']}\n`;
    distribution += `- 50-80 km/h: ${speedRanges['50_80']}\n`;
    distribution += `- Über 80 km/h: ${speedRanges.über_80}\n`;
    
    return distribution;
}

/**
 * Calculate maximum speed for a threat based on its data
 */
function calculateMaxSpeedForThreat(threatData: any): number {
    if (!threatData.entryPoints || threatData.entryPoints.length === 0) return 0;
    
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    const selectedWeight = vehicleSelect.value;
    const accelerationRange = getAccelerationRange(selectedWeight);
    
    if (!accelerationRange) return 0;
    
    let maxSpeed = 0;
    threatData.entryPoints.forEach(() => {
        const speed = calculateVelocity(accelerationRange[1], threatData.totalLength);
        if (speed > maxSpeed) {
            maxSpeed = speed;
        }
    });
    
    return Math.round(maxSpeed);
}

/**
 * Clear all existing product tooltips
 */
function clearProductTooltips() {
    // Close all Leaflet popups with product-popup class (including no-product-popup)
    if (map) {
        map.eachLayer((layer: any) => {
            if (layer instanceof L.Popup && 
                (layer.options.className === 'product-popup' || 
                 layer.options.className === 'product-popup no-product-popup')) {
                map.closePopup(layer);
            }
        });
    }
    
    // Remove all pinned tooltips (legacy DOM elements)
    const pinnedTooltipElements = document.querySelectorAll('.pinned-tooltip');
    pinnedTooltipElements.forEach(tooltip => {
        if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    });
    
    // Remove any hover tooltips
    const hoverTooltips = document.querySelectorAll('.leaflet-tooltip-pane:not(.pinned-tooltip)');
    hoverTooltips.forEach(tooltip => {
        if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    });
    
    // Clear the pinned tooltips array (UI only - persistent store remains)
    pinnedTooltips = [];
    pinnedProducts = []; // Legacy UI array cleared, but store persists
    
    console.log('All product tooltips and popups cleared (UI only - persistent selection maintained)');
}

/**
 * Update positions of all pinned tooltips when map moves
 */
function updatePinnedTooltipPositions() {
    console.log(`Updating ${pinnedTooltips.length} pinned tooltips`);
    
    if (!map || !map.latLngToContainerPoint) {
        console.warn('Map not available for tooltip position update');
        return;
    }
    
    pinnedTooltips.forEach((pinnedTooltip, index) => {
        try {
        const { element, marker, latLng } = pinnedTooltip;
            
            // Validate latLng before using it
            if (!latLng || typeof latLng.lat !== 'number' || typeof latLng.lng !== 'number') {
                console.warn(`Invalid latLng for pinned tooltip ${index}:`, latLng);
                return;
            }
        
        // Calculate new position based on marker's lat/lng
        const containerPoint = map.latLngToContainerPoint(latLng);
        const mapContainer = map.getContainer();
        const mapRect = mapContainer.getBoundingClientRect();
        
        const newLeft = `${mapRect.left + containerPoint.x + 10}px`;
        const newTop = `${mapRect.top + containerPoint.y - 10}px`;
        
        console.log(`Tooltip ${index}: Moving from (${element.style.left}, ${element.style.top}) to (${newLeft}, ${newTop})`);
        
        // Update tooltip position
        element.style.left = newLeft;
        element.style.top = newTop;
        } catch (error) {
            console.error(`Error updating pinned tooltip position ${index}:`, error);
        }
    });
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

// =============================================================================
// HAZARD ANALYSIS (GEFÄHRDUNGSANALYSE) - Form Data Collection
// =============================================================================

type HazardFactorValue = {
    id: string;
    category: string;
    label: string;
    question: string;
    value: number | null;
};

type HazardAnalysisFormData = {
    city: string;
    area: string;
    expectedDamage: string;
    expectedDamageLabel: string;
    factors: HazardFactorValue[];
    totalScore: number;
    maxPossibleScore: number;
    averageScore: number;
};

/**
 * Collects all form data from the Hazard Analysis bubble
 * @returns HazardAnalysisFormData object or null if the bubble content is not loaded
 */
function getHazardAnalysisFormData(): HazardAnalysisFormData | null {
    const cityInput = document.getElementById('hazard-city') as HTMLInputElement | null;
    const areaInput = document.getElementById('hazard-area') as HTMLInputElement | null;
    const damageSelect = document.getElementById('hazard-expected-damage') as HTMLSelectElement | null;
    
    if (!cityInput && !areaInput && !damageSelect) {
        // Bubble content not yet loaded
        return null;
    }
    
    const city = cityInput?.value?.trim() || '';
    const area = areaInput?.value?.trim() || '';
    const expectedDamage = damageSelect?.value || '';
    
    // Map damage value to human-readable label
    const damageLabels: Record<string, string> = {
        'sachschaden': 'gering (Sachschäden)',
        'leicht': 'leichte Personenschäden',
        'schwer': 'schwere Personenschäden',
        'massenopfer': 'viele Tote / Massenopfer'
    };
    const expectedDamageLabel = damageLabels[expectedDamage] || expectedDamage;
    
    // Factor configurations matching the HTML form
    const factorConfigs: Omit<HazardFactorValue, 'value'>[] = [
        // Anlassbezogene Belange
        { id: 'hazard-anlass-allgemeingebrauch', category: 'Anlassbezogene Belange', label: 'Stadträumlicher Allgemeingebrauch', question: 'Wie stark wird der Raum im Alltag von der Allgemeinheit genutzt?' },
        { id: 'hazard-anlass-sondernutzung', category: 'Anlassbezogene Belange', label: 'Stadträumliche Sondernutzung', question: 'Finden im Raum regelmäßig Sondernutzungen statt (z. B. Veranstaltungen, Märkte)?' },
        { id: 'hazard-anlass-haeufigkeit', category: 'Anlassbezogene Belange', label: 'Häufigkeit der Sondernutzung', question: 'Wie häufig finden Sondernutzungen im betrachteten Raum statt?' },
        { id: 'hazard-anlass-zusammensetzung', category: 'Anlassbezogene Belange', label: 'Zusammensetzung der Nutzer', question: 'Welche Nutzergruppen halten sich überwiegend im Raum auf?' },
        { id: 'hazard-anlass-anzahl', category: 'Anlassbezogene Belange', label: 'Anzahl der Nutzer', question: 'Wie viele Personen nutzen den Raum typischerweise gleichzeitig?' },
        
        // Räumliche Belange
        { id: 'hazard-raum-struktur', category: 'Räumliche Belange', label: 'Bauliche Struktur des Raumes', question: 'Erleichtert die bauliche Struktur des Raumes eine Annäherung von Fahrzeugen?' },
        { id: 'hazard-raum-gebaeude', category: 'Räumliche Belange', label: 'Besondere Gebäude', question: 'Gibt es besonders schutzwürdige Gebäude im unmittelbaren Umfeld?' },
        { id: 'hazard-raum-flucht-nutzer', category: 'Räumliche Belange', label: 'Fluchtoptionen für Nutzer', question: 'Sind ausreichende Fluchtwege für die anwesenden Personen vorhanden?' },
        { id: 'hazard-raum-flaeche', category: 'Räumliche Belange', label: 'Flächengröße', question: 'Wie groß ist die Fläche des betrachteten Raumes?' },
        { id: 'hazard-raum-dichte', category: 'Räumliche Belange', label: 'Besucherdichte', question: 'Wie hoch ist die typische Besucherdichte im Raum?' },
        
        // Weitere Sicherheitsbelange
        { id: 'hazard-security-bedeutung-raum', category: 'Weitere Sicherheitsbelange', label: 'Bedeutung des öffentlichen Raumes', question: 'Welche symbolische oder gesellschaftliche Bedeutung hat der Raum?' },
        { id: 'hazard-security-massnahmen-baulich', category: 'Weitere Sicherheitsbelange', label: 'Erkennbare Sicherheitsmaßnahmen', question: 'Sind bereits bauliche oder technische Sicherheitsmaßnahmen erkennbar vorhanden?' },
        { id: 'hazard-security-massnahmen-personell', category: 'Weitere Sicherheitsbelange', label: 'Erkennbare personelle Sicherheitsmaßnahmen', question: 'Gibt es regelmäßig sichtbare Präsenz von Sicherheitskräften?' },
        
        // Tatbeeinflussende Belange
        { id: 'hazard-tat-anfahrtsoptionen', category: 'Tatbeeinflussende Belange', label: 'Anfahrtsoptionen für potentielle Täter', question: 'Wie gut können Täter den Bereich mit einem Fahrzeug anfahren?' },
        { id: 'hazard-tat-fluchtmoeglichkeiten', category: 'Tatbeeinflussende Belange', label: 'Fluchtmöglichkeiten für potentielle Täter', question: 'Welche Fluchtmöglichkeiten bestünden für Täter nach einer Tat?' },
        { id: 'hazard-tat-auswirkung', category: 'Tatbeeinflussende Belange', label: 'Auswirkung', question: 'Wie gravierend wären die Wirkungen eines Fahrzeugangriffs im Raum?' },
        { id: 'hazard-tat-ziele', category: 'Tatbeeinflussende Belange', label: 'Zusätzliche Tatziele', question: 'Gibt es in unmittelbarer Nähe weitere potenzielle Tatziele?' },
        { id: 'hazard-tat-varianten', category: 'Tatbeeinflussende Belange', label: 'Zusätzliche Tatvarianten', question: 'Sind besondere Tatvarianten denkbar (z. B. alternative Routen, zeitliche Besonderheiten)?' },
    ];
    
    const factors: HazardFactorValue[] = factorConfigs.map(config => {
        const selectEl = document.getElementById(config.id) as HTMLSelectElement | null;
        const raw = selectEl?.value || '';
        const numeric = raw ? parseInt(raw, 10) : NaN;
        return {
            ...config,
            value: Number.isFinite(numeric) ? numeric : null
        };
    });
    
    // Calculate scores
    const ratedFactors = factors.filter(f => f.value !== null);
    const totalScore = ratedFactors.reduce((sum, f) => sum + (f.value || 0), 0);
    const maxPossibleScore = factors.length * 3; // Max score is 3 per factor
    const averageScore = ratedFactors.length > 0 ? totalScore / ratedFactors.length : 0;
    
    return { 
        city, 
        area, 
        expectedDamage, 
        expectedDamageLabel,
        factors,
        totalScore,
        maxPossibleScore,
        averageScore
    };
}

// Export to window for debugging and external access
(window as any).getHazardAnalysisFormData = getHazardAnalysisFormData;

// ===============================================
// FAHRDYNAMISCHE BERECHNUNGEN FÜR RISIKOBEWERTUNG
// ===============================================

/**
 * Fahrzeugklassen mit Masse und Beschleunigung
 */
/**
 * Fahrzeugklassen gemäß DIN ISO 22343-2 (2025) Prüffahrzeugkategorien
 * - klasse: Fahrzeugklassenbezeichnung nach Norm
 * - typ: Typ des Prüffahrzeugs (Beschreibung)
 * - zulGesamtgewicht: Zulässiges Gesamtgewicht in kg (null = n/a)
 * - testMasse: Masse des Prüffahrzeugs in kg
 * - mass: Berechnungsmasse (zulGesamtgewicht oder testMasse wenn n/a)
 * - acceleration: Typische Beschleunigung in m/s²
 */
const VEHICLE_CLASSES = [
    { id: 'M1', klasse: 'M1', typ: 'Pkw', zulGesamtgewicht: null, testMasse: 1500, mass: 1500, acceleration: 3.20, name: 'Pkw (M1)' },
    { id: 'N1G', klasse: 'N1G', typ: 'Doppelkabine / Allrad Pick-up', zulGesamtgewicht: null, testMasse: 2500, mass: 2500, acceleration: 2.50, name: 'Pick-up (N1G)' },
    { id: 'N1', klasse: 'N1', typ: 'Kurzfahrerkabine / Pritsche', zulGesamtgewicht: 3500, testMasse: 3500, mass: 3500, acceleration: 1.90, name: 'Transporter (N1)' },
    { id: 'N2A', klasse: 'N2A', typ: '2-achsiger Frontlenker', zulGesamtgewicht: 8000, testMasse: 7200, mass: 8000, acceleration: 2.00, name: 'Lkw 8t (N2A)' },
    { id: 'N2B', klasse: 'N2B', typ: '2-achsiger Langhauber', zulGesamtgewicht: 14900, testMasse: 6800, mass: 14900, acceleration: 1.50, name: 'Lkw 15t (N2B)' },
    { id: 'N3C', klasse: 'N3C', typ: '2-achsige Frontlenker', zulGesamtgewicht: 20500, testMasse: 7200, mass: 20500, acceleration: 1.25, name: 'Lkw 20t (N3C)' },
    { id: 'N3D', klasse: 'N3D', typ: '2-achsiger Frontlenker', zulGesamtgewicht: 20500, testMasse: 12000, mass: 20500, acceleration: 1.00, name: 'Lkw 20t (N3D)' },
    { id: 'N3E', klasse: 'N3E', typ: '3-achsiger Langhauber', zulGesamtgewicht: 27300, testMasse: 29500, mass: 27300, acceleration: 0.85, name: 'Lkw 27t (N3E)' },
    { id: 'N3F', klasse: 'N3F', typ: '3-achsiger Frontlenker', zulGesamtgewicht: 26000, testMasse: 24000, mass: 26000, acceleration: 0.80, name: 'Lkw 26t (N3F)' },
    { id: 'N3G', klasse: 'N3G', typ: '4-achsiger Frontlenker', zulGesamtgewicht: 36000, testMasse: 30000, mass: 36000, acceleration: 0.75, name: 'Lkw 36t (N3G)' }
];

/**
 * Energiestufen-Schwellwerte in kJ
 */
const ENERGY_THRESHOLDS = {
    E1: { max: 250, label: 'E1 (niedrig)', protection: 'einfache Sperren' },
    E2: { min: 250, max: 800, label: 'E2 (mittel, SK1)', protection: 'SK1-Barrieren' },
    E3: { min: 800, max: 1950, label: 'E3 (hoch, SK2)', protection: 'SK2-Barrieren' },
    E4: { min: 1950, label: 'E4 (sehr hoch)', protection: 'Hochsicherheitsbarrieren' }
};

/**
 * Berechnet die kinetische Energie
 * E = m·a·s = 0.5·m·v²
 * @param mass Masse in kg
 * @param acceleration Beschleunigung in m/s²
 * @param distance Strecke in m
 * @returns Energie in kJ
 */
function calculateEnergy(mass: number, acceleration: number, distance: number): number {
    const energy_j = mass * acceleration * distance;
    return energy_j / 1000; // Umrechnung J → kJ
}

/**
 * Bestimmt die Energiestufe für eine gegebene Energie
 * @param energy_kj Energie in kJ
 * @returns Energiestufen-Objekt
 */
function getEnergyClass(energy_kj: number): { level: string; label: string; protection: string } {
    if (energy_kj < ENERGY_THRESHOLDS.E1.max) {
        return { level: 'E1', label: ENERGY_THRESHOLDS.E1.label, protection: ENERGY_THRESHOLDS.E1.protection };
    } else if (energy_kj < ENERGY_THRESHOLDS.E2.max) {
        return { level: 'E2', label: ENERGY_THRESHOLDS.E2.label, protection: ENERGY_THRESHOLDS.E2.protection };
    } else if (energy_kj < ENERGY_THRESHOLDS.E3.max) {
        return { level: 'E3', label: ENERGY_THRESHOLDS.E3.label, protection: ENERGY_THRESHOLDS.E3.protection };
    } else {
        return { level: 'E4', label: ENERGY_THRESHOLDS.E4.label, protection: ENERGY_THRESHOLDS.E4.protection };
    }
}

/**
 * Bestimmt die Schutzkategorie (A/B/C) basierend auf Energiestufe
 * @param energyLevel Energiestufe (E1-E4)
 * @returns Schutzkategorie
 */
function getProtectionCategory(energyLevel: string): { category: string; description: string; requirement: string } {
    switch (energyLevel) {
        case 'E4':
        case 'E3':
            return { category: 'A', description: 'hochkritisch', requirement: 'SK2-Hochsicherheitsbarrieren' };
        case 'E2':
            return { category: 'B', description: 'mittlerer Schutzbedarf', requirement: 'SK1-Barrieren' };
        case 'E1':
        default:
            return { category: 'C', description: 'energetisch gering', requirement: 'einfache Sperren' };
    }
}

/**
 * Berechnet fahrdynamische Daten für alle Zufahrten und Fahrzeugklassen
 * @returns Strukturierte Tabelle mit allen Berechnungen
 */
function calculateVehicleDynamicsTable(): string {
    const threatsArray = Array.from(threatsMap.entries());
    if (threatsArray.length === 0) {
        return 'Keine Zufahrten für fahrdynamische Analyse verfügbar.';
    }

    const results: string[] = [];
    results.push('FAHRDYNAMISCHE ANALYSE JE ZUFAHRT UND FAHRZEUGKLASSE:');
    results.push('');

    threatsArray.forEach(([streetName, threatData]) => {
        const distance = threatData.totalLength || 50; // Fallback 50m
        results.push('Zufahrt: ' + streetName + ' (Anfahrtsstrecke: ' + Math.round(distance) + ' m)');
        
        let maxEnergy = 0;
        let worstCaseVehicle = '';
        
        VEHICLE_CLASSES.forEach(vehicle => {
            const velocity = calculateVelocity(vehicle.acceleration, distance);
            const energy = calculateEnergy(vehicle.mass, vehicle.acceleration, distance);
            const energyClass = getEnergyClass(energy);
            
            results.push('  - ' + vehicle.name + ': v=' + velocity.toFixed(0) + ' km/h, E=' + energy.toFixed(0) + ' kJ (' + energyClass.label + ')');
            
            if (energy > maxEnergy) {
                maxEnergy = energy;
                worstCaseVehicle = vehicle.name;
            }
        });
        
        const worstCaseClass = getEnergyClass(maxEnergy);
        const protectionCat = getProtectionCategory(worstCaseClass.level);
        results.push('  → Worst Case: ' + worstCaseVehicle + ' mit E_max=' + maxEnergy.toFixed(0) + ' kJ');
        results.push('  → Energiestufe: ' + worstCaseClass.label + ', Schutzkategorie: ' + protectionCat.category + ' (' + protectionCat.description + ')');
        results.push('');
    });

    return results.join('\n');
}

/**
 * Erstellt eine Zusammenfassung der Energieklassifizierung aller Zufahrten
 * @returns Strukturierte Klassifizierung
 */
function getEnergyClassificationSummary(): string {
    const threatsArray = Array.from(threatsMap.entries());
    if (threatsArray.length === 0) {
        return 'Keine Zufahrten für Energieklassifizierung verfügbar.';
    }

    const classifications: { [key: string]: string[] } = {
        'A': [], // hochkritisch (E3/E4)
        'B': [], // mittel (E2)
        'C': []  // gering (E1)
    };

    const worstCaseTable: string[] = [];
    worstCaseTable.push('WORST-CASE-TABELLE (Maximalenergien je Zufahrt):');
    worstCaseTable.push('Zufahrt | Strecke [m] | E_max [kJ] | Energiestufe | Kategorie | Schutzklasse');
    worstCaseTable.push('--------|-------------|------------|--------------|-----------|-------------');

    threatsArray.forEach(([streetName, threatData]) => {
        const distance = threatData.totalLength || 50;
        
        // Berechne Worst Case (höchste Energie über alle Fahrzeugklassen)
        let maxEnergy = 0;
        VEHICLE_CLASSES.forEach(vehicle => {
            const energy = calculateEnergy(vehicle.mass, vehicle.acceleration, distance);
            if (energy > maxEnergy) {
                maxEnergy = energy;
            }
        });
        
        const energyClass = getEnergyClass(maxEnergy);
        const protectionCat = getProtectionCategory(energyClass.level);
        
        classifications[protectionCat.category].push(streetName);
        
        worstCaseTable.push(
            streetName.substring(0, 20).padEnd(20) + ' | ' + Math.round(distance).toString().padStart(5) + ' | ' + maxEnergy.toFixed(0).padStart(10) + ' | ' + energyClass.level.padEnd(12) + ' | ' + protectionCat.category.padEnd(9) + ' | ' + protectionCat.requirement
        );
    });

    const summary: string[] = [];
    summary.push(worstCaseTable.join('\n'));
    summary.push('');
    summary.push('KATEGORISIERUNG NACH SCHUTZBEDARF:');
    summary.push('Kategorie A (hochkritisch, SK2): ' + (classifications['A'].length > 0 ? classifications['A'].join(', ') : 'keine'));
    summary.push('Kategorie B (mittel, SK1): ' + (classifications['B'].length > 0 ? classifications['B'].join(', ') : 'keine'));
    summary.push('Kategorie C (gering, einfache Sperren): ' + (classifications['C'].length > 0 ? classifications['C'].join(', ') : 'keine'));

    return summary.join('\n');
}

// Export für Debugging
(window as any).calculateVehicleDynamicsTable = calculateVehicleDynamicsTable;
(window as any).getEnergyClassificationSummary = getEnergyClassificationSummary;

/**
 * Builds a summary text of the hazard assessment for inclusion in AI prompts
 * @returns A formatted string summarizing the hazard assessment data
 */
function buildHazardAssessmentSummary(): string {
    const data = getHazardAnalysisFormData();
    if (!data) {
        return 'Es wurden keine expliziten Daten zur Gefährdungsanalyse in der Eingabemaske erfasst.';
    }
    
    const parts: string[] = [];
    
    // Location information
    if (data.city || data.area) {
        const raum = [data.city, data.area].filter(Boolean).join(' – ');
        parts.push(`Betrachteter Raum: ${raum}`);
    }
    
    // Expected damage level
    if (data.expectedDamageLabel) {
        parts.push(`Erwartetes Schadensausmaß: ${data.expectedDamageLabel}`);
    }
    
    // Rated factors grouped by category
    const ratedFactors = data.factors.filter(f => f.value !== null);
    if (ratedFactors.length > 0) {
        parts.push('');
        parts.push('Bewertete Belange (Skala: 1 = geringe Ausprägung, 2 = mittlere Ausprägung, 3 = starke Ausprägung):');
        
        // Group factors by category
        const categories = [...new Set(ratedFactors.map(f => f.category))];
        categories.forEach(category => {
            const categoryFactors = ratedFactors.filter(f => f.category === category);
            if (categoryFactors.length > 0) {
                parts.push(`\n${category}:`);
                categoryFactors.forEach(f => {
                    parts.push(`  - ${f.label}: Bewertung ${f.value}`);
                });
            }
        });
        
        // Summary statistics
        parts.push('');
        parts.push(`Gesamtpunktzahl: ${data.totalScore} von maximal ${data.maxPossibleScore} Punkten`);
        parts.push(`Durchschnittliche Bewertung: ${data.averageScore.toFixed(1)}`);
        
        // Risk classification based on average score
        let riskClassification = '';
        if (data.averageScore <= 1.5) {
            riskClassification = 'NIEDRIG';
        } else if (data.averageScore <= 2.0) {
            riskClassification = 'MITTEL';
        } else if (data.averageScore <= 2.5) {
            riskClassification = 'ERHÖHT';
        } else {
            riskClassification = 'HOCH';
        }
        parts.push(`Gefährdungseinstufung basierend auf Bewertungsmatrix: ${riskClassification}`);
    } else {
        parts.push('Keine Bewertungsfaktoren wurden ausgefüllt.');
    }
    
    return parts.join('\n');
}

// Export to window for debugging
(window as any).buildHazardAssessmentSummary = buildHazardAssessmentSummary;

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
    const reportGeneratedAt = new Date();
    
    // Array to store table screenshots for Word document (shared between PDF and Word generation)
    let appendixTableImages: { title: string, imageBase64: string, width: number, height: number, worstCaseText: string }[] = [];

    try {
        if (drawnPolygon) {
            console.log(`Generating report for language: ${currentLanguage}`);
            console.log('Drawn polygon data:', drawnPolygon);
            
            // Validate polygon data before proceeding
            if (!drawnPolygon.getLatLngs || typeof drawnPolygon.getLatLngs !== 'function') {
                console.error('Invalid polygon object - missing getLatLngs method');
                throw new Error('Invalid polygon data for map capture');
            }
            
            const polygonCoords = drawnPolygon.getLatLngs();
            if (!polygonCoords || polygonCoords.length === 0) {
                console.error('Polygon has no coordinates');
                throw new Error('Polygon has no valid coordinates');
            }
            
            console.log(`Polygon coordinates: ${polygonCoords.length} points`);

            // Temporarily switch views to make the map visible for capture
            reportPreviewArea.classList.add('view-hidden');
            mapDiv.classList.remove('view-hidden');

            // Enhanced map rendering wait with language-specific optimizations
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Map rendering timeout'));
                }, 10000); // 10 second timeout

                const resolveFn = () => {
                    clearTimeout(timeout);
                    // Language-specific delay for better rendering
                    const languageDelay = currentLanguage === 'de' ? 1000 : 500;
                    requestAnimationFrame(() => setTimeout(resolve, languageDelay));
                };
                
                let moveEndTimeoutId: number;

                // Force map refresh and wait for complete rendering
                map.invalidateSize();
                
                // Wait for map movement to end (provider system handles tile loading)
                map.once('moveend', () => {
                    console.log('Map movement ended');
                    moveEndTimeoutId = window.setTimeout(resolveFn, 1500);
                });
                
                // Additional fallback timeout
                setTimeout(() => {
                    console.log('Tile loading timeout reached, proceeding...');
                    resolveFn();
                }, 3000);
                
                // Ensure polygon is visible and fit bounds
                try {
                    const bounds = drawnPolygon.getBounds();
                    if (bounds && bounds.isValid()) {
                        console.log('Fitting map to polygon bounds');
                        map.fitBounds(bounds, { animate: false, padding: [20, 20] });
                    } else {
                        console.warn('Invalid bounds, using default view');
                        map.setView(map.getCenter(), map.getZoom());
                    }
                } catch (error) {
                    console.error('Error fitting bounds:', error);
                    // Continue with current map view
                }
            });
            
            // Additional wait for map stability
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('Capturing map screenshot...');
            
            // Enhanced html2canvas configuration for better reliability
            canvas = await html2canvas(mapDiv, {
                useCORS: true,
                logging: true, // Enable logging for debugging
                allowTaint: true,
                backgroundColor: '#ffffff',
                scale: 1.2, // Reduced from 2 - better PDF size
                width: mapDiv.offsetWidth,
                height: mapDiv.offsetHeight,
                onclone: (doc: Document) => {
                    console.log('Cloning document for screenshot');
                    
                    // Ensure popups are not visible in the screenshot
                    doc.querySelectorAll('.leaflet-popup-pane > *').forEach((p: Element) => {
                        (p as HTMLElement).style.display = 'none';
                    });
                    
                    // Ensure all map elements are visible
                    const clonedMap = doc.getElementById('map');
                    if (clonedMap) {
                        (clonedMap as HTMLElement).style.visibility = 'visible';
                        (clonedMap as HTMLElement).style.opacity = '1';
                        (clonedMap as HTMLElement).style.display = 'block';
                    }
                    
                    // Force Leaflet to update in cloned document
                    const clonedMapContainer = doc.querySelector('.leaflet-container');
                    if (clonedMapContainer) {
                        (clonedMapContainer as HTMLElement).style.visibility = 'visible';
                        (clonedMapContainer as HTMLElement).style.opacity = '1';
                    }
                }
            });
            
            console.log('Map screenshot captured successfully');
        } else {
            console.log('No polygon drawn, skipping map capture');
        }

        // Validate canvas before proceeding
        if (canvas && canvas.width > 0 && canvas.height > 0) {
            console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}`);
        } else {
            console.warn('Invalid canvas generated, continuing without map image');
            canvas = null;
        }

        const locationName = drawnPolygon ? await getReportLocationName(drawnPolygon.getBounds().getCenter()) : t('report.undefinedLocation');
        
        // Get asset to protect from chatbot planning state or fallback
        const planningState = (window as any).planningState || {};
        const assetToProtect = planningState.schutzgüter || planningState.schutzgueter || t('report.undefinedAsset');
        
        // Get current data provider for report attribution
        let dataSource = 'OpenStreetMap'; // Default fallback
        try {
            const { getCurrentProviderId } = await import('./src/core/geodata/integration/mapIntegration.js');
            const currentProvider = getCurrentProviderId();
            dataSource = currentProvider === 'nrw' ? 'GEOBASIS.NRW' : 'OpenStreetMap';
            console.log(`📄 Report using data source: ${dataSource}`);
        } catch (error) {
            console.warn('⚠️ Could not get provider info for report, using default:', error);
            console.log(`📄 Report using data source: ${dataSource}`);
        }
        const localizedReportDate = reportGeneratedAt.toLocaleDateString(currentLanguage === 'de' ? 'de-DE' : 'en-US');
        
        // Generate threat list in descriptive text form for AI context
        let threatList = t('report.noThreatAnalysis');
        if (threatsMap.size > 0) {
            const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
            const selectedWeight = vehicleSelect.value;
            const accelerationRange = getAccelerationRange(selectedWeight);
            
            const threatsArray = Array.from(threatsMap.entries()).map(([name, data]) => {
                const lengthInMeters = Math.round(data.totalLength);
                let maxSpeed = 0;
                
                if (accelerationRange && lengthInMeters > 0) {
                    const [, maxAcc] = accelerationRange;
                    maxSpeed = Math.round(calculateVelocityWithOsm(maxAcc, lengthInMeters));
                }
                
                return { name, lengthInMeters, maxSpeed };
            });
            
            threatsArray.sort((a: any, b: any) => b.maxSpeed - a.maxSpeed);
            
            threatList = threatsArray.map(threat => {
                const speedPart = threat.maxSpeed > 0 ? ` | ${t('threats.speed')}: ${threat.maxSpeed} km/h` : '';
                return `- ${threat.name}: ${threat.lengthInMeters} m${speedPart}`;
            }).join('\n');
        }

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
        const pdf = new jsPDF({ 
            orientation: 'p', 
            unit: 'mm', 
            format: 'a4',
            compress: true  // Enable PDF compression for smaller file size
        });

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

        // Deutsche Silbentrennung für lange Wörter
        const hyphenateGerman = (text: string, maxWordLength: number = 18): string => {
            // Häufige deutsche Silbentrennungsmuster
            const hyphenPatterns = [
                // Präfixe
                { pattern: /^(un|ab|an|auf|aus|be|bei|durch|ein|ent|er|ge|her|hin|hinter|mit|nach|über|um|unter|ver|vor|weg|zer|zu)/i, pos: 'prefix' },
                // Suffixe
                { pattern: /(ung|heit|keit|schaft|lich|isch|bar|sam|los|voll|reich|arm|haft|mäßig|artig)$/i, pos: 'suffix' },
                // Doppelkonsonanten
                { pattern: /([aeiouäöü])([bcdfghjklmnpqrstvwxyz])\2([aeiouäöü])/gi, split: '$1$2-$2$3' },
                // Konsonant + l, n, r
                { pattern: /([aeiouäöü])([bcdfgkpt])([lnr])([aeiouäöü])/gi, split: '$1$2-$3$4' },
            ];
            
            return text.split(' ').map(word => {
                // Nur lange Wörter ohne Bindestrich trennen
                if (word.length <= maxWordLength || word.includes('-') || word.includes('­')) {
                    return word;
                }
                
                let result = word;
                // Versuche Präfix abzutrennen
                const prefixMatch = result.match(/^(un|ab|an|auf|aus|be|bei|durch|ein|ent|er|ge|her|hin|mit|nach|über|um|unter|ver|vor|weg|zer|zu)(.{4,})/i);
                if (prefixMatch) {
                    result = prefixMatch[1] + '­' + prefixMatch[2]; // Soft hyphen
                }
                
                // Versuche Suffix abzutrennen
                const suffixMatch = result.match(/(.{4,})(ung|heit|keit|schaft|lich|isch|bar|sam|los|voll|reich|mäßig|artig)$/i);
                if (suffixMatch) {
                    result = suffixMatch[1] + '­' + suffixMatch[2];
                }
                
                return result;
            }).join(' ');
        };

        const addSection = (titleKey: string, content: string) => {
            // Intelligenter Seitenumbruch: Wenn Titel + min. 3 Zeilen nicht mehr auf Seite passen
            const minLinesWithTitle = 7 + (3 * 5); // Titel + 3 Zeilen Text
            if (currentY + minLinesWithTitle > 270) {
                pdf.addPage();
                addWatermarkToCurrentPage();
                currentY = 25;
            }
            
            // Abschnittstitel
            pdf.setFont('helvetica', 'bold').setFontSize(14);
            pdf.setTextColor(46, 90, 136); // Blau für Überschriften
            pdf.text(t(titleKey), page_margin, currentY);
            pdf.setTextColor(0, 0, 0);
            currentY += 8;
            
            // Sanitize content and apply hyphenation
            const sanitizedContent = sanitizeDe(content, false);
            const hyphenatedContent = hyphenateGerman(sanitizedContent);
            
            // Absätze erkennen: Doppelte Zeilenumbrüche ODER Satz endet mit Punkt + Leerzeichen + Großbuchstabe
            // Teile Text in logische Absätze auf
            let paragraphs = hyphenatedContent
                .split(/\n\n+/) // Doppelte Zeilenumbrüche
                .flatMap(p => {
                    // Weitere Aufteilung bei "." gefolgt von Großbuchstabe (neuer Satz = neuer Absatz)
                    // Aber nur wenn der Satz mindestens 80 Zeichen hat (sinnvolle Absatzlänge)
                    const sentences: string[] = [];
                    let current = '';
                    const parts = p.split(/(?<=\.) (?=[A-ZÄÖÜ])/);
                    parts.forEach((part, idx) => {
                        current += (current ? ' ' : '') + part;
                        // Absatz beenden wenn: Ende erreicht ODER aktueller Block > 200 Zeichen
                        if (idx === parts.length - 1 || current.length > 200) {
                            sentences.push(current.trim());
                            current = '';
                        }
                    });
                    if (current.trim()) sentences.push(current.trim());
                    return sentences;
                })
                .filter(p => p.trim().length > 0);
            
            const lineHeight = 4.8;
            const paragraphSpacing = 4; // Abstand zwischen Absätzen
            
            paragraphs.forEach((paragraph, pIdx) => {
                const textLines = pdf.setFont('helvetica', 'normal').setFontSize(10.5).splitTextToSize(paragraph, content_width);
                
                textLines.forEach((line: string, idx: number) => {
                    // Prüfe Seitenumbruch vor jeder Zeile
                    if (currentY + lineHeight > 280) {
                        pdf.addPage();
                        addWatermarkToCurrentPage();
                        currentY = 25;
                    }
                    
                    // Blocksatz nur für volle Zeilen (nicht letzte Zeile eines Absatzes)
                    const isLastLineOfParagraph = idx === textLines.length - 1;
                    
                    if (!isLastLineOfParagraph && line.trim().length > 0) {
                        // Blocksatz durch Wort-Spacing
                        const words = line.split(' ').filter((w: string) => w.length > 0);
                        if (words.length > 1) {
                            const textWidth = pdf.getTextWidth(words.join(' '));
                            const extraSpace = (content_width - textWidth) / (words.length - 1);
                            let xPos = page_margin;
                            words.forEach((word: string, wordIdx: number) => {
                                pdf.text(word, xPos, currentY);
                                xPos += pdf.getTextWidth(word) + (wordIdx < words.length - 1 ? extraSpace + pdf.getTextWidth(' ') : 0);
                            });
                        } else {
                            pdf.text(line, page_margin, currentY);
                        }
                    } else {
                        // Normale Zeile (letzte Zeile des Absatzes)
                        pdf.text(line, page_margin, currentY);
                    }
                    currentY += lineHeight;
                });
                
                // Abstand nach jedem Absatz (außer dem letzten)
                if (pIdx < paragraphs.length - 1) {
                    currentY += paragraphSpacing;
                }
            });
            
            currentY += 12; // Größerer Abstand nach Kapitel für bessere Lesbarkeit
        };

        addWatermarkToCurrentPage();
        
        // ==================== TITELBLATT ====================
        const hazardData = (typeof getHazardAnalysisFormData === 'function') ? getHazardAnalysisFormData() : null;
        const eventName = hazardData?.area || assetToProtect;
        // Extract city name, removing leading postal codes, house numbers, or other numeric prefixes
        let cityName = hazardData?.city || locationName.split(',')[0].trim();
        cityName = cityName.replace(/^\d+[\s,]*/, '').trim(); // Remove leading numbers
        if (!cityName || cityName.length < 2) {
            // Fallback to second part of locationName if first part was just a number
            const parts = locationName.split(',');
            cityName = parts[1]?.trim() || 'Standort';
        }
        
        // Titel zentriert
        pdf.setFont('helvetica', 'bold').setFontSize(14);
        pdf.text(cityName, page_width / 2, currentY, { align: 'center' });
        currentY += 20;
        
        // Haupttitel
        pdf.setFont('helvetica', 'bold').setFontSize(20);
        const mainTitle = currentLanguage === 'de' 
            ? `Risikobewertung Zufahrtsschutz` 
            : `Risk Assessment Access Protection`;
        pdf.text(mainTitle, page_width / 2, currentY, { align: 'center' });
        currentY += 10;
        
        // Untertitel mit Veranstaltung
        pdf.setFont('helvetica', 'bold').setFontSize(16);
        const subTitle = `${eventName} ${new Date().getFullYear()}`;
        pdf.text(subTitle, page_width / 2, currentY, { align: 'center' });
        currentY += 15;
        
        // Untertitel 2
        pdf.setFont('helvetica', 'italic').setFontSize(11);
        const subTitle2 = currentLanguage === 'de'
            ? 'Risikobewertung zur fahrdynamischen Analyse, Schutzzieldefinition und Planung von Fahrzeugsicherheitsbarrieren'
            : 'Risk Assessment for Vehicle Dynamics Analysis, Protection Goal Definition and Planning of Vehicle Security Barriers';
        const subTitle2Lines = pdf.splitTextToSize(subTitle2, content_width - 20);
        subTitle2Lines.forEach((line: string) => {
            pdf.text(line, page_width / 2, currentY, { align: 'center' });
            currentY += 6;
        });
        currentY += 20;
        
        // Horizontale Linie
        pdf.setDrawColor(30, 144, 255).setLineWidth(1).line(page_margin + 20, currentY, page_width - page_margin - 20, currentY);
        currentY += 25;
        
        // Metadaten-Block
        pdf.setFont('helvetica', 'normal').setFontSize(10);
        // Format date with leading zeros (DD.MM.YYYY)
        const formattedDate = `${String(reportGeneratedAt.getDate()).padStart(2, '0')}.${String(reportGeneratedAt.getMonth() + 1).padStart(2, '0')}.${reportGeneratedAt.getFullYear()}`;
        // Auftraggeber from hazard analysis (city name) or extract from locationName
        const auftraggeberName = hazardData?.city || locationName.split(',')[0].trim().replace(/^\d{5}\s+/, '') || 'Kommune';
        const metaData = currentLanguage === 'de' ? [
            `Erstellt durch: BarricadiX GmbH`,
            `Bearbeiter: Automatisierte Analyse`,
            `Auftraggeber: Stadt ${auftraggeberName}`,
            `Aktenzeichen: BX-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
            `Datum: ${formattedDate}`,
            `Version: 1.0 (Entwurf)`
        ] : [
            `Created by: BarricadiX GmbH`,
            `Analyst: Automated Analysis`,
            `Client: City of ${auftraggeberName}`,
            `Reference: BX-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
            `Date: ${formattedDate}`,
            `Version: 1.0 (Draft)`
        ];
        
        metaData.forEach(line => {
            pdf.text(line, page_width / 2, currentY, { align: 'center' });
            currentY += 6;
        });
        currentY += 30;
        
        // Hinweis am unteren Rand
        pdf.setFont('helvetica', 'italic').setFontSize(9);
        const disclaimer = currentLanguage === 'de'
            ? 'Diese Risikobewertung ersetzt keine hoheitliche Gefährdungsbewertung der zuständigen Sicherheitsbehörden.'
            : 'This risk assessment does not replace a sovereign threat assessment by the competent security authorities.';
        const disclaimerLines = pdf.splitTextToSize(disclaimer, content_width - 40);
        disclaimerLines.forEach((line: string) => {
            pdf.text(line, page_width / 2, currentY, { align: 'center' });
            currentY += 5;
        });
        
        // ==================== KURZFASSUNG (neue Seite) ====================
        pdf.addPage();
        addWatermarkToCurrentPage();
        currentY = 25;
        
        pdf.setFont('helvetica', 'bold').setFontSize(14);
        const summaryTitle = currentLanguage === 'de' ? 'Kurzfassung für Entscheidungsträger' : 'Executive Summary';
        pdf.text(summaryTitle, page_margin, currentY);
        currentY += 10;
        
        pdf.setDrawColor(30, 144, 255).setLineWidth(0.5).line(page_margin, currentY, page_width - page_margin, currentY);
        currentY += 10;
        
        // Kurzfassung-Inhalt generieren
        const threatsArray = Array.from(threatsMap.entries());
        const avgThreatLevel = threatsArray.length > 0 
            ? threatsArray.reduce((sum, [, data]) => sum + (data.threatLevel || 5), 0) / threatsArray.length 
            : 5;
        
        // Kategorisierung der Zufahrten
        let catA = 0, catB = 0, catC = 0;
        threatsArray.forEach(([, data]) => {
            const distance = data.totalLength || 50;
            // Worst-Case mit 30t-Lkw
            const energy = 30000 * 0.75 * distance / 1000; // kJ
            if (energy >= 800) catA++;
            else if (energy >= 250) catB++;
            else catC++;
        });
        
        pdf.setFont('helvetica', 'normal').setFontSize(10);
        const summaryText = currentLanguage === 'de' ? [
            `Gegenstand: Risikobewertung Zufahrtsschutz für ${eventName} in ${cityName}`,
            ``,
            `Ergebnis der Analyse:`,
            `• ${threatsArray.length} Zufahrten wurden identifiziert und fahrdynamisch bewertet`,
            `• Durchschnittliches Bedrohungsniveau: ${avgThreatLevel.toFixed(1)}/10`,
            `• Abgeleiteter Sicherungsgrad: ${context.protectionGrade}`,
            ``,
            `Kategorisierung nach Schutzbedarf:`,
            `• Kategorie A (hochkritisch, SK2 erforderlich): ${catA} Zufahrten`,
            `• Kategorie B (mittel, SK1 ausreichend): ${catB} Zufahrten`,
            `• Kategorie C (gering, einfache Sperren): ${catC} Zufahrten`,
            ``,
            `Empfehlung:`,
            `Mit der Umsetzung der empfohlenen SK1-/SK2-Maßnahmen und eines abgestimmten`,
            `Betriebskonzepts kann das Risiko auf ein ALARP-konformes Niveau reduziert werden.`,
            `Die Detailplanung und Produktauswahl sollte in Abstimmung mit den zuständigen`,
            `Sicherheitsbehörden erfolgen.`
        ] : [
            `Subject: Risk Assessment Access Protection for ${eventName} in ${cityName}`,
            ``,
            `Analysis Results:`,
            `• ${threatsArray.length} access routes were identified and assessed for vehicle dynamics`,
            `• Average threat level: ${avgThreatLevel.toFixed(1)}/10`,
            `• Derived protection grade: ${context.protectionGrade}`,
            ``,
            `Categorization by Protection Requirement:`,
            `• Category A (highly critical, SK2 required): ${catA} access routes`,
            `• Category B (medium, SK1 sufficient): ${catB} access routes`,
            `• Category C (low, simple barriers): ${catC} access routes`,
            ``,
            `Recommendation:`,
            `With the implementation of the recommended SK1/SK2 measures and a coordinated`,
            `operational concept, the risk can be reduced to an ALARP-compliant level.`,
            `Detailed planning and product selection should be coordinated with the`,
            `competent security authorities.`
        ];
        
        summaryText.forEach(line => {
            if (currentY > 270) {
                pdf.addPage();
                addWatermarkToCurrentPage();
                currentY = 25;
            }
            pdf.text(line, page_margin, currentY);
            currentY += 6;
        });
        
        // Ampel-Grafik
        currentY += 10;
        pdf.setFont('helvetica', 'bold').setFontSize(10);
        const ampelTitle = currentLanguage === 'de' ? 'Risiko-Ampel:' : 'Risk Traffic Light:';
        pdf.text(ampelTitle, page_margin, currentY);
        currentY += 8;
        
        // Ampel-Boxen
        const boxWidth = 50;
        const boxHeight = 15;
        const boxSpacing = 10;
        let boxX = page_margin;
        
        // Rot (Kategorie A)
        pdf.setFillColor(220, 53, 69);
        pdf.rect(boxX, currentY, boxWidth, boxHeight, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold').setFontSize(9);
        pdf.text(`A: ${catA}`, boxX + boxWidth/2, currentY + boxHeight/2 + 3, { align: 'center' });
        boxX += boxWidth + boxSpacing;
        
        // Gelb (Kategorie B)
        pdf.setFillColor(255, 193, 7);
        pdf.rect(boxX, currentY, boxWidth, boxHeight, 'F');
        pdf.setTextColor(0, 0, 0);
        pdf.text(`B: ${catB}`, boxX + boxWidth/2, currentY + boxHeight/2 + 3, { align: 'center' });
        boxX += boxWidth + boxSpacing;
        
        // Grün (Kategorie C)
        pdf.setFillColor(40, 167, 69);
        pdf.rect(boxX, currentY, boxWidth, boxHeight, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.text(`C: ${catC}`, boxX + boxWidth/2, currentY + boxHeight/2 + 3, { align: 'center' });
        
        pdf.setTextColor(0, 0, 0);
        currentY += boxHeight + 20;
        
        // ==================== HAUPTTEIL (neue Seite) ====================
        pdf.addPage();
        addWatermarkToCurrentPage();
        currentY = 25;

        // --- 11 Kapitel Berichtsstruktur ---
        
        // Kapitel 1: Auftrag, Zielsetzung und Geltungsbereich
        const chapter1Content = aiSections.chapter1_auftrag || aiSections.purpose || '';
        if (chapter1Content) {
            addSection('report.sections.chapter1.title', chapter1Content);
        }
        
        // Kapitel 2: Normative Grundlagen und Referenzen
        const chapter2Content = aiSections.chapter2_normen || '';
        if (chapter2Content) {
            addSection('report.sections.chapter2.title', chapter2Content);
        }
        
        // Kapitel 3: Beschreibung des Veranstaltungsbereichs
        const chapter3Content = aiSections.chapter3_bereich || '';
        if (chapter3Content) {
            addSection('report.sections.chapter3.title', chapter3Content);
        }
        
        // Kapitel 4: Bedrohungsanalyse und Täterverhalten
        const chapter4Content = aiSections.chapter4_bedrohung || aiSections.threatAnalysis || '';
        if (chapter4Content) {
            addSection('report.sections.chapter4.title', chapter4Content);
        }
        
        // Threat List nach Kapitel 4
        if (threatsMap.size > 0) {
            currentY -= 5;
            const threatIntro = sanitizeDe(t('report.threatListIntro'), false);
            const introLines = pdf.setFont('helvetica', 'italic').setFontSize(10).splitTextToSize(threatIntro, content_width);
            const introHeight = introLines.length * 5;
            if (currentY + introHeight > 280) {
                pdf.addPage();
                addWatermarkToCurrentPage();
                currentY = 25;
            }
            pdf.text(introLines, page_margin, currentY);
            currentY += introHeight + 4;
            pdf.setFont('helvetica', 'normal').setFontSize(11);
            const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
            const selectedWeight = vehicleSelect.value;
            const accelerationRange = getAccelerationRange(selectedWeight);
            const entryLineHeight = 5.2;
            const entrySpacing = 4;
            threatsMap.forEach((data, name) => {
                let reportLine = `• ${name} (${Math.round(data.totalLength)} m)`;
                if (accelerationRange && data.totalLength > 0) {
                    const [minAcc, maxAcc] = accelerationRange;
                    const minSpeed = Math.round(calculateVelocityWithOsm(minAcc, data.totalLength));
                    const maxSpeed = Math.round(calculateVelocityWithOsm(maxAcc, data.totalLength));
                    reportLine += ` | ${t('threats.speed')}: ${minSpeed}-${maxSpeed} km/h`;
                }
                const sanitizedReportLine = sanitizeDe(reportLine, false);
                const splitLines = pdf.splitTextToSize(sanitizedReportLine, content_width - 10);
                const blockHeight = splitLines.length * entryLineHeight;
                if (currentY + blockHeight > 280) {
                    pdf.addPage();
                    addWatermarkToCurrentPage();
                    currentY = 25;
                }
                pdf.text(splitLines, page_margin + 5, currentY);
                currentY += blockHeight + entrySpacing;
            });
            currentY += 6;
        }
        
        // Kapitel 5: Methodik der BarricadiX-Analyse
        const chapter5Content = aiSections.chapter5_methodik || '';
        if (chapter5Content) {
            addSection('report.sections.chapter5.title', chapter5Content);
        }
        
        // Kapitel 6: Fahrdynamische Analyse und Maximalenergien
        const chapter6Content = aiSections.chapter6_fahrdynamik || '';
        if (chapter6Content) {
            addSection('report.sections.chapter6.title', chapter6Content);
        }
        
        // Kapitel 7: Risikoanalyse nach dem ALARP-Prinzip
        const chapter7Content = aiSections.chapter7_risiko || aiSections.vulnerabilities || '';
        if (chapter7Content) {
            addSection('report.sections.chapter7.title', chapter7Content);
        }
        
        // Kapitel 8: Schutzzieldefinition
        const chapter8Content = aiSections.chapter8_schutzziel || '';
        if (chapter8Content) {
            addSection('report.sections.chapter8.title', chapter8Content);
        }
        
        // Kapitel 9: Schutzkonzept und produktoffene Empfehlungen
        const chapter9Content = aiSections.chapter9_konzept || aiSections.hvmMeasures || '';
        if (chapter9Content) {
            addSection('report.sections.chapter9.title', chapter9Content);
        }
        
        // Map Image nach Kapitel 9
        if (canvas) {
            const imgRatio = canvas.height / canvas.width;
            // Reduce image width slightly for smaller file size
            const imgWidth = Math.min(content_width, 140);
            const imgHeight = imgWidth * imgRatio;
            if (currentY + imgHeight > 280) {
                pdf.addPage(); addWatermarkToCurrentPage(); currentY = 25;
            }
            // Convert canvas to JPEG with 0.7 quality for ~80% size reduction
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            pdf.addImage(jpegDataUrl, 'JPEG', page_margin + (content_width - imgWidth) / 2, currentY, imgWidth, imgHeight);
            currentY += imgHeight + 10;
        } else {
             const placeholderText = t('report.noMapAvailable');
             const textLines = pdf.setFont('helvetica', 'italic').setFontSize(10).splitTextToSize(placeholderText, content_width);
             if (currentY + (textLines.length * 5) > 280) {
                 pdf.addPage();
                 addWatermarkToCurrentPage();
                 currentY = 25;
             }
             pdf.text(textLines, page_margin, currentY);
             currentY += (textLines.length * 5) + 10;
        }
        
        // Kapitel 10: Restgefahren und Grenzen
        const chapter10Content = aiSections.chapter10_restgefahren || aiSections.siteConsiderations || '';
        if (chapter10Content) {
            addSection('report.sections.chapter10.title', chapter10Content);
        }
        
        // Kapitel 11: Schlussfolgerungen und Empfehlung
        const chapter11Content = aiSections.chapter11_empfehlung || aiSections.operationalImpact || '';
        if (chapter11Content) {
            addSection('report.sections.chapter11.title', chapter11Content);
        }
        
        // ==================== ANHANG A: Fahrdynamische Detailtabellen ====================
        if (threatsMap.size > 0) {
            pdf.addPage();
            addWatermarkToCurrentPage();
            currentY = 25;
            
            // Anhang-Titel
            pdf.setFont('helvetica', 'bold').setFontSize(14);
            const anhangTitle = currentLanguage === 'de' 
                ? 'Anhang A: Fahrdynamische Detailtabellen' 
                : 'Appendix A: Vehicle Dynamics Detail Tables';
            pdf.text(anhangTitle, page_margin, currentY);
            currentY += 8;
            pdf.setDrawColor(30, 144, 255).setLineWidth(0.5).line(page_margin, currentY, page_width - page_margin, currentY);
            currentY += 10;
            
            // Mathematical formulas introduction with proper typesetting
            pdf.setFont('helvetica', 'normal').setFontSize(10);
            const formulaIntro = currentLanguage === 'de' ? 'Berechnungsgrundlagen:' : 'Calculation Basis:';
            pdf.text(formulaIntro, page_margin, currentY);
            currentY += 6;
            
            // Mathematical formulas with ASCII-safe characters
            pdf.setFont('courier', 'normal').setFontSize(10);
            pdf.text('v = sqrt(2 * a * s)   [km/h]', page_margin + 10, currentY);
            currentY += 5;
            pdf.text('E = 0.5 * m * v^2     [kJ]', page_margin + 10, currentY);
            currentY += 5;
            pdf.setFont('helvetica', 'normal').setFontSize(9);
            const whereText = currentLanguage === 'de' 
                ? 'wobei: m = Masse [kg], a = Beschleunigung [m/s^2], s = Anfahrtsstrecke [m]'
                : 'where: m = mass [kg], a = acceleration [m/s^2], s = approach distance [m]';
            pdf.text(whereText, page_margin + 10, currentY);
            currentY += 12;
            
            // Reset array to store table screenshots for Word document
            appendixTableImages = [];
            
            // Helper function to create HTML table screenshot (matching PDF autoTable EXACTLY)
            const createTableScreenshot = async (
                streetName: string, 
                distance: number, 
                tableBody: string[][], 
                maxEnergy: number, 
                maxImpuls: number,
                idx: number,
                worstCaseVehicle: string
            ): Promise<{ title: string, imageBase64: string, width: number, height: number, worstCaseText: string } | null> => {
                try {
                    // Create temporary container - NO TITLE (title will be added as text in Word)
                    const container = document.createElement('div');
                    container.style.cssText = 'position: absolute; left: -9999px; top: -9999px; background: white; padding: 5px; width: 1100px;';
                    document.body.appendChild(container);
                    
                    // Create table (EXACTLY matching PDF autoTable structure)
                    const table = document.createElement('table');
                    table.style.cssText = 'border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 9px; width: 100%; background: white;';
                    
                    // Header row 1 - EXACTLY matching PDF autoTable headers
                    const thead1 = document.createElement('tr');
                    const headers1 = [
                        { text: 'Fahrzeugklasse<br>nach DIN ISO 22343-2 (2025)', colspan: 2 },
                        { text: 'zulässiges<br>Gesamtgewicht', colspan: 1 },
                        { text: 'Test-<br>Masse', colspan: 1 },
                        { text: 'Beschleuni-<br>gung a', colspan: 1 },
                        { text: 'V vor Kurve', colspan: 2 },
                        { text: 'Kurven-<br>radius', colspan: 1 },
                        { text: 'V nach Kurve', colspan: 2 },
                        { text: 'Strecke<br>nach Kurve', colspan: 1 },
                        { text: 'V_end an Zufahrt', colspan: 2 },
                        { text: 'Anprallenergie', colspan: 2 },
                        { text: 'Energie-<br>stufe', colspan: 1 }
                    ];
                    headers1.forEach(h => {
                        const th = document.createElement('th');
                        // WHITE borders (#ffffff) between blue header cells for visibility (like PDF)
                        th.style.cssText = 'background: #2E5A88; color: #ffffff; padding: 5px 3px; border: 1px solid #ffffff; text-align: center; font-size: 7.5px; font-weight: bold; vertical-align: middle; line-height: 1.3;';
                        th.colSpan = h.colspan;
                        th.innerHTML = h.text;
                        thead1.appendChild(th);
                    });
                    table.appendChild(thead1);
                    
                    // Header row 2 (units) - EXACTLY matching PDF autoTable
                    const thead2 = document.createElement('tr');
                    const units = ['Klasse', 'Fahrzeugtyp', 'kg', 'kg', '[m/s²]', 'km/h', 'm/s', 'm', 'km/h', 'm/s', 'm', 'km/h', 'm/s', 'E_kin<br>[kJ]', 'Impuls<br>[kgm/s]', ''];
                    units.forEach(u => {
                        const th = document.createElement('th');
                        // WHITE borders (#ffffff) between blue header cells for visibility (like PDF)
                        th.style.cssText = 'background: #2E5A88; color: #ffffff; padding: 4px 2px; border: 1px solid #ffffff; text-align: center; font-size: 7px; font-weight: bold;';
                        th.innerHTML = u;
                        thead2.appendChild(th);
                    });
                    table.appendChild(thead2);
                    
                    // Data rows with color coding - BLACK TEXT (#000000) for readability
                    tableBody.forEach((row, rowIdx) => {
                        const tr = document.createElement('tr');
                        // Alternating row colors like PDF
                        tr.style.cssText = 'background: #ffffff;';
                        
                        row.forEach((cell, colIdx) => {
                            const td = document.createElement('td');
                            // CRITICAL: BLACK text (#000000) for readability on white/colored backgrounds
                            td.style.cssText = 'padding: 3px 2px; border: 1px solid #cccccc; text-align: center; font-size: 8px; color: #000000 !important; -webkit-text-fill-color: #000000;';
                            
                            // E_kin column (13) - EXACT PDF color: #FFD966 (gelb-orange)
                            if (colIdx === 13) {
                                const ekinVal = parseFloat(cell.replace(/\./g, '').replace(',', '.')) || 0;
                                const ratio = Math.min(ekinVal / maxEnergy, 1);
                                const barWidth = Math.round(ratio * 100);
                                td.style.background = `linear-gradient(to right, #FFD966 ${barWidth}%, #ffffff ${barWidth}%)`;
                                td.style.color = '#000000';
                            }
                            // Impuls column (14) - EXACT PDF color: #9BC2E6 (hellblau)
                            else if (colIdx === 14) {
                                const impulsVal = parseFloat(cell.replace(/\./g, '').replace(',', '.')) || 0;
                                const ratio = Math.min(impulsVal / maxImpuls, 1);
                                const barWidth = Math.round(ratio * 100);
                                td.style.background = `linear-gradient(to right, #9BC2E6 ${barWidth}%, #ffffff ${barWidth}%)`;
                                td.style.color = '#000000';
                            }
                            
                            // Left align for text columns (like PDF)
                            if (colIdx === 1) {
                                td.style.textAlign = 'left';
                                td.style.paddingLeft = '4px';
                            }
                            // Center align for Klasse column
                            if (colIdx === 0) {
                                td.style.textAlign = 'center';
                            }
                            // Right align for numeric columns (like PDF columnStyles)
                            if (colIdx >= 2 && colIdx <= 14) {
                                td.style.textAlign = 'right';
                                td.style.paddingRight = '3px';
                            }
                            // Center align for Energiestufe
                            if (colIdx === 15) {
                                td.style.textAlign = 'center';
                            }
                            
                            td.textContent = cell;
                            tr.appendChild(td);
                        });
                        table.appendChild(tr);
                    });
                    
                    container.appendChild(table);
                    
                    // Determine worst case energy level
                    let worstCaseLevel = 'E1';
                    if (maxEnergy >= 1950) worstCaseLevel = 'E4';
                    else if (maxEnergy >= 800) worstCaseLevel = 'E3';
                    else if (maxEnergy >= 250) worstCaseLevel = 'E2';
                    
                    const worstCaseText = `! Worst Case: ${worstCaseVehicle}, E_max = ${maxEnergy.toFixed(0)} kJ (${worstCaseLevel})`;
                    
                    // Wait for render
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Take screenshot
                    const canvas = await html2canvas(container, {
                        backgroundColor: '#ffffff',
                        scale: 2,
                        logging: false
                    });
                    
                    const imageBase64 = canvas.toDataURL('image/png');
                    const result = {
                        title: `A.${idx + 1} Zufahrt: ${streetName} (s = ${Math.round(distance)} m)`,
                        imageBase64,
                        width: canvas.width,
                        height: canvas.height,
                        worstCaseText
                    };
                    
                    // Cleanup
                    document.body.removeChild(container);
                    
                    console.log(`📸 Created table screenshot ${idx + 1}: ${streetName} (${canvas.width}x${canvas.height}px)`);
                    return result;
                } catch (error) {
                    console.error(`❌ Error creating table screenshot:`, error);
                    return null;
                }
            };
            
            // Für jede Zufahrt eine autoTable
            const threatsArrayForTable = Array.from(threatsMap.entries());
            
            // Use for...of loop to allow async/await
            for (let index = 0; index < threatsArrayForTable.length; index++) {
                const [streetName, threatData] = threatsArrayForTable[index];
                const distance = threatData.totalLength || 50;
                
                // Generate descriptive text for this access point
                const generateAccessDescription = (name: string, dist: number, roadType?: string): string => {
                    const maxSpeed = Math.sqrt(2 * 3.20 * dist) * 3.6; // Using M1/Pkw acceleration (3.20 m/s²)
                    const speedRange = `${Math.round(maxSpeed * 0.8)}-${Math.round(maxSpeed)}`;
                    
                    // Check for special road types
                    const isFootway = name.toLowerCase().includes('fußweg') || name.toLowerCase().includes('path');
                    const isService = name.toLowerCase().includes('erschließ') || name.toLowerCase().includes('service');
                    
                    if (isFootway) {
                        return `Fußweg ohne offizielle Benennung. Anfahrtsstrecke ${Math.round(dist)} m ermöglicht Geschwindigkeiten bis ${Math.round(maxSpeed)} km/h. Prüfung auf Befahrbarkeit durch Fahrzeuge erforderlich.`;
                    } else if (isService) {
                        return `Erschließungsstraße mit Anfahrtsstrecke von ${Math.round(dist)} m. Geschwindigkeitsbereich: ${speedRange} km/h. Häufig Zufahrt zu Parkplätzen oder Gewerbeflächen.`;
                    } else if (dist < 20) {
                        return `Kurze Anfahrtsstrecke von nur ${Math.round(dist)} m begrenzt die erreichbare Geschwindigkeit auf max. ${Math.round(maxSpeed)} km/h. Geringe Bedrohung durch begrenzte kinetische Energie.`;
                    } else if (dist > 80) {
                        return `Lange Anfahrtsstrecke von ${Math.round(dist)} m ermöglicht hohe Endgeschwindigkeiten (${speedRange} km/h). Kritische Zufahrt mit erhöhtem Schutzbedarf.`;
                    } else {
                        return `Zufahrt über ${name} mit effektiver Anfahrtsstrecke von ${Math.round(dist)} m. Erreichbare Geschwindigkeiten im Bereich ${speedRange} km/h.`;
                    }
                };
                
                // Vehicle classes data gemäß DIN ISO 22343-2 (2025) Prüffahrzeugkategorien
                const vehicleClasses = [
                    { klasse: 'M1', typ: 'Pkw', zulGesamtgewicht: null, testMasse: 1500, acc: 3.20 },
                    { klasse: 'N1G', typ: 'Doppelkabine / Allrad Pick-up', zulGesamtgewicht: null, testMasse: 2500, acc: 2.50 },
                    { klasse: 'N1', typ: 'Kurzfahrerkabine / Pritsche', zulGesamtgewicht: 3500, testMasse: 3500, acc: 1.90 },
                    { klasse: 'N2A', typ: '2-achsiger Frontlenker', zulGesamtgewicht: 8000, testMasse: 7200, acc: 2.00 },
                    { klasse: 'N2B', typ: '2-achsiger Langhauber', zulGesamtgewicht: 14900, testMasse: 6800, acc: 1.50 },
                    { klasse: 'N3C', typ: '2-achsige Frontlenker', zulGesamtgewicht: 20500, testMasse: 7200, acc: 1.25 },
                    { klasse: 'N3D', typ: '2-achsiger Frontlenker', zulGesamtgewicht: 20500, testMasse: 12000, acc: 1.00 },
                    { klasse: 'N3E', typ: '3-achsiger Langhauber', zulGesamtgewicht: 27300, testMasse: 29500, acc: 0.85 },
                    { klasse: 'N3F', typ: '3-achsiger Frontlenker', zulGesamtgewicht: 26000, testMasse: 24000, acc: 0.80 },
                    { klasse: 'N3G', typ: '4-achsiger Frontlenker', zulGesamtgewicht: 36000, testMasse: 30000, acc: 0.75 }
                ];
                
                let maxEnergy = 0;
                let worstCaseVehicle = '';
                
                const tableBody: string[][] = [];
                vehicleClasses.forEach(vehicle => {
                    // Berechnungsmasse: zulässiges Gesamtgewicht oder Test-Masse wenn n/a
                    const calcMass = vehicle.zulGesamtgewicht || vehicle.testMasse;
                    const v_ms = Math.sqrt(2 * vehicle.acc * distance);
                    const v_kmh = v_ms * 3.6;
                    const energy_kj = (calcMass * vehicle.acc * distance) / 1000;
                    const impuls = calcMass * v_ms; // Impuls p = m * v [kg·m/s]
                    
                    let energyLevel = 'E1';
                    if (energy_kj >= 1950) energyLevel = 'E4';
                    else if (energy_kj >= 800) energyLevel = 'E3';
                    else if (energy_kj >= 250) energyLevel = 'E2';
                    
                    if (energy_kj > maxEnergy) {
                        maxEnergy = energy_kj;
                        worstCaseVehicle = `${vehicle.klasse} (${vehicle.typ})`;
                    }
                    
                    // Vollständige Tabelle gemäß DIN ISO 22343-2 Format
                    // Ohne Kurvendaten (keine Kurve = V_end = V_vor_Kurve)
                    tableBody.push([
                        vehicle.klasse,
                        vehicle.typ,
                        vehicle.zulGesamtgewicht ? vehicle.zulGesamtgewicht.toLocaleString('de-DE') : 'n/a',
                        vehicle.testMasse.toLocaleString('de-DE'),
                        vehicle.acc.toFixed(2),
                        v_kmh.toFixed(0),           // V vor Kurve [km/h] = Endgeschwindigkeit
                        v_ms.toFixed(1),            // V vor Kurve [m/s]
                        '-',                        // Kurvenradius [m] - nicht berechnet
                        '-',                        // V nach Kurve [km/h] - nicht berechnet
                        '-',                        // V nach Kurve [m/s] - nicht berechnet
                        '-',                        // Strecke nach Kurve [m] - nicht berechnet
                        v_kmh.toFixed(0),           // V_end an Zufahrt [km/h]
                        v_ms.toFixed(1),            // V_end an Zufahrt [m/s]
                        energy_kj.toFixed(0),       // E_kin [kJ]
                        Math.round(impuls).toLocaleString('de-DE'), // Impuls [kgm/s]
                        energyLevel
                    ]);
                });
                
                // QUERFORMAT für Anhang-Tabellen (Landscape)
                // Seite im Querformat hinzufügen
                pdf.addPage('a4', 'landscape');
                addWatermarkToCurrentPage();
                
                // Landscape-Maße: 297mm breit, 210mm hoch
                const landscape_width = 297;
                const landscape_content_width = landscape_width - (page_margin * 2); // 267mm
                let landscapeY = 25;
                
                // Zufahrtstitel auf neuer Querformat-Seite
                pdf.setFont('helvetica', 'bold').setFontSize(11);
                pdf.setTextColor(46, 90, 136);
                pdf.text(`A.${index + 1} Zufahrt: ${streetName} (s = ${Math.round(distance)} m)`, page_margin, landscapeY);
                pdf.setTextColor(0, 0, 0);
                landscapeY += 6;
                
                // Beschreibung
                pdf.setFont('helvetica', 'normal').setFontSize(9);
                const accessDesc = generateAccessDescription(streetName, distance, threatData.roadType);
                const descLines = pdf.splitTextToSize(accessDesc, landscape_content_width);
                pdf.text(descLines, page_margin, landscapeY);
                landscapeY += descLines.length * 4 + 4;
                
                // ROBUSTE Berechnung: Speichere alle numerischen Werte für E_kin und Impuls
                // (berechnet vor autoTable, damit auch für Screenshot verfügbar)
                const ekinValues: number[] = [];
                const impulsValues: number[] = [];
                
                tableBody.forEach(row => {
                    // E_kin ist an Position 13 (keine Tausendertrennzeichen durch toFixed)
                    const ekinVal = parseFloat(String(row[13])) || 0;
                    // Impuls ist an Position 14 (mit Tausendertrennzeichen durch toLocaleString)
                    const impulsVal = parseFloat(String(row[14]).replace(/\./g, '').replace(',', '.')) || 0;
                    ekinValues.push(ekinVal);
                    impulsValues.push(impulsVal);
                });
                
                const maxEkin = Math.max(...ekinValues, 1); // mindestens 1 um Division durch 0 zu vermeiden
                const maxImpuls = Math.max(...impulsValues, 1);
                
                console.log('📊 Farbskalierung Debug:', { maxEkin, maxImpuls, ekinValues, impulsValues, tableBodyLength: tableBody.length });

                // Use autoTable for professional formatting - Querformat
                // Tabelle gemäß DIN ISO 22343-2 (2025) - vollständiges Format
                if (typeof (pdf as any).autoTable === 'function') {
                    
                    // Speichere Referenz auf die Werte für den didDrawCell-Hook
                    const colorBarData = {
                        ekinValues,
                        impulsValues,
                        maxEkin,
                        maxImpuls
                    };
                    
                    (pdf as any).autoTable({
                        startY: landscapeY,
                        head: [
                            // Erste Kopfzeile mit Gruppierung
                            [
                                { content: 'Fahrzeugklasse\nnach DIN ISO 22343-2 (2025)', colSpan: 2, styles: { halign: 'center' } },
                                { content: 'zulässiges\nGesamtgewicht', styles: { halign: 'center' } },
                                { content: 'Test-\nMasse', styles: { halign: 'center' } },
                                { content: 'Beschleuni-\ngung a', styles: { halign: 'center' } },
                                { content: 'V vor Kurve', colSpan: 2, styles: { halign: 'center' } },
                                { content: 'Kurven-\nradius', styles: { halign: 'center' } },
                                { content: 'V nach Kurve', colSpan: 2, styles: { halign: 'center' } },
                                { content: 'Strecke\nnach Kurve', styles: { halign: 'center' } },
                                { content: 'V_end an Zufahrt', colSpan: 2, styles: { halign: 'center' } },
                                { content: 'Anprallenergie', colSpan: 2, styles: { halign: 'center' } },
                                { content: 'Energie-\nstufe', styles: { halign: 'center' } }
                            ],
                            // Zweite Kopfzeile mit Einheiten
                            ['Klasse', 'Fahrzeugtyp', 'kg', 'kg', '[m/s²]', 'km/h', 'm/s', 'm', 'km/h', 'm/s', 'm', 'km/h', 'm/s', 'E_kin\n[kJ]', 'Impuls\n[kgm/s]', '']
                        ],
                        body: tableBody,
                        theme: 'grid',
                        styles: {
                            fontSize: 7,
                            cellPadding: 1.2,
                            font: 'helvetica',
                            halign: 'center',
                            valign: 'middle',
                            lineWidth: 0.1
                        },
                        headStyles: {
                            fillColor: [46, 90, 136],
                            textColor: [255, 255, 255],
                            fontStyle: 'bold',
                            fontSize: 6.5,
                            cellPadding: 1.5,
                            valign: 'middle'
                        },
                        columnStyles: {
                            0: { halign: 'center', cellWidth: 12 },  // Klasse
                            1: { halign: 'left', cellWidth: 42 },    // Fahrzeugtyp
                            2: { halign: 'right', cellWidth: 18 },   // zul. Gesamtgewicht
                            3: { halign: 'right', cellWidth: 16 },   // Test-Masse
                            4: { halign: 'right', cellWidth: 16 },   // a [m/s²]
                            5: { halign: 'right', cellWidth: 14 },   // V vor Kurve km/h
                            6: { halign: 'right', cellWidth: 12 },   // V vor Kurve m/s
                            7: { halign: 'right', cellWidth: 14 },   // Kurvenradius
                            8: { halign: 'right', cellWidth: 14 },   // V nach Kurve km/h
                            9: { halign: 'right', cellWidth: 12 },   // V nach Kurve m/s
                            10: { halign: 'right', cellWidth: 14 },  // Strecke nach Kurve
                            11: { halign: 'right', cellWidth: 14 },  // V_end km/h
                            12: { halign: 'right', cellWidth: 12 },  // V_end m/s
                            13: { halign: 'right', cellWidth: 16 },  // E_kin
                            14: { halign: 'right', cellWidth: 18 },  // Impuls
                            15: { halign: 'center', cellWidth: 14 }  // Energiestufe
                        },
                        tableWidth: landscape_content_width,
                        margin: { left: page_margin, right: page_margin },
                        // willDrawCell: Zeichne Farbbalken als Zellhintergrund VOR dem Text
                        // Der Text wird von autoTable DANACH darüber gezeichnet
                        willDrawCell: (data: any) => {
                            if (data.section === 'body') {
                                const rowIdx = data.row.index;
                                const colIdx = data.column.index;
                                const cellX = data.cell.x;
                                const cellY = data.cell.y;
                                const cellWidth = data.cell.width;
                                const cellHeight = data.cell.height;
                                
                                // E_kin ist Spalte 13
                                if (colIdx === 13 && rowIdx >= 0 && rowIdx < colorBarData.ekinValues.length) {
                                    // Deaktiviere autoTable-Hintergrund
                                    data.cell.styles.fillColor = false;
                                    
                                    const value = colorBarData.ekinValues[rowIdx];
                                    const ratio = Math.min(value / colorBarData.maxEkin, 1);
                                    const barWidth = cellWidth * ratio;
                                    
                                    // Zuerst weißer Hintergrund für gesamte Zelle
                                    pdf.setFillColor(255, 255, 255);
                                    pdf.rect(cellX, cellY, cellWidth, cellHeight, 'F');
                                    
                                    // Dann Gelb-Orange Farbbalken (FFD966) proportional
                                    if (barWidth > 0) {
                                        pdf.setFillColor(255, 217, 102);
                                        pdf.rect(cellX, cellY, barWidth, cellHeight, 'F');
                                    }
                                }
                                
                                // Impuls ist Spalte 14
                                if (colIdx === 14 && rowIdx >= 0 && rowIdx < colorBarData.impulsValues.length) {
                                    // Deaktiviere autoTable-Hintergrund
                                    data.cell.styles.fillColor = false;
                                    
                                    const value = colorBarData.impulsValues[rowIdx];
                                    const ratio = Math.min(value / colorBarData.maxImpuls, 1);
                                    const barWidth = cellWidth * ratio;
                                    
                                    // Zuerst weißer Hintergrund für gesamte Zelle
                                    pdf.setFillColor(255, 255, 255);
                                    pdf.rect(cellX, cellY, cellWidth, cellHeight, 'F');
                                    
                                    // Dann Blau Farbbalken (9BC2E6) proportional
                                    if (barWidth > 0) {
                                        pdf.setFillColor(155, 194, 230);
                                        pdf.rect(cellX, cellY, barWidth, cellHeight, 'F');
                                    }
                                }
                            }
                        },
                        didDrawPage: () => {
                            addWatermarkToCurrentPage();
                        }
                    });
                    currentY = (pdf as any).lastAutoTable.finalY + 3;
                } else {
                    // Fallback to manual table if autoTable not available (Landscape)
                    pdf.setFont('helvetica', 'bold').setFontSize(6);
                    const colWidths = [12, 42, 18, 16, 16, 14, 12, 14, 14, 12, 14, 14, 12, 16, 18, 14];
                    const headers = ['Klasse', 'Fahrzeugtyp', 'zul. Gew.', 'Test-M.', 'a', 'v', 'v', 'r', 'v', 'v', 's', 'v', 'v', 'E_kin', 'Impuls', 'Stufe'];
                    
                    let colX = page_margin;
                    headers.forEach((header, i) => {
                        pdf.text(header, colX, landscapeY);
                        colX += colWidths[i];
                    });
                    landscapeY += 4;
                    
                    pdf.setDrawColor(46, 90, 136).setLineWidth(0.3);
                    pdf.line(page_margin, landscapeY, page_margin + colWidths.reduce((a, b) => a + b, 0), landscapeY);
                    landscapeY += 3;
                    
                    pdf.setFont('helvetica', 'normal').setFontSize(8);
                    tableBody.forEach(row => {
                        colX = page_margin;
                        row.forEach((cell, i) => {
                            pdf.text(cell, colX + (i > 0 ? colWidths[i] - pdf.getTextWidth(cell) - 2 : 0), landscapeY);
                            colX += colWidths[i];
                        });
                        landscapeY += 4;
                    });
                    landscapeY += 2;
                    currentY = landscapeY;
                }
                
                // Worst-Case highlight with mathematical notation (auf Querformat-Seite)
                let worstCaseLevel = 'E1';
                if (maxEnergy >= 1950) worstCaseLevel = 'E4';
                else if (maxEnergy >= 800) worstCaseLevel = 'E3';
                else if (maxEnergy >= 250) worstCaseLevel = 'E2';
                
                // Prüfen ob genug Platz auf der Landscape-Seite (210mm Höhe)
                const landscapeYPos = (pdf as any).lastAutoTable?.finalY || landscapeY || 150;
                let currentLandscapeY = landscapeYPos + 5;
                
                pdf.setFont('helvetica', 'bold').setFontSize(9);
                pdf.setTextColor(204, 0, 0); // Red for warning
                const worstCaseText = `! Worst Case: ${worstCaseVehicle}, E_max = ${maxEnergy.toFixed(0)} kJ (${worstCaseLevel})`;
                pdf.text(worstCaseText, page_margin, currentLandscapeY);
                pdf.setTextColor(0, 0, 0);
                currentLandscapeY += 10;
                
                // Create table screenshot for Word document (using same data as PDF)
                const tableScreenshot = await createTableScreenshot(
                    streetName, 
                    distance, 
                    tableBody, 
                    maxEnergy, 
                    maxImpuls,
                    index,
                    worstCaseVehicle
                );
                if (tableScreenshot) {
                    appendixTableImages.push(tableScreenshot);
                }
            } // end for loop
            
            // Legende mit mathematischer Formatierung (auf separater Seite)
            pdf.addPage('a4', 'landscape');
            addWatermarkToCurrentPage();
            let legendY = 25;
            
            pdf.setFont('helvetica', 'bold').setFontSize(12);
            pdf.setTextColor(46, 90, 136);
            const legendTitle = currentLanguage === 'de' ? 'Legende Energiestufen nach DIN ISO 22343-2:' : 'Energy Level Legend per DIN ISO 22343-2:';
            pdf.text(legendTitle, page_margin, legendY);
            pdf.setTextColor(0, 0, 0);
            legendY += 10;
            
            pdf.setFont('helvetica', 'normal').setFontSize(9);
            const legendItems = currentLanguage === 'de' ? [
                'E1 (E < 250 kJ):        Niedriges Energieniveau - einfache Sperren ausreichend (leichte Fahrzeuge, geringe Geschwindigkeit)',
                'E2 (250 <= E < 800 kJ): Mittleres Energieniveau - SK1-Barrieren empfohlen (Pkw bis mittlere Geschwindigkeit)',
                'E3 (800 <= E < 1.950 kJ): Hohes Energieniveau - SK2-Barrieren erforderlich (Transporter, höhere Geschwindigkeiten)',
                'E4 (E >= 1.950 kJ):     Sehr hohes Energieniveau - Hochsicherheitsbarrieren erforderlich (Lkw, hohe Geschwindigkeiten)'
            ] : [
                'E1 (E < 250 kJ):        Low energy level - simple barriers sufficient (light vehicles, low speed)',
                'E2 (250 <= E < 800 kJ): Medium energy level - SK1 barriers recommended (cars up to medium speed)',
                'E3 (800 <= E < 1,950 kJ): High energy level - SK2 barriers required (vans, higher speeds)',
                'E4 (E >= 1,950 kJ):     Very high energy level - high security barriers required (trucks, high speeds)'
            ];
            
            legendItems.forEach(item => {
                pdf.text(item, page_margin, legendY);
                legendY += 6;
            });
            
            // Formelübersicht
            legendY += 8;
            pdf.setFont('helvetica', 'bold').setFontSize(11);
            pdf.setTextColor(46, 90, 136);
            pdf.text('Formeln zur Energieberechnung:', page_margin, legendY);
            pdf.setTextColor(0, 0, 0);
            legendY += 8;
            
            pdf.setFont('helvetica', 'normal').setFontSize(9);
            const formulas = [
                'Geschwindigkeit (gleichmäßig beschleunigt):  v = sqrt(2 * a * s)    [m/s]',
                'Kinetische Energie:                          E_kin = 0.5 * m * v²   [kJ]',
                'Impuls:                                      p = m * v              [kg*m/s]',
                '',
                'wobei: a = Fahrzeugbeschleunigung [m/s²], s = Anlaufstrecke [m], m = Fahrzeugmasse [kg]'
            ];
            
            formulas.forEach(formula => {
                pdf.text(formula, page_margin, legendY);
                legendY += 5;
            });
        }

        // Ensure watermark is drawn ON TOP of all content (text and images) on every page
        try {
            const getPages = (pdf as any).getNumberOfPages || pdf.internal?.getNumberOfPages;
            const totalPages: number = typeof getPages === 'function' ? getPages.call(pdf) : 1;
            for (let p = 1; p <= totalPages; p++) {
                pdf.setPage(p);
                addWatermarkToCurrentPage();
            }
        } catch (e) {
            // Fallback: at least watermark current page
            addWatermarkToCurrentPage();
        }

        // Switch back to report view before loading the PDF
        // Ensure report preview container is visible and has size before setting src
        reportPreviewArea.classList.remove('view-hidden');
        mapDiv.classList.add('view-hidden');
        // Force layout so the iframe becomes visible
        await new Promise(requestAnimationFrame);

        // Use a Blob URL for iframe preview (more reliable than data URI in some browsers)
        try {
            const pdfBlob = pdf.output('blob');
            if (generatedPdfUrl) {
                URL.revokeObjectURL(generatedPdfUrl);
            }
            generatedPdfUrl = URL.createObjectURL(pdfBlob);
            reportIframe.src = generatedPdfUrl;
        } catch (e) {
            // Fallback to data URI
            reportIframe.src = pdf.output('datauristring');
        }
        generatedPdf = pdf;
        
        // Generate filename with location, event (if available), and date
        const kommune = locationName.split(',')[0].trim().replace(/[<>:"/\\|?*]/g, '');
        // hazardData already declared above at the beginning of generateRiskReport
        const anlass = hazardData?.area?.trim().replace(/[<>:"/\\|?*]/g, '') || '';
        const date = reportGeneratedAt.toLocaleDateString('de-DE').replace(/\./g, '-');
        
        // Build filename: Risikobericht_Ort_Anlass_Datum.pdf (Anlass only if provided)
        const filenameParts = ['Risikobericht', kommune];
        if (anlass && anlass.length > 0) {
            filenameParts.push(anlass);
        }
        filenameParts.push(date);
        generatedPdfFilename = filenameParts.join('_').replace(/\s+/g, '-') + '.pdf';
        
        // Generate Word document using docx.js
        try {
            const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ImageRun, PageBreak, PageOrientation, VerticalAlign, TextWrappingType, TextWrappingSide, PositionalTabStopType, PositionalTabAlignmentType, SectionType } = (window as any).docx;
            
            // Debug: Check what PageOrientation actually is
            console.log('📄 docx.js PageOrientation:', PageOrientation);
            console.log('📄 docx.js PageOrientation.LANDSCAPE:', PageOrientation?.LANDSCAPE);

            if (Document && Packer) {
                const docChildren: any[] = [];
                
                // Helper function to create a proper Word table (centered)
                const createWordTable = (headers: string[], rows: string[][]): any => {
                    const tableRows = [];
                    
                // Header row with blue background
                    tableRows.push(new TableRow({
                        children: headers.map(header => new TableCell({
                            children: [new Paragraph({
                                children: [new TextRun({ text: header, bold: true, size: 21, color: 'FFFFFF', font: 'Arial' })],
                                alignment: AlignmentType.CENTER
                            })],
                            shading: { fill: '2E5A88' }
                        }))
                    }));

                    // Data rows
                    rows.forEach(row => {
                        tableRows.push(new TableRow({
                            children: row.map((cell, idx) => new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: cell, size: 21, font: 'Arial' })],  // 10.5pt to match PDF
                                    alignment: idx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER
                                })]
                            }))
                        }));
                    });
                    
                    return new Table({
                        rows: tableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        alignment: AlignmentType.CENTER
                    });
                };
                
                // Helper to format mathematical formulas
                const formatFormula = (text: string): TextRun[] => {
                    // Replace common mathematical notations with proper formatting
                    const runs: TextRun[] = [];
                    // Split by formula patterns and format
                    const formatted = text
                        .replace(/v\s*=\s*√\(2·a·s\)/g, 'v = √(2·a·s)')
                        .replace(/E\s*=\s*½·m·v²/g, 'E = ½·m·v²')
                        .replace(/\[km\/h\]/g, ' [km/h]')
                        .replace(/\[kJ\]/g, ' [kJ]')
                        .replace(/\[kg\]/g, ' [kg]')
                        .replace(/\[m\/s²\]/g, ' [m/s²]');
                    runs.push(new TextRun({ text: formatted, size: 21, font: 'Arial' }));  // 10.5pt to match PDF, Arial font
                    return runs;
                };
                
                // ==================== PROFESSIONAL TITLE PAGE ====================
                const hazardData = (typeof getHazardAnalysisFormData === 'function') ? getHazardAnalysisFormData() : null;
                const eventName = hazardData?.area || assetToProtect;
                // Extract city name properly
                let cityName = hazardData?.city || locationName.split(',')[0].trim();
                cityName = cityName.replace(/^\d+[\s,]*/, '').trim();
                if (!cityName || cityName.length < 2) {
                    const parts = locationName.split(',');
                    cityName = parts[1]?.trim() || 'Standort';
                }
                
                // City name (centered, smaller)
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: cityName, bold: true, size: 28, font: 'Arial' })],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 400, after: 400 }
                }));
                
                // Main title
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Risikobewertung Zufahrtsschutz', bold: true, size: 40, color: '2E5A88', font: 'Arial' })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }));

                // Event subtitle
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: `${eventName} ${new Date().getFullYear()}`, bold: true, size: 32, font: 'Arial' })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 }
                }));
                
                // Descriptive subtitle
                docChildren.push(new Paragraph({
                    children: [new TextRun({
                        text: 'Risikobewertung zur fahrdynamischen Analyse, Schutzzieldefinition und Planung von Fahrzeugsicherheitsbarrieren',
                        italics: true,
                        size: 22  // 11pt - matches PDF subtitle 2
                    })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 }
                }));
                
                // Horizontal line (using border)
                docChildren.push(new Paragraph({
                    children: [],
                    border: {
                        bottom: {
                            color: '1E90FF',
                            space: 1,
                            size: 20,
                            style: BorderStyle.SINGLE
                        }
                    },
                    spacing: { after: 400 }
                }));
                
                // Metadata block (centered)
                const formattedDate = `${String(reportGeneratedAt.getDate()).padStart(2, '0')}.${String(reportGeneratedAt.getMonth() + 1).padStart(2, '0')}.${reportGeneratedAt.getFullYear()}`;
                const auftraggeberName = hazardData?.city || locationName.split(',')[0].trim().replace(/^\d{5}\s+/, '') || 'Kommune';
                const aktenzeichen = `BX-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
                
                const metaLines = [
                    'Erstellt durch: BarricadiX GmbH',
                    'Bearbeiter: Automatisierte Analyse',
                    `Auftraggeber: Stadt ${auftraggeberName}`,
                    `Aktenzeichen: ${aktenzeichen}`,
                    `Datum: ${formattedDate}`,
                    'Version: 1.0 (Entwurf)'
                ];
                
                metaLines.forEach(line => {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: line, size: 20, font: 'Arial' })],  // 10pt for metadata
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 120 }
                    }));
                });
                
                // Disclaimer at bottom
                docChildren.push(new Paragraph({
                    children: [new TextRun({ 
                        text: 'Diese Risikobewertung ersetzt keine hoheitliche Gefährdungsbewertung der zuständigen Sicherheitsbehörden.', 
                        italics: true, 
                        size: 18,
                        color: '666666'
                    })],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 800 }
                }));
                
                // Page break after title page
                docChildren.push(new Paragraph({
                    children: [new PageBreak()],
                    spacing: { before: 400 }
                }));
                
                // ==================== EXECUTIVE SUMMARY (KURZFASSUNG) ====================
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Kurzfassung für Entscheidungsträger', bold: true, size: 32, color: '2E5A88', font: 'Arial' })],
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 200 }
                }));
                
                // Horizontal line
                docChildren.push(new Paragraph({
                    children: [],
                    border: {
                        bottom: {
                            color: '1E90FF',
                            space: 1,
                            size: 10,
                            style: BorderStyle.SINGLE
                        }
                    },
                    spacing: { after: 200 }
                }));
                
                // Calculate threat statistics
                const threatsArray = Array.from(threatsMap.entries());
                const avgThreatLevel = threatsArray.length > 0 
                    ? threatsArray.reduce((sum, [, data]) => sum + (data.threatLevel || 5), 0) / threatsArray.length 
                    : 5;
                
                // Categorize access routes
                let catA = 0, catB = 0, catC = 0;
                threatsArray.forEach(([, data]) => {
                    const distance = data.totalLength || 50;
                    const energy = 30000 * 0.75 * distance / 1000; // Worst case with 30t truck
                    if (energy >= 800) catA++;
                    else if (energy >= 250) catB++;
                    else catC++;
                });
                
                // Executive summary text
                const summaryLines = [
                    `Gegenstand: Risikobewertung Zufahrtsschutz für ${eventName} in ${cityName}`,
                    '',
                    'Ergebnis der Analyse:',
                    `• ${threatsArray.length} Zufahrten wurden identifiziert und fahrdynamisch bewertet`,
                    `• Durchschnittliches Bedrohungsniveau: ${avgThreatLevel.toFixed(1)}/10`,
                    `• Abgeleiteter Sicherungsgrad: ${context.protectionGrade}`,
                    '',
                    'Kategorisierung nach Schutzbedarf:',
                    `• Kategorie A (hochkritisch, SK2 erforderlich): ${catA} Zufahrten`,
                    `• Kategorie B (mittel, SK1 ausreichend): ${catB} Zufahrten`,
                    `• Kategorie C (gering, einfache Sperren): ${catC} Zufahrten`,
                    '',
                    'Empfehlung:',
                    'Mit der Umsetzung der empfohlenen SK1-/SK2-Maßnahmen und eines abgestimmten',
                    'Betriebskonzepts kann das Risiko auf ein ALARP-konformes Niveau reduziert werden.',
                    'Die Detailplanung und Produktauswahl sollte in Abstimmung mit den zuständigen',
                    'Sicherheitsbehörden erfolgen.'
                ];
                
                summaryLines.forEach(line => {
                    if (line === '') {
                        docChildren.push(new Paragraph({ children: [], spacing: { after: 100 } }));
                    } else                     if (line.startsWith('•')) {
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: line.substring(2).trim(), size: 21, font: 'Arial' })],  // 10.5pt to match PDF body text
                            bullet: { level: 0 },
                            spacing: { after: 100 }
                        }));
                    } else if (line.includes(':')) {
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: line, bold: true, size: 21, font: 'Arial' })],  // 10.5pt to match PDF
                            spacing: { before: 200, after: 120 }
                        }));
                    } else {
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: line, size: 21, font: 'Arial' })],  // 10.5pt to match PDF body text
                            spacing: { after: 100 }
                        }));
                    }
                });
                
                // Traffic Light (Ampel) visualization using table
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Risiko-Ampel:', bold: true, size: 22, font: 'Arial' })],
                    spacing: { before: 300, after: 150 }
                }));
                
                const ampelTable = new Table({
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({
                                        children: [new TextRun({ text: `A: ${catA}`, bold: true, size: 18, color: 'FFFFFF', font: 'Arial' })],  // 9pt to match PDF
                                        alignment: AlignmentType.CENTER
                                    })],
                                    shading: { fill: 'DC3545' },
                                    width: { size: 33, type: WidthType.PERCENTAGE }
                                }),
                                new TableCell({
                                    children: [new Paragraph({
                                        children: [new TextRun({ text: `B: ${catB}`, bold: true, size: 18, color: '000000', font: 'Arial' })],  // 9pt to match PDF
                                        alignment: AlignmentType.CENTER
                                    })],
                                    shading: { fill: 'FFC107' },
                                    width: { size: 33, type: WidthType.PERCENTAGE }
                                }),
                                new TableCell({
                                    children: [new Paragraph({
                                        children: [new TextRun({ text: `C: ${catC}`, bold: true, size: 18, color: 'FFFFFF', font: 'Arial' })],  // 9pt to match PDF
                                        alignment: AlignmentType.CENTER
                                    })],
                                    shading: { fill: '28A745' },
                                    width: { size: 34, type: WidthType.PERCENTAGE }
                                })
                            ]
                        })
                    ],
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    alignment: AlignmentType.CENTER
                });
                
                docChildren.push(ampelTable);
                
                // Page break before main content
                docChildren.push(new Paragraph({
                    children: [new PageBreak()],
                    spacing: { before: 400 }
                }));
                
                // Add all AI sections to Word document - use correct keys from aiSections
                const wordSections = [
                    { title: '1. Auftrag, Zielsetzung und Geltungsbereich', keys: ['chapter1_auftrag', 'purpose', 'section1'] },
                    { title: '2. Normative Grundlagen und Referenzen', keys: ['chapter2_normen', 'section2'] },
                    { title: '3. Beschreibung des Schutzbereichs', keys: ['chapter3_bereich', 'section3'] },
                    { title: '4. Bedrohungsanalyse und Täterverhalten', keys: ['chapter4_bedrohung', 'threatAnalysis', 'section4'] },
                    { title: '5. Methodik der BarricadiX-Analyse', keys: ['chapter5_methodik', 'section5'] },
                    { title: '6. Fahrdynamische Analyse und Maximalenergien', keys: ['chapter6_fahrdynamik', 'section6'] },
                    { title: '7. Risikoanalyse nach ALARP-Prinzip', keys: ['chapter7_risiko', 'vulnerabilities', 'section7'] },
                    { title: '8. Schutzzieldefinition und Sicherungsgrad', keys: ['chapter8_schutzziel', 'section8'] },
                    { title: '9. Schutzkonzept und Maßnahmenempfehlungen', keys: ['chapter9_konzept', 'hvmMeasures', 'section9'] },
                    { title: '10. Restgefahren und Betriebskonzept', keys: ['chapter10_restgefahren', 'siteConsiderations', 'section10'] },
                    { title: '11. Fazit und Handlungsempfehlung', keys: ['chapter11_empfehlung', 'operationalImpact', 'section11'] }
                ];
                
                wordSections.forEach((section) => {
                    // Find content from any of the possible keys
                    let content = '';
                    for (const key of section.keys) {
                        if (aiSections[key] && aiSections[key].trim()) {
                            content = aiSections[key];
                            break;
                        }
                    }
                    
                    // Section heading with professional styling
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: section.title, bold: true, size: 28, color: '2E5A88', font: 'Arial' })],
                        heading: HeadingLevel.HEADING_1,
                        spacing: { before: 400, after: 160 }
                    }));
                    
                    if (content) {
                        // Section content - split by paragraphs
                        const paragraphs = content.split('\n').filter((p: string) => p.trim());
                        paragraphs.forEach((para: string) => {
                            // Skip if it's just the section title repeated
                            if (para.startsWith('**') && para.includes(section.title.substring(0, 10))) return;
                            
                            // Check if it's a table row (contains | characters)
                            if (para.includes('|') && para.split('|').length > 2) {
                                // Format as monospace for table-like data
                                docChildren.push(new Paragraph({
                                    children: [new TextRun({ text: para.trim(), size: 21, font: 'Consolas' })],  // 10.5pt to match PDF
                                    spacing: { before: 96, after: 96 }
                                }));
                            } else if (para.startsWith('-') || para.startsWith('•') || para.startsWith('–')) {
                                // Bullet point with proper size - formatFormula already uses size: 21
                                const bulletText = para.replace(/^[-•–]\s*/, '').trim();
                                docChildren.push(new Paragraph({
                                    children: formatFormula(bulletText),
                                    bullet: { level: 0 },
                                    spacing: { before: 96, after: 96 }
                                }));
                            } else if (para.match(/^\d+\.\d+/)) {
                                // Sub-heading (like 3.1, 4.2)
                                docChildren.push(new Paragraph({
                                    children: [new TextRun({ text: para.trim(), bold: true, size: 24, font: 'Arial' })],  // 12pt for sub-headings
                                    spacing: { before: 240, after: 120 }
                                }));
                            } else {
                                // Normal paragraph with justified alignment (Blocksatz like PDF)
                                docChildren.push(new Paragraph({
                                    children: formatFormula(para.trim()),  // formatFormula uses size: 21 (10.5pt) and Arial
                                    spacing: { before: 96, after: 96 },
                                    alignment: AlignmentType.JUSTIFIED
                                }));
                            }
                        });
                    } else {
                        // Placeholder if no content
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: '[Abschnitt wird durch KI generiert]', italics: true, size: 21, color: '888888', font: 'Arial' })],  // 10.5pt
                            spacing: { after: 100 }
                        }));
                    }
                    
                    docChildren.push(new Paragraph({ children: [], spacing: { before: 240 } }));
                });
                
                // MAP IMAGE - Lagekarte mit Zufahrten
                if (canvas) {
                    try {
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: '', break: 1 }), new PageBreak()]
                        }));
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: 'Lagekarte mit identifizierten Zufahrten', bold: true, size: 28, color: '2E5A88', font: 'Arial' })],
                            heading: HeadingLevel.HEADING_1,
                            spacing: { before: 200, after: 200 },
                            alignment: AlignmentType.CENTER
                        }));
                        
                        // Convert canvas to base64 PNG
                        const mapDataUrl = canvas.toDataURL('image/png');
                        const base64Data = mapDataUrl.split(',')[1];
                        
                        // Calculate image dimensions (max width 600px, maintain aspect ratio)
                        const maxWidth = 600;
                        const imgRatio = canvas.height / canvas.width;
                        const imgWidth = Math.min(canvas.width, maxWidth);
                        const imgHeight = imgWidth * imgRatio;
                        
                        docChildren.push(new Paragraph({
                            children: [
                                new ImageRun({
                                    data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
                                    transformation: {
                                        width: imgWidth,
                                        height: imgHeight
                                    },
                                    type: 'png'
                                })
                            ],
                            alignment: AlignmentType.CENTER
                        }));
                        
                        docChildren.push(new Paragraph({
                            children: [new TextRun({ text: 'Abbildung: GIS-gestützte Darstellung des Schutzbereichs mit allen identifizierten Zufahrtskorridoren', italics: true, size: 18, font: 'Arial' })],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 200 }
                        }));
                        
                        console.log('✅ Map image added to Word document');
                    } catch (imgError) {
                        console.warn('Could not add map image to Word:', imgError);
                    }
                }
                
                // ANHANG: Fahrdynamische Detailberechnungen
                docChildren.push(new Paragraph({
                    children: [new PageBreak()]
                }));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Anhang A: Fahrdynamische Detailtabellen', bold: true, size: 32, color: '2E5A88', font: 'Arial' })],
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 200 }
                }));
                
                // Horizontal line
                docChildren.push(new Paragraph({
                    children: [],
                    border: {
                        bottom: {
                            color: '1E90FF',
                            space: 1,
                            size: 10,
                            style: BorderStyle.SINGLE
                        }
                    },
                    spacing: { after: 200 }
                }));
                
                // Mathematical formulas with better formatting
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Berechnungsgrundlagen:', bold: true, size: 21, font: 'Arial' })],  // 10.5pt to match PDF
                    spacing: { before: 200, after: 120 }
                }));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'v = sqrt(2 * a * s)   [km/h]', size: 20, font: 'Courier New' })],  // 10pt for formulas
                    spacing: { before: 96, after: 96 }
                }));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'E = 0.5 * m * v^2     [kJ]', size: 20, font: 'Courier New' })],  // 10pt for formulas
                    spacing: { before: 96, after: 96 }
                }));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'wobei: m = Masse [kg], a = Beschleunigung [m/s^2], s = Anfahrtsstrecke [m]', italics: true, size: 18, font: 'Arial' })],  // 9pt for explanations
                    spacing: { before: 96, after: 240 }
                }));
                
                // Fahrzeugklassen-Tabelle
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Referenz-Fahrzeugklassen:', bold: true, size: 24, font: 'Arial' })],  // 12pt for sub-section headers
                    spacing: { before: 200, after: 100 }
                }));
                
                const vehicleHeaders = ['Klasse', 'Fahrzeugtyp', 'zul. Ges.gew. [kg]', 'Test-Masse [kg]', 'a [m/s²]'];
                const vehicleRows = [
                    ['M1', 'Pkw', 'n/a', '1.500', '3,20'],
                    ['N1G', 'Doppelkabine / Allrad Pick-up', 'n/a', '2.500', '2,50'],
                    ['N1', 'Kurzfahrerkabine / Pritsche', '3.500', '3.500', '1,90'],
                    ['N2A', '2-achsiger Frontlenker', '8.000', '7.200', '2,00'],
                    ['N2B', '2-achsiger Langhauber', '14.900', '6.800', '1,50'],
                    ['N3C', '2-achsige Frontlenker', '20.500', '7.200', '1,25'],
                    ['N3D', '2-achsiger Frontlenker', '20.500', '12.000', '1,00'],
                    ['N3E', '3-achsiger Langhauber', '27.300', '29.500', '0,85'],
                    ['N3F', '3-achsiger Frontlenker', '26.000', '24.000', '0,80'],
                    ['N3G', '4-achsiger Frontlenker', '36.000', '30.000', '0,75']
                ];
                docChildren.push(createWordTable(vehicleHeaders, vehicleRows));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Fahrzeugklassen nach DIN ISO 22343-2 (2025). Bei n/a wird die Test-Masse für die Berechnung verwendet.', italics: true, size: 18, font: 'Arial' })],
                    spacing: { before: 50, after: 100 }
                }));

                // Energiestufen-Legende
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: 'Energiestufen und Schutzklassen:', bold: true, size: 24, font: 'Arial' })],  // 12pt for sub-section headers
                    spacing: { before: 300, after: 100 }
                }));
                
                const energyHeaders = ['Stufe', 'Energiebereich', 'Schutzklasse', 'Maßnahme'];
                const energyRows = [
                    ['E1', '< 250 kJ', 'Basis', 'Einfache Absperrungen'],
                    ['E2', '250 – 800 kJ', 'SK1', 'SK1-Barrieren'],
                    ['E3', '800 – 1.950 kJ', 'SK2', 'SK2-Barrieren'],
                    ['E4', '> 1.950 kJ', 'Hoch', 'Hochsicherheitsbarrieren']
                ];
                docChildren.push(createWordTable(energyHeaders, energyRows));
                
                // NOTE: Detailed threat tables will be added as landscape sections below
                
                // Debug: Log what sections were found
                console.log('📄 Word document sections found:', Object.keys(aiSections));

                // Create separate sections for portrait and landscape pages
                const documentSections: any[] = [];
                
                // Main section (portrait) - NO watermark as requested
                documentSections.push({
                    properties: {
                        page: {
                            margin: {
                                top: 1134,    // 20mm in twips (20 * 56.7)
                                right: 1134,  // 20mm
                                bottom: 1134, // 20mm
                                left: 1134    // 20mm
                            }
                        }
                    },
                    children: docChildren
                });

                // Add landscape sections for detailed threat tables as IMAGES (html2canvas)
                if (threatsMap && threatsMap.size > 0 && appendixTableImages && appendixTableImages.length > 0) {
                    console.log(`📸 Using ${appendixTableImages.length} table images for Word document`);
                    
                    for (let idx = 0; idx < appendixTableImages.length; idx++) {
                        const tableImageData = appendixTableImages[idx] as { title: string, imageBase64: string, width: number, height: number, worstCaseText: string };
                        const landscapeChildren: any[] = [];

                        // 1. Add TITLE as text paragraph (NOT in screenshot)
                        landscapeChildren.push(new Paragraph({
                            children: [new TextRun({ 
                                text: tableImageData.title,
                                bold: true,
                                size: 24, // 12pt
                                color: '2E5A88',
                                font: 'Arial'
                            })],
                            spacing: { before: 100, after: 200 }
                        }));

                        // 2. Insert table as IMAGE (screenshot from HTML with gradients)
                        try {
                            // Use same approach as working map image: split base64, atob, Uint8Array
                            const base64Data = tableImageData.imageBase64.split(',')[1];
                            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                            
                            // Calculate dimensions in PIXELS
                            // Landscape A4 page: 297mm wide, margins 720 twips (12.7mm) each side
                            // Target: 27cm (270mm) table width to fill page edge-to-edge
                            // 23cm was 880px, so 27cm = 880 * (27/23) ≈ 1033px
                            const fullPageWidthPx = 1035; // 27cm width for full page coverage
                            const imgRatio = tableImageData.height / tableImageData.width;
                            const imgWidth = fullPageWidthPx; // Use full available width
                            const imgHeight = imgWidth * imgRatio;

                            landscapeChildren.push(new Paragraph({
                                children: [
                                    new ImageRun({
                                        data: imageBytes,
                                        transformation: {
                                            width: imgWidth,
                                            height: imgHeight
                                        },
                                        type: 'png'
                                    })
                                ],
                                alignment: AlignmentType.LEFT // Left-align to match title position
                            }));
                            
                            console.log(`📸 Added table image ${idx + 1}: ${tableImageData.title} (${imgWidth.toFixed(0)}x${imgHeight.toFixed(0)}px)`);
                        } catch (imgError) {
                            console.error(`❌ Error adding table image ${idx + 1}:`, imgError);
                            landscapeChildren.push(new Paragraph({
                                children: [new TextRun({ 
                                    text: '[Tabellenbild konnte nicht eingefügt werden]',
                                    size: 20,
                                    font: 'Arial',
                                    color: 'FF0000'
                                })],
                                alignment: AlignmentType.CENTER
                            }));
                        }

                        // 3. Add WORST CASE text below the table (red warning text like in PDF)
                        if (tableImageData.worstCaseText) {
                            landscapeChildren.push(new Paragraph({
                                children: [new TextRun({ 
                                    text: tableImageData.worstCaseText,
                                    bold: true,
                                    size: 18, // 9pt
                                    color: 'CC0000', // Red like in PDF
                                    font: 'Arial'
                                })],
                                spacing: { before: 150, after: 100 }
                            }));
                        }

                        // Add landscape section - A4 Landscape: 297mm x 210mm
                        // In docx.js v8.x, use PageOrientation enum if available, fallback to string
                        const landscapeOrientation = PageOrientation?.LANDSCAPE || "landscape";
                        console.log(`📸 Creating landscape section ${idx + 1} with orientation:`, landscapeOrientation);
                        
                        documentSections.push({
                            properties: {
                                type: SectionType?.NEXT_PAGE, // Force new page for each table
                                page: {
                                    margin: { top: 720, right: 720, bottom: 720, left: 720 },
                                    size: { 
                                        width: 16838,  // 297mm in twips (A4 long edge)
                                        height: 11906, // 210mm in twips (A4 short edge)
                                        orientation: landscapeOrientation
                                    }
                                }
                            },
                            children: landscapeChildren
                        });
                    }
                } else if (threatsMap && threatsMap.size > 0) {
                    // Fallback: No images available, create simple text placeholder
                    console.log('⚠️ No table images available, using placeholder');
                    const threatsArray = Array.from(threatsMap.entries());
                    
                    threatsArray.slice(0, 10).forEach(([streetName, threatData], idx) => {
                        const distance = threatData.totalLength || 50;
                        const landscapeChildren: any[] = [];

                        landscapeChildren.push(new Paragraph({
                            children: [new TextRun({ 
                                text: `A.${idx + 1} Zufahrt: ${streetName} (s = ${Math.round(distance)} m)`,
                                bold: true,
                                size: 22,
                                color: '2E5A88',
                                font: 'Arial'
                            })],
                            spacing: { before: 200, after: 200 }
                        }));
                        
                        landscapeChildren.push(new Paragraph({
                            children: [new TextRun({ 
                                text: '[Tabelle - siehe PDF für detaillierte Darstellung]',
                                size: 20,
                                font: 'Arial',
                                italics: true
                            })],
                            alignment: AlignmentType.CENTER
                        }));

                        // Add landscape section - A4 Landscape: 297mm x 210mm
                        const landscapeOrientation = PageOrientation?.LANDSCAPE || "landscape";
                        documentSections.push({
                            properties: {
                                type: SectionType?.NEXT_PAGE,
                                page: {
                                    margin: { top: 720, right: 720, bottom: 720, left: 720 },
                                    size: { 
                                        width: 16838,  // 297mm in twips (A4 long edge)
                                        height: 11906, // 210mm in twips (A4 short edge)
                                        orientation: landscapeOrientation
                                    }
                                }
                            },
                            children: landscapeChildren
                        });
                    });
                }

                // Log total sections before creating document
                console.log('📄 Total document sections (portrait + landscape):', documentSections.length);
                
                // Create the document with proper margins and watermark
                const doc = new Document({
                    sections: documentSections
                });
                
                // Generate Word blob
                generatedWordBlob = await Packer.toBlob(doc);
                generatedWordFilename = filenameParts.join('_').replace(/\s+/g, '-') + '.docx';
                
                // Enable Word download button
                const downloadWordBtn = document.getElementById('download-word-btn') as HTMLButtonElement;
                if (downloadWordBtn) downloadWordBtn.disabled = false;
                
                console.log('✅ Word document generated successfully with tables and appendix');
            }
        } catch (wordError) {
            console.error('Word document generation failed:', wordError);
        }
        
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
        // Use stored filename or fallback to translation
        const filename = generatedPdfFilename || t('report.reportFilename');
        generatedPdf.save(filename);
    } else {
        alert(t('alerts.noReportToDownload'));
    }
}

/**
 * Triggers the download of the generated Word document.
 */
function downloadWordReport() {
    if (generatedWordBlob && generatedWordFilename) {
        // Use FileSaver.js to download the Word document
        if (typeof (window as any).saveAs === 'function') {
            (window as any).saveAs(generatedWordBlob, generatedWordFilename);
        } else {
            // Fallback: create download link manually
            const url = URL.createObjectURL(generatedWordBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generatedWordFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    } else {
        alert(t('alerts.noReportToDownload'));
    }
}

/**
 * Triggers the download of the generated Tender PDF.
 */
async function downloadTender() {
    if (generatedTenderPdf) {
        const locationName = drawnPolygon ? await getReportLocationName(drawnPolygon.getBounds().getCenter()) : 'Standort';
        // Use same robust Kommune extraction as in generateTender
        let kommune = locationName.split(',')[0].trim();
        kommune = kommune.replace(/^\d{5}\s+/, '');
        if (!kommune || /^\d+$/.test(kommune)) {
            const parts = locationName.split(',');
            kommune = parts[1] ? parts[1].trim() : 'Standort';
        }
        if (!kommune || kommune.length < 2) {
            kommune = 'Standort';
        }
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        generatedTenderPdf.save(`Ausschreibung_Zufahrtschutz_${kommune}_${date}.pdf`);
    } else {
        alert('Es wurde noch keine Ausschreibung erstellt, die heruntergeladen werden könnte.');
    }
}

/**
 * Generate tender (Ausschreibung) PDF using pinned products - Municipal-grade LV format
 */
async function generateTender() {

    const tenderIframe = document.getElementById('tender-iframe') as HTMLIFrameElement;
    const loadingOverlay = document.querySelector('.report-loading-overlay') as HTMLElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const tenderPreviewArea = document.getElementById('tender-preview-area') as HTMLElement;
    const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
    if (downloadTenderBtn) downloadTenderBtn.disabled = true;

    if (loadingOverlay) loadingOverlay.classList.remove('view-hidden');

    try {
        // Get products from persistent store
        const { useTenderSelection } = await import('./src/stores/useTenderSelection');
        const selectedProducts = useTenderSelection.getState().list();
        
        console.log(`📋 Tender generation: Store has ${selectedProducts.length} products`);
        
        if (selectedProducts.length === 0) {
            alert('Bitte pinnen Sie zuerst Produkte in der Produktauswahl an.');
            if (loadingOverlay) loadingOverlay.classList.add('view-hidden');
            return;
        }

        // Get location name
        const locationName = drawnPolygon ? await getReportLocationName(drawnPolygon.getBounds().getCenter()) : 'Standort';
        
        // Extract Kommune from location name with robust parsing
        // Nominatim format: e.g. "Münster, NRW, Deutschland" or "44147 Dortmund, Nordrhein-Westfalen, Deutschland"
        let kommune = locationName.split(',')[0].trim();
        // Remove leading postal codes if present (e.g. "44147 Dortmund" -> "Dortmund")
        kommune = kommune.replace(/^\d{5}\s+/, '');
        // If result is still numeric or empty, try second part
        if (!kommune || /^\d+$/.test(kommune)) {
            const parts = locationName.split(',');
            kommune = parts[1] ? parts[1].trim() : 'Standort';
        }
        // Fallback to reasonable default if still invalid
        if (!kommune || kommune.length < 2) {
            kommune = 'Standort';
        }
        
        // Extract date for filename
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // ==========================================
        // DATA EXTRACTION FROM BARRICADIX
        // ==========================================
        
        // 1. Project Meta (from runtime or defaults)
        const projectMeta = {
            KOMMUNE: kommune,
            AMT: 'Amt für öffentliche Sicherheit', // Default, can be enhanced
            STRASSEN_PLANGEBIET: locationName,
            VERFAHRENSNR: `V-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
            VERGABEART: 'UVgO Liefer-/Dienstleistung',
            LOS_NR: ['1'],
            KOSTENSTELLE: 'KST-001',
            ANSPRECHPARTNER: 'Mustermann, Max',
            KONTAKT: 'max.mustermann@kommune.de, Tel: 0231/123-456',
            DATUM_STAND: new Date().toLocaleDateString('de-DE')
        };
        
        // 2. Event data (from planning state or defaults)
        const planningState = (window as any).planningState || {};
        const event = {
            veranstaltung: planningState.schutzgüter || 'öffentliche Veranstaltung',
            zeitraum: 'Nach Vereinbarung',
            aufbau_ab: new Date().toLocaleDateString('de-DE'),
            abbau_bis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE'),
            erwartete_besucher: planningState.erwarteteBesucher || 'variabel',
            rettungswege: 'gemäß DIN 18040'
        };
        
        // 3. Extract Zufahrten from selected products
        const zufahrtenMap = new Map<string, any>();
        selectedProducts.forEach(sp => {
            if (!zufahrtenMap.has(sp.entryId)) {
                const threatData = threatsMap.get(sp.entryLabel);
                zufahrtenMap.set(sp.entryId, {
                    id: sp.entryId,
                    strasse_platz: sp.entryLabel,
                    nutzungsprofil: threatData?.roadType === 'residential' ? 'Anlieferung/Anwohner' : 'Hauptzufahrt',
                    freihaltebreite: 4.5, // Default, could be enhanced
                    radien: 6.0,
                    längsgefälle: 2.0,
                    untergrund: 'Asphalt/Beton',
                    medien_leitungslage: 'keine bekannt',
                    fluchtwegbezug: 'ja',
                    rettungsdienst: true,
                    räumfahrzeugbedarf: true
                });
            }
        });
        const zufahrten = Array.from(zufahrtenMap.values());
        
        // 4. Performance requirements per Zufahrt (from selected products)
        const performanceRequirements = new Map<string, any>();
        selectedProducts.forEach(sp => {
            const prod = sp.raw || {};
            const techData = prod.technical_data || {};
            
            // Calculate impact energy (simplified: E = 0.5 * m * v²)
            const vehicleMass = prod.pr_veh === 'K12' ? 6800 : prod.pr_veh === 'N2' ? 3500 : 2000; // kg
            const speedMs = (sp.requiredSpeedKmh / 3.6); // m/s
            const impactEnergy = 0.5 * vehicleMass * speedMs * speedMs / 1000; // kJ
            
            performanceRequirements.set(sp.entryId, {
                fahrzeugklasse: prod.pr_veh || techData.vehicle_type || 'K12',
                anprallgeschwindigkeit: sp.requiredSpeedKmh,
                anprallenergie: Math.round(impactEnergy),
                penetration: techData.penetration || prod.penetration || 0.5,
                restfahrzeuggeschwindigkeit: Math.round(sp.requiredSpeedKmh * 0.3), // 30% of impact speed
                öffnungsart: prod.type?.includes('motor') || prod.type?.includes('automatic') ? 'motorisch' : 'manuell',
                durchfahrtsbreite: techData.clear_width || 4.0,
                notentriegelung: true,
                schliesssystem: 'Profilzylinder',
                wartung: 'jährlich'
            });
        });
        
        // 5. Capture map screenshot if available
        let mapImage: string | undefined;
        if (mapDiv && drawnPolygon) {
            try {
                // Close all popups before screenshot
                if (map) {
                    map.closePopup();
                }
                
                // Hide all Leaflet popups and tooltips temporarily
                const leafletPanes = document.querySelectorAll('.leaflet-popup-pane, .leaflet-tooltip-pane');
                const originalDisplays: (string | null)[] = [];
                leafletPanes.forEach(pane => {
                    originalDisplays.push((pane as HTMLElement).style.display);
                    (pane as HTMLElement).style.display = 'none';
                });
                
                // Temporarily show map
                mapDiv.classList.remove('view-hidden');
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const canvas = await html2canvas(mapDiv, {
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    scale: 1,
                    width: mapDiv.offsetWidth,
                    height: mapDiv.offsetHeight
                });
                mapImage = canvas.toDataURL('image/png');
                
                mapDiv.classList.add('view-hidden');
                
                // Restore popups and tooltips
                leafletPanes.forEach((pane, idx) => {
                    (pane as HTMLElement).style.display = originalDisplays[idx] || '';
                });
            } catch (e) {
                console.warn('Could not capture map for tender:', e);
            }
        }
        
        // ==========================================
        // GENERATE PDF USING NEW MODULE
        // ==========================================
        const { createTenderPdf } = await import('./src/features/tender/createTenderPdf');
        const pdf = await createTenderPdf(
            projectMeta,
            event,
            zufahrten,
            performanceRequirements,
            selectedProducts,
            mapImage
        );

        // Display in iframe
        mapDiv.classList.add('view-hidden');
        if (tenderPreviewArea) {
            tenderPreviewArea.classList.remove('view-hidden');
        }
        
        const pdfBlob = pdf.output('blob');
        if (generatedTenderPdfUrl) {
            URL.revokeObjectURL(generatedTenderPdfUrl);
        }
        generatedTenderPdfUrl = URL.createObjectURL(pdfBlob);
        
        if (tenderIframe) {
            tenderIframe.src = generatedTenderPdfUrl;
        }
        
        generatedTenderPdf = pdf;
        console.log('✅ Municipal-grade tender PDF generated successfully');
        
        // Enable download button
        if (downloadTenderBtn) downloadTenderBtn.disabled = false;

    } catch (error) {
        console.error("Error generating tender:", error);
        alert('Fehler bei der Erstellung der Ausschreibung');
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('view-hidden');
    }
}

/**
 * Generate tender text using Gemini AI
 */
async function generateAITenderText(productSpecs: any[], locationName: string): Promise<string> {
    const isGithubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY) as string | undefined;
    
    if (!apiKey || isGithubPages) {
        console.warn('AI disabled - using fallback tender text');
        return generateFallbackTenderText(productSpecs, locationName);
    }

    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const ai = new GoogleGenerativeAI(apiKey);
        
        const specsSummary = productSpecs.map(spec => {
            return `${spec.streetName}: ${spec.maxSpeed} km/h, Standards: ${Array.isArray(spec.standards) ? spec.standards.join(', ') : spec.standards}`;
        }).join('\n');

        const prompt = `Als Ausschreibungsexperte erstelle einen herstellerneutral formulierten Ausschreibungstext für Zufahrtsicherungsbarrieren gemäß § 7 VgV (Vergabeverordnung) und § 34 GWB (Gesetz gegen Wettbewerbsbeschränkungen).

Die Ausschreibung soll folgende technische Anforderungen enthalten:
${specsSummary}

Standort: ${locationName}
Anzahl an Zufahrten: ${productSpecs.length}

Erstelle einen formellen, präzisen Ausschreibungstext mit folgenden Abschnitten:
1. Verfahrensart und Ausschreibung
2. Gegenstand der Ausschreibung
3. Umfang der Leistungen
4. Technische Anforderungen (ohne Hersteller- oder Produktnamen)
5. Zertifizierung und Normen
6. Leistungsbeschreibung
7. Unternehmensqualifikation

Der Text muss herstellerneutral sein und darf keine Produktnamen oder Herstellernamen enthalten.`;

        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        return text;
        
    } catch (error) {
        console.error('Error generating AI tender text:', error);
        return generateFallbackTenderText(productSpecs, locationName);
    }
}

/**
 * Generate fallback tender text without AI
 */
function generateFallbackTenderText(productSpecs: any[], locationName: string): string {
    return `
ÖFFENTLICHE AUSSCHREIBUNG
Zufahrtsicherung - ${locationName}

VERFAHRENSART
Öffentliche Ausschreibung nach VgV

GEGENSTAND
Errichtung von Zufahrtsicherungsbarrieren zur Gefahrenabwehr im öffentlichen Raum.

UMFANG DER LEISTUNGEN
${productSpecs.length} Zufahrtsicherungsanlagen an folgenden Standorten:
${productSpecs.map((spec, i) => `${i + 1}. ${spec.streetName}`).join('\n')}

TECHNISCHE ANFORDERUNGEN
- Mindestwiderstandsklasse: K12 (ASTM F2656-07)
- Getestete Geschwindigkeit: mindestens ${Math.max(...productSpecs.map(s => s.maxSpeed))} km/h
- Betriebstemperatur: -20°C bis +50°C
- Notabsenkung erforderlich
- Remote-Zugriff erforderlich
- Wartungsfreundliche Konstruktion

ZERTIFIZIERUNG
Alle Systeme müssen nach ASTM F2656-07 oder gleichwertigen Normen getestet sein.

LEISTUNGSBESCHREIBUNG
- Lieferung der kompletten Systeme
- Installation und Inbetriebnahme
- Schulung der Bedienkräfte
- Wartungsvertrag für 2 Jahre

UNTERNEHMENSQUALIFIKATION
- Nachweis der Fachkompetenz
- Referenzen im Sicherheitsbereich
- ISO 9001 Zertifizierung
`;
}

// ===============================================
// OSM SPEED LIMITS INTEGRATION
// ===============================================

/**
 * Initialize OSM speed limits functionality
 */
function initOsmSpeedLimits(): void {
    console.log('🗺️ Initializing OSM speed limits...');
    
    // Initialize with default config
    const defaultConfig: SpeedLimitConfig = {
        useMaxspeed: true,
        useTrafficCalming: true,
        useSurface: false,
        weather: 'dry' as WeatherCondition
    };
    
    osmSpeedLimiter = new OsmSpeedLimiter(defaultConfig);
    
    // Load settings from localStorage
    loadOsmSettings();
    
    // Set up event listeners for controls
    setupOsmEventListeners();
    
    console.log('✅ OSM speed limits initialized');
}

/**
 * Load OSM settings from localStorage
 */
function loadOsmSettings(): void {
    try {
        const maxspeedCheckbox = document.getElementById('osm-maxspeed') as HTMLInputElement;
        const calmingCheckbox = document.getElementById('osm-traffic-calming') as HTMLInputElement;
        const surfaceCheckbox = document.getElementById('osm-surface') as HTMLInputElement;
        const weatherSelect = document.getElementById('weather-select') as HTMLSelectElement;
        
        if (maxspeedCheckbox) {
            maxspeedCheckbox.checked = localStorage.getItem('osm-maxspeed') !== 'false';
        }
        if (calmingCheckbox) {
            calmingCheckbox.checked = localStorage.getItem('osm-traffic-calming') !== 'false';
        }
        if (surfaceCheckbox) {
            surfaceCheckbox.checked = localStorage.getItem('osm-surface') === 'true';
        }
        if (weatherSelect) {
            weatherSelect.value = localStorage.getItem('osm-weather') || 'dry';
        }
        
        updateOsmConfig();
    } catch (error) {
        console.warn('Failed to load OSM settings:', error);
    }
}

/**
 * Save OSM settings to localStorage
 */
function saveOsmSettings(): void {
    try {
        const maxspeedCheckbox = document.getElementById('osm-maxspeed') as HTMLInputElement;
        const calmingCheckbox = document.getElementById('osm-traffic-calming') as HTMLInputElement;
        const surfaceCheckbox = document.getElementById('osm-surface') as HTMLInputElement;
        const weatherSelect = document.getElementById('weather-select') as HTMLSelectElement;
        
        if (maxspeedCheckbox) {
            localStorage.setItem('osm-maxspeed', maxspeedCheckbox.checked.toString());
        }
        if (calmingCheckbox) {
            localStorage.setItem('osm-traffic-calming', calmingCheckbox.checked.toString());
        }
        if (surfaceCheckbox) {
            localStorage.setItem('osm-surface', surfaceCheckbox.checked.toString());
        }
        if (weatherSelect) {
            localStorage.setItem('osm-weather', weatherSelect.value);
        }
    } catch (error) {
        console.warn('Failed to save OSM settings:', error);
    }
}

/**
 * Set up event listeners for OSM controls
 */
function setupOsmEventListeners(): void {
    const maxspeedCheckbox = document.getElementById('osm-maxspeed') as HTMLInputElement;
    const calmingCheckbox = document.getElementById('osm-traffic-calming') as HTMLInputElement;
    const surfaceCheckbox = document.getElementById('osm-surface') as HTMLInputElement;
    const weatherSelect = document.getElementById('weather-select') as HTMLSelectElement;
    
    const handleOsmSettingChange = () => {
        updateOsmConfig();
        saveOsmSettings();
        
        // Trigger re-analysis if polygon exists
        if (drawnPolygon) {
            debouncedLoadOsmData();
        }
    };
    
    if (maxspeedCheckbox) {
        maxspeedCheckbox.addEventListener('change', handleOsmSettingChange);
    }
    if (calmingCheckbox) {
        calmingCheckbox.addEventListener('change', handleOsmSettingChange);
    }
    if (surfaceCheckbox) {
        surfaceCheckbox.addEventListener('change', handleOsmSettingChange);
    }
    if (weatherSelect) {
        weatherSelect.addEventListener('change', handleOsmSettingChange);
    }
}

// Global flag to prevent multiple parameter menu setups
let parameterMenuSetupComplete = false;

/**
 * UNIFIED Parameter Menu Handler - Single source of truth
 */
function setupUnifiedParameterMenu(): void {
    if (parameterMenuSetupComplete) {
        console.log('🔧 Parameter menu already set up, skipping...');
        return;
    }
    
    console.log('🔧 Setting up UNIFIED parameter menu...');
    
    const toggleBtn = document.getElementById('toggle-parameter-bubble') as HTMLButtonElement;
    const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
    const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
    const headerParameterBtn = document.getElementById('nav-param-input') as HTMLElement;
    const tabParameterBtn = document.getElementById('tab-param-input') as HTMLElement;
    
    console.log('🔧 Elements found:', {
        toggleBtn: !!toggleBtn,
        parameterBubble: !!parameterBubble,
        parameterStrip: !!parameterStrip,
        headerParameterBtn: !!headerParameterBtn,
        tabParameterBtn: !!tabParameterBtn
    });
    
    if (!parameterBubble || !parameterStrip) {
        console.warn('🔧 Critical parameter elements missing, retrying in 1s...');
        setTimeout(() => setupUnifiedParameterMenu(), 1000);
        return;
    }
    
    // Clone toggle button (if available) so we have a clean listener target
    let headerToggleBtn: HTMLButtonElement | null = null;
    if (toggleBtn) {
        headerToggleBtn = toggleBtn.cloneNode(true) as HTMLButtonElement;
        toggleBtn.parentNode?.replaceChild(headerToggleBtn, toggleBtn);
    }

    // Function to update icons based on bubble state
    const updateIcons = (isExpanded: boolean) => {
        const headerIcon = headerToggleBtn?.querySelector('i');
        if (headerIcon) {
            headerIcon.className = isExpanded ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
        }
        
        const stripIcon = parameterStrip.querySelector('i.fa-chevron-right, i.fa-chevron-left');
        if (stripIcon) {
            stripIcon.className = isExpanded ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
        }
    };
    
    // Function to collapse the bubble
    const collapseBubble = () => {
        console.log('🔧 Collapsing bubble - setting transform to translateX(-100%)');
        parameterBubble.style.transform = 'translateX(-100%)';
        parameterBubble.style.opacity = '0';
        // Hide bubble completely after transition
        setTimeout(() => {
            parameterBubble.style.visibility = 'hidden';
        }, 300); // Match transition duration
        // Ensure strip is visible
        parameterStrip.style.display = 'block';
        parameterStrip.style.visibility = 'visible';
        parameterStrip.style.opacity = '1';
        // Update icons to show collapsed state (chevron-right)
        updateIcons(false);
        console.log('🔧 Bubble collapsed - strip now visible, display:', parameterStrip.style.display);
    };
    
    // Function to expand the bubble
    const expandBubble = () => {
        console.log('🔧 Expanding bubble - setting transform to translateX(0)');
        // Make bubble visible first
        parameterBubble.style.visibility = 'visible';
        // Close hazard analysis bubble if open
        const hazardBubble = document.getElementById('hazard-analysis-bubble') as HTMLElement;
        const hazardStrip = document.getElementById('hazard-analysis-strip') as HTMLElement;
        if (hazardBubble && hazardStrip) {
            hazardBubble.style.transform = 'translateX(-100%)';
            hazardBubble.style.opacity = '0';
            setTimeout(() => {
                hazardBubble.style.visibility = 'hidden';
            }, 300);
            // Ensure hazard strip remains visible
            hazardStrip.style.display = 'block';
            hazardStrip.style.visibility = 'visible';
            hazardStrip.style.opacity = '1';
        }
        
        parameterBubble.style.transform = 'translateX(0)';
        parameterBubble.style.opacity = '1';
        // Keep parameter strip visible!
        parameterStrip.style.display = 'block';
        parameterStrip.style.visibility = 'visible';
        parameterStrip.style.opacity = '1';
        // Update icons to show expanded state (chevron-left)
        updateIcons(true);
        console.log('🔧 Bubble expanded - strip remains visible');
    };
    
    if (headerToggleBtn) {
        headerToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const stripVisible = parameterStrip.style.display === 'block' || window.getComputedStyle(parameterStrip).display !== 'none';
            const bubbleVisible = parameterBubble.style.opacity === '1' || window.getComputedStyle(parameterBubble).opacity === '1';
            const isCollapsed = stripVisible && !bubbleVisible;
            
            if (isCollapsed) {
                expandBubble();
            } else {
                collapseBubble();
            }
        });
    }
    
    // Strip click handler - toggle bubble (not just expand)
    parameterStrip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🔧 Strip clicked - toggling bubble');
        // Check if bubble is currently expanded
        const stripVisible = parameterStrip.style.display === 'block' || window.getComputedStyle(parameterStrip).display !== 'none';
        const bubbleVisible = parameterBubble.style.opacity === '1' || window.getComputedStyle(parameterBubble).opacity === '1';
        const isCollapsed = stripVisible && !bubbleVisible;
        
        if (isCollapsed) {
            console.log('🔧 Expanding bubble from strip');
            expandBubble();
        } else {
            console.log('🔧 Collapsing bubble from strip');
            collapseBubble();
        }
    });
    
    // Header "Parameter" button click handler to expand (both nav and tab versions)
    const expandBubbleHandler = (e: Event) => {
        e.preventDefault();
        console.log('🔧 Parameter button clicked - expanding bubble');
        expandBubble();
    };
    
    if (headerParameterBtn) {
        headerParameterBtn.addEventListener('click', expandBubbleHandler);
        console.log('🔧 Header Parameter button event listener added');
    } else {
        console.warn('🔧 Header Parameter button not found');
    }
    
    if (tabParameterBtn) {
        tabParameterBtn.addEventListener('click', expandBubbleHandler);
        console.log('🔧 Tab Parameter button event listener added');
    } else {
        console.warn('🔧 Tab Parameter button not found');
    }
    
    // Set initial state as collapsed
    console.log('🔧 Setting initial state as collapsed');
    collapseBubble();
    updateIcons(false);
    
    // ENHANCED expand function with multiple fallbacks (override the original)
    const enhancedExpandBubble = () => {
        console.log('🚀 ENHANCED EXPAND - Starting...');
        
        // Method 1: Direct style manipulation
        parameterBubble.style.setProperty('transform', 'translateX(0px)', 'important');
        parameterBubble.style.setProperty('opacity', '1', 'important');
        parameterBubble.style.setProperty('visibility', 'visible', 'important');
        parameterStrip.style.display = 'none';
        
        // Method 2: CSS classes
        parameterBubble.classList.add('parameter-expanded');
        parameterBubble.classList.remove('parameter-collapsed');
        
        console.log('🚀 ENHANCED EXPAND - Completed!');
        console.log('🚀 Final transform:', parameterBubble.style.transform);
        console.log('🚀 Final opacity:', parameterBubble.style.opacity);
    };
    
    // Override the original expandBubble function
    (window as any).expandParameterMenu = enhancedExpandBubble;
    (window as any).debugParameterMenu = () => {
        console.log('🔍 DEBUG Parameter Menu State:');
        console.log('🔍 Parameter Bubble:', parameterBubble);
        console.log('🔍 Parameter Strip:', parameterStrip);
        console.log('🔍 Toggle Button:', toggleBtn);
        console.log('🔍 Bubble Transform:', parameterBubble?.style.transform);
        console.log('🔍 Bubble Opacity:', parameterBubble?.style.opacity);
        console.log('🔍 Bubble Classes:', parameterBubble?.className);
        console.log('🔍 Strip Display:', parameterStrip?.style.display);
        
        console.log('🔧 Attempting manual expansion...');
        enhancedExpandBubble();
    };
    
    // Make the bubble draggable (optional enhancement)
    makeParameterBubbleDraggable(parameterBubble);
}

/**
 * Setup Hazard Analysis menu bubble (similar to parameter menu)
 */
function setupHazardAnalysisMenu(): void {
    console.log('🔧 Setting up Hazard Analysis menu...');
    
    const toggleBtn = document.getElementById('toggle-hazard-analysis-bubble') as HTMLButtonElement;
    const hazardBubble = document.getElementById('hazard-analysis-bubble') as HTMLElement;
    const hazardStrip = document.getElementById('hazard-analysis-strip') as HTMLElement;
    const headerHazardBtn = document.getElementById('nav-hazard-analysis') as HTMLElement;
    const tabHazardBtn = document.getElementById('tab-hazard-analysis') as HTMLElement;
    
    console.log('🔧 Hazard Analysis elements found:', {
        toggleBtn: !!toggleBtn,
        hazardBubble: !!hazardBubble,
        hazardStrip: !!hazardStrip,
        headerHazardBtn: !!headerHazardBtn,
        tabHazardBtn: !!tabHazardBtn
    });
    
    if (!hazardBubble || !hazardStrip) {
        console.warn('🔧 Critical hazard analysis elements missing, retrying in 1s...');
        setTimeout(() => setupHazardAnalysisMenu(), 1000);
        return;
    }
    
    // Set default values for hazard analysis inputs
    const setDefaultHazardValues = () => {
        // Default text inputs
        const cityInput = document.getElementById('hazard-city') as HTMLInputElement;
        const areaInput = document.getElementById('hazard-area') as HTMLInputElement;
        const damageSelect = document.getElementById('hazard-expected-damage') as HTMLSelectElement;
        
        if (cityInput && !cityInput.value) {
            cityInput.value = 'Recklinghausen';
        }
        if (areaInput && !areaInput.value) {
            areaInput.value = 'Weihnachtsmarkt';
        }
        if (damageSelect && !damageSelect.value) {
            damageSelect.value = 'leicht';
        }
        
        // Set all hazard factor selects to "1" (geringe Ausprägung) if not already set
        const hazardFactorIds = [
            'hazard-anlass-allgemeingebrauch',
            'hazard-anlass-sondernutzung',
            'hazard-anlass-haeufigkeit',
            'hazard-anlass-zusammensetzung',
            'hazard-anlass-anzahl',
            'hazard-raum-struktur',
            'hazard-raum-gebaeude',
            'hazard-raum-flucht-nutzer',
            'hazard-raum-flaeche',
            'hazard-raum-dichte',
            'hazard-security-bedeutung-raum',
            'hazard-security-massnahmen-baulich',
            'hazard-security-massnahmen-personell',
            'hazard-tat-anfahrtsoptionen',
            'hazard-tat-fluchtmoeglichkeiten',
            'hazard-tat-auswirkung',
            'hazard-tat-ziele',
            'hazard-tat-varianten'
        ];
        
        hazardFactorIds.forEach(factorId => {
            const selectEl = document.getElementById(factorId) as HTMLSelectElement;
            if (selectEl && !selectEl.value) {
                selectEl.value = '1';
            }
        });
        
        console.log('✅ Default hazard analysis values set');
    };
    
    // Set defaults immediately and also when bubble is expanded
    setDefaultHazardValues();
    
    // Remove any existing event listeners to prevent conflicts and create new toggle button reference
    let hazardToggleBtn: HTMLButtonElement | null = null;
    if (toggleBtn) {
        hazardToggleBtn = toggleBtn.cloneNode(true) as HTMLButtonElement;
        toggleBtn.parentNode?.replaceChild(hazardToggleBtn, toggleBtn);
    }
    
    // Function to update icons based on bubble state
    const updateIcons = (isExpanded: boolean) => {
        const toggleIcon = hazardToggleBtn?.querySelector('i');
        if (toggleIcon) {
            toggleIcon.className = isExpanded ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
        }
        
        // Update chevron icon in strip
        const stripChevron = hazardStrip.querySelector('i.fa-chevron-right, i.fa-chevron-left');
        if (stripChevron) {
            stripChevron.className = isExpanded ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
        }
    };
    
    // Function to collapse the bubble
    const collapseBubble = () => {
        console.log('🔧 Collapsing hazard analysis bubble');
        hazardBubble.style.transform = 'translateX(-100%)';
        hazardBubble.style.opacity = '0';
        // Hide bubble completely after transition
        setTimeout(() => {
            hazardBubble.style.visibility = 'hidden';
        }, 300); // Match transition duration
        // Ensure strip is visible and fully restored
        hazardStrip.style.display = 'block';
        hazardStrip.style.visibility = 'visible';
        hazardStrip.style.opacity = '1';
        // Update icons to show collapsed state (chevron-right)
        updateIcons(false);
        console.log('🔧 Hazard analysis bubble collapsed - strip now visible, display:', hazardStrip.style.display);
    };
    
    // Function to expand the bubble
    const expandBubble = () => {
        console.log('🔧 Expanding hazard analysis bubble');
        // Make bubble visible first
        hazardBubble.style.visibility = 'visible';
        // Close parameter bubble if open
        const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
        const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
        if (parameterBubble && parameterStrip) {
            parameterBubble.style.transform = 'translateX(-100%)';
            parameterBubble.style.opacity = '0';
            setTimeout(() => {
                parameterBubble.style.visibility = 'hidden';
            }, 300);
            // Ensure parameter strip remains visible
            parameterStrip.style.display = 'block';
            parameterStrip.style.visibility = 'visible';
            parameterStrip.style.opacity = '1';
        }
        
        hazardBubble.style.transform = 'translateX(0)';
        hazardBubble.style.opacity = '1';
        // Keep hazard strip visible!
        hazardStrip.style.display = 'block';
        hazardStrip.style.visibility = 'visible';
        hazardStrip.style.opacity = '1';
        // Update icons to show expanded state (chevron-left)
        updateIcons(true);
        
        // Set default values when bubble is expanded (in case they weren't set before)
        setTimeout(() => setDefaultHazardValues(), 100);
    };
    
    // Toggle button click handler (in bubble header)
    if (hazardToggleBtn) {
        hazardToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('🔧 Hazard Analysis toggle button clicked!');
            const stripVisible = hazardStrip.style.display === 'block' || window.getComputedStyle(hazardStrip).display !== 'none';
            const bubbleVisible = hazardBubble.style.opacity === '1' || window.getComputedStyle(hazardBubble).opacity === '1';
            const isCollapsed = stripVisible && !bubbleVisible;
            
            if (isCollapsed) {
                expandBubble();
            } else {
                collapseBubble();
            }
        });
    }
    
    // Strip click handler - toggle bubble (not just expand)
    hazardStrip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🔧 Hazard Analysis strip clicked - toggling bubble');
        // Check if bubble is currently expanded
        const stripVisible = hazardStrip.style.display === 'block' || window.getComputedStyle(hazardStrip).display !== 'none';
        const bubbleVisible = hazardBubble.style.opacity === '1' || window.getComputedStyle(hazardBubble).opacity === '1';
        const isCollapsed = stripVisible && !bubbleVisible;
        
        if (isCollapsed) {
            console.log('🔧 Expanding bubble from strip');
            expandBubble();
        } else {
            console.log('🔧 Collapsing bubble from strip');
            collapseBubble();
        }
    });
    
    // Header "Gefährdungsanalyse" button click handler to expand (both nav and tab versions)
    const expandBubbleHandler = (e: Event) => {
        e.preventDefault();
        console.log('🔧 Hazard Analysis button clicked - expanding bubble');
        expandBubble();
    };
    
    if (headerHazardBtn) {
        headerHazardBtn.addEventListener('click', expandBubbleHandler);
        console.log('🔧 Header Hazard Analysis button event listener added');
    } else {
        console.warn('🔧 Header Hazard Analysis button not found');
    }
    
    if (tabHazardBtn) {
        tabHazardBtn.addEventListener('click', expandBubbleHandler);
        console.log('🔧 Tab Hazard Analysis button event listener added');
    } else {
        console.warn('🔧 Tab Hazard Analysis button not found');
    }
    
    // Set initial state as collapsed
    console.log('🔧 Setting initial hazard analysis state as collapsed');
    collapseBubble();
}

/**
 * EMERGENCY FALLBACK: Simplified parameter menu setup that always works
 * This is the proven code from the manual console fix
 */
function setupEmergencyParameterMenuFallback(): void {
    console.log('🚨 Setting up EMERGENCY parameter menu fallback...');
    
    const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
    const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
    const navParamBtn = document.getElementById('nav-param-input') as HTMLElement;
    const tabParamBtn = document.getElementById('tab-param-input') as HTMLElement;
    
    if (!parameterBubble || !parameterStrip || !navParamBtn || !tabParamBtn) {
        console.warn('🚨 Emergency fallback: Missing elements, retrying in 2s...');
        setTimeout(() => setupEmergencyParameterMenuFallback(), 2000);
        return;
    }
    
    console.log('🚨 Emergency fallback: All elements found, setting up...');
    
    // Define expand function (proven working code)
    const emergencyExpandMenu = () => {
        console.log('🚀 EMERGENCY EXPAND');
        parameterBubble.style.setProperty('transform', 'translateX(0px)', 'important');
        parameterBubble.style.setProperty('opacity', '1', 'important');
        parameterBubble.style.setProperty('visibility', 'visible', 'important');
        parameterStrip.style.display = 'none';
        console.log('✅ Emergency menu expanded!');
    };
    
    // Define collapse function
    const emergencyCollapseMenu = () => {
        console.log('🔽 EMERGENCY COLLAPSE');
        parameterBubble.style.setProperty('transform', 'translateX(-100%)', 'important');
        parameterBubble.style.setProperty('opacity', '0', 'important');
        parameterStrip.style.display = 'block';
        console.log('✅ Emergency menu collapsed!');
    };
    
    // Remove existing event listeners by cloning (proven method)
    const newNavBtn = navParamBtn.cloneNode(true) as HTMLElement;
    const newTabBtn = tabParamBtn.cloneNode(true) as HTMLElement;
    const newStrip = parameterStrip.cloneNode(true) as HTMLElement;
    
    if (navParamBtn.parentNode) navParamBtn.parentNode.replaceChild(newNavBtn, navParamBtn);
    if (tabParamBtn.parentNode) tabParamBtn.parentNode.replaceChild(newTabBtn, tabParamBtn);
    if (parameterStrip.parentNode) parameterStrip.parentNode.replaceChild(newStrip, parameterStrip);
    
    // Add proven event listeners
    newNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎯 Emergency: Nav Parameter clicked');
        emergencyExpandMenu();
    });
    
    newTabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎯 Emergency: Tab Parameter clicked');
        emergencyExpandMenu();
    });
    
    newStrip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎯 Emergency: Strip clicked');
        emergencyExpandMenu();
    });
    
    // Make functions globally available for debugging
    (window as any).emergencyExpandMenu = emergencyExpandMenu;
    (window as any).emergencyCollapseMenu = emergencyCollapseMenu;
    (window as any).emergencyParameterMenuActive = true;
    
    // Set initial collapsed state
    emergencyCollapseMenu();
    
    console.log('✅ EMERGENCY parameter menu fallback setup complete!');
    console.log('✅ Available commands: emergencyExpandMenu(), emergencyCollapseMenu()');
}

/**
 * Make the parameter bubble draggable
 */
function makeParameterBubbleDraggable(bubble: HTMLElement): void {
    const header = bubble.querySelector('div[style*="cursor: move"]') as HTMLElement;
    if (!header) return;
    
    let isDragging = false;
    let currentX: number;
    let currentY: number;
    let initialX: number;
    let initialY: number;
    let xOffset = 0;
    let yOffset = 0;
    
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    
    function dragStart(e: MouseEvent) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        
        if (e.target === header || header.contains(e.target as Node)) {
            isDragging = true;
            header.style.cursor = 'grabbing';
        }
    }
    
    function dragMove(e: MouseEvent) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            xOffset = currentX;
            yOffset = currentY;
            
            // Constrain to viewport
            const rect = bubble.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;
            
            xOffset = Math.max(0, Math.min(maxX, xOffset));
            yOffset = Math.max(0, Math.min(maxY, yOffset));
            
            bubble.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        }
    }
    
    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        header.style.cursor = 'move';
    }
}

/**
 * Update OSM speed limiter configuration
 */
function updateOsmConfig(): void {
    if (!osmSpeedLimiter) return;
    
    const maxspeedCheckbox = document.getElementById('osm-maxspeed') as HTMLInputElement;
    const calmingCheckbox = document.getElementById('osm-traffic-calming') as HTMLInputElement;
    const surfaceCheckbox = document.getElementById('osm-surface') as HTMLInputElement;
    const weatherSelect = document.getElementById('weather-select') as HTMLSelectElement;
    
    const config: Partial<SpeedLimitConfig> = {
        useMaxspeed: maxspeedCheckbox?.checked ?? true,
        useTrafficCalming: calmingCheckbox?.checked ?? true,
        useSurface: surfaceCheckbox?.checked ?? false,
        weather: (weatherSelect?.value as WeatherCondition) ?? 'dry'
    };
    
    osmSpeedLimiter.updateConfig(config);
}

/**
 * Check if any OSM features are enabled
 */
function isOsmEnabled(): boolean {
    const maxspeedCheckbox = document.getElementById('osm-maxspeed') as HTMLInputElement;
    const calmingCheckbox = document.getElementById('osm-traffic-calming') as HTMLInputElement;
    const surfaceCheckbox = document.getElementById('osm-surface') as HTMLInputElement;
    
    return (maxspeedCheckbox?.checked) || (calmingCheckbox?.checked) || (surfaceCheckbox?.checked);
}

/**
 * Debounced OSM data loading
 */
function debouncedLoadOsmData(): void {
    if (osmDebounceTimeout) {
        clearTimeout(osmDebounceTimeout);
    }
    
    osmDebounceTimeout = window.setTimeout(() => {
        loadOsmDataForCurrentPolygon();
    }, 300);
}

/**
 * Load OSM data for the current polygon
 */
async function loadOsmDataForCurrentPolygon(): Promise<void> {
    if (!drawnPolygon || !osmSpeedLimiter || !isOsmEnabled()) {
        return;
    }
    
    try {
        // Extract polygon coordinates
        const polygonCoords = drawnPolygon.getLatLngs()[0].map((latlng: any) => ({
            lat: latlng.lat,
            lng: latlng.lng
        }));
        
        // Validate polygon has sufficient points
        if (polygonCoords.length < 3) {
            console.warn('Polygon has insufficient points for OSM query');
            updateOsmStatus('error', 'Polygon zu klein');
            return;
        }
        
        // Generate cache key
        const flagsKey = `${(document.getElementById('osm-maxspeed') as HTMLInputElement)?.checked ? 'M' : ''}${(document.getElementById('osm-traffic-calming') as HTMLInputElement)?.checked ? 'C' : ''}${(document.getElementById('osm-surface') as HTMLInputElement)?.checked ? 'S' : ''}`;
        const cacheKey = osmCache.getKey(polygonCoords, flagsKey);
        
        // Check cache first
        const cachedData = osmCache.get(cacheKey);
        if (cachedData) {
            console.log('📋 Using cached OSM data');
            currentOsmData = cachedData;
            osmSpeedLimiter.setOsmData(cachedData);
            updateOsmStatus('success', `${cachedData.ways.length} Straßen, ${cachedData.calming.length} Verkehrsberuhiger`);
            return;
        }
        
        // Show loading status
        updateOsmStatus('loading', 'Lade OSM-Daten...');
        
        // Cancel previous request
        if (osmLoadingController) {
            osmLoadingController.abort();
        }
        osmLoadingController = new AbortController();
        
        // Fetch new data with error handling using provider abstraction
        try {
        console.log('🔄 Starting data fetch with provider system...');
        
        // Try to use provider system, fallback to original OSM if not available
        let osmData: OsmBundle;
        try {
            const { fetchOsmDataWithProvider } = await import('./src/core/geodata/integration/indexIntegration.js');
            osmData = await fetchOsmDataWithProvider(polygonCoords, osmLoadingController.signal);
            console.log('✅ Data fetch completed successfully with provider system');
            
            // Log which provider was used
            const { getCurrentProviderId } = await import('./src/core/geodata/integration/mapIntegration.js');
            const providerId = getCurrentProviderId();
            console.log(`🗺️ Data loaded from ${providerId === 'nrw' ? 'GEOBASIS.NRW' : 'OpenStreetMap'} provider`);
        } catch (providerError) {
            console.warn('⚠️ Provider system not available, falling back to original OSM:', providerError);
            osmData = await fetchOsmBundleForPolygon(polygonCoords, osmLoadingController.signal);
            console.log('✅ Data fetch completed with original OSM');
        }
        
        // Cache the result
        osmCache.set(cacheKey, osmData);
        console.log('💾 Data cached successfully');
        
        // Update global state
        currentOsmData = osmData;
        osmSpeedLimiter.setOsmData(osmData);
        console.log('🔄 Global state updated');
        } catch (error) {
            console.error('OSM Data Loading Error:', error);
            updateOsmStatus('error', error instanceof Error ? error.message : 'Fehler beim Laden der OSM-Daten');
            return;
        }
        
        // Log statistics
        const maxspeedWays = currentOsmData.ways.filter(w => w.tags.maxspeed).length;
        console.log(`📊 OSM Data loaded: ${currentOsmData.ways.length} ways (${maxspeedWays} with maxspeed), ${currentOsmData.calming.length} traffic calming nodes`);
        
        updateOsmStatus('success', `${currentOsmData.ways.length} Straßen, ${currentOsmData.calming.length} Verkehrsberuhiger`);
        
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.log('OSM request cancelled');
            return;
        }
        
        console.error('Failed to load OSM data:', error);
        updateOsmStatus('error', 'OSM-Daten nicht verfügbar');
        
        // No automatic retry to prevent endless loops
        // User can manually retry by changing settings or redrawing polygon
    }
}

/**
 * Update OSM status indicator
 */
function updateOsmStatus(status: 'loading' | 'success' | 'error', message: string): void {
    const statusElement = document.getElementById('osm-status');
    const statusText = statusElement?.querySelector('.status-text');
    
    if (!statusElement || !statusText) return;
    
    statusElement.className = `osm-status ${status}`;
    statusElement.style.display = 'flex';
    statusText.textContent = message;
    
    // Auto-hide success/error messages after 5 seconds
    if (status !== 'loading') {
        setTimeout(() => {
            if (statusElement.classList.contains(status)) {
                statusElement.style.display = 'none';
            }
        }, 5000);
    }
}

/**
 * Enhanced velocity calculation with OSM constraints
 */
function calculateVelocityWithOsm(acceleration: number, distance: number, pathCoords?: Array<{lat: number; lng: number}>): number {
    // Base calculation
    const baseVelocity = calculateVelocity(acceleration, distance);
    
    // Apply OSM constraints if available
    if (osmSpeedLimiter && currentOsmData && pathCoords && pathCoords.length > 0) {
        let minConstrainedVelocity = baseVelocity;
        
        // Sample points along the path
        const sampleCount = Math.min(10, pathCoords.length);
        const step = Math.max(1, Math.floor(pathCoords.length / sampleCount));
        
        for (let i = 0; i < pathCoords.length; i += step) {
            const point = pathCoords[i];
            const constraints = osmSpeedLimiter.getConstraintsAt(point);
            
            // Calculate curvature radius if we have enough points
            let curvatureRadius: number | undefined;
            if (i > 0 && i < pathCoords.length - 1) {
                const prev = pathCoords[i - 1];
                const next = pathCoords[i + 1];
                // Simple curvature approximation - could be improved
                const angle1 = Math.atan2(point.lat - prev.lat, point.lng - prev.lng);
                const angle2 = Math.atan2(next.lat - point.lat, next.lng - point.lng);
                const angleDiff = Math.abs(angle2 - angle1);
                if (angleDiff > 0.01) { // Avoid division by very small numbers
                    curvatureRadius = 1 / angleDiff * 1000; // Rough approximation in meters
                }
            }
            
            const constrainedVelocity = osmSpeedLimiter.applyConstraints(
                baseVelocity,
                constraints,
                curvatureRadius
            );
            
            minConstrainedVelocity = Math.min(minConstrainedVelocity, constrainedVelocity);
        }
        
        return minConstrainedVelocity;
    }
    
    return baseVelocity;
}

/**
 * Get heuristic speed limit based on OSM highway type
 * Returns speed in km/h based on typical speed limits for each road type
 * @param highwayTypes Array of highway type tags from OSM ways
 * @returns Minimum speed limit from all highway types, or undefined if none recognized
 */
function getSpeedLimitForHighwayType(highwayTypes: string[]): number | undefined {
    const typeSpeedMap: Record<string, number> = {
        // Residential and low-speed zones
        'living_street': 10,     // Verkehrsberuhigter Bereich
        'residential': 30,       // Wohnstraße (typically 30 km/h in Germany)
        'service': 20,          // Zufahrtsstraße (parking lots, driveways)
        'track': 15,            // Feldweg, landwirtschaftlicher Weg
        'path': 10,             // Fußweg (rarely for vehicles)
        'footway': 10,          // Gehweg
        'pedestrian': 10,       // Fußgängerzone (Schrittgeschwindigkeit)

        // Urban roads
        'unclassified': 50,     // Nebenstraße ohne spezielle Klassifikation
        'tertiary': 50,         // Kreisstraße (typically 50 km/h in cities)
        'tertiary_link': 40,    // Verbindungsstraße
        'secondary': 50,        // Landesstraße in Ortslage
        'secondary_link': 40,   // Verbindungsstraße
        'primary': 50,          // Bundesstraße in Ortslage
        'primary_link': 40,     // Verbindungsstraße

        // Rural and high-speed roads
        'trunk': 80,            // Autobahnähnliche Schnellstraße
        'trunk_link': 60,       // Auf-/Abfahrt
        'motorway': 100,        // Autobahn (no specific limit in Germany, but realistic for barrier planning)
        'motorway_link': 60,    // Autobahnauf-/abfahrt

        // Special cases
        'busway': 40,           // Busspur
        'bus_guideway': 40,     // Spurgeführter Bus
        'road': 50,             // Unbekannter Typ → konservativ 50 km/h
    };

    if (!highwayTypes || highwayTypes.length === 0) {
        return undefined;
    }

    // Find all recognized speeds
    const recognizedSpeeds: number[] = [];
    for (const type of highwayTypes) {
        const speed = typeSpeedMap[type];
        if (speed !== undefined) {
            recognizedSpeeds.push(speed);
        }
    }

    // Return minimum (most restrictive) speed
    if (recognizedSpeeds.length > 0) {
        return Math.min(...recognizedSpeeds);
    }

    return undefined;
}

/**
 * Fallback heuristic: estimate realistic speed based on distance
 * Used when no OSM data is available
 * @param distanceMeters Length of the entry path in meters
 * @returns Estimated speed limit in km/h
 */
function calculateDistanceBasedReduction(distanceMeters: number): number {
    // Very short distances → likely driveways or parking lot entrances
    // Minimum 25 km/h to ensure products are available
    if (distanceMeters < 30) return 25;

    // Short distances → likely residential street entrances
    if (distanceMeters < 50) return 30;

    // Medium short distances → neighborhood streets
    if (distanceMeters < 100) return 40;

    // Medium distances → urban roads
    if (distanceMeters < 200) return 50;

    // Longer distances → could be rural or faster roads
    return 60;
}

/**
 * Extract all OSM-based speed constraints for an entry candidate
 * Collects maxspeed tags, highway types, and traffic calming from OSM data
 * @param candidate The entry candidate to analyze
 * @param osmData OSM bundle with ways and traffic calming nodes
 * @param osmSpeedLimiter Speed limiter instance for constraint checking
 * @returns Object containing all found speed constraints
 */
function getSpeedConstraintsForEntryCandidate(
    candidate: EntryCandidate,
    osmData: OsmBundle | null,
    osmSpeedLimiter: OsmSpeedLimiter | null
): {
    maxspeedLimit?: number;
    highwayTypeLimit?: number;
    trafficCalmingLimit?: number;
    hasConstraints: boolean;
} {
    const result: {
        maxspeedLimit?: number;
        highwayTypeLimit?: number;
        trafficCalmingLimit?: number;
        hasConstraints: boolean;
    } = {
        hasConstraints: false
    };

    if (!osmData) {
        return result;
    }

    // 1. Extract maxspeed tags from candidate's wayIds
    const maxspeedValues: number[] = [];
    for (const wayId of candidate.wayIds) {
        const way = osmData.ways.find(w => w.id === wayId);
        if (way?.tags.maxspeed) {
            const speed = parseMaxspeed(way.tags.maxspeed);
            if (speed !== undefined) {
                maxspeedValues.push(speed);
            }
        }
    }

    if (maxspeedValues.length > 0) {
        result.maxspeedLimit = Math.min(...maxspeedValues);
        result.hasConstraints = true;
    }

    // 2. Sample points along candidate path for osmSpeedLimiter constraints
    if (osmSpeedLimiter && candidate.path.geometry.coordinates.length > 0) {
        const coords = candidate.path.geometry.coordinates;
        const sampleCount = Math.min(10, coords.length);
        const step = Math.max(1, Math.floor(coords.length / sampleCount));

        let minTrafficCalmingSpeed: number | undefined;

        for (let i = 0; i < coords.length; i += step) {
            const [lng, lat] = coords[i];
            const constraints = osmSpeedLimiter.getConstraintsAt({ lat, lng });

            // Check for traffic calming
            if (constraints.trafficCalming) {
                const calmingSpeed = constraints.trafficCalming.type === 'bump' ? 20 :
                                    constraints.trafficCalming.type === 'hump' ? 30 :
                                    constraints.trafficCalming.type === 'table' ? 20 :
                                    constraints.trafficCalming.type === 'chicane' ? 30 :
                                    constraints.trafficCalming.type === 'choker' ? 30 :
                                    25; // Default for unknown types

                if (minTrafficCalmingSpeed === undefined || calmingSpeed < minTrafficCalmingSpeed) {
                    minTrafficCalmingSpeed = calmingSpeed;
                }
            }
        }

        if (minTrafficCalmingSpeed !== undefined) {
            result.trafficCalmingLimit = minTrafficCalmingSpeed;
            result.hasConstraints = true;
        }
    }

    // 3. Extract highway types from candidate's wayIds
    const highwayTypes: string[] = [];
    for (const wayId of candidate.wayIds) {
        const way = osmData.ways.find(w => w.id === wayId);
        if (way?.tags.highway) {
            highwayTypes.push(way.tags.highway);
        }
    }

    if (highwayTypes.length > 0) {
        const highwayLimit = getSpeedLimitForHighwayType(highwayTypes);
        if (highwayLimit !== undefined) {
            result.highwayTypeLimit = highwayLimit;
            result.hasConstraints = true;
        }
    }

    return result;
}

/**
 * Calculate realistic speed for an entry candidate
 * Combines OSM constraints, highway types, traffic calming, and physical limits
 * Uses 75% of max acceleration instead of 100% for more realistic scenarios
 * @param candidate The entry candidate to analyze
 * @param accelerationRange [min, max] acceleration range for vehicle type
 * @param osmData OSM bundle with ways and traffic calming nodes
 * @param osmSpeedLimiter Speed limiter instance
 * @returns Object with calculated speed and reasoning
 */
function calculateRealisticSpeedForEntry(
    candidate: EntryCandidate,
    accelerationRange: [number, number],
    osmData: OsmBundle | null,
    osmSpeedLimiter: OsmSpeedLimiter | null
): { speed: number; reasoning: string } {
    // 1. Get OSM constraints
    const constraints = getSpeedConstraintsForEntryCandidate(candidate, osmData, osmSpeedLimiter);

    // 2. Calculate physical limit with 75% of max acceleration (more realistic)
    const realisticAcceleration = accelerationRange[0] +
        (accelerationRange[1] - accelerationRange[0]) * 0.75;

    const accelerationDistance = Math.max(candidate.distanceMeters, 100);
    const physicalLimit = calculateVelocity(realisticAcceleration, accelerationDistance);

    // 3. Apply constraints in priority order
    let finalSpeed = physicalLimit;
    let reasoning = `Physical limit: ${Math.round(physicalLimit)} km/h (75% acceleration over ${Math.round(candidate.distanceMeters)}m)`;

    // Priority 1: OSM maxspeed (most authoritative)
    if (constraints.maxspeedLimit !== undefined) {
        finalSpeed = Math.min(finalSpeed, constraints.maxspeedLimit);
        reasoning = `OSM maxspeed: ${constraints.maxspeedLimit} km/h`;
    }
    // Priority 2: Traffic calming (strong indicator of low speeds)
    else if (constraints.trafficCalmingLimit !== undefined) {
        finalSpeed = Math.min(finalSpeed, constraints.trafficCalmingLimit);
        reasoning = `Traffic calming: ${constraints.trafficCalmingLimit} km/h`;
    }
    // Priority 3: Highway type heuristic
    else if (constraints.highwayTypeLimit !== undefined) {
        finalSpeed = Math.min(finalSpeed, constraints.highwayTypeLimit);
        reasoning = `Highway type: ${constraints.highwayTypeLimit} km/h`;
    }
    // Fallback: Distance-based heuristic
    else if (!constraints.hasConstraints) {
        const distanceLimit = calculateDistanceBasedReduction(candidate.distanceMeters);
        finalSpeed = Math.min(finalSpeed, distanceLimit);
        reasoning = `Distance-based: ${distanceLimit} km/h (no OSM data)`;
    }

    // 4. Apply safety margin for very short distances
    if (candidate.distanceMeters < 100) {
        const safetyFactor = 0.85; // 15% reduction
        const speedBeforeSafety = finalSpeed;
        const speedWithMargin = Math.round(finalSpeed * safetyFactor);
        // Only apply margin if result is still reasonable (>= 20 km/h)
        if (speedWithMargin >= 20) {
            finalSpeed = speedWithMargin;
            reasoning += ` → ${finalSpeed} km/h (15% safety margin for short distance)`;
        } else {
            finalSpeed = Math.round(finalSpeed);
        }
    } else {
        finalSpeed = Math.round(finalSpeed);
    }

    // 5. Ensure minimum speed (realistic for HVM products)
    // Most HVM products start at 20-25 km/h, so use 20 as absolute minimum
    finalSpeed = Math.max(finalSpeed, 20);

    return {
        speed: finalSpeed,
        reasoning: reasoning
    };
}

// ===============================================
// ENTRY DETECTION INTEGRATION
// ===============================================
// Entry Detection is now integrated into the existing "Zufahrt analysieren" button
// No separate UI setup needed - functionality is triggered automatically

/**
 * Fügt Entry Detection Ergebnisse zur Threat List hinzu
 */
function addEntryDetectionResultsToThreatList(threatList: HTMLOListElement): void {
    const manager = (window as any).entryDetectionManager;
    if (!manager || !manager.candidates || manager.candidates.length === 0) {
        return;
    }
    
    // Erstelle Header für Entry Detection Ergebnisse
    const headerLi = document.createElement('li');
    headerLi.className = 'entry-detection-header';
    headerLi.style.cssText = `
        background: linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(74, 222, 128, 0.05));
        border-left: 4px solid #4ade80;
        font-weight: 600;
        color: #4ade80;
        margin-top: 16px;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: default;
    `;
    headerLi.innerHTML = `
        <i class="fas fa-door-open" style="margin-right: 8px;"></i>
        Zufahrtserkennung (${manager.candidates.length} gefunden)
    `;
    threatList.appendChild(headerLi);
    
    // Get OSM data to check for Erschließungsstraßen
    const osmData = (window as any).currentOsmData;
    const waysMap = new Map();
    
    if (osmData && osmData.ways) {
        osmData.ways.forEach((way: any) => {
            waysMap.set(way.id, way);
        });
    }
    
    // Füge jeden Entry Candidate hinzu
    manager.candidates.forEach((candidate: any, index: number) => {
        // Check if this candidate uses Erschließungsstraßen
        let isErschliessung = false;
        
        if (candidate.wayIds && candidate.wayIds.length > 0) {
            for (const wayId of candidate.wayIds) {
                const way = waysMap.get(wayId);
                if (way && isErschliessungsstrasse(way)) {
                    isErschliessung = true;
                    break;
                }
            }
        }
        
        const li = document.createElement('li');
        li.className = 'entry-candidate-item';
        
        const confidenceColor = candidate.confidence >= 0.7 ? '#4ade80' : 
                               candidate.confidence >= 0.4 ? '#fbbf24' : '#f87171';
        
        // Different border color for Erschließungsstraßen
        const borderColor = isErschliessung ? '#FFD700' : confidenceColor;
        
        li.style.cssText = `
            background: rgba(255, 255, 255, 0.05);
            border-left: 3px solid ${borderColor};
            margin: 4px 0;
            padding: 12px 16px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 600; color: white;">
                    ${isErschliessung ? '🏠' : '🚗'} Zufahrt ${index + 1} ${isErschliessung ? '(Erschließung)' : ''}
                </span>
                <span style="background: rgba(255, 255, 255, 0.2); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: ${confidenceColor};">
                    ${Math.round(candidate.confidence * 100)}% Confidence
                </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 11px; color: #ccc;">
                <div>
                    <div style="color: #aaa; font-size: 10px; margin-bottom: 2px;">Distanz:</div>
                    <div style="font-weight: 600; color: white;">${Math.round(candidate.distanceMeters)}m</div>
                </div>
                <div>
                    <div style="color: #aaa; font-size: 10px; margin-bottom: 2px;">Geradheit:</div>
                    <div style="font-weight: 600; color: white;">${Math.round(candidate.straightness * 100)}%</div>
                </div>
                <div>
                    <div style="color: #aaa; font-size: 10px; margin-bottom: 2px;">Kontinuität:</div>
                    <div style="font-weight: 600; color: white;">${Math.round(candidate.continuity * 100)}%</div>
                </div>
            </div>
        `;
        
        // Hover-Effekt
        li.addEventListener('mouseenter', () => {
            li.style.background = 'rgba(255, 255, 255, 0.1)';
            li.style.transform = 'translateX(4px)';
        });
        
        li.addEventListener('mouseleave', () => {
            li.style.background = 'rgba(255, 255, 255, 0.05)';
            li.style.transform = 'translateX(0)';
        });
        
        // Click-Handler für Marker-Zoom (falls implementiert)
        li.addEventListener('click', () => {
            console.log(`Entry Candidate ${index + 1} clicked:`, candidate);
            // Hier könnte man zu dem Entry Point zoomen oder weitere Details anzeigen
        });
        
        threatList.appendChild(li);
    });
}

// ===============================================
// EVENT LISTENERS & INITIALIZATION
// ===============================================
// This initialization function will be called after authentication
async function initializeApp() {
    console.log('🔥🔥🔥 INITIALIZE APP CALLED 🔥🔥🔥');
    console.log('🚀 INITIALIZE APP CALLED!');
    
    // Initialize Entry Detection System
    console.log('🔧 Initializing Entry Detection System...');
    integrateEntryDetectionWithExistingOSM();
    addEntryDetectionStyles();
    
    // Entry Detection is now integrated into the existing "Zufahrt analysieren" button
    
    // DEBUG: List all elements with IDs immediately
    console.log('🔍 DEBUG: All elements with IDs at app start:', 
        Array.from(document.querySelectorAll('[id]')).map(el => ({
            id: el.id,
            tagName: el.tagName,
            className: el.className,
            visible: window.getComputedStyle(el).display !== 'none'
        }))
    );
    
    // Step 1: Initialize basic UI components
    console.log('🔥 About to call initViewSwitcher from initializeApp...');
    initViewSwitcher();
    console.log('🔥 About to call initOpenStreetMap...');
    await initOpenStreetMap();
    console.log('🔥 About to initialize OSM speed limits...');
    initOsmSpeedLimits();
    
    // Step 2: Load translations with retry mechanism
    let translationLoadAttempts = 0;
    const maxAttempts = 3;
    
    while (translationLoadAttempts < maxAttempts && (!translations.de || !translations.en)) {
        console.log(`Translation load attempt ${translationLoadAttempts + 1}/${maxAttempts}`);
        await loadTranslations();
        translationLoadAttempts++;
        
        if (translationLoadAttempts < maxAttempts && (!translations.de || !translations.en)) {
            console.log('Waiting 500ms before retry...');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // Step 3: Ensure we have translations available
    if (!translations.de || !translations.en) {
        console.warn('Failed to load translations from file, using embedded translations');
        translations = embeddedTranslations;
    }
    
    // Step 4: Set language and translate UI
    currentLanguage = 'de';
    console.log('Translating UI...');
    await translateUI();
    
    // Step 5: Additional translations
    translateChatbot();
    
    // Step 6: Set saved language if different
    const savedLang = localStorage.getItem('language') || 'de';
    if (savedLang !== currentLanguage) {
        console.log(`Setting saved language: ${savedLang}`);
        await setLanguage(savedLang);
    }

    // Step 7: Add event listeners
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const lang = (event.currentTarget as HTMLElement).dataset.lang;
            if (lang && lang !== currentLanguage) {
                setLanguage(lang);
            }
        });
    });
    
    console.log('Initialization completed successfully');
    
    // Rest of the event listeners...
    const tooltip = document.getElementById('tooltip') as HTMLElement;
    const infoIcons = document.querySelectorAll('.info-icon');
    infoIcons.forEach(icon => {
        const el = icon as HTMLElement;
        
        const showTooltip = () => {
            const tooltipText = el.dataset.tooltip || '';
            tooltip.textContent = tooltipText;
            tooltip.style.opacity = '1';
            const rect = el.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
        };
        
        const hideTooltip = () => {
            tooltip.style.opacity = '0';
        };
        
        el.addEventListener('mouseover', showTooltip);
        el.addEventListener('mouseout', hideTooltip);
        
        // Click toggle functionality for mobile/touch and accessibility
        el.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (tooltip.style.opacity === '1' && tooltip.textContent === (el.dataset.tooltip || '')) {
                hideTooltip();
            } else {
                showTooltip();
            }
        });
    });
    
    const searchInput = document.getElementById('map-search-input') as HTMLInputElement;
    if (searchInput && !searchInput.value) {
        searchInput.value = t('map.searchPlaceholder');
    }
    const searchButton = document.getElementById('map-search-button') as HTMLButtonElement;
    const toggleSidebarBtn = document.getElementById('toggle-sidebar') as HTMLButtonElement | null;
    const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null;
    
    // Setup UNIFIED parameter menu functionality
    console.log('🔧 About to call setupUnifiedParameterMenu...');
    setTimeout(() => {
        setupUnifiedParameterMenu();
    }, 500);
    
    // Setup Hazard Analysis menu functionality
    console.log('🔧 About to call setupHazardAnalysisMenu...');
    setTimeout(() => {
        setupHazardAnalysisMenu();
    }, 600);
    
    // EMERGENCY FALLBACK: Ensure parameter menu works even if main setup fails
    setTimeout(() => {
        setupEmergencyParameterMenuFallback();
    }, 1000);
    
    // Helper function to collapse hazard analysis bubble
    const collapseHazardAnalysisBubble = () => {
        const hazardBubble = document.getElementById('hazard-analysis-bubble') as HTMLElement;
        const hazardStrip = document.getElementById('hazard-analysis-strip') as HTMLElement;
        
        if (hazardBubble && hazardStrip) {
            console.log('🔧 Collapsing hazard analysis bubble');
            hazardBubble.style.transform = 'translateX(-100%)';
            hazardBubble.style.opacity = '0';
            setTimeout(() => {
                hazardBubble.style.visibility = 'hidden';
            }, 300);
            hazardStrip.style.display = 'block';
            hazardStrip.style.visibility = 'visible';
            hazardStrip.style.opacity = '1';
            
            const toggleBtn = document.getElementById('toggle-hazard-analysis-bubble');
            const icon = toggleBtn?.querySelector('i');
            if (icon) icon.className = 'fas fa-chevron-right';
        }
    };
    
    // Helper function to collapse parameter bubble
    const collapseParameterBubble = () => {
        const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
        const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
        
        if (parameterBubble && parameterStrip) {
            console.log('🔧 Collapsing parameter bubble');
            parameterBubble.style.transform = 'translateX(-100%)';
            parameterBubble.style.opacity = '0';
            setTimeout(() => {
                parameterBubble.style.visibility = 'hidden';
            }, 300);
            parameterStrip.style.display = 'block';
            parameterStrip.style.visibility = 'visible';
            parameterStrip.style.opacity = '1';
            
            const toggleBtn = document.getElementById('toggle-parameter-bubble');
            const icon = toggleBtn?.querySelector('i');
            if (icon) icon.className = 'fas fa-chevron-right';
        }
    };
    
    // Ultimate fallback: Monitor for Parameter button clicks globally
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const isParameterButton = target.id === 'nav-param-input' || 
                                 target.id === 'tab-param-input' ||
                                 target.closest('#nav-param-input') ||
                                 target.closest('#tab-param-input');
        
        if (isParameterButton) {
            console.log('🔧 GLOBAL: Parameter button detected - expanding bubble');
            setTimeout(() => {
                const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
                const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
                
                // Close hazard analysis bubble if open
                collapseHazardAnalysisBubble();
                
                if (parameterBubble && parameterStrip) {
                    parameterBubble.style.visibility = 'visible';
                    parameterBubble.style.transform = 'translateX(0)';
                    parameterBubble.style.opacity = '1';
                    // Keep parameter strip visible!
                    parameterStrip.style.display = 'block';
                    parameterStrip.style.visibility = 'visible';
                    parameterStrip.style.opacity = '1';
                    
                    const toggleBtn = document.getElementById('toggle-parameter-bubble');
                    const icon = toggleBtn?.querySelector('i');
                    if (icon) icon.className = 'fas fa-chevron-left';
                    
                    console.log('🔧 GLOBAL: Bubble expanded successfully');
                }
            }, 100);
        }
        
        // Handle Hazard Analysis button clicks
        const isHazardButton = target.id === 'nav-hazard-analysis' || 
                             target.id === 'tab-hazard-analysis' ||
                             target.closest('#nav-hazard-analysis') ||
                             target.closest('#tab-hazard-analysis');
        
        if (isHazardButton) {
            console.log('🔧 GLOBAL: Hazard Analysis button detected - expanding bubble');
            setTimeout(() => {
                const hazardBubble = document.getElementById('hazard-analysis-bubble') as HTMLElement;
                const hazardStrip = document.getElementById('hazard-analysis-strip') as HTMLElement;
                
                // Close parameter bubble if open
                collapseParameterBubble();
                
                if (hazardBubble && hazardStrip) {
                    hazardBubble.style.visibility = 'visible';
                    hazardBubble.style.transform = 'translateX(0)';
                    hazardBubble.style.opacity = '1';
                    // Keep hazard strip visible!
                    hazardStrip.style.display = 'block';
                    hazardStrip.style.visibility = 'visible';
                    hazardStrip.style.opacity = '1';
                    
                    const toggleBtn = document.getElementById('toggle-hazard-analysis-bubble');
                    const icon = toggleBtn?.querySelector('i');
                    if (icon) icon.className = 'fas fa-chevron-left';
                    
                    console.log('🔧 GLOBAL: Hazard Analysis bubble expanded successfully');
                }
            }, 100);
        }
        
        // Handle other tab clicks (marking area, threat analysis, risk report, etc.) - collapse both bubbles
        const isOtherTabButton = target.id === 'nav-marking-area' || 
                                 target.id === 'tab-marking-area' ||
                                 target.id === 'nav-threat-analysis' ||
                                 target.id === 'tab-threat-analysis' ||
                                 target.id === 'nav-risk-report' ||
                                 target.id === 'tab-risk-report' ||
                                 target.id === 'nav-product-selection' ||
                                 target.id === 'tab-product-selection' ||
                                 target.id === 'nav-project-description' ||
                                 target.id === 'tab-project-description' ||
                                 target.id === 'nav-publish-project' ||
                                 target.closest('#nav-marking-area') ||
                                 target.closest('#tab-marking-area') ||
                                 target.closest('#nav-threat-analysis') ||
                                 target.closest('#tab-threat-analysis') ||
                                 target.closest('#nav-risk-report') ||
                                 target.closest('#tab-risk-report') ||
                                 target.closest('#nav-product-selection') ||
                                 target.closest('#tab-product-selection') ||
                                 target.closest('#nav-project-description') ||
                                 target.closest('#tab-project-description') ||
                                 target.closest('#nav-publish-project');
        
        if (isOtherTabButton) {
            console.log('🔧 GLOBAL: Other tab button detected - collapsing both bubbles');
            collapseHazardAnalysisBubble();
            collapseParameterBubble();
        }
    }, true); // Use capture phase
    
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
                
                // Remove existing search marker
                if (searchMarker) {
                    map.removeLayer(searchMarker);
                    searchMarker = null;
                }
                
                // Create new search marker with proper icon
                const searchIcon = L.divIcon({
                    className: 'search-marker',
                    html: '<i class="fas fa-map-marker-alt" style="color: #dc2626; font-size: 20px;"></i>',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                });
                
                searchMarker = L.marker([lat, lon], { 
                    icon: searchIcon,
                    zIndexOffset: 1000 // Ensure it's above other markers
                }).addTo(map);
                
                // Add popup and open it
                searchMarker.bindPopup(`<b>${display_name}</b>`).openPopup();
                
                // Force map to update
                map.invalidateSize();
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

    // Sidebar toggle for smaller screens
    if (toggleSidebarBtn && sidebarEl) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebarEl.classList.toggle('open');
        });
    }
    
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
        waypoints = [];
        if (isDrawingMode) setDrawingMode(false);
        
        // Clear all polygons
        drawnPolygons.forEach(({ polygon, label }) => {
            if (polygon) map.removeLayer(polygon);
            if (label) map.removeLayer(label);
        });
        drawnPolygons = [];
        drawnPolygon = null;
        polygonLabel = null;
        
        updateSecurityAreaUI();
    };
    
    const removePolygon = (index: number) => {
        if (index < 0 || index >= drawnPolygons.length) return;
        
        const { polygon, label } = drawnPolygons[index];
        if (polygon) map.removeLayer(polygon);
        if (label) map.removeLayer(label);
        
        drawnPolygons.splice(index, 1);
        
        // Update labels
        drawnPolygons.forEach((item, idx) => {
            if (item.label) {
                const center = item.polygon.getBounds().getCenter();
                item.label.setLatLng(center);
                item.label.setIcon(L.divIcon({
                    className: 'polygon-label',
                    html: `<div>${t('map.securityAreaLabel')} ${idx + 1}</div>`,
                    iconSize: [150, 24]
                }));
            }
        });
        
        // Maintain backward compatibility
        drawnPolygon = drawnPolygons.length > 0 ? drawnPolygons[drawnPolygons.length - 1].polygon : null;
        polygonLabel = drawnPolygons.length > 0 ? drawnPolygons[drawnPolygons.length - 1].label : null;
        
        updateSecurityAreaUI();
    };
    
    const updateSecurityAreaUI = () => {
        const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
        if (addAreaBtn) {
            // Show button if we're in marking area tab and not currently drawing
            if (currentActiveTab === 'nav-marking-area' && !isDrawingMode && drawnPolygons.length > 0) {
                addAreaBtn.classList.remove('hidden');
            } else {
                addAreaBtn.classList.add('hidden');
            }
        }
    };
    
    const updatePathLine = () => {
        if (pathLine) map.removeLayer(pathLine);
        if (waypoints.length > 1) pathLine = L.polyline(waypoints, { color: 'var(--accent-color)', weight: 3 }).addTo(map);
    };

    const closePolygon = () => {
        if (waypoints.length < 3) {
            alert('Bitte mindestens 3 Punkte setzen, um einen Sicherheitsbereich zu schließen.');
            return;
        }
        
        // Create new polygon
        const polygon = L.polygon(waypoints, { 
            color: 'yellow', 
            fillColor: '#FFFF00', 
            fillOpacity: 0.3, 
            weight: 2 
        }).addTo(map);
        attachManualEntryHandlersToPolygon(polygon);
        
        const polygonCenter = polygon.getBounds().getCenter();
        const label = L.marker(polygonCenter, { 
            icon: L.divIcon({ 
                className: 'polygon-label', 
                html: `<div>${t('map.securityAreaLabel')} ${drawnPolygons.length + 1}</div>`, 
                iconSize: [150, 24] 
            }) 
        }).addTo(map);
        
        // Store in array
        const polygonId = `polygon-${Date.now()}`;
        drawnPolygons.push({ polygon, label, id: polygonId });
        
        // Maintain backward compatibility
        drawnPolygon = polygon;
        polygonLabel = label;
        
        // Clean up current drawing
        if (pathLine) map.removeLayer(pathLine);
        pathLine = null;
        waypointMarkers.forEach(marker => map.removeLayer(marker));
        waypointMarkers = [];
        waypoints = [];
        setDrawingMode(false);
        
        console.log(`✅ Sicherheitsbereich ${drawnPolygons.length} geschlossen. Gesamt: ${drawnPolygons.length} Bereiche.`);
        
        // Trigger OSM data loading for all polygons
        if (isOsmEnabled()) {
            console.log('🗺️ Polygon created, triggering OSM data load...');
            debouncedLoadOsmData();
        }
        
        // Update UI to show option to add another area
        updateSecurityAreaUI();
    };

    const onMapClick = (e: any) => {
        if (drawingCandidateId) {
            handleManualPathClick(e);
            return;
        }
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
    // Map-tabs spiegeln die gleichen Ansichten über der Karte
    const mapTabs = document.querySelectorAll('.map-tabs a');
    const analyzeThreatsBtn = document.getElementById('analyze-threats') as HTMLButtonElement;
    const createReportBtn = document.getElementById('create-report-btn') as HTMLButtonElement;
    const downloadReportBtn = document.getElementById('download-report-btn') as HTMLButtonElement;
    const reportIframe = document.getElementById('report-iframe') as HTMLIFrameElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const reportPreviewArea = document.getElementById('report-preview-area') as HTMLElement;
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;
    manualEntryButton = document.getElementById('manual-entry-toggle') as HTMLButtonElement;
    if (manualEntryButton) {
        manualEntryButton.addEventListener('click', () => {
            if (manualEntryButton?.disabled) return;
            setManualEntryMode(!manualEntryMode);
        });
        updateManualEntryButtonAvailability(currentActiveTab === 'nav-threat-analysis');
    }
    
    // Manual path drawing button
    const manualPathDrawingBtn = document.getElementById('manual-path-drawing-toggle') as HTMLButtonElement;
    if (manualPathDrawingBtn) {
        manualPathDrawingBtn.addEventListener('click', () => {
            if (drawingCandidateId) {
                // If already drawing, finish it
                finishPathDrawing();
            } else {
                // Show selection dialog or use first manual entry
                const manager = (window as any).entryDetectionManager;
                if (!manager || !manager.candidates) {
                    showNotification('Bitte zuerst eine manuelle Zufahrt hinzufügen.', 'warning');
                    return;
                }
                
                // Find manual entries
                const manualCandidates = manager.candidates.filter((c: any) => c.manual);
                if (manualCandidates.length === 0) {
                    showNotification('Bitte zuerst eine manuelle Zufahrt hinzufügen (Rechtsklick auf Polygon-Rand).', 'warning');
                    return;
                }
                
                // If only one manual entry, use it directly
                if (manualCandidates.length === 1) {
                    startPathDrawingForEntryPoint(manualCandidates[0].id);
                } else {
                    // Multiple entries - use the first one or show selection
                    // For now, use the first one
                    startPathDrawingForEntryPoint(manualCandidates[0].id);
                    showNotification(`Pfadzeichnen für Zufahrtspunkt gestartet. (${manualCandidates.length} manuelle Zufahrten verfügbar)`, 'info');
                }
            }
        });
    }
    
    // Calculate speeds button
    const calculateSpeedsBtn = document.getElementById('calculate-speeds-btn') as HTMLButtonElement;
    if (calculateSpeedsBtn) {
        calculateSpeedsBtn.addEventListener('click', () => {
            calculateSpeedsForManualPaths();
            showNotification('Geschwindigkeiten für manuelle Pfade berechnet.', 'success');
        });
    }

    const handleNavSwitch = async (newTabId: string, clickedLink?: HTMLAnchorElement) => {
        // Update current active tab
        currentActiveTab = newTabId;
        console.log('🔄 Tab switched to:', currentActiveTab);
        
        // Close any open deletion bubble
        const existingBubble = document.getElementById('deletion-bubble');
        if (existingBubble) {
            existingBubble.remove();
        }
        
        if (clickedLink) {
            navLinks.forEach(l => l.classList.remove('active'));
            clickedLink.classList.add('active');
        }
        // Map-Tabs optisch synchronisieren
        mapTabs.forEach(tab => {
            const t = tab as HTMLAnchorElement;
            t.classList.toggle('active', t.getAttribute('data-target') === newTabId);
        });

        updateManualEntryButtonAvailability(newTabId === 'nav-threat-analysis');

        if (newTabId === 'nav-param-input') {
            // DON'T reset drawing or clear threat analysis when switching to parameter tab!
            // The user needs to keep their security area while adjusting parameters
            // resetDrawing();  // REMOVED - was deleting the security area polygon
            // clearThreatAnalysis();  // REMOVED - was clearing threat analysis data
            generatedPdf = null;
            generatedPdfFilename = '';
            
            // Hide add area button when switching to parameter tab
            const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
            if (addAreaBtn) addAreaBtn.classList.add('hidden');
        }
        if (newTabId === 'nav-marking-area') {
            // Don't clear threat analysis when returning to marking area
            // Only clear when user explicitly clicks "Reset" button
            generatedPdf = null;
            generatedPdfFilename = '';
            
            // Show add area button if there are already polygons
            const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
            if (addAreaBtn) {
                if (drawnPolygons.length > 0 && !isDrawingMode) {
                    addAreaBtn.classList.remove('hidden');
                } else {
                    addAreaBtn.classList.add('hidden');
                }
            }
            
            // Restore threat analysis if it exists
            restoreThreatAnalysis();
        }
        if (newTabId === 'nav-threat-analysis') {
            generatedPdf = null;
            generatedPdfFilename = '';
            
            // Hide add area button when switching to threat analysis tab
            const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
            if (addAreaBtn) addAreaBtn.classList.add('hidden');
            
            // Restore threat analysis if it exists
            restoreThreatAnalysis();
        }
        if (newTabId === 'nav-product-selection') {
            await updateProductRecommendations();
        } else {
            // Clear product tooltips when leaving product selection or switching tabs
            // BUT NOT when going to tender view - need to keep markers visible
            if (newTabId !== 'nav-project-description') {
                clearProductTooltips();
            }
        }
        if (newTabId === 'nav-project-description') {
            // Handle project description tab
            // DON'T clear threat analysis - user still needs to see where threats are
            // clearThreatAnalysis();
            generatedPdf = null;
            generatedPdfFilename = '';
        }

        toggleDrawModeBtn.classList.add('hidden');
        resetDrawingBtn.classList.add('hidden');
        analyzeThreatsBtn.classList.add('hidden');
        createReportBtn.classList.add('hidden');
        downloadReportBtn.classList.add('hidden');
        const downloadWordBtnNav = document.getElementById('download-word-btn') as HTMLButtonElement;
        if (downloadWordBtnNav) downloadWordBtnNav.classList.add('hidden');
        const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
        if (addAreaBtn) addAreaBtn.classList.add('hidden');
        // Hide manual entry buttons when switching away from threat analysis
        const manualEntryBtn = document.getElementById('manual-entry-toggle') as HTMLButtonElement;
        const manualPathBtn = document.getElementById('manual-path-drawing-toggle') as HTMLButtonElement;
        const calculateSpeedsBtn = document.getElementById('calculate-speeds-btn') as HTMLButtonElement;
        if (manualEntryBtn) manualEntryBtn.classList.add('hidden');
        if (manualPathBtn) manualPathBtn.classList.add('hidden');
        if (calculateSpeedsBtn) calculateSpeedsBtn.classList.add('hidden');
        const createTenderBtn = document.getElementById('create-tender-btn') as HTMLButtonElement;
        const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
        if (createTenderBtn) createTenderBtn.classList.add('hidden');
        if (downloadTenderBtn) downloadTenderBtn.classList.add('hidden');

        const isReportView = newTabId === 'nav-risk-report';
        const isTenderView = newTabId === 'nav-project-description';
        
        const tenderPreviewArea = document.getElementById('tender-preview-area') as HTMLElement;
        
        // Only hide map for report view or tender view if PDF has been generated
        const shouldHideMapForTender = isTenderView && generatedTenderPdf !== null;
        mapDiv.classList.toggle('view-hidden', isReportView || shouldHideMapForTender);
        reportPreviewArea.classList.toggle('view-hidden', !isReportView);
        if (tenderPreviewArea) {
            tenderPreviewArea.classList.toggle('view-hidden', !isTenderView || generatedTenderPdf === null);
        }

        if (map) {
            if (!isReportView && !isTenderView) {
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
            // Show manual entry buttons
            const manualEntryBtn = document.getElementById('manual-entry-toggle') as HTMLButtonElement;
            const manualPathBtn = document.getElementById('manual-path-drawing-toggle') as HTMLButtonElement;
            const calculateSpeedsBtn = document.getElementById('calculate-speeds-btn') as HTMLButtonElement;
            if (manualEntryBtn) manualEntryBtn.classList.remove('hidden');
            if (manualPathBtn) manualPathBtn.classList.remove('hidden');
            if (calculateSpeedsBtn) calculateSpeedsBtn.classList.remove('hidden');
        } else if (newTabId === 'nav-risk-report') {
            createReportBtn.classList.remove('hidden');
            downloadReportBtn.classList.remove('hidden');
            downloadReportBtn.disabled = !generatedPdf;
            const downloadWordBtnNav = document.getElementById('download-word-btn') as HTMLButtonElement;
            if (downloadWordBtnNav) {
                downloadWordBtnNav.classList.remove('hidden');
                downloadWordBtnNav.disabled = !generatedWordBlob;
            }
        } else if (newTabId === 'nav-project-description') {
            // Show tender creation buttons
            const createTenderBtn = document.getElementById('create-tender-btn') as HTMLButtonElement;
            const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
            if (createTenderBtn) createTenderBtn.classList.remove('hidden');
            if (downloadTenderBtn) {
                downloadTenderBtn.classList.remove('hidden');
                downloadTenderBtn.disabled = !generatedTenderPdf;
            }
        }
    };

    navLinks.forEach(link => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const clickedLink = event.currentTarget as HTMLAnchorElement;
            const newTabId = clickedLink.id;
            
            // If clicking on threat analysis from header, show the submenu on map tab
            if (newTabId === 'nav-threat-analysis') {
                const mapThreatTab = document.getElementById('tab-threat-analysis');
                const submenu = document.getElementById('threat-analysis-submenu');
                
                if (mapThreatTab && submenu) {
                    const isCurrentlyOpen = submenu.classList.contains('show');
                    
                    if (!isCurrentlyOpen) {
                        submenu.style.display = ''; // Clear inline style
                        submenu.classList.add('show');
                        mapThreatTab.classList.add('submenu-open');
                        return; // Don't navigate, just show submenu
                    }
                }
            }
            
            await handleNavSwitch(newTabId, clickedLink);
        });
    });

    // Map‑Tabs verknüpfen
    mapTabs.forEach(tab => {
        tab.addEventListener('click', async (event) => {
            event.preventDefault();
            const link = event.currentTarget as HTMLAnchorElement;
            const targetId = link.getAttribute('data-target')!;
            
            // Handle Gefahrenanalyse tab with submenu
            if (targetId === 'nav-threat-analysis') {
                console.log('🔍 Gefahrenanalyse clicked - looking for submenu');
                const submenu = document.getElementById('threat-analysis-submenu');
                console.log('🔍 Submenu element found:', submenu);
                console.log('🔍 Current display style:', submenu?.style.display);
                const isCurrentlyOpen = submenu?.classList.contains('show');
                console.log('🔍 Is currently open:', isCurrentlyOpen);
                
                // Close all other submenus if any
                document.querySelectorAll('.threat-submenu').forEach(sm => {
                    sm.classList.remove('show');
                    (sm as HTMLElement).style.display = 'none';
                });
                
                // Toggle this submenu using class instead of inline style
                if (submenu) {
                    if (isCurrentlyOpen) {
                        submenu.classList.remove('show');
                        submenu.style.display = 'none';
                        console.log('🔍 Hiding submenu - removed show class');
                    } else {
                        submenu.style.display = ''; // Clear inline style
                        submenu.classList.add('show');
                        console.log('🔍 Showing submenu - added show class');
                    }
                    link.classList.toggle('submenu-open', !isCurrentlyOpen);
                    console.log('🔍 Computed style display:', window.getComputedStyle(submenu).display);
                    console.log('🔍 Computed style visibility:', window.getComputedStyle(submenu).visibility);
                    console.log('🔍 Computed style opacity:', window.getComputedStyle(submenu).opacity);
                    console.log('🔍 Computed style z-index:', window.getComputedStyle(submenu).zIndex);
                    console.log('🔍 Submenu offsetHeight:', submenu.offsetHeight);
                    console.log('🔍 Submenu getBoundingClientRect:', submenu.getBoundingClientRect());
                    console.log('🔍 Submenu classes:', submenu.className);
                    console.log('🔍 Submenu parent element:', submenu.parentElement);
                }
                
                // If opening submenu, don't navigate
                if (!isCurrentlyOpen) {
                    console.log('🔍 Opening submenu - stopping navigation');
                    return;
                }
            } else {
                // Close submenu when clicking other tabs
                document.querySelectorAll('.threat-submenu').forEach(sm => {
                    sm.classList.remove('show');
                    (sm as HTMLElement).style.display = 'none';
                });
                document.querySelectorAll('.has-submenu').forEach(hsm => {
                    hsm.classList.remove('submenu-open');
                });
            }
            
            const correspondingHeaderLink = document.getElementById(targetId) as HTMLAnchorElement | null;
            await handleNavSwitch(targetId, correspondingHeaderLink ?? undefined);
        });
    });

    // Submenu items handling
    const threatAnalysisSubmenu = document.getElementById('threat-analysis-submenu');
    if (threatAnalysisSubmenu) {
        threatAnalysisSubmenu.addEventListener('click', async (event) => {
            const target = event.target as HTMLElement;
            const submenuItem = target.closest('.submenu-item') as HTMLAnchorElement;
            
            if (!submenuItem) return;
            event.preventDefault();
            event.stopPropagation();
            
            const action = submenuItem.getAttribute('data-submenu-action');
            const isDisabled = submenuItem.classList.contains('disabled');
            
            if (isDisabled) {
                // Show contact modal for disabled modules
                const modal = document.getElementById('module-contact-modal');
                if (modal) {
                    modal.style.display = 'flex';
                }
            } else if (action === 'access-analysis') {
                // Execute the normal threat analysis
                const threatTab = document.getElementById('tab-threat-analysis');
                if (threatTab) {
                    // Close the submenu
                    threatAnalysisSubmenu.style.display = 'none';
                    threatTab.classList.remove('submenu-open');
                    
                    // Trigger the normal navigation
                    const correspondingHeaderLink = document.getElementById('nav-threat-analysis') as HTMLAnchorElement | null;
                    await handleNavSwitch('nav-threat-analysis', correspondingHeaderLink ?? undefined);
                }
            }
        });
    }

    // Close submenu when clicking outside
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.has-submenu') && !target.closest('.threat-submenu') && !target.closest('.tab-with-submenu')) {
            document.querySelectorAll('.threat-submenu').forEach(sm => {
                sm.classList.remove('show');
                (sm as HTMLElement).style.display = 'none';
            });
            document.querySelectorAll('.has-submenu').forEach(hsm => {
                hsm.classList.remove('submenu-open');
            });
        }
    });

    // Module contact modal handling
    const moduleContactModal = document.getElementById('module-contact-modal');
    const closeModuleModalBtn = document.getElementById('close-module-modal-btn');
    const closeModuleModal = document.getElementById('close-module-modal');
    
    function closeContactModal() {
        if (moduleContactModal) {
            moduleContactModal.style.display = 'none';
        }
    }
    
    if (closeModuleModalBtn) {
        closeModuleModalBtn.addEventListener('click', closeContactModal);
    }
    
    if (closeModuleModal) {
        closeModuleModal.addEventListener('click', closeContactModal);
    }
    
    if (moduleContactModal) {
        // Close modal when clicking overlay
        moduleContactModal.querySelector('.modal-overlay')?.addEventListener('click', closeContactModal);
        
        // Prevent modal content clicks from closing the modal
        moduleContactModal.querySelector('.modal-content-box')?.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    vehicleSelect.addEventListener('change', async () => {
        if (threatsMap.size > 0) {
             await analyzeAndMarkThreats();
        }
        if (document.querySelector('.product-recommendations-container')?.classList.contains('hidden') === false) {
             await updateProductRecommendations();
        }
    });

    toggleDrawModeBtn.addEventListener('click', () => {
        if (isDrawingMode) {
            setDrawingMode(false);
            // Show add area button if there are polygons
            const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
            if (addAreaBtn) {
                if (drawnPolygons.length > 0) {
                    addAreaBtn.classList.remove('hidden');
                } else {
                    addAreaBtn.classList.add('hidden');
                }
            }
        } else {
            setDrawingMode(true);
            // Hide add area button when entering drawing mode
            const addAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
            if (addAreaBtn) addAreaBtn.classList.add('hidden');
        }
    });
    
    // Add security area button
    const addSecurityAreaBtn = document.getElementById('add-security-area-btn') as HTMLButtonElement;
    if (addSecurityAreaBtn) {
        addSecurityAreaBtn.addEventListener('click', () => {
            // Check if any polygon is still being drawn (has active waypoints)
            if (isDrawingMode && waypoints.length > 0) {
                alert('Bitte schließen Sie zuerst den aktuellen Sicherheitsbereich, bevor Sie einen neuen hinzufügen.');
                return;
            }
            
            // Check if all existing polygons are closed (have at least 3 points)
            const allClosed = drawnPolygons.every(item => {
                const coords = item.polygon.getLatLngs();
                return coords && coords.length > 0 && coords[0].length >= 3;
            });
            
            if (!allClosed && drawnPolygons.length > 0) {
                alert('Bitte schließen Sie zuerst alle vorhandenen Sicherheitsbereiche, bevor Sie einen neuen hinzufügen.');
                return;
            }
            
            setDrawingMode(true);
            addSecurityAreaBtn.classList.add('hidden');
        });
    }

    resetDrawingBtn.addEventListener('click', () => {
        resetDrawing();
        clearThreatAnalysis();
    });
    
    analyzeThreatsBtn.addEventListener('click', analyzeAndMarkThreats);
    createReportBtn.addEventListener('click', generateRiskReport);
    downloadReportBtn.addEventListener('click', downloadRiskReport);
    
    // Word download button event listener
    const downloadWordBtn = document.getElementById('download-word-btn') as HTMLButtonElement;
    if (downloadWordBtn) downloadWordBtn.addEventListener('click', downloadWordReport);
    
    // Tender buttons event listeners
    const createTenderBtn = document.getElementById('create-tender-btn') as HTMLButtonElement;
    const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
    if (createTenderBtn) createTenderBtn.addEventListener('click', generateTender);
    if (downloadTenderBtn) downloadTenderBtn.addEventListener('click', downloadTender);

// Set initial state
document.getElementById('nav-marking-area')?.click();

// ===============================================
// POLYGON PERSISTENCE FOR TAB SWITCHING
// ===============================================

/**
 * Saves the current security area polygon state
 */
function saveSecurityAreaState() {
    if (drawnPolygon && map) {
        const polygonData = drawnPolygon.getLatLngs()[0];
        const bounds = drawnPolygon.getBounds();
        
        (window as any).savedSecurityArea = {
            polygonData: polygonData,
            bounds: bounds,
            center: bounds.getCenter(),
            hasPolygon: true
        };
        
        console.log('🔒 Security area state saved:', (window as any).savedSecurityArea);
    } else {
        (window as any).savedSecurityArea = {
            hasPolygon: false
        };
        console.log('🔒 No security area to save');
    }
}

/**
 * Restores the security area polygon state
 */
function restoreSecurityAreaState() {
    const savedState = (window as any).savedSecurityArea;
    
    if (savedState && savedState.hasPolygon && savedState.polygonData && map) {
        console.log('🔓 Restoring security area state:', savedState);
        
        // Remove existing polygon if any
        if (drawnPolygon) {
            map.removeLayer(drawnPolygon);
        }
        if (polygonLabel) {
            map.removeLayer(polygonLabel);
        }
        
        // Recreate the polygon
        drawnPolygon = L.polygon(savedState.polygonData, {
            color: '#2563eb',
            weight: 3,
            fillOpacity: 0.1
        }).addTo(map);
        attachManualEntryHandlersToPolygon(drawnPolygon);
        
        // Recreate the label
        polygonLabel = L.marker(savedState.center, {
            icon: L.divIcon({
                className: 'polygon-label',
                html: `<div class="polygon-label-content">${t('map.securityArea')}</div>`,
                iconSize: [100, 20],
                iconAnchor: [50, 10]
            })
        }).addTo(map);
        
        console.log('🔓 Security area polygon restored successfully');
    } else {
        console.log('🔓 No saved security area state to restore');
    }
}

/**
 * Auto-save polygon when it's created or modified
 */
function autoSavePolygonOnChange() {
    // Monitor for polygon creation/changes
    const originalAddTo = L.Polygon.prototype.addTo;
    L.Polygon.prototype.addTo = function(map: any) {
        const result = originalAddTo.call(this, map);
        
        // If this is the main drawnPolygon, auto-save it
        if (this === drawnPolygon) {
            console.log('🔄 Auto-saving polygon on creation/change');
            setTimeout(() => {
                saveSecurityAreaState();
            }, 100);
        }
        
        return result;
    };
    
    console.log('🔄 Auto-save polygon monitoring enabled');
}

/**
 * Initialize navigation with polygon persistence using direct event override
 */
function initNavigationWithPersistence() {
    console.log('🔄 Initializing navigation with polygon persistence...');
    
    // DIRECT APPROACH: Override click handlers completely
    const navMarkingArea = document.getElementById('nav-marking-area');
    const navParamInput = document.getElementById('nav-param-input');
    
    if (navMarkingArea) {
        // Remove ALL existing event listeners by cloning the node
        const newNavMarkingArea = navMarkingArea.cloneNode(true);
        navMarkingArea.parentNode?.replaceChild(newNavMarkingArea, navMarkingArea);
        
        newNavMarkingArea.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('📥 DIRECT: Clicking security area tab - restoring state');
            
            // Use the main navigation system
            handleNavSwitch('nav-marking-area', newNavMarkingArea as HTMLAnchorElement);
            
            // Restore polygon state
            setTimeout(() => {
                restoreSecurityAreaState();
            }, 100);
            
            console.log('🔄 DIRECT: Navigation switched to nav-marking-area');
        });
        
        console.log('✅ nav-marking-area handler installed');
    }
    
    if (navParamInput) {
        // Remove ALL existing event listeners by cloning the node
        const newNavParamInput = navParamInput.cloneNode(true);
        navParamInput.parentNode?.replaceChild(newNavParamInput, navParamInput);
        
        newNavParamInput.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('📤 DIRECT: Leaving security area - saving state');
            
            // Save polygon state BEFORE switching
            saveSecurityAreaState();
            
            // Use the main navigation system
            handleNavSwitch('nav-param-input', newNavParamInput as HTMLAnchorElement);
            
            console.log('🔄 DIRECT: Navigation switched to nav-param-input');
        });
        
        console.log('✅ nav-param-input handler installed');
    }
    
    // Handle map tabs (trigger nav links)
    const tabMarkingArea = document.getElementById('tab-marking-area');
    const tabParamInput = document.getElementById('tab-param-input');
    
    if (tabMarkingArea) {
        const newTabMarkingArea = tabMarkingArea.cloneNode(true);
        tabMarkingArea.parentNode?.replaceChild(newTabMarkingArea, tabMarkingArea);
        
        newTabMarkingArea.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🗺️ DIRECT: Map tab clicked - triggering nav-marking-area');
            
            // Use the main navigation system
            const navMarkingArea = document.getElementById('nav-marking-area') as HTMLAnchorElement;
            if (navMarkingArea) {
                handleNavSwitch('nav-marking-area', navMarkingArea);
            }
        });
    }
    
    if (tabParamInput) {
        const newTabParamInput = tabParamInput.cloneNode(true);
        tabParamInput.parentNode?.replaceChild(newTabParamInput, tabParamInput);
        
        newTabParamInput.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🗺️ DIRECT: Map tab clicked - triggering nav-param-input');
            
            // Use the main navigation system
            const navParamInput = document.getElementById('nav-param-input') as HTMLAnchorElement;
            if (navParamInput) {
                handleNavSwitch('nav-param-input', navParamInput);
            }
        });
    }
    
    console.log('🔄 Direct navigation with polygon persistence initialized');
}

// FORCE compact spacing for OSM controls after DOM load
const forceCompactSpacing = () => {
    const osmControls = document.querySelector('.osm-controls');
    if (osmControls) {
        // Force re-apply compact spacing styles
        const checkboxLabels = osmControls.querySelectorAll('.checkbox-label');
        checkboxLabels.forEach(label => {
            (label as HTMLElement).style.cssText += `
                margin: 0 !important;
                padding: 1px 0 !important;
                line-height: 1.3 !important;
                min-height: auto !important;
                height: auto !important;
            `;
        });
        
        const checkboxGroups = osmControls.querySelectorAll('.checkbox-group');
        checkboxGroups.forEach(group => {
            (group as HTMLElement).style.cssText += `
                margin: 2px 0 !important;
                padding: 1px 0 !important;
                line-height: 1.3 !important;
            `;
        });
        
        console.log('✅ Compact spacing forcefully applied to OSM controls');
    }
};

// Apply immediately and on DOM changes
setTimeout(forceCompactSpacing, 100);
setTimeout(forceCompactSpacing, 500);
setTimeout(forceCompactSpacing, 1000);

// Initialize auto-save for polygons
autoSavePolygonOnChange();

// Initialize navigation with polygon persistence (delay to ensure DOM is ready)
setTimeout(() => {
    initNavigationWithPersistence();
}, 1000); // Longer delay to ensure all existing handlers are attached first

    // ===============================

    // Mount React Chatbot into overlay root (replaces the temporary DOM Chatbot)
    const overlayRoot = document.getElementById('chatbot-react-root');
    if (overlayRoot) {
        try {
            const root = createRoot(overlayRoot);
            root.render(createElement(ZufahrtsschutzChatbot));
        } catch (e) {
            console.error('Chatbot mount failed:', e);
        }
    }

    initViewSwitcher();
}

// Function to debug current view state
function debugViewState() {
    console.log('=== DEBUG: Current View State ===');
    
    const elements = [
        { id: 'planning-view', name: 'Planning View' },
        { id: 'manufacturer-view', name: 'Manufacturer View' },
        { id: 'map', name: 'Map Container' },
        { id: 'chatbot-react-root', name: 'Chatbot Root' },
        { selector: '.sidebar', name: 'Sidebar' },
        { selector: '.map-area', name: 'Map Area' },
        { selector: '.map-tabs', name: 'Map Tabs' },
        { selector: '.map-toolbar', name: 'Map Toolbar' }
    ];
    
    elements.forEach(({ id, selector, name }) => {
        const element = selector ? document.querySelector(selector) : document.getElementById(id || '');
        if (element) {
            const computedStyle = window.getComputedStyle(element);
            const htmlElement = element as HTMLElement;
            console.log(`${name}:`, {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                visible: htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0
            });
        } else {
            console.log(`${name}: NOT FOUND`);
        }
    });
    
    console.log('Map object exists:', !!map);
    if (map) {
        console.log('Map center:', map.getCenter());
        console.log('Map zoom:', map.getZoom());
    }
    
    console.log('=== END DEBUG ===');
}

// Function to restore all planning view elements
function _restorePlanningViewElements() {
    console.log('Restoring all planning view elements...');
    
    // List of all elements that need to be restored
    const elementsToRestore = [
        { selector: '.map-area', display: 'block' },
        { selector: '#map', display: 'block', additionalStyles: { visibility: 'visible', opacity: '1' } },
        { selector: '.map-tabs', display: 'flex' },
        { selector: '.map-toolbar', display: 'flex' },
        { selector: '.sidebar', display: 'block' },
        { selector: '#floating-threats', display: 'none' }, // Hidden by default
        { selector: '#report-preview-area', display: 'none' }, // Hidden by default
        { selector: '.report-loading-overlay', display: 'none' } // Hidden by default
    ];
    
    elementsToRestore.forEach(({ selector, display, additionalStyles }) => {
        const element = document.querySelector(selector);
        if (element) {
            (element as HTMLElement).style.display = display;
            if (additionalStyles) {
                Object.entries(additionalStyles).forEach(([property, value]) => {
                    (element as HTMLElement).style[property as any] = value;
                });
            }
            console.log(`Restored ${selector} with display: ${display}`);
        } else {
            console.warn(`Element not found: ${selector}`);
        }
    });
    
    // Ensure chatbot root is visible
    const chatbotRoot = document.getElementById('chatbot-react-root');
    if (chatbotRoot) {
        (chatbotRoot as HTMLElement).style.display = 'block';
        (chatbotRoot as HTMLElement).style.visibility = 'visible';
        console.log('Chatbot root restored');
    }
    
    // Debug the state after restoration
    setTimeout(() => {
        debugViewState();
    }, 100);
}

// Function to translate manufacturer view specifically
function _translateManufacturerView() {
    const manufacturerView = document.getElementById('manufacturer-view');
    if (!manufacturerView) {
        return;
    }
    
    // Translate all elements in manufacturer view
    const elementsToTranslate = [
        { selector: '[data-translate-key]', attribute: 'data-translate-key' },
        { selector: '[data-translate-key-placeholder]', attribute: 'data-translate-key-placeholder' },
        { selector: '[data-translate-key-aria]', attribute: 'data-translate-key-aria' },
        { selector: '[data-translate-key-tooltip]', attribute: 'data-translate-key-tooltip' }
    ];
    
    elementsToTranslate.forEach(({ selector, attribute }) => {
        manufacturerView.querySelectorAll(selector).forEach(element => {
            const key = element.getAttribute(attribute);
            if (key) {
                const translatedText = t(key);
                
                if (attribute === 'data-translate-key-placeholder') {
                    (element as HTMLInputElement).placeholder = translatedText;
                } else if (attribute === 'data-translate-key-aria') {
                    element.setAttribute('aria-label', translatedText);
                } else if (attribute === 'data-translate-key-tooltip') {
                    (element as HTMLElement).dataset.tooltip = translatedText;
                } else {
                    // For data-translate-key, set text content
                    element.textContent = translatedText;
                }
            }
        });
    });
    
    // Re-render products if they are currently displayed to update technical data labels
    const productsGrid = document.getElementById('products-grid');
    const productsTable = document.getElementById('products-table');
    
    if (productsGrid && productsGrid.style.display !== 'none') {
        // Grid view is active, translate existing tiles
        console.log('Translating product tiles technical data...');
        translateProductTiles();
    } else if (productsTable && productsTable.style.display !== 'none') {
        // Table view is active, translations are handled by data-translate-key attributes
        console.log('Table view translations handled by translateUI()');
    }
}

/**
 * Function to translate technical data labels in product tiles
 */
function translateProductTiles() {
    const productsGrid = document.getElementById('products-grid');
    if (!productsGrid) {
        return;
    }
    
    // Find all product cards in the grid
    const productCards = productsGrid.querySelectorAll('.product-card');
    
    productCards.forEach(card => {
        // Find all text content in the card and translate common technical terms
        const textElements = card.querySelectorAll('.product-card-spec-label, .tech-spec-item, .tech-spec-label, .spec-label');
        
        textElements.forEach(element => {
            let text = element.textContent || '';
            
            // Translate common technical specification labels
            if (currentLanguage === 'en') {
                // German to English
                text = text
                    .replace(/Fahrzeuggewicht \(kg\)/gi, t('manufacturer.sidebar.productDatabase.vehicleWeight'))
                    .replace(/Fahrzeugtyp/gi, t('manufacturer.sidebar.productDatabase.vehicleType'))
                    .replace(/Geschwindigkeit \(km\/h\)/gi, t('manufacturer.sidebar.productDatabase.speed'))
                    .replace(/Aufprallwinkel \(°\)/gi, t('manufacturer.sidebar.productDatabase.impactAngle'))
                    .replace(/Penetration \(m\)/gi, t('manufacturer.sidebar.productDatabase.penetration'))
                    .replace(/Trümmerentfernung \(m\)/gi, t('manufacturer.sidebar.productDatabase.debrisDistance'))
                    .replace(/Standard/gi, t('manufacturer.sidebar.productDatabase.standard'))
                    .replace(/Hersteller/gi, t('manufacturer.sidebar.productDatabase.manufacturer'))
                    .replace(/Typ/gi, t('manufacturer.sidebar.productDatabase.type'))
                    .replace(/FAHRZEUGGEWICHT \(KG\)/gi, t('manufacturer.sidebar.productDatabase.vehicleWeight').toUpperCase())
                    .replace(/FAHRZEUGTYP/gi, t('manufacturer.sidebar.productDatabase.vehicleType').toUpperCase())
                    .replace(/GESCHWINDIGKEIT \(KM\/H\)/gi, t('manufacturer.sidebar.productDatabase.speed').toUpperCase())
                    .replace(/AUFPRALLWINKEL \(°\)/gi, t('manufacturer.sidebar.productDatabase.impactAngle').toUpperCase())
                    .replace(/PENETRATION \(M\)/gi, t('manufacturer.sidebar.productDatabase.penetration').toUpperCase())
                    .replace(/STANDARD/gi, t('manufacturer.sidebar.productDatabase.standard').toUpperCase())
                    .replace(/HERSTELLER/gi, t('manufacturer.sidebar.productDatabase.manufacturer').toUpperCase())
                    .replace(/TYP/gi, t('manufacturer.sidebar.productDatabase.type').toUpperCase());
            } else {
                // English to German
                text = text
                    .replace(/Vehicle Weight \(kg\)/gi, 'Fahrzeuggewicht (kg)')
                    .replace(/Vehicle Type/gi, 'Fahrzeugtyp')
                    .replace(/Speed \(km\/h\)/gi, 'Geschwindigkeit (km/h)')
                    .replace(/Impact Angle \(°\)/gi, 'Aufprallwinkel (°)')
                    .replace(/Penetration \(m\)/gi, 'Penetration (m)')
                    .replace(/Debris Distance \(m\)/gi, 'Trümmerentfernung (m)')
                    .replace(/Standard/gi, 'Standard')
                    .replace(/Manufacturer/gi, 'Hersteller')
                    .replace(/Type/gi, 'Typ')
                    .replace(/VEHICLE WEIGHT \(KG\)/gi, 'FAHRZEUGGEWICHT (KG)')
                    .replace(/VEHICLE TYPE/gi, 'FAHRZEUGTYP')
                    .replace(/SPEED \(KM\/H\)/gi, 'GESCHWINDIGKEIT (KM/H)')
                    .replace(/IMPACT ANGLE \(°\)/gi, 'AUFPRALLWINKEL (°)')
                    .replace(/PENETRATION \(M\)/gi, 'PENETRATION (M)')
                    .replace(/STANDARD/gi, 'STANDARD')
                    .replace(/MANUFACTURER/gi, 'HERSTELLER')
                    .replace(/TYPE/gi, 'TYP');
            }
            
            element.textContent = text;
        });
        
        // Also check for any direct text nodes that might contain the labels
        const walker = document.createTreeWalker(
            card,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        const textNodes: Text[] = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue && node.nodeValue.trim()) {
                textNodes.push(node as Text);
            }
        }
        
        textNodes.forEach(textNode => {
            let text = textNode.nodeValue || '';
            
            if (currentLanguage === 'en') {
                // German to English
                text = text
                    .replace(/FAHRZEUGGEWICHT \(KG\)/gi, 'VEHICLE WEIGHT (KG)')
                    .replace(/FAHRZEUGTYP/gi, 'VEHICLE TYPE')
                    .replace(/GESCHWINDIGKEIT \(KM\/H\)/gi, 'SPEED (KM/H)')
                    .replace(/AUFPRALLWINKEL \(°\)/gi, 'IMPACT ANGLE (°)')
                    .replace(/PENETRATION \(M\)/gi, 'PENETRATION (M)')
                    .replace(/STANDARD/gi, 'STANDARD')
                    .replace(/HERSTELLER/gi, 'MANUFACTURER')
                    .replace(/TYP/gi, 'TYPE');
            } else {
                // English to German
                text = text
                    .replace(/VEHICLE WEIGHT \(KG\)/gi, 'FAHRZEUGGEWICHT (KG)')
                    .replace(/VEHICLE TYPE/gi, 'FAHRZEUGTYP')
                    .replace(/SPEED \(KM\/H\)/gi, 'GESCHWINDIGKEIT (KM/H)')
                    .replace(/IMPACT ANGLE \(°\)/gi, 'AUFPRALLWINKEL (°)')
                    .replace(/PENETRATION \(M\)/gi, 'PENETRATION (M)')
                    .replace(/STANDARD/gi, 'STANDARD')
                    .replace(/MANUFACTURER/gi, 'HERSTELLER')
                    .replace(/TYPE/gi, 'TYP');
            }
            
            textNode.nodeValue = text;
        });
    });
    
    console.log('Product tiles translation completed for language:', currentLanguage);
}

// Function to translate chatbot specifically
function translateChatbot() {
    console.log('Translating chatbot for language:', currentLanguage);
    
    // Translate chatbot title
    const chatbotTitle = document.querySelector('#chatbot-react-root h2');
    if (chatbotTitle) {
        chatbotTitle.textContent = t('ai.chatbot.title');
    }
    
    // Translate welcome message
    const welcomeMessage = document.querySelector('#chatbot-react-root .message:first-child .message-content');
    if (welcomeMessage) {
        welcomeMessage.textContent = t('ai.chatbot.welcome');
    }
    
    // Translate asset question
    const assetQuestion = document.querySelector('#chatbot-react-root .message:nth-child(2) .message-content');
    if (assetQuestion) {
        assetQuestion.textContent = t('ai.chatbot.assetQuestion');
    }
    
    // Translate input placeholder
    const inputField = document.querySelector('#chatbot-react-root input[type="text"]');
    if (inputField) {
        (inputField as HTMLInputElement).placeholder = t('ai.chatbot.inputPlaceholder');
    }
    
    // Translate send button
    const sendButton = document.querySelector('#chatbot-react-root button[type="submit"]');
    if (sendButton) {
        sendButton.textContent = t('ai.chatbot.sendButton');
    }
    
    console.log('Chatbot translation completed');
}

// ===============================================
// APPLICATION INITIALIZATION
// ===============================================



/**
 * Setup logo click listener for logout functionality
 */
function setupLogoLogout() {
    const logoElements = document.querySelectorAll('.logo-img, .welcome-logo');
    logoElements.forEach(logo => {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Logo clicked - logging out...');
            logout();
        });
        // Add pointer cursor to indicate clickability
        (logo as HTMLElement).style.cursor = 'pointer';
    });
}

// ===============================================
// FILTER SIDEBAR FUNCTIONS
// ===============================================

/**
 * Toggle range input visibility
 */
function toggleRangeInput(rangeId: string) {
    const content = document.getElementById(`${rangeId}-content`);
    const icon = document.getElementById(`${rangeId}-icon`);
    
    if (content && icon) {
        const isVisible = content.style.display !== 'none';
        
        if (isVisible) {
            content.style.display = 'none';
            icon.classList.remove('expanded');
        } else {
            content.style.display = 'block';
            icon.classList.add('expanded');
        }
    }
}

/**
 * Toggle dropdown visibility
 */
function toggleDropdown(dropdownId: string) {
    const content = document.getElementById(`${dropdownId}-content`);
    const icon = document.getElementById(`${dropdownId}-icon`);
    
    if (content && icon) {
        const isVisible = content.style.display !== 'none';
        
        if (isVisible) {
            content.style.display = 'none';
            icon.classList.remove('expanded');
        } else {
            content.style.display = 'block';
            icon.classList.add('expanded');
        }
    }
}

/**
 * Setup event listeners for filter sidebar elements
 */
function setupFilterSidebarEvents() {
    console.log('Setting up filter sidebar events...');
    
    // Reset button
    const resetButton = document.getElementById('reset-all-filters');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            resetAllFilters();
            applyFiltersAndUpdateDisplay();
        });
    }
    
    // All select dropdowns
    const selectElements = document.querySelectorAll('.manufacturer-sidebar select');
    selectElements.forEach(select => {
        select.addEventListener('change', () => {
            applyFiltersAndUpdateDisplay();
        });
    });
    
    // All number inputs for ranges
    const numberInputs = document.querySelectorAll('.manufacturer-sidebar input[type="number"]');
    numberInputs.forEach(input => {
        input.addEventListener('input', () => {
            applyFiltersAndUpdateDisplay();
        });
    });
    
    // All checkboxes
    const checkboxes = document.querySelectorAll('.manufacturer-sidebar input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            applyFiltersAndUpdateDisplay();
        });
    });
    
    console.log('Filter sidebar events setup completed');
}

/**
 * Get current filter values
 */
function getCurrentFilters() {
    // Get checkbox selections - these return empty arrays if no checkboxes selected
    const vehicleMass = getSelectedCheckboxes('vehicle-mass-content');
    const standard = getSelectedCheckboxes('standards-content');
    const foundation = getSelectedCheckboxes('foundation-content');
    const operation = getSelectedCheckboxes('operation-content');
    const deployment = getSelectedCheckboxes('deployment-content');
    const category = getSelectedCheckboxes('categories-content');
    
    // Get range inputs with proper defaults
    const minSpeedEl = document.getElementById('min-speed') as HTMLInputElement;
    const maxSpeedEl = document.getElementById('max-speed') as HTMLInputElement;
    const minAngleEl = document.getElementById('min-angle') as HTMLInputElement;
    const maxAngleEl = document.getElementById('max-angle') as HTMLInputElement;
    const minDistanceEl = document.getElementById('min-distance') as HTMLInputElement;
    const maxDistanceEl = document.getElementById('max-distance') as HTMLInputElement;
    const manufacturerEl = document.getElementById('manufacturer-select') as HTMLSelectElement;
    
    const filters = {
        vehicleMass,
        impactSpeed: {
            min: minSpeedEl ? parseInt(minSpeedEl.value) || 16 : 16,
            max: maxSpeedEl ? parseInt(maxSpeedEl.value) || 112 : 112
        },
        impactAngle: {
            min: minAngleEl ? parseInt(minAngleEl.value) || 15 : 15,
            max: maxAngleEl ? parseInt(maxAngleEl.value) || 90 : 90
        },
        penetrationDistance: {
            min: minDistanceEl ? parseFloat(minDistanceEl.value) || 0 : 0,
            max: maxDistanceEl ? parseFloat(maxDistanceEl.value) || 60 : 60
        },
        standard,
        foundation,
        operation,
        deployment,
        category,
        manufacturer: manufacturerEl?.value || ''
    };
    
    return filters;
}

/**
 * Get selected checkbox values from a container
 */
function getSelectedCheckboxes(containerId: string): string[] {
    const container = document.getElementById(containerId);
    if (!container) return [];
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => (cb as HTMLInputElement).value);
}

/**
 * Generate Vehicle Mass options with real counts
 */
function generateVehicleMassOptions(counts: any): string {
    const vehicleMassOptions = [
        { mass: 1500, category: 'M1' },
        { mass: 2500, category: 'IT' },
        { mass: 2500, category: 'N1G' },
        { mass: 3500, category: 'N1' },
        { mass: 7200, category: 'N2A' },
        { mass: 7200, category: 'N2B' },
        { mass: 7200, category: 'N3C' },
        { mass: 7500, category: 'N2' },
        { mass: 7500, category: 'N3' },
        { mass: 12000, category: 'N3D' },
        { mass: 30000, category: 'N3F' }
    ];
    
    return vehicleMassOptions.map(option => {
        const key = `${option.mass} [${option.category}]`;
        const count = counts[key] || 0;
        return `<label><input type="checkbox" value="${option.mass} [${option.category}]" data-category="${option.category}"> ${option.mass} [${option.category}] (${count})</label>`;
    }).join('');
}

/**
 * Generate Standard options with real counts
 */
function generateStandardOptions(counts: any): string {
    const isGerman = currentLanguage === 'de';
    const standardOptions = [
        { 
            value: 'Development test meeting PAS 68:2005', 
            label: isGerman ? 'Virtuell getestet nach PAS 68:2005' : 'Development test meeting PAS 68:2005' 
        },
        { value: 'ISO 22343-1:2023', label: 'ISO 22343-1:2023' },
        { value: 'IWA 14-1:2013', label: 'IWA 14-1:2013' },
        { value: 'PAS 68:2005', label: 'PAS 68:2005' },
        { value: 'PAS 68:2007', label: 'PAS 68:2007' },
        { value: 'PAS 68:2010', label: 'PAS 68:2010' },
        { value: 'PAS 68:2013', label: 'PAS 68:2013' }
    ];
    
    return standardOptions.map(standard => {
        const count = counts[standard.value] || 0;
        return `<label><input type="checkbox" value="${standard.value}"> ${standard.label} (${count})</label>`;
    }).join('');
}

/**
 * Generate Foundation options with real counts
 */
function generateFoundationOptions(counts: any): string {
    const isGerman = currentLanguage === 'de';
    const foundationOptions = [
        { 
            value: 'A - Free standing (no ground fixings)', 
            label: isGerman ? 'Freistehend (ohne Bodenbefestigung)' : 'Free standing (no ground fixings)' 
        },
        { 
            value: 'Ap - Surface mounted (pinned or bolted to ground)', 
            label: isGerman ? 'Oberflächenmontiert (gedübbelt oder geschraubt)' : 'Surface mounted (pinned or bolted to ground)' 
        },
        { 
            value: 'B - Depth <= 0.5m below ground level', 
            label: isGerman ? 'Tiefe <= 0,5m unter Geländeoberkante' : 'Depth <= 0.5m below ground level' 
        },
        { 
            value: 'C - Depth >0.5m below ground level', 
            label: isGerman ? 'Tiefe >0,5m unter Geländeoberkante' : 'Depth >0.5m below ground level' 
        }
    ];
    
    return foundationOptions.map(foundation => {
        const count = counts[foundation.value] || 0;
        return `<label><input type="checkbox" value="${foundation.value}"> ${foundation.label} (${count})</label>`;
    }).join('');
}

/**
 * Generate Operation options with real counts
 */
function generateOperationOptions(counts: any): string {
    const isGerman = currentLanguage === 'de';
    const operationOptions = [
        { value: 'active', label: isGerman ? 'Aktiv' : 'active' },
        { value: 'passive', label: isGerman ? 'Passiv' : 'passive' }
    ];
    
    return operationOptions.map(operation => {
        const count = counts[operation.value] || 0;
        return `<label><input type="checkbox" value="${operation.value}"> ${operation.label} (${count})</label>`;
    }).join('');
}

/**
 * Generate Deployment options with real counts
 */
function generateDeploymentOptions(counts: any): string {
    const isGerman = currentLanguage === 'de';
    const deploymentOptions = [
        { value: 'permanent', label: isGerman ? 'Permanent' : 'permanent' },
        { value: 'temporary', label: isGerman ? 'Temporär' : 'temporary' }
    ];
    
    return deploymentOptions.map(deployment => {
        const count = counts[deployment.value] || 0;
        return `<label><input type="checkbox" value="${deployment.value}"> ${deployment.label} (${count})</label>`;
    }).join('');
}

/**
 * Generate Categories options with real counts
 */
function generateCategoriesOptions(counts: any): string {
    const isGerman = currentLanguage === 'de';
    
    // Map German product types to categories for display
    const categoryMapping: Record<string, string> = {
        'Poller': isGerman ? 'Poller' : 'Bollards',
        'Zaun': isGerman ? 'Zaun' : 'Perimeter Barriers', 
        'Tor': isGerman ? 'Tor' : 'Gates',
        'Haltestelle': isGerman ? 'Straßenmöbel' : 'Street Furniture',
        'Durchfahrtsperre': isGerman ? 'Sperrblocker' : 'Blockers',
        'Unknown': isGerman ? 'Sonstige' : 'Other'
    };
    
    // Group products by mapped categories
    const categoryGroups: { [key: string]: string[] } = {};
    Object.entries(categoryMapping).forEach(([germanType, displayCategory]) => {
        if (!categoryGroups[displayCategory]) {
            categoryGroups[displayCategory] = [];
        }
        categoryGroups[displayCategory].push(germanType);
    });
    
    return Object.entries(categoryGroups).map(([categoryName, germanTypes]) => {
        const categoryCount = germanTypes.reduce((sum, type) => sum + (counts[type] || 0), 0);
        const childrenHTML = germanTypes.map(germanType => {
            const childCount = counts[germanType] || 0;
            // Use the translated display name for the sub-category
            const subCategoryDisplayName = categoryMapping[germanType] || germanType;
            return `<label><input type="checkbox" value="${germanType}" data-category="${categoryName}"> ${subCategoryDisplayName} (${childCount})</label>`;
        }).join('');
        
        return `
            <div class="category-item">
                <div class="category-header">
                    <label><input type="checkbox" value="${categoryName}" data-category="${categoryName}"> ${categoryName} (${categoryCount})</label>
                </div>
                <div class="category-children">
                    ${childrenHTML}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Generate Manufacturer options with real counts
 */
function generateManufacturerOptions(counts: any): string {
    // Get all manufacturers from the counts object (dynamically from product database)
    // Sort alphabetically (case-insensitive)
    const manufacturers = Object.keys(counts)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    
    console.log(`📋 Generating options for ${manufacturers.length} manufacturers`);
    
    return manufacturers.map(manufacturer => {
        const count = counts[manufacturer] || 0;
        return `<option value="${manufacturer}">${manufacturer} (${count})</option>`;
    }).join('');
}

/**
 * Calculate real product counts for filter categories
 */
function calculateProductCounts() {
    const allProducts = (window as any).productDatabase || [];
    console.log('📊 Calculating product counts from', allProducts.length, 'products');
    
    const counts: {
        vehicleMass: { [key: string]: number };
        standard: { [key: string]: number };
        foundation: { [key: string]: number };
        operation: { [key: string]: number };
        deployment: { [key: string]: number };
        category: { [key: string]: number };
        manufacturer: { [key: string]: number };
    } = {
        vehicleMass: {},
        standard: {},
        foundation: {},
        operation: {},
        deployment: {},
        category: {},
        manufacturer: {}
    };
    
    allProducts.forEach((product: any) => {
        const techData = product.technical_data;
        if (!techData) return;
        
        // Vehicle Mass counts
        const vehicleMass = techData.pr_mass_kg;
        const vehicleCategory = techData.pr_veh;
        if (vehicleMass && vehicleCategory) {
            const key = `${vehicleMass} [${vehicleCategory}]`;
            counts.vehicleMass[key] = (counts.vehicleMass[key] || 0) + 1;
        }
        
        // Standard counts
        const standard = techData.standard;
        if (standard) {
            counts.standard[standard] = (counts.standard[standard] || 0) + 1;
        }
        
        // Foundation counts
        const foundation = techData.foundation_depth;
        if (foundation) {
            counts.foundation[foundation] = (counts.foundation[foundation] || 0) + 1;
        }
        
        // Operation counts (if available in data)
        // const operation = techData.operation;
        // if (operation) {
        //     counts.operation[operation] = (counts.operation[operation] || 0) + 1;
        // }
        
        // Deployment counts based on foundation type
        // All free-standing products are suitable for temporary deployment
        const isFreeStanding = techData.foundation_depth === 'A - Free standing (no ground fixings)';
        if (isFreeStanding) {
            counts.deployment['temporary'] = (counts.deployment['temporary'] || 0) + 1;
        }
        // All products can be used for permanent deployment
        counts.deployment['permanent'] = (counts.deployment['permanent'] || 0) + 1;
        
        // Category counts (based on product_type)
        const category = product.product_type;
        if (category) {
            counts.category[category] = (counts.category[category] || 0) + 1;
        }
        
        // Manufacturer counts
        const manufacturer = product.manufacturer;
        if (manufacturer) {
            counts.manufacturer[manufacturer] = (counts.manufacturer[manufacturer] || 0) + 1;
        }
    });
    
    console.log('📈 Calculated counts:', counts);
    return counts;
}

/**
 * Apply filters and update product display
 * This function combines the sidebar filters with the top search bar
 */
function applyFiltersAndUpdateDisplay() {
    // Guard: Don't run if filter system not initialized
    if (!filterInitialized) {
        console.log('⏳ applyFiltersAndUpdateDisplay skipped - not yet initialized');
        return;
    }
    
    const filters = getCurrentFilters();
    const allProducts = (window as any).productDatabase || [];
    
    // Guard: Don't filter if no products loaded yet
    if (!allProducts || allProducts.length === 0) {
        console.log('⚠️ No products in database, skipping filter');
        return;
    }
    
    // Get the search term from the top search bar
    const searchTerm = (document.getElementById('product-search') as HTMLInputElement)?.value.toLowerCase().trim() || '';
    
    // Debug: Log all filter values
    console.log('🔍 FILTER DEBUG - All values:', JSON.stringify(filters, null, 2));
    console.log('🔍 FILTER DEBUG - Search term:', searchTerm);
    console.log('🔍 FILTER DEBUG - Total products in database:', allProducts.length);
    
    // First apply sidebar filters (only if there are actual active filters)
    let filteredProducts = filterProductsByFilters(allProducts, filters);
    
    console.log(`📊 After sidebar filters: ${filteredProducts.length} of ${allProducts.length} products`);
    
    // Then apply search filter on top of sidebar results
    if (searchTerm) {
        const normalizedSearchTerm = normalizeSearchText(searchTerm);
        const beforeSearchCount = filteredProducts.length;
        filteredProducts = filteredProducts.filter((product: any) => {
            const normalizedProductName = normalizeSearchText(product.product_name || '');
            const normalizedManufacturer = normalizeSearchText(product.manufacturer || '');
            const normalizedStandard = normalizeSearchText(product.technical_data?.standard || '');
            const normalizedProductType = normalizeSearchText(product.product_type || '');
            const normalizedCluster = normalizeSearchText(product.product_cluster || '');
            const originalProductName = (product.product_name || '').toLowerCase();
            const originalManufacturer = (product.manufacturer || '').toLowerCase();
            const originalStandard = (product.technical_data?.standard || '').toLowerCase();
            
            const matches = normalizedProductName.includes(normalizedSearchTerm) ||
                normalizedManufacturer.includes(normalizedSearchTerm) ||
                normalizedStandard.includes(normalizedSearchTerm) ||
                normalizedProductType.includes(normalizedSearchTerm) ||
                normalizedCluster.includes(normalizedSearchTerm) ||
                originalProductName.includes(searchTerm) ||
                originalManufacturer.includes(searchTerm) ||
                originalStandard.includes(searchTerm);
            
            return matches;
        });
        console.log(`📊 After search "${searchTerm}": ${filteredProducts.length} of ${beforeSearchCount} products`);
    }
    
    console.log(`✅ FINAL RESULT: Displaying ${filteredProducts.length} of ${allProducts.length} products`);
    
    // Update the display
    displayProducts(filteredProducts);
}

/**
 * Filter products based on all filter types
 * NOTE: This function allows products without technical_data to pass through
 * and only applies filters when explicitly selected
 */
function filterProductsByFilters(products: any[], filters: any) {
    // Check if any advanced filters are actually set
    const hasVehicleMassFilter = filters.vehicleMass && filters.vehicleMass.length > 0;
    const hasStandardFilter = filters.standard && filters.standard.length > 0;
    const hasFoundationFilter = filters.foundation && filters.foundation.length > 0;
    const hasDeploymentFilter = filters.deployment && filters.deployment.length > 0;
    const hasCategoryFilter = filters.category && filters.category.length > 0;
    const hasManufacturerFilter = filters.manufacturer && filters.manufacturer !== '';
    const hasSpeedFilter = filters.impactSpeed && (filters.impactSpeed.min > 16 || filters.impactSpeed.max < 112);
    const hasAngleFilter = filters.impactAngle && (filters.impactAngle.min > 15 || filters.impactAngle.max < 90);
    const hasDistanceFilter = filters.penetrationDistance && (filters.penetrationDistance.min > 0 || filters.penetrationDistance.max < 60);
    
    const hasAnyActiveFilter = hasVehicleMassFilter || hasStandardFilter || hasFoundationFilter || 
        hasDeploymentFilter || hasCategoryFilter || hasManufacturerFilter || 
        hasSpeedFilter || hasAngleFilter || hasDistanceFilter;
    
    // If no filters are active, return all products
    if (!hasAnyActiveFilter) {
        console.log('📋 No active filters - returning all products');
        return products;
    }
    
    console.log('📋 Active filters:', {
        vehicleMass: hasVehicleMassFilter ? filters.vehicleMass : 'none',
        standard: hasStandardFilter ? filters.standard : 'none',
        foundation: hasFoundationFilter ? filters.foundation : 'none',
        deployment: hasDeploymentFilter ? filters.deployment : 'none',
        category: hasCategoryFilter ? filters.category : 'none',
        manufacturer: hasManufacturerFilter ? filters.manufacturer : 'none',
        speed: hasSpeedFilter ? filters.impactSpeed : 'default',
        angle: hasAngleFilter ? filters.impactAngle : 'default',
        distance: hasDistanceFilter ? filters.penetrationDistance : 'default'
    });
    
    return products.filter(product => {
        const techData = product.technical_data || {};
        
        // Vehicle Mass filter (checkbox selection)
        if (hasVehicleMassFilter) {
            const vehicleMass = techData.pr_mass_kg;
            const vehicleCategory = techData.pr_veh;
            // If product has no vehicle data, include it (don't filter out)
            if (vehicleMass && vehicleCategory) {
                const matchesVehicleMass = filters.vehicleMass.some((filterValue: string) => {
                    const [massStr, category] = filterValue.split(' ');
                    const mass = parseInt(massStr);
                    return vehicleMass === mass && vehicleCategory === category.replace(/[\[\]]/g, '');
                });
                if (!matchesVehicleMass) return false;
            }
        }
        
        // Impact Speed filter (range) - only apply if filter is non-default
        if (hasSpeedFilter) {
            const impactSpeed = techData.pr_speed_kph;
            if (impactSpeed && (impactSpeed < filters.impactSpeed.min || impactSpeed > filters.impactSpeed.max)) {
                return false;
            }
        }
        
        // Impact Angle filter (range) - only apply if filter is non-default
        if (hasAngleFilter) {
            const impactAngle = techData.pr_angle_deg;
            if (impactAngle && (impactAngle < filters.impactAngle.min || impactAngle > filters.impactAngle.max)) {
                return false;
            }
        }
        
        // Penetration Distance filter (range) - only apply if filter is non-default
        if (hasDistanceFilter) {
            const penetrationDistance = techData.pr_pen_m;
            if (penetrationDistance && (penetrationDistance < filters.penetrationDistance.min || penetrationDistance > filters.penetrationDistance.max)) {
                return false;
            }
        }
        
        // Standard filter (checkbox selection)
        if (hasStandardFilter) {
            const standard = techData.standard;
            // Only filter if product has standard data
            if (standard && !filters.standard.some((s: string) => standard.includes(s) || s.includes(standard))) {
                return false;
            }
        }
        
        // Foundation filter (checkbox selection)
        if (hasFoundationFilter) {
            const foundation = techData.foundation_depth;
            // Only filter if product has foundation data
            if (foundation && !filters.foundation.includes(foundation)) {
                return false;
            }
        }
        
        // Category filter (checkbox selection) - NEW: Actually apply category filter
        if (hasCategoryFilter) {
            const productType = product.product_type;
            if (productType && !filters.category.includes(productType)) {
                return false;
            }
        }
        
        // Deployment filter (checkbox selection)
        if (hasDeploymentFilter) {
            const temporarySelected = filters.deployment.includes('temporary');
            const permanentSelected = filters.deployment.includes('permanent');
            const isFreeStanding = techData.foundation_depth === 'A - Free standing (no ground fixings)';
            
            // If both are selected, allow all
            if (temporarySelected && permanentSelected) {
                // Both selected = allow all
            } else if (temporarySelected && !permanentSelected) {
                // Only temporary = only free-standing products
                if (!isFreeStanding) return false;
            }
            // permanentSelected only = allow all (most products can be permanent)
        }
        
        // Manufacturer filter (dropdown selection)
        if (hasManufacturerFilter) {
            if (product.manufacturer !== filters.manufacturer) {
                return false;
            }
        }
        
        return true;
    });
}

/**
 * Extract year from standard string (e.g., "PAS 68:2010" -> 2010)
 */
function extractYearFromStandard(standard: string): number | null {
    const yearMatch = standard.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
}

/**
 * Extract depth from foundation string
 */
function extractDepthFromFoundation(foundation: string): number | null {
    if (foundation.includes('Free standing') || foundation.includes('Surface mounted')) {
        return 0;
    } else if (foundation.includes('<= 0.5m')) {
        return 0.5;
    } else if (foundation.includes('>0.5m')) {
        return 1.0; // Assume >0.5m means around 1m
    }
    return null;
}

/**
 * Reset all filters to default values
 */
function resetAllFilters() {
    console.log('Resetting all filters...');
    
    // Reset range inputs to default values
    const rangeInputs = [
        { id: 'min-speed', value: '16' },
        { id: 'max-speed', value: '112' },
        { id: 'min-angle', value: '15' },
        { id: 'max-angle', value: '90' },
        { id: 'min-distance', value: '0' },
        { id: 'max-distance', value: '60' }
    ];
    
    rangeInputs.forEach(({ id, value }) => {
        const element = document.getElementById(id) as HTMLInputElement;
        if (element) {
            element.value = value;
        }
    });
    
    // Reset checkboxes (uncheck all)
    const checkboxContainers = [
        'vehicle-mass-content',
        'standards-content', 
        'foundation-content',
        'operation-content',
        'deployment-content',
        'categories-content'
    ];
    
    checkboxContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                (checkbox as HTMLInputElement).checked = false;
            });
        }
    });
    
    // Reset manufacturer dropdown
    const manufacturerSelect = document.getElementById('manufacturer-select') as HTMLSelectElement;
    if (manufacturerSelect) {
        manufacturerSelect.value = '';
    }
    
    console.log('All filters reset to default values');
}

// Make toggle functions globally available
(window as any).toggleRangeInput = toggleRangeInput;
(window as any).toggleDropdown = toggleDropdown;

// Initialize authentication system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing authentication...');
    initAuth();
    setupLogoLogout();
    setupThreatPanelControls();
});



