import * as XLSX from 'xlsx'
import type { SpreadsheetData } from '../types'

export async function readSpreadsheet(file: File): Promise<SpreadsheetData> {
  const buffer = await file.arrayBuffer()
  const book = XLSX.read(buffer, { type: 'array', raw: false })
  if (!book.SheetNames.length) throw new Error('This workbook does not contain any sheets.')
  const sheet = book.Sheets[book.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (!data.length) throw new Error('This spreadsheet is empty.')
  const rows = data.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? '')) : [])
  const headers = rows[0].map((value, i) => value.trim() || `Column ${i + 1}`)
  return { name: file.name, headers, rows: rows.slice(1), sheets: book.SheetNames }
}

export type CleanMode =
  | 'duplicates'
  | 'empty'
  | 'trim'
  | 'titleCase'      // Capitalize every word / every space (e.g. "Ilagan City")
  | 'firstLetter'    // Capitalize first letter only (e.g. "Ilagan city")
  | 'upperCase'      // ALL CAPS (e.g. "ILAGAN CITY")
  | 'lowerCase'      // all lowercase (e.g. "ilagan city")
  | 'sentenceCase'

/**
 * Capitalizes the first letter of each word (at start and after every space/delimiter).
 * e.g. "CORPORATION" -> "Corporation", "gamu" -> "Gamu", "ilagan city" -> "Ilagan City"
 * Handles hyphenated words, brackets, commas, periods, and name prefixes (O', D').
 */
export function toTitleCase(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/(?:^|[^\p{L}\p{N}'])(\p{L})/gu, match => match.toUpperCase())
    .replace(/(\b[odl]')(\p{L})/giu, (_, prefix, letter) => prefix.toUpperCase() + letter.toUpperCase())
}

/**
 * Capitalizes only the first letter of the text / cell, lowercasing all other letters.
 * e.g. "ILAGAN CITY" -> "Ilagan city", "ilagan city" -> "Ilagan city"
 * "CORPORATION" -> "Corporation", "gamu" -> "Gamu"
 */
export function toFirstLetterCase(text: string): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (!trimmed) return text
  const lower = trimmed.toLowerCase()
  return lower.replace(/^([\s"'([<{]*)(\p{L})/u, (_, prefix, letter) => prefix + letter.toUpperCase())
}

/**
 * Capitalizes the first letter of each sentence.
 */
export function toSentenceCase(text: string): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (!trimmed) return text
  return trimmed.toLowerCase().replace(/(?:^|[.!?]\s+)(\p{L})/gu, match => match.toUpperCase())
}

export function cleanRows(
  rows: string[][],
  mode: CleanMode,
  colIndex: number = -1
): { rows: string[][]; affectedCount: number } {
  if (mode === 'duplicates') {
    const seen = new Set<string>()
    const newRows = rows.filter(row => {
      const id = JSON.stringify(row)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    return { rows: newRows, affectedCount: rows.length - newRows.length }
  }

  if (mode === 'empty') {
    const newRows = rows.filter(row => row.some(cell => (cell || '').trim() !== ''))
    return { rows: newRows, affectedCount: rows.length - newRows.length }
  }

  let affectedCount = 0

  const transform = (cell: string): string => {
    const original = cell || ''
    let updated = original
    switch (mode) {
      case 'trim':
        updated = original.trim().replace(/\s+/g, ' ')
        break
      case 'titleCase':
        updated = toTitleCase(original.trim())
        break
      case 'firstLetter':
        updated = toFirstLetterCase(original.trim())
        break
      case 'sentenceCase':
        updated = toSentenceCase(original.trim())
        break
      case 'upperCase':
        updated = original.toUpperCase()
        break
      case 'lowerCase':
        updated = original.toLowerCase()
        break
      default:
        updated = original
    }
    if (updated !== original) affectedCount++
    return updated
  }

  const newRows = rows.map(row => {
    if (colIndex >= 0 && colIndex < row.length) {
      const newRow = [...row]
      newRow[colIndex] = transform(newRow[colIndex] ?? '')
      return newRow
    }
    return row.map(cell => transform(cell ?? ''))
  })

  return { rows: newRows, affectedCount }
}

export function exportSpreadsheet(data: SpreadsheetData, format: 'xlsx' | 'csv' | 'json') {
  const sheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows])
  const filename = data.name.replace(/\.[^.]+$/, '')
  if (format === 'json') {
    const json = data.rows.map(row => Object.fromEntries(data.headers.map((h, i) => [h, row[i] || ''])))
    download(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `${filename}.json`)
    return
  }
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Data')
  XLSX.writeFile(book, `${filename}.${format}`)
}

export function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url) }
