/**
 * TypeScript-Interfaces für die Filter-Seitenleisten-Komponente
 */

// Basis-Interface für Range-Werte
export interface RangeValue {
  min: number;
  max: number;
}

// Interface für hierarchische Kategorien
export interface CategoryItem {
  label: string;
  count: number;
  children?: CategoryItem[];
}

// Haupt-Interface für den Filterzustand
export interface FilterState {
  vehicleMass: string[];
  impactSpeed: RangeValue;
  impactAngle: RangeValue;
  penetrationDistance: RangeValue;
  standards: string[];
  foundation: string[];
  operation: string[];
  deployment: string[];
  categories: {
    [category: string]: string[];
  };
}

// Props für die FilterSection-Komponente
export interface FilterSectionProps {
  title: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  className?: string;
}

// Props für die FilterSidebar-Komponente
export interface FilterSidebarProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
  className?: string;
}

// Props für Checkbox-Gruppen
export interface CheckboxGroupProps {
  options: Array<{
    value: string;
    label: string;
    count: number;
  }>;
  selectedValues: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

// Props für Range-Input-Gruppen
export interface RangeInputProps {
  minValue: number;
  maxValue: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  minLabel: string;
  maxLabel: string;
  onChange: (value: RangeValue) => void;
  className?: string;
}

// Props für hierarchische Checkbox-Listen
export interface HierarchicalCheckboxProps {
  categories: CategoryItem[];
  selectedValues: { [category: string]: string[] };
  onChange: (values: { [category: string]: string[] }) => void;
  className?: string;
}

// Standardwerte für die Filter
export const DEFAULT_FILTER_STATE: FilterState = {
  vehicleMass: [],
  impactSpeed: { min: 16, max: 112 },
  impactAngle: { min: 15, max: 90 },
  penetrationDistance: { min: 0, max: 60 },
  standards: [],
  foundation: [],
  operation: [],
  deployment: [],
  categories: {}
};

// Vordefinierte Daten für die Filter-Optionen
export const VEHICLE_MASS_OPTIONS = [
  { value: '1500', label: '1500 [M1]', count: 31 },
  { value: '2500', label: '2500 [IT]', count: 0 },
  { value: '2500', label: '2500 [N1G]', count: 42 },
  { value: '3500', label: '3500 [N1]', count: 24 },
  { value: '7200', label: '7200 [N2A]', count: 102 },
  { value: '7200', label: '7200 [N2B]', count: 4 },
  { value: '7200', label: '7200 [N3C]', count: 39 },
  { value: '7500', label: '7500 [N2]', count: 196 },
  { value: '7500', label: '7500 [N3]', count: 65 },
  { value: '12000', label: '12000 [N3D]', count: 1 },
  { value: '30000', label: '30000 [N3F & N31]', count: 3 }
];

export const STANDARDS_OPTIONS = [
  { value: 'development-test-pas-68-2005', label: 'Development test meeting PAS 68:2005', count: 37 },
  { value: 'iso-22343-1-2023', label: 'ISO 22343-1:2023', count: 5 },
  { value: 'iwa-14-1-2013', label: 'IWA 14-1:2013', count: 191 },
  { value: 'pas-68-2005', label: 'PAS 68:2005', count: 9 },
  { value: 'pas-68-2007', label: 'PAS 68:2007', count: 113 },
  { value: 'pas-68-2010', label: 'PAS 68:2010', count: 146 },
  { value: 'pas-68-2013', label: 'PAS 68:2013', count: 6 }
];

export const FOUNDATION_OPTIONS = [
  { value: 'a-free-standing', label: 'A - Free standing (no ground fixings)', count: 104 },
  { value: 'ap-surface-mounted', label: 'Ap - Surface mounted (pinned or bolted to ground)', count: 53 },
  { value: 'b-depth-le-0-5m', label: 'B - Depth <= 0.5m below ground level', count: 219 },
  { value: 'c-depth-gt-0-5m', label: 'C - Depth >0.5m below ground level', count: 128 }
];

export const OPERATION_OPTIONS = [
  { value: 'active', label: 'active', count: 190 },
  { value: 'passive', label: 'passive', count: 313 }
];

export const DEPLOYMENT_OPTIONS = [
  { value: 'permanent', label: 'permanent', count: 383 },
  { value: 'temporary', label: 'temporary', count: 117 }
];

export const CATEGORIES_DATA: CategoryItem[] = [
  {
    label: 'Bollards',
    count: 175,
    children: [
      { label: 'Static', count: 117 },
      { label: 'Retractable', count: 50 },
      { label: 'Sliding', count: 8 }
    ]
  },
  {
    label: 'Perimeter Barriers',
    count: 126,
    children: [
      { label: 'Vehicle', count: 74 },
      { label: 'Modular', count: 40 },
      { label: 'Pedestrian', count: 12 }
    ]
  },
  {
    label: 'Gates',
    count: 78,
    children: [
      { label: 'Swing', count: 35 },
      { label: 'Rising', count: 16 },
      { label: 'Sliding', count: 14 },
      { label: 'Modular', count: 11 },
      { label: 'Retractable', count: 2 }
    ]
  },
  {
    label: 'Street Furniture',
    count: 67,
    children: [
      { label: 'Planters', count: 22 },
      { label: 'Seating', count: 20 },
      { label: 'Other', count: 8 }
    ]
  },
  {
    label: 'Blockers',
    count: 49,
    children: [
      { label: 'Retractable', count: 49 }
    ]
  }
];
