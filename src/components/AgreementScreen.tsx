import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Info, Lock } from './Icons'
import {
  AGREEMENT_SECTIONS,
  AGREEMENT_UPDATED_AT,
  AGREEMENT_VERSION,
  AGREEMENT_URL,
  evaluateAgreementScroll,
  formatAcceptanceDate,
  type AgreementAcceptance,
} from '../lib/agreement'

interface Props {
  acceptance: AgreementAcceptance | null
  onAccept: () => void
  onBack: () => void
  /** Просмотр уже принятого соглашения — без требования дочитать и подтверждать */
  readOnly?: boolean
}

export function AgreementScreen({ acceptance, onAccept, onBack, readOnly = false }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [readToEnd, setReadToEnd] = useState(readOnly)

  const sections = AGREEMENT_SECTIONS
  const wordCount = useMemo(
    () => sections.reduce((sum, section) => sum + section.paragraphs.join(' ').split(/\s+/).length, 0),
    [sections],
  )

  const measure = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    const { atEnd, percent } = evaluateAgreementScroll({
      scrollTop: box.scrollTop,
      scrollHeight: box.scrollHeight,
      clientHeight: box.clientHeight,
    })
    setProgress(percent)
    if (atEnd) setReadToEnd(true)
  }, [])

  // замеряем сразу после отрисовки: если текст целиком помещается на экран,
  // соглашаться можно без прокрутки (иначе на огромных мониторах было бы не пройти дальше)
  useEffect(() => {
    measure()
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [measure])

  const canAccept = readOnly || readToEnd

  return (
    <div className="agreement">
      <section className="card agreement-card">
        <header className="card-head">
          <span className="card-step">Обязательный шаг</span>
          <h2>
            {readOnly ? 'Лицензионное соглашение' : 'Прочитайте и примите соглашение'}
          </h2>
          <p className="muted">
            Версия {AGREEMENT_VERSION} от {AGREEMENT_UPDATED_AT} · примерно {wordCount} слов. Дочитайте текст до конца:
            кнопка согласия станет активной только после этого — просто отметить галочку не получится.
          </p>
          {acceptance && (
            <p className="muted small">
              <Check size={14} /> Ранее принято {formatAcceptanceDate(acceptance.acceptedAt)} (версия{' '}
              {acceptance.version})
            </p>
          )}
        </header>

        <div className="agreement-progress" aria-hidden>
          <div className="agreement-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="muted small agreement-counter">
          {progress >= 100 ? 'Текст дочитан до конца — можно принимать' : `Прочитано ${progress}%`}
        </p>

        <div
          className="agreement-box"
          ref={boxRef}
          onScroll={measure}
          tabIndex={0}
          role="region"
          aria-label="Текст лицензионного соглашения"
        >
          <h3 className="agreement-title">Лицензионное соглашение Git it</h3>
          <p className="muted small">
            Используя веб-приложение «Git it», вы подтверждаете, что прочитали и принимаете условия ниже.
          </p>
          {sections.map((section) => (
            <section key={section.title} className="agreement-section">
              <h4>{section.title}</h4>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </section>
          ))}
          <p className="agreement-end">— Конец соглашения —</p>
        </div>

        <div className="agreement-actions">
          {!readOnly && (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Назад
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!canAccept}
            onClick={readOnly ? onBack : onAccept}
          >
            {readOnly ? 'Закрыть' : canAccept ? 'Принимаю соглашение' : 'Сначала дочитайте до конца'}
          </button>
          {!readOnly && (
            <a className="btn btn-ghost" href={AGREEMENT_URL} target="_blank" rel="noreferrer">
              Открыть текст на GitHub
            </a>
          )}
        </div>

        {!readOnly && (
          <p className="notice notice-info">
            <Info size={18} /> Принимая соглашение, вы подтверждаете, что имеете права на выгружаемые файлы, не
            публикуете секреты и чужие персональные данные и понимаете ограничения GitHub (в частности, файлы больше
            100 МБ через API не принимаются).
          </p>
        )}
        {!readOnly && (
          <p className="muted small">
            <Lock size={14} /> Отметка о принятии хранится в вашем браузере (localStorage) и никуда не отправляется.
            Соглашение можно перечитать в любой момент — ссылка есть в подвале страницы.
          </p>
        )}
      </section>
    </div>
  )
}
