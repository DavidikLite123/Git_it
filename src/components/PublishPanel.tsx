import { useState } from 'react'
import { Alert, Rocket, Zap } from './Icons'
import type { Settings } from '../hooks/usePublish'
import { formatBytes, formatFiles } from '../lib/format'
import { DEFAULT_IGNORE_PATTERNS } from '../lib/ignore'

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
  publishing,
  onPublish,
}: Props) {
  const [advanced, setAdvanced] = useState(false)
  const defaultMessage = `Загрузка проекта «${projectName}» через Git it`
  const filesHint = settings.subdir.trim()
    ? `${settings.subdir.replace(/^\/+|\/+$/g, '')}/…`
    : 'корень репозитория'

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
      </div>

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
      <input
        type="checkbox"
        className="check"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-text">
        <span className="toggle-title">{title}</span>
        <span className="muted small">{description}</span>
      </span>
    </label>
  )
}
