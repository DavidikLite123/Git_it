/** Мелкие утилиты форматирования и определения типа файла. */

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1000) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = value >= 100 ? 0 : value >= 10 ? fractionDigits - 1 : fractionDigits
  return `${value.toFixed(Math.max(0, digits))} ${units[unit]}`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value)
}

/** Русское склонение: plural(2, ['файл', 'файла', 'файлов']) → 'файла'. */
export function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function formatFiles(count: number): string {
  return `${formatNumber(count)} ${plural(count, ['файл', 'файла', 'файлов'])}`
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 1) return 'меньше секунды'
  if (seconds < 60) return `${Math.round(seconds)} с`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes} мин ${rest} с`
}

/** Обрезает длинный путь в середине: `src/components/Very…Long/File.tsx`. */
export function truncateMiddle(text: string, max = 56): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  if (!name.includes('.')) return ''
  return name.slice(name.lastIndexOf('.') + 1).toLowerCase()
}

const EXTENSION_COLORS: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#f0db4f',
  jsx: '#f0db4f',
  mjs: '#f0db4f',
  cjs: '#f0db4f',
  json: '#cbcb41',
  html: '#e34c26',
  css: '#563d7c',
  scss: '#c6538c',
  vue: '#41b883',
  svelte: '#ff3e00',
  py: '#3572a5',
  rb: '#701516',
  go: '#00add8',
  rs: '#dea584',
  java: '#b07219',
  kt: '#a97bff',
  swift: '#f05138',
  php: '#4f5d95',
  cs: '#178600',
  c: '#555555',
  h: '#555555',
  cpp: '#f34b7d',
  hpp: '#f34b7d',
  sh: '#89e051',
  yml: '#6a8759',
  yaml: '#6a8759',
  toml: '#9c4221',
  md: '#519aba',
  sql: '#e38c00',
  dockerfile: '#0db7ed',
}

/** Цвет маркера рядом с именем файла — помогает быстро читать список. */
export function colorForPath(path: string): string {
  const ext = extensionOf(path)
  if (EXTENSION_COLORS[ext]) return EXTENSION_COLORS[ext]
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (name.startsWith('dockerfile')) return EXTENSION_COLORS.dockerfile!
  if (name === 'license' || name.startsWith('license.')) return '#d0bf41'
  return 'var(--dot-default, #64748b)'
}
