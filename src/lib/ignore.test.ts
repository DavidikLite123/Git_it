import { describe, expect, it } from 'vitest'
import { compileIgnore, normalizePath, ruleToRegex } from './ignore'

describe('ruleToRegex', () => {
  const cases: Array<[pattern: string, path: string, expected: boolean]> = [
    ['node_modules/', 'node_modules/react/index.js', true],
    ['node_modules/', 'src/node_modules/react/index.js', true],
    ['node_modules/', 'src/node_modules.txt', false],
    ['*.log', 'app.log', true],
    ['*.log', 'logs/app.log', true],
    ['*.log', 'app.log.txt', false],
    ['dist/', 'dist/index.html', true],
    ['dist/', 'src/dist/index.html', true],
    ['docs/build', 'docs/build/a.html', true],
    ['docs/build', 'other/docs/build/a.html', false],
    ['.env', '.env', true],
    ['.env.*', '.env.local', true],
    ['src/**/test/*.ts', 'src/a/b/test/x.ts', true],
    ['src/**/test/*.ts', 'src/test/y.ts', true],
    ['src/**/test/*.ts', 'src/a/b/test/x.js', false],
    ['file?.txt', 'file1.txt', true],
    ['file?.txt', 'file12.txt', false],
    ['[abc].txt', 'b.txt', true],
    ['[!abc].txt', 'd.txt', true],
    ['[!abc].txt', 'a.txt', false],
  ]

  for (const [pattern, path, expected] of cases) {
    it(`${pattern} → ${path} = ${expected}`, () => {
      expect(ruleToRegex(pattern).test(path)).toBe(expected)
    })
  }
})

describe('compileIgnore', () => {
  const rules = ['node_modules/', 'dist/', '*.log', '!.important.log', 'coverage/']

  it('последнее правило побеждает, как в git', () => {
    const ignored = compileIgnore(rules)
    expect(ignored('node_modules/vite/index.js')).toBe(true)
    expect(ignored('app.log')).toBe(true)
    expect(ignored('.important.log')).toBe(false)
    expect(ignored('src/main.ts')).toBe(false)
  })

  it('игнорирует комментарии и пустые строки', () => {
    const ignored = compileIgnore('# комментарий\n\n   \nbuild/')
    expect(ignored('build/out.js')).toBe(true)
  })

  it('понимает отрицания для каталогов', () => {
    const ignored = compileIgnore(['dist/', '!dist/keep.txt'])
    expect(ignored('dist/index.js')).toBe(true)
    expect(ignored('dist/keep.txt')).toBe(false)
  })

  it('по умолчанию ничего не игнорирует при пустом списке', () => {
    const ignored = compileIgnore('')
    expect(ignored('node_modules/x.js')).toBe(false)
  })
})

describe('normalizePath', () => {
  it('чистит путь', () => {
    expect(normalizePath('./src//main.ts')).toBe('src/main.ts')
    expect(normalizePath('/abs/path/')).toBe('abs/path')
    expect(normalizePath('a/b/../c')).toBe('a/c')
    expect(normalizePath('a\\b\\c')).toBe('a/b/c')
    expect(normalizePath('../../etc/passwd')).toBe('etc/passwd')
  })
})

describe('compileIgnore со списком источников', () => {
  it('разбирает многострочный список из нескольких источников', () => {
    const ignored = compileIgnore(['# системное\nnode_modules/\n*.log', '\n# пользовательское\ntemp/'])
    expect(ignored('node_modules/react/index.js')).toBe(true)
    expect(ignored('app.log')).toBe(true)
    expect(ignored('temp/cache.bin')).toBe(true)
    expect(ignored('src/index.ts')).toBe(false)
  })
})
