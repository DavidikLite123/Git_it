import { describe, expect, it } from 'vitest'
import { buildProject, commonTopFolder, isVcsPath, sanitizeRepoName, scanFileList, type ProjectFile } from './project'

function file(path: string, size = 10): ProjectFile {
  return { path, size, read: async () => new Uint8Array(size) }
}

describe('sanitizeRepoName', () => {
  it('приводит имена к пригодному для GitHub виду', () => {
    expect(sanitizeRepoName('My Project!')).toBe('My-Project')
    expect(sanitizeRepoName('my-app.zip')).toBe('my-app')
    expect(sanitizeRepoName('проект')).toBe('my-project')
    expect(sanitizeRepoName('  spaced/name  ')).toBe('spaced-name')
    expect(sanitizeRepoName('')).toBe('my-project')
    expect(sanitizeRepoName('...')).toBe('my-project')
  })

  it('обрезает слишком длинные имена', () => {
    expect(sanitizeRepoName('a'.repeat(200)).length).toBe(100)
  })
})

describe('commonTopFolder', () => {
  it('находит общий корень', () => {
    expect(commonTopFolder(['app/src/a.ts', 'app/package.json'])).toBe('app')
    expect(commonTopFolder(['app/src/a.ts', 'other/b.ts'])).toBeNull()
    expect(commonTopFolder(['package.json'])).toBeNull()
    expect(commonTopFolder([])).toBeNull()
  })
})

describe('isVcsPath', () => {
  it('отсекает служебные каталоги систем контроля версий', () => {
    expect(isVcsPath('.git/config')).toBe(true)
    expect(isVcsPath('nested/.git/HEAD')).toBe(true)
    expect(isVcsPath('.hg/store')).toBe(true)
    expect(isVcsPath('src/git.ts')).toBe(false)
  })
})

describe('buildProject', () => {
  it('срезает верхнюю папку и убирает дубликаты', () => {
    const project = buildProject(
      [file('my-app/src/a.ts', 5), file('my-app/src/a.ts', 7), file('my-app/README.md', 3)],
      { source: 'folder', name: 'my-app', stripRoot: true },
    )

    expect(project.files.map((item) => item.path)).toEqual(['README.md', 'src/a.ts'])
    expect(project.name).toBe('my-app')
    expect(project.rootFolder).toBe('my-app')
    expect(project.hasReadme).toBe(true)
    expect(project.totalSize).toBe(10)
  })

  it('не трогает пути, если корня нет', () => {
    const project = buildProject([file('a.ts'), file('b.ts')], { source: 'files', name: 'my-project', stripRoot: true })
    expect(project.files.map((item) => item.path)).toEqual(['a.ts', 'b.ts'])
  })

  it('выкидывает .git и определяет .gitignore', () => {
    const project = buildProject([file('.gitignore'), file('.git/config')], {
      source: 'folder',
      name: 'x',
      stripRoot: true,
    })
    expect(project.files.map((item) => item.path)).toEqual(['.gitignore'])
    expect(project.hasGitignore).toBe(true)
  })

  it('не срезает единственную папку верхнего уровня повторно', () => {
    const project = buildProject([file('only/src/a.ts'), file('only/src/b.ts')], {
      source: 'folder',
      name: 'only',
      stripRoot: true,
      rootFolder: 'only',
    })
    expect(project.files.map((item) => item.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(project.name).toBe('only')
  })
})

describe('scanFileList', () => {
  it('использует webkitRelativePath как путь', () => {
    const first = new File(['x'], 'index.ts')
    Object.defineProperty(first, 'webkitRelativePath', { value: 'app/src/index.ts' })
    const second = new File(['y'], 'package.json')
    Object.defineProperty(second, 'webkitRelativePath', { value: 'app/package.json' })

    const { files, rootFolder } = scanFileList([first, second])

    expect(files.map((item) => item.path)).toEqual(['app/src/index.ts', 'app/package.json'])
    expect(rootFolder).toBe('app')
  })

  it('работает с одиночными файлами без относительного пути', () => {
    const { files, rootFolder } = scanFileList([new File(['hello'], 'note.txt')])
    expect(files[0]!.path).toBe('note.txt')
    expect(rootFolder).toBeNull()
    expect(files[0]!.size).toBe(5)
  })
})
