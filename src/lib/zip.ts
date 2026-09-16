/**
 * Минимальный, но честный читатель ZIP прямо в браузере — без внешних библиотек.
 *
 * Разбирается центральный каталог (включая ZIP64), содержимое распаковывается
 * лениво через `DecompressionStream('deflate-raw')`, поэтому архив целиком в
 * память не выгружается.
 */

const EOCD_SIGNATURE = 0x06054b50
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const LOCAL_HEADER_SIGNATURE = 0x04034b50

const METHODS = { store: 0, deflate: 8 } as const

/** Сколько первых байт по умолчанию отдавать «пробником». */
const PREVIEW_LIMIT = 256 * 1024

export class ZipError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ZipError'
  }
}

export interface ZipEntry {
  /** Путь внутри архива, уже нормализованный (`src/app.ts`) */
  path: string
  /** Размер после распаковки, байт */
  size: number
  compressedSize: number
  /** Каталог, а не файл */
  directory: boolean
  method: number
  crc32: number
  /** Читает и распаковывает содержимое по требованию */
  read(): Promise<Uint8Array>
  /** Читает только первые байты файла — для больших файлов, которые GitHub не примет */
  readPreview?(limit?: number): Promise<Uint8Array>
}

export interface ZipArchive {
  entries: ZipEntry[]
  /** Суммарный размер распакованных файлов */
  totalSize: number
}

interface CentralRecord {
  path: string
  flags: number
  method: number
  crc32: number
  compressedSize: number
  size: number
  localOffset: number
  directory: boolean
}

/** Декодирует имя файла: UTF-8 по флагу или по факту, иначе CP866 (частая кодировка в RU-ZIP). */
function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder('utf-8').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('ibm866').decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  }
}

/** Ищет End Of Central Directory, идя от конца файла. */
function findEndOfCentralDirectory(view: DataView): number {
  const maxBack = Math.min(view.byteLength, 0xffff + 22)
  for (let offset = view.byteLength - 22; offset >= view.byteLength - maxBack; offset--) {
    if (offset < 0) break
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset
  }
  return -1
}

export async function readZip(blob: Blob): Promise<ZipArchive> {
  if (blob.size < 22) throw new ZipError('Файл слишком мал, чтобы быть ZIP-архивом.')

  const tailLength = Math.min(blob.size, 0xffff + 22 + 64)
  const tailStart = blob.size - tailLength
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer())

  const eocdRelative = findEndOfCentralDirectory(tail)
  if (eocdRelative < 0) {
    throw new ZipError('Не удалось найти оглавление архива — файл повреждён или это не ZIP.')
  }

  let entryCount = tail.getUint16(eocdRelative + 10, true)
  let directorySize = tail.getUint32(eocdRelative + 12, true)
  let directoryOffset = tail.getUint32(eocdRelative + 16, true)

  // ZIP64: 32-битных полей не хватило
  if (entryCount === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    const zip64 = readZip64Directory(tail, eocdRelative, tailStart, blob.size)
    if (zip64) {
      entryCount = zip64.entryCount
      directorySize = zip64.directorySize
      directoryOffset = zip64.directoryOffset
    }
  }

  if (directoryOffset + directorySize > blob.size) {
    throw new ZipError('Оглавление архива выходит за границы файла — архив повреждён.')
  }

  const directory = new DataView(await blob.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer())
  const records = readCentralDirectory(directory, entryCount)

  const entries: ZipEntry[] = []
  for (const record of records) {
    entries.push({
      path: record.path,
      size: record.size,
      compressedSize: record.compressedSize,
      directory: record.directory,
      method: record.method,
      crc32: record.crc32,
      read: () => readEntryData(blob, record),
      readPreview: (limit?: number) => readEntryPreview(blob, record, limit ?? PREVIEW_LIMIT),
    })
  }

  return { entries, totalSize: entries.reduce((sum, entry) => sum + entry.size, 0) }
}

function readZip64Directory(
  tail: DataView,
  eocdRelative: number,
  tailStart: number,
  fileSize: number,
): { entryCount: number; directorySize: number; directoryOffset: number } | null {
  const locatorRelative = eocdRelative - 20
  if (locatorRelative < 0) return null
  if (tail.getUint32(locatorRelative, true) !== ZIP64_LOCATOR_SIGNATURE) return null
  const zip64Offset = Number(tail.getBigUint64(locatorRelative + 8, true))
  if (zip64Offset + 56 > fileSize) return null
  // читаем ZIP64 EOCD отдельно, если он не попал в хвост
  const relative = zip64Offset - tailStart
  if (relative < 0) return null
  if (tail.getUint32(relative, true) !== ZIP64_EOCD_SIGNATURE) return null
  return {
    entryCount: Number(tail.getBigUint64(relative + 32, true)),
    directorySize: Number(tail.getBigUint64(relative + 40, true)),
    directoryOffset: Number(tail.getBigUint64(relative + 48, true)),
  }
}

/** Разбирает поля ZIP64-расширения для конкретной записи. */
function readZip64Extra(
  extra: DataView,
  need: { size: boolean; compressedSize: boolean; localOffset: boolean },
): { size?: number; compressedSize?: number; localOffset?: number } {
  let offset = 0
  while (offset + 4 <= extra.byteLength) {
    const id = extra.getUint16(offset, true)
    const length = extra.getUint16(offset + 2, true)
    const bodyStart = offset + 4
    if (bodyStart + length > extra.byteLength) break
    if (id === 0x0001) {
      let cursor = bodyStart
      const result: { size?: number; compressedSize?: number; localOffset?: number } = {}
      if (need.size && cursor + 8 <= bodyStart + length) {
        result.size = Number(extra.getBigUint64(cursor, true))
        cursor += 8
      }
      if (need.compressedSize && cursor + 8 <= bodyStart + length) {
        result.compressedSize = Number(extra.getBigUint64(cursor, true))
        cursor += 8
      }
      if (need.localOffset && cursor + 8 <= bodyStart + length) {
        result.localOffset = Number(extra.getBigUint64(cursor, true))
      }
      return result
    }
    offset = bodyStart + length
  }
  return {}
}

function readCentralDirectory(directory: DataView, maxEntries: number): CentralRecord[] {
  const records: CentralRecord[] = []
  let offset = 0
  while (offset + 46 <= directory.byteLength && records.length < maxEntries) {
    if (directory.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE) break
    const flags = directory.getUint16(offset + 8, true)
    const method = directory.getUint16(offset + 10, true)
    const crc32 = directory.getUint32(offset + 16, true)
    let compressedSize = directory.getUint32(offset + 20, true)
    let size = directory.getUint32(offset + 24, true)
    const nameLength = directory.getUint16(offset + 28, true)
    const extraLength = directory.getUint16(offset + 30, true)
    const commentLength = directory.getUint16(offset + 32, true)
    let localOffset = directory.getUint32(offset + 42, true)

    const nameStart = offset + 46
    const extraStart = nameStart + nameLength
    const rawName = new Uint8Array(directory.buffer, directory.byteOffset + nameStart, nameLength)
    const path = decodeName(rawName, (flags & 0x800) !== 0).replace(/\\/g, '/')

    if (size === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      const extra = new DataView(directory.buffer, directory.byteOffset + extraStart, extraLength)
      const zip64 = readZip64Extra(extra, {
        size: size === 0xffffffff,
        compressedSize: compressedSize === 0xffffffff,
        localOffset: localOffset === 0xffffffff,
      })
      if (zip64.size !== undefined) size = zip64.size
      if (zip64.compressedSize !== undefined) compressedSize = zip64.compressedSize
      if (zip64.localOffset !== undefined) localOffset = zip64.localOffset
    }

    records.push({
      path,
      flags,
      method,
      crc32,
      compressedSize,
      size,
      localOffset,
      directory: path.endsWith('/') || size === 0 && path.endsWith('/'),
    })

    offset = extraStart + extraLength + commentLength
  }
  return records
}

/**
 * Читает только начало файла. Для сжатых записей распаковка идёт потоком и
 * прерывается, как только набралось достаточно байт, — распаковывать гигабайты
 * целиком не нужно.
 */
async function readEntryPreview(blob: Blob, record: CentralRecord, limit: number): Promise<Uint8Array> {
  if (record.flags & 0x1) return new Uint8Array(0)

  const header = new DataView(await blob.slice(record.localOffset, record.localOffset + 30).arrayBuffer())
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) return new Uint8Array(0)
  const nameLength = header.getUint16(26, true)
  const extraLength = header.getUint16(28, true)
  const dataStart = record.localOffset + 30 + nameLength + extraLength
  const dataEnd = Math.min(dataStart + record.compressedSize, blob.size)

  if (record.method === METHODS.store) {
    const end = Math.min(dataStart + limit, dataEnd)
    return new Uint8Array(await blob.slice(dataStart, end).arrayBuffer())
  }
  if (record.method !== METHODS.deflate || typeof DecompressionStream === 'undefined') return new Uint8Array(0)

  const reader = blob.slice(dataStart, dataEnd).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const needed = limit - total
      const piece = value.length > needed ? value.subarray(0, needed) : value
      chunks.push(piece)
      total += piece.length
    }
  } catch {
    /* повреждённый хвост потока для пробника не важен */
  } finally {
    void reader.cancel().catch(() => undefined)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function readEntryData(blob: Blob, record: CentralRecord): Promise<Uint8Array> {
  if (record.flags & 0x1) {
    throw new ZipError(`Файл «${record.path}» защищён паролем — такие архивы не поддерживаются.`)
  }

  const header = new DataView(await blob.slice(record.localOffset, record.localOffset + 30).arrayBuffer())
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new ZipError(`Повреждена запись файла «${record.path}» в архиве.`)
  }
  const nameLength = header.getUint16(26, true)
  const extraLength = header.getUint16(28, true)
  const dataStart = record.localOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + record.compressedSize
  if (dataEnd > blob.size) {
    throw new ZipError(`Файл «${record.path}» выходит за границы архива.`)
  }

  const raw = new Uint8Array(await blob.slice(dataStart, dataEnd).arrayBuffer())

  if (record.method === METHODS.store) return raw
  if (record.method !== METHODS.deflate) {
    throw new ZipError(
      `Файл «${record.path}» сжат методом ${record.method} — поддерживаются только store и deflate. Перепакуйте архив без bzip2/LZMA.`,
    )
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('Браузер не поддерживает распаковку deflate. Обновите браузер или распакуйте архив вручную.')
  }

  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}
