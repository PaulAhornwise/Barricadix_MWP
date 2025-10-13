import React from 'react';
import { CheckboxGroupProps } from './types';
import styles from './CheckboxGroup.module.css';

/**
 * CheckboxGroup-Komponente für Filter mit mehreren Auswahlmöglichkeiten
 */
const CheckboxGroup: React.FC<CheckboxGroupProps> = ({
  options,
  selectedValues,
  onChange,
  className = ''
}) => {
  const handleCheckboxChange = (value: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedValues, value]);
    } else {
      onChange(selectedValues.filter(v => v !== value));
    }
  };

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(option => option.value));
    }
  };

  const allSelected = selectedValues.length === options.length;
  const someSelected = selectedValues.length > 0 && selectedValues.length < options.length;

  return (
    <div className={`${styles.checkboxGroup} ${className}`}>
      {/* Select All / Deselect All Button */}
      <div className={styles.selectAllContainer}>
        <button
          type="button"
          className={`${styles.selectAllButton} ${allSelected ? styles.allSelected : someSelected ? styles.someSelected : ''}`}
          onClick={handleSelectAll}
          aria-label={allSelected ? 'Alle abwählen' : 'Alle auswählen'}
        >
          <div className={styles.checkbox}>
            {allSelected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {someSelected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="5" width="6" height="2" fill="currentColor"/>
              </svg>
            )}
          </div>
          <span className={styles.selectAllText}>
            {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
          </span>
        </button>
      </div>

      {/* Individual Checkboxes */}
      <div className={styles.checkboxList}>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          const isDisabled = option.count === 0;
          
          return (
            <label
              key={option.value}
              className={`${styles.checkboxItem} ${isSelected ? styles.selected : ''} ${isDisabled ? styles.disabled : ''}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isDisabled}
                onChange={(e) => handleCheckboxChange(option.value, e.target.checked)}
                className={styles.checkboxInput}
                aria-describedby={`count-${option.value}`}
              />
              <div className={styles.checkbox}>
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className={styles.label}>{option.label}</span>
              <span 
                id={`count-${option.value}`}
                className={`${styles.count} ${isDisabled ? styles.countDisabled : ''}`}
              >
                ({option.count})
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default CheckboxGroup;
