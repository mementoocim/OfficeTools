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

export interface StoredDraft<T = unknown> {
  savedAt: string
  timestamp: number
  title?: string
  data: T
}

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
  getDraft: <T,>(tool: string, fallback: T): T => {
    const stored = get<StoredDraft<T> | T | null>(`draft:${tool}`, null)
    if (!stored) return fallback
    if (typeof stored === 'object' && stored !== null && 'data' in stored && 'timestamp' in stored) {
      return (stored as StoredDraft<T>).data
    }
    return stored as T
  },
  getDraftSnapshot: <T,>(tool: string): StoredDraft<T> | null => {
    const stored = get<StoredDraft<T> | T | null>(`draft:${tool}`, null)
    if (!stored) return null
    if (typeof stored === 'object' && stored !== null && 'data' in stored && 'timestamp' in stored) {
      return stored as StoredDraft<T>
    }
    return {
      savedAt: 'recently',
      timestamp: Date.now(),
      data: stored as T
    }
  },
  saveDraft: <T,>(tool: string, data: T, title?: string): string => {
    const formatted = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    const snapshot: StoredDraft<T> = {
      savedAt: formatted,
      timestamp: Date.now(),
      title,
      data
    }
    set(`draft:${tool}`, snapshot)
    return formatted
  },
  clearDraft: (tool: string) => remove(`draft:${tool}`),
  settings: () => get('settings', { theme: 'system', rememberRecent: true, defaultExport: 'PDF' }),
  saveSettings: (value: Record<string, unknown>) => set('settings', value),
  clearAllData: () => {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('office-toolkit:') || k.startsWith('office_toolkit_'))) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch (e) {
      console.warn('Failed to clear all data from localStorage', e)
    }
  }
}
