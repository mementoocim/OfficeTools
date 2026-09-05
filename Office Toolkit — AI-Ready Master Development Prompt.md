# OFFICE TOOLKIT — MASTER DEVELOPMENT PROMPT

Build a polished, fully functional desktop-first web application called:

# Office Toolkit

Office Toolkit is a personal productivity and automation application designed for repetitive office work involving Word documents, Excel spreadsheets, reports, certificates, lists, and files.

The primary user is an office worker who wants to automate repetitive tasks instead of manually repeating the same Word and Excel workflows.

This is NOT an enterprise management system.

This is NOT an ERP.

This is NOT a document management system for an entire organization.

This is a personal productivity toolkit intended to make everyday office tasks faster.

The application should feel like:

> “A developer-built Swiss Army knife for office work.”

The application may use the internet because internet access is available, but its core file-processing features should remain local-first whenever practical.

---

# 1. PRIMARY GOALS

The application should:

- Reduce repetitive Word and Excel work.
- Automate common document-generation tasks.
- Process spreadsheets quickly.
- Generate recurring reports.
- Generate certificates in bulk.
- Maintain reusable templates.
- Remember recent work.
- Provide quick access to frequently used tools.
- Be easy to expand with new tools in the future.
- Feel extremely fast and lightweight.
- Require minimal clicks.
- Be designed primarily for desktop/laptop use.

Do not overengineer the application.

A small feature that saves 20 minutes of repetitive work is more valuable than a complicated feature that is rarely used.

---

# 2. TECHNOLOGY STACK

Use:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui where appropriate
- Lucide React icons
- SheetJS / xlsx
- docx
- jsPDF
- IndexedDB
- File System Access API where supported
- Web Workers for heavy spreadsheet/PDF operations where appropriate

Use npm.

Use clean reusable components.

Suggested project structure:

src/
  components/
  features/
    documents/
    spreadsheets/
    reports/
    certificates/
  pages/
  hooks/
  lib/
  services/
    api/
    ai/
    cloud/
  storage/
  types/
  utils/

Separate business logic from UI components.

For example:

spreadsheetProcessor.ts
documentGenerator.ts
certificateGenerator.ts
reportGenerator.ts
localStorageService.ts

Do not put complex processing logic directly inside React components.

---

# 3. LOCAL-FIRST + INTERNET-ENHANCED ARCHITECTURE

The application does NOT need to be completely offline.

Internet access is available.

However, core functionality should work locally whenever technically possible.

LOCAL FEATURES:

- Excel processing
- CSV processing
- Document generation
- PDF generation
- Certificate generation
- Report generation
- Template management
- Draft storage
- Recent-file metadata
- Search
- File conversion

ONLINE FEATURES MAY BE ADDED FOR:

- AI-assisted writing
- Grammar improvement
- Report summarization
- Template downloads
- Cloud backup
- Synchronization
- External API integrations
- Application updates

Do not make internet connectivity mandatory for basic office tools.

---

# 4. DATA PRIVACY

This application may process workplace files.

Treat privacy seriously.

Uploaded files should be processed locally whenever possible.

Never automatically upload:

- Excel files
- CSV files
- Word documents
- PDFs
- participant lists
- names
- contact information
- workplace records

to external services.

Online functionality must be explicitly triggered by the user.

Clearly label operations:

LOCAL
Processed entirely on this device.

ONLINE
Uses an internet service.

AI ASSISTED
Selected content may be sent to an AI provider.

Never automatically send document contents to an AI API.

Never hardcode API keys in frontend source code.

If external AI APIs are added later, use environment variables and a secure backend/serverless proxy where required.

---

# 5. DESIGN PHILOSOPHY

Create an extremely clean, minimalist productivity interface.

Design inspiration:

- modern macOS productivity applications
- modern iPadOS/iOS utility interfaces
- Linear
- Notion
- Raycast
- modern desktop file utilities

Do NOT directly clone any application.

The interface should feel professional enough for everyday office use.

Avoid the typical student-project dashboard appearance.

DO NOT USE:

- giant colorful dashboard cards
- excessive gradients
- excessive icons
- unnecessary charts
- huge hero sections
- excessive shadows
- glassmorphism everywhere
- animated backgrounds
- unnecessary illustrations
- overly rounded everything
- excessive modals

USE:

- neutral background
- subtle borders
- soft shadows
- restrained translucency
- generous whitespace
- excellent typography hierarchy
- subtle hover states
- smooth transitions
- 12–18px corner radius
- compact controls
- clear information density

The interface should feel calm and focused.

---

# 6. APPLICATION LAYOUT

Create a desktop-first layout.

LEFT SIDEBAR:

Office Toolkit

Home

TOOLS
Documents
Spreadsheets
Reports
Certificates

LIBRARY
Templates
Recent Files

BOTTOM
Settings

Allow sidebar collapse.

When collapsed, display only icons with tooltips.

---

# 7. HOME DASHBOARD

Main greeting:

Good morning, Mico.

Automatically change greeting according to local time:

Good morning
Good afternoon
Good evening

Below:

“What would you like to work on?”

---

# QUICK TOOLS

Display four primary tools.

DOCUMENT GENERATOR

Create letters, reports and certificates

SPREADSHEET TOOLS

Clean • Merge • Filter • Convert

REPORT BUILDER

Generate recurring reports

BULK CERTIFICATE GENERATOR

Excel → Certificates → PDF

Each card should contain:

- small icon
- tool name
- short description
- subtle arrow
- hover feedback

Cards should NOT have bright individual colors.

Clicking anywhere on a card opens the tool.

---

# 8. RECENT FILES

Below Quick Tools:

Recent Files

Use a compact table/list.

Columns:

Name
Type
Modified
Action

Example:

Activity_Report_August
Report
Today, 10:32 AM

MSME_Training_Attendance
Spreadsheet
Yesterday, 3:15 PM

Actions:

Open
Rename
Duplicate
Remove from Recent

Add:

Clear Recent History

Do not store the entire original file unless required.

Store metadata and application-created projects locally.

---

# 9. DOCUMENT GENERATOR

Build a fully functional document-generation workspace.

Available document types:

- Letter
- Memo
- Simple Report
- Certificate
- Custom Template

Layout:

LEFT PANEL
Document fields

RIGHT PANEL
Live preview

Example Letter fields:

Date

Recipient Name

Recipient Position

Office / Organization

Address

Subject

Greeting

Body

Closing

Sender Name

Sender Position

Allow multiline text.

---

# DOCUMENT PREVIEW

Display a realistic A4 paper preview.

Allow:

Zoom In
Zoom Out
Fit Page

Changes should immediately update the preview.

---

# DOCUMENT TEMPLATES

Allow:

Save as Template
Load Template
Rename Template
Duplicate Template
Delete Template

Example templates:

Formal Letter
Activity Report
Training Certificate
Office Memo

Store templates locally.

---

# DOCUMENT EXPORT

Support:

Export DOCX
Export PDF
Print

The exported document must preserve formatting.

Do not create fake export buttons.

Implement actual working file generation.

---

# 10. SPREADSHEET TOOLS

This should be one of the most powerful modules.

Create a drag-and-drop area:

Drop Excel or CSV file here

or

Browse Files

Supported:

.xlsx
.xls
.csv

After import, display:

Filename
File size
Rows
Columns
Detected headers
Sheet names

If workbook contains multiple sheets, allow the user to choose a sheet.

---

# 11. SPREADSHEET PREVIEW

Display spreadsheet data in a performant table.

Features:

Search
Sort
Filter
Column resize
Horizontal scrolling
Sticky header
Row count

Do not attempt to recreate Microsoft Excel.

This is a data-processing interface.

---

# 12. CLEAN DATA

Create a Clean tool.

Available actions:

Remove duplicate rows

Remove empty rows

Trim leading/trailing spaces

Collapse repeated spaces

Normalize capitalization

Find empty cells

Find duplicate values

Remove completely empty columns

Before applying changes, show:

PREVIEW CHANGES

Original rows: 1,284

Resulting rows: 1,201

Duplicates found: 61

Empty rows: 22

Allow:

Apply
Cancel

---

# 13. UNDO

Spreadsheet operations should support undo.

Example:

Removed 61 duplicate rows

[ Undo ]

Maintain an operation history for the current session.

---

# 14. FILTER AND SORT

Allow users to select a column and:

Filter by value

Contains

Does not contain

Equals

Is empty

Is not empty

Sort A → Z

Sort Z → A

For numerical columns:

Greater than
Less than
Between

---

# 15. COLUMN TOOLS

Allow:

Rename column

Delete column

Reorder columns

Select columns

Hide columns

Split column

Combine columns

Example:

First Name + Last Name

→

Full Name

---

# 16. MERGE SPREADSHEETS

Allow multiple Excel/CSV files.

User can drag:

Attendance_January.xlsx
Attendance_February.xlsx
Attendance_March.xlsx

Then:

MERGE FILES

Detect matching columns.

If structures differ, show column mapping.

Example:

File 1:
Participant Name

File 2:
Name

Ask:

Should these columns be treated as the same field?

Allow user confirmation.

Generate one combined spreadsheet.

---

# 17. FILE CONVERSION

Support:

Excel → CSV

CSV → Excel

Excel → JSON

JSON → Excel

Where technically practical.

Provide download/export after conversion.

---

# 18. QUICK SPREADSHEET STATISTICS

After import, show optional summary:

Total Rows
Total Columns
Duplicate Rows
Empty Rows

Allow user to inspect detected issues.

Do not automatically modify data.

---

# 19. REPORT BUILDER

Build a reusable recurring-report generator.

Default report fields:

Report Title

Reporting Period

Prepared By

Office / Unit

Summary

Activities Conducted

Participants / Beneficiaries

Key Accomplishments

Issues / Concerns

Recommendations

Next Steps

Allow custom sections.

---

# 20. DYNAMIC REPORT SECTIONS

User can:

Add Section
Rename Section
Delete Section
Duplicate Section
Move Up
Move Down

Supported section types:

Text
Bullet List
Numbered List
Table
Image
Statistics

---

# 21. RECURRING REPORTS

Add:

Use Previous Report

This should duplicate the structure of an existing report.

Example:

August Activity Report

→

Create September Report

Keep:

structure
headings
formatting

Allow user to choose whether previous content should also be copied.

Never modify the original report.

---

# 22. REPORT EXPORT

Support:

DOCX
PDF
Print

Preview before export.

Use proper A4 formatting.

---

# 23. BULK CERTIFICATE GENERATOR

Build a guided workflow.

Use steps.

STEP 1
Upload Participant List

STEP 2
Map Columns

STEP 3
Design Certificate

STEP 4
Preview

STEP 5
Generate

---

# 24. PARTICIPANT IMPORT

Upload:

.xlsx
.xls
.csv

Example spreadsheet:

Name | Organization | Training | Date

Juan Dela Cruz | Example Office | Business Seminar | August 21, 2026

Automatically detect headers.

---

# 25. COLUMN MAPPING

Ask user to map:

Participant Name
Organization
Event
Date

Example:

Participant Name
→ Name

Organization
→ Agency

Event
→ Training Title

Allow optional fields.

---

# 26. CERTIFICATE TEMPLATE

Provide a simple certificate editor.

Do NOT create a Canva clone.

Allow:

Certificate Title

Participant Name

Description

Event Name

Date

Venue

Signatory

Signatory Position

Logo

Signature

Background image

Basic controls:

Font size
Bold
Italic
Alignment
Position
Text width

---

# 27. PLACEHOLDERS

Support placeholders:

{{name}}
{{organization}}
{{event}}
{{date}}
{{venue}}

Example:

This certificate is presented to

{{name}}

for successfully participating in

{{event}}

held on {{date}}.

During generation, automatically replace placeholders.

---

# 28. CERTIFICATE PREVIEW

Show:

Participant 1 of 125

Previous
Next

Allow user to verify multiple participants before generation.

---

# 29. BULK GENERATION

Allow:

Generate All

Output options:

Combined PDF

Individual PDFs

ZIP containing PDFs

Filename pattern:

Certificate_{{name}}.pdf

Sanitize filenames automatically.

---

# 30. GENERATION PROGRESS

For large batches:

Generating certificates...

42 / 125

Show progress bar.

Provide:

Cancel

Use asynchronous processing or Web Workers where appropriate so the interface remains responsive.

---

# 31. TEMPLATE LIBRARY

Create a Templates page.

Categories:

Documents
Reports
Certificates

Each template displays:

Name
Type
Last Modified

Actions:

Use
Rename
Duplicate
Delete

Add search.

---

# 32. COMMAND PALETTE

Implement:

Ctrl + K

Open a command palette.

Commands:

New Document

Import Spreadsheet

New Report

Generate Certificates

Open Recent File

Open Templates

Settings

Search commands as user types.

---

# 33. KEYBOARD SHORTCUTS

Where appropriate:

Ctrl + K
Command Palette

Ctrl + S
Save

Ctrl + O
Open / Import

Ctrl + P
Print

Ctrl + Z
Undo

Escape
Close dialog / cancel operation

Do not override browser behavior unnecessarily.

---

# 34. AUTO SAVE

Automatically save application-created drafts.

Show subtle indicator:

Saved locally

or

Saving...

Do not display annoying toast notifications every time autosave occurs.

---

# 35. DRAFT RECOVERY

If user accidentally closes the application while editing:

Restore last session?

Show:

Document name

Last edited time

Restore
Discard

---

# 36. GLOBAL SEARCH

Allow search for:

Templates
Recent files
Saved reports
Tools

Search should be instant.

---

# 37. FILE DROP

Support drag-and-drop globally where appropriate.

Example:

If user drops an .xlsx file onto Home:

Show:

Open with Spreadsheet Tools?

[ Open ]

If multiple spreadsheet files are dropped:

Offer:

Merge Spreadsheets

---

# 38. SMART TOOL SUGGESTIONS

WITHOUT USING AI, detect obvious situations.

Example:

User imports spreadsheet with:

125 rows
Name column

Show subtle suggestion:

Looks like a participant list.

Generate certificates?

Another example:

Multiple spreadsheets imported.

Show:

Merge these spreadsheets?

These should only be suggestions.

Never automatically perform actions.

---

# 39. OPTIONAL AI FEATURES — PREPARE ARCHITECTURE ONLY

Prepare the application architecture for optional AI features.

Potential future tools:

Improve Writing

Draft Letter

Summarize Report

Rewrite Professionally

Generate Report Summary

Explain Spreadsheet

Suggest Spreadsheet Cleanup

Do NOT make AI mandatory.

Create interfaces/services so an AI provider can later be connected.

Example:

AIProvider

generateText()

rewriteText()

summarizeText()

Do not hardcode a specific provider throughout the application.

---

# 40. PRIVACY INDICATOR

Display a subtle indicator when processing files:

Local Processing

Tooltip:

“This operation is performed on your device.”

For future online features:

Online Processing

Clearly indicate that external services are involved.

---

# 41. SETTINGS

Create a minimalist Settings page.

APPEARANCE

Theme:

Light
Dark
System

Default:
System

---

FILES

Remember recent files

Default export format

Confirm before deleting templates

---

PRIVACY

Show local processing information.

---

STORAGE

Show:

Saved Templates
Saved Reports
Drafts

Buttons:

Clear Drafts
Clear Recent History
Clear All Local Data

Require confirmation for destructive actions.

---

# 42. ABOUT

Office Toolkit

Personal productivity utilities for repetitive office work.

Version number.

Do not add unnecessary company branding.

---

# 43. DARK MODE

Implement a proper dark mode.

Do not simply invert colors.

Maintain:

readability
contrast
subtle borders
paper previews

Document previews should remain visually representative of actual printed output.

---

# 44. EMPTY STATES

Create useful empty states.

Example:

RECENT FILES

No recent files yet.

Files you work with will appear here.

SPREADSHEETS

Drop a spreadsheet to get started.

REPORTS

No reports yet.

Create your first reusable report.

CERTIFICATES

Generate certificates from a participant spreadsheet in minutes.

Avoid unnecessary illustrations.

---

# 45. ERROR HANDLING

Never fail silently.

Examples:

Unable to read this spreadsheet.

Unsupported file format.

This workbook does not contain any sheets.

No headers were detected.

No participant names were found.

PDF generation failed.

Nothing changed — no duplicate rows were detected.

Use clear human-readable messages.

---

# 46. LOADING STATES

Use subtle progress indicators.

Avoid full-screen loading screens unless absolutely necessary.

For file processing show:

Reading spreadsheet...

Analyzing 1,284 rows...

Preparing preview...

---

# 47. PERFORMANCE

The application should handle reasonably large office spreadsheets.

Avoid rendering thousands of DOM rows simultaneously.

Use table virtualization if necessary.

Heavy operations should not freeze the UI.

Use Web Workers where beneficial.

Avoid unnecessary React re-renders.

---

# 48. RESPONSIVENESS

Primary target:

Desktop / Laptop

Also make the application usable on tablets.

Mobile support is secondary.

On small screens:

collapse sidebar
stack panels
maintain usable controls

Do not compromise desktop productivity just to make everything mobile-first.

---

# 49. ACCESSIBILITY

Use:

semantic HTML
keyboard navigation
visible focus states
proper labels
sufficient contrast
accessible dialogs

Do not rely solely on icons to communicate important actions.

---

# 50. COMPONENT QUALITY

Create reusable components such as:

AppSidebar

PageHeader

ToolCard

FileDropzone

SpreadsheetPreview

DocumentPreview

TemplatePicker

ExportMenu

CommandPalette

EmptyState

ConfirmDialog

ProgressDialog

LocalProcessingBadge

RecentFilesTable

Avoid creating massive single-file components.

---

# 51. TYPES

Create proper TypeScript types/interfaces.

Examples:

RecentFile

DocumentTemplate

ReportTemplate

CertificateTemplate

SpreadsheetWorkbook

SpreadsheetSheet

SpreadsheetOperation

ExportOptions

ApplicationSettings

Draft

Do not use `any` unnecessarily.

---

# 52. PERSISTENCE

Use IndexedDB for larger structured local data.

Use localStorage only for lightweight preferences where appropriate.

Persist:

Settings
Templates
Reports
Drafts
Recent file metadata

Do not unnecessarily duplicate imported file contents.

---

# 53. DESTRUCTIVE ACTION SAFETY

Always confirm:

Delete template

Delete report

Clear all local data

Reset application

Never overwrite the user's original imported Excel/CSV file.

Exports should create new files.

---

# 54. HOME EXPERIENCE

The final Home page should approximately feel like:

Office Toolkit

Good morning, Mico.
What would you like to work on?

Quick Tools

[ Document Generator ]
Create letters, reports and certificates

[ Spreadsheet Tools ]
Clean • Merge • Filter • Convert

[ Report Builder ]
Generate recurring reports

[ Bulk Certificate Generator ]
Excel → Certificates → PDF


Recent Files

Activity_Report_August
Report
Today

MSME_Training_Attendance
Spreadsheet
Yesterday

The design should be extremely clean.

Do not clutter the home page with statistics that provide no useful value.

---

# 55. FUTURE TOOL ARCHITECTURE

Design navigation and routing so additional utilities can easily be added later.

Possible future modules:

PDF Tools

Image Compressor

File Renamer

Document Converter

QR Generator

Attendance Processor

Evaluation Summary Generator

Data Comparison Tool

Duplicate Finder

Email Draft Generator

Meeting Minutes Builder

Do NOT implement all of these now.

Just make the architecture modular enough that future tools can be added cleanly.

---

# 56. IMPORTANT UX PRINCIPLE

Optimize for:

FEWER CLICKS.

If a task can reasonably be completed in three steps, do not make it seven steps.

Do not require unnecessary forms.

Do not require users to save before previewing.

Do not ask for information that is not necessary.

Remember previous selections where useful.

---

# 57. IMPORTANT PRODUCT PRINCIPLE

Office Toolkit should NOT attempt to replace Microsoft Word or Microsoft Excel.

Instead:

Word/Excel = editing and general-purpose office applications.

Office Toolkit = automation layer for repetitive office workflows.

Focus on operations that normally require:

copy
paste
rename
filter
format
repeat

and turn those operations into:

import
configure
generate

---

# 58. IMPLEMENTATION PRIORITY

Do NOT attempt to build everything simultaneously.

PHASE 1 — FOUNDATION

Build:

Application shell
Sidebar
Routing
Theme system
Home page
Settings
IndexedDB storage
Recent files

Ensure navigation works.

---

PHASE 2 — SPREADSHEET TOOLS

Implement:

Import
Preview
Clean
Filter
Sort
Remove duplicates
Merge
Export

Make these fully functional.

---

PHASE 3 — DOCUMENT GENERATOR

Implement:

Templates
Form fields
Live preview
DOCX export
PDF export

---

PHASE 4 — REPORT BUILDER

Implement:

Report sections
Templates
Previous-report duplication
Preview
Export

---

PHASE 5 — CERTIFICATES

Implement:

Spreadsheet import
Column mapping
Certificate template
Preview
Bulk generation
PDF export

---

PHASE 6 — PRODUCTIVITY

Implement:

Command palette
Keyboard shortcuts
Autosave
Draft recovery
Global search
Smart suggestions

---

PHASE 7 — POLISH

Improve:

Spacing
Typography
Transitions
Loading states
Empty states
Error states
Accessibility
Performance

Do not prioritize animations before functionality.

---

# 59. DEVELOPMENT BEHAVIOR

When implementing:

Do not create placeholder functionality unless explicitly marked as future functionality.

Do not create buttons that do nothing.

Do not fake spreadsheet processing.

Do not fake document exports.

Do not fake PDF generation.

Do not fake progress indicators.

If a requested feature cannot reasonably be implemented using the chosen frontend architecture, explain the limitation and implement the closest reliable solution.

Fix TypeScript errors.

Fix runtime errors.

Ensure the application builds successfully.

Keep the console free from avoidable errors and warnings.

---

# 60. FINAL QUALITY TARGET

The finished application should feel like something a developer personally built because they were tired of repetitive office work.

It should be:

Fast

Minimal

Professional

Useful

Modular

Local-first

Internet-enhanced

Privacy-conscious

Easy to understand

Easy to extend

The user should be able to open Office Toolkit, drag in a spreadsheet or choose a document tool, complete a repetitive office task in a few clicks, export the result, and continue working.

Prioritize REAL FUNCTIONALITY over decorative UI.

Start by inspecting the existing project if one already exists.

Do not unnecessarily rewrite working code.

Then implement PHASE 1 first.

After PHASE 1 is stable, proceed sequentially through the remaining phases.

At the end of each phase:

1. Verify the application builds.
2. Check for TypeScript errors.
3. Test the primary workflow.
4. Fix broken functionality before moving forward.
5. Preserve previously working features.