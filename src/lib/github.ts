/**
 * Клиент GitHub REST API (v3) — ровно те вызовы, которые нужны, чтобы
 * превратить набор файлов в один аккуратный коммит:
 *
 *   git/blobs   → содержимое файлов
 *   git/trees   → структура каталогов (батчами, до 1000 записей за запрос)
 *   git/commits → коммит
 *   git/refs    → привязка ветки
 *
 * Запросы идут напрямую из браузера: api.github.com отдаёт нужные CORS-заголовки
 * и для `Authorization: Bearer`, поэтому посредник-сервер не нужен — токен
 * уходит только на GitHub.
 */

import type { ProjectFile } from './project'
import { MAX_BLOB_SIZE } from './ignore'
import { gitBlobSha } from './gitblob'

export const API_BASE = 'https://api.github.com'
export const TREE_BATCH_SIZE = 1000
/** Сколько блобов заливаем параллельно: быстро, но без «флуда» в API. */
export const CONCURRENCY = 6

export interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
  html_url?: string
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  description: string | null
  default_branch: string
  pushed_at: string | null
  size?: number
  fork?: boolean
  owner: { login: string; type?: string }
  permissions?: { push?: boolean; admin?: boolean }
}

export interface GitHubOrg {
  login: string
  avatar_url: string
}

export interface GitHubBranch {
  name: string
  commit: { sha: string }
}

export interface TreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export type UploadPhase = 'prepare' | 'blobs' | 'trees' | 'commit' | 'ref'

export interface UploadProgress {
  phase: UploadPhase
  label: string
  /** сколько файлов уже обработано */
  done: number
  total: number
  /** сколько байт содержимого реально ушло на GitHub */
  bytesSent: number
  bytesTotal: number
  /** сколько байт не пришлось передавать повторно */
  bytesReused: number
  currentPath?: string
}

export interface Author {
  name: string
  email: string
}

export interface PublishResult {
  owner: string
  repo: string
  branch: string
  commitSha: string
  commitUrl: string
  repoUrl: string
  branchUrl: string
  uploadedCount: number
  reusedCount: number
  bytesSent: number
  bytesTotal: number
  elapsedMs: number
  /** Репозиторий был создан этой самой операцией */
  repoCreated?: boolean
}

export class GitHubError extends Error {
  readonly status: number
  readonly documentationUrl?: string
  readonly details?: string[]

  constructor(message: string, status: number, options: { documentationUrl?: string; details?: string[] } = {}) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
    this.documentationUrl = options.documentationUrl
    this.details = options.details
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  body?: unknown
  rawBody?: Uint8Array
  signal?: AbortSignal
}

const FRIENDLY_STATUS: Record<number, string> = {
  401: 'Токен недействителен или истёк. Создайте новый на github.com/settings/tokens.',
  403: 'GitHub отклонил запрос: не хватает прав у токена или исчерпан лимит запросов.',
  404: 'Не найдено — проверьте имя владельца и репозитория, а также права токена.',
  409: 'Ресурс уже существует или конфликтует с текущим состоянием.',
  422: 'GitHub отклонил данные: возможно, имя занято или нарушены правила.',
  451: 'Репозиторий заблокирован владельцем или организацией.',
  503: 'GitHub временно недоступен, повторите попытку через минуту.',
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Параллельная обработка списка с ограничением одновременных задач. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index]!, index)
    }
  })
  await Promise.all(runners)
  return results
}

export class GitHubClient {
  private readonly token: string

  constructor(token: string) {
    this.token = token.trim()
    if (!this.token) throw new GitHubError('Не задан токен доступа.', 400)
  }

  get maskedToken(): string {
    return this.token.length <= 8 ? '••••••' : `${this.token.slice(0, 4)}…${this.token.slice(-4)}`
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : (options.rawBody as BodyInit | undefined),
        signal: options.signal,
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      throw new GitHubError(
        'Не удалось связаться с GitHub. Проверьте интернет — возможно, api.github.com недоступен.',
        0,
      )
    }

    if (response.status === 204) return undefined as T

    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }

    if (!response.ok) throw this.toError(response, payload)
    return payload as T
  }

  private toError(response: Response, payload: unknown): GitHubError {
    const status = response.status
    const data = (payload ?? {}) as { message?: string; documentation_url?: string; errors?: unknown }

    if ((status === 403 || status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000
      const minutes = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60000)) : null
      return new GitHubError(
        `Исчерпан лимит обращений к GitHub API${minutes ? `. Повторите примерно через ${minutes} мин.` : '.'}`,
        status,
      )
    }

    const details: string[] = []
    if (Array.isArray(data.errors)) {
      for (const item of data.errors as Array<Record<string, unknown>>) {
        const field = typeof item.field === 'string' ? `${item.field}: ` : ''
        const message = typeof item.message === 'string' ? item.message : typeof item.code === 'string' ? item.code : ''
        if (message) details.push(`${field}${message}`)
      }
    }

    const base = FRIENDLY_STATUS[status] ?? `Ошибка GitHub (${status}).`
    const reason = data.message && data.message !== 'Not Found' ? ` ${data.message}` : ''
    const message = `${base}${reason}${details.length ? ` (${details.join('; ')})` : ''}`
    return new GitHubError(message, status, { documentationUrl: data.documentation_url, details })
  }

  /* ----------------------------- пользователь ----------------------------- */

  getUser(signal?: AbortSignal): Promise<GitHubUser> {
    return this.request<GitHubUser>('/user', { signal })
  }

  listOrgs(signal?: AbortSignal): Promise<GitHubOrg[]> {
    return this.request<GitHubOrg[]>('/user/orgs?per_page=100', { signal })
  }

  listRepos(page = 1, signal?: AbortSignal): Promise<GitHubRepo[]> {
    return this.request<GitHubRepo[]>(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      { signal },
    )
  }

  /** Все доступные репозитории (для поиска по имени в списке). */
  async listAllRepos(maxPages = 5, signal?: AbortSignal): Promise<GitHubRepo[]> {
    const all: GitHubRepo[] = []
    for (let page = 1; page <= maxPages; page++) {
      const chunk = await this.listRepos(page, signal)
      all.push(...chunk)
      if (chunk.length < 100) break
    }
    return all
  }

  getRepo(owner: string, repo: string, signal?: AbortSignal): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`, { signal })
  }

  listBranches(owner: string, repo: string, signal?: AbortSignal): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>(`/repos/${owner}/${repo}/branches?per_page=100`, { signal })
  }

  /* ------------------------------ репозитории ----------------------------- */

  createRepo(input: {
    name: string
    description?: string
    private: boolean
    org?: string | null
    autoInit?: boolean
    hasIssues?: boolean
    signal?: AbortSignal
  }): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(input.org ? `/orgs/${input.org}/repos` : '/user/repos', {
      method: 'POST',
      signal: input.signal,
      body: {
        name: input.name,
        description: input.description || undefined,
        private: input.private,
        auto_init: Boolean(input.autoInit),
        has_issues: input.hasIssues ?? true,
      },
    })
  }

  updateRepo(
    owner: string,
    repo: string,
    patch: { description?: string; private?: boolean; has_issues?: boolean },
    signal?: AbortSignal,
  ): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`, { method: 'PATCH', body: patch, signal })
  }

  /* --------------------------------- git ---------------------------------- */

  /** Файлы в ветке/коммите, рекурсивно. Без истории (ветки нет) вернёт пусто. */
  async getTree(owner: string, repo: string, treeish: string, signal?: AbortSignal): Promise<TreeEntry[]> {
    const result = await this.request<{ tree?: TreeEntry[] }>(
      `/repos/${owner}/${repo}/git/trees/${treeish}?recursive=1`,
      { signal },
    )
    return (result.tree ?? []).filter((entry) => entry.type === 'blob')
  }

  /** sha верхушки ветки или null, если ветки/истории ещё нет. */
  async getBranchHead(owner: string, repo: string, branch: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const ref = await this.request<{ object: { sha: string } }>(
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
        { signal },
      )
      return ref.object?.sha ?? null
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null
      throw error
    }
  }

  private createBlob(owner: string, repo: string, content: Uint8Array, signal?: AbortSignal): Promise<{ sha: string }> {
    return this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      rawBody: content,
      signal,
    })
  }

  private createTree(
    owner: string,
    repo: string,
    tree: Array<Record<string, unknown>>,
    baseTree: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ sha: string }> {
    return this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      signal,
      body: { tree, base_tree: baseTree },
    })
  }

  private createCommit(
    owner: string,
    repo: string,
    input: { message: string; tree: string; parents: string[]; author: Author },
    signal?: AbortSignal,
  ): Promise<{ sha: string }> {
    const who = { name: input.author.name, email: input.author.email, date: new Date().toISOString() }
    return this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      signal,
      body: { message: input.message, tree: input.tree, parents: input.parents, author: who, committer: who },
    })
  }

  private async updateRef(
    owner: string,
    repo: string,
    branch: string,
    sha: string,
    options: { create: boolean },
    signal?: AbortSignal,
  ): Promise<void> {
    if (options.create) {
      await this.request(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        signal,
        body: { ref: `refs/heads/${branch}`, sha },
      })
      return
    }
    await this.request(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      signal,
      body: { sha, force: false },
    })
  }

  /** Создать один файл через Contents API — нужен только для README-заглушки. */
  private async createInitialFile(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    content: string,
    message: string,
    author: Author,
    signal?: AbortSignal,
  ): Promise<string> {
    const result = await this.request<{ commit: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        signal,
        body: { message, content: toBase64(content), branch, author, committer: author },
      },
    )
    return result.commit.sha
  }

  /* ------------------------------ публикация ------------------------------ */

  /**
   * Главная операция: залить файлы проекта в репозиторий одним коммитом.
   * Файлы, которые уже лежат в репозитории с тем же содержимым, повторно не
   * передаются — прогресс «100%» на повторной загрузке почти мгновенный.
   */
  async publishProject(input: {
    owner: string
    repo: string
    /** Ветка; по умолчанию — ветка по умолчанию репозитория */
    branch?: string
    files: ProjectFile[]
    message: string
    author: Author
    /** Куда положить проект внутри репозитория (например `frontend`) */
    subdir?: string
    /** Сравнивать с уже загруженным (по умолчанию да) */
    skipUnchanged?: boolean
    onProgress?: (progress: UploadProgress) => void
    signal?: AbortSignal
  }): Promise<PublishResult> {
    const startedAt = Date.now()
    const { owner, repo, files, author, signal, onProgress } = input
    const skipUnchanged = input.skipUnchanged ?? true

    if (files.length === 0) throw new GitHubError('Нет файлов для загрузки.', 400)

    const tooBig = files.filter((file) => file.size > MAX_BLOB_SIZE)
    if (tooBig.length) {
      throw new GitHubError(
        `GitHub принимает файлы не больше 100 МБ. Слишком большие: ${tooBig
          .slice(0, 3)
          .map((file) => `${file.path} (${Math.round(file.size / 1024 / 1024)} МБ)`)
          .join(', ')}${tooBig.length > 3 ? ` и ещё ${tooBig.length - 3}` : ''}.`,
        413,
      )
    }

    const bytesTotal = files.reduce((sum, file) => sum + file.size, 0)
    const report = (progress: Partial<UploadProgress> & Pick<UploadProgress, 'phase' | 'label'>) =>
      onProgress?.({
        done: 0,
        total: files.length,
        bytesSent: 0,
        bytesTotal,
        bytesReused: 0,
        ...progress,
      })

    report({ phase: 'prepare', label: 'Проверяем репозиторий' })

    // 1. Проверяем доступ и права на запись.
    const repoInfo = await this.getRepo(owner, repo, signal)
    if (repoInfo.permissions && repoInfo.permissions.push === false) {
      throw new GitHubError(
        'У вашего токена нет прав на запись в этот репозиторий. Проверьте, что выбранный аккаунт — владелец или участник с правом push.',
        403,
      )
    }

    const branch = input.branch?.trim() || repoInfo.default_branch
    const parentCommit = await this.getBranchHead(owner, repo, branch, signal)

    // 2. Что уже есть в репозитории — чтобы не загружать то же самое повторно.
    report({ phase: 'prepare', label: parentCommit ? 'Сверяем файлы с репозиторием' : 'Готовим первый коммит' })
    const existingByPath = new Map<string, TreeEntry>()
    if (parentCommit && skipUnchanged) {
      try {
        for (const entry of await this.getTree(owner, repo, parentCommit, signal)) {
          existingByPath.set(entry.path, entry)
        }
      } catch {
        /* если дерево получить не удалось — просто загрузим всё заново */
      }
    }

    const prefix = input.subdir ? input.subdir.replace(/^\/+|\/+$/g, '') : ''
    const treePathOf = (path: string) => (prefix ? `${prefix}/${path}` : path)

    // 3. Блобы: читаем файлы порциями, чтобы не держать весь проект в памяти.
    const treeEntries: Array<Record<string, unknown>> = []
    let uploadedCount = 0
    let reusedCount = 0
    let bytesSent = 0
    let bytesReused = 0
    let processed = 0

    const CHUNK = 16
    for (let start = 0; start < files.length; start += CHUNK) {
      if (signal?.aborted) throw new DOMException('Загрузка отменена', 'AbortError')
      const chunk = files.slice(start, start + CHUNK)
      const toUpload: Array<{ file: ProjectFile; content: Uint8Array }> = []

      for (const file of chunk) {
        const content = await file.read()
        const target = treePathOf(file.path)
        const known = existingByPath.get(target)
        if (known && skipUnchanged && known.size === file.size) {
          const sha = await gitBlobSha(content)
          if (sha === known.sha) {
            reusedCount++
            bytesReused += file.size
            processed++
            report({
              phase: 'blobs',
              label: 'Проверяем содержимое',
              done: processed,
              bytesSent,
              bytesReused,
              currentPath: file.path,
            })
            continue
          }
        }
        toUpload.push({ file, content })
      }

      await mapLimit(toUpload, CONCURRENCY, async ({ file, content }) => {
        if (signal?.aborted) throw new DOMException('Загрузка отменена', 'AbortError')
        const { sha } = await this.createBlob(owner, repo, content, signal)
        treeEntries.push({ path: treePathOf(file.path), mode: '100644', type: 'blob', sha })
        uploadedCount++
        bytesSent += file.size
        processed++
        report({
          phase: 'blobs',
          label: 'Загружаем файлы',
          done: processed,
          bytesSent,
          bytesReused,
          currentPath: file.path,
        })
      })
    }

    if (treeEntries.length === 0 && !parentCommit) {
      throw new GitHubError('Нечего загружать: в проекте не осталось файлов.', 400)
    }

    // 4. Дерево — батчами по 1000 записей.
    const batches: Array<Array<Record<string, unknown>>> = []
    for (let index = 0; index < treeEntries.length; index += TREE_BATCH_SIZE) {
      batches.push(treeEntries.slice(index, index + TREE_BATCH_SIZE))
    }

    let baseTree = parentCommit ?? undefined
    if (batches.length === 0) {
      report({ phase: 'trees', label: 'Структура файлов уже актуальна', done: files.length, bytesSent, bytesReused })
    } else {
      for (let index = 0; index < batches.length; index++) {
        report({
          phase: 'trees',
          label: `Собираем структуру каталогов (${index + 1} из ${batches.length})`,
          done: processed,
          bytesSent,
          bytesReused,
        })
        const created = await this.createTree(owner, repo, batches[index]!, baseTree, signal)
        baseTree = created.sha
      }
    }

    if (!baseTree) throw new GitHubError('Не удалось построить дерево файлов.', 500)

    // 5. Коммит.
    report({ phase: 'commit', label: 'Создаём коммит', done: processed, bytesSent, bytesReused })
    const commit = await this.createCommit(
      owner,
      repo,
      { message: input.message, tree: baseTree, parents: parentCommit ? [parentCommit] : [], author },
      signal,
    )

    // 6. Переводим ветку на новый коммит.
    report({ phase: 'ref', label: 'Обновляем ветку', done: processed, bytesSent, bytesReused })
    await this.updateRef(owner, repo, branch, commit.sha, { create: !parentCommit }, signal)

    report({
      phase: 'ref',
      label: 'Готово',
      done: files.length,
      bytesSent,
      bytesReused,
    })

    const repoUrl = `https://github.com/${owner}/${repo}`
    return {
      owner,
      repo,
      branch,
      commitSha: commit.sha,
      commitUrl: `${repoUrl}/commit/${commit.sha}`,
      repoUrl,
      branchUrl: `${repoUrl}/tree/${encodeURIComponent(branch)}`,
      uploadedCount,
      reusedCount,
      bytesSent,
      bytesTotal,
      elapsedMs: Date.now() - startedAt,
    }
  }

  /** Создаёт репозиторий и сразу заливает проект одним коммитом. */
  async createRepoAndPublish(input: {
    name: string
    private: boolean
    description?: string
    org?: string | null
    owner: string
    files: ProjectFile[]
    message: string
    author: Author
    subdir?: string
    /** Сравнивать содержимое с уже загруженным (по умолчанию да) */
    skipUnchanged?: boolean
    onProgress?: (progress: UploadProgress) => void
    onRepoCreated?: (repo: GitHubRepo) => void
    signal?: AbortSignal
  }): Promise<PublishResult & { repoCreated: true }> {
    const repo = await this.createRepo({
      name: input.name,
      private: input.private,
      description: input.description,
      org: input.org,
      autoInit: false,
      signal: input.signal,
    })
    input.onRepoCreated?.(repo)

    const account = repo.owner?.login || input.owner
    const result = await this.publishProject({
      owner: account,
      repo: repo.name,
      branch: repo.default_branch || 'main',
      files: input.files,
      message: input.message,
      author: input.author,
      subdir: input.subdir,
      skipUnchanged: input.skipUnchanged,
      onProgress: input.onProgress,
      signal: input.signal,
    })
    return { ...result, repoCreated: true }
  }

  /** Заливает README-заглушку — способ «оживить» пустой репозиторий. */
  async seedReadme(input: {
    owner: string
    repo: string
    branch?: string
    title: string
    description?: string
    signal?: AbortSignal
  }): Promise<string> {
    const body = [`# ${input.title}`, '', input.description?.trim() || '', '', '_Залито через Git it._', ''].join('\n')
    return this.createInitialFile(
      input.owner,
      input.repo,
      input.branch?.trim() || 'main',
      'README.md',
      body,
      'docs: добавить README',
      { name: 'Git it', email: 'git-it@users.noreply.github.com' },
      input.signal,
    )
  }
}
