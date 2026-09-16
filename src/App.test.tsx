// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

/* jsdom не всегда отдаёт WebCrypto — для хешей git-объектов он нужен */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

interface RecordedCall {
  method: string
  path: string
  body: Record<string, unknown> | null
}

let calls: RecordedCall[] = []
let repoExists = false
let treeFiles: Array<Record<string, unknown>> = []

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function repoPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'demo',
    full_name: 'octocat/demo',
    private: true,
    html_url: 'https://github.com/octocat/demo',
    description: null,
    default_branch: 'main',
    pushed_at: '2026-01-01T00:00:00Z',
    size: 12,
    owner: { login: 'octocat' },
    permissions: { push: true },
    ...overrides,
  }
}

function installFetchMock() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    calls.push({ method, path: url.pathname + url.search, body })

    if (url.pathname === '/user') {
      return json({ id: 583231, login: 'octocat', name: 'Мона Октакат', avatar_url: 'https://avatars.github.com/u/1' })
    }
    if (url.pathname === '/user/orgs') return json([])
    if (url.pathname === '/user/repos') {
      if (method === 'POST') {
        const name = String(body?.name)
        return json(repoPayload({ name, full_name: `octocat/${name}` }), 201)
      }
      return json(repoExists ? [repoPayload()] : [])
    }

    // пути вида /repos/:owner/:repo/git/...
    const git = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/git\/(.+)$/)
    if (git) {
      const rest = git[1]!
      if (rest === 'blobs') return json({ sha: `blob-${calls.length}` }, 201)
      if (rest === 'trees') return json({ sha: 'tree-1' }, 201)
      if (rest.startsWith('trees/')) return json({ tree: treeFiles })
      if (rest === 'commits') return json({ sha: 'commit-sha' }, 201)
      if (rest === 'refs') return json({ ref: 'refs/heads/main' }, 201)
      if (rest.startsWith('refs/heads/')) return json({ ref: 'refs/heads/main' })
      if (rest.startsWith('ref/heads/')) {
        return repoExists ? json({ object: { sha: 'head-sha' } }) : json({ message: 'Not Found' }, 404)
      }
    }

    if (/^\/repos\/[^/]+\/[^/]+\/branches$/.test(url.pathname)) {
      return json([{ name: 'main', commit: { sha: 'head-sha' } }])
    }
    if (/^\/repos\/[^/]+\/[^/]+$/.test(url.pathname)) return json(repoPayload())

    return json({ message: `Unhandled ${method} ${url.pathname}` }, 500)
  })
}

function fileOf(path: string, content: string): File {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const file = new File([content], name, { type: 'text/plain' })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

async function signIn() {
  const input = document.getElementById('token')!
  fireEvent.change(input, { target: { value: 'ghp_test_token' } })
  fireEvent.click(screen.getByRole('button', { name: /Войти в GitHub/i }))
  await waitFor(() => expect(screen.getByText('@octocat')).toBeTruthy())
}

function importFolder(files: File[]) {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
  const folderInput = inputs[0]!
  Object.defineProperty(folderInput, 'files', { value: files, configurable: true })
  fireEvent.change(folderInput)
}

beforeEach(() => {
  calls = []
  repoExists = false
  treeFiles = []
  localStorage.clear()
  installFetchMock()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Git it — полный сценарий', () => {
  it('подключается к GitHub, читает папку и заливает проект в новый репозиторий', async () => {
    render(<App />)

    // Шаг 1 — подключение
    expect(screen.getByText(/Подключите GitHub/i)).toBeTruthy()
    await signIn()

    // Шаг 2 — импорт папки
    expect(screen.getByText(/Перетащите папку с проектом/i)).toBeTruthy()
    importFolder([
      fileOf('my-app/package.json', '{"name":"my-app"}'),
      fileOf('my-app/src/index.ts', 'console.log("привет")'),
      fileOf('my-app/node_modules/react/index.js', '// мусор'),
      fileOf('my-app/.git/config', '[core]'),
      fileOf('my-app/dist/bundle.js', '// старая сборка'),
    ])

    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

    // корневая папка срезана, служебные файлы помечены как исключённые
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(screen.getByText('package.json')).toBeTruthy()
    const summary = document.querySelector('.file-card .card-head p')!.textContent!
    expect(summary).toContain('исключено служебных: 2')
    const dirRows = [...document.querySelectorAll('.tree-row.is-dir')]
    for (const name of ['node_modules', 'dist']) {
      const row = dirRows.find((item) => item.textContent?.includes(name))!
      expect(row.textContent).toContain('исключён')
    }

    // имя репозитория подставилось из папки
    const nameInput = document.getElementById('repo-name') as HTMLInputElement
    expect(nameInput.value).toBe('my-app')

    // Шаг 4 — публикация
    fireEvent.click(screen.getByRole('button', { name: /Загрузить в GitHub/i }))
    await screen.findByRole('link', { name: /Открыть репозиторий/i }, { timeout: 8000 })

    const created = calls.find((call) => call.method === 'POST' && call.path === '/user/repos')!
    expect(created.body).toMatchObject({ name: 'my-app', private: true, auto_init: false })

    // два файла проекта + сгенерированные .gitignore и README.md, без node_modules и dist
    const blobs = calls.filter((call) => call.path.endsWith('/git/blobs'))
    expect(blobs).toHaveLength(4)

    const tree = calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))!
    const treePaths = (tree.body!.tree as Array<{ path: string }>).map((item) => item.path).sort()
    expect(treePaths).toEqual(['.gitignore', 'README.md', 'package.json', 'src/index.ts'])
    expect(treePaths.join(' ')).not.toContain('node_modules')

    const commit = calls.find((call) => call.path.endsWith('/git/commits'))!
    expect(commit.body!.parents).toEqual([])

    // ссылка на репозиторий появилась, локальные файлы не тронуты
    expect(screen.getByRole('link', { name: /Открыть репозиторий/i }).getAttribute('href')).toBe(
      'https://github.com/octocat/my-app',
    )
  })

  it('показывает прогресс и понятную ошибку, если GitHub отказал в правах', async () => {
    render(<App />)
    await signIn()

    importFolder([fileOf('demo/index.html', '<h1>привет</h1>')])
    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

    // ломаем создание репозитория: не хватает прав
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input))
      if (url.pathname === '/user') {
        return json({ id: 1, login: 'octocat', name: null, avatar_url: 'https://avatars.github.com/u/1' })
      }
      if (url.pathname === '/user/repos' && init.method === 'POST') return json({ message: 'Forbidden' }, 403)
      if (url.pathname === '/user/repos') return json([])
      if (url.pathname === '/user/orgs') return json([])
      return json({ message: 'Unhandled' }, 500)
    })

    fireEvent.click(screen.getByRole('button', { name: /Загрузить в GitHub/i }))

    await waitFor(() => expect(screen.getByText(/Не получилось/i)).toBeTruthy())
    expect(screen.getByText(/не хватает прав у токена/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Попробовать снова/i })).toBeTruthy()
  })

  it('работает с существующим репозиторием и добавляет файлы в выбранную ветку', async () => {
    repoExists = true
    treeFiles = [
      // файл с тем же содержимым, что и локальный: повторно отправляться не должен
      {
        path: 'src/main.ts',
        mode: '100644',
        type: 'blob',
        sha: await (async () => {
          const { gitBlobSha } = await import('./lib/gitblob')
          return gitBlobSha(new TextEncoder().encode('console.log(1)'))
        })(),
        size: 14,
      },
    ]

    render(<App />)
    await signIn()

    importFolder([fileOf('demo/src/main.ts', 'console.log(1)'), fileOf('demo/src/extra.ts', 'console.log(2)')])
    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

    fireEvent.click(screen.getByRole('tab', { name: /Существующий/i }))
    const list = () => document.querySelector('.repo-list')!
    await waitFor(() => expect(list().textContent).toContain('demo'))
    fireEvent.click(within(list() as HTMLElement).getByRole('button', { name: /octocat/ }))

    await waitFor(() => expect(screen.getByText(/по умолчанию/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Загрузить в GitHub/i }))
    await screen.findByRole('link', { name: /Открыть репозиторий/i }, { timeout: 8000 })

    // неизменившийся файл не перезаливали: в дереве только новинки и сгенерированные файлы
    const tree = calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))!
    expect((tree.body!.tree as Array<{ path: string }>).map((item) => item.path).sort()).toEqual([
      '.gitignore',
      'README.md',
      'src/extra.ts',
    ])
    expect((tree.body!.base_tree as string)).toBe('head-sha')
    expect(document.body.textContent).toContain('Не пришлось передавать')

    const commit = calls.find((call) => call.path.endsWith('/git/commits'))!
    expect(commit.body!.parents).toEqual(['head-sha'])

    const ref = calls.find((call) => call.path === '/repos/octocat/demo/git/refs/heads/main')!
    expect(ref.method).toBe('PATCH')
    expect(ref.body).toMatchObject({ sha: 'commit-sha' })
  })
})
