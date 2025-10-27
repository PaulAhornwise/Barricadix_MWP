import React from 'react';

interface SourceAttributionProps {
  providerId: string;
  className?: string;
}

/**
 * Source attribution component that displays the current data source.
 * 
 * Shows appropriate attribution based on the active provider:
 * - "Quelle: GEOBASIS.NRW" for NRW provider
 * - "Quelle: OSM" for OSM provider
 */
export const SourceAttribution: React.FC<SourceAttributionProps> = ({ 
  providerId, 
  className = "source-attribution" 
}) => {
  const getAttributionText = (id: string): string => {
    switch (id) {
      case 'nrw':
        return 'Quelle: GEOBASIS.NRW';
      case 'osm':
        return 'Quelle: OSM';
      default:
        return 'Quelle: Unbekannt';
    }
  };

  return (
    <div className={className}>
      {getAttributionText(providerId)}
    </div>
  );
};

export default SourceAttribution;
