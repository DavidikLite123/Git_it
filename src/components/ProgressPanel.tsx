import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Check, Close, Copy, ExternalLink, GitHubMark, Refresh, Spinner, Zap } from './Icons'
import type { PublishState } from '../hooks/usePublish'
import { formatBytes, formatNumber, formatSeconds, truncateMiddle } from '../lib/format'

interface Props {
  state: PublishState
  onCancel: () => void
  onRetry: () => void
  onRestart: () => void
}

interface Sample {
  time: number
  bytes: number
}

/** Оценка скорости и оставшегося времени по последним замерам. */
function useTransferStats(state: PublishState) {
  const samples = useRef<Sample[]>([])
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (state.status !== 'running') return
    const timer = window.setInterval(() => setNow(performance.now()), 400)
    return () => window.clearInterval(timer)
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'running') return
    const bytes = state.progress?.bytesSent ?? 0
    const last = samples.current[samples.current.length - 1]
    if (last && last.bytes === bytes && performance.now() - last.time < 2000) return
    samples.current.push({ time: performance.now(), bytes })
    if (samples.current.length > 40) samples.current.shift()
  }, [state.progress?.bytesSent, state.status])

  return useMemo(() => {
    const bytesTotal = state.progress?.bytesTotal ?? 0
    const bytesSent = state.progress?.bytesSent ?? 0
    const list = samples.current
    const recent = list.filter((sample) => now - sample.time < 4000)
    let speed = 0
    if (recent.length >= 2) {
      const first = recent[0]!
      const last = recent[recent.length - 1]!
      const deltaSeconds = (last.time - first.time) / 1000
      if (deltaSeconds > 0.2) speed = (last.bytes - first.bytes) / deltaSeconds
    }
    const remaining = Math.max(0, bytesTotal - bytesSent)
    const eta = speed > 1024 && remaining > 0 ? remaining / speed : null
    const share = bytesTotal > 0 ? Math.min(1, bytesSent / bytesTotal) : state.status === 'done' ? 1 : 0
    return { speed, eta, share, bytesSent, bytesTotal, elapsed: (now - (state.startedAt || now)) / 1000 }
  }, [state.progress, state.status, state.startedAt, now])
}

export function ProgressPanel({ state, onCancel, onRetry, onRestart }: Props) {
  const stats = useTransferStats(state)
  const progress = state.progress

  if (state.status === 'done' && state.result) {
    return <SuccessPanel state={state} onRestart={onRestart} />
  }

  const percent = Math.round(stats.share * 100)

  return (
    <section className="card progress-card">
      <header className="card-head">
        <h2>
          {state.status === 'error' ? (
            <>
              <Alert size={20} /> Не получилось
            </>
          ) : state.status === 'canceled' ? (
            <>
              <Close size={20} /> Загрузка остановлена
            </>
          ) : (
            <>
              <Spinner size={20} /> Публикуем проект
            </>
          )}
        </h2>
        {state.status === 'running' && <p className="muted">{formatSeconds(stats.elapsed)} прошло</p>}
      </header>

      {state.status === 'error' && (
        <p className="notice notice-error">
          <Alert size={18} /> {state.error}
        </p>
      )}
      {state.status === 'canceled' && (
        <p className="notice notice-warn">
          <Alert size={18} /> {state.error} Незавершённые файлы не попали в репозиторий.
        </p>
      )}

      <div className="meter">
        <div className="meter-head">
          <span>{progress?.label ?? 'Подготовка…'}</span>
          <span className="mono">{percent}%</span>
        </div>
        <div className="meter-track">
          <div className={`meter-fill${state.status === 'running' ? ' is-live' : ''}`} style={{ width: `${Math.max(2, percent)}%` }} />
        </div>
      </div>

      <dl className="stat-grid">
        <div>
          <dt>Файлы</dt>
          <dd>
            {formatNumber(progress?.done ?? 0)} / {formatNumber(progress?.total ?? 0)}
          </dd>
        </div>
        <div>
          <dt>Передано</dt>
          <dd>
            {formatBytes(stats.bytesSent)} / {formatBytes(stats.bytesTotal)}
          </dd>
        </div>
        <div>
          <dt>Скорость</dt>
          <dd>{stats.speed > 0 ? `${formatBytes(stats.speed)}/с` : '—'}</dd>
        </div>
        <div>
          <dt>Осталось</dt>
          <dd>{state.status === 'running' && stats.eta ? `≈ ${formatSeconds(stats.eta)}` : '—'}</dd>
        </div>
      </dl>

      {progress?.currentPath && state.status === 'running' && (
        <p className="current-file mono">
          <Zap size={14} /> {truncateMiddle(progress.currentPath, 72)}
        </p>
      )}

      {(progress?.bytesReused ?? 0) > 0 && (
        <p className="notice notice-ok">
          <Check size={18} /> {formatBytes(progress!.bytesReused)} содержимого уже есть в репозитории — повторно не
          отправляем.
        </p>
      )}

      <div className="row-actions">
        {state.status === 'running' ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            <Close size={16} /> Отменить
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              <Refresh size={16} /> Попробовать снова
            </button>
            <button type="button" className="btn btn-ghost" onClick={onRestart}>
              Начать заново
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function SuccessPanel({ state, onRestart }: { state: PublishState; onRestart: () => void }) {
  const result = state.result!
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 1600)
    } catch {
      setCopied(null)
    }
  }

  return (
    <section className="card success-card">
      <div className="success-badge">
        <Check size={30} />
      </div>
      <h2>Проект в GitHub 🎉</h2>
      <p className="muted">
        {result.repoCreated ? 'Репозиторий создан, файлы уже внутри — ветка ' : 'Файлы уже в репозитории '}
        {!result.repoCreated && (
          <>
            <strong>
              {result.owner}/{result.repo}
            </strong>{' '}
            — ветка{' '}
          </>
        )}
        <code>{result.branch}</code>.
      </p>

      <dl className="stat-grid">
        <div>
          <dt>Отправлено файлов</dt>
          <dd>{formatNumber(result.uploadedCount)}</dd>
        </div>
        <div>
          <dt>Передано данных</dt>
          <dd>{formatBytes(result.bytesSent)}</dd>
        </div>
        <div>
          <dt>Не пришлось передавать</dt>
          <dd>{formatNumber(result.reusedCount)} файлов</dd>
        </div>
        <div>
          <dt>Время</dt>
          <dd>{formatSeconds(result.elapsedMs / 1000)}</dd>
        </div>
      </dl>

      <div className="link-row">
        <a className="btn btn-primary" href={result.repoUrl} target="_blank" rel="noreferrer">
          <GitHubMark size={18} /> Открыть репозиторий
        </a>
        <a className="btn" href={result.commitUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Посмотреть коммит
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => copy(result.commitSha, 'sha')}>
          <Copy size={16} /> {copied === 'sha' ? 'Коммит скопирован' : result.commitSha.slice(0, 7)}
        </button>
      </div>

      <p className="muted small">
        Файлов на GitHub-странице может быть меньше, чем загружено: там не показываются скрытые (.env.example) и
        слишком крупные файлы. Локальные файлы мы не удаляем и не изменяем.
      </p>

      <button type="button" className="btn btn-ghost" onClick={onRestart}>
        Загрузить ещё один проект
      </button>
    </section>
  )
}
