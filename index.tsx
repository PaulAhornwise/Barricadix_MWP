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
let threatLayerGroup: any = null; // Group for all threat overlays to clear in one go
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
let generatedPdfUrl: string | null = null; // Object URL for iframe preview
let productDatabase: any[] = []; // To cache the product data

// Internationalization (i18n) state
let currentLanguage = 'de';
let translations: any = {};

// Embedded translations to avoid loading issues
const embeddedTranslations = {
    "de": {
        "header": {
            "planning": "Planung",
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
            "trafficData": "Verkehrsdaten",
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
            "resistanceLow": "Niedriger Widerstand"
        },

        "ai": {
            "reportPrompt": "Erstellen Sie einen detaillierten Risikobericht basierend auf den gesammelten Daten.",
            "chatbot": {
                "title": "Zufahrtsschutz-Assistent",
                "welcome": "Willkommen zum Zufahrtsschutz-Assistenten. Ich stelle nur Fragen, die noch fehlen oder unsicher sind. Bereit?",
                "assetQuestion": "Welche Schutzgüter möchten Sie absichern? Hinweis: Grundlage für Schutzziel & Schutzklasse (DIN SPEC 91414-2 / ISO 22343-2)",
                "inputPlaceholder": "Antwort eingeben...",
                "sendButton": "Senden",
                "stakeholderQuestion": "Wer sind die relevanten Stakeholder (Behörden, Veranstalter, Betreiber)?",
                "restRiskQuestion": "Welches akzeptable Restrisiko gilt?",
                "operationalQuestion": "Betriebsanforderungen (mehrfach wählbar)",
                "threatQuestion": "Welche Art fahrzeuggestützter Bedrohung ist zu erwarten?",
                "vehicleTypesQuestion": "Welche Fahrzeugtypen sind relevant?",
                "accessCorridorsQuestion": "Wo könnten Fahrzeuge eindringen? (Karte markieren oder beschreiben)",
                "speedQuestion": "Maximale Zufahrtsgeschwindigkeit (km/h)",
                "angleQuestion": "Wahrscheinlicher Anprallwinkel (°)",
                "groundQuestion": "Untergrund/Fundamente am Standort",
                "riskMatrixQuestion": "Risikobewertung: Eintrittswahrscheinlichkeit & Schadensausmaß",
                "completionMessage": "Danke! Alle erforderlichen Angaben sind vorhanden. Möchten Sie den normkonformen PDF-Plan erzeugen?"
            }
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
            }
        },
        "threats": {
            "title": "Gefahrenanalyse",
            "speed": "Geschwindigkeit",
            "analysisFailed": "Gefahrenanalyse fehlgeschlagen",
            "noCrossingWaysBoundary": "Keine kreuzenden Wege an der Grenze gefunden",
            "popupHeader": "Gefahreninformationen",
            "loading": "Lade Gefahrenanalyse..."
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
            "analyzeAccess": "Zugang analysieren"
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
            "reportGenerationError": "Fehler beim Erstellen des Berichts. Bitte versuchen Sie es erneut."
        },


    },
    "en": {
        "header": {
            "planning": "Planning",
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
            "trafficData": "Traffic Data",
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
            "resistanceLow": "Low Resistance"
        },
        "ai": {
            "reportPrompt": "Create a detailed risk report based on the collected data.",
            "chatbot": {
                "title": "Access Protection Assistant",
                "welcome": "Welcome to the Access Protection Assistant. I only ask questions that are still missing or uncertain. Ready?",
                "assetQuestion": "Which protective assets would you like to secure? Note: Basis for Protection Goal & Protection Class (DIN SPEC 91414-2 / ISO 22343-2)",
                "inputPlaceholder": "Enter answer...",
                "sendButton": "Send",
                "stakeholderQuestion": "Who are the relevant stakeholders (authorities, organizers, operators)?",
                "restRiskQuestion": "What acceptable residual risk applies?",
                "operationalQuestion": "Operational requirements (multiple choice)",
                "threatQuestion": "What type of vehicle-based threat is expected?",
                "vehicleTypesQuestion": "Which vehicle types are relevant?",
                "accessCorridorsQuestion": "Where could vehicles penetrate? (Mark on map or describe)",
                "speedQuestion": "Maximum access speed (km/h)",
                "angleQuestion": "Probable impact angle (°)",
                "groundQuestion": "Ground/foundations at the site",
                "riskMatrixQuestion": "Risk assessment: probability of occurrence & extent of damage",
                "completionMessage": "Thank you! All required information is available. Would you like to generate the standards-compliant PDF plan?"
            }
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
<<<<<<< HEAD
=======
                    },
                    "technicalSpecs": {
                        "standard": "Standard",
                        "vehicleWeight": "Vehicle Weight",
                        "vehicleType": "Vehicle Type",
                        "speed": "Speed",
                        "impactAngle": "Impact Angle",
                        "penetration": "Penetration"
>>>>>>> fef6196dc0e7d721b3a14649af48a779a58ae2cb
                    }
                }
            }
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
            }
        },
        "threats": {
            "title": "Threat Analysis",
            "speed": "Speed",
            "analysisFailed": "Threat analysis failed",
            "noCrossingWaysBoundary": "No crossing ways found at boundary",
            "popupHeader": "Threat Information",
            "loading": "Loading threat analysis..."
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
    const planningBtn = document.getElementById('planning-view-btn');
    const manufacturerBtn = document.getElementById('manufacturer-view-btn');
    
    if (planningBtn && manufacturerBtn) {
        manufacturerBtn.classList.add('active');
        planningBtn.classList.remove('active');
    }
    
    // Show manufacturer view content
    showManufacturerView();
}

// Function to show planning view
function showPlanningView() {
    console.log('Switching to planning view...');
    
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
    restorePlanningViewElements();
    
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
        translateManufacturerView();
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
    console.log('Initializing product database...');
    
    // Apply translations to product database elements first
    translateProductDatabase();
    
    // Load product data
    loadProductDatabase();
    
    // Initialize search and filter functionality
    initProductSearchAndFilters();
    
    // Initialize modal functionality
    initProductModal();
}

/**
 * Load the product database from the JSON file
 */
async function loadProductDatabase() {
    try {
        const response = await fetch('/product-database.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const products = await response.json();
        console.log('Product database loaded:', products.length, 'products');
        
        // Store products globally
        (window as any).productDatabase = products;
        
        // Populate filters
        populateProductFilters(products);
        
        // Display products
        console.log('About to display products:', products.length);
        displayProducts(products);
        console.log('Products display completed');
        
        // Hide loading indicator
        const loadingIndicator = document.getElementById('products-loading');
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
    
    // Standard filter
    const standardFilter = document.getElementById('standard-filter') as HTMLSelectElement;
    if (standardFilter) {
        const standards = [...new Set(products.map(p => p.standard).filter(Boolean))];
        standards.forEach(standard => {
            const option = document.createElement('option');
            option.value = standard;
            option.textContent = standard;
            standardFilter.appendChild(option);
        });
    }
    
    // Vehicle type filter
    const vehicleTypeFilter = document.getElementById('vehicle-type-filter') as HTMLSelectElement;
    if (vehicleTypeFilter) {
        const vehicleTypes = [...new Set(products.map(p => p.vehicleType).filter(Boolean))];
        vehicleTypes.forEach(vehicleType => {
            const option = document.createElement('option');
            option.value = vehicleType;
            option.textContent = vehicleType;
            vehicleTypeFilter.appendChild(option);
        });
    }
}

/**
 * Display products in the table
 */
function displayProducts(products: any[]) {
    console.log('displayProducts called with', products.length, 'products');
    
    // Display in table view
    console.log('Calling displayProductsTable...');
    displayProductsTable(products);
    
    // Display in grid view
    console.log('Calling displayProductsGrid...');
    displayProductsGrid(products);
    
    console.log('displayProducts completed');
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
    
    products.forEach((product, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.manufacturer || 'N/A'}</td>
            <td>${product.type || 'N/A'}</td>
            <td>${product.standard || 'N/A'}</td>
            <td>${product.vehicleWeight || 'N/A'}</td>
            <td>${product.vehicleType || 'N/A'}</td>
            <td>${product.speed || 'N/A'}</td>
            <td>${product.impactAngle || 'N/A'}</td>
            <td>${product.penetration || 'N/A'}</td>
            <td>${product.debrisDistance || 'N/A'}</td>
            <td>
                <button class="view-details-btn" data-product-index="${index}">
                    Details anzeigen
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    console.log('Added', products.length, 'rows to table');
    
    // Add click event listeners to view details buttons
    const viewButtons = tbody.querySelectorAll('.view-details-btn');
    viewButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const productIndex = parseInt(target.getAttribute('data-product-index') || '0');
            showProductDetails(productIndex);
        });
    });
}

/**
 * Display products in grid format
 */
function displayProductsGrid(products: any[]) {
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
    
    // Sort products: products with images first, then without images
    const sortedProducts = sortProductsByImageAvailability(products);
    
    // Debug: Log first few products to see sorting
    console.log('First 5 products after sorting:', sortedProducts.slice(0, 5).map(p => ({
        type: p.type,
        hasImage: p.type && p.type.trim() !== '' && p.type !== 'N/A' && p.type !== 'Manufacturer: ATG Access',
        validType: p.type && p.type.trim() !== '' && p.type !== 'N/A' && p.type !== 'Manufacturer: ATG Access' && !p.type.includes('Manufacturer:') && p.type.length > 2
    })));
    
    // Debug: Count products with and without valid types
    const productsWithValidTypes = sortedProducts.filter(p => 
        p.type && p.type.trim() !== '' && p.type !== 'N/A' && 
        p.type !== 'Manufacturer: ATG Access' && !p.type.includes('Manufacturer:') && p.type.length > 2
    );
    console.log(`Products with valid types: ${productsWithValidTypes.length}/${sortedProducts.length}`);
    
    sortedProducts.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Generate product image path based on product type
        const productImage = generateProductImagePath(product);
        
        // Check if product has a valid type (could have an image)
        const hasValidType = product.type && product.type.trim() !== '' && 
                            product.type !== 'N/A' && product.type !== 'Manufacturer: ATG Access' && 
                            !product.type.includes('Manufacturer:') && product.type.length > 2;
        
        // Add special class for first 20 products with valid types
        if (hasValidType && index < 20) {
            card.className = 'product-card product-card-priority';
        }
        

        
        card.innerHTML = `
            <div class="product-card-image ${!hasValidType ? 'no-image' : ''}">
                <img src="${productImage}" alt="${product.type || 'Produkt'}" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                     class="product-image">
                <div class="product-image-placeholder" style="display: none;">
                    <i class="fas fa-image"></i>
                    <span>Kein Bild verfügbar</span>
                </span>
                </div>
            </div>
            <div class="product-card-content">
                <div class="product-card-header">
                    <div class="product-card-title">${product.type || 'N/A'}</div>
                    <div class="product-card-manufacturer">${product.manufacturer || 'N/A'}</div>
                </div>
                <div class="product-card-specs">
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${t('manufacturer.sidebar.productDatabase.technicalSpecs.standard')}</div>
                        <div class="product-card-spec-value">${product.standard || 'N/A'}</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${t('manufacturer.sidebar.productDatabase.technicalSpecs.vehicleWeight')}</div>
                        <div class="product-card-spec-value">${product.vehicleWeight || 'N/A'} kg</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${t('manufacturer.sidebar.productDatabase.technicalSpecs.vehicleType')}</div>
                        <div class="product-card-spec-value">${product.vehicleType || 'N/A'}</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${t('manufacturer.sidebar.productDatabase.technicalSpecs.speed')}</div>
                        <div class="product-card-spec-value">${product.speed || 'N/A'} km/h</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${t('manufacturer.sidebar.productDatabase.technicalSpecs.impactAngle')}</div>
                        <div class="product-card-spec-value">${product.impactAngle || 'N/A'}°</div>
                    </div>
                    <div class="product-card-spec">
                        <div class="product-card-spec-label">${t('manufacturer.sidebar.productDatabase.technicalSpecs.penetration')}</div>
                        <div class="product-card-spec-value">${product.penetration || 'N/A'} m</div>
                    </div>
                </div>
                <div class="product-card-actions">
                    <button class="product-card-btn secondary" data-product-index="${index}">
                        Details
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
                const productIndex = parseInt(target.getAttribute('data-product-index') || '0');
                showProductDetails(productIndex);
            }
        });
    });
}

/**
 * Sort products by image availability - products with images first
 */
function sortProductsByImageAvailability(products: any[]): any[] {
    console.log('Sorting products by image availability...');
    
    const sorted = [...products].sort((a, b) => {
        // Check if product has a meaningful type that could have an image
        const aHasImage = a.type && a.type.trim() !== '' && a.type !== 'N/A' && a.type !== 'Manufacturer: ATG Access';
        const bHasImage = b.type && b.type.trim() !== '' && b.type !== 'N/A' && b.type !== 'Manufacturer: ATG Access';
        
        // Additional check: exclude products with very generic or invalid types
        const aValidType = aHasImage && !a.type.includes('Manufacturer:') && a.type.length > 2;
        const bValidType = bHasImage && !b.type.includes('Manufacturer:') && b.type.length > 2;
        
        if (aValidType && !bValidType) {
            console.log(`Sorting: "${a.type}" (valid) before "${b.type}" (invalid)`);
            return -1; // a has valid type, b doesn't
        }
        if (!aValidType && bValidType) {
            console.log(`Sorting: "${b.type}" (valid) before "${a.type}" (invalid)`);
            return 1;  // b has valid type, a doesn't
        }
        return 0; // both have valid types or both don't
    });
    
    console.log('Sorting completed. First 10 products:');
    sorted.slice(0, 10).forEach((p, i) => {
        const isValid = p.type && p.type.trim() !== '' && p.type !== 'N/A' && 
                       p.type !== 'Manufacturer: ATG Access' && !p.type.includes('Manufacturer:') && p.type.length > 2;
        console.log(`${i + 1}. "${p.type}" - Valid: ${isValid}`);
    });
    
    return sorted;
}

/**
 * Generate product image path based on product type
 */
function generateProductImagePath(product: any): string {
    if (!product.type || product.type === '') {
        return '/Datenbank_Produktbilder/default_product_img01.jpg';
    }
    
    // Clean product type for filename matching
    let cleanType = product.type
        .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special characters except spaces, hyphens, underscores
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[_-]+/g, '_') // Replace multiple hyphens/underscores with single
        .trim();
    
    // Try different image naming patterns
    const imagePatterns = [
        `${cleanType}_img01.jpg`,
        `${cleanType}_img02.jpg`,
        `${cleanType}_img03.jpg`,
        `${cleanType}.jpg`,
        `${cleanType}_01.jpg`,
        `${cleanType}_02.jpg`
    ];
    
    // Return the first pattern (we'll let the browser handle 404s)
    return `/Datenbank_Produktbilder/${imagePatterns[0]}`;
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
function filterProducts() {
    const products = (window as any).productDatabase || [];
    const searchTerm = (document.getElementById('product-search') as HTMLInputElement)?.value.toLowerCase() || '';
    const manufacturer = (document.getElementById('manufacturer-filter') as HTMLSelectElement)?.value || '';
    const standard = (document.getElementById('standard-filter') as HTMLSelectElement)?.value || '';
    const vehicleType = (document.getElementById('vehicle-type-filter') as HTMLSelectElement)?.value || '';
    
    const filteredProducts = products.filter((product: any) => {
        const matchesSearch = !searchTerm || 
            product.manufacturer?.toLowerCase().includes(searchTerm) ||
            product.type?.toLowerCase().includes(searchTerm) ||
            product.standard?.toLowerCase().includes(searchTerm);
        
        const matchesManufacturer = !manufacturer || product.manufacturer === manufacturer;
        const matchesStandard = !standard || product.standard === standard;
        const matchesVehicleType = !vehicleType || product.vehicleType === vehicleType;
        
        return matchesSearch && matchesManufacturer && matchesStandard && matchesVehicleType;
    });
    
    displayProducts(filteredProducts);
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
        modalProductName.textContent = `${product.manufacturer} - ${product.type}`;
    }
    
    // Technical specifications
    const technicalSpecs = document.getElementById('modal-technical-specs');
    if (technicalSpecs) {
        technicalSpecs.innerHTML = `
            <p><strong>Hersteller:</strong> ${product.manufacturer || 'N/A'}</p>
            <p><strong>Typ:</strong> ${product.type || 'N/A'}</p>
            <p><strong>Standard:</strong> ${product.standard || 'N/A'}</p>
        `;
    }
    
    // Performance data
    const performanceData = document.getElementById('modal-performance-data');
    if (performanceData) {
        performanceData.innerHTML = `
            <p><strong>Fahrzeuggewicht:</strong> ${product.vehicleWeight || 'N/A'} kg</p>
            <p><strong>Fahrzeugtyp:</strong> ${product.vehicleType || 'N/A'}</p>
            <p><strong>Geschwindigkeit:</strong> ${product.speed || 'N/A'} km/h</p>
            <p><strong>Anprallwinkel:</strong> ${product.impactAngle || 'N/A'}°</p>
            <p><strong>Penetration:</strong> ${product.penetration || 'N/A'} m</p>
            <p><strong>Trümmerdistanz:</strong> ${product.debrisDistance || 'N/A'} m</p>
        `;
    }
    
    // Certification
    const certification = document.getElementById('modal-certification');
    if (certification) {
        certification.innerHTML = `
            <p><strong>Zertifizierungsstandard:</strong> ${product.standard || 'N/A'}</p>
            <p><strong>Testbedingungen:</strong> ${product.vehicleWeight || 'N/A'} kg bei ${product.speed || 'N/A'} km/h</p>
        `;
    }
    
    // Show modal
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.style.display = 'flex';
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
        'sidebar.trafficData': 'Verkehrsdaten',
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
    try {
        // Try multiple paths for GitHub Pages compatibility
        const paths = [
            `${import.meta.env.BASE_URL}translations.json`,
            '/translations.json',
            './translations.json',
            '../translations.json'
        ];
        
        // Translation file loading disabled to avoid conflicts
        console.log('Translation file loading disabled to avoid conflicts');
        let loaded = false;
    } catch (error) {
        console.error("Could not load translations from any file path:", error);
        // Simplified fallback
        // Fallback translation loading disabled to avoid conflicts
        console.log('Fallback translation loading disabled to avoid conflicts');
    }
    
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
        translateManufacturerView();
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
    
    console.log('Map initialized successfully');
}

/**
 * Clears the threat markers (red circles and lines) and the list from the map and UI.
 */
const clearThreatAnalysis = () => {
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

    const threatsArray = Array.from(threatsMap.entries()).map(([name, data]) => {
        if (data.entryPoints.length === 0) return null;
        
        const lengthInMeters = Math.round(data.totalLength);
        let maxSpeed = 0;
        
        if (accelerationRange && lengthInMeters > 0) {
            const [, maxAcc] = accelerationRange;
            maxSpeed = Math.round(calculateVelocity(maxAcc, lengthInMeters));
        }
        
        return { name, data, maxSpeed, lengthInMeters };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    // Sort by maxSpeed in descending order
    threatsArray.sort((a, b) => b.maxSpeed - a.maxSpeed);

    threatsArray.forEach(({ name, maxSpeed, lengthInMeters }) => {
        const li = document.createElement('li');
        
        let speedText = '';
        if (maxSpeed > 0) {
            speedText = ` | ${t('threats.speed')}: ${maxSpeed} km/h`;
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

        const buffer = 0.002; 
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const bbox = `${southWest.lat - buffer},${southWest.lng - buffer},${northEast.lat + buffer},${northEast.lng + buffer}`;
        
        console.log('Analysis bounds:', bbox);
        
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

        let data;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(t('alerts.overpassError', { status: response.status }));
            }
            data = await response.json();
        } catch (error) {
            console.error('Overpass API error:', error);
            alert(t('alerts.analysisError'));
            loadingIndicator.classList.add('hidden');
            return;
        }

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
            
            console.log(`Extracted ${polygonVertices.length} valid polygon vertices:`, polygonVertices);
            
        } catch (error) {
            console.error('Error extracting polygon coordinates:', error);
            alert(t('alerts.polygonCoordinateError'));
            loadingIndicator.classList.add('hidden');
            return;
        }

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
                const currentStreetMarkers: any[] = [];
                data.entryPoints.forEach(point => {
                    const threatCircle = L.circle([point.lat, point.lon], {
                        radius: 5, color: 'red', fillColor: '#f03', fillOpacity: 1, weight: 2
                    }).bindPopup(`<b>${t('threats.popupHeader')}</b><br>${name}`);
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
            if (floating) floating.classList.remove('view-hidden');
            
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
            if (floating) floating.classList.remove('view-hidden');
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
        }) + `\n\nIMPORTANT: Generate the report in ${currentLanguage === 'de' ? 'German' : 'English'} language only. All text must be in ${currentLanguage === 'de' ? 'German' : 'English'}.`;

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
            .replace(/\bas\b/gi, 'als')
            .replace(/\bweapon\b/gi, 'Waffe')
            .replace(/\bPotential\b/gi, 'Potenzielle')
            .replace(/\badversaries\b/gi, 'Gegner')
            .replace(/\binclude\b/gi, 'umfassen')
            .replace(/\bstate-sponsored\b/gi, 'staatsgestützte')
            .replace(/\bterrorist\b/gi, 'terroristische')
            .replace(/\binsider threats\b/gi, 'Innentäter-Bedrohungen')
            .replace(/\bmalicious software\b/gi, 'schädliche Software')
            .replace(/\bdistributed denial\b/gi, 'verteilte Verweigerung')
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
            .replace(/\bInnentäter-Bedrohungen\b/gi, 'insider threats')
            .replace(/\bschädliche Software\b/gi, 'malicious software')
            .replace(/\bverteilte Verweigerung\b/gi, 'distributed denial')
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
 * Updates the product recommendation section based on vehicle selection.
 */
async function updateProductRecommendations() {
    if (productDatabase.length === 0) {
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}product-database.json`);
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
    
    if (pollerRecommendationEl) {
        pollerRecommendationEl.textContent = t('products.resistanceHigh');
    }
    if (barrierRecommendationEl) {
        barrierRecommendationEl.textContent = t('products.resistanceMedium');
    }

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
        
        const assetInput = document.getElementById('asset-to-protect') as HTMLInputElement;
        const assetToProtect = assetInput.value.trim() || t('report.undefinedAsset');
        
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
                    maxSpeed = Math.round(calculateVelocity(maxAcc, lengthInMeters));
                }
                
                return { name, lengthInMeters, maxSpeed };
            });
            
            // Sort by maxSpeed in descending order
            threatsArray.sort((a, b) => b.maxSpeed - a.maxSpeed);
            
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
// EVENT LISTENERS & INITIALIZATION
// ===============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Starting initialization...');
    
    // Step 1: Initialize basic UI components
    initViewSwitcher();
    initOpenStreetMap();
    
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
    document.getElementById('nav-param-input')?.click();

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

});

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
function restorePlanningViewElements() {
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
function translateManufacturerView() {
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
        // Grid view is active, re-render products to update technical data labels
        console.log('Re-rendering products grid to update translations...');
        // Reload products from the database to get fresh data
        loadProductDatabase();
    } else if (productsTable && productsTable.style.display !== 'none') {
        // Table view is active, re-render table to update headers
        console.log('Re-rendering products table to update translations...');
        // Reload products from the database to get fresh data
        loadProductDatabase();
    }
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

/**
 * Helper function to get currently displayed products
 * This function tries to extract products from the current display
 */
function getCurrentDisplayedProducts(): any[] {
    // Try to get products from the current product database
    try {
        // If we have a global products variable, use it
        if (typeof window !== 'undefined' && (window as any).products) {
            return (window as any).products;
        }
        
        // Try to get products from the current display by looking at existing cards
        const productsGrid = document.getElementById('products-grid');
        const productsTable = document.getElementById('products-table');
        
        if (productsGrid && productsGrid.children.length > 0) {
            // Extract product data from existing grid cards
            const productCards = productsGrid.querySelectorAll('.product-card');
            if (productCards.length > 0) {
                // We have products displayed, but we need to reload them from the source
                // For now, return empty array to trigger a reload
                return [];
            }
        }
        
        // Otherwise, try to reload from the JSON file
        return [];
    } catch (error) {
        console.warn('Could not get current products:', error);
        return [];
    }
}