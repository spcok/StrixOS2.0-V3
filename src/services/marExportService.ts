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
  AlignmentType, 
  Header, 
  Footer, 
  PageOrientation, 
  VerticalAlign, 
  ImageRun 
} from 'docx';
import { supabase } from '../lib/supabase';
import type { Animal } from '../types';
import type { PrescriptionItem } from '../components/medical/PrescriptionList';

// ------------------------------------------------------------------
// ENTERPRISE STYLING & CONSTANTS
// ------------------------------------------------------------------
const FONT = 'Arial';
const COLORS = { 
  text: '0F172A', 
  meta: '475569', 
  border: 'CBD5E1', 
  headerBg: 'F1F5F9', 
  highlight: '2563EB',
  danger: 'DC2626',
};

const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 2, color: COLORS.border };
const TABLE_BORDERS = { 
  top: BORDER_STYLE, 
  bottom: BORDER_STYLE, 
  left: BORDER_STYLE, 
  right: BORDER_STYLE, 
  insideHorizontal: BORDER_STYLE, 
  insideVertical: BORDER_STYLE 
};

// ------------------------------------------------------------------
// DATE HELPERS (TIMEZONE-NEUTRAL)
// ------------------------------------------------------------------
const parseDateOnly = (dateStr: string | null | undefined): Date => {
  if (!dateStr) return new Date();
  const cleanStr = dateStr.split('T')[0]!;
  const [y, m, d] = cleanStr.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0); // Noon anchor prevents DST boundary shift
};

const formatDayMonth = (d: Date): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

const formatFullDate = (d: Date): string => {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ------------------------------------------------------------------
// CORE ENGINE FUNCTIONS
// ------------------------------------------------------------------
const getOrgProfile = async () => {
  try {
    const { data } = await supabase
      .from('organization_profile')
      .select('org_name, address')
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();
    return data || { org_name: 'AVIAN MEDICAL DISPENSARY', address: '' };
  } catch {
    return { org_name: 'AVIAN MEDICAL DISPENSARY', address: '' };
  }
};

const getLogoBuffer = async (): Promise<ArrayBuffer | null> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const { data, error } = await supabase.storage.from('koa-attachments').download('logos/primary-logo.jpeg');
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch {
    return null;
  }
};

const triggerNativeDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 300);
};

const getDoseRows = (freq: string | undefined): string[] => {
  switch (freq?.toUpperCase()) {
    case 'BID':
      return ['AM Dose', 'PM Dose'];
    case 'TID':
      return ['Dose 1 (Morning)', 'Dose 2 (Midday)', 'Dose 3 (Evening)'];
    case 'QID':
      return ['Dose 1', 'Dose 2', 'Dose 3', 'Dose 4'];
    case 'PRN':
      return ['PRN Dose 1', 'PRN Dose 2', 'PRN Dose 3'];
    case 'EOD':
      return ['Alternate Day Dose'];
    case 'WEEKLY':
      return ['Weekly Dose'];
    case 'MONTHLY':
      return ['Monthly Dose'];
    default:
      return ['Daily Dose'];
  }
};

export const marExportService = {
  async exportUnifiedMAR(
    animal: Partial<Animal> | null,
    prescriptions: PrescriptionItem[],
    generatorName: string,
    generatorId: string
  ): Promise<void> {
    const [logoBuffer, orgProfile] = await Promise.all([getLogoBuffer(), getOrgProfile()]);

    // ------------------------------------------------------------------
    // DOCUMENT HEADER
    // ------------------------------------------------------------------
    let headerLogoRun: ImageRun | null = null;
    if (logoBuffer) {
      try {
        headerLogoRun = new ImageRun({
          data: logoBuffer,
          transformation: { width: 90, height: 65 },
        } as any);
      } catch {
        headerLogoRun = null;
      }
    }

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
            insideHorizontal: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  children: headerLogoRun ? [new Paragraph({ children: [headerLogoRun] })] : [new Paragraph('')],
                }),
                new TableCell({
                  width: { size: 65, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: (orgProfile.org_name || 'CLINICAL DISPENSARY').toUpperCase(),
                          bold: true,
                          size: 24,
                          color: COLORS.text,
                          font: FONT,
                        }),
                      ],
                      alignment: AlignmentType.RIGHT,
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: orgProfile.address || 'Statutory Zoo Licensing Act e-MAR Formulation Ledger',
                          size: 16,
                          color: COLORS.meta,
                          font: FONT,
                        }),
                      ],
                      alignment: AlignmentType.RIGHT,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ text: '', spacing: { before: 200, after: 100 } }),
      ],
    });

    // ------------------------------------------------------------------
    // DOCUMENT FOOTER
    // ------------------------------------------------------------------
    const documentFooter = new Footer({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: 'Clinical Exception Codes: ', bold: true, size: 16, font: FONT }),
            new TextRun({
              text: 'R = Refused | V = Vomited | S = Spat Out/Dropped | N/A = Unavailable | O = Omitted | H = Hospitalized Offsite',
              size: 15,
              color: COLORS.meta,
              font: FONT,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Statutory e-MAR generated by: ${generatorName} [${generatorId}] on ${formatFullDate(new Date())}`,
              size: 14,
              color: COLORS.meta,
              font: FONT,
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ],
    });

    // ------------------------------------------------------------------
    // DYNAMIC 7-DAY BATCH TABLE GENERATOR
    // ------------------------------------------------------------------
    const createWeekTable = (weekDates: Date[], doses: string[]): Table => {
      const totalDoseRows = doses.length * 2; // Time row + Initials sign-off row
      const daysCount = weekDates.length;

      const taskWidth = 16;
      const notesWidth = 21;
      const dayWidth = (100 - taskWidth - notesWidth) / daysCount;

      const rows: TableRow[] = [];

      // Table Header
      const headerCells = [
        new TableCell({
          width: { size: taskWidth, type: WidthType.PERCENTAGE },
          shading: { fill: COLORS.headerBg },
          margins: { top: 60, bottom: 60 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Dose Schedule', bold: true, size: 15, font: FONT })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
        ...weekDates.map(
          (d) =>
            new TableCell({
              width: { size: dayWidth, type: WidthType.PERCENTAGE },
              shading: { fill: COLORS.headerBg },
              margins: { top: 60, bottom: 60 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: formatDayMonth(d), bold: true, size: 15, font: FONT })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            })
        ),
        new TableCell({
          width: { size: notesWidth, type: WidthType.PERCENTAGE },
          shading: { fill: COLORS.headerBg },
          margins: { top: 60, bottom: 60 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Exceptions / Notes', bold: true, size: 15, font: FONT })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      ];

      rows.push(new TableRow({ tableHeader: true, children: headerCells }));

      // Dose Rows
      doses.forEach((doseLabel, doseIndex) => {
        // Row A: Time
        const timeCells: TableCell[] = [
          new TableCell({
            margins: { top: 70, bottom: 70 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${doseLabel}\n(Time)`, size: 13, font: FONT, color: COLORS.meta })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        ];

        weekDates.forEach(() => {
          timeCells.push(new TableCell({ children: [new Paragraph('')] }));
        });

        if (doseIndex === 0) {
          timeCells.push(
            new TableCell({
              rowSpan: totalDoseRows,
              margins: { top: 70, bottom: 70 },
              children: [new Paragraph('')],
            })
          );
        }
        rows.push(new TableRow({ children: timeCells }));

        // Row B: Initials
        const initialCells: TableCell[] = [
          new TableCell({
            margins: { top: 70, bottom: 70 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Staff Initials', size: 13, font: FONT, bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        ];

        weekDates.forEach(() => {
          initialCells.push(new TableCell({ children: [new Paragraph('')] }));
        });

        rows.push(new TableRow({ children: initialCells }));
      });

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS,
        rows,
      });
    };

    // ------------------------------------------------------------------
    // DOCUMENT BODY COMPOSITION
    // ------------------------------------------------------------------
    const documentBody: (Paragraph | Table)[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: 'MEDICATION ADMINISTRATION RECORD (MAR)',
            bold: true,
            size: 26,
            font: FONT,
          }),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Patient: ${animal?.name || 'Unknown Specimen'} (${animal?.species || 'Unclassified'}) | Ring/ID: ${
              animal?.ring_number || 'N/A'
            } | Location: ${animal?.location || 'Unassigned'}`,
            size: 18,
            color: COLORS.meta,
            font: FONT,
            bold: true,
          }),
        ],
        spacing: { after: 240 },
      }),
    ];

    if (prescriptions.length === 0) {
      documentBody.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No active clinical medication orders recorded for this patient.',
              color: COLORS.meta,
              font: FONT,
              italics: true,
            }),
          ],
        })
      );
    } else {
      prescriptions.forEach((rx) => {
        const rxStart = parseDateOnly(rx.start_date);
        let rxEnd = rx.end_date ? parseDateOnly(rx.end_date) : new Date(rxStart.getTime() + 27 * 86400000);

        if (rxEnd < rxStart) rxEnd = rxStart;

        // Hard cap at 28 days (4 weeks) per single printed MAR sheet to eliminate OOM browser crashes
        const dayDifference = Math.floor((rxEnd.getTime() - rxStart.getTime()) / 86400000) + 1;
        const boundedDays = Math.min(Math.max(dayDifference, 1), 28);

        const rxDates = Array.from({ length: boundedDays }, (_, i) => {
          const d = new Date(rxStart);
          d.setDate(d.getDate() + i);
          return d;
        });

        // 7-day chunking
        const weeklyChunks: Date[][] = [];
        for (let i = 0; i < rxDates.length; i += 7) {
          weeklyChunks.push(rxDates.slice(i, i + 7));
        }

        // Medication Sub-Header
        documentBody.push(
          new Paragraph({
            spacing: { before: 240, after: 60 },
            children: [
              new TextRun({ text: `${rx.drug_name} `, bold: true, size: 22, font: FONT }),
              new TextRun({ text: `[${rx.dosage}] `, color: COLORS.highlight, bold: true, size: 18, font: FONT }),
              new TextRun({
                text: `(${rx.order_type || 'PRESCRIPTION'})`,
                color: COLORS.meta,
                size: 15,
                font: FONT,
                bold: true,
              }),
            ],
          })
        );

        documentBody.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `Route: ${rx.route} | Frequency: ${rx.frequency} ${rx.is_prn ? '(PRN - On Indication)' : ''}`,
                size: 15,
                font: FONT,
              }),
              new TextRun({
                text: `  •  Course Window: ${formatFullDate(rxStart)} to ${
                  rx.end_date ? formatFullDate(rxEnd) : 'Ongoing / Indefinite'
                }`,
                size: 15,
                color: COLORS.meta,
                font: FONT,
              }),
            ],
          })
        );

        if (rx.special_instructions) {
          documentBody.push(
            new Paragraph({
              spacing: { after: 140 },
              children: [
                new TextRun({
                  text: `Special Instructions: ${rx.special_instructions}`,
                  italics: true,
                  size: 15,
                  color: COLORS.danger,
                  font: FONT,
                  bold: true,
                }),
              ],
            })
          );
        }

        // Render weekly batch tables
        weeklyChunks.forEach((chunkDates) => {
          documentBody.push(createWeekTable(chunkDates, getDoseRows(rx.frequency)));
          documentBody.push(new Paragraph({ spacing: { after: 140 }, text: '' }));
        });

        // Visual horizontal divider
        documentBody.push(
          new Paragraph({
            border: { bottom: { color: COLORS.border, space: 1, style: BorderStyle.SINGLE, size: 4 } },
            spacing: { after: 160 },
          })
        );
      });
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { orientation: PageOrientation.PORTRAIT },
              margin: { top: 720, bottom: 720, left: 720, right: 720 },
            },
          },
          headers: { default: documentHeader },
          footers: { default: documentFooter },
          children: documentBody,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const cleanAnimalName = (animal?.name || 'Specimen').replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerNativeDownload(blob, `MAR_${cleanAnimalName}_${new Date().toISOString().slice(0, 10)}.docx`);
  },
};

export default marExportService;