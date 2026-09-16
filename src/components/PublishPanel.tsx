import { useState } from 'react'
import { Alert, Check, Info, Layers, Rocket, Zap } from './Icons'
import type { Settings } from '../hooks/usePublish'
import { formatBytes, formatFiles, formatNumber } from '../lib/format'
import { DEFAULT_IGNORE_PATTERNS } from '../lib/ignore'
import { MAX_COMMIT_BYTES, MAX_COMMIT_FILES } from '../lib/github'
import type { ProjectFile } from '../lib/project'

interface Props {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  projectName: string
  selectedCount: number
  selectedBytes: number
  projectFileCount: number
  projectBytes: number
  hasGitignore: boolean
  hasReadme: boolean
  /** Сколько коммитов понадобится, если выгружать частями */
  plannedCommits: number
  /** Выгрузка пойдёт несколькими коммитами */
  useMultiCommit: boolean
  /** Файлы больше 100 МБ: GitHub через API их не принимает */
  oversizeFiles: ProjectFile[]
  publishing: boolean
  onPublish: () => void
}

export function PublishPanel({
  settings,
  update,
  projectName,
  selectedCount,
  selectedBytes,
  projectFileCount,
  projectBytes,
  hasGitignore,
  hasReadme,
  plannedCommits,
  useMultiCommit,
  oversizeFiles,
  publishing,
  onPublish,
}: Props) {
  const [advanced, setAdvanced] = useState(false)
  const defaultMessage = `Загрузка проекта «${projectName}» через Git it`
  const filesHint = settings.subdir.trim()
    ? `${settings.subdir.replace(/^\/+|\/+$/g, '')}/…`
    : 'корень репозитория'
  const oversizeBytes = oversizeFiles.reduce((sum, file) => sum + file.size, 0)

  return (
    <section className="card">
      <header className="card-head">
        <span className="card-step">Шаг 4</span>
        <h2>
          <Rocket size={20} /> Коммит и отправка
        </h2>
      </header>

      <div className="field">
        <label htmlFor="commit-message">Сообщение коммита</label>
        <input
          id="commit-message"
          className="input"
          value={settings.commitMessage}
          placeholder={defaultMessage}
          onChange={(event) => update('commitMessage', event.target.value)}
        />
        {useMultiCommit && plannedCommits > 1 && (
          <p className="hint">
            К сообщению автоматически добавится «— часть N из {plannedCommits}», чтобы коммиты было легко различить в
            истории.
          </p>
        )}
      </div>

      <div className="plan-card">
        <Layers size={20} />
        <div className="plan-text">
          <strong>
            {useMultiCommit && plannedCommits > 1
              ? `Выгрузка в ${formatNumber(plannedCommits)} коммита(ов)`
              : 'Выгрузка одним коммитом'}
          </strong>
          <span className="muted small">
            {useMultiCommit && plannedCommits > 1
              ? `Файлов слишком много для одного коммита: Git it разобьёт их на пачки по ${formatNumber(
                  MAX_COMMIT_FILES,
                )} файлов (не больше ${formatBytes(MAX_COMMIT_BYTES)} в каждой) и создаст отдельный коммит для каждой пачки. Если загрузка прервётся, уже выгруженные коммиты останутся в ветке.`
              : `Всё влезает в лимиты одного коммита (до ${formatNumber(MAX_COMMIT_FILES)} файлов и ${formatBytes(
                  MAX_COMMIT_BYTES,
                )}). Если файлов окажется больше, Git it сам перейдёт к выгрузке частями.`}
          </span>
        </div>
      </div>

      {oversizeFiles.length > 0 && (
        <div className="oversize">
          <p className={`notice ${settings.skipLargeFiles ? 'notice-warn' : 'notice-error'}`}>
            <Alert size={18} />
            <span>
              GitHub принимает через API файлы не больше 100 МБ. В проекте {formatFiles(oversizeFiles.length)} на{' '}
              {formatBytes(oversizeBytes)} — их залить не получится ни одним коммитом, это ограничение самого GitHub.
              Для таких файлов нужен Git LFS или обычный git-клиент.
            </span>
          </p>

          <ul className="oversize-list">
            {oversizeFiles.slice(0, 6).map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <span className="muted small">{formatBytes(file.size)}</span>
              </li>
            ))}
            {oversizeFiles.length > 6 && (
              <li className="muted small">и ещё {formatFiles(oversizeFiles.length - 6)}…</li>
            )}
          </ul>

          <div className="segmented segmented-sm">
            <button
              type="button"
              aria-pressed={settings.skipLargeFiles}
              className={settings.skipLargeFiles ? 'is-active' : ''}
              onClick={() => update('skipLargeFiles', true)}
            >
              <Check size={16} /> Пропустить и залить остальное
            </button>
            <button
              type="button"
              aria-pressed={!settings.skipLargeFiles}
              className={!settings.skipLargeFiles ? 'is-active' : ''}
              onClick={() => update('skipLargeFiles', false)}
            >
              Остановить загрузку с ошибкой
            </button>
          </div>

          <details className="details">
            <summary>Как всё-таки выгрузить файлы больше 100 МБ</summary>
            <ol className="steps-list">
              <li>
                Поставьте <code>git lfs install</code> и <code>git lfs track "*.ваш-формат"</code> в проекте.
              </li>
              <li>
                Добавьте файлы обычным git-клиентом (<code>git add</code> → <code>git commit</code> →{' '}
                <code>git push</code>) — Git LFS загружает крупные файлы в отдельное хранилище.
              </li>
              <li>
                Либо заранее разбейте файл на части программно и выгрузите их Git it как обычные небольшие файлы.
              </li>
            </ol>
          </details>
        </div>
      )}

      <div className="toggles">
        <Toggle
          checked={settings.skipUnchanged}
          onChange={(next) => update('skipUnchanged', next)}
          title="Не отправлять файлы повторно"
          description="Git it сравнит содержимое с тем, что уже лежит в репозитории, и передаст только изменения."
        />
        <Toggle
          checked={settings.useDefaultIgnore}
          onChange={(next) => update('useDefaultIgnore', next)}
          title="Пропускать служебные файлы"
          description="node_modules, .git, dist, кэши, .env и прочее — в репозиторий не попадут."
        />
        {!hasGitignore && (
          <Toggle
            checked={settings.addGitignore}
            onChange={(next) => update('addGitignore', next)}
            title="Создать .gitignore"
            description="Положительный побочный эффект: проект сразу получает нормальный .gitignore."
          />
        )}
        {!hasReadme && (
          <Toggle
            checked={settings.addReadme}
            onChange={(next) => update('addReadme', next)}
            title="Создать README.md"
            description="Короткая заглушка с названием проекта — чтобы репозиторий не выглядел пустым."
          />
        )}
      </div>

      <button type="button" className="advanced-toggle" onClick={() => setAdvanced((prev) => !prev)}>
        {advanced ? 'Свернуть дополнительные настройки' : 'Дополнительные настройки'}
      </button>

      {advanced && (
        <div className="advanced">
          <div className="field">
            <span className="label">Способ выгрузки</span>
            <div className="segmented segmented-sm">
              <button
                type="button"
                aria-pressed={settings.batchMode === 'auto'}
                className={settings.batchMode === 'auto' ? 'is-active' : ''}
                onClick={() => update('batchMode', 'auto')}
              >
                Как получится
              </button>
              <button
                type="button"
                aria-pressed={settings.batchMode === 'multi'}
                className={settings.batchMode === 'multi' ? 'is-active' : ''}
                onClick={() => update('batchMode', 'multi')}
              >
                Всегда частями
              </button>
              <button
                type="button"
                aria-pressed={settings.batchMode === 'single'}
                className={settings.batchMode === 'single' ? 'is-active' : ''}
                onClick={() => update('batchMode', 'single')}
              >
                Одним коммитом
              </button>
            </div>
            <p className="hint">
              «Всегда частями» удобно для больших проектов и повторных выгрузок: каждая пачка — отдельный коммит,
              обрыв загрузки не отменяет уже выгруженное.
            </p>
          </div>

          {useMultiCommit && (
            <>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="file-limit">Файлов в одном коммите</label>
                  <input
                    id="file-limit"
                    className="input mono"
                    type="number"
                    min={1}
                    max={MAX_COMMIT_FILES}
                    value={settings.commitFileLimit}
                    onChange={(event) => update('commitFileLimit', Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="byte-limit">Мегабайт в одном коммите</label>
                  <input
                    id="byte-limit"
                    className="input mono"
                    type="number"
                    min={1}
                    max={2000}
                    value={settings.commitByteLimitMb}
                    onChange={(event) => update('commitByteLimitMb', Number(event.target.value))}
                  />
                </div>
              </div>
              <p className="hint">
                Меньшие пачки безопаснее: сбой при выгрузке не откатит уже созданные коммиты. Верхняя граница —{' '}
                {formatNumber(MAX_COMMIT_FILES)} файлов и {formatBytes(MAX_COMMIT_BYTES)} на коммит.
              </p>
            </>
          )}

          {useMultiCommit && (
            <div className="field">
              <span className="label">Что делать с файлами, которых нет в проекте</span>
              <div className="segmented segmented-sm">
                <button
                  type="button"
                  aria-pressed={settings.mergeMode === 'append'}
                  className={settings.mergeMode === 'append' ? 'is-active' : ''}
                  onClick={() => update('mergeMode', 'append')}
                >
                  Оставить в репозитории
                </button>
                <button
                  type="button"
                  aria-pressed={settings.mergeMode === 'replace'}
                  className={settings.mergeMode === 'replace' ? 'is-active' : ''}
                  onClick={() => update('mergeMode', 'replace')}
                >
                  Удалить из ветки
                </button>
              </div>
              <p className="hint">
                Режим «как в git push --force-содержимое»: при удалении ветка останется ровно с файлами проекта.
                История коммитов при этом не переписывается.
              </p>
            </div>
          )}

          <div className="field">
            <label htmlFor="subdir">Подпапка в репозитории</label>
            <input
              id="subdir"
              className="input mono"
              value={settings.subdir}
              spellCheck={false}
              placeholder="например, frontend"
              onChange={(event) => update('subdir', event.target.value)}
            />
            <p className="hint">Куда положить файлы: {filesHint}</p>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="author-name">Имя автора коммита</label>
              <input
                id="author-name"
                className="input"
                value={settings.authorName}
                placeholder="Git it"
                onChange={(event) => update('authorName', event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="author-email">E-mail автора коммита</label>
              <input
                id="author-email"
                className="input mono"
                value={settings.authorEmail}
                spellCheck={false}
                placeholder="you@example.com"
                onChange={(event) => update('authorEmail', event.target.value)}
              />
            </div>
          </div>
          <p className="hint">
            Чтобы коммит связался с вашим профилем, используйте адрес вида <code>id+login@users.noreply.github.com</code>.
          </p>

          <div className="field">
            <label htmlFor="extra-ignore">Дополнительные правила .gitignore</label>
            <textarea
              id="extra-ignore"
              className="input mono textarea"
              rows={5}
              spellCheck={false}
              value={settings.extraIgnore}
              placeholder={'*.log\ntemp/\nlocal-config.json'}
              onChange={(event) => update('extraIgnore', event.target.value)}
            />
            <p className="hint">
              По одному шаблону в строке. Уже исключено: {DEFAULT_IGNORE_PATTERNS.split('\n').length} строк стандартных
              правил.
            </p>
          </div>
        </div>
      )}

      <div className="publish-actions">
        <div className="publish-summary">
          <span className="publish-count">
            {selectedCount === 0 ? 'Ничего не выбрано' : `${formatFiles(selectedCount)} к отправке`}
          </span>
          <span className="muted small">
            {formatBytes(selectedBytes)}
            {projectBytes > selectedBytes ? ` из ${formatBytes(projectBytes)}` : ''}{' '}
            {projectFileCount > selectedCount && `· пропущено ${formatFiles(projectFileCount - selectedCount)}`}
          </span>
        </div>
        <button type="button" className="btn btn-primary btn-lg" disabled={publishing || selectedCount === 0} onClick={onPublish}>
          {publishing ? (
            'Загружаем…'
          ) : (
            <>
              <Zap size={18} /> Загрузить в GitHub
            </>
          )}
        </button>
      </div>

      {selectedCount === 0 && (
        <p className="notice notice-warn">
          <Alert size={18} /> Выберите хотя бы один файл — иначе коммит будет пустым.
        </p>
      )}

      {settings.batchMode === 'single' && plannedCommits > 1 && (
        <p className="notice notice-info">
          <Info size={18} /> Файлов больше, чем влезает в один коммит, поэтому выгрузка всё равно пойдёт частями —
          иначе GitHub отклонит часть запросов.
        </p>
      )}
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  title: string
  description: string
}) {
  return (
    <label className="toggle">
      <input type="checkbox" className="check" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-text">
        <span className="toggle-title">{title}</span>
        <span className="muted small">{description}</span>
      </span>
    </label>
  )
}
