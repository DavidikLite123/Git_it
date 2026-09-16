import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileIcon, Folder, Search } from './Icons'
import type { ProjectFile } from '../lib/project'
import { colorForPath, formatBytes, formatFiles, formatNumber, truncateMiddle } from '../lib/format'

interface Props {
  files: ProjectFile[]
  /** Файл отсекается правилами «не заливать лишнее» */
  isIgnored: (path: string) => boolean
  isSelected: (path: string) => boolean
  onToggleFile: (path: string, next: boolean) => void
  onTogglePaths: (paths: string[], next: boolean) => void
  selectedCount: number
  selectedBytes: number
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  size: number
  children: TreeNode[]
  /** Файлы внутри (для каталогов) */
  descendants: string[]
  bytes: number
  ignoredCount: number
  selectedCount: number
}

function buildTree(
  files: ProjectFile[],
  isIgnored: (path: string) => boolean,
  isSelected: (path: string) => boolean,
): TreeNode[] {
  const root: TreeNode = {
    name: '',
    path: '',
    isDir: true,
    size: 0,
    children: [],
    descendants: [],
    bytes: 0,
    ignoredCount: 0,
    selectedCount: 0,
  }
  const dirs = new Map<string, TreeNode>([['', root]])

  for (const file of files) {
    const segments = file.path.split('/')
    let parent = root
    let prefix = ''
    for (let index = 0; index < segments.length - 1; index++) {
      prefix = prefix ? `${prefix}/${segments[index]!}` : segments[index]!
      let node = dirs.get(prefix)
      if (!node) {
        node = {
          name: segments[index]!,
          path: prefix,
          isDir: true,
          size: 0,
          children: [],
          descendants: [],
          bytes: 0,
          ignoredCount: 0,
          selectedCount: 0,
        }
        dirs.set(prefix, node)
        parent.children.push(node)
      }
      parent = node
    }
    parent.children.push({
      name: segments[segments.length - 1]!,
      path: file.path,
      isDir: false,
      size: file.size,
      children: [],
      descendants: [],
      bytes: file.size,
      // сразу помечаем файл: от этого зависят счётчики и бейджи у каталогов
      ignoredCount: isIgnored(file.path) ? 1 : 0,
      selectedCount: isSelected(file.path) ? 1 : 0,
    })
  }

  const prepare = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, 'en', { numeric: true })
    })
    // «схлопываем» цепочки каталогов из одного элемента: src/lib/hooks → src/lib/hooks
    for (let index = 0; index < node.children.length; index++) {
      let child = node.children[index]!
      while (child.isDir && child.children.length === 1 && child.children[0]!.isDir) {
        const only = child.children[0]!
        child = { ...only, name: `${child.name}/${only.name}` }
        node.children[index] = child
      }
      if (child.isDir) prepare(child)
    }
  }
  prepare(root)

  const aggregate = (node: TreeNode): TreeNode => {
    if (!node.isDir) return node
    node.descendants = []
    node.bytes = 0
    node.ignoredCount = 0
    node.selectedCount = 0
    for (const child of node.children) {
      const done = aggregate(child)
      node.descendants.push(...(done.isDir ? done.descendants : [done.path]))
      node.bytes += done.bytes
      node.ignoredCount += done.ignoredCount
      node.selectedCount += done.selectedCount
    }
    return node
  }
  aggregate(root)
  return root.children
}

export function FileTree({
  files,
  isIgnored,
  isSelected,
  onToggleFile,
  onTogglePaths,
  selectedCount,
  selectedBytes,
}: Props) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(400)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(files, isIgnored, isSelected), [files, isIgnored, isSelected])

  // по умолчанию раскрываем первый уровень
  const initializedFor = useRef<string>('')
  useEffect(() => {
    const key = `${files.length}:${files[0]?.path ?? ''}`
    if (initializedFor.current === key) return
    initializedFor.current = key
    setExpanded(new Set(tree.filter((node) => node.isDir).map((node) => node.path)))
    setLimit(400)
  }, [files, tree])

  const ignoredCount = useMemo(() => files.reduce((sum, file) => sum + (isIgnored(file.path) ? 1 : 0), 0), [files, isIgnored])

  const rows = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (trimmed) {
      const matches = files.filter((file) => file.path.toLowerCase().includes(trimmed))
      return matches.map((file) => ({ kind: 'file' as const, node: null, file, depth: 0 }))
    }
    const out: Array<{ kind: 'file' | 'dir'; node: TreeNode; file: null; depth: number }> = []
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        if (out.length >= limit) return
        out.push({ kind: node.isDir ? 'dir' : 'file', node, file: null, depth })
        if (node.isDir && expanded.has(node.path)) walk(node.children, depth + 1)
      }
    }
    walk(tree, 0)
    return out
  }, [tree, expanded, query, files, limit])

  const allSelected = selectedCount === files.length && files.length > 0

  return (
    <section className="card file-card">
      <header className="card-head">
        <h2>
          <Folder size={20} /> Файлы проекта
        </h2>
        <p className="muted">
          Отправляем <strong>{formatFiles(selectedCount)}</strong> · {formatBytes(selectedBytes)}
          {ignoredCount > 0 && <> · исключено служебных: {formatNumber(ignoredCount)}</>}
        </p>
      </header>

      <div className="tree-toolbar">
        <div className="input-with-icon grow">
          <Search size={16} />
          <input
            className="input mono"
            placeholder="Поиск по пути файла…"
            value={query}
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value)
              setLimit(400)
            }}
          />
        </div>
        <button type="button" className="btn btn-sm" onClick={() => onTogglePaths(files.map((file) => file.path), true)}>
          {allSelected ? 'Всё выбрано' : 'Выбрать все'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onTogglePaths(files.map((file) => file.path), false)}>
          Снять все
        </button>
      </div>

      <div className="tree" role="tree">
        {rows.map((row) => {
          if (row.kind === 'dir') {
            const node = row.node
            const isOpen = expanded.has(node.path)
            const total = node.descendants.length
            return (
              <div key={node.path} className="tree-row is-dir" style={{ paddingLeft: 8 + row.depth * 16 }}>
                <button
                  type="button"
                  className="tree-toggle"
                  aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(node.path)) next.delete(node.path)
                      else next.add(node.path)
                      return next
                    })
                  }
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <TriCheckbox
                  checked={node.selectedCount > 0 && node.selectedCount === total}
                  indeterminate={node.selectedCount > 0 && node.selectedCount < total}
                  onChange={(next) => onTogglePaths(node.descendants, next)}
                  label={`Выбрать каталог ${node.path}`}
                />
                <Folder size={16} className="tree-icon" />
                <span className="tree-name">{node.name}</span>
                <span className="tree-meta">
                  {formatNumber(node.selectedCount)}/{formatNumber(total)} · {formatBytes(node.bytes)}
                </span>
                {node.ignoredCount > 0 && (
                  <span className={`badge${node.selectedCount === 0 ? '' : ' badge-muted'}`}>
                    {node.selectedCount === 0 ? 'исключён' : `исключено ${formatNumber(node.ignoredCount)}`}
                  </span>
                )}
              </div>
            )
          }

          const path = row.node?.path ?? row.file!.path
          const size = row.node?.size ?? row.file!.size
          const name = row.node?.name ?? path.slice(path.lastIndexOf('/') + 1)
          const selected = isSelected(path)
          const ignored = isIgnored(path)
          return (
            <label
              key={path}
              className={`tree-row is-file${ignored ? ' is-ignored' : ''}`}
              style={{ paddingLeft: 8 + row.depth * 16 }}
              title={path}
            >
              <span className="tree-toggle" aria-hidden />
              <TriCheckbox checked={selected} onChange={(next) => onToggleFile(path, next)} label={`Выбрать ${path}`} />
              <FileIcon size={16} className="tree-icon" />
              <span className="dot" style={{ background: colorForPath(path) }} />
              <span className="tree-name">{query ? truncateMiddle(path, 64) : name}</span>
              <span className="tree-meta">{formatBytes(size)}</span>
              {ignored && <span className="badge badge-muted">исключён</span>}
            </label>
          )
        })}
      </div>

      {rows.length >= limit && (
        <button type="button" className="btn btn-ghost tree-more" onClick={() => setLimit((prev) => prev + 600)}>
          Показать ещё
        </button>
      )}
      {files.length === 0 && <p className="muted center">В проекте не нашлось файлов.</p>}
    </section>
  )
}

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked
  }, [indeterminate, checked])

  return (
    <input
      ref={ref}
      type="checkbox"
      className="check"
      checked={checked}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
    />
  )
}
