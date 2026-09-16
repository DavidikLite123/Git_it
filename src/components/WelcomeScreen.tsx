import { Check, ExternalLink, GitHubMark, Lock, Logo, Rocket, UploadCloud, Zap } from './Icons'
import { SecurityNote } from './SecurityNote'
import {
  AGREEMENT_UPDATED_AT,
  AGREEMENT_URL,
  AGREEMENT_VERSION,
  formatAcceptanceDate,
  type AgreementAcceptance,
} from '../lib/agreement'

interface Props {
  onStart: () => void
  /** Перечитать уже принятое соглашение */
  onReadAgreement: () => void
  /** Действующая версия соглашения уже принята */
  agreementAccepted: boolean
  acceptance: AgreementAcceptance | null
}

const STEPS: Array<{ title: string; text: string }> = [
  {
    title: 'Подключите GitHub',
    text: 'Вставьте токен доступа — он останется только в вашем браузере и уйдёт лишь на api.github.com.',
  },
  {
    title: 'Перетащите проект',
    text: 'Папка, ZIP-архив или отдельные файлы. Служебное (node_modules, .git, .env) отсечётся само.',
  },
  {
    title: 'Выберите репозиторий',
    text: 'Новый — личный или в организации, либо существующий с нужной веткой и подпапкой.',
  },
  {
    title: 'Нажмите «Загрузить»',
    text: 'Git it соберёт файлы в git-объекты и создаст коммит — один или несколько, если проект большой.',
  },
]

export function WelcomeScreen({ onStart, onReadAgreement, agreementAccepted, acceptance }: Props) {
  return (
    <div className="welcome">
      <section className="hero">
        <span className="hero-badge">
          <Logo size={16} /> Git it · выгрузка проектов в GitHub
        </span>
        <h1>
          Перетащите папку с проектом — <span className="gradient-text">остальное сделает Git it</span>
        </h1>
        <p className="muted">
          Никакой командной строки, <code>git init</code> и разговоров про remote. Вы выбираете проект и репозиторий,
          а Git it собирает из файлов настоящий коммит через GitHub API и показывает, что происходит на каждом шаге.
        </p>
      </section>

      <section className="grid-cards">
        <article className="mini-card">
          <span className="mini-icon">
            <UploadCloud size={20} />
          </span>
          <h3>Папка, ZIP или файлы</h3>
          <p className="muted small">
            Перетаскивание, выбор каталога и разбор архивов — включая ZIP64 и кириллические имена.
          </p>
        </article>
        <article className="mini-card">
          <span className="mini-icon">
            <Zap size={20} />
          </span>
          <h3>Без мусора и дублей</h3>
          <p className="muted small">
            Лишнее исключается по правилам .gitignore, а уже загруженные файлы не передаются повторно.
          </p>
        </article>
        <article className="mini-card">
          <span className="mini-icon">
            <Rocket size={20} />
          </span>
          <h3>Большие проекты — частями</h3>
          <p className="muted small">
            Десятки тысяч файлов уходят несколькими коммитами: прогресс, скорость и понятные ошибки.
          </p>
        </article>
        <article className="mini-card">
          <span className="mini-icon">
            <Lock size={20} />
          </span>
          <h3>Без сервера посередине</h3>
          <p className="muted small">
            Это статическая страница: токен и код не проходят через чужие серверы — у приложения их просто нет.
          </p>
        </article>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Как это работает</h2>
        </header>
        <ol className="how-list">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="how-index">{index + 1}</span>
              <span className="how-text">
                <strong>{step.title}</strong>
                <span className="muted small">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <SecurityNote />

      <section className="card welcome-start">
        <div>
          <h2>Поехали?</h2>
          <p className="muted">
            {agreementAccepted
              ? 'Соглашение уже принято — можно сразу переходить к делу. Перечитать его можно в любой момент.'
              : 'Перед началом нужно ознакомиться с лицензионным соглашением — это займёт пару минут. Дочитайте его до конца: кнопка согласия появится только тогда, когда вы действительно дойдёте до последнего абзаца.'}
          </p>
          {agreementAccepted ? (
            <p className="notice notice-ok">
              <Check size={18} /> Соглашение версии {AGREEMENT_VERSION} принято{' '}
              {acceptance ? formatAcceptanceDate(acceptance.acceptedAt) : ''} — нажмите «Начать», и сразу откроется
              рабочий экран.{' '}
              <button type="button" className="link-btn" onClick={onReadAgreement}>
                Перечитать соглашение
              </button>
            </p>
          ) : acceptance && acceptance.version !== AGREEMENT_VERSION ? (
            <p className="notice notice-warn">
              <Check size={18} /> Раньше вы приняли версию {acceptance.version} ({formatAcceptanceDate(acceptance.acceptedAt)}
              ). Вышла новая версия — прочитайте её и подтвердите согласие заново.
            </p>
          ) : (
            <p className="notice notice-info">
              <Lock size={18} /> Принимать согласие нужно один раз: отметка сохранится в этом браузере. Перечитать
              соглашение можно в любой момент — ссылка есть в подвале страницы.
            </p>
          )}
        </div>
        <div className="welcome-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
            Начать
          </button>
          <a className="btn btn-ghost" href={AGREEMENT_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Открыть текст на GitHub
          </a>
        </div>
      </section>

      <p className="muted small center">
        <GitHubMark size={14} /> Текущая версия соглашения: {AGREEMENT_VERSION} от {AGREEMENT_UPDATED_AT}. Git it не
        связан с GitHub Inc. и работает только с вашими правами доступа.
      </p>
    </div>
  )
}
