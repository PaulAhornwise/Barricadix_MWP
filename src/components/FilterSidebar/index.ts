/**
 * FilterSidebar Komponenten-Export
 * Zentrale Exportdatei für alle FilterSidebar-Komponenten
 */

export { default as FilterSidebar } from './FilterSidebar';
export { default as FilterSection } from './FilterSection';
export { default as CheckboxGroup } from './CheckboxGroup';
export { default as RangeInput } from './RangeInput';
export { default as HierarchicalCheckbox } from './HierarchicalCheckbox';

// TypeScript-Interfaces und -Typen exportieren
export type {
  FilterState,
  RangeValue,
  CategoryItem,
  FilterSectionProps,
  FilterSidebarProps,
  CheckboxGroupProps,
  RangeInputProps,
  HierarchicalCheckboxProps
} from './types';

// Konstanten exportieren
export {
  DEFAULT_FILTER_STATE,
  VEHICLE_MASS_OPTIONS,
  STANDARDS_OPTIONS,
  FOUNDATION_OPTIONS,
  OPERATION_OPTIONS,
  DEPLOYMENT_OPTIONS,
  CATEGORIES_DATA
} from './types';
