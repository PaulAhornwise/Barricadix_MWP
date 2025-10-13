import React, { useState } from 'react';
import { FilterSidebar, FilterState, DEFAULT_FILTER_STATE } from './index';
import styles from './FilterSidebarDemo.module.css';

/**
 * Demo-Komponente für die FilterSidebar
 * Zeigt die Verwendung und Integration der FilterSidebar
 */
const FilterSidebarDemo: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [showDemo, setShowDemo] = useState(false);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    console.log('Demo: Filter geändert', newFilters);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTER_STATE);
  };

  const getActiveFilterCount = (): number => {
    let count = 0;
    if (filters.vehicleMass.length > 0) count++;
    if (filters.impactSpeed.min !== DEFAULT_FILTER_STATE.impactSpeed.min || 
        filters.impactSpeed.max !== DEFAULT_FILTER_STATE.impactSpeed.max) count++;
    if (filters.impactAngle.min !== DEFAULT_FILTER_STATE.impactAngle.min || 
        filters.impactAngle.max !== DEFAULT_FILTER_STATE.impactAngle.max) count++;
    if (filters.penetrationDistance.min !== DEFAULT_FILTER_STATE.penetrationDistance.min || 
        filters.penetrationDistance.max !== DEFAULT_FILTER_STATE.penetrationDistance.max) count++;
    if (filters.standards.length > 0) count++;
    if (filters.foundation.length > 0) count++;
    if (filters.operation.length > 0) count++;
    if (filters.deployment.length > 0) count++;
    if (Object.keys(filters.categories).length > 0) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className={styles.demoContainer}>
      <div className={styles.demoHeader}>
        <h1>FilterSidebar Demo</h1>
        <p>Eine umfassende Filter-Seitenleisten-Komponente für die Herstelleransicht</p>
        
        <div className={styles.demoControls}>
          <button
            className={styles.toggleButton}
            onClick={() => setShowDemo(!showDemo)}
          >
            {showDemo ? 'Demo ausblenden' : 'Demo anzeigen'}
          </button>
          
          {showDemo && (
            <button
              className={styles.resetButton}
              onClick={handleResetFilters}
              disabled={activeFilterCount === 0}
            >
              Alle Filter zurücksetzen ({activeFilterCount} aktiv)
            </button>
          )}
        </div>
      </div>

      {showDemo && (
        <div className={styles.demoContent}>
          <div className={styles.sidebarContainer}>
            <FilterSidebar 
              onFilterChange={handleFilterChange}
              initialFilters={filters}
            />
          </div>
          
          <div className={styles.contentArea}>
            <div className={styles.filterDisplay}>
              <h2>Aktive Filter</h2>
              <div className={styles.filterInfo}>
                <p><strong>Anzahl aktiver Filter:</strong> {activeFilterCount}</p>
                
                {activeFilterCount > 0 && (
                  <div className={styles.filterDetails}>
                    <h3>Filter-Details:</h3>
                    <pre className={styles.filterJson}>
                      {JSON.stringify(filters, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            
            <div className={styles.usageExample}>
              <h2>Verwendung</h2>
              <div className={styles.codeExample}>
                <pre>
{`import { FilterSidebar, FilterState } from './components/FilterSidebar';

const MyComponent = () => {
  const [filters, setFilters] = useState<FilterState>({});

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    // Hier können Sie die Filter an Ihre Suchlogik weiterleiten
  };

  return (
    <FilterSidebar 
      onFilterChange={handleFilterChange}
      initialFilters={filters}
    />
  );
};`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterSidebarDemo;
