# FilterSidebar Integration Guide

## Übersicht

Die FilterSidebar ist eine umfassende React-Komponente für die Herstelleransicht der BarricadiX Webanwendung. Sie ermöglicht es Benutzern, Produkte anhand verschiedener Kriterien zu filtern.

## Schnellstart

### 1. Komponenten importieren

```tsx
import { FilterSidebar, FilterState } from './components/FilterSidebar';
```

### 2. In React-Komponente verwenden

```tsx
const MyComponent = () => {
  const [filters, setFilters] = useState<FilterState>({});

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    // Hier Ihre Filterlogik implementieren
  };

  return (
    <FilterSidebar 
      onFilterChange={handleFilterChange}
      initialFilters={filters}
    />
  );
};
```

## Integration in bestehende Anwendung

### HTML-Integration

Die FilterSidebar wurde bereits in die `index.html` integriert:

```html
<div class="manufacturer-content-wrapper">
    <!-- React FilterSidebar Mount Point -->
    <div id="filter-sidebar-root"></div>
    
    <!-- Bestehende Sidebar -->
    <aside class="manufacturer-sidebar">
        <!-- ... -->
    </aside>
</div>
```

### JavaScript-Integration

Verwenden Sie die bereitgestellte Integration:

```javascript
// In Ihrer bestehenden JavaScript-Datei
import { mountFilterSidebar } from './components/FilterSidebar/integration.js';

// Initialisieren Sie die FilterSidebar, wenn die Herstelleransicht aktiviert wird
document.getElementById('manufacturer-view-btn').addEventListener('click', () => {
    mountFilterSidebar('filter-sidebar-root');
});
```

## FilterState Interface

```tsx
interface FilterState {
  vehicleMass: string[];                    // Fahrzeuggewichte
  impactSpeed: { min: number; max: number }; // Aufprallgeschwindigkeit
  impactAngle: { min: number; max: number }; // Aufprallwinkel
  penetrationDistance: { min: number; max: number }; // Eindringtiefe
  standards: string[];                      // Standards
  foundation: string[];                     // Fundamenttypen
  operation: string[];                      // Betriebsarten
  deployment: string[];                     // Einsatzarten
  categories: { [category: string]: string[] }; // Kategorien
}
```

## Verfügbare Filter

### 1. Vehicle Mass (kg)
- Checkbox-Gruppe mit Fahrzeuggewichten
- Optionen: 1500kg bis 30000kg mit verschiedenen Kategorien
- Mehrfachauswahl möglich

### 2. Impact Speed (Km/h)
- Bereichsfilter mit Slider
- Standard: 16-112 Km/h
- Min/Max-Eingabefelder

### 3. Impact Angle (°)
- Bereichsfilter mit Slider
- Standard: 15-90°
- Min/Max-Eingabefelder

### 4. Penetration Distance (m)
- Bereichsfilter mit Slider
- Standard: 0-60m
- Min/Max-Eingabefelder

### 5. Standard
- Checkbox-Gruppe für Standards
- Optionen: PAS 68, ISO 22343, IWA 14-1, etc.

### 6. Foundation
- Checkbox-Gruppe für Fundamenttypen
- Optionen: A, Ap, B, C mit Beschreibungen

### 7. Operation & Deployment
- Zwei separate Checkbox-Gruppen
- Operation: active/passive
- Deployment: permanent/temporary

### 8. Categories / Style of VSB
- Hierarchische Kategorien
- Einklappbare Hauptkategorien
- Unterkategorien mit Checkboxen

## Styling

Die Komponente verwendet CSS-Module und passt sich automatisch an das bestehende Design an:

- Dunkler Hintergrund (rgba(10, 45, 74, 0.95))
- Akzentfarbe: #1e90ff
- Responsive Design
- Accessibility-Features

## Features

### Benutzerfreundlichkeit
- ✅ Einklappbare Filter-Sektionen
- ✅ "Alle auswählen/abwählen" Buttons
- ✅ Reset-Funktionalität
- ✅ Aktive Filter-Anzeige
- ✅ Responsive Design

### Accessibility
- ✅ Vollständige Keyboard-Navigation
- ✅ ARIA-Labels und -Beschreibungen
- ✅ Screen-Reader-freundlich
- ✅ High-Contrast-Mode-Unterstützung

### Performance
- ✅ Optimierte Re-Renders
- ✅ Effiziente State-Verwaltung
- ✅ CSS-Module für optimale Bundle-Größe

## Anpassung

### Neue Filter hinzufügen

1. Erweitern Sie `FilterState` in `types.ts`
2. Fügen Sie Optionen zu den Konstanten hinzu
3. Implementieren Sie Handler in `FilterSidebar.tsx`
4. Fügen Sie FilterSection zur JSX-Struktur hinzu

### Styling anpassen

Alle wichtigen Farben und Abstände sind als CSS-Variablen definiert und können einfach angepasst werden.

## Browser-Unterstützung

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Beispiele

### Vollständige Integration

```tsx
import React, { useState } from 'react';
import { FilterSidebar, FilterState } from './components/FilterSidebar';

const ManufacturerView = () => {
  const [filters, setFilters] = useState<FilterState>({});
  const [products, setProducts] = useState([]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    
    // Filtere Produkte basierend auf den Filtern
    const filteredProducts = filterProducts(products, newFilters);
    setProducts(filteredProducts);
  };

  return (
    <div className="manufacturer-view">
      <FilterSidebar 
        onFilterChange={handleFilterChange}
        initialFilters={filters}
      />
      <div className="product-list">
        {/* Produktliste hier */}
      </div>
    </div>
  );
};
```

### Mit URL-Parametern

```tsx
const handleFilterChange = (newFilters: FilterState) => {
  setFilters(newFilters);
  
  // Update URL-Parameter
  const url = new URL(window.location);
  Object.keys(newFilters).forEach(key => {
    const value = newFilters[key];
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      url.searchParams.set(key, JSON.stringify(value));
    }
  });
  window.history.replaceState({}, '', url);
};
```

## Support

Bei Fragen oder Problemen wenden Sie sich an das Entwicklungsteam oder konsultieren Sie die README.md-Datei für weitere Details.
