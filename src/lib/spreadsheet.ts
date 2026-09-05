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

export type ColumnFormatType =
  | 'currency-php'
  | 'number-commas'
  | 'number-integer'
  | 'percent'
  | 'date-long'
  | 'date-short'
  | 'date-iso'
  | 'phone-ph'
  | 'phone-intl'

/**
 * Merges two spreadsheets using a VLOOKUP-style key match on specified columns.
 */
export function mergeSpreadsheets(
  primary: SpreadsheetData,
  secondary: SpreadsheetData,
  primaryKeyIdx: number,
  secondaryKeyIdx: number,
  secondaryColIndices: number[]
): { data: SpreadsheetData; matchedCount: number; unmatchedCount: number } {
  // Build lookup index from secondary table
  const lookupMap = new Map<string, string[]>()
  secondary.rows.forEach(row => {
    const keyVal = (row[secondaryKeyIdx] || '').trim().toLowerCase()
    if (keyVal && !lookupMap.has(keyVal)) {
      lookupMap.set(keyVal, row)
    }
  })

  // Determine non-conflicting headers for new columns
  const addedHeaders = secondaryColIndices.map(ci => {
    const secHeader = secondary.headers[ci] || `Column ${ci + 1}`
    if (primary.headers.includes(secHeader)) {
      return `${secHeader} (${secondary.name.replace(/\.[^.]+$/, '')})`
    }
    return secHeader
  })

  let matchedCount = 0
  let unmatchedCount = 0

  const newRows = primary.rows.map(row => {
    const primaryKey = (row[primaryKeyIdx] || '').trim().toLowerCase()
    const match = primaryKey ? lookupMap.get(primaryKey) : undefined

    if (match) {
      matchedCount++
      const appended = secondaryColIndices.map(ci => match[ci] ?? '')
      return [...row, ...appended]
    } else {
      unmatchedCount++
      const emptyAppended = secondaryColIndices.map(() => '')
      return [...row, ...emptyAppended]
    }
  })

  return {
    data: {
      ...primary,
      headers: [...primary.headers, ...addedHeaders],
      rows: newRows,
      addedColumns: Array.from(new Set([...(primary.addedColumns || []), ...addedHeaders]))
    },
    matchedCount,
    unmatchedCount
  }
}

/**
 * Performs find and replace across the entire spreadsheet or a specific column.
 */
export function findAndReplace(
  rows: string[][],
  findText: string,
  replaceText: string,
  colIndex: number = -1,
  matchCase: boolean = false,
  wholeWord: boolean = false
): { rows: string[][]; matchCount: number } {
  if (!findText) return { rows, matchCount: 0 }

  let matchCount = 0
  const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patternStr = wholeWord ? `\\b${escaped}\\b` : escaped
  const flags = matchCase ? 'g' : 'gi'
  const regex = new RegExp(patternStr, flags)

  const newRows = rows.map(row => {
    return row.map((cell, cIdx) => {
      if (colIndex !== -1 && cIdx !== colIndex) return cell
      const original = cell || ''
      const matches = original.match(regex)
      if (matches) {
        matchCount += matches.length
        return original.replace(regex, replaceText)
      }
      return original
    })
  })

  return { rows: newRows, matchCount }
}

/**
 * Formats values in a specified column (Currency, Number, Percentage, Date, Phone).
 */
export function formatColumnCells(
  rows: string[][],
  colIndex: number,
  formatType: ColumnFormatType
): { rows: string[][]; affectedCount: number } {
  let affectedCount = 0

  const formatValue = (cell: string): string => {
    const raw = (cell || '').trim()
    if (!raw) return cell

    // Strip common currency symbols and commas for numeric parsing
    const cleanNumStr = raw.replace(/[₱$,\s]/g, '')
    const num = Number(cleanNumStr)

    switch (formatType) {
      case 'currency-php': {
        if (!isNaN(num) && cleanNumStr !== '') {
          const formatted = `₱ ${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'number-commas': {
        if (!isNaN(num) && cleanNumStr !== '') {
          const hasDecimals = cleanNumStr.includes('.')
          const formatted = num.toLocaleString('en-US', {
            minimumFractionDigits: hasDecimals ? 2 : 0,
            maximumFractionDigits: 2
          })
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'number-integer': {
        if (!isNaN(num) && cleanNumStr !== '') {
          const formatted = Math.round(num).toLocaleString('en-US')
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'percent': {
        if (!isNaN(num) && cleanNumStr !== '') {
          // If already in 0-1 decimal range like 0.15, convert to 15%
          const pctVal = Math.abs(num) <= 1 && cleanNumStr.startsWith('0') && cleanNumStr.includes('.') ? num * 100 : num
          const formatted = `${pctVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'date-long': {
        const parsed = parseDateSafe(raw)
        if (parsed) {
          const formatted = parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'date-short': {
        const parsed = parseDateSafe(raw)
        if (parsed) {
          const mm = String(parsed.getMonth() + 1).padStart(2, '0')
          const dd = String(parsed.getDate()).padStart(2, '0')
          const yyyy = parsed.getFullYear()
          const formatted = `${mm}/${dd}/${yyyy}`
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'date-iso': {
        const parsed = parseDateSafe(raw)
        if (parsed) {
          const mm = String(parsed.getMonth() + 1).padStart(2, '0')
          const dd = String(parsed.getDate()).padStart(2, '0')
          const yyyy = parsed.getFullYear()
          const formatted = `${yyyy}-${mm}-${dd}`
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'phone-ph': {
        const digits = raw.replace(/\D/g, '')
        if (digits.length === 11 && digits.startsWith('09')) {
          const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
          if (formatted !== raw) affectedCount++
          return formatted
        } else if (digits.length === 10 && digits.startsWith('9')) {
          const formatted = `0${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      case 'phone-intl': {
        const digits = raw.replace(/\D/g, '')
        if (digits.length === 11 && digits.startsWith('09')) {
          const formatted = `+63 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
          if (formatted !== raw) affectedCount++
          return formatted
        } else if (digits.length === 10 && digits.startsWith('9')) {
          const formatted = `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
          if (formatted !== raw) affectedCount++
          return formatted
        }
        return cell
      }
      default:
        return cell
    }
  }

  const newRows = rows.map(row => {
    if (colIndex >= 0 && colIndex < row.length) {
      const newRow = [...row]
      newRow[colIndex] = formatValue(newRow[colIndex] ?? '')
      return newRow
    }
    return row
  })

  return { rows: newRows, affectedCount }
}

function parseDateSafe(str: string): Date | null {
  if (!str) return null
  // Check standard formats: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    if (!isNaN(d.getTime())) return d
  }
  const usMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (usMatch) {
    const d = new Date(Number(usMatch[3]), Number(usMatch[1]) - 1, Number(usMatch[2]))
    if (!isNaN(d.getTime())) return d
  }
  const native = new Date(str)
  if (!isNaN(native.getTime()) && native.getFullYear() > 1900 && native.getFullYear() < 2100) {
    return native
  }
  return null
}

/**
 * Calculates a math operation on columns (Sum, Subtract, Multiply, Divide, Percent)
 */
export function calculateMathColumn(
  headers: string[],
  rows: string[][],
  op: 'sum' | 'subtract' | 'multiply' | 'divide' | 'percent',
  colA: number,
  colB: number,
  colName: string,
  targetMode: 'new_column' | 'replace_column' = 'new_column',
  replaceColIdx: number = 0,
  multiCols?: number[]
): { headers: string[]; rows: string[][]; affectedCount: number; colName: string } {
  let affectedCount = 0

  const parseNum = (str: string): number => {
    if (!str) return 0
    const clean = str.replace(/[₱$,\s]/g, '')
    const n = Number(clean)
    return isNaN(n) ? 0 : n
  }

  const computedRows = rows.map(row => {
    let result = ''
    if (op === 'sum') {
      const colsToSum = multiCols && multiCols.length >= 2 ? multiCols : [colA, colB]
      const total = colsToSum.reduce((acc, ci) => acc + parseNum(row[ci] ?? ''), 0)
      result = String(Math.round(total * 10000) / 10000)
    } else if (op === 'subtract') {
      const vA = parseNum(row[colA] ?? '')
      const vB = parseNum(row[colB] ?? '')
      result = String(Math.round((vA - vB) * 10000) / 10000)
    } else if (op === 'multiply') {
      const vA = parseNum(row[colA] ?? '')
      const vB = parseNum(row[colB] ?? '')
      result = String(Math.round((vA * vB) * 10000) / 10000)
    } else if (op === 'divide') {
      const vA = parseNum(row[colA] ?? '')
      const vB = parseNum(row[colB] ?? '')
      if (vB === 0) {
        result = '#DIV/0!'
      } else {
        result = String(Math.round((vA / vB) * 10000) / 10000)
      }
    } else if (op === 'percent') {
      const vA = parseNum(row[colA] ?? '')
      const vB = parseNum(row[colB] ?? '')
      if (vB === 0) {
        result = '#DIV/0!'
      } else {
        const pct = (vA / vB) * 100
        result = `${(Math.round(pct * 100) / 100).toFixed(2)}%`
      }
    }

    affectedCount++

    if (targetMode === 'replace_column') {
      const newRow = [...row]
      newRow[replaceColIdx] = result
      return newRow
    }
    return [...row, result]
  })

  if (targetMode === 'replace_column') {
    return {
      headers,
      rows: computedRows,
      affectedCount,
      colName: headers[replaceColIdx] || colName
    }
  }

  let finalName = colName.trim() || 'Calculated'
  if (headers.includes(finalName)) {
    finalName = `${finalName} (1)`
  }

  return {
    headers: [...headers, finalName],
    rows: computedRows,
    affectedCount,
    colName: finalName
  }
}

/**
 * Combines multiple text columns with a chosen separator.
 */
export function combineTextColumns(
  headers: string[],
  rows: string[][],
  colIndices: number[],
  separator: string = ' ',
  colName: string = 'Full Name',
  targetMode: 'new_column' | 'replace_column' = 'new_column',
  replaceColIdx: number = 0
): { headers: string[]; rows: string[][]; affectedCount: number; colName: string } {
  let affectedCount = 0

  const computedRows = rows.map(row => {
    const combined = colIndices
      .map(ci => (row[ci] || '').trim())
      .filter(Boolean)
      .join(separator)

    affectedCount++

    if (targetMode === 'replace_column') {
      const newRow = [...row]
      newRow[replaceColIdx] = combined
      return newRow
    }
    return [...row, combined]
  })

  if (targetMode === 'replace_column') {
    return {
      headers,
      rows: computedRows,
      affectedCount,
      colName: headers[replaceColIdx] || colName
    }
  }

  let finalName = colName.trim() || 'Combined'
  if (headers.includes(finalName)) {
    finalName = `${finalName} (1)`
  }

  return {
    headers: [...headers, finalName],
    rows: computedRows,
    affectedCount,
    colName: finalName
  }
}

/**
 * Computes summary statistics (Sum, Average, Count) for a column.
 */
export function calculateColumnSummary(rows: string[][], colIdx: number): {
  sum: number
  avg: number
  min: number
  max: number
  count: number
  numericCount: number
  isNumeric: boolean
} {
  let sum = 0
  let count = 0
  let numericCount = 0
  let min = Infinity
  let max = -Infinity

  rows.forEach(r => {
    const raw = (r[colIdx] || '').trim()
    if (raw) {
      count++
      const clean = raw.replace(/[₱$,\s]/g, '')
      const num = Number(clean)
      if (!isNaN(num) && clean !== '') {
        sum += num
        numericCount++
        if (num < min) min = num
        if (num > max) max = num
      }
    }
  })

  const isNumeric = numericCount > 0 && numericCount >= count * 0.4
  const avg = isNumeric && numericCount > 0 ? sum / numericCount : 0

  return {
    sum: Math.round(sum * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    min: min === Infinity ? 0 : Math.round(min * 100) / 100,
    max: max === -Infinity ? 0 : Math.round(max * 100) / 100,
    count,
    numericCount,
    isNumeric
  }
}

/**
 * Appends a permanent summary row (e.g. TOTAL or AVERAGE) to the bottom of the table.
 */
export function appendSummaryRow(
  headers: string[],
  rows: string[][],
  type: 'TOTAL' | 'AVERAGE',
  targetCols?: number | number[]
): string[][] {
  const targetIndices = Array.isArray(targetCols)
    ? targetCols
    : targetCols !== undefined && targetCols !== -1
      ? [targetCols]
      : undefined

  const newRow = headers.map((_h, i) => {
    if (i === 0) {
      return type === 'TOTAL' ? 'TOTAL' : 'AVERAGE'
    }
    if (targetIndices && !targetIndices.includes(i)) {
      return ''
    }
    const stats = calculateColumnSummary(rows, i)
    if (stats.isNumeric) {
      const val = type === 'TOTAL' ? stats.sum : stats.avg
      return val.toLocaleString('en-US', {
        minimumFractionDigits: val % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: 2
      })
    }
    return ''
  })

  return [...rows, newRow]
}

/**
 * Safely evaluates a custom calculated formula expression row-by-row.
 */
export function evaluateColumnFormula(
  headers: string[],
  rows: string[][],
  formula: string,
  newColName: string = 'Calculated',
  targetMode: 'new_column' | 'replace_column' = 'new_column',
  replaceColIdx: number = 0
): { headers: string[]; rows: string[][]; affectedCount: number; colName: string } {
  const cleanFormula = formula.trim()
  if (!cleanFormula) throw new Error('Formula cannot be empty.')

  const headerMap = new Map<string, number>()
  headers.forEach((h, i) => {
    headerMap.set(h.toLowerCase().trim(), i)
  })

  const columnRefs = cleanFormula.match(/\[(.*?)\]/g) || []
  for (const ref of columnRefs) {
    const colName = ref.slice(1, -1).trim().toLowerCase()
    if (!headerMap.has(colName)) {
      throw new Error(`Column "${ref.slice(1, -1)}" was not found in this spreadsheet.`)
    }
  }

  let affectedCount = 0

  const computedRows = rows.map(row => {
    let isStringConcat = cleanFormula.includes('"') || cleanFormula.includes("'")

    let expr = cleanFormula.replace(/\[(.*?)\]/g, (_, name) => {
      const colIdx = headerMap.get(name.trim().toLowerCase())!
      const rawVal = (row[colIdx] || '').trim()

      if (isStringConcat) {
        return JSON.stringify(rawVal)
      }

      const cleanNum = rawVal.replace(/[₱$,]/g, '')
      const numVal = Number(cleanNum)
      if (isNaN(numVal) || cleanNum === '') {
        isStringConcat = true
        return JSON.stringify(rawVal)
      }
      return String(numVal)
    })

    expr = expr.replace(/SUM\((.*?)\)/gi, (_, args) => {
      const parts = args.split(',').map((p: string) => Number(p.trim().replace(/[₱$,]/g, '')) || 0)
      return String(parts.reduce((a: number, b: number) => a + b, 0))
    })
    expr = expr.replace(/AVG\((.*?)\)/gi, (_, args) => {
      const parts = args.split(',').map((p: string) => Number(p.trim().replace(/[₱$,]/g, '')) || 0)
      return String(parts.length ? parts.reduce((a: number, b: number) => a + b, 0) / parts.length : 0)
    })
    expr = expr.replace(/ROUND\((.*?),\s*(\d+)\)/gi, (_, valStr, decimals) => {
      const v = Number(valStr.trim().replace(/[₱$,]/g, '')) || 0
      const d = Number(decimals) || 0
      return String(Number(v.toFixed(d)))
    })

    let calculatedResult = ''
    try {
      const sanitizeExpr = expr.replace(/[^0-9+\-*/().%\s"'\\]/g, '')
      if (isStringConcat || expr.includes('"') || expr.includes("'")) {
        const fn = new Function(`return (${expr})`)
        calculatedResult = String(fn() ?? '')
      } else {
        const fn = new Function(`return (${sanitizeExpr})`)
        const numRes = fn()
        if (typeof numRes === 'number') {
          if (!isFinite(numRes) || isNaN(numRes)) {
            calculatedResult = '#DIV/0!'
          } else {
            calculatedResult = String(Math.round(numRes * 10000) / 10000)
          }
        } else {
          calculatedResult = String(numRes ?? '')
        }
      }
    } catch {
      calculatedResult = '#ERROR'
    }

    affectedCount++

    if (targetMode === 'replace_column') {
      const newRow = [...row]
      newRow[replaceColIdx] = calculatedResult
      return newRow
    }
    return [...row, calculatedResult]
  })

  if (targetMode === 'replace_column') {
    return {
      headers,
      rows: computedRows,
      affectedCount,
      colName: headers[replaceColIdx] || newColName
    }
  }

  let finalColName = newColName.trim() || 'Calculated'
  if (headers.includes(finalColName)) {
    finalColName = `${finalColName} (1)`
  }

  return {
    headers: [...headers, finalColName],
    rows: computedRows,
    affectedCount,
    colName: finalColName
  }
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

