/**
 * Хеш git-объекта-блоба — SHA-1 от «blob <размер>\0<содержимое>».
 *
 * GitHub возвращает ровно такой sha для содержимого, поэтому по хешу можно
 * понять, что файл не изменился, и не загружать его повторно.
 */
export async function gitBlobSha(content: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('crypto.subtle недоступен')
  }
  const header = new TextEncoder().encode(`blob ${content.length}\0`)
  const payload = new Uint8Array(header.length + content.length)
  payload.set(header, 0)
  payload.set(content, header.length)
  const digest = await crypto.subtle.digest('SHA-1', payload as unknown as ArrayBuffer)
  return toHex(new Uint8Array(digest))
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/** Есть ли в данных нулевые байты — грубая, но рабочая проверка на «бинарность». */
export function looksBinary(bytes: Uint8Array, sampleSize = 8000): boolean {
  const limit = Math.min(bytes.length, sampleSize)
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true
  }
  return false
}
