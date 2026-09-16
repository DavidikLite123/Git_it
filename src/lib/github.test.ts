import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient, GitHubError } from './github'
import type { ProjectFile } from './project'
import { gitBlobSha } from './gitblob'

/* ------------------------- заглушка GitHub API ------------------------- */

interface Call {
  method: string
  path: string
  body: Record<string, unknown> | null
  bytes: number
}

const encoder = new TextEncoder()
let calls: Call[] = []
let counters = { blob: 0, tree: 0 }

function file(path: string, content: string): ProjectFile {
  const bytes = encoder.encode(content)
  return { path, size: bytes.length, read: async () => bytes }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  calls = []
  counters = { blob: 0, tree: 0 }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = (init.method ?? 'GET').toUpperCase()
    const rawBody = init.body
    const body =
      rawBody && typeof rawBody === 'string' ? (JSON.parse(rawBody) as Record<string, unknown>) : null
    calls.push({ method, path: url.pathname, body, bytes: rawBody instanceof Uint8Array ? rawBody.length : 0 })

    // ── репозиторий ──
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(url.pathname)) {
      return json({
        id: 1,
        name: 'demo',
        full_name: 'octocat/demo',
        private: true,
        html_url: 'https://github.com/octocat/demo',
        description: null,
        default_branch: 'main',
        pushed_at: null,
        owner: { login: 'octocat' },
        permissions: { push: true },
      })
    }
    if (method === 'GET' && url.pathname.endsWith('/git/ref/heads/main')) {
      return json({ message: 'Not Found' }, 404)
    }
    if (method === 'GET' && url.pathname.includes('/git/trees/')) {
      return json({
        tree: [
          { path: 'src/unchanged.ts', mode: '100644', type: 'blob', sha: await gitBlobSha(encoder.encode('одинаковый')), size: 18 },
        ],
      })
    }
    // ── запись ──
    if (method === 'POST' && url.pathname.endsWith('/git/blobs')) return json({ sha: `blob-${++counters.blob}` }, 201)
    if (method === 'POST' && url.pathname.endsWith('/git/trees')) return json({ sha: `tree-${++counters.tree}` }, 201)
    if (method === 'POST' && url.pathname.endsWith('/git/commits')) return json({ sha: 'commit-abc' }, 201)
    if (method === 'POST' && url.pathname.endsWith('/git/refs')) return json({ ref: 'refs/heads/main' }, 201)
    if (method === 'PATCH' && url.pathname.includes('/git/refs/heads/')) return json({ ref: 'refs/heads/main' })
    if (method === 'POST' && url.pathname === '/user/repos') {
      return json({
        id: 2,
        name: String((body?.name as string) ?? 'demo'),
        full_name: `octocat/${body?.name}`,
        private: Boolean(body?.private),
        html_url: 'https://github.com/octocat/demo',
        description: null,
        default_branch: 'main',
        pushed_at: null,
        owner: { login: 'octocat' },
      })
    }
    return json({ message: `Unhandled ${method} ${url.pathname}` }, 500)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const author = { name: 'Тест', email: 'test@example.com' }

/* --------------------------------- тесты -------------------------------- */

describe('GitHubClient.publishProject', () => {
  it('заливает файлы и создаёт первый коммит пустого репозитория', async () => {
    const client = new GitHubClient('ghp_test')
    const progressPhases: string[] = []

    const result = await client.publishProject({
      owner: 'octocat',
      repo: 'demo',
      files: [file('src/main.ts', 'console.log(1)'), file('README.md', '# demo')],
      message: 'Первый коммит',
      author,
      onProgress: ({ phase }) => progressPhases.push(phase),
    })

    const blobs = calls.filter((call) => call.path.endsWith('/git/blobs'))
    expect(blobs).toHaveLength(2)
    expect(blobs.every((call) => call.method === 'POST')).toBe(true)

    const trees = calls.filter((call) => call.path.endsWith('/git/trees'))
    expect(trees).toHaveLength(1)
    expect(trees[0]!.body!.base_tree).toBeUndefined()
    expect(trees[0]!.body!.tree).toEqual([
      { path: 'src/main.ts', mode: '100644', type: 'blob', sha: expect.any(String) },
      { path: 'README.md', mode: '100644', type: 'blob', sha: expect.any(String) },
    ])

    const commit = calls.find((call) => call.path.endsWith('/git/commits'))!
    expect(commit.body!.parents).toEqual([])
    expect(commit.body!.message).toBe('Первый коммит')

    const ref = calls.find((call) => call.path.endsWith('/git/refs'))!
    expect(ref.body).toEqual({ ref: 'refs/heads/main', sha: 'commit-abc' })

    expect(result).toMatchObject({
      commitSha: 'commit-abc',
      uploadedCount: 2,
      reusedCount: 0,
      repoUrl: 'https://github.com/octocat/demo',
      commitUrl: 'https://github.com/octocat/demo/commit/commit-abc',
    })
    expect(progressPhases).toContain('blobs')
    expect(progressPhases).toContain('trees')
  })

  it('кладет файлы в подпапку и добавляет её к путям', async () => {
    const client = new GitHubClient('ghp_test')
    await client.publishProject({
      owner: 'octocat',
      repo: 'demo',
      files: [file('index.ts', 'x')],
      message: 'm',
      author,
      subdir: 'frontend/',
    })

    const tree = calls.find((call) => call.path.endsWith('/git/trees'))!
    expect((tree.body!.tree as Array<{ path: string }>)[0]!.path).toBe('frontend/index.ts')
  })

  it('разбивает дерево на батчи по 1000 файлов', async () => {
    const client = new GitHubClient('ghp_test')
    const files = Array.from({ length: 1205 }, (_, index) => file(`src/generated/file-${index}.ts`, `// ${index}`))

    await client.publishProject({ owner: 'octocat', repo: 'demo', files, message: 'm', author })

    const trees = calls.filter((call) => call.path.endsWith('/git/trees'))
    expect(trees).toHaveLength(2)
    expect((trees[0]!.body!.tree as unknown[]).length).toBe(1000)
    expect((trees[1]!.body!.tree as unknown[]).length).toBe(205)
    // первый батч — от пустого репозитория, второй строится поверх первого
    expect(trees[0]!.body!.base_tree).toBeUndefined()
    expect(trees[1]!.body!.base_tree).toBe('tree-1')
  })

  it('предупреждает про файлы больше 100 МБ до начала загрузки', async () => {
    const client = new GitHubClient('ghp_test')
    const huge: ProjectFile = { path: 'huge.bin', size: 120 * 1024 * 1024, read: async () => new Uint8Array(0) }

    await expect(
      client.publishProject({ owner: 'octocat', repo: 'demo', files: [huge], message: 'm', author }),
    ).rejects.toThrow(/100 МБ/)
    expect(calls.filter((call) => call.path.endsWith('/git/blobs'))).toHaveLength(0)
  })
})

describe('GitHubClient.createRepoAndPublish', () => {
  it('создаёт репозиторий и сразу заливает туда проект', async () => {
    const client = new GitHubClient('ghp_test')
    const result = await client.createRepoAndPublish({
      name: 'my-app',
      private: true,
      owner: 'octocat',
      files: [file('index.html', '<html></html>')],
      message: 'init',
      author,
    })

    const create = calls.find((call) => call.path === '/user/repos')!
    expect(create.body).toMatchObject({ name: 'my-app', private: true, auto_init: false })
    expect(result.repoCreated).toBe(true)
    expect(result.uploadedCount).toBe(1)
  })

  it('создаёт репозиторий в организации, если выбран другой владелец', async () => {
    const client = new GitHubClient('ghp_test')
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input))
      calls.push({ method: (init.method ?? 'GET').toUpperCase(), path: url.pathname, body: null, bytes: 0 })
      if (url.pathname === '/orgs/acme/repos')
        return json({
          id: 3,
          name: 'shared',
          full_name: 'acme/shared',
          private: false,
          html_url: 'https://github.com/acme/shared',
          description: null,
          default_branch: 'main',
          pushed_at: null,
          owner: { login: 'acme' },
        })
      return json({ message: 'nope' }, 500)
    })

    await expect(
      client.createRepoAndPublish({
        name: 'shared',
        private: false,
        owner: 'octocat',
        org: 'acme',
        files: [file('a.txt', 'a')],
        message: 'm',
        author,
      }),
    ).rejects.toBeInstanceOf(GitHubError) // дальше по потоку ручка не подделана — это ожидаемо
    expect(calls[0]!.path).toBe('/orgs/acme/repos')
  })
})

describe('ошибки GitHub', () => {
  it('объясняет по-человечески недействительный токен', async () => {
    vi.stubGlobal('fetch', async () => json({ message: 'Bad credentials' }, 401))
    const client = new GitHubClient('ghp_bad')
    await expect(client.getUser()).rejects.toThrow(/Токен недействителен/)
  })

  it('сообщает про исчерпанный лимит запросов', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) },
        }),
    )
    const client = new GitHubClient('ghp_test')
    await expect(client.listRepos()).rejects.toThrow(/лимит обращений/)
  })

  it('падает с понятным текстом, если сети нет', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const client = new GitHubClient('ghp_test')
    await expect(client.getUser()).rejects.toThrow(/Не удалось связаться с GitHub/)
  })

  it('не даёт создать клиент без токена', () => {
    expect(() => new GitHubClient('  ')).toThrow(GitHubError)
  })

  it('показывает маскированный токен', () => {
    expect(new GitHubClient('ghp_1234567890').maskedToken).toBe('ghp_…7890')
  })
})

describe('getBranchHead', () => {
  it('возвращает null для пустого репозитория', async () => {
    const client = new GitHubClient('ghp_test')
    expect(await client.getBranchHead('octocat', 'demo', 'main')).toBeNull()
  })

  it('возвращает sha существующей ветки', async () => {
    vi.stubGlobal('fetch', async () => json({ object: { sha: 'head-sha' } }))
    const client = new GitHubClient('ghp_test')
    expect(await client.getBranchHead('octocat', 'demo', 'main')).toBe('head-sha')
  })
})
