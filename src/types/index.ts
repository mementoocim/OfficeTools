export type Page = 'home' | 'documents' | 'spreadsheets' | 'reports' | 'certificates' | 'templates' | 'archives' | 'recent' | 'settings' | 'admin'

export type ArchivedItem = {
  id: string
  label: string
  tool: 'documents' | 'spreadsheets' | 'reports' | 'certificates'
  toolTitle: string
  savedAt: string
  summary: string
  payload: unknown
}

export type RecentFile = {
  id: string
  name: string
  type: 'Document' | 'Spreadsheet' | 'Report' | 'Certificate'
  modified: string
  data?: unknown
}

export type SavedTemplate = {
  id: string
  name: string
  category: 'Document' | 'Report' | 'Certificate'
  updatedAt: string
  payload: unknown
}

export type SpreadsheetData = {
  name: string
  headers: string[]
  rows: string[][]
  sheets: string[]
  addedColumns?: string[]
}

export type DocumentData = {
  type: string; date: string; recipientName: string; recipientPosition: string; organization: string;
  address: string; subject: string; greeting: string; body: string; closing: string; senderName: string; senderPosition: string
}

export type ReportSection = { id: string; title: string; content: string; type: 'Text' | 'Bullet List' | 'Numbered List' }

export type CertificateBorderStyle = 'gold' | 'modern' | 'academic' | 'minimal'

export type CertificateData = {
  title: string
  subtitle?: string
  description: string
  event: string
  date: string
  venue: string
  signatory: string
  signatoryPosition: string
  signatory2?: string
  signatory2Position?: string
  borderStyle?: CertificateBorderStyle
  logoUrl?: string
  signatureUrl?: string
  signature2Url?: string
  includeQr?: boolean
  qrPrefix?: string
  backgroundImageUrl?: string
  hideDefaultText?: boolean
  nameX?: number
  nameY?: number
  nameSize?: number
  nameColor?: string
  qrX?: number
  qrY?: number
  sig1X?: number
  sig1Y?: number
  sig2X?: number
  sig2Y?: number
}

export type ImportStatus = {
  name: string
  status: 'loading' | 'success' | 'error'
  message?: string
}
