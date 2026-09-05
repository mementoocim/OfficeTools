import { Document, Packer, Paragraph, TextRun } from 'docx'
import { jsPDF } from 'jspdf'
import { download } from './spreadsheet'

export async function exportDocx(title: string, lines: string[]) {
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 30 })] }), ...lines.flatMap(line => [new Paragraph(line)])] }] })
  download(await Packer.toBlob(doc), `${safe(title)}.docx`)
}
export function exportPdf(title: string, lines: string[]) {
  const pdf = new jsPDF({ format: 'a4', unit: 'mm' }); const width = 170; let y = 24
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.text(title, 20, y); y += 12
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11)
  lines.forEach(line => { const wrapped = pdf.splitTextToSize(line || ' ', width); if (y + wrapped.length * 6 > 280) { pdf.addPage(); y = 24 }; pdf.text(wrapped, 20, y); y += wrapped.length * 6 + 4 })
  pdf.save(`${safe(title)}.pdf`)
}
export const safe = (text: string) => text.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'office_document'
