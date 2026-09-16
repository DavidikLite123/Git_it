/** Безопасная работа с localStorage (приватный режим может его запрещать). */

const memory = new Map<string, string>()

function backend(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    const probe = '__gitit_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    }
  }
}

export const storage = {
  get(key: string): string | null {
    try {
      return backend().getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      backend().setItem(key, value)
    } catch {
      /* игнорируем переполнение хранилища */
    }
  },
  remove(key: string): void {
    try {
      backend().removeItem(key)
    } catch {
      /* игнорируем */
    }
  },
  getJSON<T>(key: string, fallback: T): T {
    const raw = storage.get(key)
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },
  setJSON(key: string, value: unknown): void {
    try {
      storage.set(key, JSON.stringify(value))
    } catch {
      /* игнорируем */
    }
  },
}

export const STORAGE_KEYS = {
  token: 'gitit.token',
  viewer: 'gitit.viewer',
  theme: 'gitit.theme',
  settings: 'gitit.settings',
} as const
