/**
 * Helper to build robust image paths for PDF and UI
 * Handles BASE_URL correctly for GH Pages
 */
export const img = (rel: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  const clean = rel.replace(/^\/?images\//, '');
  return `${base}images/${clean}`;
};

