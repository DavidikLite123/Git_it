import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PublishResult, UploadProgress } from '../lib/github'
import { STORAGE_KEYS, storage } from '../lib/storage'

export type PublishStatus = 'idle' | 'running' | 'done' | 'error' | 'canceled'

export interface PublishState {
  status: PublishStatus
  progress: UploadProgress | null
  result: PublishResult | null
  error: string | null
  startedAt: number
}

const INITIAL: PublishState = { status: 'idle', progress: null, result: null, error: null, startedAt: 0 }

/** Прогоняет одну «публикацию» и следит за её прогрессом и отменой. */
export function usePublish() {
  const [state, setState] = useState<PublishState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const lastUpdateRef = useRef(0)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(INITIAL)
  }, [])

  const run = useCallback(
    async (task: (context: { onProgress: (progress: UploadProgress) => void; signal: AbortSignal }) => Promise<PublishResult>) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ status: 'running', progress: null, result: null, error: null, startedAt: Date.now() })

      const onProgress = (progress: UploadProgress) => {
        // троттлинг: при 20 000 файлов перерисовывать на каждый — дорого
        const now = performance.now()
        if (now - lastUpdateRef.current < 80 && progress.phase !== 'ref') return
        lastUpdateRef.current = now
        setState((prev) => (prev.status === 'running' ? { ...prev, progress } : prev))
      }

      try {
        const result = await task({ onProgress, signal: controller.signal })
        setState((prev) => ({ ...prev, status: 'done', result }))
        return result
      } catch (cause) {
        if ((cause as Error)?.name === 'AbortError') {
          setState((prev) => ({ ...prev, status: 'canceled', error: 'Загрузка отменена.' }))
          return null
        }
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: cause instanceof Error ? cause.message : 'Что-то пошло не так.',
        }))
        return null
      } finally {
        abortRef.current = null
      }
    },
    [],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  return { ...state, run, cancel, reset }
}

export interface Settings {
  /** Использовать правило «не заливать лишнее» */
  useDefaultIgnore: boolean
  /** Дополнительные шаблоны .gitignore */
  extraIgnore: string
  /** Проверять уже загруженные файлы и не передавать их повторно */
  skipUnchanged: boolean
  /** Куда положить проект внутри репозитория */
  subdir: string
  /** Добавить README, если его нет */
  addReadme: boolean
  /** Создать .gitignore, если его нет */
  addGitignore: boolean
  commitMessage: string
  authorName: string
  authorEmail: string
}

const DEFAULT_SETTINGS: Settings = {
  useDefaultIgnore: true,
  extraIgnore: '',
  skipUnchanged: true,
  subdir: '',
  addReadme: true,
  addGitignore: true,
  commitMessage: '',
  authorName: '',
  authorEmail: '',
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...storage.getJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
  }))

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      const { commitMessage, ...persisted } = next
      void commitMessage
      storage.setJSON(STORAGE_KEYS.settings, persisted)
      return next
    })
  }, [])

  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), [])

  return useMemo(() => ({ settings, update, reset }), [settings, update, reset])
}

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    storage.set(STORAGE_KEYS.theme, theme)
  }, [theme])

  const toggle = useCallback(() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
