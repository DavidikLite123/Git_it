/**
 * Модель проекта: набор файлов с путями относительно корня проекта.
 *
 * Содержимое файлов читается лениво (`read()`), поэтому можно спокойно
 * «положить в Git it» проект на пару гигабайт — в память попадут только те
 * файлы, которые реально отправляются на GitHub.
 */

import { normalizePath } from './ignore'
import { readZip, ZipError } from './zip'

export type ProjectSource = 'folder' | 'zip' | 'files'

export interface ProjectFile {
  /** Путь относительно корня проекта: `src/main.ts`, без ведущего слэша */
  path: string
  size: number
  /** Ленивое чтение содержимого */
  read(): Promise<Uint8Array>
}

export interface Project {
  /** Предлагаемое имя репозитория */
  name: string
  files: ProjectFile[]
  totalSize: number
  source: ProjectSource
  /** Верхняя папка, которую «срезали» при импорте (имя папки или архива) */
  rootFolder: string | null
  /** Есть ли в проекте свои .gitignore и README */
  hasGitignore: boolean
  hasReadme: boolean
  /** Всё, что стоит показать пользователю перед публикацией */
  warnings: string[]
  /** Скан прерван из-за лимита файлов */
  truncated: boolean
}

export interface ScanProgress {
  files: number
  bytes: number
  current: string
}

/** Служебные каталоги систем контроля версий — их не загружаем никогда. */
const VCS_DIRS = new Set(['.git', '.hg', '.svn', '.bzr', 'CVS'])

/** Защита от «а давайте зальём весь диск»: столько файлов ещё разумно держать в памяти. */
export const MAX_FILES = 50_000

export function sanitizeRepoName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\.(zip|tar\.gz|tgz|tar)$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.\-_]+/, '')
    .replace(/[.\-_]+$/, '')
    .slice(0, 100)
  return cleaned || 'my-project'
}

export function isVcsPath(path: string): boolean {
  return path.split('/').some((segment) => VCS_DIRS.has(segment))
}

/** Общая первая папка у всех путей — либо null. */
export function commonTopFolder(paths: string[]): string | null {
  if (paths.length === 0) return null
  let root: string | null = null
  for (const path of paths) {
    const slash = path.indexOf('/')
    if (slash <= 0) return null
    const head = path.slice(0, slash)
    if (root === null) root = head
    else if (root !== head) return null
  }
  return root
}

function cutFirstSegment(path: string): string {
  const slash = path.indexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

/** Убирает дубликаты путей (побеждает последний) и сортирует список. */
export function dedupeByPath(files: ProjectFile[]): ProjectFile[] {
  const map = new Map<string, ProjectFile>()
  for (const file of files) map.set(file.path, file)
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

interface BuildOptions {
  source: ProjectSource
  name: string
  /** Срезать общую верхнюю папку */
  stripRoot: boolean
  rootFolder?: string | null
  warnings?: string[]
  truncated?: boolean
}

export function buildProject(rawFiles: ProjectFile[], options: BuildOptions): Project {
  let files = rawFiles.filter((file) => file.path && !isVcsPath(file.path))
  const detectedRoot = options.rootFolder ?? commonTopFolder(files.map((file) => file.path))
  const rootFolder = detectedRoot ?? null

  if (options.stripRoot && rootFolder) {
    files = files.map((file) => ({ ...file, path: cutFirstSegment(file.path) })).filter((file) => Boolean(file.path))
  }

  files = dedupeByPath(files)
  const paths = new Set(files.map((file) => file.path))

  return {
    name: sanitizeRepoName(options.name || rootFolder || 'my-project'),
    files,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    source: options.source,
    rootFolder,
    hasGitignore: paths.has('.gitignore'),
    hasReadme: [...paths].some((path) => /^readme(\.md|\.txt|\.rst)?$/i.test(path)),
    warnings: options.warnings ?? [],
    truncated: options.truncated ?? false,
  }
}

/* ------------------------------------------------------------------ */
/* Импорт из перетаскивания / выбора папки                             */
/* ------------------------------------------------------------------ */

function fileFromHandle(file: File, path: string): ProjectFile {
  return {
    path: normalizePath(path),
    size: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  }
}

/**
 * Обходит дерево каталогов (DataTransfer или File System Access API).
 * `entries` нужно получить синхронно в обработчике события — сам DataTransfer
 * после `await` уже недействителен.
 */
export async function scanEntries(
  entries: FileSystemEntry[],
  options: { onProgress?: (progress: ScanProgress) => void; signal?: AbortSignal; maxFiles?: number } = {},
): Promise<{ files: ProjectFile[]; truncated: boolean; rootFolder: string | null }> {
  const maxFiles = options.maxFiles ?? MAX_FILES
  const files: ProjectFile[] = []
  let bytes = 0
  let truncated = false

  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (files.length >= maxFiles) {
      truncated = true
      return
    }
    if (options.signal?.aborted) throw new DOMException('Сканирование отменено', 'AbortError')

    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      if (isVcsPath(prefix)) return
      files.push(fileFromHandle(file, prefix))
      bytes += file.size
      options.onProgress?.({ files: files.length, bytes, current: prefix })
      return
    }

    if (entry.isDirectory) {
      if (VCS_DIRS.has(entry.name)) return
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          reader.readEntries(resolve, reject)
        })
        if (batch.length === 0) break
        for (const child of batch) {
          await walk(child, prefix ? `${prefix}/${child.name}` : child.name)
          if (files.length >= maxFiles) {
            truncated = true
            return
          }
        }
      }
    }
  }

  for (const entry of entries) {
    await walk(entry, entry.name)
  }

  // общий корень вычисляет buildProject — по фактическим путям это надёжнее
  return { files, truncated, rootFolder: null }
}

/** Что отдаёт сканирование до сборки проекта: сырые файлы + найденный корень. */
export interface ZipScan {
  files: ProjectFile[]
  truncated: boolean
  rootFolder: string | null
  warnings: string[]
}

/** Служебный мусор, который macOS/Windows подкладывает в архивы. */
const JUNK_IN_ARCHIVE = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)/i

/** Собирает проект из списка `File` (в том числе из `<input type="file" webkitdirectory>`). */
export function scanFileList(fileList: FileList | File[]): { files: ProjectFile[]; rootFolder: string | null } {
  const files: ProjectFile[] = []
  for (const file of Array.from(fileList)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = normalizePath(relative && relative.length > 0 ? relative : file.name)
    if (!path) continue
    files.push(fileFromHandle(file, path))
  }
  const rootFolder = commonTopFolder(files.map((file) => file.path))
  return { files, rootFolder }
}

/**
 * Читает ZIP-архив и отдаёт список файлов вместе с найденной внутри корневой
 * папкой — ровно в том виде, в каком его ждёт `buildProject`.
 */
export async function projectFromZip(file: File, onProgress?: (progress: ScanProgress) => void): Promise<ZipScan> {
  let archive
  try {
    archive = await readZip(file)
  } catch (error) {
    if (error instanceof ZipError) throw error
    throw new ZipError(`Не удалось прочитать архив: ${(error as Error).message}`, { cause: error })
  }

  const files: ProjectFile[] = []
  let bytes = 0
  for (const entry of archive.entries) {
    if (entry.directory) continue
    const path = normalizePath(entry.path)
    if (!path || isVcsPath(path) || JUNK_IN_ARCHIVE.test(path)) continue
    files.push({ path, size: entry.size, read: entry.read })
    bytes += entry.size
    if (files.length % 250 === 0) onProgress?.({ files: files.length, bytes, current: path })
  }
  onProgress?.({ files: files.length, bytes, current: '' })

  const warnings: string[] = []
  if (archive.entries.some((entry) => entry.method !== 0 && entry.method !== 8)) {
    warnings.push('В архиве есть файлы с экзотическим сжатием — их не получится распаковать.')
  }
  if (file.size > 700 * 1024 * 1024) {
    warnings.push('Архив очень большой: распаковка может занять время и много памяти.')
  }

  const truncated = files.length > MAX_FILES
  const kept = truncated ? files.slice(0, MAX_FILES) : files

  return {
    files: kept,
    truncated,
    rootFolder: commonTopFolder(kept.map((entry) => entry.path)),
    warnings,
  }
}

/** Собирает данные из события drag & drop. Вызывать синхронно из обработчика. */
export function entriesFromDataTransfer(dataTransfer: DataTransfer): FileSystemEntry[] {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  return entries
}
