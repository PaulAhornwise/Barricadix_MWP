# FilterSidebar Komponente

Eine umfassende und wiederverwendbare Filter-Seitenleisten-Komponente für die Herstelleransicht der BarricadiX Webanwendung.

## Übersicht

Die FilterSidebar-Komponente ermöglicht es Benutzern, Suchergebnisse anhand verschiedener Kriterien zu filtern. Sie besteht aus mehreren wiederverwendbaren Unterkomponenten und verwendet TypeScript und CSS-Module für eine saubere, typisierte Implementierung.

## Komponentenstruktur

### Hauptkomponenten

- **FilterSidebar**: Hauptkomponente, die den gesamten Filterzustand verwaltet
- **FilterSection**: Einklappbare Sektion für verschiedene Filtergruppen
- **CheckboxGroup**: Gruppe von Checkboxen für Mehrfachauswahl
- **RangeInput**: Numerische Bereichseingabe mit Slider
- **HierarchicalCheckbox**: Verschachtelte Checkbox-Liste für Kategorien

### Filter-Sektionen

1. **Vehicle Mass (kg)**: Checkbox-Gruppe mit Fahrzeuggewichten
2. **Impact Speed (Km/h)**: Bereichsfilter für Aufprallgeschwindigkeit
3. **Impact Angle (°)**: Bereichsfilter für Aufprallwinkel
4. **Penetration Distance (m)**: Bereichsfilter für Eindringtiefe
5. **Standard**: Checkbox-Gruppe für Standards
6. **Foundation**: Checkbox-Gruppe für Fundamenttypen
7. **Operation**: Checkbox-Gruppe für Betriebsarten
8. **Deployment**: Checkbox-Gruppe für Einsatzarten
9. **Categories / Style of VSB**: Hierarchische Kategorien

## Verwendung

### Grundlegende Integration

```tsx
import React, { useState } from 'react';
import { FilterSidebar, FilterState } from './components/FilterSidebar';

const ManufacturerView: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>({});

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    // Hier können Sie die Filter an Ihre Suchlogik weiterleiten
    console.log('Aktive Filter:', newFilters);
  };

  return (
    <div className="manufacturer-view">
      <FilterSidebar 
        onFilterChange={handleFilterChange}
        initialFilters={filters}
      />
      {/* Rest der Herstelleransicht */}
    </div>
  );
};
```

### Integration in die bestehende Herstelleransicht

```tsx
// In der bestehenden manufacturer-view HTML-Struktur
import { createRoot } from 'react-dom/client';
import { FilterSidebar, FilterState } from './components/FilterSidebar';

// Mount-Punkt in der HTML hinzufügen:
// <div id="filter-sidebar-root"></div>

const filterRoot = document.getElementById('filter-sidebar-root');
if (filterRoot) {
  const root = createRoot(filterRoot);
  
  const handleFilterChange = (filters: FilterState) => {
    // Filter an bestehende JavaScript-Logik weiterleiten
    console.log('Filter geändert:', filters);
    // Hier können Sie die Produktliste entsprechend filtern
  };

  root.render(
    <FilterSidebar 
      onFilterChange={handleFilterChange}
    />
  );
}
```

## API-Referenz

### FilterSidebar Props

```tsx
interface FilterSidebarProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
  className?: string;
}
```

### FilterState Interface

```tsx
interface FilterState {
  vehicleMass: string[];
  impactSpeed: { min: number; max: number };
  impactAngle: { min: number; max: number };
  penetrationDistance: { min: number; max: number };
  standards: string[];
  foundation: string[];
  operation: string[];
  deployment: string[];
  categories: {
    [category: string]: string[];
  };
}
```

## Styling

Die Komponente verwendet CSS-Module für gekapselte Styles. Das Design orientiert sich am bestehenden Design der Anwendung mit:

- Dunklem Hintergrund (rgba(10, 45, 74, 0.95))
- Akzentfarbe (--accent-color: #1e90ff)
- Responsive Design für verschiedene Bildschirmgrößen
- Accessibility-Features (ARIA-Labels, Keyboard-Navigation)
- High-Contrast-Mode-Unterstützung

## Features

### Benutzerfreundlichkeit
- Einklappbare Filter-Sektionen
- "Alle auswählen/abwählen" Buttons
- Reset-Funktionalität für einzelne Filter und alle Filter
- Aktive Filter-Anzeige
- Responsive Design

### Accessibility
- Vollständige Keyboard-Navigation
- ARIA-Labels und -Beschreibungen
- Screen-Reader-freundlich
- High-Contrast-Mode-Unterstützung
- Reduced-Motion-Unterstützung

### Performance
- Optimierte Re-Renders durch useCallback
- Effiziente State-Verwaltung
- Lazy Loading für große Listen
- CSS-Module für optimale Bundle-Größe

## Anpassung

### Neue Filter hinzufügen

1. Erweitern Sie das `FilterState` Interface in `types.ts`
2. Fügen Sie die neuen Optionen zu den entsprechenden Konstanten hinzu
3. Implementieren Sie die Handler-Funktion in `FilterSidebar.tsx`
4. Fügen Sie die neue FilterSection zur JSX-Struktur hinzu

### Styling anpassen

Die CSS-Module können einfach angepasst werden, um das Design an Ihre Anforderungen anzupassen. Alle wichtigen Farben und Abstände sind als CSS-Variablen definiert.

## Browser-Unterstützung

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Lizenz

Teil der BarricadiX Webanwendung.
