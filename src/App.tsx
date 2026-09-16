import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgreementScreen } from './components/AgreementScreen'
import { AuthPanel } from './components/AuthPanel'
import { DropZone } from './components/DropZone'
import { FileTree } from './components/FileTree'
import { PublishPanel } from './components/PublishPanel'
import { ProgressPanel } from './components/ProgressPanel'
import { RepoPicker, type NewRepoDraft, type RepoMode } from './components/RepoPicker'
import { SplashScreen } from './components/SplashScreen'
import { Stepper } from './components/Stepper'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Alert, Book, GitHubMark, Info, Logo, Moon, Refresh, Sun, Trash } from './components/Icons'
import { useGitHub } from './hooks/useGitHub'
import { usePublish, useSettings, useTheme } from './hooks/usePublish'
import {
  MAX_COMMIT_FILES,
  MAX_PREVIEWS,
  PREVIEW_BYTES,
  countCommits,
  type GitHubRepo,
  type PublishResult,
} from './lib/github'
import { DEFAULT_IGNORE_PATTERNS, MAX_BLOB_SIZE, compileIgnore } from './lib/ignore'
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
import {
  AGREEMENT_VERSION,
  formatAcceptanceDate,
  formatAgreementVersion,
  readAcceptance,
  saveAcceptance,
  type AgreementAcceptance,
} from './lib/agreement'
import { formatBytes, formatFiles, formatNumber } from './lib/format'

const STEPS = ['Соглашение', 'GitHub', 'Проект', 'Отправка']

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
const encoder = new TextEncoder()

interface ScanResult {
  files: ProjectFile[]
  truncated: boolean
  rootFolder: string | null
  warnings?: string[]
}

type View = 'welcome' | 'agreement' | 'app'

export default function App() {
  const { theme, toggle } = useTheme()
  const github = useGitHub()
  const { settings, update } = useSettings()
  const publish = usePublish()

  /* ------------------------------ онбординг ------------------------------- */

  const [acceptance, setAcceptance] = useState<AgreementAcceptance | null>(() => readAcceptance())
  // приветственный экран показывается при каждом заходе на сайт
  const [view, setView] = useState<View>('welcome')
  const [readOnlyAgreement, setReadOnlyAgreement] = useState(false)
  // стартовая заставка: показывается при каждом заходе на сайт
  const [showSplash, setShowSplash] = useState(true)

  const agreementAccepted = acceptance?.version === AGREEMENT_VERSION

  /** «Начать»: если соглашение уже принято — сразу в приложение, иначе к чтению. */
  const startFromWelcome = useCallback(() => {
    if (acceptance?.version === AGREEMENT_VERSION) {
      setView('app')
      return
    }
    openAgreementRef.current?.(false)
  }, [acceptance])

  const openAgreementRef = useRef<((readOnly: boolean) => void) | null>(null)

  /* -------------------------------- проект -------------------------------- */

  const [project, setProject] = useState<Project | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [included, setIncluded] = useState<Set<string>>(new Set())

  /* ----------------------------- репозиторий ------------------------------ */

  const [mode, setMode] = useState<RepoMode>('new')
  const [draft, setDraft] = useState<NewRepoDraft>({ name: '', owner: '', private: true, description: '' })
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [branch, setBranch] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(false)

  const scanAbort = useRef<AbortController | null>(null)
  const lastProgressAt = useRef(0)

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

  /* ------------------------- план выгрузки и публикация -------------------- */

  const generatedIgnore = useMemo(() => {
    const parts: string[] = []
    if (settings.useDefaultIgnore) parts.push(DEFAULT_IGNORE_PATTERNS)
    if (settings.extraIgnore.trim()) parts.push(settings.extraIgnore.trim())
    return parts.length ? `${parts.join('\n')}\n` : ''
  }, [settings.useDefaultIgnore, settings.extraIgnore])

  const generatedReadme = useMemo(() => {
    if (!project) return ''
    return [`# ${project.name}`, '', draft.description.trim() || '', '', '_Проект залит в GitHub через Git it._', ''].join('\n')
  }, [project, draft.description])

  /** Итоговый список файлов: выбранные + сгенерированные по настройкам. */
  const filesToSend = useMemo((): ProjectFile[] => {
    if (!project) return []
    const files: ProjectFile[] = [...selectedFiles]
    if (settings.addGitignore && !project.hasGitignore && generatedIgnore) {
      files.push({ path: '.gitignore', size: generatedIgnore.length, read: async () => encoder.encode(generatedIgnore) })
    }
    if (settings.addReadme && !project.hasReadme && generatedReadme) {
      files.push({ path: 'README.md', size: generatedReadme.length, read: async () => encoder.encode(generatedReadme) })
    }
    return files
  }, [project, selectedFiles, settings.addGitignore, settings.addReadme, generatedIgnore, generatedReadme])

  /** Файлы, которые GitHub через API не примет ни в каком виде. */
  const oversizeFiles = useMemo(
    () => filesToSend.filter((file) => file.size > MAX_BLOB_SIZE),
    [filesToSend],
  )

  const limits = useMemo(
    () => ({
      maxFiles: clamp(Math.round(settings.commitFileLimit) || MAX_COMMIT_FILES, 1, MAX_COMMIT_FILES),
      maxBytes: clamp(Math.round(settings.commitByteLimitMb) || 400, 1, 2000) * 1024 * 1024,
    }),
    [settings.commitFileLimit, settings.commitByteLimitMb],
  )
  const plannedCommits = useMemo(() => (filesToSend.length ? countCommits(filesToSend, limits) : 1), [filesToSend, limits])
  const useMultiCommit = settings.batchMode === 'multi' || (settings.batchMode === 'auto' && plannedCommits > 1)

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
      filesToSend.length > 0 &&
      (mode === 'new' ? draft.name.trim().length > 0 : Boolean(selectedRepo)),
  )

  const startPublish = useCallback(async () => {
    if (!github.client || !github.user || !project) return

    const files = filesToSend
    const commitMessage = settings.commitMessage.trim() || `Загрузка проекта «${project.name}» через Git it`
    const subdir = settings.subdir.trim() ? settings.subdir.trim().replace(/^\/+|\/+$/g, '') : undefined

    // пробники для файлов, которые GitHub не примет: покажем пользователю, что именно пропущено
    const previews = new Map<string, Uint8Array>()
    for (const file of files.filter((item) => item.size > MAX_BLOB_SIZE).slice(0, MAX_PREVIEWS)) {
      if (!file.readPreview) continue
      try {
        previews.set(file.path, await file.readPreview(PREVIEW_BYTES))
      } catch {
        /* пробник — вспомогательная вещь, без него тоже работаем */
      }
    }

    await publish.run(async ({ onProgress, signal }): Promise<PublishResult> => {
      const shared = {
        files,
        message: commitMessage,
        author: authorFromSettings,
        subdir,
        skipOversized: settings.skipLargeFiles,
        previews,
        onProgress,
        signal,
      }

      if (mode === 'new') {
        return github.client!.createRepoAndPublish({
          ...shared,
          name: sanitizeRepoName(draft.name),
          private: draft.private,
          description: draft.description.trim() || undefined,
          owner: github.user!.login,
          org: draft.owner && draft.owner !== github.user!.login ? draft.owner : null,
          skipUnchanged: false,
          inCommits: useMultiCommit,
          maxFiles: limits.maxFiles,
          maxBytes: limits.maxBytes,
        })
      }

      const repo = selectedRepo!
      const target = {
        ...shared,
        owner: repo.owner.login,
        repo: repo.name,
        branch,
        skipUnchanged: settings.skipUnchanged,
      }

      return useMultiCommit
        ? github.client!.publishProjectInCommits({
            ...target,
            maxFiles: limits.maxFiles,
            maxBytes: limits.maxBytes,
            mode: settings.mergeMode,
          })
        : github.client!.publishProject(target)
    })
  }, [
    authorFromSettings,
    branch,
    draft,
    filesToSend,
    github.client,
    github.user,
    limits,
    mode,
    project,
    publish,
    selectedRepo,
    settings,
    useMultiCommit,
  ])

  const restart = useCallback(() => {
    publish.reset()
    resetProject()
    setSelectedRepo(null)
    setBranches([])
    setBranch('')
  }, [publish, resetProject])

  const acceptAgreement = useCallback(() => {
    setAcceptance(saveAcceptance())
    setReadOnlyAgreement(false)
    setView('app')
  }, [])

  const openAgreement = useCallback((readOnly: boolean) => {
    setReadOnlyAgreement(readOnly)
    setView('agreement')
  }, [])

  const dismissSplash = useCallback(() => setShowSplash(false), [])

  openAgreementRef.current = openAgreement

  /* --------------------------------- рендер -------------------------------- */

  if (view === 'welcome') {
    return (
      <>
        <Shell theme={theme} onToggleTheme={toggle}>
          <WelcomeScreen
            onStart={startFromWelcome}
            onReadAgreement={() => openAgreement(true)}
            agreementAccepted={agreementAccepted}
            acceptance={acceptance}
          />
        </Shell>
        {showSplash && <SplashScreen onDone={dismissSplash} />}
      </>
    )
  }

  if (view === 'agreement') {
    return (
      <>
        <Shell theme={theme} onToggleTheme={toggle}>
          <AgreementScreen
            acceptance={acceptance}
            readOnly={readOnlyAgreement}
            onAccept={acceptAgreement}
            onBack={() => setView(readOnlyAgreement ? 'app' : 'welcome')}
          />
        </Shell>
        {showSplash && <SplashScreen onDone={dismissSplash} />}
      </>
    )
  }

  const agreementDone = Boolean(acceptance)
  const currentStep = !agreementDone ? 0 : !github.user ? 1 : !project ? 2 : 3
  const showSuccess = publish.status === 'done'
  const busyConfig = publish.status === 'running'

  return (
    <>
      <Shell theme={theme} onToggleTheme={toggle} user={github.user} onSignOut={github.signOut}>
        <Stepper steps={STEPS} current={currentStep} />

      <AuthPanel
        status={github.status}
        user={github.user}
        error={github.error}
        hasSavedToken={Boolean(github.token)}
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
                    <span className="card-step">Шаг 3</span>
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
                    {formatNumber(project.files.length)}. Выгружайте проект частями или по каталогам.
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
                    plannedCommits={plannedCommits}
                    useMultiCommit={useMultiCommit}
                    oversizeFiles={oversizeFiles}
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
            приложения нет своего сервера.
          </p>
          <p className="muted small">
            <button type="button" className="link-btn" onClick={() => openAgreement(true)}>
              <Book size={14} /> Лицензионное соглашение {formatAgreementVersion()}
            </button>
            {acceptance && <span className="muted small">· принято {formatAcceptanceDate(acceptance.acceptedAt)}</span>}
          </p>
        </footer>
      </Shell>
      {showSplash && <SplashScreen onDone={dismissSplash} />}
    </>
  )
}

/** Общая оболочка: фон, шапка с темой и подключённым аккаунтом. */
function Shell({
  theme,
  onToggleTheme,
  user,
  onSignOut,
  children,
}: {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  user?: { login: string; avatar_url: string; name: string | null } | null
  onSignOut?: () => void
  children: React.ReactNode
}) {
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
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {user && (
            <span className="account-chip">
              <img src={user.avatar_url} alt="" width={24} height={24} />
              <span className="mono">{user.login}</span>
              {onSignOut && (
                <button type="button" className="icon-btn icon-btn-sm" onClick={onSignOut} title="Отключить аккаунт">
                  <Trash size={14} />
                </button>
              )}
            </span>
          )}
        </div>
      </header>

      <main className="content">{children}</main>
    </div>
  )
}
