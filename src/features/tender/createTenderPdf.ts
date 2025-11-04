/**
 * Municipal-grade Tender (Ausschreibung) PDF Generator
 * Creates a legally compliant Leistungsverzeichnis (LV) document
 * following German procurement law (VOB/A, UVgO)
 */

import type { SelectedProduct } from '../../stores/useTenderSelection';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Sanitizes German text: normalizes UTF-8, fixes quotes, removes control chars, collapses whitespace
 */
export function sanitizeDe(s: string, addBreakPoints: boolean = true): string {
    // 1. UTF-8 normalization (NFC)
    let normalized = s.normalize('NFC');
    
    // 2. Replace problematic Unicode characters with ASCII equivalents
    normalized = normalized
        .replace(/≤/g, '<=')       // Less than or equal
        .replace(/≥/g, '>=')       // Greater than or equal
        .replace(/'/g, "'")        // Straight single quote → curly right
        .replace(/'/g, "'")        // Straight single quote → curly left
        .replace(/"/g, '"')        // Straight double quote → curly right
        .replace(/"/g, '"')        // Straight double quote → curly left
        .replace(/…/g, '...');     // Ellipsis → three dots
    
    // 3. Remove control characters (keep tabs/newlines for layout)
    normalized = normalized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    // Remove any existing zero-width characters that might cause letter spacing issues
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // 4. Collapse whitespace (but preserve intentional line breaks)
    normalized = normalized.replace(/[ \t]+/g, ' ');
    
    // 5. Add zero-width spaces only for table cells (long descriptions)
    if (addBreakPoints) {
        normalized = normalized
            .replace(/\//g, '/\u200B')      // After slashes
            .replace(/-/g, '-\u200B')       // After hyphens
            .replace(/_/g, '_\u200B')       // After underscores
            .replace(/\(/g, '(\u200B')      // After opening parens
            .replace(/\)/g, '\u200B)');     // Before closing parens
    }
    
    return normalized.trim();
}

/**
 * Formats currency according to German locale
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Converts millimeters to points (1 mm = 2.83465 pt)
 */
export function mmToPt(mmVal: number): number {
    return mmVal * 2.83465;
}

/**
 * Helper for mm to pt conversion (alias for compatibility)
 */
export function mm(mmVal: number): number {
    return mmToPt(mmVal);
}

/**
 * LV table column widths in mm: POS 12 | BESCHR 90 | MENGE 14 | EINH 12 | EP 20 | GP 22
 * Total = 170mm
 */
export const LV_COL_WIDTHS_MM = [12, 90, 14, 12, 20, 22];

/**
 * LV table column widths in mm (as numbers)
 */
export const LV_COL_WIDTHS = LV_COL_WIDTHS_MM;

// Type definitions for tender data
export interface TenderProjectMeta {
    KOMMUNE: string;
    AMT: string;
    STRASSEN_PLANGEBIET: string;
    VERFAHRENSNR: string;
    VERGABEART: string;
    LOS_NR: string[];
    KOSTENSTELLE: string;
    ANSPRECHPARTNER: string;
    KONTAKT: string;
    DATUM_STAND: string;
}

export interface TenderEvent {
    veranstaltung: string;
    zeitraum: string;
    aufbau_ab: string;
    abbau_bis: string;
    erwartete_besucher: string;
    rettungswege: string;
}

export interface TenderZufahrt {
    id: string;
    strasse_platz: string;
    nutzungsprofil: string;
    freihaltebreite: number;
    radien: number;
    längsgefälle: number;
    untergrund: string;
    medien_leitungslage: string;
    fluchtwegbezug: string;
    rettungsdienst: boolean;
    räumfahrzeugbedarf: boolean;
}

export interface TenderPerformanceRequirements {
    fahrzeugklasse: string;
    anprallgeschwindigkeit: number;
    anprallenergie: number;
    penetration: number;
    restfahrzeuggeschwindigkeit: number;
    öffnungsart: string;
    durchfahrtsbreite: number;
    notentriegelung: boolean;
    schliesssystem: string;
    wartung: string;
}

export interface TenderPosition {
    position: string;
    beschreibung: string;
    menge: number;
    einheit: string;
    ep?: number; // Einzelpreis
    gp?: number; // Gesamtpreis
}

/**
 * Creates a municipal-grade tender PDF document
 */
export async function createTenderPdf(
    projectMeta: TenderProjectMeta,
    event: TenderEvent,
    zufahrten: TenderZufahrt[],
    performanceRequirements: Map<string, TenderPerformanceRequirements>,
    selectedProducts: SelectedProduct[],
    mapImage?: string
): Promise<any> {
    const { jsPDF } = (window as any).jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const addWatermarkToCurrentPage = () => {
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.saveGraphicsState();
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(120);
        pdf.setTextColor(200, 200, 200);
        if (jsPDF.GState) {
            const gState = new jsPDF.GState({ opacity: 0.2 });
            pdf.setGState(gState);
        }
        pdf.text('Vertraulich', (pageWidth / 2) + 50, (pageHeight / 2) + 50, { align: 'center', angle: 45 });
        pdf.restoreGraphicsState();
    };

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageMargin = 20;
    const contentWidth = pageWidth - 2 * pageMargin;
    let currentY = pageMargin;
    
    // Helper to add footer and page numbers
    const addFooterAndPageNumber = (pageNum: number, totalPages: number) => {
        // Save current font settings
        const currentFont = (pdf.internal as any).getFont();
        const currentFontSize = pdf.internal.getFontSize();
        
        const footerY = pageHeight - 10;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        
        // Footer: {KOMMUNE} · {VERFAHRENSNR} · "Stand: {DATUM_STAND}"
        const footerText = `${projectMeta.KOMMUNE} · ${projectMeta.VERFAHRENSNR} · Stand: ${projectMeta.DATUM_STAND}`;
        pdf.text(footerText, pageWidth / 2, footerY, { align: 'center' });
        
        // Page number: "Seite {x} von {y}"
        const pageText = `Seite ${pageNum} von ${totalPages}`;
        pdf.text(pageText, pageWidth / 2, footerY + 5, { align: 'center' });
        
        // Restore previous font settings
        pdf.setFont(currentFont.fontName, currentFont.fontStyle);
        pdf.setFontSize(currentFontSize);
    };
    
    // Helper to check if we need a new page
    const checkPageBreak = (requiredHeight: number, preserveFont: boolean = false): boolean => {
        if (currentY + requiredHeight > pageHeight - 20) {
            // Don't add footer here - will be added at the end for all pages
            pdf.addPage();
            currentY = pageMargin;
            // Restore default font settings after page break (unless preserveFont is true)
            if (!preserveFont) {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(10);
            }
            return true;
        }
        return false;
    };
    
    // Helper to add section heading
    const addSectionHeading = (text: string, level: 1 | 2 | 3 = 1) => {
        checkPageBreak(15, true); // Preserve font because we set it manually
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(level === 1 ? 14 : level === 2 ? 12 : 10);
        pdf.text(text, pageMargin, currentY);
        currentY += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10); // Reset to default text size
    };
    
    // Helper to add table with fixed column widths
    const addTable = (headers: string[], rows: string[][], colWidths: number[]) => {
        checkPageBreak(30, true); // Preserve font because we set it manually for table
        const startY = currentY;
        const rowHeight = 7;
        const headerHeight = 8;
        
        // Table header
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        let x = pageMargin;
        headers.forEach((header, i) => {
            // Align headers the same way as data: right-aligned with -2 offset for cols >= 2
            const cellX = i >= 2 ? x + colWidths[i] - 2 : x;
            pdf.text(header, cellX, currentY, { align: i >= 2 ? 'right' : 'left' });
            x += colWidths[i];
        });
        currentY += headerHeight;
        
        // Draw header underline
        pdf.setLineWidth(0.5);
        const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);
        pdf.line(pageMargin, currentY - 2, pageMargin + totalTableWidth, currentY - 2);
        
        // Add spacing between line and first row
        currentY += 2;
        
        // Table rows
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8); // Smaller font for better fit
        rows.forEach((row, rowIdx) => {
            // Check if we need a page break
            if (currentY + rowHeight > pageHeight - 20) {
                // Add "Übertrag" line
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(7);
                pdf.text('Übertrag', pageMargin + totalTableWidth - 5, currentY, { align: 'right' });
                currentY += rowHeight;
                
                // New page - repeat header
                // Don't add footer here - will be added at the end for all pages
                pdf.addPage();
                currentY = pageMargin;
                
                // Repeat header on new page
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                x = pageMargin;
                headers.forEach((header, i) => {
                    // Align headers the same way as data: right-aligned with -2 offset for cols >= 2
                    const cellX = i >= 2 ? x + colWidths[i] - 2 : x;
                    pdf.text(header, cellX, currentY, { align: i >= 2 ? 'right' : 'left' });
                    x += colWidths[i];
                });
                currentY += headerHeight;
                pdf.line(pageMargin, currentY - 2, pageMargin + totalTableWidth, currentY - 2);
                // Add spacing between line and first row
                currentY += 2;
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
            }
            
            // Draw row cells
            x = pageMargin;
            row.forEach((cell, colIdx) => {
                // Handle multi-line descriptions (colIdx === 1)
                if (colIdx === 1 && cell.length > 60) {
                    // Split long descriptions - use exact width to prevent stretching
                    const cellWidth = colWidths[colIdx] - 2;
                    const lines = pdf.splitTextToSize(cell, cellWidth);
                    lines.forEach((line: string, lineIdx: number) => {
                        if (lineIdx > 0 && currentY + rowHeight > pageHeight - 20) {
                            // Page break in middle of cell
                            checkPageBreak(rowHeight, true); // Preserve font for table content
                            pdf.setFont('helvetica', 'normal');
                            pdf.setFontSize(8); // Restore table font size
                        }
                        // Render text as-is without stretching - left align only
                        pdf.text(line, x + 1, currentY + (lineIdx * 4), { align: 'left' });
                    });
                    currentY += Math.max(rowHeight, (lines.length - 1) * 4);
                } else {
                    const alignment = colIdx >= 2 ? 'right' : 'left';
                    pdf.text(cell, x + (colIdx >= 2 ? colWidths[colIdx] - 2 : 1), currentY, { align: alignment });
                }
                x += colWidths[colIdx];
            });
            currentY += rowHeight;
        });
        
        currentY += 5; // Space after table
    };
    
    // ==========================================
    // SECTION 0: DECKBLATT (Cover Sheet)
    // ==========================================
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    const title = `Ausschreibung Zufahrtschutz – ${projectMeta.KOMMUNE}`;
    const maxTitleWidth = pageWidth - 2 * pageMargin;
    const titleLines = pdf.splitTextToSize(title, maxTitleWidth);
    const titleBaseY = 40;
    const titleLineHeight = 8;
    let lastTitleY = titleBaseY;
    titleLines.forEach((line: string, idx: number) => {
        lastTitleY = titleBaseY + idx * titleLineHeight;
        pdf.text(line, pageWidth / 2, lastTitleY, { align: 'center' });
    });
    
    pdf.setFontSize(10); // Smaller font for subtitle
    pdf.setFont('helvetica', 'normal');
    let subtitle = `${projectMeta.VERFAHRENSNR} · ${projectMeta.VERGABEART}`;
    if (projectMeta.LOS_NR.length > 0) {
        subtitle += ` · Los ${projectMeta.LOS_NR.join(', ')}`;
    }
    subtitle += ` · ${projectMeta.STRASSEN_PLANGEBIET}`;
    
    // Wrap subtitle text to fit page width
    const maxSubtitleWidth = pageWidth - 2 * pageMargin;
    const subtitleLines = pdf.splitTextToSize(subtitle, maxSubtitleWidth);
    const subtitleStartY = lastTitleY + 10;
    let lastSubtitleY = subtitleStartY;
    subtitleLines.forEach((line: string, idx: number) => {
        lastSubtitleY = subtitleStartY + (idx * 5);
        pdf.text(line, pageWidth / 2, lastSubtitleY, { align: 'center' });
    });
    
    currentY = Math.max(70, lastSubtitleY + 20);
    
    // Two-column layout for contact info
    pdf.setFontSize(10);
    pdf.text(`Ansprechpartner:`, pageMargin, currentY);
    const ansprechpartnerLines = pdf.splitTextToSize(projectMeta.ANSPRECHPARTNER, 80);
    ansprechpartnerLines.forEach((line: string, idx: number) => {
        pdf.text(line, pageMargin + 50, currentY + (idx * 6));
    });
    currentY += Math.max(6, ansprechpartnerLines.length * 6);
    
    pdf.text(`Amt:`, pageMargin, currentY);
    const amtLines = pdf.splitTextToSize(projectMeta.AMT, 80);
    amtLines.forEach((line: string, idx: number) => {
        pdf.text(line, pageMargin + 50, currentY + (idx * 6));
    });
    currentY += Math.max(6, amtLines.length * 6);
    
    pdf.text(`Kontakt:`, pageMargin, currentY);
    const kontaktLines = pdf.splitTextToSize(projectMeta.KONTAKT, 80);
    kontaktLines.forEach((line: string, idx: number) => {
        pdf.text(line, pageMargin + 50, currentY + (idx * 6));
    });
    currentY += Math.max(6, kontaktLines.length * 6);
    
    pdf.text(`Datum:`, pageMargin, currentY);
    pdf.text(projectMeta.DATUM_STAND, pageMargin + 50, currentY);
    currentY += 6 + 10;
    
    // Optional: Map image if available
    if (mapImage) {
        try {
            // Get actual image dimensions by loading it
            const img = new Image();
            img.src = mapImage;
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Image load timeout')), 5000);
                img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                img.onerror = reject;
            });
            
            const mapAspectRatio = img.width / img.height;
            const maxWidth = contentWidth * 0.7; // Use more width
            const maxHeight = 80; // Max height in mm
            const calculatedHeight = maxWidth / mapAspectRatio;
            const calculatedWidth = maxHeight * mapAspectRatio;
            
            // Use whichever constraint is tighter
            const imgWidth = calculatedHeight > maxHeight ? calculatedWidth : maxWidth;
            const imgHeight = calculatedHeight > maxHeight ? maxHeight : calculatedHeight;
            
            if (currentY + imgHeight < pageHeight - 30) {
                pdf.addImage(mapImage, 'PNG', pageMargin + contentWidth / 2 - imgWidth / 2, currentY, imgWidth, imgHeight);
                currentY += imgHeight + 10;
            }
        } catch (e) {
            console.warn('Could not add map image to cover:', e);
        }
    }
    
    // Don't add footer here - will be added at the end for all pages
    currentY = pageMargin;
    pdf.addPage();
    
    // ==========================================
    // SECTION 1: VERGABE-/VERFAHRENSDATEN
    // ==========================================
    addSectionHeading('1. Vergabe-/Verfahrensdaten', 1);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    const vergabeData = [
        `Auftraggeber: ${projectMeta.KOMMUNE}/${projectMeta.AMT}`,
        `Ausführungsort: ${projectMeta.STRASSEN_PLANGEBIET}`,
        `Vergabeart: ${projectMeta.VERGABEART}`,
        `Losaufteilung: ${projectMeta.LOS_NR.length > 0 ? projectMeta.LOS_NR.join(', ') : 'Ein Los'}`,
        `Ausführungsfristen:`,
        `  - Aufbau: ${event.aufbau_ab}`,
        `  - Abbau: ${event.abbau_bis}`,
        `  - Bauzeitenfenster: ${event.zeitraum}`,
        `Nebenangebote: zugelassen`,
        `Bieterkommunikation: Vergabemarktplatz, Anfragen bis 14 Tage vor Angebotsfrist`,
        `Eignungsanforderungen:`,
        `  - Leistungsfähigkeit im Bereich HVM/Hochschutz`,
        `  - Referenzen vergleichbarer Projekte`,
        `  - Qualifikationen für Montage und Inbetriebnahme`
    ];
    
    vergabeData.forEach(line => {
        checkPageBreak(6);
        const indent = line.startsWith('  ') ? 10 : 0;
        const maxWidth = contentWidth - indent;
        // Sanitize text without adding break points (false parameter)
        const sanitizedLine = sanitizeDe(line, false);
        const wrappedLines = pdf.splitTextToSize(sanitizedLine, maxWidth);
        wrappedLines.forEach((wrappedLine: string) => {
            if (currentY > pageHeight - 25) {
                // Don't add footer here - will be added at the end for all pages
                pdf.addPage();
                currentY = pageMargin;
                // Restore font settings after page break
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(10);
            }
            pdf.text(wrappedLine, pageMargin + indent, currentY);
            currentY += 6;
        });
    });
    
    currentY += 10;
    
    // ==========================================
    // SECTION 2: VORBEMERKUNG / VERTRAGSTEXT
    // ==========================================
    addSectionHeading('2. Vorbemerkung / Vertragstext', 1);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    const vorbemerkungText = [
        `Kurzbeschreibung der Maßnahme:`,
        `Zufahrtschutz für ${event.veranstaltung} im Bereich ${projectMeta.STRASSEN_PLANGEBIET}.`,
        ``,
        `Gegenstand der Ausschreibung:`,
        `Die Ausschreibung umfasst die Lieferung, Montage, Inbetriebnahme, Dokumentation, Einweisung und Wartung von Zufahrtsicherungsbarrieren.`,
        ``,
        `Abrechnung:`,
        `Die Abrechnung erfolgt nach Aufmaß.`,
        ``,
        `Hinweise zur Ausführung/Installation:`,
        `Die Ausführung hat nach folgenden Normen und Regeln zu erfolgen:`,
        `- DIN SPEC 91414-2`,
        `- IWA 14-1/2`,
        `- ASTM F2656 (falls anwendbar)`,
        `- VDE/Elektro (falls motorische Anlagen)`,
        `- Unfallverhütungsvorschriften`,
        `- TAB/örtliche Vorgaben`,
        ``,
        `Verkehrsrechtliche Anordnung:`,
        `Gemäß § 45 StVO ist eine verkehrsrechtliche Anordnung durch das Ordnungsamt erforderlich.`,
        `Die Kosten hierfür sind in den Positionen enthalten.`,
        ``,
        `Schutz von Zielkonflikten:`,
        `Folgende Zielkonflikte sind zu berücksichtigen:`,
        `- Rettungswege müssen jederzeit freigehalten werden`,
        `- Barrierefreiheit gemäß DIN 18040`,
        `- Winterdienst und Entsorgung`,
        `- Zugangsfenster für Müllfahrzeuge definieren`,
        ``,
        `Koordinierungsleistungen:`,
        `Koordinierung mit Versorgern, Feuerwehr, Rettungsdienst und Polizei ist erforderlich.`,
        ``,
        `Dokumentation & Abnahme:`,
        `Es sind vorzulegen:`,
        `- Prüf-/Funktionsprotokolle`,
        `- Bestands-/Revisionsunterlagen`,
        `- Betriebs-/Wartungsanleitung`,
        `- Fotodokumentation`,
        `- Einweisungspauschale ist in Positionen enthalten`
    ];
    
    vorbemerkungText.forEach(line => {
        checkPageBreak(6);
        if (line.trim()) {
            const indent = line.startsWith('-') ? 5 : 0;
            const maxWidth = contentWidth - indent;
            // Sanitize text without adding break points (false parameter)
            const sanitizedLine = sanitizeDe(line, false);
            const wrappedLines = pdf.splitTextToSize(sanitizedLine, maxWidth);
            wrappedLines.forEach((wrappedLine: string) => {
                if (currentY > pageHeight - 25) {
                    // Don't add footer here - will be added at the end for all pages
                    pdf.addPage();
                    currentY = pageMargin;
                    // Restore font settings after page break
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(10);
                }
                pdf.text(wrappedLine, pageMargin + indent, currentY);
                currentY += 6;
            });
        } else {
            currentY += 3;
        }
    });
    
    currentY += 10;
    
    // ==========================================
    // SECTION 3: TECHNISCHE MINDESTANFORDERUNGEN
    // ==========================================
    addSectionHeading('3. Technische Mindestanforderungen', 1);
    
    addSectionHeading('3.1 Allgemeine Anforderungen', 2);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    // Get aggregated performance requirements
    const allPerformanceReqs = Array.from(performanceRequirements.values());
    const avgSpeed = allPerformanceReqs.length > 0 
        ? Math.round(allPerformanceReqs.reduce((sum, req) => sum + req.anprallgeschwindigkeit, 0) / allPerformanceReqs.length)
        : 50;
    const avgPenetration = allPerformanceReqs.length > 0
        ? allPerformanceReqs.reduce((sum, req) => sum + req.penetration, 0) / allPerformanceReqs.length
        : 0.5;
    const avgVehicleClass = allPerformanceReqs.length > 0
        ? allPerformanceReqs[0].fahrzeugklasse
        : 'K12';
    
    const allgemeineAnforderungen = [
        `Schutzniveau:`,
        `Mindestens ${avgSpeed} km/h bei ${avgVehicleClass} mit zulässiger Eindringtiefe ≤ ${avgPenetration.toFixed(2)} m.`,
        ``,
        `Öffnungs-/Betriebsart:`,
        `${allPerformanceReqs[0]?.öffnungsart || 'manuell/motorisch'} inkl. Notentriegelung.`,
        `Verriegelung: Profilzylinder oder gleichschließend.`,
        `Witterungsbeständigkeit: Einsatz bei Temperaturen von -20°C bis +50°C.`,
        `Oberflächenbehandlung: Korrosionsschutz nach DIN EN ISO 12944.`,
        ``,
        `Untergrund:`,
        `Fundament/Fußplatten/Verankerungen gemäß Bodenklasse.`,
        `Verlegen von Leitungen/Induktionsschleifen falls erforderlich.`,
        ``,
        `Barrierefreiheit & Rettung:`,
        `Gehwegbreiten gemäß DIN 18040 einhalten.`,
        `Stolperkanten vermeiden.`,
        `Aufstellflächen für Rettungsfahrzeuge vorsehen.`,
        ``,
        `Gleichwertigkeit:`,
        `Angebote müssen Gleichwertigkeit zu den geforderten Leistungs-/Sicherheitsmerkmalen nachweisen.`,
        `Erforderliche Nachweise:`,
        `- Crash-Testberichte`,
        `- Zertifikate`,
        `- Prüfprotokolle`,
        `- Montagefreigaben`
    ];
    
    allgemeineAnforderungen.forEach(line => {
        checkPageBreak(6);
        if (line.trim()) {
            const indent = line.startsWith('-') ? 5 : 0;
            const maxWidth = contentWidth - indent;
            // Sanitize text without adding break points (false parameter)
            const sanitizedLine = sanitizeDe(line, false);
            const wrappedLines = pdf.splitTextToSize(sanitizedLine, maxWidth);
            wrappedLines.forEach((wrappedLine: string) => {
                if (currentY > pageHeight - 25) {
                    // Don't add footer here - will be added at the end for all pages
                    pdf.addPage();
                    currentY = pageMargin;
                    // Restore font settings after page break
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(10);
                }
                pdf.text(wrappedLine, pageMargin + indent, currentY);
                currentY += 6;
            });
        } else {
            currentY += 3;
        }
    });
    
    currentY += 10;
    
    // Section 3.2: Zufahrtsbezogene Anforderungen
    addSectionHeading('3.2 Zufahrtsbezogene Anforderungen', 2);
    
    zufahrten.forEach((zufahrt, idx) => {
        const perfReq = performanceRequirements.get(zufahrt.id);
        
        checkPageBreak(25, true); // Preserve font because we set it manually next
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(`Zufahrt ${zufahrt.id} – ${zufahrt.strasse_platz}`, pageMargin, currentY);
        currentY += 8;
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        
        const zufahrtData = [
            `Geometrie & Logistik:`,
            `  Freihaltebreite: ${zufahrt.freihaltebreite} m`,
            `  Radien: ${zufahrt.radien} m`,
            `  Längsgefälle: ${zufahrt.längsgefälle} %`,
            `  Medien/Leitungslage: ${zufahrt.medien_leitungslage}`,
            ``,
            `Schutzbedarf:`
        ];
        
        if (perfReq) {
            zufahrtData.push(
                `  Anprallenergie: ${perfReq.anprallenergie} kJ`,
                `  Restfahrzeuggeschwindigkeit: ≤ ${perfReq.restfahrzeuggeschwindigkeit} km/h`,
                `  Zulässige Eindringtiefe: ≤ ${perfReq.penetration} m`
            );
        }
        
        zufahrtData.push(
            ``,
            `Betriebslogik:`,
            `  Öffnungsart: ${perfReq?.öffnungsart || 'manuell'}`,
            `  Notöffnung: ${perfReq?.notentriegelung ? 'erforderlich' : 'nicht erforderlich'}`,
            `  Schließsystem: ${perfReq?.schliesssystem || 'Profilzylinder'}`,
            `  Winterdienst: ${zufahrt.räumfahrzeugbedarf ? 'Räumfahrzeugzugang erforderlich' : 'kein spezieller Zugang'}`,
            ``,
            `Einbaubedingungen:`,
            `  Untergrund: ${zufahrt.untergrund}`,
            `  Bodengruppe: nach Baugrundgutachten`,
            `  Medienleitungen sichern: ${zufahrt.medien_leitungslage !== 'keine' ? 'ja' : 'nein'}`
        );
        
        zufahrtData.forEach(line => {
            checkPageBreak(6);
            if (line.trim()) {
                const indent = line.startsWith('  ') ? 10 : 0;
                const maxWidth = contentWidth - indent;
                // Sanitize text without adding break points (false parameter)
                const sanitizedLine = sanitizeDe(line, false);
                const wrappedLines = pdf.splitTextToSize(sanitizedLine, maxWidth);
                wrappedLines.forEach((wrappedLine: string) => {
                    if (currentY > pageHeight - 25) {
                        // Don't add footer here - will be added at the end for all pages
                        pdf.addPage();
                        currentY = pageMargin;
                        // Restore font settings after page break
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(10);
                    }
                    pdf.text(wrappedLine, pageMargin + indent, currentY);
                    currentY += 6;
                });
            } else {
                currentY += 3;
            }
        });
        
        currentY += 5;
    });
    
    currentY += 10;
    
    // ==========================================
    // SECTION 4: LEISTUNGSVERZEICHNIS
    // ==========================================
    addSectionHeading('4. Leistungsverzeichnis', 1);
    
    // Generate positions per Zufahrt - grouped by title blocks
    const allPositions: TenderPosition[] = [];
    let positionCounter = 1;
    
    // Title block 01: Lieferung/Barriereelemente
    addSectionHeading('01 Lieferung/Barriereelemente', 2);
    currentY -= 3; // Reduce space after heading
    
    zufahrten.forEach((zufahrt) => {
        const perfReq = performanceRequirements.get(zufahrt.id);
        
        // Position 01: Lieferung/Barriereelemente (HERSTELLERNEUTRAL - keine Markennamen!)
        const barriereType = perfReq?.öffnungsart === 'motorisch' ? 'motorisch betrieben' : 
                           perfReq?.öffnungsart === 'manuell' ? 'manuell betrieben' : 
                           'fest/abnehmbar';
        allPositions.push({
            position: `${String(positionCounter).padStart(2, '0')}`,
            beschreibung: `Lieferung von HVM-Barriereelement(en) für Zufahrt ${zufahrt.strasse_platz} (Typ: ${barriereType}), Mindest-Schutzniveau ${perfReq?.anprallgeschwindigkeit || avgSpeed} km/h bei ${perfReq?.fahrzeugklasse || avgVehicleClass}, zul. Eindringtiefe <= ${perfReq?.penetration || avgPenetration.toFixed(2)} m, Durchfahrtsbreite ${perfReq?.durchfahrtsbreite || 4.0} m. inkl. Zubehör, Befestigungsmittel, Nebenleistungen.`,
            menge: 1,
            einheit: 'Stk',
            ep: 0,
            gp: 0
        });
        positionCounter++;
    });
    
    // Title block 02: Montage/Gründungen/Verankerungen
    checkPageBreak(10);
    addSectionHeading('02 Montage/Gründungen/Verankerungen', 2);
    currentY -= 3;
    
    zufahrten.forEach((zufahrt) => {
        allPositions.push({
            position: `${String(positionCounter).padStart(2, '0')}`,
            beschreibung: `Herstellen Fundament/Unterkonstruktion für Zufahrt ${zufahrt.strasse_platz} gem. Bodenklasse, inkl. Aushub, Entsorgung, Verdichtung, Bewehrung, Verguss, Nachbehandlung.`,
            menge: 1,
            einheit: 'Stk',
            ep: 0,
            gp: 0
        });
        positionCounter++;
    });
    
    // Title block 03: Rück-/Umbaumaßnahmen
    checkPageBreak(10);
    addSectionHeading('03 Rück-/Umbaumaßnahmen am Umfeld', 2);
    currentY -= 3;
    
    if (zufahrten.length > 0) {
        allPositions.push({
            position: `${String(positionCounter++).padStart(2, '0')}`,
            beschreibung: `Rück-/Umbaumaßnahmen am Umfeld der Zufahrten, inkl. Herstellen Oberfläche, Entsorgung.`,
            menge: 1,
            einheit: 'Pausch',
            ep: 0,
            gp: 0
        });
    }
    
    // Title block 04: Verkehrssicherung
    checkPageBreak(10);
    addSectionHeading('04 Verkehrssicherung/Baustellensicherung', 2);
    currentY -= 3;
    
    allPositions.push({
        position: `${String(positionCounter++).padStart(2, '0')}`,
        beschreibung: `Verkehrssicherung nach RSA: Absperrungen, Beschilderung, Fußgängerführung, Nachtkennzeichnung; inklusive Vorhaltung während der Bauzeit.`,
        menge: 1,
        einheit: 'Pausch',
        ep: 0,
        gp: 0
    });
    
    // Title block 05: Elektro/Steuerung
    const hasMotorisch = Array.from(performanceRequirements.values()).some(req => req.öffnungsart === 'motorisch');
    if (hasMotorisch) {
        checkPageBreak(10);
        addSectionHeading('05 Elektro/Steuerung', 2);
        currentY -= 3;
        allPositions.push({
            position: `${String(positionCounter++).padStart(2, '0')}`,
            beschreibung: `Elektro/Steuerung: Verkabelung, Schaltschrank, Antrieb, Fernbedienung, Notöffnung für motorische Anlagen.`,
            menge: 1,
            einheit: 'Kompl.',
            ep: 0,
            gp: 0
        });
    }
    
    // Title block 06: Dokumentation/Einweisung
    checkPageBreak(10);
    addSectionHeading('06 Dokumentation/Einweisung', 2);
    currentY -= 3;
    
    allPositions.push({
        position: `${String(positionCounter++).padStart(2, '0')}`,
        beschreibung: `Dokumentation: Bestands-/Revisionsunterlagen, Betriebs-/Wartungsanleitung, Prüf-/Funktionsprotokoll, Fotodokumentation. Einweisungspauschale.`,
        menge: 1,
        einheit: 'Pausch',
        ep: 0,
        gp: 0
    });
    
    // Title block 07: Optionen/Wartung
    checkPageBreak(10);
    addSectionHeading('07 Optionen/Alternativpositionen', 2);
    currentY -= 3;
    
    allPositions.push({
        position: `${String(positionCounter++).padStart(2, '0')}`,
        beschreibung: `Jährliche Wartung (optional, abrechenbar nach Aufwand/Einheit)`,
        menge: 1,
        einheit: 'Jahr',
        ep: 0,
        gp: 0
    });
    
    // Reset heading style before table
    pdf.setFont('helvetica', 'normal');
    
    // Convert positions to table format
    const tableHeaders = ['Pos.', 'Beschreibung', 'Menge', 'Einh', 'EP', 'GP'];
    // Column widths: POS 12 | BESCHR 90 | MENGE 14 | EINH 12 | EP 20 | GP 22 = 170mm total
    const colWidths = LV_COL_WIDTHS; // [12, 90, 14, 12, 20, 22] mm
    const tableRows = allPositions.map(pos => [
        pos.position,
        sanitizeDe(pos.beschreibung, false), // Don't add break points to prevent character spacing issues
        pos.menge.toString(),
        pos.einheit,
        pos.ep?.toFixed(2).replace('.', ',') || '0,00',
        pos.gp?.toFixed(2).replace('.', ',') || '0,00'
    ]);
    
    addTable(tableHeaders, tableRows, colWidths);
    
    // Zusammenstellung (Summary)
    checkPageBreak(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Zusammenstellung', pageMargin + 130, currentY, { align: 'right' });
    currentY += 7;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const summeNetto = allPositions.reduce((sum, pos) => sum + (pos.gp || 0), 0);
    const mwst = summeNetto * 0.19; // 19% MwSt
    const summeBrutto = summeNetto + mwst;
    
    const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);
    pdf.text('Summe (netto):', pageMargin + totalTableWidth - 45, currentY, { align: 'right' });
    pdf.text(summeNetto.toFixed(2).replace('.', ',') + ' EUR', pageMargin + totalTableWidth, currentY, { align: 'right' });
    currentY += 6;
    
    pdf.text('zzgl. MwSt. 19%:', pageMargin + totalTableWidth - 45, currentY, { align: 'right' });
    pdf.text(mwst.toFixed(2).replace('.', ',') + ' EUR', pageMargin + totalTableWidth, currentY, { align: 'right' });
    currentY += 6;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Gesamtsumme:', pageMargin + totalTableWidth - 45, currentY, { align: 'right' });
    pdf.text(summeBrutto.toFixed(2).replace('.', ',') + ' EUR', pageMargin + totalTableWidth, currentY, { align: 'right' });
    currentY += 15;
    
    // ==========================================
    // SECTION 5: VERTRAGS-/BESONDERE BEDINGUNGEN
    // ==========================================
    addSectionHeading('5. Vertrags-/Besondere Bedingungen', 1);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    const vertragText = [
        `Leistungsumfang:`,
        `Der Leistungsumfang umfasst die Lieferung, Montage, Inbetriebnahme, Dokumentation und Einweisung.`,
        `Service/Wartung nach Vereinbarung (siehe Position ${positionCounter - 1}).`,
        ``,
        `Laufzeit/Termine:`,
        `Aufbau/Abbaufenster: ${event.aufbau_ab} bis ${event.abbau_bis}`,
        `Reaktionszeiten bei Störung: 4 Stunden (werktags), 8 Stunden (außerhalb Werktage)`,
        ``,
        `Abrechnung/Nachweise:`,
        `- Abrechnung nach Aufmaß`,
        `- Lieferscheine`,
        `- Prüfberichte`,
        `- Entsorgungsnachweise`,
        ``,
        `Gerichtsstand/Erfüllungsort:`,
        `Gerichtsstand und Erfüllungsort ist ${projectMeta.KOMMUNE}.`,
        `Änderungen bedürfen der Schriftform.`,
        ``,
        `Datenschutz/IT-Sicherheit:`,
        `Bei Steuerungselektrik/Netzwerk sind die Anforderungen der DSGVO einzuhalten.`
    ];
    
    vertragText.forEach(line => {
        checkPageBreak(6);
        if (line.trim()) {
            const indent = line.startsWith('-') ? 5 : 0;
            const maxWidth = contentWidth - indent;
            // Sanitize text without adding break points (false parameter)
            const sanitizedLine = sanitizeDe(line, false);
            const wrappedLines = pdf.splitTextToSize(sanitizedLine, maxWidth);
            wrappedLines.forEach((wrappedLine: string) => {
                if (currentY > pageHeight - 25) {
                    // Don't add footer here - will be added at the end for all pages
                    pdf.addPage();
                    currentY = pageMargin;
                    // Restore font settings after page break
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(10);
                }
                pdf.text(wrappedLine, pageMargin + indent, currentY);
                currentY += 6;
            });
        } else {
            currentY += 3;
        }
    });
    
    currentY += 10;
    
    // ==========================================
    // SECTION 6: ANLAGEN
    // ==========================================
    addSectionHeading('6. Anlagen', 1);
    
    pdf.setFontSize(10);
    pdf.text('Folgende Anlagen sind diesem Leistungsverzeichnis beigefügt:', pageMargin, currentY);
    currentY += 8;
    
    pdf.text('- Übersichtsplan Sicherheitsbereich mit Zufahrten', pageMargin + 5, currentY);
    currentY += 6;
    pdf.text('- Detailpläne je Zufahrt', pageMargin + 5, currentY);
    currentY += 6;
    pdf.text('- Risiko-/Anprallberechnung je Zufahrt (Tabellen)', pageMargin + 5, currentY);
    currentY += 6;
    pdf.text('- Bieterangabenblatt (leer)', pageMargin + 5, currentY);
    currentY += 6;
    pdf.text('- Preisblatt/Losblatt', pageMargin + 5, currentY);
    
    // Add footer to all pages
    const finalPageCount = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= finalPageCount; p++) {
        pdf.setPage(p);
        addWatermarkToCurrentPage();
        addFooterAndPageNumber(p, finalPageCount);
    }
    
    return pdf;
}
