import { download } from './spreadsheet'

export type DocumentExportOptions = {
  pageSize?: 'A4' | 'Letter' | 'Legal'
  margins?: 'standard' | 'narrow' | 'wide'
  fontFamily?: string
  fontSize?: number
  includeTitle?: boolean
}

const marginTwips = (margins: DocumentExportOptions['margins']) => {
  if (margins === 'narrow') return { top: 720, right: 720, bottom: 720, left: 720 }
  if (margins === 'wide') return { top: 1440, right: 2160, bottom: 1440, left: 2160 }
  return { top: 1440, right: 1440, bottom: 1440, left: 1440 }
}

const pdfFont = (fontFamily?: string) => ['Times New Roman', 'Georgia'].includes(fontFamily || '') ? 'times' : 'helvetica'

export async function exportDocx(title: string, lines: string[], options?: DocumentExportOptions) {
  download(await createDocxBlob(title, lines, options), `${safe(title)}.docx`)
}

export async function createDocxBlob(title: string, lines: string[], options: DocumentExportOptions = {}): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx')
  const page = options.pageSize === 'Legal'
    ? { width: 12240, height: 20160 }
    : options.pageSize === 'Letter'
      ? { width: 12240, height: 15840 }
      : { width: 11906, height: 16838 }
  const bodyFont = options.fontFamily || 'Georgia'
  const bodySize = Math.round((options.fontSize || 12) * 2)
  const children = [
    ...(options.includeTitle === false ? [] : [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 30 })] })]),
    ...lines.flatMap(line => line === '\f'
      ? [new Paragraph({ children: [new PageBreak()] })]
      : [new Paragraph({ children: [new TextRun({ text: line, font: bodyFont, size: bodySize })] })])
  ]
  const doc = new Document({ sections: [{ properties: { page: { size: page, margin: marginTwips(options.margins) } }, children }] })
  return Packer.toBlob(doc)
}
export async function exportPdf(title: string, lines: string[], options?: DocumentExportOptions) {
  download(await createPdfBlob(title, lines, options), `${safe(title)}.pdf`)
}

export async function createPdfBlob(title: string, lines: string[], options: DocumentExportOptions = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ format: options.pageSize === 'Legal' ? 'legal' : options.pageSize === 'Letter' ? 'letter' : 'a4', unit: 'mm' })
  const margin = options.margins === 'narrow' ? 12.7 : options.margins === 'wide' ? 38.1 : 25.4
  const pageHeight = pdf.internal.pageSize.getHeight()
  const width = pdf.internal.pageSize.getWidth() - margin * 2
  const fontSize = options.fontSize || 12
  const lineHeight = fontSize * .47
  let y = margin
  if (options.includeTitle !== false) { pdf.setFont(pdfFont(options.fontFamily), 'bold'); pdf.setFontSize(18); pdf.text(title, margin, y); y += 12 }
  pdf.setFont(pdfFont(options.fontFamily), 'normal'); pdf.setFontSize(fontSize)
  lines.forEach(line => { if (line === '\f') { pdf.addPage(); y = margin; return }; const wrapped = pdf.splitTextToSize(line || ' ', width); if (y + wrapped.length * lineHeight > pageHeight - margin) { pdf.addPage(); y = margin }; pdf.text(wrapped, margin, y); y += wrapped.length * lineHeight + (line ? lineHeight * .35 : lineHeight * .55) })
  return pdf.output('blob')
}

export async function exportBulkDocumentsZip(
  documents: { title: string; lines: string[]; fileName: string }[],
  format: 'pdf' | 'docx',
  archiveName: string,
  onProgress?: (current: number, total: number) => void
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (let index = 0; index < documents.length; index++) {
    const document = documents[index]
    const blob = format === 'pdf'
      ? await createPdfBlob(document.title, document.lines)
      : await createDocxBlob(document.title, document.lines)
    zip.file(`${safe(document.fileName || `document_${index + 1}`)}.${format}`, blob)
    onProgress?.(index + 1, documents.length)
    if (index % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  download(await zip.generateAsync({ type: 'blob' }), `${safe(archiveName)}.zip`)
}
export const safe = (text: string) => text.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'office_document'
