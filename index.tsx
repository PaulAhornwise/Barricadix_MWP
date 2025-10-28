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

import { GoogleGenAI, Type } from "@google/genai";
// React-basierte Chatbot-Komponente ist als separate Datei vorhanden.
// Import optional, Compiler kann ohne explizites React import arbeiten (no JSX here).
import { createElement } from "react";
import type {} from "react-dom";
import ZufahrtsschutzChatbot from "./ZufahrtsschutzChatbot";
import { createRoot } from "react-dom/client";
import "./src/styles/map3d-layout.css";
import { fetchOsmBundleForPolygon, osmCache, OsmBundle } from './src/utils/osm.js';
import { OsmSpeedLimiter, SpeedLimitConfig } from './src/utils/osmSpeedLimits.js';
import { WeatherCondition } from './src/utils/osmParse.js';
// Entry Detection System Integration
import { integrateEntryDetectionWithExistingOSM, addEntryDetectionStyles } from './src/features/map/integration/entryDetectionIntegration.js';
// Geodata Provider Abstraction - NRW Integration
// Note: Functions will be imported dynamically to avoid build issues

// 3D Mode Integration (deck.gl)
import { enter3DDeck, exit3DDeck, threeDDeckState } from './src/features/map/threeDModeDeck';
import { ensureDeckMount } from './src/features/map/ui/ensureDeckMount';

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
let drawnPolygon: any = null;
let polygonLabel: any = null; // To store the label for the polygon
let threatMarkersMap = new Map<string, any[]>(); // Maps street name to an array of its marker layers
let threatsMap = new Map<string, { entryPoints: {lat: number, lon: number, distance: number}[], pathSegments: any[][], totalLength: number, threatLevel?: number, roadType?: string, maxSpeed?: number }>(); // To store analysis data for report

// OSM Speed Limits Integration
let osmSpeedLimiter: OsmSpeedLimiter | null = null;
let currentOsmData: OsmBundle | null = null;
let osmLoadingController: AbortController | null = null;
let osmDebounceTimeout: number | null = null;
let generatedPdf: any = null; // To hold the generated PDF object
let generatedPdfUrl: string | null = null; // Object URL for iframe preview
let generatedTenderPdf: any = null; // To hold the generated Tender PDF object
let generatedTenderPdfUrl: string | null = null; // Object URL for tender iframe preview

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
let translations: any = {};

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
            "threatAnalysis": "Gefahrenanalyse",
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
            "reportPrompt": "Du bist ein Spezialist für physischen Zufahrtsschutz und erstellst einen Sicherheitsbericht für den Schutz vor Fahrzeugangriffen und unbefugtem Eindringen mit Kraftfahrzeugen (Vehicle Security Barriers / Hostile Vehicle Mitigation). Der Fokus liegt auf dem physischen Schutz von Gebäuden, Plätzen und Infrastruktur vor Terroranschlägen mit Fahrzeugen, Amokfahrten oder Unfällen. WICHTIG: Dies ist KEIN Cybersecurity-Bericht! Generiere ein JSON-Objekt mit sechs Schlüsseln: 'purpose', 'threatAnalysis', 'vulnerabilities', 'hvmMeasures', 'siteConsiderations', 'operationalImpact'. Die Sprache des Inhalts muss {language} sein. Fokussiere ausschließlich auf: Fahrzeugbarrieren, Poller, physische Sperren, Fahrzeuganprallschutz, Rammangriffe, Teststandards wie PAS 68 oder IWA 14, Geschwindigkeiten, Fahrzeugmassen, Anprallwinkel, Eindringtiefen. Erwähne NIEMALS: Malware, Cyberangriffe, Netzwerksicherheit, Software, IT-Systeme.",
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
            }
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
            "editMode": "Zufahrten bearbeiten"
        },
        "map": {
            "createReport": "Bericht erstellen",
            "downloadReport": "Bericht herunterladen",
            "searchPlaceholder": "Hövelhof",
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
            "reportCreationError": "Fehler bei der Berichtserstellung. Bitte versuchen Sie es erneut."
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
            "reportPrompt": "You are a specialist for physical vehicle access protection creating a security report for protection against vehicle attacks and unauthorized vehicle intrusion (Vehicle Security Barriers / Hostile Vehicle Mitigation). The focus is on physical protection of buildings, squares and infrastructure against vehicle terrorist attacks, rampage attacks or accidents. IMPORTANT: This is NOT a cybersecurity report! Generate a JSON object with six keys: 'purpose', 'threatAnalysis', 'vulnerabilities', 'hvmMeasures', 'siteConsiderations', 'operationalImpact'. The content's language must be {language}. Focus exclusively on: vehicle barriers, bollards, physical barriers, vehicle impact protection, ram attacks, test standards like PAS 68 or IWA 14, speeds, vehicle masses, impact angles, penetration depths. NEVER mention: malware, cyber attacks, network security, software, IT systems.",
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
            }
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
            "editMode": "Edit access points"
        },
        "map": {
            "createReport": "Create Report",
            "downloadReport": "Download Report",
            "searchPlaceholder": "Hövelhof",
            "searchButton": "Search",
            "setWaypoints": "Set Waypoints",
            "setWaypointsActive": "Drawing Active",
            "reset": "Reset",
            "securityAreaLabel": "Security Area",
            "securityArea": "Security Area",
            "analyzeAccess": "Analyze Access Route"
        },
        "placeholders": {
            "assetToProtect": "Please enter"
        },

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
        
        // Display products with lazy loading
        await displayProducts(products);
        
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
    // Manufacturer filter
    const manufacturerFilter = document.getElementById('manufacturer-filter') as HTMLSelectElement;
    if (manufacturerFilter) {
        const manufacturers = [...new Set(products.map(p => p.manufacturer).filter(Boolean))];
        manufacturers.forEach(manufacturer => {
            const option = document.createElement('option');
            option.value = manufacturer;
            option.textContent = manufacturer;
            manufacturerFilter.appendChild(option);
        });
    }
    
    // Standard filter (NEW DATABASE STRUCTURE)
    const standardFilter = document.getElementById('standard-filter') as HTMLSelectElement;
    if (standardFilter) {
        const standards = [...new Set(products.map(p => p.technical_data?.standard).filter(Boolean))];
        standards.forEach(standard => {
            const option = document.createElement('option');
            option.value = standard;
            option.textContent = standard;
            standardFilter.appendChild(option);
        });
    }
    
    // Material filter (NEW DATABASE STRUCTURE - replacing vehicle type)
    const vehicleTypeFilter = document.getElementById('vehicle-type-filter') as HTMLSelectElement;
    if (vehicleTypeFilter) {
        // Update to use material instead of vehicleType for new database structure
        const materials = [...new Set(products.map(p => p.technical_data?.material).filter(Boolean))];
        materials.forEach(material => {
            const option = document.createElement('option');
            option.value = material;
            option.textContent = material;
            vehicleTypeFilter.appendChild(option);
        });
    }
}

/**
 * Display products in the table
 */
async function displayProducts(products: any[]) {
    console.log('🎯 displayProducts called with', products.length, 'products');
    
    // Check if required HTML elements exist
    const tableBody = document.getElementById('products-tbody');
    const gridContainer = document.getElementById('products-grid');
    console.log('🔍 Table body element:', tableBody ? 'EXISTS' : 'MISSING');
    console.log('🔍 Grid container element:', gridContainer ? 'EXISTS' : 'MISSING');
    
    // Display in table view
    console.log('🎯 Calling displayProductsTable...');
    displayProductsTable(products);
    
    // Display in grid view
    console.log('🎯 Calling displayProductsGrid...');
    await displayProductsGrid(products);
    
    console.log('✅ displayProducts completed');
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

/**
 * Display products in grid format
 */
async function displayProductsGrid(products: any[]) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    
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
    
    // First, remove duplicates and invalid products
    const cleanedProducts = removeDuplicateProducts(products);
    
    // Sort products: products with REAL images first, then without images
    const sortedProducts = await sortProductsByImageAvailability(cleanedProducts);
    
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
                    <span>Kein Bild verfügbar</span>
                </div>
            </div>
            <div class="product-card-content">
                <div class="product-card-header">
                    <div class="product-card-title">${product.product_name || 'N/A'}</div>
                    <div class="product-card-manufacturer">${product.manufacturer || 'N/A'}</div>
                </div>
                <div class="product-card-classification">
                    <div class="product-card-type">
                        <span class="type-badge ${product.product_cluster?.toLowerCase() || 'unknown'}">${product.product_type || 'N/A'}</span>
                        <span class="cluster-badge">${product.product_cluster || 'N/A'}</span>
                    </div>
                    <div class="confidence-indicator">
                        <span class="confidence-label">Vertrauen:</span>
                        <span class="confidence-value">${product.product_type_confidence ? (product.product_type_confidence * 100).toFixed(0) + '%' : 'N/A'}</span>
                    </div>
                </div>
                <div class="product-card-specs">
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">Standard</div>
                        <div class="product-card-spec-value">${product.technical_data?.standard || 'N/A'}</div>
                    </div>
                    <div class="product-card-spec highlight-speed">
                        <div class="product-card-spec-label">Testgeschwindigkeit</div>
                        <div class="product-card-spec-value"><strong>${product.technical_data?.pr_speed_kph || 'N/A'} km/h</strong></div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">Fahrzeugtyp</div>
                        <div class="product-card-spec-value">${product.technical_data?.pr_veh || 'N/A'}</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">Anprallwinkel</div>
                        <div class="product-card-spec-value">${product.technical_data?.pr_angle_deg || 'N/A'}°</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">Eindringtiefe</div>
                        <div class="product-card-spec-value">${product.technical_data?.pr_pen_m || 'N/A'} m</div>
                    </div>
                </div>
                <div class="product-card-actions">
                    <button class="product-card-btn secondary" data-product-index="${index}">
                        Details anzeigen
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
 * Sort products by ACTUAL image availability - products with real images first
 */
async function sortProductsByImageAvailability(products: any[]): Promise<any[]> {
    console.log('Sorting products by ACTUAL image availability...');
    
    // Check actual image availability for all products
    const productsWithImageStatus = await Promise.all(
        products.map(async (product) => {
            const imagePath = generateProductImagePath(product);
            const hasRealImage = await checkImageExists(imagePath);
            const hasDatabaseFilename = product.product_image_file && product.product_image_file !== null && product.product_image_file.trim() !== '';
            return {
                ...product,
                hasRealImage: hasRealImage,
                hasDatabaseFilename: hasDatabaseFilename
            };
        })
    );
    
    // Sort by priority: 1) Products with database filename AND real image, 2) Products with real image (but no database filename), 3) Products without images
    const sorted = productsWithImageStatus.sort((a: any, b: any) => {
        // Priority 1: Products with database filename and real image
        if (a.hasDatabaseFilename && a.hasRealImage && !(b.hasDatabaseFilename && b.hasRealImage)) {
            console.log(`Sorting: "${a.product_name}" (database image) before "${b.product_name}"`);
            return -1;
        }
        if (b.hasDatabaseFilename && b.hasRealImage && !(a.hasDatabaseFilename && a.hasRealImage)) {
            console.log(`Sorting: "${b.product_name}" (database image) before "${a.product_name}"`);
            return 1;
        }
        
        // Priority 2: Products with real image (fallback to name-based image)
        if (a.hasRealImage && !b.hasRealImage) {
            console.log(`Sorting: "${a.product_name}" (has real image) before "${b.product_name}" (no image)`);
            return -1;
        }
        if (!a.hasRealImage && b.hasRealImage) {
            console.log(`Sorting: "${b.product_name}" (has real image) before "${a.product_name}" (no image)`);
            return 1;
        }
        
        return 0; // Equal priority
    });
    
    // Debug output
    const withDatabaseImages = sorted.filter(p => p.hasDatabaseFilename && p.hasRealImage);
    const withTypeBasedImages = sorted.filter(p => !p.hasDatabaseFilename && p.hasRealImage);
    const withoutImages = sorted.filter(p => !p.hasRealImage);
    console.log(`Sorting completed: ${withDatabaseImages.length} products with DATABASE images, ${withTypeBasedImages.length} products with TYPE-based images, ${withoutImages.length} products WITHOUT images`);
    
    console.log('First 5 products with database images:');
    withDatabaseImages.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. "${p.product_name}" - Database filename: ${p.product_image_file}`);
    });
    
    return sorted;
}

/**
 * Check if an image exists with optimized loading
 */
function checkImageExists(imagePath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            resolve(false);
        }, 1500); // Reduced timeout for faster loading
        
        img.onload = () => {
            clearTimeout(timeout);
            resolve(true);
        };
        
        img.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
        };
        
        // Add loading optimization
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = imagePath;
        
        // Timeout after 2 seconds to avoid hanging
        setTimeout(() => {
            console.log('⏰ Image check timeout:', imagePath);
            resolve(false);
        }, 2000);
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
        const imageFromDatabase = `${import.meta.env.BASE_URL}images/${product.product_image_file}`;
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
    
    // Parameter menu filters
    const productPropertySelect = document.getElementById('product-property-select');
    if (productPropertySelect) {
        productPropertySelect.addEventListener('change', filterProducts);
    }
    
    const vehicleSelect = document.getElementById('vehicle-select');
    if (vehicleSelect) {
        vehicleSelect.addEventListener('change', filterProducts);
    }
    
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

/**
 * Filter products based on search input and filter selections
 */
async function filterProducts() {
    const products = (window as any).productDatabase || [];
    const searchTerm = (document.getElementById('product-search') as HTMLInputElement)?.value.toLowerCase() || '';
    const manufacturer = (document.getElementById('manufacturer-filter') as HTMLSelectElement)?.value || '';
    const standard = (document.getElementById('standard-filter') as HTMLSelectElement)?.value || '';
    const vehicleType = (document.getElementById('vehicle-type-filter') as HTMLSelectElement)?.value || '';
    const minSpeed = (document.getElementById('speed-filter') as HTMLSelectElement)?.value || '';
    
    // Get parameter selections from parameter menu
    const productProperty = (document.getElementById('product-property-select') as HTMLSelectElement)?.value || '';
    const vehicleSelect = (document.getElementById('vehicle-select') as HTMLSelectElement)?.value || '';
    
    // Get maximum detected speed from threat analysis
    const detectedMaxSpeed = getMaxDetectedSpeed();
    
    console.log('🔍 Filter Parameters:', {
        productProperty,
        vehicleSelect,
        detectedMaxSpeed,
        minSpeed
    });
    
    const filteredProducts = products.filter((product: any) => {
        // Exclude Roadblocker products
        const productNameLower = product.product_name?.toLowerCase() || '';
        if (productNameLower.includes('roadblocker') || productNameLower.includes('road blocker')) {
            return false;
        }
        
        const matchesSearch = !searchTerm || 
            product.manufacturer?.toLowerCase().includes(searchTerm) ||
            product.product_name?.toLowerCase().includes(searchTerm) ||
            product.technical_data?.standard?.toLowerCase().includes(searchTerm);
        
        const matchesManufacturer = !manufacturer || product.manufacturer === manufacturer;
        const matchesStandard = !standard || product.technical_data?.standard === standard;
        // Updated to use material filter for new database structure
        const matchesVehicleType = !vehicleType || product.technical_data?.material === vehicleType;
        
        // Speed filter - use detected speed if available, otherwise use manual filter
        const requiredSpeed = detectedMaxSpeed > 0 ? detectedMaxSpeed : (minSpeed ? parseFloat(minSpeed) : 0);
        const matchesSpeed = requiredSpeed === 0 || (() => {
            let productSpeed = 0;
            
            // Get product speed from the new technical data fields
            if (product.technical_data?.pr_speed_kph) {
                productSpeed = parseFloat(product.technical_data.pr_speed_kph);
            } else if (product.speed) {
                productSpeed = parseFloat(product.speed);
            } else if (product.technical_data?.performance_rating) {
                // Extract from performance rating as fallback
                const parts = product.technical_data.performance_rating.split('/');
                if (parts.length >= 3) {
                    const speedPart = parts[2];
                    productSpeed = parseFloat(speedPart) || 0;
                }
            }
            
            return !isNaN(productSpeed) && productSpeed >= requiredSpeed;
        })();
        
        // Vehicle selection filter based on parameter menu
        const matchesVehicleSelection = !vehicleSelect || vehicleSelect === 'alle' || (() => {
            const selectedMass = parseFloat(vehicleSelect);
            if (isNaN(selectedMass)) return true;
            
            const productMass = product.technical_data?.pr_mass_kg;
            if (!productMass) return false;
            
            // Product must be able to handle at least the selected vehicle mass
            return productMass >= selectedMass;
        })();
        
        // Product property filter - if "entfernbar" is selected, only show freestanding products
        const matchesProductProperty = !productProperty || productProperty === 'aut./starr' || productProperty === 'versenkbar' || (() => {
            if (productProperty === 'entfernbar') {
                const foundationDepth = product.technical_data?.foundation_depth || '';
                // Only show products that are freestanding (no ground fixings)
                return foundationDepth.includes('A - Free standing (no ground fixings)');
            }
            return true;
        })();
        
        return matchesSearch && matchesManufacturer && matchesStandard && matchesVehicleType && matchesSpeed && matchesVehicleSelection && matchesProductProperty;
    });
    
    console.log(`✅ Filtered ${filteredProducts.length} products from ${products.length} total`);
    
    await displayProducts(filteredProducts);
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
 * Show product details in modal
 */
function showProductDetails(productIndex: number) {
    const products = (window as any).productDatabase || [];
    const product = products[productIndex];
    
    if (!product) return;
    
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
            <p><strong>Produktname:</strong> ${product.product_name || 'N/A'}</p>
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
            <p><strong>Standard getestet nach:</strong> ${product.technical_data?.standard_tested_to || 'N/A'}</p>
            <p><strong>Download Datum:</strong> ${product.technical_data?.download_date || 'N/A'}</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #e3f2fd; border-radius: 8px;">
                <h4 style="margin-bottom: 12px; color: #1565c0;">🏷️ Produktklassifizierung</h4>
                <p><strong>Produkttyp:</strong> ${product.product_type || 'N/A'}</p>
                <p><strong>Cluster:</strong> ${product.product_cluster || 'N/A'}</p>
                <p><strong>Vertrauenswert:</strong> ${product.product_type_confidence ? (product.product_type_confidence * 100).toFixed(0) + '%' : 'N/A'}</p>
                <p><strong>Erkennungsquelle:</strong> ${product.product_type_source || 'N/A'}</p>
            </div>
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px;">
                <h4 style="margin-bottom: 12px; color: #495057;">⚡ Testparameter</h4>
                <p><strong>Fahrzeuggewicht:</strong> ${product.technical_data?.pr_mass_kg || 'N/A'} kg</p>
                <p><strong>Fahrzeugtyp:</strong> ${product.technical_data?.pr_veh || 'N/A'}</p>
                <p><strong>Testgeschwindigkeit:</strong> ${product.technical_data?.pr_speed_kph || 'N/A'} km/h</p>
                <p><strong>Anprallwinkel:</strong> ${product.technical_data?.pr_angle_deg || 'N/A'}°</p>
                <p><strong>Eindringtiefe:</strong> ${product.technical_data?.pr_pen_m || 'N/A'} m</p>
                <p><strong>Trümmerstreuweite:</strong> ${product.technical_data?.pr_debris_m || 'N/A'} m</p>
            </div>
        `;
    }
    
    // Certification
    const certification = document.getElementById('modal-certification');
    if (certification) {
        certification.innerHTML = `
            <p><strong>${t('manufacturer.sidebar.productDatabase.standard')}:</strong> ${product.technical_data?.standard || 'N/A'}</p>
            <p><strong>Datenblatt URL:</strong> ${product.datasheet_url ? `<a href="${product.datasheet_url}" target="_blank">${product.datasheet_url}</a>` : 'N/A'}</p>
            <p><strong>Produktbild:</strong> ${product.product_image_file || 'N/A'}</p>
        `;
    }
    
    // Show modal
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Store current product index for language switching
        (modal as any).currentProductIndex = productIndex;
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
    // Debug: Log which translations source is being used
    console.log(`Translation request for key: ${key}, language: ${currentLanguage}`);
    console.log(`Translations source:`, translations === embeddedTranslations ? 'embedded' : 'external');
    
    // Debug: Log the structure of translations
    console.log('Current translations structure:', translations);
    console.log('Embedded translations structure:', embeddedTranslations);
    
    // Ensure we have translations available
    if (!translations || !translations[currentLanguage]) {
        console.warn(`No translations loaded for language: ${currentLanguage}, using embedded`);
        translations = embeddedTranslations;
    }
    
    let text = getProperty(translations[currentLanguage as keyof typeof translations], key);
    console.log(`Text from main translations for key '${key}':`, text);
    
    // If still no text found, try embedded translations
    if (typeof text !== 'string') {
        console.warn(`Translation key not found in main translations for language '${currentLanguage}': ${key}`);
        text = getProperty(embeddedTranslations[currentLanguage as keyof typeof embeddedTranslations], key);
        console.log(`Text from embedded translations for key '${key}':`, text);
        
        if (typeof text !== 'string') {
            console.warn(`Translation key not found in embedded translations for language '${currentLanguage}': ${key}`);
            // Return a more user-friendly fallback instead of the raw key
            const fallbackText = getFallbackText(key);
            console.log(`Fallback text for key '${key}':`, fallbackText);
            return fallbackText || key;
        }
    }
    
    if (replacements) {
        for (const placeholder in replacements) {
            text = text.replace(`{${placeholder}}`, String(replacements[placeholder]));
        }
    }
    
    console.log(`Final translation result for ${key}:`, text);
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
        'nav.threatAnalysis': 'Gefahrenanalyse',
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
                
                // Recreate polygon with stored coordinates
                drawnPolygon = L.polygon(currentMapState.drawnPolygon, {
                    color: '#ff7800',
                    weight: 3,
                    opacity: 0.8,
                    fillColor: '#ff7800',
                    fillOpacity: 0.2
                }).addTo(map);
                
                // Restore polygon label if it existed
                if (polygonLabel) {
                    map.removeLayer(polygonLabel);
                }
                
                const center = drawnPolygon.getBounds().getCenter();
                polygonLabel = L.marker(center, {
                    icon: L.divIcon({
                        className: 'polygon-label',
                        html: `<div style="background: white; padding: 5px; border: 2px solid #ff7800; border-radius: 5px; font-weight: bold; color: #ff7800;">${t('map.securityArea')}</div>`,
                        iconSize: [120, 40],
                        iconAnchor: [60, 20]
                    })
                }).addTo(map);
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
    
    const mapCenter: [number, number] = [51.8233, 8.6675]; // Hövelhof (NRW)
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
        // PROTECT: Never remove the security area polygon (drawnPolygon)
        if (layer === drawnPolygon) {
            console.log(`🛡️ PROTECTED: Skipping security area polygon - cannot be deleted from threat analysis tab`);
            console.warn(`⚠️ SECURITY: Attempted to delete security area polygon from threat analysis tab - this is not allowed!`);
            return;
        }
        
        // PROTECT: Never remove the polygon label
        if (layer === polygonLabel) {
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
            // PROTECT: Never remove the security area polygon (drawnPolygon)
            if (m === drawnPolygon) {
                console.log(`🛡️ PROTECTED: Keeping security area polygon in ${key}`);
                return true;
            }
            
            // PROTECT: Never remove the polygon label
            if (m === polygonLabel) {
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
            // PROTECT: Never remove the security area polygon (drawnPolygon)
            if (layer === drawnPolygon) {
                console.log(`🛡️ PROTECTED: Skipping security area polygon in final check`);
                return;
            }
            
            // PROTECT: Never remove the polygon label
            if (layer === polygonLabel) {
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
const clearThreatAnalysis = () => {
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
        (window as any).entryDetectionManager.clearCandidates();
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
    if (!drawnPolygon) return 100; // Default if no security area defined
    
    const polygonVertices = drawnPolygon.getLatLngs()[0].map((ll: any) => ({lat: ll.lat, lon: ll.lng}));
    
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
    if (!drawnPolygon) {
        alert(t('alerts.noPolygon'));
        return;
    }

    // Enhanced polygon validation
    if (!drawnPolygon.getLatLngs || typeof drawnPolygon.getLatLngs !== 'function') {
        console.error('Invalid polygon object - missing getLatLngs method');
        alert(t('alerts.invalidPolygon'));
        return;
    }

    const polygonCoords = drawnPolygon.getLatLngs();
    if (!polygonCoords || polygonCoords.length === 0) {
        console.error('Polygon has no coordinates');
        alert(t('alerts.emptyPolygon'));
        return;
    }

    console.log(`Analyzing threats for polygon with ${polygonCoords.length} coordinate sets`);
    console.log('Polygon coordinates:', polygonCoords);

    const loadingIndicator = document.querySelector('.loading-indicator') as HTMLElement;
    if (!loadingIndicator) return;
    
    clearThreatAnalysis();
    loadingIndicator.classList.remove('hidden');

    try {
        const bounds = drawnPolygon.getBounds();
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
        
        const query = `
            [out:json][timeout:30];
            (
              way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|living_street|track)$"](bbox:${bbox});
              way["highway"~"^(motorway|trunk)$"](bbox:${bbox});
              way["highway"="cycleway"]["motor_vehicle"!="no"](bbox:${bbox});
              way["railway"="tram"](bbox:${bbox});
              way["access"~"^(yes|permissive)$"]["highway"](bbox:${bbox});
            );
            (._;>;);
            out geom;
        `;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        console.log('🌐 THREAT ANALYSIS Query URL:', url);
        console.log('🔍 THREAT ANALYSIS Raw query:', query);

        let data;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(t('alerts.overpassError', { status: response.status }));
            }
            data = await response.json();
            const elementCount = data?.elements?.length || 0;
            console.log('🎯 THREAT ANALYSIS OSM Data received:', elementCount, 'elements');
            
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
        } catch (error) {
            console.error('🚨 THREAT ANALYSIS Overpass API error:', error);
            alert(t('alerts.analysisError'));
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
                    // Generate descriptive name for unnamed roads
                    if (el.tags.highway === 'residential') roadName = `Wohnstraße (ID:${el.id})`;
                    else if (el.tags.highway === 'service') roadName = `Erschließungsstraße (ID:${el.id})`;
                    else if (el.tags.highway === 'unclassified') roadName = `Nebenstraße (ID:${el.id})`;
                    else if (el.tags.highway === 'track') roadName = `Wirtschaftsweg (ID:${el.id})`;
                    else if (el.tags.ref) roadName = el.tags.ref;
                    else roadName = `${el.tags.highway || 'Straße'} (ID:${el.id})`;
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
        console.log('🔄 Updating product filter with detected parameters...');
        await filterProducts();
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
        if (!apiKey || isGithubPages) {
            // Public demo (GitHub Pages) oder kein Key vorhanden: erzeugen wir statische Platzhalterabschnitte
            console.warn('AI disabled for public/demo build. Using placeholder report sections.');
            return buildReportFromStateFallback(context);
        }
        const ai = new GoogleGenAI({ apiKey });
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
        
        // Enhanced context with threat level analysis and product recommendations
        const enhancedContext = {
            ...context,
            threatAnalysis: generateThreatAnalysisText(),
            highestThreatRoads: getHighestThreatRoads(),
            threatLevelDistribution: getThreatLevelDistribution(),
            locationContext: locationContext,
            recommendedProductTypes: recommendedProductTypes.join(', '),
            averageThreatLevel: avgThreatLevel.toFixed(1),
            productTypeJustification: generateProductTypeJustification(recommendedProductTypes, context.assetToProtect || '', locationContext, avgThreatLevel)
        };
        
        const prompt = t('ai.reportPrompt', enhancedContext) + 
        `\n\nENHANCED THREAT ANALYSIS:
        ${enhancedContext.threatAnalysis}
        
        HIGHEST THREAT ROADS:
        ${enhancedContext.highestThreatRoads}
        
        THREAT LEVEL DISTRIBUTION:
        ${enhancedContext.threatLevelDistribution}
        
        RECOMMENDED PRODUCT TYPES:
        ${enhancedContext.recommendedProductTypes}
        
        PRODUCT TYPE JUSTIFICATION:
        ${enhancedContext.productTypeJustification}
        
        LOCATION CONTEXT: ${enhancedContext.locationContext}
        AVERAGE THREAT LEVEL: ${enhancedContext.averageThreatLevel}/10
        
        IMPORTANT: Generate the report in ${currentLanguage === 'de' ? 'German' : 'English'} language only. All text must be in ${currentLanguage === 'de' ? 'German' : 'English'}. 
        Focus on the threat level analysis and provide specific justifications for each threat level based on road type, traffic speed, and vehicle access capabilities.
        Include the recommended product types and explain why they are suitable for this specific context and threat level.`;

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
        
        const jsonText = (response.text || '').trim();
        const aiSections = JSON.parse(jsonText);
        
        // KI-Text nachträglich übersetzen, falls er in der falschen Sprache ist
        return translateAISections(aiSections);

    } catch (error) {
        console.error("Fehler bei der Gemini-API-Anfrage für den Bericht:", error);
        alert(t('alerts.geminiError'));
        return null;
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
        const schutzgueter = ps.schutzgüter?.join(', ') || context.assetToProtect || t('report.undefinedAsset');
        const bedrohung = ps.risiko?.bedrohung?.art || t('report.undefinedValue');
        const vKmh = ps.risiko?.dynamik?.v_kmh || context.estimatedSpeedKmH || t('report.undefinedValue');
        const untergrund = ps.risiko?.site?.untergrund || t('report.undefinedValue');
        const restrisiko = ps.restrisiko?.klasse || context.securityLevel || t('report.undefinedValue');
        const corridors = (ps.risiko?.site?.anfahrkorridore && ps.risiko.site.anfahrkorridore.length>0)
            ? t('report.identifiedCorridors', { count: ps.risiko.site.anfahrkorridore.length })
            : t('report.noChatGeometry');

        if (currentLanguage === 'de') {
            return {
                purpose: `Schutzziel: Sicherung von ${schutzgueter} am Standort ${context.locationName}. Der Assistent lieferte ergänzende Eingaben (Normbezug DIN SPEC 91414‑2 / ISO 22343‑2).`,
                threatAnalysis: `Bedrohungsannahme: ${bedrohung}. Aus der Karten-/Chat-Analyse ergibt sich eine Zufahrtsgeschwindigkeit von ca. ${vKmh} km/h. Anfahrkorridore laut Chat: ${corridors}.`,
                vulnerabilities: `Untergrund/Fundamente: ${untergrund}. Restrisiko (Chat/Slider): ${restrisiko}. Kritische Zufahrtswinkel bzw. Engstellen sind bei der Maßnahmendefinition zu berücksichtigen.`,
                hvmMeasures: `Empfohlene Maßnahmen orientieren sich an der erwarteten Geschwindigkeit und den Schutzzielen. Für ${schutzgueter} mit Geschwindigkeit ~${vKmh} km/h sind FSB mit entsprechendem Leistungsniveau, geprüften Fundamenten und Berücksichtigung des Anprallwinkels anzusetzen.`,
                siteConsiderations: `Betriebliche Rahmenbedingungen (z. B. Feuerwehrzufahrt, Fluchtwege) aus Chat sollten in die Detailplanung einfließen. Untergrund: ${untergrund}.`,
                operationalImpact: `Maßnahmen sind so auszulegen, dass Betrieb, Rettungswege und Gestaltung berücksichtigt sind; temporäre Anpassungen (Events) werden unterstützt.`
            };
        } else {
            return {
                purpose: `Protection objective: Securing ${schutzgueter} at location ${context.locationName}. The assistant provided additional inputs (standard reference DIN SPEC 91414‑2 / ISO 22343‑2).`,
                threatAnalysis: `Threat assumption: ${bedrohung}. From the map/chat analysis, an access speed of approximately ${vKmh} km/h results. Access corridors according to chat: ${corridors}.`,
                vulnerabilities: `Ground/foundations: ${untergrund}. Residual risk (Chat/Slider): ${restrisiko}. Critical impact angles or bottlenecks must be considered in measure definition.`,
                hvmMeasures: `Recommended measures are oriented to expected speed and protection objectives. For ${schutzgueter} with speed ~${vKmh} km/h, FSB with corresponding performance level, tested foundations and consideration of impact angle should be applied.`,
                siteConsiderations: `Operational framework conditions (e.g., fire brigade access, escape routes) from chat should flow into detailed planning. Ground: ${untergrund}.`,
                operationalImpact: `Measures are designed so that operations, rescue routes and design are considered; temporary adaptations (events) are supported.`
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
                addInteractiveTooltip(marker, streetName, maxSpeed, selectedProduct);
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
            
            // ⚠️ FIX: Entry Detection provides SHORT path to polygon edge, not acceleration distance!
            // Entry Detection distance is the geometric path length to polygon edge (typically 5-30m)
            // For realistic speed calculation, we need the actual vehicle acceleration distance
            // Use 100m as standard acceleration distance for entry points (typical for security barriers)
            const standardAccelerationDistance = 100;
            
            const maxSpeed = Math.round(calculateVelocity(accelerationRange[1], standardAccelerationDistance));
            console.log(`🚗 Entry Detection candidate ${index + 1}: pathDistance=${candidate.distanceMeters}m, using accelerationDistance=${standardAccelerationDistance}m, speed=${maxSpeed} km/h`);
            
            // Find suitable products
            const recommendedProducts = findProductsForSpeed(maxSpeed);
            
            if (recommendedProducts.length > 0) {
                const selectedProduct = selectOptimalProduct(recommendedProducts, maxSpeed, `Zufahrt ${index + 1}`, index);
                addInteractiveTooltip(marker, `Zufahrt ${index + 1}`, maxSpeed, selectedProduct);
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
    
    console.log(`🚗 Calculating speed for entry point ${entryPointIndex}: distance=${distance}m, acceleration=${accelerationRange[1]}m/s²`);
    
    const speed = calculateVelocity(accelerationRange[1], distance);
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
        // Exclude Roadblocker products
        const productNameLower = product.product_name?.toLowerCase() || '';
        if (productNameLower.includes('roadblocker') || productNameLower.includes('road blocker')) {
            return false;
        }
        
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
function createEntryDetectionMarkers() {
    const manager = (window as any).entryDetectionManager;
    if (!manager || !manager.candidates || manager.candidates.length === 0) {
        return;
    }
    
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
    
    console.log(`🔍 Processing ${manager.candidates.length} entry detection candidates...`);
    
    manager.candidates.forEach((candidate: any, index: number) => {
        console.log(`🔍 Processing candidate ${index + 1}/${manager.candidates.length}: ${candidate.id}`);
        
        // Check if this candidate uses Erschließungsstraßen
        let isErschliessung = false;
        
        if (candidate.wayIds && candidate.wayIds.length > 0) {
            // Check if any of the ways used by this candidate are Erschließungsstraßen
            for (const wayId of candidate.wayIds) {
                const way = waysMap.get(wayId);
                if (way && isErschliessungsstrasse(way)) {
                    isErschliessung = true;
                    break;
                }
            }
        }
        
        // Determine marker color based on Erschließungsstraße status
        let markerColor, fillColor;
        if (isErschliessung) {
            // Fully yellow for Erschließungsstraßen (both border and fill)
            markerColor = '#FFD700';  // Gold border
            fillColor = '#FFD700';    // Gold fill
        } else {
            // Red for regular access points
            markerColor = '#DC143C';  // Crimson
            fillColor = '#FF6347';    // Tomato
        }
        
        // Create marker at intersection point
        const marker = L.circle([candidate.intersectionPoint[1], candidate.intersectionPoint[0]], {
            radius: 8,
            color: markerColor,
            fillColor: fillColor,
            fillOpacity: 0.8,
            weight: 3
        });

        // Add right-click context menu for deletion
        console.log(`🔧 Adding right-click functionality to marker ${index + 1} (${isErschliessung ? 'Erschließungsstraße' : 'Hauptzufahrt'})`);
        marker.on('contextmenu', (e: any) => {
            e.originalEvent.preventDefault();
            
            console.log('🖱️ Right-click detected on entry point');
            console.log('Current active tab:', currentActiveTab);
            console.log('Marker type:', isErschliessung ? 'Erschließungsstraße' : 'Hauptzufahrt');
            console.log('Candidate ID:', candidate.id);
            
            // Check if we're in the threat analysis tab
            if (currentActiveTab !== 'nav-threat-analysis') {
                console.log('⚠️ Entry point deletion only allowed in threat analysis tab');
                return;
            }
            
            // Show local deletion bubble
            createDeletionBubble(marker, candidate, isErschliessung);
        });
        
        // Also add click event for debugging
        marker.on('click', (e: any) => {
            console.log('🖱️ Left-click detected on entry point');
            console.log('Marker type:', isErschliessung ? 'Erschließungsstraße' : 'Hauptzufahrt');
            console.log('Candidate ID:', candidate.id);
        });
        
        // Create popup content
        const popupContent = `
            <div style="min-width: 200px;">
                <b>🚪 Zufahrtspunkt ${index + 1}</b><br>
                <b>Typ:</b> ${isErschliessung ? 'Erschließungsstraße' : 'Hauptzufahrt'}<br>
                <b>Confidence:</b> ${Math.round(candidate.confidence * 100)}%<br>
                <b>Distanz:</b> ${Math.round(candidate.distanceMeters)}m<br>
                <b>Geradheit:</b> ${Math.round(candidate.straightness * 100)}%<br>
                <b>Kontinuität:</b> ${Math.round(candidate.continuity * 100)}%<br>
                <b>Ways:</b> ${candidate.wayIds.length}
            </div>
        `;
        
        marker.bindPopup(popupContent);
        threatLayerGroup?.addLayer(marker);
        
        console.log(`✅ Marker ${index + 1} added to map (${isErschliessung ? 'Erschließungsstraße' : 'Hauptzufahrt'})`);
        
        // Store marker for potential future reference
        if (!threatMarkersMap.has('entry-detection')) {
            threatMarkersMap.set('entry-detection', []);
        }
        const entryMarkers = threatMarkersMap.get('entry-detection');
        if (entryMarkers) {
            entryMarkers.push(marker);
            console.log(`📝 Marker ${index + 1} stored in threatMarkersMap (total: ${entryMarkers.length})`);
        }
    });
    
    console.log(`✅ Created ${manager.candidates.length} entry detection markers`);
    console.log(`📊 Total markers in threatMarkersMap: ${threatMarkersMap.get('entry-detection')?.length || 0}`);
}

/**
 * Add interactive tooltip to a marker
 */
function addInteractiveTooltip(marker: any, streetName: string, maxSpeed: number, product: any) {
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
    marker.on('click', (e: any) => {
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
                
                // Remove from pinned products
                const productIndex = pinnedProducts.findIndex(pp => pp.marker === marker);
                if (productIndex !== -1) {
                    pinnedProducts.splice(productIndex, 1);
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
            
            // Add to pinned products list
            pinnedProducts.push({
                streetName: streetName,
                maxSpeed: maxSpeed,
                product: product,
                marker: marker
            });
            console.log(`📌 Product pinned: ${streetName} - ${product.product_name}`);
            
            // Add close event handler for popup
            leafletPopup.on('remove', () => {
                    isPinned = false;
                leafletPopup = null;
                // Remove from pinned products
                const productIndex = pinnedProducts.findIndex(pp => pp.marker === marker);
                if (productIndex !== -1) {
                    pinnedProducts.splice(productIndex, 1);
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
    
    // Clear the pinned tooltips array
    pinnedTooltips = [];
    pinnedProducts = [];
    
    console.log('All product tooltips and popups cleared');
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
                scale: 2, // Higher resolution
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
        
        // Generate threat list in table format
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
            
            // Sort by maxSpeed in descending order
            threatsArray.sort((a: any, b: any) => b.maxSpeed - a.maxSpeed);
            
            // Create table format
            threatList = `
                <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #f0f0f0; font-weight: bold;">
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${t('report.threatsTable.street')}</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${t('report.threatsTable.distance')}</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${t('report.threatsTable.maxSpeed')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${threatsArray.map(threat => `
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 8px;">${threat.name}</td>
                                <td style="border: 1px solid #ddd; padding: 8px;">${threat.lengthInMeters} m</td>
                                <td style="border: 1px solid #ddd; padding: 8px;">${threat.maxSpeed} km/h</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
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
        
        // Report Header (wrapped to page width)
        const headerText = t('report.mainTitle', { locationName: locationName });
        pdf.setFont('helvetica', 'bold').setFontSize(18);
        const headerLines = pdf.splitTextToSize(headerText, content_width);
        const headerLineHeight = 8;
        if (currentY + (headerLines.length * headerLineHeight) > 280) {
            pdf.addPage();
            addWatermarkToCurrentPage();
            currentY = 25;
        }
        pdf.text(headerLines, page_margin, currentY);
        currentY += (headerLines.length * headerLineHeight) + 5;
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
                    const minSpeed = Math.round(calculateVelocityWithOsm(minAcc, data.totalLength));
                    const maxSpeed = Math.round(calculateVelocityWithOsm(maxAcc, data.totalLength));
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

function downloadTenderReport() {
    if (generatedTenderPdf) {
        const locationName = drawnPolygon ? 'Location' : 'Location';
        const locationForFilename = locationName.split(',')[0].trim();
        const filename = `Ausschreibung Zufahrtsschutz ${locationForFilename}.pdf`;
        generatedTenderPdf.save(filename);
    } else {
        alert('Es wurde noch keine Ausschreibung erstellt, die heruntergeladen werden könnte.');
    }
}

/**
 * Generate tender (Ausschreibung) PDF using pinned products and Gemini AI
 */
async function generateTender() {
    console.log('📄 Starting tender generation...');
    console.log('📄 Pinned products count:', pinnedProducts.length);
    
    if (pinnedProducts.length === 0) {
        alert('Bitte pinnen Sie zuerst Produkte in der Produktauswahl an.');
        return;
    }

    const tenderIframe = document.getElementById('tender-iframe') as HTMLIFrameElement;
    const loadingOverlay = document.querySelector('.report-loading-overlay') as HTMLElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const tenderPreviewArea = document.getElementById('tender-preview-area') as HTMLElement;
    
    if (loadingOverlay) loadingOverlay.classList.remove('view-hidden');

    try {
        // Get location name
        const locationName = drawnPolygon ? await getReportLocationName(drawnPolygon.getBounds().getCenter()) : 'Standort';
        console.log('📄 Location name:', locationName);
        
        // Collect technical data from pinned products
        const productSpecs = pinnedProducts.map(pp => {
            const prod = pp.product;
            return {
                productName: prod.product_name || 'Unbekannt',
                manufacturer: prod.manufacturer || 'Unbekannt',
                maxSpeed: pp.maxSpeed,
                streetName: pp.streetName,
                technicalData: prod.technical_data || {},
                performanceRating: prod.performance_rating || prod.technical_data?.performance_rating || 'Keine',
                standards: prod.standard || prod.technical_data?.standard || []
            };
        });
        console.log('📄 Product specs:', productSpecs);

        // Generate AI tender text with Gemini
        console.log('📄 Generating AI tender text...');
        const aiTenderText = await generateAITenderText(productSpecs, locationName);
        console.log('📄 AI tender text generated, length:', aiTenderText.length);

        // Create PDF - get from window.jspdf like in generateRiskReport
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        // Helper function to add watermark (same format as risk report)
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
            pdf.text('VERTRAULICH', (pageWidth / 2) + 50, (pageHeight / 2) + 50, { align: 'center', angle: 45 });
            pdf.restoreGraphicsState();
        };
        
        // Helper function to add header (same as risk report)
        const addHeader = (pageNum: number, totalPages: number) => {
            const pageWidth = pdf.internal.pageSize.getWidth();
            pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 100, 100);
            pdf.text(`Ausschreibung Zufahrtsschutz`, 20, 12);
            pdf.text(`Seite ${pageNum} von ${totalPages}`, pageWidth - 20, 12, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
        };
        
        // Helper function to add footer (same as risk report)
        const addFooter = () => {
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 100, 100);
            const date = new Date().toLocaleDateString('de-DE');
            pdf.text(date, 20, pageHeight - 10);
            pdf.text(`Vertraulich - Barricadix`, pageWidth - 20, pageHeight - 10, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
        };

        // Set up constants - DIN A4 margins (20mm left/right, 25mm top for header)
        const page_margin = 20;
        const top_margin = 25; // Space for header
        const page_width = pdf.internal.pageSize.getWidth();
        const content_width = page_width - (page_margin * 2);
        let currentY = top_margin;

        // Helper function to process bullet points with proper indentation
        const processBulletPoints = (content: string, width: number): string => {
            const lines = content.split('\n');
            let processed = '';
            let inList = false;
            
            lines.forEach((line, index) => {
                line = line.trim();
                if (!line) {
                    processed += '\n';
                    inList = false;
                    return;
                }
                
                // Check if line is a bullet point (starts with - or *)
                const isBullet = line.match(/^[-*]\s+(.+)$/);
                const isSubBullet = line.match(/^\s+[-*]\s+(.+)$/);
                
                if (isBullet || isSubBullet) {
                    const indent = isSubBullet ? '    ' : '  '; // 4 spaces for sub-bullet, 2 for main bullet
                    const text = (isBullet?.[1] || isSubBullet?.[1] || '').trim();
                    processed += `${indent}• ${text}\n`;
                    inList = true;
                } else if (inList && line.startsWith('-') === false && line.startsWith('*') === false) {
                    // Regular text after a bullet list
                    inList = false;
                    processed += `${line}\n`;
                } else {
                    processed += `${line}\n`;
                    inList = false;
                }
            });
            
            return processed.trim();
        };

        // Helper function to add a section (same as in generateRiskReport)
        const addSection = (title: string, content: string) => {
            if (currentY > 250) { // Check for page break before adding section
                pdf.addPage();
                const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
                addWatermarkToCurrentPage();
                addHeader(1, totalPages);
                addFooter();
                currentY = top_margin;
            }
            // Clean title from markdown artifacts
            const cleanTitle = title.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim();
            pdf.setFont('helvetica', 'bold').setFontSize(14).text(cleanTitle, page_margin, currentY);
            currentY += 10; // Extra line break after heading
            
            // Process content line by line for proper bullet point handling
            const lines = content.split('\n');
            const bulletIndent = 8; // Indentation for bullet points in mm
            const lineHeight = 5;
            
            lines.forEach((line, index) => {
                if (currentY + lineHeight > 280) {
                    pdf.addPage();
                    const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
                    addWatermarkToCurrentPage();
                    addHeader(totalPages, totalPages);
                    addFooter();
                    currentY = top_margin;
                }
                
                const trimmedLine = line.trim();
                if (!trimmedLine) {
                    currentY += lineHeight;
                    return;
                }
                
                // Check if it's a bullet point (looks for "•" or "-" at the start with indentation)
                const bulletMatch = line.match(/^(\s*)•\s+(.+)$/);
                const dashMatch = trimmedLine.match(/^-\s+(.+)$/);
                
                if (bulletMatch || dashMatch) {
                    const indent = bulletMatch ? bulletMatch[1].length * 2 : 0; // Calculate indent in mm
                    const text = bulletMatch ? bulletMatch[2] : (dashMatch ? dashMatch[1] : trimmedLine);
                    const textLines = pdf.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(text, content_width - bulletIndent - indent);
                    
                    textLines.forEach((textLine: string) => {
                        if (currentY + lineHeight > 280) {
                            pdf.addPage();
                            const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
                            addWatermarkToCurrentPage();
                            addHeader(totalPages, totalPages);
                            addFooter();
                            currentY = 25;
                        }
                        pdf.text(textLine, page_margin + bulletIndent + indent, currentY);
                        currentY += lineHeight;
                    });
                } else {
                    // Regular text
                    const textLines = pdf.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(trimmedLine, content_width);
                    
                    textLines.forEach((textLine: string) => {
                        if (currentY + lineHeight > 280) {
                            pdf.addPage();
                            const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
                            addWatermarkToCurrentPage();
                            addHeader(totalPages, totalPages);
                            addFooter();
                            currentY = 25;
                        }
                        pdf.text(textLine, page_margin, currentY);
                        currentY += lineHeight;
                    });
                }
            });
            
            currentY += 5; // Extra space after section
        };

        // Add watermark, header and footer to first page
        addWatermarkToCurrentPage();
        addHeader(1, 1);
        addFooter();

        // Tender Header (same style as risk report)
        const locationForFilename = locationName.split(',')[0].trim(); // Get first part (e.g., "Allee" or "Hövelhof")
        const headerText = `Ausschreibung Zufahrtsschutz ${locationForFilename}`;
        pdf.setFont('helvetica', 'bold').setFontSize(18);
        const headerLines = pdf.splitTextToSize(headerText, content_width);
        const headerLineHeight = 8;
        if (currentY + (headerLines.length * headerLineHeight) > 280) {
            pdf.addPage();
            const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
            addWatermarkToCurrentPage();
            addHeader(totalPages, totalPages);
            addFooter();
            currentY = 25;
        }
        pdf.text(headerLines, page_margin, currentY);
        currentY += (headerLines.length * headerLineHeight) + 5;
        pdf.setDrawColor(30, 144, 255).setLineWidth(0.5).line(page_margin, currentY, page_width - page_margin, currentY);
        currentY += 15;

        // Metadata
        pdf.setFont('helvetica', 'normal').setFontSize(10);
        const date = new Date().toLocaleDateString('de-DE');
        pdf.text(`Standort: ${locationName}`, page_margin, currentY);
        currentY += 6;
        pdf.text(`Erstellt am: ${date}`, page_margin, currentY);
        currentY += 6;
        pdf.text(`Anzahl Zufahrten: ${productSpecs.length}`, page_margin, currentY);
        currentY += 15;

        // Main tender text from AI (as sections)
        // First, try to split by Markdown headings (## or ###)
        let sections = aiTenderText.split(/(?=^#{2,3}\s)/m).filter(s => s.trim());
        
        // If no markdown headings found, try number sections
        if (sections.length <= 1) {
            sections = aiTenderText.split(/^\d+\.\s+/m).filter(s => s.trim());
        }
        
        sections.forEach((section, index) => {
            if (section.trim()) {
                const lines = section.trim().split('\n');
                let title = lines[0] || `Abschnitt ${index + 1}`;
                
                // Remove all markdown heading markers
                title = title.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim();
                
                // Get content without the title
                const content = lines.slice(1).join('\n').trim();
                
                // Process bullet points with proper indentation
                const processedContent = processBulletPoints(content, content_width);
                
                addSection(title, processedContent || title);
            }
        });

        // Add product specifications as a section
        if (currentY > 250) {
            pdf.addPage();
            const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
            addWatermarkToCurrentPage();
            addHeader(totalPages, totalPages);
            addFooter();
            currentY = 25;
        }
        
        pdf.setFont('helvetica', 'bold').setFontSize(14).text('Technische Details', page_margin, currentY);
        currentY += 10; // Extra line break after heading
        
        pdf.setFont('helvetica', 'normal').setFontSize(11);
        
        productSpecs.forEach((spec, index) => {
            if (currentY > 280) {
                pdf.addPage();
                const totalPages = (pdf as any).getNumberOfPages() || pdf.internal?.getNumberOfPages() || 1;
                addWatermarkToCurrentPage();
                addHeader(totalPages, totalPages);
                addFooter();
                currentY = 25;
            }
            
            pdf.setFont('helvetica', 'bold').setFontSize(11);
            pdf.text(`Zufahrt ${index + 1}: ${spec.streetName}`, page_margin, currentY);
            currentY += 6;
            
            pdf.setFont('helvetica', 'normal').setFontSize(10);
            pdf.text(`Mindestgeschwindigkeit: ${spec.maxSpeed} km/h`, page_margin + 5, currentY);
            currentY += 6;
            
            const standardsText = Array.isArray(spec.standards) ? spec.standards.join(', ') : (spec.standards || 'N/A');
            if (standardsText && standardsText !== 'N/A') {
                pdf.text(`Normen: ${standardsText}`, page_margin + 5, currentY);
                currentY += 6;
            }
            
            currentY += 5;
        });

        // Ensure watermark, header and footer are on all pages
        try {
            const getPages = (pdf as any).getNumberOfPages || pdf.internal?.getNumberOfPages;
            const totalPages: number = typeof getPages === 'function' ? getPages.call(pdf) : 1;
            for (let p = 1; p <= totalPages; p++) {
                pdf.setPage(p);
                addWatermarkToCurrentPage();
                addHeader(p, totalPages);
                addFooter();
            }
        } catch (e) {
            // Fallback: at least watermark current page
            addWatermarkToCurrentPage();
        }

        // Set the filename for download
        const filename = `Ausschreibung Zufahrtsschutz ${locationForFilename}.pdf`;
        console.log('📄 Tender PDF filename:', filename);

        // Display in iframe
        mapDiv.classList.add('view-hidden');
        if (tenderPreviewArea) {
            tenderPreviewArea.classList.remove('view-hidden');
        }
        
        const pdfBlob = pdf.output('blob');
        console.log('📄 PDF blob created, size:', pdfBlob.size, 'bytes');
        
        if (generatedTenderPdfUrl) {
            URL.revokeObjectURL(generatedTenderPdfUrl);
        }
        generatedTenderPdfUrl = URL.createObjectURL(pdfBlob);
        console.log('📄 Tender PDF URL created:', generatedTenderPdfUrl);
        
        if (tenderIframe) {
            console.log('📄 Setting tender iframe src...');
            tenderIframe.src = generatedTenderPdfUrl;
            console.log('📄 Tender iframe src set successfully');
        } else {
            console.error('❌ Tender iframe not found!');
        }
        
        if (tenderPreviewArea) {
            console.log('📄 Tender preview area visibility:', !tenderPreviewArea.classList.contains('view-hidden'));
        } else {
            console.error('❌ Tender preview area not found!');
        }
        
        generatedTenderPdf = pdf;
        const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
        if (downloadTenderBtn) {
            downloadTenderBtn.disabled = false;
        }
        console.log('✅ Tender PDF generated successfully');

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
    
    console.log('🔍 Generating AI Tender Text...');
    console.log('🔍 API Key available:', !!apiKey);
    console.log('🔍 Is GitHub Pages:', isGithubPages);
    
    if (!apiKey || isGithubPages) {
        console.warn('⚠️ AI disabled - using fallback tender text');
        return generateFallbackTenderText(productSpecs, locationName);
    }

    try {
        console.log('📦 Using @google/genai API (same as report generation)...');
        const ai = new GoogleGenAI({ apiKey });
        
        const specsSummary = productSpecs.map(spec => {
            const standards = Array.isArray(spec.standards) ? spec.standards.join(', ') : spec.standards || 'N/A';
            const performance = spec.performance || `Leistungsstufe für ${spec.maxSpeed} km/h`;
            return `${spec.streetName}: ${spec.maxSpeed} km/h, Standards: ${standards}, Leistung: ${performance}`;
        }).join('\n');

        const prompt = `SYSTEM / ROLLE
Du bist deutschsprachiger Fachautor für Bauvergaben (VOB/A) mit Spezialisierung auf Perimetersicherheit/Zufahrtschutz (Fahrzeugrückhaltesysteme). Du erstellst eine herstellerneutrale, rechtssichere Leistungsbeschreibung mit Leistungsverzeichnis. Keine KI-Artefakte, keine Floskeln, keine Meta-Kommentare, keine Platzhalter wie „[Lorem]".

EINGABEDATEN (aus dem System)
- LOCATION_NAME: ${locationName}
- ANZAHL_ZUFAHRTEN: ${productSpecs.length}
- SPECS (je Zugangspunkt; aus dem System generiert, Zeile pro Zugang, Format: „<Straßenname>: <MaxSpeed> km/h, Standards: <…>, Leistung: <…>"):
<<<SPECS_START
${specsSummary}
SPECS_END>>>

ANNAHME & BENENNUNG DER KOMMUNE
Ermittle den Kommunennamen aus LOCATION_NAME (z. B. „Stadt <…>" / „Gemeinde <…>"). Wenn nicht eindeutig, wähle den städtischen Namen, der in Deutschland üblicherweise die Gemeinde bezeichnet. Falls weiterhin unklar, verwende LOCATION_NAME.

ZIEL / AUSGABEFORMAT
Gib ausschließlich ein sauber strukturiertes Dokument in Markdown (für PDF-Rendering) zurück – ohne Präambel und ohne zusätzliche Erklärtexte. Titelzeile exakt:

# Ausschreibung Zufahrtschutz – <Kommune>

DOKUMENTSTRUKTUR (GENAU EINHALTEN)
## 1. Auftrag und Projekt
Kurzbeschreibung: Zufahrtschutz / Fahrzeugrückhaltesysteme für öffentlichen Raum in <Kommune> (Ort: ${locationName}).

## 2. Leistungsumfang
Beschaffung, Lieferung, Fundamentierung/Montage, Inbetriebnahme, Dokumentation, Einweisung, Wartung/Inspektion.

## 3. Technische und funktionale Anforderungen
### 3.1 Normative Grundlagen (produktneutral)
- Leistungs- und Prüfnachweise nach IWA 14-1 / ISO 22343-1 **oder** DIN SPEC 91414-2 **oder** ASTM F2656 (gleichwertige Prüfverfahren zulässig).
- Korrosionsschutz und Oberflächen gemäß einschlägiger DIN/EN (z. B. Feuerverzinken DIN EN ISO 1461), Ausführung im Straßenraum gemäß geltenden Regelwerken.

### 3.2 Schutzziele je Zugangspunkt
Für jeden in den SPECS aufgeführten Zugangspunkt:
- Lage/Bezeichnung: Straßen-/Platzname aus SPECS.
- Erforderliches Schutzziel (leistungsbezogen): Mindest-Aufprallleistung entsprechend örtlicher Annäherungsgeschwindigkeit (aus SPECS „<MaxSpeed> km/h") mit begrenzter Eindringtiefe (formuliere als Zielanforderung, **ohne** Produkte/Modelle).
- Zulässige Nachweiswege: IWA 14-1 / ISO 22343-1 **oder** DIN SPEC 91414-2 **oder** ASTM F2656 – jeweils in einer Leistungsklasse, die das genannte Schutzziel erfüllt oder übertrifft.
- Betriebliche Anforderungen (generisch): Winterdiensttauglichkeit, gut sichtbare Kennzeichnung, Rettungsfreigabe/Demontierbarkeit in praxisgerechter Zeit (ohne konkrete Minutenangabe, da nicht übergeben).

> Nutze ausschließlich Informationen aus SPECS; erfinde keine Maße/Fristen. Wenn in SPECS „Leistung:" bzw. „Standards:" vorhanden ist, formuliere diese als **zulässige Nachweisgrundlage/Leistungsziel**, ohne Hersteller- oder Produktbezug.

### 3.3 Ausführung/Installation (generische Mindestvorgaben)
- Gründung/Fundamentierung entsprechend statischer Erfordernisse und Frosttiefe; Schutz vorhandener Leitungen; Wiederherstellung Beläge.
- Entwässerung und Ebenheit; Toleranzen nach anerkannten Regeln der Technik.
- Kennzeichnung/Sichtbarkeit im öffentlichen Raum; Barrierefreiheit berücksichtigen.

### 3.4 Betrieb & Wartung
- Ziel-Lebensdauer üblich für kommunale Außenanlagen; turnusmäßige Sicht-/Funktionsprüfung; Ersatzteilverfügbarkeit.
- Einweisung des Betriebspersonals; Übergabe Bedien- und Wartungsunterlagen.

## 4. Qualitätssicherung und Nachweise
- Crash-/Leistungsnachweise (IWA 14-1/ISO 22343-1, DIN SPEC 91414-2 oder ASTM F2656) durch akkreditierte Prüfstelle; Gleichwertigkeit zulässig.
- Montage- und Abnahmeprotokoll; As-Built-Unterlagen (Lage/Gründungen); Wartungsplan; Schulungsnachweis.

## 5. Vertrags- und Ausführungsbedingungen (auszugsweise)
- Ausführungsfristen, Arbeits-/Verkehrssicherung, Koordination mit Rettungsdiensten.
- Haftung für Oberflächen-/Leitungsschäden nach gesetzlichen Vorgaben.
- Abnahme und Mängelhaftung/Gewährleistung nach VOB/B (übliches Mindestniveau).

## 6. Leistungsverzeichnis (produktneutral, positionsweise)
Erzeuge pro in SPECS genannter Zufahrt eine Position mit:
- **Kurztext:** Liefer- und Montageleistung Fahrzeugrückhaltesystem(e) für Zugang „<Straßenname>".
- **Langtext (leistungsbezogen):** Ziel-Schutzniveau gemäß Abschnitt 3.2 auf Basis Annäherungsgeschwindigkeit aus SPECS; zulässige Nachweisnormen wie oben; Ausführung/Installation gem. Abschnitt 3.3; Doku/Nachweise gem. Abschnitt 4.
- **Menge/Einheit:** ohne Wertangabe (Mengen werden separat ermittelt).
- **Nebenleistungen:** Baustelleneinrichtung, Leitungsortung/-schutz, Vermessung, Wiederherstellung Beläge, Dokumentation, Einweisung.
- **Nachweise zur Abnahme:** wie in Abschnitt 4.

Zusätzlich Sammelpositionen (ohne Mengenwerte): Baustelleneinrichtung, Verkehrs-/Rettungskoordination, Dokumentation/As-Built.

## 7. Eignungs- und Zuschlagskriterien (Hinweistext)
Eignung: Referenzen vergleichbarer Projekte, Qualifikation Montagebetrieb, Service/Wartung.  
Zuschlag: wirtschaftlichstes Angebot nach Vergabeunterlagen.`;

        console.log('📦 Sending request to Gemini API...');
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt
        });
        
        const text = response.text || '';
        console.log('✅ AI tender text received, length:', text.length);
        
        return text;
        
    } catch (error) {
        console.error('❌ Error generating AI tender text:', error);
        console.warn('⚠️ Falling back to static tender text');
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
    
    // Function to collapse the bubble
    const collapseBubble = () => {
        console.log('🔧 Collapsing bubble - setting transform to translateX(-100%)');
        parameterBubble.style.transform = 'translateX(-100%)';
        parameterBubble.style.opacity = '0';
        parameterStrip.style.display = 'block';
        console.log('🔧 Bubble collapsed - strip now visible');
    };
    
    // Function to expand the bubble
    const expandBubble = () => {
        console.log('🔧 Expanding bubble - setting transform to translateX(0)');
        parameterBubble.style.transform = 'translateX(0)';
        parameterBubble.style.opacity = '1';
        parameterStrip.style.display = 'none';
        console.log('🔧 Bubble expanded - strip now hidden');
    };
    
    // Remove any existing event listeners to prevent conflicts
    const newToggleBtn = toggleBtn.cloneNode(true) as HTMLButtonElement;
    toggleBtn.parentNode?.replaceChild(newToggleBtn, toggleBtn);
    
    // Toggle button click handler
    newToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🔧 Toggle button clicked!');
        const isCollapsed = parameterBubble.style.transform === 'translateX(-100%)';
        const icon = newToggleBtn.querySelector('i');
        
        console.log('🔧 Current state - isCollapsed:', isCollapsed);
        
        if (isCollapsed) {
            console.log('🔧 Expanding bubble');
            expandBubble();
            if (icon) icon.className = 'fas fa-chevron-left';
        } else {
            console.log('🔧 Collapsing bubble');
            collapseBubble();
            if (icon) icon.className = 'fas fa-chevron-right';
        }
    });
    
    // Strip click handler to expand
    parameterStrip.addEventListener('click', () => {
        console.log('🔧 Strip clicked - expanding bubble');
        expandBubble();
        const icon = newToggleBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-left';
    });
    
    // Header "Parameter" button click handler to expand (both nav and tab versions)
    const expandBubbleHandler = (e: Event) => {
        e.preventDefault();
        console.log('🔧 Parameter button clicked - expanding bubble');
        expandBubble();
        const icon = newToggleBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-left';
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
 * ULTIMATE FALLBACK: Force parameter menu to work (proven working code from console)
 * This is the exact code that worked when manually executed
 */
function setupUltimateParameterMenuFix(): void {
    console.log('🚨 Setting up ULTIMATE parameter menu fix...');
    
    const parameterBubble = document.getElementById('parameter-bubble');
    const parameterStrip = document.getElementById('parameter-strip');
    const navParamBtn = document.getElementById('nav-param-input');
    const tabParamBtn = document.getElementById('tab-param-input');
    
    if (!parameterBubble || !parameterStrip || !navParamBtn || !tabParamBtn) {
        console.warn('🚨 Ultimate fix: Missing elements, retrying in 3s...');
        setTimeout(() => setupUltimateParameterMenuFix(), 3000);
        return;
    }
    
    console.log('🚨 Ultimate fix: All elements found, applying proven fix...');
    
    // Entferne ALLE existierenden Event-Listener durch Klonen
    const newNav = navParamBtn.cloneNode(true) as HTMLElement;
    const newTab = tabParamBtn.cloneNode(true) as HTMLElement;
    const newStrip = parameterStrip.cloneNode(true) as HTMLElement;
    
    navParamBtn.parentNode?.replaceChild(newNav, navParamBtn);
    tabParamBtn.parentNode?.replaceChild(newTab, tabParamBtn);
    parameterStrip.parentNode?.replaceChild(newStrip, parameterStrip);
    
    // Hole neue Referenzen
    const newNavBtn = document.getElementById('nav-param-input') as HTMLElement;
    const newTabBtn = document.getElementById('tab-param-input') as HTMLElement;
    const newStripEl = document.getElementById('parameter-strip') as HTMLElement;
    
    // Definiere die bewährte Expand-Funktion
    const forceExpandMenu = () => {
        console.log('🚀 FORCE EXPANDING...');
        const bubble = document.getElementById('parameter-bubble');
        const strip = document.getElementById('parameter-strip');
        
        if (bubble) {
            // Entferne ALLE Inline-Styles und setze neu (bewährte Methode)
            bubble.removeAttribute('style');
            bubble.setAttribute('style', 
                'position: fixed !important;' +
                'top: 130px !important;' +
                'left: 8px !important;' +
                'width: 320px !important;' +
                'max-width: calc(100vw - 32px) !important;' +
                'background: rgba(12, 47, 77, 0.95) !important;' +
                'backdrop-filter: blur(10px) !important;' +
                'border: 1px solid rgba(255, 255, 255, 0.2) !important;' +
                'border-radius: 16px !important;' +
                'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;' +
                'z-index: 9999 !important;' +
                'color: white !important;' +
                'max-height: calc(100vh - 140px) !important;' +
                'overflow-y: auto !important;' +
                'display: block !important;' +
                'visibility: visible !important;' +
                'opacity: 1 !important;' +
                'transform: translateX(0px) !important;' +
                'transition: all 0.3s ease !important;'
            );
        }
        
        if (strip) {
            strip.style.display = 'none';
        }
        
        console.log('✅ MENU FORCED OPEN!');
    };
    
    // Füge bewährte Event-Listener hinzu
    if (newNavBtn) {
        newNavBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('NAV clicked - ultimate fix');
            forceExpandMenu();
            return false;
        };
    }
    
    if (newTabBtn) {
        newTabBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('TAB clicked - ultimate fix');
            forceExpandMenu();
            return false;
        };
    }
    
    if (newStripEl) {
        newStripEl.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('STRIP clicked - ultimate fix');
            forceExpandMenu();
            return false;
        };
    }
    
    // Globale Funktionen verfügbar machen
    (window as any).forceExpandMenu = forceExpandMenu;
    (window as any).ultimateParameterMenuActive = true;
    
    console.log('✅ ULTIMATE parameter menu fix applied!');
    console.log('✅ Available commands: forceExpandMenu()');
}

/**
 * Setup parameter bubble expansion handlers after navigation system is ready
 */
function setupParameterBubbleExpansionHandlers(): void {
    console.log('🔧 Setting up parameter bubble expansion handlers...');
    
    const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
    const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
    
    if (!parameterBubble || !parameterStrip) {
        console.warn('🔧 Parameter elements not found for expansion handlers');
        return;
    }
    
    // Function to expand the bubble
    const expandBubble = () => {
        console.log('🔧 Expanding bubble via header button');
        parameterBubble.style.transform = 'translateX(0)';
        parameterBubble.style.opacity = '1';
        parameterStrip.style.display = 'none';
        
        // Update toggle button icon
        const toggleBtn = document.getElementById('toggle-parameter-bubble');
        const icon = toggleBtn?.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-left';
    };
    
    // Add event listeners to both Parameter buttons with high priority
    const headerParameterBtn = document.getElementById('nav-param-input');
    const tabParameterBtn = document.getElementById('tab-param-input');
    
    if (headerParameterBtn) {
        // Use capture phase to ensure our handler runs first
        headerParameterBtn.addEventListener('click', (e) => {
            console.log('🔧 Header Parameter button clicked - expanding bubble');
            expandBubble();
        }, true); // Capture phase
        
        // Also add normal phase listener as backup
        headerParameterBtn.addEventListener('click', (e) => {
            console.log('🔧 Header Parameter button clicked (backup) - expanding bubble');
            expandBubble();
        });
        
        console.log('🔧 Header Parameter button handlers added');
    }
    
    if (tabParameterBtn) {
        // Use capture phase to ensure our handler runs first
        tabParameterBtn.addEventListener('click', (e) => {
            console.log('🔧 Tab Parameter button clicked - expanding bubble');
            expandBubble();
        }, true); // Capture phase
        
        // Also add normal phase listener as backup
        tabParameterBtn.addEventListener('click', (e) => {
            console.log('🔧 Tab Parameter button clicked (backup) - expanding bubble');
            expandBubble();
        });
        
        console.log('🔧 Tab Parameter button handlers added');
    }
}

/**
 * Override navigation handlers to add parameter bubble expansion
 */
function overrideParameterNavigationHandlers(): void {
    console.log('🔧 Overriding navigation handlers for parameter expansion...');
    
    const parameterBubble = document.getElementById('parameter-bubble') as HTMLElement;
    const parameterStrip = document.getElementById('parameter-strip') as HTMLElement;
    
    if (!parameterBubble || !parameterStrip) {
        console.warn('🔧 Parameter elements not found for navigation override');
        return;
    }
    
    // Function to expand the bubble
    const forceExpandBubble = () => {
        console.log('🔧 FORCE expanding bubble via navigation override');
        parameterBubble.style.transform = 'translateX(0) !important';
        parameterBubble.style.opacity = '1';
        parameterStrip.style.display = 'none';
        
        // Update toggle button icon
        const toggleBtn = document.getElementById('toggle-parameter-bubble');
        const icon = toggleBtn?.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-left';
        
        console.log('🔧 Bubble expansion completed');
    };
    
    // Replace both Parameter buttons completely
    const headerParameterBtn = document.getElementById('nav-param-input');
    const tabParameterBtn = document.getElementById('tab-param-input');
    
    if (headerParameterBtn) {
        const newHeaderBtn = headerParameterBtn.cloneNode(true) as HTMLElement;
        headerParameterBtn.parentNode?.replaceChild(newHeaderBtn, headerParameterBtn);
        
        newHeaderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔧 NEW Header Parameter button clicked - force expanding');
            forceExpandBubble();
        });
        
        console.log('🔧 Header Parameter button completely replaced');
    }
    
    if (tabParameterBtn) {
        const newTabBtn = tabParameterBtn.cloneNode(true) as HTMLElement;
        tabParameterBtn.parentNode?.replaceChild(newTabBtn, tabParameterBtn);
        
        newTabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔧 NEW Tab Parameter button clicked - force expanding');
            forceExpandBubble();
        });
        
        console.log('🔧 Tab Parameter button completely replaced');
    }
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

// ===============================================
// ENTRY DETECTION INTEGRATION
// ===============================================
// Entry Detection is now integrated into the existing "Zugang analysieren" button
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
    
    // Entry Detection is now integrated into the existing "Zugang analysieren" button
    
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
    const toggleSidebarBtn = document.getElementById('toggle-sidebar') as HTMLButtonElement | null;
    const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null;
    
    // Setup UNIFIED parameter menu functionality
    console.log('🔧 About to call setupUnifiedParameterMenu...');
    setTimeout(() => {
        setupUnifiedParameterMenu();
    }, 500);
    
    // EMERGENCY FALLBACK: Ensure parameter menu works even if main setup fails
    setTimeout(() => {
        setupEmergencyParameterMenuFallback();
    }, 1000);
    
    // ULTIMATE FALLBACK: Force parameter menu to work (proven working code)
    setTimeout(() => {
        setupUltimateParameterMenuFix();
    }, 2000);
    
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
                
                if (parameterBubble && parameterStrip) {
                    parameterBubble.style.transform = 'translateX(0)';
                    parameterBubble.style.opacity = '1';
                    parameterStrip.style.display = 'none';
                    
                    const toggleBtn = document.getElementById('toggle-parameter-bubble');
                    const icon = toggleBtn?.querySelector('i');
                    if (icon) icon.className = 'fas fa-chevron-left';
                    
                    console.log('🔧 GLOBAL: Bubble expanded successfully');
                }
            }, 100);
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
        
        // Trigger OSM data loading for the new polygon
        if (isOsmEnabled()) {
            console.log('🗺️ Polygon created, triggering OSM data load...');
            debouncedLoadOsmData();
        }
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
    // Map-tabs spiegeln die gleichen Ansichten über der Karte
    const mapTabs = document.querySelectorAll('.map-tabs a');
    const analyzeThreatsBtn = document.getElementById('analyze-threats') as HTMLButtonElement;
    const createReportBtn = document.getElementById('create-report-btn') as HTMLButtonElement;
    const downloadReportBtn = document.getElementById('download-report-btn') as HTMLButtonElement;
    const reportIframe = document.getElementById('report-iframe') as HTMLIFrameElement;
    const mapDiv = document.getElementById('map') as HTMLElement;
    const reportPreviewArea = document.getElementById('report-preview-area') as HTMLElement;
    const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement;

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

        if (newTabId === 'nav-param-input') {
            resetDrawing();
            clearThreatAnalysis();
            generatedPdf = null;
        }
        if (newTabId === 'nav-marking-area') {
            // Don't clear threat analysis when returning to marking area
            // Only clear when user explicitly clicks "Reset" button
            generatedPdf = null;
            
            // Restore threat analysis if it exists
            restoreThreatAnalysis();
        }
        if (newTabId === 'nav-threat-analysis') {
            generatedPdf = null;
            
            // Restore threat analysis if it exists
            restoreThreatAnalysis();
        }
        if (newTabId === 'nav-product-selection') {
            await updateProductRecommendations();
        } else if (newTabId === 'nav-project-description') {
            // Don't clear tooltips in tender view - user needs to see pinned products
            // clearProductTooltips();
        } else {
            // Clear product tooltips when leaving product selection or switching tabs
            clearProductTooltips();
        }
        if (newTabId === 'nav-project-description') {
            // Handle project description tab
            // DON'T clear threat analysis - user still needs to see where threats are
            // clearThreatAnalysis();
            generatedPdf = null;
        }

        toggleDrawModeBtn.classList.add('hidden');
        resetDrawingBtn.classList.add('hidden');
        analyzeThreatsBtn.classList.add('hidden');
        createReportBtn.classList.add('hidden');
        downloadReportBtn.classList.add('hidden');
        
        // Hide tender buttons by default
        const createTenderBtn = document.getElementById('create-tender-btn') as HTMLButtonElement;
        const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
        if (createTenderBtn) createTenderBtn.classList.add('hidden');
        if (downloadTenderBtn) downloadTenderBtn.classList.add('hidden');

        const isReportView = newTabId === 'nav-risk-report';
        const isTenderView = newTabId === 'nav-project-description';
        
        const tenderPreviewArea = document.getElementById('tender-preview-area') as HTMLElement;
        
        mapDiv.classList.toggle('view-hidden', isReportView || isTenderView);
        reportPreviewArea.classList.toggle('view-hidden', !isReportView);
        if (tenderPreviewArea) {
            tenderPreviewArea.classList.toggle('view-hidden', !isTenderView);
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
        } else if (newTabId === 'nav-risk-report') {
            createReportBtn.classList.remove('hidden');
            downloadReportBtn.classList.remove('hidden');
            downloadReportBtn.disabled = !generatedPdf;
        } else if (newTabId === 'nav-project-description') {
            // Show tender creation and download buttons (like risk report)
            if (createTenderBtn) createTenderBtn.classList.remove('hidden');
            if (downloadTenderBtn) {
                downloadTenderBtn.classList.remove('hidden');
                downloadTenderBtn.disabled = !generatedTenderPdf;
            }
            
            // Don't auto-generate tender - user must click "Ausschreibung erstellen" button
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
    
    // Tender buttons event listeners
    const createTenderBtn = document.getElementById('create-tender-btn') as HTMLButtonElement;
    const downloadTenderBtn = document.getElementById('download-tender-btn') as HTMLButtonElement;
    
    if (createTenderBtn) {
        createTenderBtn.addEventListener('click', generateTender);
    }
    if (downloadTenderBtn) {
        downloadTenderBtn.addEventListener('click', downloadTenderReport);
    }

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
    const filters = {
        vehicleMass: getSelectedCheckboxes('vehicle-mass-content'),
        impactSpeed: {
            min: parseInt((document.getElementById('min-speed') as HTMLInputElement)?.value || '16'),
            max: parseInt((document.getElementById('max-speed') as HTMLInputElement)?.value || '112')
        },
        impactAngle: {
            min: parseInt((document.getElementById('min-angle') as HTMLInputElement)?.value || '15'),
            max: parseInt((document.getElementById('max-angle') as HTMLInputElement)?.value || '90')
        },
        penetrationDistance: {
            min: parseFloat((document.getElementById('min-distance') as HTMLInputElement)?.value || '0'),
            max: parseFloat((document.getElementById('max-distance') as HTMLInputElement)?.value || '60')
        },
        standard: getSelectedCheckboxes('standards-content'),
        foundation: getSelectedCheckboxes('foundation-content'),
        operation: getSelectedCheckboxes('operation-content'),
        deployment: getSelectedCheckboxes('deployment-content'),
        category: getSelectedCheckboxes('categories-content'),
        manufacturer: (document.getElementById('manufacturer-select') as HTMLSelectElement)?.value || ''
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
    const categoryMapping = {
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
    const manufacturers = [
        'ATGAccess', 'Avon-Barrier', 'Barkers Fencing', 'Blockaxess', 'Delta Scientific',
        'Eagle Auto Gate', 'Frontier Pitts', 'Heald', 'Highway Care', 'Marshalls',
        'Perimeter Protection', 'Reidsteel', 'Securiscape', 'Smith Ltd', 'Tiso Production',
        'Urbaco', 'Zaun'
    ];
    
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
 */
function applyFiltersAndUpdateDisplay() {
    console.log('🔄 Applying filters and updating display...');
    
    const filters = getCurrentFilters();
    console.log('📊 Current filters:', filters);
    
    const allProducts = (window as any).productDatabase || [];
    console.log('📦 Total products in database:', allProducts.length);
    
    const filteredProducts = filterProductsByFilters(allProducts, filters);
    console.log('✅ Filtered products:', filteredProducts.length);
    
    // Update the display
    displayProducts(filteredProducts);
}

/**
 * Filter products based on all filter types
 */
function filterProductsByFilters(products: any[], filters: any) {
    return products.filter(product => {
        const techData = product.technical_data;
        if (!techData) return false;
        
        // Vehicle Mass filter (checkbox selection)
        if (filters.vehicleMass.length > 0) {
            const vehicleMass = techData.pr_mass_kg;
            const vehicleCategory = techData.pr_veh;
            if (!vehicleMass || !vehicleCategory) return false;
            
            const matchesVehicleMass = filters.vehicleMass.some((filterValue: string) => {
                const [massStr, category] = filterValue.split(' ');
                const mass = parseInt(massStr);
                return vehicleMass === mass && vehicleCategory === category.replace(/[\[\]]/g, '');
            });
            
            if (!matchesVehicleMass) return false;
        }
        
        // Impact Speed filter (range)
        const impactSpeed = techData.pr_speed_kph;
        if (impactSpeed && (impactSpeed < filters.impactSpeed.min || impactSpeed > filters.impactSpeed.max)) {
            return false;
        }
        
        // Impact Angle filter (range)
        const impactAngle = techData.pr_angle_deg;
        if (impactAngle && (impactAngle < filters.impactAngle.min || impactAngle > filters.impactAngle.max)) {
            return false;
        }
        
        // Penetration Distance filter (range)
        const penetrationDistance = techData.pr_pen_m;
        if (penetrationDistance && (penetrationDistance < filters.penetrationDistance.min || penetrationDistance > filters.penetrationDistance.max)) {
            return false;
        }
        
        // Standard filter (checkbox selection)
        if (filters.standard.length > 0) {
            const standard = techData.standard;
            if (!standard || !filters.standard.includes(standard)) {
                return false;
            }
        }
        
        // Foundation filter (checkbox selection)
        if (filters.foundation.length > 0) {
            const foundation = techData.foundation_depth;
            if (!foundation || !filters.foundation.includes(foundation)) {
                return false;
            }
        }
        
        // Operation filter (checkbox selection)
        if (filters.operation.length > 0) {
            // This would need to be mapped from product data - for now, skip if no operation data
            // const operation = techData.operation;
            // if (!operation || !filters.operation.includes(operation)) {
            //     return false;
            // }
        }
        
        // Deployment filter (checkbox selection)
        if (filters.deployment.length > 0) {
            // Check if "temporary" deployment is selected
            const temporarySelected = filters.deployment.includes('temporary');
            const permanentSelected = filters.deployment.includes('permanent');
            
            // Check if product is free-standing (suitable for temporary deployment)
            const isFreeStanding = techData.foundation_depth === 'A - Free standing (no ground fixings)';
            
            let matchesDeployment = false;
            
            // If temporary is selected, free-standing products automatically match
            if (temporarySelected && isFreeStanding) {
                matchesDeployment = true;
            }
            
            // If permanent is selected, all products except purely temporary ones match
            // (since most products can be used permanently)
            if (permanentSelected) {
                matchesDeployment = true;
            }
            
            // If both are selected, all products match
            if (temporarySelected && permanentSelected) {
                matchesDeployment = true;
            }
            
            // If only temporary is selected and product is NOT free-standing, exclude it
            if (!matchesDeployment && temporarySelected && !isFreeStanding) {
                return false;
            }
            
            // If no match found, exclude the product
            if (!matchesDeployment) {
                return false;
            }
        }
        
        // Category filter (checkbox selection)
        if (filters.category.length > 0) {
            // This would need to be mapped from product data - for now, skip if no category data
            // const category = product.product_type;
            // if (!category || !filters.category.includes(category)) {
            //     return false;
            // }
        }
        
        // Manufacturer filter (dropdown selection)
        if (filters.manufacturer && filters.manufacturer !== '') {
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



