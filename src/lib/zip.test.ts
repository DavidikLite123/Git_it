import { describe, expect, it } from 'vitest'
import { readZip, ZipError } from './zip'

/* ------- мини-упаковщик ZIP, чтобы проверить парсер на реальных файлах ------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

interface EntryInput {
  name: string
  content?: string
  store?: boolean
}

async function makeZip(entries: EntryInput[]): Promise<Blob> {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff]
  const u32 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff]

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const raw = encoder.encode(entry.content ?? '')
    const method = entry.store ? 0 : 8
    const data = entry.store ? raw : await deflateRaw(raw)
    const crc = crc32(raw)

    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
    ])
    chunks.push(local, nameBytes, data)

    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(method),
        ...u16(0),
        ...u16(0),
        ...u32(crc),
        ...u32(data.length),
        ...u32(raw.length),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
        ...nameBytes,
      ]),
    )

    offset += local.length + nameBytes.length + data.length
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)
  const eocd = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ])

  return new Blob([...chunks, ...central, eocd] as BlobPart[])
}

/* --------------------------------- тесты --------------------------------- */

describe('readZip', () => {
  it('читает структуру и распаковывает сжатые файлы', async () => {
    const blob = await makeZip([
      { name: 'src/', content: '' },
      { name: 'src/index.ts', content: 'export const answer = 42\n' },
      { name: 'README.md', content: '# Привет мир\n' },
    ])

    const archive = await readZip(blob)
    const files = archive.entries.filter((entry) => !entry.directory)

    expect(files.map((entry) => entry.path)).toEqual(['src/index.ts', 'README.md'])
    expect(archive.entries[0]!.directory).toBe(true)
    // размер считается в байтах: кириллица в UTF-8 занимает по два байта на символ
    expect(archive.totalSize).toBe(new TextEncoder().encode('export const answer = 42\n# Привет мир\n').length)

    const text = new TextDecoder().decode(await files[0]!.read())
    expect(text).toBe('export const answer = 42\n')
  })

  it('работает с несжатыми записями (store)', async () => {
    const blob = await makeZip([{ name: 'plain.txt', content: 'без сжатия', store: true }])
    const archive = await readZip(blob)
    expect(new TextDecoder().decode(await archive.entries[0]!.read())).toBe('без сжатия')
  })

  it('правильно декодирует кириллические имена файлов в UTF-8', async () => {
    const blob = await makeZip([{ name: 'папка/файл.txt', content: 'ок' }])
    const archive = await readZip(blob)
    expect(archive.entries[0]!.path).toBe('папка/файл.txt')
  })

  it('ругается на файлы с паролем', async () => {
    const blob = await makeZip([{ name: 'secret.txt', content: 'настоящий секрет' }])
    // выставляем флаг шифрования в локальном и центральном заголовках
    const bytes = new Uint8Array(await blob.arrayBuffer())
    bytes[6] = 1
    const centralOffset = new DataView(bytes.buffer).getUint32(bytes.length - 22 + 16, true)
    bytes[centralOffset + 8] = 1

    const archive = await readZip(new Blob([bytes as BlobPart]))
    await expect(archive.entries[0]!.read()).rejects.toBeInstanceOf(ZipError)
  })

  it('сообщает об ошибке на мусорных данных', async () => {
    const junk = new Blob([new Uint8Array(512).fill(7) as BlobPart])
    await expect(readZip(junk)).rejects.toBeInstanceOf(ZipError)
  })
})

/* -----------------— проверка на архиве от системного zip -----------------— */

describe('readZip на архиве, собранном утилитой zip', () => {
  it('разбирает реальный архив с кириллицей и каталогами', async () => {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const path = fileURLToPath(new URL('./__fixtures__/sample.zip', import.meta.url))
    const blob = new Blob([await readFile(path) as unknown as BlobPart])

    const archive = await readZip(blob)
    const files = archive.entries.filter((entry) => !entry.directory)
    const directories = archive.entries.filter((entry) => entry.directory)

    expect(files.map((entry) => entry.path).sort()).toEqual(
      [
        'sample-src/README.md',
        'sample-src/binary.bin',
        'sample-src/index.ts',
        'sample-src/nested/deep/вложенный.txt',
        'sample-src/no-newline.txt',
      ].sort(),
    )
    expect(directories.map((entry) => entry.path)).toContain('sample-src/пустая/')

    const decoder = new TextDecoder()
    const index = files.find((entry) => entry.path.endsWith('index.ts'))!
    expect(decoder.decode(await index.read())).toBe('export const hello = "привет"\n')
    expect(index.size).toBe(36)

    const cyrillic = files.find((entry) => entry.path.endsWith('вложенный.txt'))!
    expect(decoder.decode(await cyrillic.read())).toBe('вложенный файл\n')

    const binary = files.find((entry) => entry.path.endsWith('binary.bin'))!
    expect((await binary.read()).length).toBe(3000)

    const noNewline = files.find((entry) => entry.path.endsWith('no-newline.txt'))!
    expect(decoder.decode(await noNewline.read())).toBe('в конце без перевода строки')

    expect(archive.totalSize).toBe(3139)
  })
})
