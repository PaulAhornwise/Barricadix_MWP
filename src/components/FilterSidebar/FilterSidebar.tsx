import React, { useState, useEffect, useCallback } from 'react';
import { FilterSidebarProps, FilterState, DEFAULT_FILTER_STATE } from './types';
import FilterSection from './FilterSection';
import CheckboxGroup from './CheckboxGroup';
import RangeInput from './RangeInput';
import HierarchicalCheckbox from './HierarchicalCheckbox';
import {
  VEHICLE_MASS_OPTIONS,
  STANDARDS_OPTIONS,
  FOUNDATION_OPTIONS,
  OPERATION_OPTIONS,
  DEPLOYMENT_OPTIONS,
  CATEGORIES_DATA
} from './types';
import styles from './FilterSidebar.module.css';

/**
 * Hauptkomponente FilterSidebar für die Herstelleransicht
 * Verwaltet den gesamten Filterzustand und kommuniziert mit der übergeordneten Komponente
 */
const FilterSidebar: React.FC<FilterSidebarProps> = ({
  onFilterChange,
  initialFilters = {},
  className = ''
}) => {
  // Initialisiere den Filterzustand
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTER_STATE,
    ...initialFilters
  });

  // Callback für Filteränderungen
  const handleFilterChange = useCallback((newFilters: Partial<FilterState>) => {
    setFilters(prevFilters => {
      const updatedFilters = { ...prevFilters, ...newFilters };
      onFilterChange(updatedFilters);
      return updatedFilters;
    });
  }, [onFilterChange]);

  // Benachrichtige übergeordnete Komponente über Änderungen
  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  // Handler für Vehicle Mass Filter
  const handleVehicleMassChange = (values: string[]) => {
    handleFilterChange({ vehicleMass: values });
  };

  // Handler für Impact Speed Filter
  const handleImpactSpeedChange = (value: { min: number; max: number }) => {
    handleFilterChange({ impactSpeed: value });
  };

  // Handler für Impact Angle Filter
  const handleImpactAngleChange = (value: { min: number; max: number }) => {
    handleFilterChange({ impactAngle: value });
  };

  // Handler für Penetration Distance Filter
  const handlePenetrationDistanceChange = (value: { min: number; max: number }) => {
    handleFilterChange({ penetrationDistance: value });
  };

  // Handler für Standards Filter
  const handleStandardsChange = (values: string[]) => {
    handleFilterChange({ standards: values });
  };

  // Handler für Foundation Filter
  const handleFoundationChange = (values: string[]) => {
    handleFilterChange({ foundation: values });
  };

  // Handler für Operation Filter
  const handleOperationChange = (values: string[]) => {
    handleFilterChange({ operation: values });
  };

  // Handler für Deployment Filter
  const handleDeploymentChange = (values: string[]) => {
    handleFilterChange({ deployment: values });
  };

  // Handler für Categories Filter
  const handleCategoriesChange = (values: { [category: string]: string[] }) => {
    handleFilterChange({ categories: values });
  };

  // Handler für Reset aller Filter
  const handleResetAll = () => {
    setFilters(DEFAULT_FILTER_STATE);
    onFilterChange(DEFAULT_FILTER_STATE);
  };

  // Zähle aktive Filter
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
    <aside className={`${styles.filterSidebar} ${className}`}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>Filter</h2>
        <div className={styles.headerActions}>
          {activeFilterCount > 0 && (
            <span className={styles.activeCount}>
              {activeFilterCount} aktiv
            </span>
          )}
          <button
            type="button"
            className={styles.resetButton}
            onClick={handleResetAll}
            disabled={activeFilterCount === 0}
            aria-label="Alle Filter zurücksetzen"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path 
                d="M7 1V3M7 11V13M3 7H1M13 7H11M2.5 2.5L4 4M10 10L11.5 11.5M2.5 11.5L4 10M10 4L11.5 2.5" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            Zurücksetzen
          </button>
        </div>
      </div>

      {/* Filter Sections */}
      <div className={styles.filterContent}>
        {/* Vehicle Mass Filter */}
        <FilterSection title="Vehicle Mass (kg)">
          <CheckboxGroup
            options={VEHICLE_MASS_OPTIONS}
            selectedValues={filters.vehicleMass}
            onChange={handleVehicleMassChange}
          />
        </FilterSection>

        {/* Impact Speed Filter */}
        <FilterSection title="Impact Speed (Km/h)">
          <RangeInput
            minValue={filters.impactSpeed.min}
            maxValue={filters.impactSpeed.max}
            min={0}
            max={200}
            step={1}
            unit="Km/h"
            minLabel="Minimum speed"
            maxLabel="Maximum speed"
            onChange={handleImpactSpeedChange}
          />
        </FilterSection>

        {/* Impact Angle Filter */}
        <FilterSection title="Impact Angle (°)">
          <RangeInput
            minValue={filters.impactAngle.min}
            maxValue={filters.impactAngle.max}
            min={0}
            max={180}
            step={1}
            unit="°"
            minLabel="Minimum angle"
            maxLabel="Maximum angle"
            onChange={handleImpactAngleChange}
          />
        </FilterSection>

        {/* Penetration Distance Filter */}
        <FilterSection title="Penetration Distance (m)">
          <RangeInput
            minValue={filters.penetrationDistance.min}
            maxValue={filters.penetrationDistance.max}
            min={0}
            max={100}
            step={0.1}
            unit="m"
            minLabel="Minimum distance"
            maxLabel="Maximum distance"
            onChange={handlePenetrationDistanceChange}
          />
        </FilterSection>

        {/* Standards Filter */}
        <FilterSection title="Standard">
          <CheckboxGroup
            options={STANDARDS_OPTIONS}
            selectedValues={filters.standards}
            onChange={handleStandardsChange}
          />
        </FilterSection>

        {/* Foundation Filter */}
        <FilterSection title="Foundation">
          <CheckboxGroup
            options={FOUNDATION_OPTIONS}
            selectedValues={filters.foundation}
            onChange={handleFoundationChange}
          />
        </FilterSection>

        {/* Operation Filter */}
        <FilterSection title="Operation">
          <CheckboxGroup
            options={OPERATION_OPTIONS}
            selectedValues={filters.operation}
            onChange={handleOperationChange}
          />
        </FilterSection>

        {/* Deployment Filter */}
        <FilterSection title="Deployment">
          <CheckboxGroup
            options={DEPLOYMENT_OPTIONS}
            selectedValues={filters.deployment}
            onChange={handleDeploymentChange}
          />
        </FilterSection>

        {/* Categories / Style of VSB Filter */}
        <FilterSection title="Categories / Style of VSB">
          <HierarchicalCheckbox
            categories={CATEGORIES_DATA}
            selectedValues={filters.categories}
            onChange={handleCategoriesChange}
          />
        </FilterSection>
      </div>
    </aside>
  );
};

export default FilterSidebar;
