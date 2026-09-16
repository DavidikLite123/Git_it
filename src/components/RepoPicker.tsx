import { useMemo, useState } from 'react'
import { Alert, Globe, Lock, Refresh, Search, Spinner } from './Icons'
import type { GitHubOrg, GitHubRepo, GitHubUser } from '../lib/github'
import { formatNumber } from '../lib/format'

export type RepoMode = 'new' | 'existing'

export interface NewRepoDraft {
  name: string
  owner: string
  private: boolean
  description: string
}

interface Props {
  mode: RepoMode
  onModeChange: (mode: RepoMode) => void
  user: GitHubUser
  orgs: GitHubOrg[]
  draft: NewRepoDraft
  onDraftChange: (patch: Partial<NewRepoDraft>) => void
  repos: GitHubRepo[]
  loadingRepos: boolean
  onRefresh: () => void
  selectedRepo: GitHubRepo | null
  onSelectRepo: (repo: GitHubRepo | null) => void
  branches: string[]
  branch: string
  onBranchChange: (branch: string) => void
  loadingBranches: boolean
}

export function RepoPicker({
  mode,
  onModeChange,
  user,
  orgs,
  draft,
  onDraftChange,
  repos,
  loadingRepos,
  onRefresh,
  selectedRepo,
  onSelectRepo,
  branches,
  branch,
  onBranchChange,
  loadingBranches,
}: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    const list = trimmed
      ? repos.filter((repo) => repo.full_name.toLowerCase().includes(trimmed))
      : repos
    return list.filter((repo) => repo.name !== '.github').slice(0, 80)
  }, [repos, query])

  const owners = useMemo(
    () => [{ login: user.login, avatar_url: user.avatar_url, kind: 'user' as const }, ...orgs.map((org) => ({ ...org, kind: 'org' as const }))],
    [user, orgs],
  )

  return (
    <section className="card">
      <header className="card-head">
        <span className="card-step">Шаг 3</span>
        <h2>Куда заливаем</h2>
      </header>

      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          className={mode === 'new' ? 'is-active' : ''}
          onClick={() => onModeChange('new')}
        >
          Новый репозиторий
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          className={mode === 'existing' ? 'is-active' : ''}
          onClick={() => onModeChange('existing')}
        >
          Существующий
        </button>
      </div>

      {mode === 'new' ? (
        <div className="stack">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="repo-name">Имя репозитория</label>
              <input
                id="repo-name"
                className="input mono"
                value={draft.name}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="my-awesome-project"
                onChange={(event) => onDraftChange({ name: event.target.value })}
              />
              <p className="hint">
                Путь будет <code>github.com/{draft.owner || user.login}/{draft.name || 'my-project'}</code>
              </p>
            </div>

            <div className="field">
              <label htmlFor="repo-owner">Владелец</label>
              <select
                id="repo-owner"
                className="input"
                value={draft.owner || user.login}
                onChange={(event) => onDraftChange({ owner: event.target.value })}
              >
                {owners.map((owner) => (
                  <option key={`${owner.kind}:${owner.login}`} value={owner.login}>
                    {owner.kind === 'org' ? `${owner.login} (организация)` : owner.login}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="repo-desc">Описание (необязательно)</label>
            <input
              id="repo-desc"
              className="input"
              value={draft.description}
              maxLength={350}
              placeholder="Например: пет-проект с погодным виджетом"
              onChange={(event) => onDraftChange({ description: event.target.value })}
            />
          </div>

          <div className="field">
            <span className="label">Видимость</span>
            <div className="segmented segmented-sm">
              <button
                type="button"
                aria-pressed={draft.private}
                className={draft.private ? 'is-active' : ''}
                onClick={() => onDraftChange({ private: true })}
              >
                <Lock size={16} /> Приватный
              </button>
              <button
                type="button"
                aria-pressed={!draft.private}
                className={!draft.private ? 'is-active' : ''}
                onClick={() => onDraftChange({ private: false })}
              >
                <Globe size={16} /> Публичный
              </button>
            </div>
            <p className="hint">
              {draft.private
                ? 'Видите только вы и те, кому дадите доступ. Именно это нужно в 99% случаев.'
                : 'Увидят все — можно включить это позже в настройках репозитория.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="tree-toolbar">
            <div className="input-with-icon grow">
              <Search size={16} />
              <input
                className="input"
                placeholder="Поиск репозитория…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onRefresh} disabled={loadingRepos}>
              {loadingRepos ? <Spinner size={16} /> : <Refresh size={16} />} Обновить
            </button>
          </div>

          <div className="repo-list">
            {filtered.map((repo) => (
              <button
                key={repo.id}
                type="button"
                className={`repo-item${selectedRepo?.id === repo.id ? ' is-active' : ''}`}
                onClick={() => onSelectRepo(repo)}
              >
                <span className="repo-item-icon">{repo.private ? <Lock size={14} /> : <Globe size={14} />}</span>
                <span className="repo-item-main">
                  <span className="repo-item-name">{repo.name}</span>
                  <span className="repo-item-owner muted">
                    {repo.owner.login}
                    <span className="separator">·</span>
                    {repo.size ? `${formatNumber(repo.size)} КБ` : 'пусто'}
                  </span>
                </span>
              </button>
            ))}
            {!loadingRepos && filtered.length === 0 && (
              <p className="muted center small">
                {repos.length === 0 ? 'Репозиториев не найдено — создайте новый.' : 'Ничего не совпало с поиском.'}
              </p>
            )}
            {loadingRepos && <p className="muted center small">Загружаем список…</p>}
          </div>

          {selectedRepo && (
            <>
              <div className="field">
                <label htmlFor="branch">Ветка</label>
                {loadingBranches ? (
                  <p className="muted small">
                    <Spinner size={14} /> Смотрим ветки…
                  </p>
                ) : branches.length > 0 ? (
                  <select
                    id="branch"
                    className="input mono"
                    value={branch}
                    onChange={(event) => onBranchChange(event.target.value)}
                  >
                    {branches.map((name) => (
                      <option key={name} value={name}>
                        {name}
                        {name === selectedRepo.default_branch ? ' (по умолчанию)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="muted small">
                    Репозиторий ещё пуст — создадим в нём первый коммит с вашим проектом.
                  </p>
                )}
              </div>
              {selectedRepo.permissions?.push === false && (
                <p className="notice notice-warn">
                  <Alert size={18} /> У вашего токена нет прав на запись в этот репозиторий — потребуется роль с доступом
                  к отправке изменений.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
