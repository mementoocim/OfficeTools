import type { RecentFile, SavedTemplate } from '../types'

const key = (name: string) => `office-toolkit:${name}`
const get = <T,>(name: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key(name)) || '') as T } catch { return fallback }
}
const set = <T,>(name: string, value: T) => localStorage.setItem(key(name), JSON.stringify(value))

export const storage = {
  recent: () => get<RecentFile[]>('recent', []),
  saveRecent: (item: RecentFile) => set('recent', [item, ...storage.recent().filter(x => x.id !== item.id)].slice(0, 20)),
  removeRecent: (id: string) => set('recent', storage.recent().filter(x => x.id !== id)),
  clearRecent: () => set('recent', []),
  templates: () => get<SavedTemplate[]>('templates', []),
  saveTemplate: (item: SavedTemplate) => set('templates', [item, ...storage.templates().filter(x => x.id !== item.id)]),
  deleteTemplate: (id: string) => set('templates', storage.templates().filter(x => x.id !== id)),
  settings: () => get('settings', { theme: 'system', rememberRecent: true, defaultExport: 'PDF' }),
  saveSettings: (value: Record<string, unknown>) => set('settings', value),
}
