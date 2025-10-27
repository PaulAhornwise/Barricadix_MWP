/**
 * Leaflet control for displaying data source attribution.
 * 
 * This provides a simple text overlay that shows which data source
 * is currently being used (NRW or OSM).
 */
export class SourceAttributionControl {
  private providerId: string = 'osm';
  private element: HTMLElement | null = null;
  private options: any;

  constructor(options?: any) {
    this.options = options || {};
  }

  onAdd(map: any): HTMLElement {
    this.element = (window as any).L.DomUtil.create('div', 'source-attribution-control');
    if (this.element) {
      this.element.style.cssText = `
        background: rgba(255, 255, 255, 0.9);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: #333;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        pointer-events: none;
        z-index: 1000;
      `;
      
      this.updateText();
    }
    return this.element!;
  }

  onRemove(map: any): void {
    // Cleanup if needed
  }

  addTo(map: any): this {
    map.addControl(this);
    return this;
  }

  /**
   * Update the displayed provider ID and refresh the text.
   */
  setProvider(providerId: string): void {
    this.providerId = providerId;
    this.updateText();
  }

  /**
   * Get the current provider ID.
   */
  getProvider(): string {
    return this.providerId;
  }

  private updateText(): void {
    if (!this.element) return;

    const text = this.getAttributionText(this.providerId);
    this.element.textContent = text;
  }

  private getAttributionText(providerId: string): string {
    switch (providerId) {
      case 'nrw':
        return 'Quelle: GEOBASIS.NRW';
      case 'osm':
        return 'Quelle: OSM';
      default:
        return 'Quelle: Unbekannt';
    }
  }
}

// Export the control for use in other modules
