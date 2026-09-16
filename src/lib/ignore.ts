/**
 * Сопоставление путей с шаблонами в стиле .gitignore.
 *
 * Поддерживается: `*`, `?`, `**`, символьные классы `[abc]`, шаблоны с якорем
 * (`docs/build`), «любой сегмент» (`node_modules`), каталоги с завершающим `/`
 * и отрицания через `!`.
 */

export interface IgnoreRule {
  /** Исходный шаблон (без ведущего `!`) */
  pattern: string
  negated: boolean
  regex: RegExp
}

const REGEX_SPECIALS = '^$.|+(){}'

function escapeChar(char: string): string {
  return REGEX_SPECIALS.includes(char) ? '\\' + char : char
}

/** Превращает glob (без якоря) в тело регулярного выражения. */
export function globToRegexBody(glob: string): string {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!

    if (char === '*') {
      if (glob[i + 1] === '*') {
        let next = i + 2
        if (glob[next] === '/') {
          // `**/` — ноль или больше каталогов
          out += '(?:.*/)?'
          i = next
        } else {
          out += '.*'
          i = next - 1
        }
      } else {
        out += '[^/]*'
      }
      continue
    }

    if (char === '?') {
      out += '[^/]'
      continue
    }

    if (char === '[') {
      const cls = readCharClass(glob, i)
      if (cls) {
        out += cls.regex
        i = cls.end
        continue
      }
      out += '\\['
      continue
    }

    out += escapeChar(char)
  }
  return out
}

/** Читает `[...]` начиная с позиции `start`. Возвращает null, если это не класс. */
function readCharClass(glob: string, start: number): { regex: string; end: number } | null {
  let i = start + 1
  let negated = false
  if (glob[i] === '!' || glob[i] === '^') {
    negated = true
    i++
  }
  let body = ''
  if (glob[i] === ']') {
    body += '\\]'
    i++
  }
  for (; i < glob.length; i++) {
    const char = glob[i]!
    if (char === ']') {
      return { regex: `[${negated ? '^' : ''}${body}]`, end: i }
    }
    body += char === '\\' || char === '^' ? '\\' + char : char
  }
  return null
}

/** Собирает регулярное выражение для одного шаблона .gitignore. */
export function ruleToRegex(rawPattern: string): RegExp {
  // завершающий слэш означает «каталог», а для сопоставления он не нужен
  const pattern = rawPattern.replace(/^\/+/, '').replace(/\/+$/, '')
  const anchored = pattern.includes('/')
  const body = globToRegexBody(pattern)
  const head = anchored ? '^' : '(?:^|/)'
  // совпадает либо с самим путём, либо с чем-то внутри него
  return new RegExp(head + body + '(?:/|$)')
}

/**
 * Разбирает список шаблонов (по строкам, с поддержкой комментариев и `!`).
 * На вход можно подать как одну строку с переносами, так и массив строк —
 * элементы массива тоже разбиваются по строкам, поэтому список правил,
 * собранный из нескольких источников, разбирается одинаково.
 */
export function parsePatterns(source: string | string[]): IgnoreRule[] {
  const lines = (Array.isArray(source) ? source : [source]).flatMap((part) => part.split(/\r?\n/))
  const rules: IgnoreRule[] = []
  for (const raw of lines) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    let negated = false
    if (line.startsWith('!')) {
      negated = true
      line = line.slice(1).trim()
      if (!line) continue
    }
    line = line.replace(/^\.\//, '').replace(/^\/+/, '')
    if (line.endsWith('/')) {
      // каталог: совпадает и сам каталог, и всё внутри него
      line = line.replace(/\/+$/, '')
      if (!line) continue
    }
    if (!line) continue
    rules.push({ pattern: line, negated, regex: ruleToRegex(line) })
  }
  return rules
}

/**
 * Компилирует правила в функцию-предикат. Последнее совпавшее правило побеждает
 * (как в git), поэтому отрицания `!` могут вернуть файл обратно.
 */
export function compileIgnore(source: string | string[]): (path: string) => boolean {
  const rules = parsePatterns(source)
  return (path: string) => {
    const clean = normalizePath(path)
    if (!clean) return false
    let ignored = false
    for (const rule of rules) {
      if (rule.regex.test(clean)) ignored = !rule.negated
    }
    return ignored
  }
}

/** Приводит путь к виду `a/b/c`: без ведущих слешей, `./` и пустых сегментов. */
export function normalizePath(path: string): string {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (stack.length) stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

/** Единый список того, что не нужно тащить в репозиторий по умолчанию. */
export const DEFAULT_IGNORE_PATTERNS = [
  '# git и системные файлы',
  '.git/',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '__MACOSX/',
  '',
  '# зависимости',
  'node_modules/',
  'bower_components/',
  '.venv/',
  'venv/',
  '.venv*/',
  '__pycache__/',
  '*.py[cod]',
  '.pytest_cache/',
  '.mypy_cache/',
  '.ruff_cache/',
  '.gradle/',
  '.m2/',
  '',
  '# сборка, кэш, логи',
  'dist/',
  'build/',
  'out/',
  'target/',
  '.next/',
  '.nuxt/',
  '.output/',
  '.svelte-kit/',
  '.turbo/',
  '.cache/',
  '.parcel-cache/',
  'coverage/',
  '*.log',
  'npm-debug.log*',
  'yarn-error.log*',
  '',
  '# редакторы и ОС',
  '.idea/',
  '*.swp',
  '*~',
  '',
  '# секреты: их лучше не публиковать даже в приватном репозитории',
  '.env',
  '.env.*',
  '*.pem',
  '*.p12',
  'id_rsa*',
  '',
  '# архивы проектов',
  '*.zip',
  '*.tar.gz',
].join('\n')

/** Ограничения GitHub на размер одного файла через API. */
export const MAX_BLOB_SIZE = 100 * 1024 * 1024
/** Мягкое предупреждение: GitHub рекомендует держать файлы меньше 50 МБ. */
export const WARN_BLOB_SIZE = 50 * 1024 * 1024
