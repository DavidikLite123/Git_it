import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthPanel } from './components/AuthPanel'
import { DropZone } from './components/DropZone'
import { FileTree } from './components/FileTree'
import { PublishPanel } from './components/PublishPanel'
import { ProgressPanel } from './components/ProgressPanel'
import { RepoPicker, type NewRepoDraft, type RepoMode } from './components/RepoPicker'
import { Stepper } from './components/Stepper'
import { Alert, Check, GitHubMark, Info, Logo, Moon, Refresh, Sun, Trash } from './components/Icons'
import { useGitHub } from './hooks/useGitHub'
import { usePublish, useSettings, useTheme } from './hooks/usePublish'
import type { GitHubRepo, PublishResult } from './lib/github'
import { DEFAULT_IGNORE_PATTERNS, compileIgnore } from './lib/ignore'
import {
  buildProject,
  projectFromZip,
  sanitizeRepoName,
  scanEntries,
  scanFileList,
  type Project,
  type ProjectFile,
  type ProjectSource,
} from './lib/project'
import { ZipError } from './lib/zip'
import { formatBytes, formatFiles, formatNumber } from './lib/format'

const STEPS = ['GitHub', 'Проект', 'Репозиторий', 'Отправка']
const encoder = new TextEncoder()

interface ScanResult {
  files: ProjectFile[]
  truncated: boolean
  rootFolder: string | null
  warnings?: string[]
}

export default function App() {
  const { theme, toggle } = useTheme()
  const github = useGitHub()
  const { settings, update } = useSettings()
  const publish = usePublish()

  const [project, setProject] = useState<Project | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [included, setIncluded] = useState<Set<string>>(new Set())

  const [mode, setMode] = useState<RepoMode>('new')
  const [draft, setDraft] = useState<NewRepoDraft>({ name: '', owner: '', private: true, description: '' })
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [branch, setBranch] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(false)

  const scanAbort = useRef<AbortController | null>(null)
  const lastProgressAt = useRef(0)

  /* ------------------------------ подключение ----------------------------- */

  useEffect(() => {
    if (github.user && !draft.owner) setDraft((prev) => ({ ...prev, owner: github.user!.login }))
  }, [github.user, draft.owner])

  /* -------------------------------- импорт -------------------------------- */

  const reportScan = useCallback((files: number, bytes: number) => {
    const now = performance.now()
    if (now - lastProgressAt.current < 120) return
    lastProgressAt.current = now
    setImportProgress(`найдено ${formatNumber(files)} · ${formatBytes(bytes)}`)
  }, [])

  const applyImport = useCallback(
    (result: ScanResult, source: ProjectSource, name: string) => {
      const built = buildProject(result.files, {
        source,
        name,
        stripRoot: true,
        rootFolder: result.rootFolder,
        truncated: result.truncated,
        warnings: result.warnings,
      })
      if (built.files.length === 0) {
        setImportError('В проекте не нашлось файлов. Проверьте, что выбрана папка с кодом, а не пустой каталог.')
        return
      }
      setProject(built)
      setImportError(null)
      setExcluded(new Set())
      setIncluded(new Set())
      setDraft((prev) => ({ ...prev, name: built.name, owner: prev.owner || github.user?.login || '' }))
      setSelectedRepo(null)
      setBranches([])
      setBranch('')
    },
    [github.user],
  )

  const runScan = useCallback(
    async (task: (signal: AbortSignal) => Promise<ScanResult>, source: ProjectSource, name: string) => {
      scanAbort.current?.abort()
      const controller = new AbortController()
      scanAbort.current = controller
      setImportBusy(true)
      setImportError(null)
      setImportProgress('сканируем файлы…')
      try {
        const result = await task(controller.signal)
        if (!controller.signal.aborted) applyImport(result, source, name)
      } catch (cause) {
        if ((cause as Error).name === 'AbortError') return
        setImportError(
          cause instanceof ZipError
            ? cause.message
            : `Не удалось прочитать проект: ${cause instanceof Error ? cause.message : 'неизвестная ошибка'}`,
        )
      } finally {
        if (scanAbort.current === controller) scanAbort.current = null
        setImportBusy(false)
        setImportProgress(null)
      }
    },
    [applyImport],
  )

  const handleDropEntries = useCallback(
    (entries: FileSystemEntry[], kind: 'folder' | 'zip' | 'files') => {
      const single = entries.length === 1 ? entries[0]! : null
      if (kind === 'zip' && single && single.isFile) {
        void runScan(async () => {
          const file = await new Promise<File>((resolve, reject) => (single as FileSystemFileEntry).file(resolve, reject))
          return projectFromZip(file, ({ files, bytes }) => reportScan(files, bytes))
        }, 'zip', single.name)
        return
      }
      void runScan(
        (signal) => scanEntries(entries, { onProgress: ({ files, bytes }) => reportScan(files, bytes), signal }),
        kind === 'folder' ? 'folder' : 'files',
        kind === 'folder' ? (entries[0]?.name ?? 'my-project') : 'my-project',
      )
    },
    [reportScan, runScan],
  )

  const handleFiles = useCallback(
    (files: FileList, kind: 'folder' | 'zip' | 'files') => {
      const list = Array.from(files)
      if (kind === 'zip' && list[0]) {
        void runScan(
          () => projectFromZip(list[0]!, ({ files: count, bytes }) => reportScan(count, bytes)),
          'zip',
          list[0].name,
        )
        return
      }
      const scanned = scanFileList(list)
      applyImport(
        { files: scanned.files, truncated: false, rootFolder: scanned.rootFolder },
        kind === 'folder' ? 'folder' : 'files',
        kind === 'folder' && list[0] ? list[0].webkitRelativePath?.split('/')[0] || list[0].name : 'my-project',
      )
    },
    [applyImport, reportScan, runScan],
  )

  const resetProject = useCallback(() => {
    scanAbort.current?.abort()
    setProject(null)
    setImportError(null)
    setExcluded(new Set())
    setIncluded(new Set())
  }, [])

  /* ------------------------------- отбор файлов ---------------------------- */

  const ignoreFn = useMemo(() => {
    const sources: string[] = []
    if (settings.useDefaultIgnore) sources.push(DEFAULT_IGNORE_PATTERNS)
    if (settings.extraIgnore.trim()) sources.push(settings.extraIgnore)
    return compileIgnore(sources)
  }, [settings.useDefaultIgnore, settings.extraIgnore])

  const isIgnored = useCallback((path: string) => ignoreFn(path), [ignoreFn])
  const isSelected = useCallback(
    (path: string) => (ignoreFn(path) ? included.has(path) : !excluded.has(path)),
    [ignoreFn, included, excluded],
  )

  const selectedFiles = useMemo(
    () => (project ? project.files.filter((file) => isSelected(file.path)) : []),
    [project, isSelected],
  )
  const selectedBytes = useMemo(() => selectedFiles.reduce((sum, file) => sum + file.size, 0), [selectedFiles])

  const togglePaths = useCallback(
    (paths: string[], next: boolean) => {
      setExcluded((prevExcluded) => {
        const excludedNext = new Set(prevExcluded)
        for (const path of paths) {
          if (ignoreFn(path)) continue
          if (next) excludedNext.delete(path)
          else excludedNext.add(path)
        }
        return excludedNext
      })
      setIncluded((prevIncluded) => {
        const includedNext = new Set(prevIncluded)
        for (const path of paths) {
          if (!ignoreFn(path)) continue
          if (next) includedNext.add(path)
          else includedNext.delete(path)
        }
        return includedNext
      })
    },
    [ignoreFn],
  )

  const toggleFile = useCallback((path: string, next: boolean) => togglePaths([path], next), [togglePaths])

  /* --------------------------- выбор репозитория --------------------------- */

  const selectRepo = useCallback(
    async (repo: GitHubRepo | null) => {
      setSelectedRepo(repo)
      setBranches([])
      setBranch('')
      if (!repo || !github.client) return
      setLoadingBranches(true)
      try {
        const list = await github.client.listBranches(repo.owner.login, repo.name)
        const names = list.map((item) => item.name)
        setBranches(names)
        setBranch(names.includes(repo.default_branch) ? repo.default_branch : (names[0] ?? repo.default_branch))
      } catch {
        setBranches([repo.default_branch])
        setBranch(repo.default_branch)
      } finally {
        setLoadingBranches(false)
      }
    },
    [github.client],
  )

  /* ------------------------------ публикация ------------------------------- */

  const generatedIgnore = useMemo(() => {
    const parts: string[] = []
    if (settings.useDefaultIgnore) parts.push(DEFAULT_IGNORE_PATTERNS)
    if (settings.extraIgnore.trim()) parts.push(settings.extraIgnore.trim())
    return parts.length ? `${parts.join('\n')}\n` : ''
  }, [settings.useDefaultIgnore, settings.extraIgnore])

  const authorFromSettings = useMemo(() => {
    const login = github.user?.login ?? 'git-it'
    const fallbackName = github.user?.name || login
    return {
      name: settings.authorName.trim() || fallbackName,
      email: settings.authorEmail.trim() || `${github.user?.id ? `${github.user.id}+` : ''}${login}@users.noreply.github.com`,
    }
  }, [github.user, settings.authorName, settings.authorEmail])

  const canPublish = Boolean(
    github.client &&
      github.user &&
      project &&
      selectedFiles.length > 0 &&
      (mode === 'new' ? draft.name.trim().length > 0 : Boolean(selectedRepo)),
  )

  const startPublish = useCallback(async () => {
    if (!github.client || !github.user || !project) return

    const files: ProjectFile[] = [...selectedFiles]
    const commitMessage =
      settings.commitMessage.trim() || `Загрузка проекта «${project.name}» через Git it`

    if (settings.addGitignore && !project.hasGitignore && generatedIgnore) {
      files.push({
        path: '.gitignore',
        size: generatedIgnore.length,
        read: async () => encoder.encode(generatedIgnore),
      })
    }
    if (settings.addReadme && !project.hasReadme) {
      const readme = [`# ${project.name}`, '', draft.description.trim() || '', '', '_Проект залит в GitHub через Git it._', ''].join('\n')
      files.push({ path: 'README.md', size: readme.length, read: async () => encoder.encode(readme) })
    }

    const subdir = settings.subdir.trim() ? settings.subdir.trim().replace(/^\/+|\/+$/g, '') : undefined

    await publish.run(async ({ onProgress, signal }): Promise<PublishResult> => {
      if (mode === 'new') {
        const name = sanitizeRepoName(draft.name)
        return github.client!.createRepoAndPublish({
          name,
          private: draft.private,
          description: draft.description.trim() || undefined,
          owner: github.user!.login,
          org: draft.owner && draft.owner !== github.user!.login ? draft.owner : null,
          files,
          message: commitMessage,
          author: authorFromSettings,
          subdir,
          skipUnchanged: settings.skipUnchanged,
          onProgress,
          signal,
        })
      }

      const repo = selectedRepo!
      return github.client!.publishProject({
        owner: repo.owner.login,
        repo: repo.name,
        branch,
        files,
        message: commitMessage,
        author: authorFromSettings,
        subdir,
        skipUnchanged: settings.skipUnchanged,
        onProgress,
        signal,
      })
    })
  }, [
    authorFromSettings,
    branch,
    draft,
    generatedIgnore,
    github.client,
    github.user,
    mode,
    project,
    publish,
    selectedFiles,
    selectedRepo,
    settings,
  ])

  const restart = useCallback(() => {
    publish.reset()
    resetProject()
    setSelectedRepo(null)
    setBranches([])
    setBranch('')
  }, [publish, resetProject])

  /* --------------------------------- рендер -------------------------------- */

  const currentStep = !github.user ? 0 : !project ? 1 : publish.status === 'running' || publish.status === 'done' ? 3 : 2
  const showSuccess = publish.status === 'done'
  const busyConfig = publish.status === 'running'

  return (
    <div className="app">
      <div className="background" aria-hidden>
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <div className="grid-overlay" />
      </div>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Logo size={26} />
          </span>
          <span className="brand-text">
            <strong>Git it</strong>
            <span className="muted small">залить проект в GitHub — легко и просто</span>
          </span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {github.user && (
            <span className="account-chip">
              <img src={github.user.avatar_url} alt="" width={24} height={24} />
              <span className="mono">{github.user.login}</span>
              <button type="button" className="icon-btn icon-btn-sm" onClick={github.signOut} title="Отключить аккаунт">
                <Trash size={14} />
              </button>
            </span>
          )}
        </div>
      </header>

      <main className="content">
        {!github.user && (
          <section className="hero">
            <h1>
              Перетащите папку с проектом — <span className="gradient-text">остальное сделает Git it</span>
            </h1>
            <p className="muted">
              Никакой командной строки, <code>git init</code> и разговоров про remote. Выбираете проект, выбираете
              репозиторий — Git it собирает коммит через GitHub API и рассказывает, что происходит на каждом шаге.
            </p>
            <ul className="hero-list">
              <li>
                <Check size={16} /> Папка, ZIP или отдельные файлы
              </li>
              <li>
                <Check size={16} /> node_modules, .env и .git улетают в игнор автоматически
              </li>
              <li>
                <Check size={16} /> Токен не покидает ваш браузер
              </li>
            </ul>
          </section>
        )}

        <Stepper steps={STEPS} current={currentStep} />

        <AuthPanel
          status={github.status}
          user={github.user}
          error={github.error}
          onSignIn={github.signIn}
          onSignOut={github.signOut}
        />

        {github.user && !showSuccess && (
          <>
            {!project && (
              <DropZone
                busy={importBusy}
                progressText={importProgress}
                error={importError}
                onDropEntries={handleDropEntries}
                onFiles={handleFiles}
              />
            )}

            {project && (
              <>
                <section className="card project-card">
                  <div className="project-head">
                    <div>
                      <span className="card-step">Шаг 2</span>
                      <h2>{project.name}</h2>
                      <p className="muted small">
                        {project.source === 'zip' ? 'Из ZIP-архива' : project.source === 'folder' ? 'Из папки' : 'Из файлов'}
                        {project.rootFolder && project.source !== 'zip' ? ` «${project.rootFolder}»` : ''} ·{' '}
                        {formatFiles(project.files.length)} · {formatBytes(project.totalSize)}
                      </p>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={resetProject} disabled={busyConfig}>
                      <Refresh size={16} /> Другой проект
                    </button>
                  </div>

                  {project.warnings.map((warning) => (
                    <p className="notice notice-warn" key={warning}>
                      <Alert size={18} /> {warning}
                    </p>
                  ))}
                  {project.truncated && (
                    <p className="notice notice-warn">
                      <Alert size={18} /> Файлов оказалось очень много — показали и взяли первые{' '}
                      {formatNumber(project.files.length)}. Залейте проект частями, если нужно больше.
                    </p>
                  )}
                  {project.totalSize > 900 * 1024 * 1024 && (
                    <p className="notice notice-warn">
                      <Alert size={18} /> Проект больше 900 МБ — GitHub может отказать. Попробуйте исключить тяжёлые
                      каталоги.
                    </p>
                  )}
                </section>

                <FileTree
                  files={project.files}
                  isIgnored={isIgnored}
                  isSelected={isSelected}
                  onToggleFile={toggleFile}
                  onTogglePaths={togglePaths}
                  selectedCount={selectedFiles.length}
                  selectedBytes={selectedBytes}
                />

                {!busyConfig && (
                  <>
                    <RepoPicker
                      mode={mode}
                      onModeChange={setMode}
                      user={github.user}
                      orgs={github.orgs}
                      draft={draft}
                      onDraftChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
                      repos={github.repos}
                      loadingRepos={github.loadingRepos}
                      onRefresh={github.refresh}
                      selectedRepo={selectedRepo}
                      onSelectRepo={(repo) => void selectRepo(repo)}
                      branches={branches}
                      branch={branch}
                      onBranchChange={setBranch}
                      loadingBranches={loadingBranches}
                    />

                    <PublishPanel
                      settings={settings}
                      update={update}
                      projectName={project.name}
                      selectedCount={selectedFiles.length}
                      selectedBytes={selectedBytes}
                      projectFileCount={project.files.length}
                      projectBytes={project.totalSize}
                      hasGitignore={project.hasGitignore}
                      hasReadme={project.hasReadme}
                      publishing={publish.status === 'running'}
                      onPublish={() => void startPublish()}
                    />

                    {!canPublish && (
                      <p className="notice notice-info">
                        <Info size={18} />{' '}
                        {mode === 'new'
                          ? 'Заполните имя репозитория, чтобы отправить проект.'
                          : 'Выберите репозиторий в списке выше.'}
                      </p>
                    )}
                  </>
                )}

                {(publish.status === 'running' || publish.status === 'error' || publish.status === 'canceled') && (
                  <ProgressPanel
                    state={publish}
                    onCancel={publish.cancel}
                    onRetry={() => void startPublish()}
                    onRestart={restart}
                  />
                )}
              </>
            )}
          </>
        )}

        {showSuccess && (
          <ProgressPanel state={publish} onCancel={publish.cancel} onRetry={() => void startPublish()} onRestart={restart} />
        )}

        <footer className="footer">
          <p className="muted small">
            <GitHubMark size={16} /> Git it · работает целиком в браузере: обращения идут напрямую к api.github.com, у
            приложения нет своего сервера и оно не видит ваш код.
          </p>
        </footer>
      </main>
    </div>
  )
}
