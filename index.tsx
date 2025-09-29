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
// React-basierte Chatbot-Komponente ist als separate Datei vorhanden.
// Import optional, Compiler kann ohne explizites React import arbeiten (no JSX here).
import { createElement } from "react";
import type {} from "react-dom";
import ZufahrtsschutzChatbot from "./ZufahrtsschutzChatbot";
import { createRoot } from "react-dom/client";
import { fetchOsmBundleForPolygon, osmCache, OsmBundle } from './src/utils/osm.js';
import { OsmSpeedLimiter, SpeedLimitConfig } from './src/utils/osmSpeedLimits.js';
import { WeatherCondition } from './src/utils/osmParse.js';

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

// App state
let map: any; // Module-scoped map object
let tileLayer: any; // Module-scoped tile layer object
let threatLayerGroup: any = null; // Group for all threat overlays to clear in one go
let searchMarker: any = null; // To keep track of the current search marker
let isDrawingMode = false;
let waypoints: any[] = [];
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

// Street highlighting system
let highlightedStreetName: string | null = null;
let originalStreetStyles = new Map<string, any[]>(); // Store original styles for reset

// Manual threat editing system
let isEditMode = false;
let manuallyRemovedThreats = new Set<string>(); // Track manually removed threats
let manuallyAddedThreats = new Map<string, any>(); // Track manually added threats
let productDatabase: any[] = []; // To cache the product data
let pinnedTooltips: Array<{element: HTMLElement, marker: any, latLng: any}> = []; // Track pinned tooltips for map movement

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
            "searchPlaceholder": "Paderborn, Domplatz",
            "searchButton": "Suchen",
            "setWaypoints": "Wegpunkte setzen",
            "setWaypointsActive": "Zeichnen aktiv",
            "reset": "Zurücksetzen",
            "securityAreaLabel": "Sicherheitsbereich",
            "securityArea": "Sicherheitsbereich",
            "analyzeAccess": "Zugang analysieren"
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
            "searchPlaceholder": "Paderborn, Domplatz",
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
    setTimeout(() => {
        console.log('Re-initializing map...');
        initOpenStreetMap();
        
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
    
    // Translate manufacturer view after showing it
    setTimeout(() => {
        translateUI(); // Use the main translation function
    }, 50);
    
    showNotification('Hersteller-Ansicht aktiviert', 'success');
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
    
    const filteredProducts = products.filter((product: any) => {
        const matchesSearch = !searchTerm || 
            product.manufacturer?.toLowerCase().includes(searchTerm) ||
            product.product_name?.toLowerCase().includes(searchTerm) ||
            product.technical_data?.standard?.toLowerCase().includes(searchTerm);
        
        const matchesManufacturer = !manufacturer || product.manufacturer === manufacturer;
        const matchesStandard = !standard || product.technical_data?.standard === standard;
        // Updated to use material filter for new database structure
        const matchesVehicleType = !vehicleType || product.technical_data?.material === vehicleType;
        
        // Speed filter based on test speed
        const matchesSpeed = !minSpeed || (() => {
            const requiredSpeed = parseFloat(minSpeed);
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
        
        return matchesSearch && matchesManufacturer && matchesStandard && matchesVehicleType && matchesSpeed;
    });
    
    await displayProducts(filteredProducts);
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
function initOpenStreetMap(): void {
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
    
    const mapCenter: [number, number] = [51.7189, 8.7575]; // Paderborn, Domplatz
    map = L.map(mapDiv, {
      zoomControl: false, // Disable default zoom control
      preferCanvas: true // Use canvas renderer for better performance with html2canvas
    }).setView(mapCenter, 16);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Force map to calculate correct size after initialization
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            console.log('Map size invalidated after initialization');
        }
    }, 100);
    
    // Additional invalidation after tiles load
    tileLayer.once('load', () => {
        if (map) {
            map.invalidateSize();
            console.log('Map size invalidated after tiles loaded');
        }
    });
    
        // Add event listeners for map movement to update pinned tooltips (throttled for performance)
    let moveTimeout: number | undefined;
    map.on('move', () => {
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = window.setTimeout(() => {
            // console.log('Map move event triggered'); // Reduced logging
            // Use requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                updatePinnedTooltipPositions();
            });
        }, 150); // Increased debounce time for better performance
    });
    map.on('zoom', () => {
        console.log('Map zoom event triggered');
        updatePinnedTooltipPositions();
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
}

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
    
    // If we have threat analysis data, show it on the map with interactive tooltips
    if (threatsMap.size > 0) {
        await addProductRecommendationTooltips();
    } else {
        console.log('No threat analysis data available for product selection');
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
    const markerIcon = marker.getElement();
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
 * Add interactive tooltip to a marker
 */
function addInteractiveTooltip(marker: any, streetName: string, maxSpeed: number, product: any) {
    let tooltipElement: HTMLElement | null = null;
    let isPinned = false;
    let leafletPopup: any = null; // For pinned state using Leaflet popup
    
    // Add CSS class to marker for hover effects
    const markerIcon = marker.getElement();
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
            
            // Add close event handler for popup
            leafletPopup.on('remove', () => {
                    isPinned = false;
                leafletPopup = null;
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
                
                // Wait for tiles to load completely
                tileLayer.once('load', () => {
                    console.log('Tile layer loaded successfully');
                    clearTimeout(moveEndTimeoutId);
                    resolveFn();
                });

                // Fallback: wait for map movement to end
                map.once('moveend', () => {
                    console.log('Map movement ended');
                    moveEndTimeoutId = window.setTimeout(resolveFn, 1000);
                });
                
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
    const headerParameterBtn = document.getElementById('nav-param-input');
    const tabParameterBtn = document.getElementById('tab-param-input');
    
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
    
    // ENHANCED expand function with multiple fallbacks
    const expandBubble = () => {
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
    (window as any).expandParameterMenu = expandBubble;
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
        expandBubble();
    };
    
    // Make the bubble draggable (optional enhancement)
    makeParameterBubbleDraggable(parameterBubble);
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
        
        // Fetch new data with error handling
        try {
            const osmData = await fetchOsmBundleForPolygon(polygonCoords, osmLoadingController.signal);
            
            // Cache the result
            osmCache.set(cacheKey, osmData);
            
            // Update global state
            currentOsmData = osmData;
            osmSpeedLimiter.setOsmData(osmData);
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
// EVENT LISTENERS & INITIALIZATION
// ===============================================
// This initialization function will be called after authentication
async function initializeApp() {
    console.log('🚀 INITIALIZE APP CALLED!');
    
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
    initOpenStreetMap();
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
            clearThreatAnalysis();
            generatedPdf = null;
        }
        if (newTabId === 'nav-threat-analysis') {
            generatedPdf = null;
        }
        if (newTabId === 'nav-product-selection') {
            await updateProductRecommendations();
        } else {
            // Clear product tooltips when leaving product selection or switching tabs
            clearProductTooltips();
        }
        if (newTabId === 'nav-project-description') {
            // Handle project description tab
            clearThreatAnalysis();
            generatedPdf = null;
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
    };

    navLinks.forEach(link => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const clickedLink = event.currentTarget as HTMLAnchorElement;
            const newTabId = clickedLink.id;
            await handleNavSwitch(newTabId, clickedLink);
        });
    });

    // Map‑Tabs verknüpfen
    mapTabs.forEach(tab => {
        tab.addEventListener('click', async (event) => {
            event.preventDefault();
            const link = event.currentTarget as HTMLAnchorElement;
            const targetId = link.getAttribute('data-target')!;
            const correspondingHeaderLink = document.getElementById(targetId) as HTMLAnchorElement | null;
            await handleNavSwitch(targetId, correspondingHeaderLink ?? undefined);
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
            
            // Update active states
            document.querySelectorAll('.main-nav a').forEach(link => {
                link.classList.remove('active');
                link.removeAttribute('aria-current');
            });
            
            (newNavMarkingArea as HTMLElement).classList.add('active');
            (newNavMarkingArea as HTMLElement).setAttribute('aria-current', 'page');
            
            // Update map tabs
            document.querySelectorAll('.map-tabs a').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById('tab-marking-area')?.classList.add('active');
            
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
            
            // Update active states
            document.querySelectorAll('.main-nav a').forEach(link => {
                link.classList.remove('active');
                link.removeAttribute('aria-current');
            });
            
            (newNavParamInput as HTMLElement).classList.add('active');
            (newNavParamInput as HTMLElement).setAttribute('aria-current', 'page');
            
            // Update map tabs
            document.querySelectorAll('.map-tabs a').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById('tab-param-input')?.classList.add('active');
            
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
            document.getElementById('nav-marking-area')?.click();
        });
    }
    
    if (tabParamInput) {
        const newTabParamInput = tabParamInput.cloneNode(true);
        tabParamInput.parentNode?.replaceChild(newTabParamInput, tabParamInput);
        
        newTabParamInput.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🗺️ DIRECT: Map tab clicked - triggering nav-param-input');
            document.getElementById('nav-param-input')?.click();
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

// Initialize authentication system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing authentication...');
    initAuth();
    setupLogoLogout();
    setupThreatPanelControls();
});



