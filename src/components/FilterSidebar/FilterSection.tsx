import React, { useState } from 'react';
import { FilterSectionProps } from './types';
import styles from './FilterSection.module.css';

/**
 * Wiederverwendbare FilterSection-Komponente
 * Kann ein- und ausgeklappt werden und enthält beliebige Filter-Steuerelemente
 */
const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  isCollapsed = false,
  onToggle,
  children,
  className = ''
}) => {
  const [collapsed, setCollapsed] = useState(isCollapsed);

  const handleToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onToggle?.();
  };

  return (
    <div className={`${styles.filterSection} ${className}`}>
      <div 
        className={styles.header}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-expanded={!collapsed}
        aria-label={`${title} Filter-Sektion ${collapsed ? 'aufklappen' : 'zuklappen'}`}
      >
        <h3 className={styles.title}>{title}</h3>
        <div className={`${styles.chevron} ${collapsed ? styles.collapsed : styles.expanded}`}>
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
        </div>
      </div>
      
      <div 
        className={`${styles.content} ${collapsed ? styles.collapsed : styles.expanded}`}
        aria-hidden={collapsed}
      >
        {children}
      </div>
    </div>
  );
};

export default FilterSection;
