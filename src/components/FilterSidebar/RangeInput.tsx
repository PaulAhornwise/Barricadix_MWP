import React from 'react';
import { RangeInputProps } from './types';
import styles from './RangeInput.module.css';

/**
 * RangeInput-Komponente für numerische Bereichsfilter
 */
const RangeInput: React.FC<RangeInputProps> = ({
  minValue,
  maxValue,
  min,
  max,
  step = 1,
  unit,
  minLabel,
  maxLabel,
  onChange,
  className = ''
}) => {
  const handleMinChange = (value: string) => {
    const numValue = Math.max(min, Math.min(max, parseInt(value) || min));
    onChange({ min: numValue, max: Math.max(numValue, maxValue) });
  };

  const handleMaxChange = (value: string) => {
    const numValue = Math.max(min, Math.min(max, parseInt(value) || max));
    onChange({ min: Math.min(minValue, numValue), max: numValue });
  };

  const handleMinBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || min;
    const clampedValue = Math.max(min, Math.min(max, value));
    if (clampedValue !== minValue) {
      onChange({ min: clampedValue, max: Math.max(clampedValue, maxValue) });
    }
  };

  const handleMaxBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || max;
    const clampedValue = Math.max(min, Math.min(max, value));
    if (clampedValue !== maxValue) {
      onChange({ min: Math.min(minValue, clampedValue), max: clampedValue });
    }
  };

  const handleReset = () => {
    onChange({ min, max });
  };

  const isAtDefault = minValue === min && maxValue === max;

  return (
    <div className={`${styles.rangeInput} ${className}`}>
      {/* Reset Button */}
      <div className={styles.resetContainer}>
        <button
          type="button"
          className={`${styles.resetButton} ${isAtDefault ? styles.disabled : ''}`}
          onClick={handleReset}
          disabled={isAtDefault}
          aria-label="Filter zurücksetzen"
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

      {/* Range Input Fields */}
      <div className={styles.inputContainer}>
        {/* Minimum Input */}
        <div className={styles.inputGroup}>
          <label htmlFor={`min-${minLabel}`} className={styles.inputLabel}>
            {minLabel}
          </label>
          <div className={styles.inputWrapper}>
            <input
              id={`min-${minLabel}`}
              type="number"
              min={min}
              max={max}
              step={step}
              value={minValue}
              onChange={(e) => handleMinChange(e.target.value)}
              onBlur={handleMinBlur}
              className={styles.numberInput}
              aria-label={`${minLabel} in ${unit}`}
              aria-describedby={`min-help-${minLabel}`}
            />
            <span className={styles.unit} id={`min-help-${minLabel}`}>{unit}</span>
          </div>
        </div>

        {/* Separator */}
        <div className={styles.separator}>
          <span className={styles.separatorText}>bis</span>
        </div>

        {/* Maximum Input */}
        <div className={styles.inputGroup}>
          <label htmlFor={`max-${maxLabel}`} className={styles.inputLabel}>
            {maxLabel}
          </label>
          <div className={styles.inputWrapper}>
            <input
              id={`max-${maxLabel}`}
              type="number"
              min={min}
              max={max}
              step={step}
              value={maxValue}
              onChange={(e) => handleMaxChange(e.target.value)}
              onBlur={handleMaxBlur}
              className={styles.numberInput}
              aria-label={`${maxLabel} in ${unit}`}
              aria-describedby={`max-help-${maxLabel}`}
            />
            <span className={styles.unit} id={`max-help-${maxLabel}`}>{unit}</span>
          </div>
        </div>
      </div>

      {/* Range Slider */}
      <div className={styles.sliderContainer}>
        <div className={styles.sliderWrapper}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={minValue}
            onChange={(e) => handleMinChange(e.target.value)}
            className={`${styles.rangeSlider} ${styles.minSlider}`}
            aria-label={`${minLabel} Slider`}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={maxValue}
            onChange={(e) => handleMaxChange(e.target.value)}
            className={`${styles.rangeSlider} ${styles.maxSlider}`}
            aria-label={`${maxLabel} Slider`}
          />
        </div>
        <div className={styles.sliderLabels}>
          <span className={styles.sliderLabel}>{min}</span>
          <span className={styles.sliderLabel}>{max}</span>
        </div>
      </div>
    </div>
  );
};

export default RangeInput;
