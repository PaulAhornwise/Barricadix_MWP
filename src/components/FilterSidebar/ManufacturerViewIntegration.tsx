import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FilterSidebar, FilterState } from './index';

/**
 * Integration der FilterSidebar in die bestehende Herstelleransicht
 * Diese Komponente zeigt, wie die FilterSidebar in die vorhandene HTML-Struktur integriert werden kann
 */

interface ManufacturerViewIntegrationProps {
  onFilterChange?: (filters: FilterState) => void;
}

const ManufacturerViewIntegration: React.FC<ManufacturerViewIntegrationProps> = ({
  onFilterChange
}) => {
  const [filters, setFilters] = useState<FilterState>({
    vehicleMass: [],
    impactSpeed: { min: 16, max: 112 },
    impactAngle: { min: 15, max: 90 },
    penetrationDistance: { min: 0, max: 60 },
    standards: [],
    foundation: [],
    operation: [],
    deployment: [],
    categories: {}
  });

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    
    // Benachrichtige übergeordnete Komponente
    onFilterChange?.(newFilters);
    
    // Hier können Sie die Filter an Ihre bestehende JavaScript-Logik weiterleiten
    console.log('Filter geändert:', newFilters);
    
    // Beispiel: Filter an globale Variable weiterleiten
    (window as any).currentFilters = newFilters;
    
    // Beispiel: Event für bestehende JavaScript-Handler
    const event = new CustomEvent('filterChanged', { 
      detail: newFilters 
    });
    window.dispatchEvent(event);
  };

  return (
    <FilterSidebar 
      onFilterChange={handleFilterChange}
      initialFilters={filters}
    />
  );
};

/**
 * Funktion zum Mounten der FilterSidebar in die bestehende Herstelleransicht
 * Diese Funktion sollte aufgerufen werden, wenn die Herstelleransicht aktiviert wird
 */
export const mountFilterSidebar = (containerId: string = 'filter-sidebar-root') => {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.warn(`Container mit ID '${containerId}' nicht gefunden. FilterSidebar wird nicht gemountet.`);
    return null;
  }

  const root = createRoot(container);
  
  root.render(
    <ManufacturerViewIntegration 
      onFilterChange={(filters) => {
        // Hier können Sie die Filter an Ihre bestehende Logik weiterleiten
        console.log('FilterSidebar: Filter geändert', filters);
        
        // Beispiel: Produktliste filtern
        filterProductList(filters);
      }}
    />
  );

  return root;
};

/**
 * Beispiel-Funktion für die Produktfilterung
 * Diese Funktion zeigt, wie die Filter auf eine Produktliste angewendet werden können
 */
const filterProductList = (filters: FilterState) => {
  // Hier würde normalerweise die Produktliste gefiltert werden
  // Dies ist nur ein Beispiel für die Integration
  
  console.log('Filtere Produktliste mit:', filters);
  
  // Beispiel: Filter an bestehende JavaScript-Funktionen weiterleiten
  if (typeof (window as any).filterProducts === 'function') {
    (window as any).filterProducts(filters);
  }
};

/**
 * Funktion zum Entfernen der FilterSidebar
 */
export const unmountFilterSidebar = (containerId: string = 'filter-sidebar-root') => {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = '';
  }
};

/**
 * Hook für die Verwendung der FilterSidebar in React-Komponenten
 */
export const useFilterSidebar = () => {
  const [filters, setFilters] = useState<FilterState>({
    vehicleMass: [],
    impactSpeed: { min: 16, max: 112 },
    impactAngle: { min: 15, max: 90 },
    penetrationDistance: { min: 0, max: 60 },
    standards: [],
    foundation: [],
    operation: [],
    deployment: [],
    categories: {}
  });

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const resetFilters = () => {
    setFilters({
      vehicleMass: [],
      impactSpeed: { min: 16, max: 112 },
      impactAngle: { min: 15, max: 90 },
      penetrationDistance: { min: 0, max: 60 },
      standards: [],
      foundation: [],
      operation: [],
      deployment: [],
      categories: {}
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.vehicleMass?.length > 0) count++;
    if (filters.impactSpeed && (filters.impactSpeed.min !== 16 || filters.impactSpeed.max !== 112)) count++;
    if (filters.impactAngle && (filters.impactAngle.min !== 15 || filters.impactAngle.max !== 90)) count++;
    if (filters.penetrationDistance && (filters.penetrationDistance.min !== 0 || filters.penetrationDistance.max !== 60)) count++;
    if (filters.standards?.length > 0) count++;
    if (filters.foundation?.length > 0) count++;
    if (filters.operation?.length > 0) count++;
    if (filters.deployment?.length > 0) count++;
    if (filters.categories && Object.keys(filters.categories).length > 0) count++;
    return count;
  };

  return {
    filters,
    handleFilterChange,
    resetFilters,
    activeFilterCount: getActiveFilterCount()
  };
};

export default ManufacturerViewIntegration;
