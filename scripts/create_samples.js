import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const masterlistData = [
  ['Employee ID', 'First Name', 'Last Name', 'Department', 'Position', 'Daily Rate', 'Days Worked', 'Basic Pay', 'Allowance', 'Tax Deductions', 'Contact Number', 'Hired Date', 'Status'],
  ['EMP-1001', 'JUAN', 'DELA CRUZ', 'Administrative', 'Admin Assistant II', '750', '22', '16500', '2500', '1250', '09171234567', '2022-03-15', 'ACTIVE'],
  ['EMP-1002', 'maria', 'santos', 'Human Resources', 'HR Specialist', '850', '20', '17000', '3000', '1500', '9187654321', '2021-06-01', 'ACTIVE'],
  ['EMP-1003', 'JOSE', 'RIZAL', 'Accounting', 'Accountant I', '950', '22', '20900', '3500', '2100', '09228889999', '2020-01-10', 'ACTIVE'],
  ['EMP-1004', 'gabriela', 'silang', 'Administrative', 'Records Officer', '700', '21', '14700', '2000', '1100', '9051112233', '2023-08-20', 'PENDING'],
  ['EMP-1005', 'ANDRES', 'BONIFACIO', 'Operations', 'Team Leader', '880', '23', '20240', '3200', '1800', '09395556677', '2019-11-05', 'ACTIVE'],
  ['EMP-1006', 'emilio', 'aguinaldo', 'Executive', 'Division Head', '1200', '22', '26400', '5000', '3200', '9173334455', '2018-05-12', 'ACTIVE'],
  ['EMP-1007', 'APOLINARIO', 'MABINI', 'Legal & Policy', 'Legal Researcher', '1100', '21', '23100', '4000', '2700', '09189990011', '2021-09-18', 'ACTIVE'],
  ['EMP-1008', 'melchora', 'aquino', 'Medical / Health', 'Staff Nurse', '800', '22', '17600', '2800', '1400', '9204445566', '2022-10-01', 'ACTIVE'],
  ['EMP-1009', 'ANTONIO', 'LUNA', 'Operations', 'Field Coordinator', '820', '19', '15580', '2500', '1350', '09177778899', '2023-02-14', 'PENDING'],
  ['EMP-1010', 'teresa', 'magbanua', 'Accounting', 'Bookkeeper', '720', '22', '15840', '2200', '1200', '9062223344', '2024-01-08', 'ACTIVE']
]

const supplementData = [
  ['Employee ID', 'Performance Bonus', 'Overtime Hours', 'Overtime Pay', 'Health Plan (PhilHealth/HMO)', 'Rating'],
  ['EMP-1001', '3000', '10', '1406.25', '650', 'Very Satisfactory'],
  ['EMP-1002', '3500', '8', '1275.00', '700', 'Outstanding'],
  ['EMP-1003', '4000', '15', '2671.88', '850', 'Outstanding'],
  ['EMP-1004', '2000', '5', '656.25', '550', 'Satisfactory'],
  ['EMP-1005', '3800', '12', '1980.00', '800', 'Very Satisfactory'],
  ['EMP-1006', '5000', '6', '1350.00', '1100', 'Outstanding'],
  ['EMP-1007', '4500', '8', '1650.00', '950', 'Outstanding'],
  ['EMP-1008', '3200', '14', '2100.00', '700', 'Very Satisfactory'],
  ['EMP-1009', '2500', '4', '615.00', '600', 'Satisfactory'],
  ['EMP-1010', '2800', '9', '1215.00', '600', 'Very Satisfactory']
]

const sampleDir = path.join(root, 'sample_files')
const publicDir = path.join(root, 'public')
if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true })
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

// 1. Masterlist File
const wb1 = XLSX.utils.book_new()
const ws1 = XLSX.utils.aoa_to_sheet(masterlistData)
XLSX.utils.book_append_sheet(wb1, ws1, 'Masterlist')
XLSX.writeFile(wb1, path.join(sampleDir, 'sample_employees_masterlist.xlsx'))
XLSX.writeFile(wb1, path.join(publicDir, 'sample_employees_masterlist.xlsx'))

// 2. Supplement File
const wb2 = XLSX.utils.book_new()
const ws2 = XLSX.utils.aoa_to_sheet(supplementData)
XLSX.utils.book_append_sheet(wb2, ws2, 'Payroll_Supplement')
XLSX.writeFile(wb2, path.join(sampleDir, 'sample_payroll_supplement.xlsx'))
XLSX.writeFile(wb2, path.join(publicDir, 'sample_payroll_supplement.xlsx'))

console.log('Successfully generated sample files in sample_files/ and public/!')
