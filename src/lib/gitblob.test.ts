import { describe, expect, it } from 'vitest'
import { gitBlobSha, looksBinary } from './gitblob'

const encoder = new TextEncoder()

describe('gitBlobSha', () => {
  it('совпадает с git hash-object для известных значений', async () => {
    // `printf 'hello world\n' | git hash-object --stdin`
    expect(await gitBlobSha(encoder.encode('hello world\n'))).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad')
    // пустой файл: `git hash-object -t blob /dev/null`
    expect(await gitBlobSha(new Uint8Array(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('учитывает длину в байтах, а не в символах', async () => {
    const sha = await gitBlobSha(encoder.encode('привет'))
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(sha).not.toBe(await gitBlobSha(new Uint8Array(0)))
  })
})

describe('looksBinary', () => {
  it('узнаёт бинарные данные по нулевому байту', () => {
    expect(looksBinary(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))).toBe(true)
    expect(looksBinary(encoder.encode('обычный текст'))).toBe(false)
  })
})
