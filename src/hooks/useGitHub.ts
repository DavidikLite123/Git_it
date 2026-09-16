import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitHubClient, GitHubError } from '../lib/github'
import type { GitHubOrg, GitHubRepo, GitHubUser } from '../lib/github'
import { STORAGE_KEYS, storage } from '../lib/storage'

export type AuthStatus = 'idle' | 'checking' | 'ready' | 'error'

interface UseGitHub {
  token: string
  client: GitHubClient | null
  user: GitHubUser | null
  orgs: GitHubOrg[]
  repos: GitHubRepo[]
  status: AuthStatus
  error: string | null
  loadingRepos: boolean
  signIn: (token: string) => Promise<void>
  signOut: () => void
  refresh: () => Promise<void>
}

/** Состояние авторизации: токен живёт в localStorage, проверяется на старте. */
export function useGitHub(): UseGitHub {
  const [token, setToken] = useState(() => storage.get(STORAGE_KEYS.token) ?? '')
  const [user, setUser] = useState<GitHubUser | null>(() => storage.getJSON<GitHubUser | null>(STORAGE_KEYS.viewer, null))
  const [orgs, setOrgs] = useState<GitHubOrg[]>([])
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [status, setStatus] = useState<AuthStatus>(() =>
    (storage.get(STORAGE_KEYS.token) ?? '') ? 'checking' : 'idle',
  )
  const [error, setError] = useState<string | null>(null)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const client = useMemo(() => (token ? new GitHubClient(token) : null), [token])

  const loadAccountData = useCallback(
    async (active: GitHubClient, signal?: AbortSignal) => {
      const viewer = await active.getUser(signal)
      setUser(viewer)
      storage.setJSON(STORAGE_KEYS.viewer, viewer)

      setLoadingRepos(true)
      try {
        const [repoList, orgList] = await Promise.all([
          active.listAllRepos(4, signal),
          active.listOrgs(signal).catch(() => [] as GitHubOrg[]),
        ])
        setRepos(repoList)
        setOrgs(orgList)
      } finally {
        setLoadingRepos(false)
      }
    },
    [],
  )

  // Проверка сохранённого токена при запуске.
  useEffect(() => {
    const saved = storage.get(STORAGE_KEYS.token)
    if (!saved) {
      setStatus('idle')
      return
    }
    const active = new GitHubClient(saved)
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setStatus('checking')
    loadAccountData(active, controller.signal)
      .then(() => setStatus('ready'))
      .catch((cause: unknown) => {
        if ((cause as Error).name === 'AbortError') return
        setStatus('error')
        setError(cause instanceof Error ? cause.message : 'Не удалось проверить токен.')
        if (cause instanceof GitHubError && cause.status === 401) {
          storage.remove(STORAGE_KEYS.token)
          setToken('')
          setUser(null)
        }
      })
    return () => controller.abort()
  }, [loadAccountData])

  const signIn = useCallback(
    async (rawToken: string) => {
      const value = rawToken.trim()
      if (!value) {
        setError('Вставьте токен доступа.')
        setStatus('error')
        return
      }
      const active = new GitHubClient(value)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setStatus('checking')
      setError(null)
      try {
        await loadAccountData(active, controller.signal)
        storage.set(STORAGE_KEYS.token, value)
        setToken(value)
        setStatus('ready')
      } catch (cause) {
        if ((cause as Error).name === 'AbortError') return
        setStatus('error')
        setError(cause instanceof Error ? cause.message : 'Не удалось подключиться к GitHub.')
        throw cause
      }
    },
    [loadAccountData],
  )

  const signOut = useCallback(() => {
    abortRef.current?.abort()
    storage.remove(STORAGE_KEYS.token)
    storage.remove(STORAGE_KEYS.viewer)
    setToken('')
    setUser(null)
    setRepos([])
    setOrgs([])
    setStatus('idle')
    setError(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!client) return
    await loadAccountData(client).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить список репозиториев.')
    })
  }, [client, loadAccountData])

  return { token, client, user, orgs, repos, status, error, loadingRepos, signIn, signOut, refresh }
}
