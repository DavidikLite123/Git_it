import { Alert, Check, ExternalLink, GitHubMark, Shield } from './Icons'
import { OFFICIAL_DOMAIN, REPO_URL, VIRUSTOTAL_CHECK, VIRUSTOTAL_REPORT_URL } from '../lib/security'

/** Риски, о которых честно предупреждаем до входа токена. */
const RISKS: string[] = [
  'Токен даёт доступ к аккаунту в объёме выданных прав: если его украдут, злоумышленник сможет делать то же, что и вы.',
  'Приложение выполняется в браузере и не проходило независимый аудит: вредоносное расширение или поддельная копия сайта по другому адресу теоретически могли бы перехватить токен.',
  '100% гарантии от сбоев GitHub API нет: очень большие проекты и редкие имена файлов иногда приводят к ошибкам — приложение объяснит их и предложит повторить.',
  'Лицензионное соглашение обязательно дочитать до конца — отметка о принятии сохраняется локально в вашем браузере.',
]

/** Как снизить риски — короткие практические правила. */
const TIPS: string[] = [
  'Используйте токен с минимальными правами: лучше всего fine-grained токен — только нужные репозитории, только запись содержимого и короткий срок действия.',
  'Отзывайте токен в настройках GitHub сразу после использования — это мгновенно закрывает доступ.',
  'Не загружайте файлы с паролями, ключами и секретами — даже случайно.',
  `Проверяйте адрес в браузере: единственный официальный сайт — ${OFFICIAL_DOMAIN}.`,
  'Не передавайте токен никому и не сохраняйте его в файлах проекта.',
]

/**
 * Карточка «Риски и рекомендации» на приветственном экране: честно говорим,
 * о чём стоит помнить, и подсказываем, как работать безопасно.
 */
export function SecurityNote() {
  return (
    <section className="card security-card">
      <header className="card-head">
        <h2>
          <Shield size={20} /> Безопасность: риски и рекомендации
        </h2>
        <p className="muted">
          Git it работает с вашим токеном доступа, поэтому честно рассказываем, о чём важно помнить и как себя
          обезопасить.
        </p>
      </header>

      <div className="security-grid">
        <div className="security-col">
          <h3 className="security-title security-title-risk">
            <Alert size={16} /> О чём важно помнить
          </h3>
          <ul className="security-list">
            {RISKS.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>

        <div className="security-col">
          <h3 className="security-title security-title-ok">
            <Check size={16} /> Как себя обезопасить
          </h3>
          <ul className="security-list">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="notice notice-ok trust-note">
        <Shield size={18} />
        <div className="trust-text">
          <span>
            <strong>Почему нам можно доверять.</strong> У Git it нет серверной части и скрытых запросов: токен
            хранится только в вашем браузере и отправляется исключительно на <code>api.github.com</code> по HTTPS, а
            файлы уходят прямо в GitHub. Исходный код полностью открыт (лицензия MIT) — его может прочитать и
            проверить каждый.
          </span>
          <span className="vt-badge">
            <Check size={16} />
            <span>
              Официальный сайт <code>{OFFICIAL_DOMAIN}</code> проверен в VirusTotal {VIRUSTOTAL_CHECK.checkedAt}:{' '}
              <strong>{VIRUSTOTAL_CHECK.detections} обнаружений</strong> — ни один из 90 антивирусных вендоров не
              пометил сайт как вредоносный (включая Google Safe Browsing и Kaspersky).
            </span>
          </span>
          <span className="trust-links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubMark size={14} /> Исходный код открыт
            </a>
            <a href={VIRUSTOTAL_REPORT_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Отчёт проверки в VirusTotal ({VIRUSTOTAL_CHECK.detections})
            </a>
          </span>
        </div>
      </div>
    </section>
  )
}
