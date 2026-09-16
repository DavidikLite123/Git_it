// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { AGREEMENT_VERSION, agreementAsMarkdown } from './lib/agreement'

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
let counters = { blob: 0, tree: 0, commit: 0 }

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

    const git = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/git\/(.+)$/)
    if (git) {
      const rest = git[1]!
      if (rest === 'blobs') return json({ sha: `blob-${++counters.blob}` }, 201)
      if (rest === 'trees') return json({ sha: `tree-${++counters.tree}` }, 201)
      if (rest.startsWith('trees/')) return json({ tree: treeFiles })
      if (rest === 'commits') return json({ sha: `commit-${++counters.commit}` }, 201)
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

/** Файл «на 120 МБ»: размер подменяем, чтобы не занимать память в тесте. */
function hugeFileOf(path: string, size = 120 * 1024 * 1024): File {
  const file = fileOf(path, 'начало большого файла')
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/** Отметка о принятом соглашении — как будто пользователь уже прочитал его. */
function seedAcceptance() {
  localStorage.setItem(
    'gitit.agreement',
    JSON.stringify({ version: AGREEMENT_VERSION, acceptedAt: '2026-09-16T10:00:00.000Z' }),
  )
}

/** Кнопка «Начать» на приветственном экране — обязательный вход в приложение. */
function enterApp() {
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
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
  counters = { blob: 0, tree: 0, commit: 0 }
  localStorage.clear()
  installFetchMock()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('первый запуск: приветствие и соглашение', () => {
  it('показывает экран «о проекте» и не пускает дальше без согласия', () => {
    render(<App />)

    // заставка: что делает проект и как это работает
    expect(screen.getByText(/Перетащите папку с проектом/i)).toBeTruthy()
    expect(screen.getByText('Как это работает')).toBeTruthy()
    expect(screen.getByText('Поехали?')).toBeTruthy()
    // без согласия формы токена нет
    expect(document.getElementById('token')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))

    // экран соглашения: текст целиком внутри страницы, а не ссылкой наружу
    expect(screen.getByRole('region', { name: /Текст лицензионного соглашения/i })).toBeTruthy()
    expect(document.body.textContent).toContain('Ограничение ответственности')
    expect(document.body.textContent).toContain('Лицензия MIT и что она значит')
    // согласие нельзя проставить, просто нажав кнопку: она заблокирована до конца текста
    const acceptButton = screen.getByRole('button', { name: /Принимаю соглашение|Сначала дочитайте/i }) as HTMLButtonElement
    expect(acceptButton.disabled || acceptButton.textContent?.includes('дочитайте')).toBeTruthy()
  })

  it('после дочитывания сохраняет отметку о согласии и открывает приложение', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))

    const box = screen.getByRole('region', { name: /Текст лицензионного соглашения/i })
    // jsdom не считает layout: подменяем метрики так, как их увидел бы настоящий браузер
    Object.defineProperty(box, 'scrollHeight', { value: 4000, configurable: true })
    Object.defineProperty(box, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(box, 'scrollTop', { value: 0, configurable: true })
    fireEvent.scroll(box)
    expect((screen.getByRole('button', { name: /Сначала дочитайте/i }) as HTMLButtonElement).disabled).toBe(true)

    // доскроллили до конца — теперь можно согласиться
    Object.defineProperty(box, 'scrollTop', { value: 3600, configurable: true })
    fireEvent.scroll(box)

    const acceptButton = await screen.findByRole('button', { name: 'Принимаю соглашение' })
    fireEvent.click(acceptButton)

    // открылся основной сценарий, отметка о согласии сохранена
    await waitFor(() => expect(document.getElementById('token')).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem('gitit.agreement')!)
    expect(saved.version).toBe(AGREEMENT_VERSION)
    expect(typeof saved.acceptedAt).toBe('string')
  })

  it('при уже принятом соглашении приветствие показывается, а «Начать» сразу открывает приложение', () => {
    seedAcceptance()
    render(<App />)

    // экран «о проекте» показывается при каждом заходе
    expect(screen.getByText('Как это работает')).toBeTruthy()
    expect(screen.getByText(/Соглашение версии .* принято/)).toBeTruthy()
    expect(document.getElementById('token')).toBeNull()

    enterApp()
    expect(document.getElementById('token')).toBeTruthy()
    expect(screen.getByText(/Подключите GitHub/i)).toBeTruthy()
  })

  it('в приложении видна ссылка на соглашение с датой принятия', () => {
    seedAcceptance()
    render(<App />)
    enterApp()
    const link = screen.getByRole('button', { name: /Лицензионное соглашение/i })
    expect(link.textContent).toContain(AGREEMENT_VERSION)
    expect(document.body.textContent).toContain('принято')
  })

  it('текст соглашения в приложении и в AGREEMENT.md совпадает по смыслу', () => {
    const markdown = agreementAsMarkdown()
    expect(markdown).toContain('## 8. Ограничение ответственности')
    expect(markdown).toContain('100 МБ')
    // в тексте соглашения есть пункт про принятие и версию
    expect(markdown).toContain(`Версия ${AGREEMENT_VERSION}`)
  })
})

describe('Git it — полный сценарий', () => {
  beforeEach(seedAcceptance)

  it('подключается к GitHub, читает папку и заливает проект в новый репозиторий', async () => {
    render(<App />)
    enterApp()

    expect(screen.getByText(/Подключите GitHub/i)).toBeTruthy()
    await signIn()

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

    const nameInput = document.getElementById('repo-name') as HTMLInputElement
    expect(nameInput.value).toBe('my-app')

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

    expect(screen.getByRole('link', { name: /Открыть репозиторий/i }).getAttribute('href')).toBe(
      'https://github.com/octocat/my-app',
    )
  })

  it('показывает прогресс и понятную ошибку, если GitHub отказал в правах', async () => {
    render(<App />)
    enterApp()
    await signIn()

    importFolder([fileOf('demo/index.html', '<h1>привет</h1>')])
    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

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
    enterApp()
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
    expect(tree.body!.base_tree as string).toBe('head-sha')
    expect(document.body.textContent).toContain('Не пришлось передавать')
  })
})

describe('выгрузка частями и большие файлы', () => {
  beforeEach(seedAcceptance)

  it('заливает проект несколькими коммитами, когда файлов больше лимита пачки', async () => {
    render(<App />)
    enterApp()
    await signIn()

    importFolder(
      Array.from({ length: 5 }, (_, index) => fileOf(`big-project/src/file-${index}.ts`, `// файл ${index}`)),
    )
    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

    // включаем выгрузку частями и уменьшаем пачку до двух файлов
    fireEvent.click(screen.getByRole('button', { name: /Дополнительные настройки/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Всегда частями' }))
    const limitInput = document.getElementById('file-limit') as HTMLInputElement
    fireEvent.change(limitInput, { target: { value: '2' } })

    expect(document.body.textContent).toMatch(/Выгрузка в \d+ коммит/)

    fireEvent.click(screen.getByRole('button', { name: /Загрузить в GitHub/i }))
    await screen.findByRole('link', { name: /Открыть репозиторий/i }, { timeout: 8000 })

    const commits = calls.filter((call) => call.method === 'POST' && call.path.endsWith('/git/commits'))
    expect(commits.length).toBeGreaterThan(1)
    // сообщения коммитов пронумерованы, чтобы части было видно в истории
    expect(commits.map((call) => call.body!.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('часть 1 из'), expect.stringContaining('часть 2 из')]),
    )
    // каждый следующий коммит продолжает предыдущий
    expect((commits[1]!.body!.parents as string[])[0]).toBe('commit-1')
    expect(document.body.textContent).toContain('Коммитов создано')
  })

  it('файлы больше 100 МБ не ломают выгрузку: их пропускают с отчётом', async () => {
    render(<App />)
    enterApp()
    await signIn()

    importFolder([
      fileOf('demo/src/small.ts', 'console.log(1)'),
      hugeFileOf('demo/video/master.mov', 320 * 1024 * 1024),
      hugeFileOf('demo/data/dump.sql', 150 * 1024 * 1024),
    ])
    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

    // предупреждение видно ещё до отправки
    expect(document.body.textContent).toContain('не больше 100 МБ')
    expect(document.body.textContent).toContain('Как всё-таки выгрузить файлы больше 100 МБ')

    fireEvent.click(screen.getByRole('button', { name: /Загрузить в GitHub/i }))
    await screen.findByRole('link', { name: /Открыть репозиторий/i }, { timeout: 8000 })

    // большой файл не читаем и в GitHub не отправляем
    const blobs = calls.filter((call) => call.path.endsWith('/git/blobs'))
    const tree = calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))!
    const treePaths = (tree.body!.tree as Array<{ path: string }>).map((item) => item.path)
    expect(treePaths).not.toContain('video/master.mov')
    expect(treePaths).toContain('src/small.ts')
    expect(blobs.length).toBeGreaterThan(0)

    // и на экране результата честно сказано, что именно не уехало
    expect(document.body.textContent).toContain('не выгружено')
    expect(document.body.textContent).toContain('video/master.mov')
  })

  it('с выключенным пропуском останавливает выгрузку и объясняет причину', async () => {
    render(<App />)
    enterApp()
    await signIn()

    importFolder([fileOf('demo/ok.ts', 'ok'), hugeFileOf('demo/huge.bin', 200 * 1024 * 1024)])
    await waitFor(() => expect(screen.getByText('Файлы проекта')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Остановить загрузку с ошибкой/i }))
    fireEvent.click(screen.getByRole('button', { name: /Загрузить в GitHub/i }))

    await waitFor(() => expect(screen.getByText(/Не получилось/i)).toBeTruthy())
    expect(document.body.textContent).toContain('100 МБ')
    expect(calls.filter((call) => call.path.endsWith('/git/blobs'))).toHaveLength(0)
  })
})
