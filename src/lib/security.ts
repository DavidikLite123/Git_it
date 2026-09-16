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
 * Страница проверки адресов в VirusTotal. Мы сознательно не утверждаем,
 * что сайт «уже проверен»: пользователь в любой момент может проверить
 * официальный адрес сам — ссылка ведёт прямо на сканер.
 */
export const VIRUSTOTAL_URL = 'https://www.virustotal.com/gui/home/url'
