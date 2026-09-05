import type { ArchivedItem, RecentFile, SavedTemplate } from '../types'

const key = (name: string) => `office-toolkit:${name}`
const get = <T,>(name: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key(name))
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const set = <T,>(name: string, value: T) => {
  try {
    localStorage.setItem(key(name), JSON.stringify(value))
  } catch (e) {
    console.warn('Storage quota exceeded or storage unavailable', e)
  }
}
const remove = (name: string) => localStorage.removeItem(key(name))

export const storage = {
  recent: () => get<RecentFile[]>('recent', []),
  saveRecent: (item: RecentFile) => set('recent', [item, ...storage.recent().filter(x => x.id !== item.id)].slice(0, 20)),
  removeRecent: (id: string) => set('recent', storage.recent().filter(x => x.id !== id)),
  clearRecent: () => set('recent', []),
  templates: () => get<SavedTemplate[]>('templates', []),
  saveTemplate: (item: SavedTemplate) => set('templates', [item, ...storage.templates().filter(x => x.id !== item.id)]),
  deleteTemplate: (id: string) => set('templates', storage.templates().filter(x => x.id !== id)),
  archives: () => get<ArchivedItem[]>('archives', []),
  saveArchive: (item: ArchivedItem) => set('archives', [item, ...storage.archives().filter(x => x.id !== item.id)]),
  deleteArchive: (id: string) => set('archives', storage.archives().filter(x => x.id !== id)),
  clearArchives: () => set('archives', []),
  getDraft: <T,>(tool: string, fallback: T): T => get<T>(`draft:${tool}`, fallback),
  saveDraft: <T,>(tool: string, data: T) => set(`draft:${tool}`, data),
  clearDraft: (tool: string) => remove(`draft:${tool}`),
  settings: () => get('settings', { theme: 'system', rememberRecent: true, defaultExport: 'PDF' }),
  saveSettings: (value: Record<string, unknown>) => set('settings', value),
}
