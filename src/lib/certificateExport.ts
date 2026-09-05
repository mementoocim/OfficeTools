import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import QRCode from 'qrcode'
import type { CertificateData } from '../types'
import { download } from './spreadsheet'
import { safe } from './export'

export type ProgressCallback = (info: { current: number; total: number; percent: number; message: string }) => void

export interface ParticipantResolved {
  name: string
  organization: string
  event: string
  date: string
  venue: string
  id: string
  customFields: Record<string, string>
}

export function resolveParticipant(
  cert: CertificateData,
  row: string[],
  headers: string[],
  index: number
): ParticipantResolved {
  const getVal = (pattern: RegExp) => {
    const idx = headers.findIndex(h => pattern.test(h))
    return idx >= 0 ? (row[idx] || '').trim() : ''
  }

  const name = getVal(/name/i) || row[0] || `Participant ${index + 1}`
  const organization = getVal(/organization|agency|company|office|school/i)
  const event = getVal(/event|training|seminar|course/i) || cert.event
  const date = getVal(/date/i) || cert.date
  const venue = getVal(/venue|location/i) || cert.venue

  const customFields: Record<string, string> = {}
  headers.forEach((h, i) => {
    customFields[h.toLowerCase().trim()] = (row[i] || '').trim()
  })

  // Deterministic certificate ID
  const certId = `${cert.qrPrefix || 'CERT'}-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`

  return { name, organization, event, date, venue, id: certId, customFields }
}

export function resolveDescription(template: string, p: ParticipantResolved, cert: CertificateData): string {
  let text = template
    .replace(/{{name}}/gi, p.name)
    .replace(/{{organization}}/gi, p.organization)
    .replace(/{{event}}/gi, p.event || cert.event)
    .replace(/{{date}}/gi, p.date || cert.date)
    .replace(/{{venue}}/gi, p.venue || cert.venue)
    .replace(/{{id}}/gi, p.id)

  // Also replace any other header matches like {{email}}, {{score}}
  Object.entries(p.customFields).forEach(([k, v]) => {
    text = text.replace(new RegExp(`{{${k}}}`, 'gi'), v)
  })

  return text
}

export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 140,
      color: { dark: '#1e293b', light: '#ffffff' }
    })
  } catch (err) {
    console.error('QR generation error:', err)
    return ''
  }
}

export function drawCertificateBorder(pdf: jsPDF, style: CertificateData['borderStyle']) {
  const w = 297
  const h = 210

  if (style === 'gold' || !style) {
    // Elegant Gold Double Border with Corner Ornaments
    pdf.setDrawColor(197, 160, 89)
    pdf.setLineWidth(1.4)
    pdf.rect(10, 10, w - 20, h - 20)

    pdf.setDrawColor(228, 205, 148)
    pdf.setLineWidth(0.6)
    pdf.rect(13, 13, w - 26, h - 26)

    // Corner decorative markers
    const corners = [
      [10, 10],
      [w - 10, 10],
      [10, h - 10],
      [w - 10, h - 10]
    ]
    pdf.setFillColor(197, 160, 89)
    corners.forEach(([cx, cy]) => {
      pdf.circle(cx, cy, 1.8, 'F')
    })
  } else if (style === 'modern') {
    // Sleek Emerald / Deep Teal Dual Border
    pdf.setDrawColor(36, 91, 75)
    pdf.setLineWidth(2.2)
    pdf.rect(10, 10, w - 20, h - 20)

    pdf.setDrawColor(160, 195, 180)
    pdf.setLineWidth(0.8)
    pdf.rect(14, 14, w - 28, h - 28)
  } else if (style === 'academic') {
    // Deep Navy & Gold Traditional Academic Border
    pdf.setDrawColor(24, 43, 73)
    pdf.setLineWidth(2.5)
    pdf.rect(10, 10, w - 20, h - 20)

    pdf.setDrawColor(199, 164, 92)
    pdf.setLineWidth(1)
    pdf.rect(13.5, 13.5, w - 27, h - 27)

    pdf.setDrawColor(24, 43, 73)
    pdf.setLineWidth(0.4)
    pdf.rect(15.5, 15.5, w - 31, h - 31)
  } else if (style === 'minimal') {
    // Clean Minimalist Line
    pdf.setDrawColor(150, 155, 160)
    pdf.setLineWidth(0.7)
    pdf.rect(12, 12, w - 24, h - 24)
  }
}

function hexToRgb(hex?: string): [number, number, number] {
  if (!hex) return [30, 32, 35]
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0
    ]
  }
  return [
    parseInt(clean.substring(0, 2), 16) || 0,
    parseInt(clean.substring(2, 4), 16) || 0,
    parseInt(clean.substring(4, 6), 16) || 0
  ]
}

export async function renderCertificatePage(
  pdf: jsPDF,
  cert: CertificateData,
  participant: ParticipantResolved
) {
  const w = 297
  const h = 210
  const centerX = w / 2

  // 1. Draw Custom Canva Background or Standard Border
  if (cert.backgroundImageUrl) {
    try {
      pdf.addImage(cert.backgroundImageUrl, 'JPEG', 0, 0, w, h)
    } catch {
      drawCertificateBorder(pdf, cert.borderStyle)
    }

    // If template already contains the title & description, only overlay Name, Signatures, and QR code!
    if (cert.hideDefaultText !== false) {
      const nameX = cert.nameX ?? centerX
      const nameY = cert.nameY ?? 94
      const nameSize = cert.nameSize ?? 28
      const [r, g, b] = hexToRgb(cert.nameColor)

      pdf.setFont('times', 'bolditalic')
      pdf.setFontSize(nameSize)
      pdf.setTextColor(r, g, b)
      pdf.text(participant.name, nameX, nameY, { align: 'center' })

      // Optional Signatories (if custom signatory or signature image is specified)
      if (cert.signatureUrl || (cert.signatory && cert.signatory.trim() && cert.signatory !== 'Juan M. Dela Cruz')) {
        renderSignatories(pdf, cert, centerX)
      }

      // QR Code
      await renderCertificateQr(pdf, cert, participant)
      return
    }
  } else {
    drawCertificateBorder(pdf, cert.borderStyle)
  }

  let y = 24

  // 2. Logo (if provided)
  if (cert.logoUrl) {
    try {
      pdf.addImage(cert.logoUrl, 'PNG', centerX - 12, y, 24, 24)
      y += 28
    } catch {
      y += 10
    }
  } else {
    y += 8
  }

  // 3. Title (e.g. Certificate of Participation)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(26)
  if (cert.borderStyle === 'modern') {
    pdf.setTextColor(36, 91, 75)
  } else if (cert.borderStyle === 'academic') {
    pdf.setTextColor(24, 43, 73)
  } else {
    pdf.setTextColor(35, 38, 42)
  }
  pdf.text(cert.title || 'Certificate of Participation', centerX, y, { align: 'center' })
  y += 9

  // 4. Subtitle
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(110, 115, 120)
  pdf.text(
    (cert.subtitle || 'THIS CERTIFICATE IS PROUDLY PRESENTED TO').toUpperCase(),
    centerX,
    y,
    { align: 'center' }
  )
  y += 12

  // 5. Participant Name (large, prominent)
  const nameX = cert.nameX ?? centerX
  const nameY = cert.nameY ?? y
  const nameSize = cert.nameSize ?? 28
  const [nr, ng, nb] = hexToRgb(cert.nameColor)

  pdf.setFont('times', 'bolditalic')
  pdf.setFontSize(nameSize)
  pdf.setTextColor(nr, ng, nb)
  pdf.text(participant.name, nameX, nameY, { align: 'center' })

  // Name underline accent line
  pdf.setDrawColor(cert.borderStyle === 'gold' ? 197 : 140, cert.borderStyle === 'gold' ? 160 : 145, 89)
  pdf.setLineWidth(0.6)
  pdf.line(nameX - 45, nameY + 3, nameX + 45, nameY + 3)
  y = Math.max(y + 12, nameY + 9)

  // 6. Description Text (with placeholders resolved)
  const descText = resolveDescription(cert.description, participant, cert)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.setTextColor(65, 70, 75)

  const descLines = pdf.splitTextToSize(descText, 200)
  pdf.text(descLines, centerX, y, { align: 'center', lineHeightFactor: 1.4 })
  y += descLines.length * 6 + 6

  // 7. Venue / Date extra line if present and not in description
  if (participant.venue && !cert.description.toLowerCase().includes('venue')) {
    pdf.setFontSize(9.5)
    pdf.setTextColor(100, 105, 110)
    pdf.text(`Given at ${participant.venue}`, centerX, y, { align: 'center' })
    y += 6
  }

  // 8. Signatories Area (Dual or Single)
  renderSignatories(pdf, cert, centerX)

  // 9. QR Code (Bottom Right / Left Corner)
  await renderCertificateQr(pdf, cert, participant)
}

function renderSignatories(pdf: jsPDF, cert: CertificateData, centerX: number) {
  const hasSignatory2 = Boolean(cert.signatory2 && cert.signatory2.trim())

  if (hasSignatory2) {
    const leftX = cert.sig1X ?? 85
    const sigY = cert.sig1Y ?? 180
    const rightX = cert.sig2X ?? 212
    const sig2Y = cert.sig2Y ?? 180

    // Signatory 1
    if (cert.signatureUrl) {
      try {
        pdf.addImage(cert.signatureUrl, 'PNG', leftX - 18, sigY - 15, 36, 14)
      } catch { /* ignore */ }
    }
    pdf.setDrawColor(180, 180, 185)
    pdf.setLineWidth(0.5)
    pdf.line(leftX - 32, sigY, leftX + 32, sigY)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10.5)
    pdf.setTextColor(30, 32, 35)
    pdf.text(cert.signatory || 'Signatory Name', leftX, sigY + 5, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(100, 105, 110)
    pdf.text(cert.signatoryPosition || 'Signatory Position', leftX, sigY + 9, { align: 'center' })

    // Signatory 2
    if (cert.signature2Url) {
      try {
        pdf.addImage(cert.signature2Url, 'PNG', rightX - 18, sig2Y - 15, 36, 14)
      } catch { /* ignore */ }
    }
    pdf.line(rightX - 32, sig2Y, rightX + 32, sig2Y)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10.5)
    pdf.setTextColor(30, 32, 35)
    pdf.text(cert.signatory2 || 'Second Signatory', rightX, sig2Y + 5, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(100, 105, 110)
    pdf.text(cert.signatory2Position || 'Position', rightX, sig2Y + 9, { align: 'center' })
  } else if (cert.signatory || cert.signatureUrl) {
    // Single Signatory
    const sigX = cert.sig1X ?? centerX
    const sigY = cert.sig1Y ?? 180

    if (cert.signatureUrl) {
      try {
        pdf.addImage(cert.signatureUrl, 'PNG', sigX - 20, sigY - 15, 40, 14)
      } catch { /* ignore */ }
    }
    pdf.setDrawColor(180, 180, 185)
    pdf.setLineWidth(0.5)
    pdf.line(sigX - 35, sigY, sigX + 35, sigY)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(30, 32, 35)
    pdf.text(cert.signatory || 'Signatory Name', sigX, sigY + 5, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(100, 105, 110)
    pdf.text(cert.signatoryPosition || 'Signatory Position', sigX, sigY + 9.5, { align: 'center' })
  }
}

async function renderCertificateQr(pdf: jsPDF, cert: CertificateData, participant: ParticipantResolved) {
  if (cert.includeQr !== false) {
    const qrPayload = `${cert.title} | Issued to: ${participant.name} | ID: ${participant.id} | Date: ${participant.date || cert.date}`
    const qrUrl = await generateQrDataUrl(qrPayload)
    if (qrUrl) {
      const qrX = cert.qrX ?? 262
      const qrY = cert.qrY ?? 172
      try {
        pdf.addImage(qrUrl, 'PNG', qrX - 9, qrY - 9, 18, 18)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6.5)
        pdf.setTextColor(120, 125, 130)
        pdf.text(participant.id, qrX, qrY + 11, { align: 'center' })
      } catch { /* ignore */ }
    }
  }
}

/**
 * Generates a SINGLE COMBINED PDF with all participant certificates on sequential landscape pages.
 */
export async function exportCombinedCertificatesPdf(
  cert: CertificateData,
  participants: string[][],
  headers: string[],
  onProgress?: ProgressCallback
) {
  const pdf = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' })
  const total = participants.length

  for (let i = 0; i < total; i++) {
    if (i > 0) {
      pdf.addPage('a4', 'landscape')
    }

    const resolved = resolveParticipant(cert, participants[i], headers, i)
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        message: `Rendering certificate for ${resolved.name}...`
      })
    }

    await renderCertificatePage(pdf, cert, resolved)
    // Yield to main thread briefly so UI progress animates smoothly
    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 10))
    }
  }

  const filename = `${safe(cert.title || 'Certificates')}_Combined_${total}_Participants.pdf`
  pdf.save(filename)
}

/**
 * Generates individual PDFs for each participant and packages them into a SINGLE .ZIP file.
 */
export async function exportCertificatesZip(
  cert: CertificateData,
  participants: string[][],
  headers: string[],
  onProgress?: ProgressCallback
) {
  const zip = new JSZip()
  const total = participants.length

  for (let i = 0; i < total; i++) {
    const resolved = resolveParticipant(cert, participants[i], headers, i)
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 0.5) / total) * 90),
        message: `Generating individual PDF for ${resolved.name}...`
      })
    }

    const pdf = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' })
    await renderCertificatePage(pdf, cert, resolved)

    const blob = pdf.output('blob')
    const fileName = `Certificate_${String(i + 1).padStart(3, '0')}_${safe(resolved.name)}.pdf`
    zip.file(fileName, blob)

    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 10))
    }
  }

  if (onProgress) {
    onProgress({ current: total, total, percent: 95, message: 'Compressing into ZIP archive...' })
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) {
      onProgress({
        current: total,
        total,
        percent: Math.min(99, 90 + Math.round(metadata.percent / 10)),
        message: `Compressing ZIP: ${Math.round(metadata.percent)}%`
      })
    }
  })

  const zipFileName = `${safe(cert.title || 'Certificates')}_Batch_${total}_Participants.zip`
  download(zipBlob, zipFileName)
}
