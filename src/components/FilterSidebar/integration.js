/**
 * Integration der FilterSidebar in die bestehende BarricadiX-Anwendung
 * Diese Datei zeigt, wie die React-Komponente in die bestehende JavaScript-Anwendung integriert wird
 */

import { createRoot } from 'react-dom/client';
import { FilterSidebar } from './index.js';

// Globale Variable für die FilterSidebar-Instanz
let filterSidebarRoot = null;

/**
 * Initialisiert die FilterSidebar in der Herstelleransicht
 */
function initFilterSidebar() {
    const container = document.getElementById('filter-sidebar-root');
    
    if (!container) {
        console.warn('FilterSidebar-Container nicht gefunden');
        return;
    }

    // Erstelle React Root
    filterSidebarRoot = createRoot(container);

    // Render FilterSidebar
    filterSidebarRoot.render(
        React.createElement(FilterSidebar, {
            onFilterChange: handleFilterChange
        })
    );

    console.log('FilterSidebar erfolgreich initialisiert');
}

/**
 * Behandelt Filteränderungen
 * @param {Object} filters - Die aktuellen Filter
 */
function handleFilterChange(filters) {
    console.log('Filter geändert:', filters);
    
    // Speichere Filter in globaler Variable für andere Teile der Anwendung
    window.currentFilters = filters;
    
    // Benachrichtige bestehende JavaScript-Handler
    if (typeof window.onFilterChange === 'function') {
        window.onFilterChange(filters);
    }
    
    // Dispatch Custom Event für bestehende Event-Listener
    const event = new CustomEvent('filterChanged', {
        detail: filters
    });
    window.dispatchEvent(event);
    
    // Beispiel: Produktliste filtern
    filterProductList(filters);
}

/**
 * Filtert die Produktliste basierend auf den aktiven Filtern
 * @param {Object} filters - Die aktiven Filter
 */
function filterProductList(filters) {
    // Hier würde normalerweise die Produktliste gefiltert werden
    // Dies ist ein Beispiel für die Integration mit bestehender Logik
    
    console.log('Filtere Produktliste mit:', filters);
    
    // Beispiel: Filter an bestehende Funktionen weiterleiten
    if (typeof window.filterProducts === 'function') {
        window.filterProducts(filters);
    }
    
    // Beispiel: DOM-Manipulation für bestehende Produktliste
    const productList = document.querySelector('.product-list');
    if (productList) {
        // Hier würde die Produktliste entsprechend gefiltert werden
        console.log('Produktliste gefunden, Filter werden angewendet');
    }
}

/**
 * Entfernt die FilterSidebar
 */
function destroyFilterSidebar() {
    if (filterSidebarRoot) {
        filterSidebarRoot.unmount();
        filterSidebarRoot = null;
        console.log('FilterSidebar entfernt');
    }
}

/**
 * Zeigt/versteckt die FilterSidebar
 * @param {boolean} show - Ob die Sidebar angezeigt werden soll
 */
function toggleFilterSidebar(show) {
    const container = document.getElementById('filter-sidebar-root');
    if (container) {
        container.style.display = show ? 'block' : 'none';
    }
}

// Exportiere Funktionen für globale Verwendung
window.FilterSidebarIntegration = {
    init: initFilterSidebar,
    destroy: destroyFilterSidebar,
    toggle: toggleFilterSidebar,
    handleFilterChange: handleFilterChange
};

// Automatische Initialisierung, wenn die Herstelleransicht aktiviert wird
document.addEventListener('DOMContentLoaded', function() {
    // Warte auf die Aktivierung der Herstelleransicht
    const manufacturerViewBtn = document.getElementById('manufacturer-view-btn');
    if (manufacturerViewBtn) {
        manufacturerViewBtn.addEventListener('click', function() {
            // Initialisiere FilterSidebar nach einem kurzen Delay
            setTimeout(() => {
                initFilterSidebar();
            }, 100);
        });
    }
});

// Beispiel für die Integration mit bestehenden Event-Listenern
window.addEventListener('filterChanged', function(event) {
    const filters = event.detail;
    console.log('Filter-Event empfangen:', filters);
    
    // Hier können Sie auf Filteränderungen reagieren
    // z.B. API-Aufrufe, DOM-Updates, etc.
});

// Beispiel für die Verwendung in bestehenden Funktionen
window.onFilterChange = function(filters) {
    console.log('Globale Filter-Handler aufgerufen:', filters);
    
    // Beispiel: Update der URL-Parameter
    updateURLParams(filters);
    
    // Beispiel: Speichere Filter in localStorage
    localStorage.setItem('manufacturerFilters', JSON.stringify(filters));
};

/**
 * Aktualisiert URL-Parameter basierend auf den Filtern
 * @param {Object} filters - Die aktiven Filter
 */
function updateURLParams(filters) {
    const url = new URL(window.location);
    
    // Entferne bestehende Filter-Parameter
    const filterParams = ['vehicleMass', 'impactSpeed', 'impactAngle', 'penetrationDistance', 
                         'standards', 'foundation', 'operation', 'deployment', 'categories'];
    filterParams.forEach(param => {
        url.searchParams.delete(param);
    });
    
    // Füge neue Filter-Parameter hinzu
    Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value && (Array.isArray(value) ? value.length > 0 : true)) {
            url.searchParams.set(key, JSON.stringify(value));
        }
    });
    
    // Aktualisiere URL ohne Seitenreload
    window.history.replaceState({}, '', url);
}

/**
 * Lädt Filter aus URL-Parametern
 * @returns {Object} Die geladenen Filter
 */
function loadFiltersFromURL() {
    const url = new URL(window.location);
    const filters = {};
    
    const filterParams = ['vehicleMass', 'impactSpeed', 'impactAngle', 'penetrationDistance', 
                         'standards', 'foundation', 'operation', 'deployment', 'categories'];
    
    filterParams.forEach(param => {
        const value = url.searchParams.get(param);
        if (value) {
            try {
                filters[param] = JSON.parse(value);
            } catch (e) {
                console.warn(`Ungültiger Filter-Parameter: ${param}`, value);
            }
        }
    });
    
    return filters;
}

// Exportiere zusätzliche Hilfsfunktionen
window.FilterSidebarIntegration.loadFromURL = loadFiltersFromURL;
window.FilterSidebarIntegration.updateURL = updateURLParams;
