import { useCallback, useRef, useState } from 'react'
import { Alert, FileIcon, Folder, Spinner, UploadCloud } from './Icons'
import { entriesFromDataTransfer } from '../lib/project'

interface Props {
  onDropEntries: (entries: FileSystemEntry[], kind: 'folder' | 'zip' | 'files') => void
  onFiles: (files: FileList, kind: 'folder' | 'zip' | 'files') => void
  busy: boolean
  progressText: string | null
  error: string | null
  compact?: boolean
}

function kindOf(entry: FileSystemEntry): 'folder' | 'zip' | 'files' {
  if (entry.isDirectory) return 'folder'
  if (/\.zip$/i.test(entry.name)) return 'zip'
  return 'files'
}

export function DropZone({ onDropEntries, onFiles, busy, progressText, error, compact }: Props) {
  const [over, setOver] = useState(false)
  const folderInput = useRef<HTMLInputElement>(null)
  const zipInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setOver(false)
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setOver(false)
      if (busy) return
      // entries нужно забирать синхронно, пока объект dataTransfer жив
      const entries = entriesFromDataTransfer(event.dataTransfer)
      if (entries.length > 0) {
        const kinds = entries.map(kindOf)
        const kind = kinds.every((item) => item === 'zip') ? 'zip' : kinds.some((item) => item === 'folder') ? 'folder' : 'files'
        onDropEntries(entries, kind)
        return
      }
      if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files, 'files')
    },
    [busy, onDropEntries, onFiles],
  )

  return (
    <div className={`dropzone-wrap${compact ? ' compact' : ''}`}>
      <div
        className={`dropzone${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !busy && folderInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            folderInput.current?.click()
          }
        }}
      >
        <div className="dropzone-glow" aria-hidden />
        {busy ? (
          <div className="dropzone-content">
            <Spinner size={36} />
            <h3>Читаем проект…</h3>
            <p className="muted">{progressText ?? 'Сканируем файлы'}</p>
          </div>
        ) : (
          <div className="dropzone-content">
            <div className="dropzone-icon">
              <UploadCloud size={34} />
            </div>
            <h3>Перетащите папку с проектом сюда</h3>
            <p className="muted">
              или ZIP-архив — тоже работает. Мы сами выкинем <code>node_modules</code>, <code>.git</code> и прочий
              служебный мусор.
            </p>
            <div className="dropzone-actions" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="btn btn-primary" onClick={() => folderInput.current?.click()}>
                <Folder size={18} /> Выбрать папку
              </button>
              <button type="button" className="btn" onClick={() => zipInput.current?.click()}>
                ZIP-архив
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => filesInput.current?.click()}>
                <FileIcon size={16} /> Отдельные файлы
              </button>
            </div>
            <p className="hint">Ограничений на размер проекта почти нет — файлы читаются по мере загрузки.</p>
          </div>
        )}
      </div>

      {error && (
        <p className="notice notice-error">
          <Alert size={18} /> {error}
        </p>
      )}

      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // @ts-expect-error — нестандартные атрибуты выбора каталога
        webkitdirectory=""
        directory=""
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files, 'folder')
          event.target.value = ''
        }}
      />
      <input
        ref={zipInput}
        type="file"
        hidden
        accept=".zip,application/zip"
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files, 'zip')
          event.target.value = ''
        }}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files, 'files')
          event.target.value = ''
        }}
      />
    </div>
  )
}
