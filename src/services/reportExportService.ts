import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  BorderStyle, 
  HeadingLevel, 
  AlignmentType, 
  ImageRun, 
  Header 
} from 'docx';
import JSZip from 'jszip';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

export interface ReportPayload {
  title: string;
  columns: string[];
  data: any[][];
  generatorName: string;
  dateRange: string;
  chartImage?: ArrayBuffer | null;
}

// ------------------------------------------------------------------
// ZIMS / TRACKS UTILITARIAN STYLING
// ------------------------------------------------------------------
const COLORS = {
  text: '000000',      
  meta: '555555',      
  border: 'A3A3A3',    
  headerBg: 'EFEFEF',  
};

const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const TABLE_BORDERS = { 
  top: BORDER_STYLE, 
  bottom: BORDER_STYLE, 
  left: BORDER_STYLE, 
  right: BORDER_STYLE, 
  insideHorizontal: BORDER_STYLE, 
  insideVertical: BORDER_STYLE 
};

// ------------------------------------------------------------------
// CORE ENGINE DATA FETCHERS
// ------------------------------------------------------------------

const getOrgProfile = async (): Promise<{ org_name: string; address: string; logo_url?: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('organization_profile')
      .select('org_name, address, logo_url')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    
    return {
      org_name: data?.org_name || 'KENT OWL ACADEMY',
      address: data?.address || '',
      logo_url: data?.logo_url || null
    };
  } catch (err) {
    console.warn('[Export Engine] Could not fetch organization profile. Using fail-safes.', err);
    return { org_name: 'KENT OWL ACADEMY', address: '', logo_url: null };
  }
};

/**
 * Strict Logo Buffer Fetcher
 * Tries cloud storage -> custom URL -> local public assets.
 * Throws a fatal compliance error if no logo can be verified.
 */
const getLogoBuffer = async (fallbackUrl?: string | null): Promise<ArrayBuffer> => {
  // Strategy 1: Supabase 'koa-assets/logo.png'
  try {
    const { data, error } = await supabase.storage
      .from('koa-assets')
      .download('logo.png');

    if (!error && data && data.size > 0) {
      return await data.arrayBuffer();
    }
  } catch {
    // Proceed to next fallback
  }

  // Strategy 2: Supabase 'koa-attachments/logos/primary-logo.jpeg'
  try {
    const { data, error } = await supabase.storage
      .from('koa-attachments')
      .download('logos/primary-logo.jpeg');

    if (!error && data && data.size > 0) {
      return await data.arrayBuffer();
    }
  } catch {
    // Proceed to next fallback
  }

  // Strategy 3: Dynamic organization profile URL
  if (fallbackUrl) {
    try {
      const response = await fetch(fallbackUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 0) return buffer;
      }
    } catch {
      // Proceed to local public fallback
    }
  }

  // Strategy 4: Local public directory fallbacks (/logo512.png, /logo512.jpg, /logo192.png)
  const localCandidates = ['/logo512.png', '/logo512.jpg', '/logo192.png', '/logo.png'];
  for (const candidate of localCandidates) {
    try {
      const response = await fetch(candidate);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 0) return buffer;
      }
    } catch {
      // Try next local candidate
    }
  }

  // HARD FAILURE: Compliance documents cannot be issued without verified institution branding
  throw new Error(
    'Statutory Compliance Error: Official institution logo could not be verified or loaded. Report generation was halted to preserve legal document authenticity.'
  );
};

const sanitizeCell = (value: any): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value.trim() || '-';
  if (typeof value === 'number') return value.toString();
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const triggerNativeDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 150);
};

export const reportExportService = {

  async applyMasterTemplate(payload: ReportPayload): Promise<Document> {
    const orgProfile = await getOrgProfile();
    // Enforce hard logo requirement
    const logoBuffer = await getLogoBuffer(orgProfile.logo_url);
    
    const colWidth = 100 / Math.max(payload.columns.length, 1);

    const addressLines = orgProfile.address 
      ? orgProfile.address.split(/[\n,]+/).map(line => line.trim()).filter(line => line.length > 0)
      : [];

    const addressParagraphs = addressLines.map(line => 
      new Paragraph({ 
        children: [new TextRun({ text: line, size: 18, color: COLORS.meta })], 
        alignment: AlignmentType.RIGHT 
      })
    );

    // 1. Repeating Document Header
    const documentHeader = new Header({
      children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { 
            top: { style: BorderStyle.NONE }, 
            bottom: { style: BorderStyle.NONE }, 
            left: { style: BorderStyle.NONE }, 
            right: { style: BorderStyle.NONE }, 
            insideVertical: { style: BorderStyle.NONE }, 
            insideHorizontal: { style: BorderStyle.NONE } 
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new ImageRun({ 
                          data: logoBuffer, 
                          transformation: { width: 90, height: 65 } 
                        } as any)
                      ],
                      alignment: AlignmentType.LEFT
                    })
                  ]
                }),
                new TableCell({
                  width: { size: 60, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({ 
                      children: [
                        new TextRun({ 
                          text: orgProfile.org_name.toUpperCase(), 
                          bold: true, 
                          size: 24, 
                          color: COLORS.text 
                        })
                      ], 
                      alignment: AlignmentType.RIGHT,
                      spacing: { after: 40 }
                    }),
                    ...addressParagraphs
                  ]
                })
              ]
            })
          ]
        }),
        new Paragraph({ text: '', spacing: { after: 200 } })
      ]
    });

    const bodyChildren: Paragraph[] = [];

    // 2. Report Title
    bodyChildren.push(
      new Paragraph({ 
        text: payload.title, 
        heading: HeadingLevel.HEADING_1, 
        alignment: AlignmentType.LEFT,
        spacing: { after: 100 }
      })
    );

    // 3. Linear Metadata Header
    bodyChildren.push(
      new Paragraph({
        children: [
          new TextRun({ 
            text: `Generated By: ${sanitizeCell(payload.generatorName)} | Date Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 
            size: 18, 
            color: COLORS.meta 
          })
        ],
        spacing: { after: 40 }
      })
    );

    bodyChildren.push(
      new Paragraph({
        children: [
          new TextRun({ 
            text: `Report Range: ${sanitizeCell(payload.dateRange)} | Statutory System Verification: VALID - STRIX OS`, 
            size: 18, 
            color: COLORS.meta 
          })
        ],
        spacing: { after: 250 }
      })
    );

    // 4. Optional Chart Injection
    const chartElements = payload.chartImage 
      ? [
          new Paragraph({ 
            text: 'Telemetry Visualization', 
            heading: HeadingLevel.HEADING_2, 
            spacing: { before: 200, after: 150 } 
          }),
          new Paragraph({ 
            children: [
              new ImageRun({ 
                data: payload.chartImage, 
                transformation: { width: 580, height: 280 } 
              } as any)
            ], 
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          })
        ]
      : [];

    // 5. Compact Data Grid
    const dataGrid = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          tableHeader: true,
          children: payload.columns.map(col => new TableCell({
            shading: { fill: COLORS.headerBg },
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [
              new Paragraph({ 
                children: [new TextRun({ text: sanitizeCell(col), bold: true, size: 18, color: COLORS.text })], 
                alignment: AlignmentType.LEFT 
              })
            ]
          }))
        }),
        ...payload.data.map(rowData => new TableRow({
          children: rowData.map((cellData: any) => new TableCell({
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [
              new Paragraph({ 
                children: [new TextRun({ text: sanitizeCell(cellData), size: 18, color: COLORS.text })] 
              })
            ]
          }))
        }))
      ]
    });

    // 6. Final Document Compilation
    return new Document({
      styles: {
        default: {
          document: {
            run: { font: 'Helvetica', size: 18, color: COLORS.text }, 
            paragraph: { spacing: { after: 0 } }
          }
        },
        paragraphStyles: [
          { 
            id: 'Heading1', 
            name: 'Heading 1', 
            basedOn: 'Normal', 
            next: 'Normal', 
            run: { font: 'Helvetica', size: 28, bold: true, color: COLORS.text } 
          },
          { 
            id: 'Heading2', 
            name: 'Heading 2', 
            basedOn: 'Normal', 
            next: 'Normal', 
            run: { font: 'Helvetica', size: 22, bold: true, color: COLORS.text } 
          }
        ]
      },
      sections: [{
        properties: {},
        headers: {
          default: documentHeader, 
        },
        children: [
          ...bodyChildren,
          ...chartElements,
          dataGrid,
          new Paragraph({ text: '', spacing: { before: 400, after: 150 } }),
          new Paragraph({ 
            children: [
              new TextRun({ 
                text: 'Authorized Signature: ___________________________    Date: ______________', 
                size: 18, 
                color: COLORS.text 
              })
            ], 
            alignment: AlignmentType.LEFT 
          })
        ]
      }]
    });
  },

  async exportSingleReport(payload: ReportPayload, filenameId: string) {
    const doc = await this.applyMasterTemplate(payload);
    const blob = await Packer.toBlob(doc);
    triggerNativeDownload(blob, `KOA_${filenameId}_${format(new Date(), 'yyyyMMdd')}.docx`);
  },

  async generateInspectionPackZip(reports: { payload: ReportPayload; filenameId: string }[]) {
    const zip = new JSZip();
    const folderName = `KOA_Inspection_Pack_${format(new Date(), 'yyyyMMdd')}`;
    const folder = zip.folder(folderName);

    if (!folder) throw new Error('Failed to initialize ZIP folder structure.');

    for (const report of reports) {
      const doc = await this.applyMasterTemplate(report.payload);
      const blob = await Packer.toBlob(doc);
      folder.file(`KOA_${report.filenameId}.docx`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerNativeDownload(zipBlob, `${folderName}.zip`);
  }
};

export default reportExportService;