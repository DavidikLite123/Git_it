import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AGREEMENT_SECTIONS, AGREEMENT_VERSION, agreementAsMarkdown, evaluateAgreementScroll } from './agreement'

const filePath = fileURLToPath(new URL('../../AGREEMENT.md', import.meta.url))

describe('лицензионное соглашение', () => {
  it('содержит все пункты и не выглядит обрезанным', () => {
    expect(AGREEMENT_SECTIONS.length).toBeGreaterThanOrEqual(12)
    for (const section of AGREEMENT_SECTIONS) {
      expect(section.title).toMatch(/^\d+\./)
      expect(section.paragraphs.length).toBeGreaterThan(0)
      for (const paragraph of section.paragraphs) {
        expect(paragraph.trim().length).toBeGreaterThan(60)
        expect(paragraph.trim().length).toBeLessThan(1200)
      }
    }
    // суммарно текст соглашения должен быть содержательным
    const words = AGREEMENT_SECTIONS.flatMap((section) => section.paragraphs).join(' ').split(/\s+/).length
    expect(words).toBeGreaterThan(1000)
  })

  it('обязательно рассказывает про 100 МБ, LFS и лицензию MIT', () => {
    const text = AGREEMENT_SECTIONS.flatMap((section) => [section.title, ...section.paragraphs]).join(' ')
    expect(text).toContain('100 МБ')
    expect(text).toContain('MIT')
    expect(text).toContain('Git LFS')
    expect(text).toContain('100 МБ')
    expect(text).toMatch(/токен/i)
  })

  it('AGREEMENT.md в репозитории совпадает с текстом в приложении', async () => {
    const expected = agreementAsMarkdown()
    let actual: string
    try {
      actual = await readFile(filePath, 'utf8')
    } catch {
      await writeFile(filePath, expected, 'utf8')
      actual = expected
    }
    if (actual !== expected) {
      // если текст менялся в коде — обновляем файл, чтобы он не расходился с приложением
      await writeFile(filePath, expected, 'utf8')
      throw new Error('AGREEMENT.md обновлён из кода: перезапустите тесты, текст синхронизирован')
    }
    expect(actual).toContain(`Версия ${AGREEMENT_VERSION}`)
  })
})

describe('evaluateAgreementScroll', () => {
  it('не считает соглашение прочитанным, пока текст прокручен не до конца', () => {
    const result = evaluateAgreementScroll({ scrollTop: 100, scrollHeight: 4000, clientHeight: 400 })
    expect(result.atEnd).toBe(false)
    expect(result.percent).toBeLessThan(20)
  })

  it('засчитывает дочитывание у самого низа', () => {
    const result = evaluateAgreementScroll({ scrollTop: 3600, scrollHeight: 4000, clientHeight: 400 })
    expect(result.atEnd).toBe(true)
    expect(result.percent).toBe(100)
  })

  it('считает текст дочитанным, если он целиком помещается на экран', () => {
    const result = evaluateAgreementScroll({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })
    expect(result.atEnd).toBe(true)
    expect(result.percent).toBe(100)
  })

  it('не разблокирует согласие, пока браузер не посчитал размеры текста', () => {
    expect(evaluateAgreementScroll({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }).atEnd).toBe(false)
    expect(evaluateAgreementScroll({ scrollTop: 0, scrollHeight: 4000, clientHeight: 0 }).atEnd).toBe(false)
  })

  it('не подводит у самого верха длинного текста', () => {
    const result = evaluateAgreementScroll({ scrollTop: 0, scrollHeight: 5000, clientHeight: 500 })
    expect(result.atEnd).toBe(false)
    expect(result.percent).toBe(0)
  })
})
