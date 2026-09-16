import { useState } from 'react'
import { Alert, Check, GitHubMark, Key, Lock, Spinner, Trash } from './Icons'
import type { AuthStatus } from '../hooks/useGitHub'
import type { GitHubUser } from '../lib/github'

interface Props {
  status: AuthStatus
  user: GitHubUser | null
  error: string | null
  onSignIn: (token: string) => Promise<void>
  onSignOut: () => void
}

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Git%20it'

export function AuthPanel({ status, user, error, onSignIn, onSignOut }: Props) {
  const [token, setToken] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)

  if (user && status === 'ready') {
    return (
      <section className="card account-card">
        <div className="account">
          <img className="avatar" src={user.avatar_url} alt="" width={44} height={44} />
          <div className="account-info">
            <span className="account-name">
              <Check size={16} /> {user.name || user.login}
            </span>
            <a className="muted mono" href={`https://github.com/${user.login}`} target="_blank" rel="noreferrer">
              @{user.login}
            </a>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onSignOut} title="Отключить аккаунт">
            <Trash size={16} /> Отключить
          </button>
        </div>
      </section>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onSignIn(token)
      setToken('')
    } catch {
      /* текст ошибки приходит сверху */
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <header className="card-head">
        <span className="card-step">Шаг 1</span>
        <h2>
          <GitHubMark size={20} /> Подключите GitHub
        </h2>
        <p className="muted">
          Git it работает прямо в браузере и обращается к GitHub от вашего имени. Нужен токен доступа — он хранится
          только в этом браузере и отправляется исключительно на api.github.com.
        </p>
      </header>

      <form className="token-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="token">
            <Key size={16} /> Токен доступа (personal access token)
          </label>
          <div className="input-with-action">
            <input
              id="token"
              className="input mono"
              type={reveal ? 'text' : 'password'}
              value={token}
              autoComplete="off"
              spellCheck={false}
              placeholder="ghp_… или github_pat_…"
              onChange={(event) => setToken(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setReveal((prev) => !prev)}
              aria-label={reveal ? 'Скрыть токен' : 'Показать токен'}
            >
              {reveal ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !token.trim()}>
          {busy ? (
            <>
              <Spinner size={18} /> Проверяем…
            </>
          ) : (
            'Войти в GitHub'
          )}
        </button>
      </form>

      {error && (
        <p className="notice notice-error">
          <Alert size={18} /> {error}
        </p>
      )}

      <details className="details">
        <summary>Как получить токен за минуту</summary>
        <ol className="steps-list">
          <li>
            Откройте{' '}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              github.com/settings/tokens/new
            </a>{' '}
            — мы уже подставили нужные права.
          </li>
          <li>
            Убедитесь, что отмечены галочки <code>repo</code> и <code>workflow</code> (иначе не получится создать
            репозиторий и залить файлы).
          </li>
          <li>Нажмите «Generate token» и скопируйте строку — GitHub покажет её только один раз.</li>
          <li>Вставьте токен в поле выше и нажмите «Войти в GitHub».</li>
        </ol>
        <p className="muted small">
          <Lock size={14} /> Мы не отправляем токен никуда, кроме GitHub, и не храним его на сервере: у Git it вообще нет
          сервера.
        </p>
      </details>
    </section>
  )
}
