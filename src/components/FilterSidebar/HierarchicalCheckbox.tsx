import React, { useState } from 'react';
import { HierarchicalCheckboxProps, CategoryItem } from './types';
import styles from './HierarchicalCheckbox.module.css';

/**
 * HierarchicalCheckbox-Komponente für verschachtelte Kategorien
 */
const HierarchicalCheckbox: React.FC<HierarchicalCheckboxProps> = ({
  categories,
  selectedValues,
  onChange,
  className = ''
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategoryExpansion = (categoryLabel: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryLabel)) {
      newExpanded.delete(categoryLabel);
    } else {
      newExpanded.add(categoryLabel);
    }
    setExpandedCategories(newExpanded);
  };

  const getCategoryValues = (category: CategoryItem): string[] => {
    const values: string[] = [];
    if (category.children) {
      category.children.forEach(child => {
        values.push(`${category.label}-${child.label}`);
      });
    } else {
      values.push(category.label);
    }
    return values;
  };

  const getSelectedValuesForCategory = (category: CategoryItem): string[] => {
    const categoryKey = category.label;
    return selectedValues[categoryKey] || [];
  };

  const handleCategoryChange = (category: CategoryItem, checked: boolean) => {
    const categoryKey = category.label;
    const categoryValues = getCategoryValues(category);
    
    if (checked) {
      // Select all children
      onChange({
        ...selectedValues,
        [categoryKey]: categoryValues
      });
    } else {
      // Deselect all children
      const newSelectedValues = { ...selectedValues };
      delete newSelectedValues[categoryKey];
      onChange(newSelectedValues);
    }
  };

  const handleChildChange = (category: CategoryItem, child: CategoryItem, checked: boolean) => {
    const categoryKey = category.label;
    const childValue = `${category.label}-${child.label}`;
    const currentSelected = getSelectedValuesForCategory(category);
    
    let newSelected: string[];
    if (checked) {
      newSelected = [...currentSelected, childValue];
    } else {
      newSelected = currentSelected.filter(v => v !== childValue);
    }
    
    onChange({
      ...selectedValues,
      [categoryKey]: newSelected
    });
  };

  const isCategorySelected = (category: CategoryItem): boolean => {
    const categoryValues = getCategoryValues(category);
    const selected = getSelectedValuesForCategory(category);
    return categoryValues.every(value => selected.includes(value));
  };

  const isCategoryPartiallySelected = (category: CategoryItem): boolean => {
    const categoryValues = getCategoryValues(category);
    const selected = getSelectedValuesForCategory(category);
    return selected.length > 0 && selected.length < categoryValues.length;
  };

  const isChildSelected = (category: CategoryItem, child: CategoryItem): boolean => {
    const childValue = `${category.label}-${child.label}`;
    const selected = getSelectedValuesForCategory(category);
    return selected.includes(childValue);
  };

  const renderCategory = (category: CategoryItem) => {
    const isExpanded = expandedCategories.has(category.label);
    const isSelected = isCategorySelected(category);
    const isPartiallySelected = isCategoryPartiallySelected(category);
    const hasChildren = category.children && category.children.length > 0;

    return (
      <div key={category.label} className={styles.categoryItem}>
        {/* Main Category */}
        <div className={styles.categoryHeader}>
          <label
            className={`${styles.categoryLabel} ${isSelected ? styles.selected : ''} ${isPartiallySelected ? styles.partiallySelected : ''}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = isPartiallySelected;
                }
              }}
              onChange={(e) => handleCategoryChange(category, e.target.checked)}
              className={styles.checkboxInput}
            />
            <div className={styles.checkbox}>
              {isSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {isPartiallySelected && !isSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="6" height="2" fill="currentColor"/>
                </svg>
              )}
            </div>
            <span className={styles.categoryName}>{category.label}</span>
            <span className={styles.categoryCount}>({category.count})</span>
          </label>
          
          {hasChildren && (
            <button
              type="button"
              className={`${styles.expandButton} ${isExpanded ? styles.expanded : ''}`}
              onClick={() => toggleCategoryExpansion(category.label)}
              aria-label={`${category.label} ${isExpanded ? 'zuklappen' : 'aufklappen'}`}
              aria-expanded={isExpanded}
            >
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path 
                  d="M3 4.5L6 7.5L9 4.5" 
                  stroke="currentColor" 
                  strokeWidth="1.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Children */}
        {hasChildren && (
          <div className={`${styles.childrenContainer} ${isExpanded ? styles.expanded : styles.collapsed}`}>
            {category.children!.map((child) => (
              <label
                key={`${category.label}-${child.label}`}
                className={`${styles.childLabel} ${isChildSelected(category, child) ? styles.selected : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChildSelected(category, child)}
                  onChange={(e) => handleChildChange(category, child, e.target.checked)}
                  className={styles.checkboxInput}
                />
                <div className={styles.checkbox}>
                  {isChildSelected(category, child) && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className={styles.childName}>{child.label}</span>
                <span className={styles.childCount}>({child.count})</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${styles.hierarchicalCheckbox} ${className}`}>
      {categories.map(renderCategory)}
    </div>
  );
};

export default HierarchicalCheckbox;
