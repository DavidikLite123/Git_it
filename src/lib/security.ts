/**
 * Общие константы безопасности: официальный адрес приложения и ссылки,
 * которые показываются пользователю в блоках «Риски и рекомендации».
 */

/** Единственный официальный адрес приложения — его просим проверять в строке браузера. */
export const OFFICIAL_DOMAIN = 'git-it-five.vercel.app'

/** Репозиторий с исходным кодом — код открыт, его может прочитать каждый. */
export const REPO_URL = 'https://github.com/DavidikLite123/Git_it'

/** Создание классического токена с правами, которые подставляем сами. */
export const CLASSIC_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Git%20it'

/** Создание fine-grained токена — рекомендуемый вариант с минимальными правами. */
export const FINE_GRAINED_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/** Отзыв токенов — сюда ведём пользователя после использования. */
export const REVOKE_TOKENS_URL = 'https://github.com/settings/tokens'

/**
 * Страница проверки адресов в VirusTotal — по ней пользователь может
 * перепроверить официальный сайт в любой момент.
 */
export const VIRUSTOTAL_URL = 'https://www.virustotal.com/gui/home/url'

/**
 * Отчёт VirusTotal об официальном сайте. Фактическая проверка выполнена
 * 16 сентября 2026: ни один вендор не пометил сайт как вредоносный.
 */
export const VIRUSTOTAL_REPORT_URL =
  'https://www.virustotal.com/gui/url/be612e538b4971fc25cb4a9d5c60869693f967231543091e28a4353782858051'

/** Итог проверки — для бейджа доверия. */
export const VIRUSTOTAL_CHECK = { checkedAt: '16 сентября 2026', detections: '0/90' }
