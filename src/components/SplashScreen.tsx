import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Стартовая заставка.
 *
 * Сцена: белый экран, пока страница действительно грузится → из пустоты
 * прорисовывается логотип → «выезжает» надпись Git it → под словом «it»
 * побуквенно появляется слоган → логотип улетает в шапку, а сайт выезжает
 * из-под заставки.
 *
 * Загрузку можно пропустить кликом, клавишей или прокруткой. При системной
 * настройке «уменьшить движение» сцена всё равно показывается (иначе её просто
 * не видно), но становится короче и мягче.
 */

const WORD = 'Git'
const WORD_ACCENT = 'it'
const TAGLINE = 'залить проект в GitHub — легко и просто'

/** Длительность сцены на экране, мс. */
const SCENE_MS = 3000
const SCENE_MS_REDUCED = 2000
/** Полёт логотипа в шапку сайта и появление самого сайта, мс. */
const FLIGHT_MS = 640
const FADE_MS = 300
/** Сколько ждём готовности шрифтов, прежде чем запустить сцену (мс). */
const FONTS_TIMEOUT_MS = 900

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}

interface Props {
  /** Заставка начала уходить: сайт можно показывать навстречу */
  onExitStart: () => void
  /** Заставка ушла — её можно убирать из дерева */
  onDone: () => void
  /** Своя длительность сцены, мс (используется в тестах) */
  duration?: number
}

export function SplashScreen({ onExitStart, onDone, duration }: Props) {
  const [leaving, setLeaving] = useState(false)
  /** Белый экран держим, пока браузер не готов показать текст финальным шрифтом */
  const [sceneReady, setSceneReady] = useState(false)
  const finished = useRef(false)
  const logoRef = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const sceneMs = duration ?? (reduced ? SCENE_MS_REDUCED : SCENE_MS)

  /* --- фаза загрузки: ждём шрифты, чтобы сцена играла уже финальным шрифтом --- */

  useEffect(() => {
    let cancelled = false
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts?.ready) {
      setSceneReady(true)
      return
    }
    const timer = window.setTimeout(() => !cancelled && setSceneReady(true), FONTS_TIMEOUT_MS)
    fonts.ready
      .then(() => {
        if (!cancelled) setSceneReady(true)
      })
      .catch(() => {
        if (!cancelled) setSceneReady(true)
      })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  /* ------------------- уход: логотип летит в шапку, сайт выезжает ---------------- */

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true

    const logo = logoRef.current
    const target = document.querySelector<HTMLElement>('[data-brand-mark]')
    const canFly = !reduced && Boolean(logo && target)

    if (canFly && logo && target) {
      const from = logo.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      // в jsdom размеры нулевые — тогда просто расходимся без полёта
      if (from.width > 0 && to.width > 0) {
        const scale = to.width / from.width
        const dx = to.left + to.width / 2 - (from.left + from.width / 2)
        const dy = to.top + to.height / 2 - (from.top + from.height / 2)
        logo.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`
      }
    }

    onExitStart()
    setLeaving(true)
    window.setTimeout(onDone, canFly ? FLIGHT_MS : FADE_MS)
  }, [onDone, onExitStart, reduced])

  useEffect(() => {
    if (!sceneReady) return
    const timer = window.setTimeout(finish, sceneMs)
    const skip = () => finish()
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('wheel', skip)
    }
  }, [finish, sceneReady, sceneMs])

  /** Каждая буква появляется со своей задержкой. */
  const letters = (text: string, delayStart: number, step: number) =>
    text.split('').map((char, index) => (
      <span
        key={`${char}-${index}`}
        className="splash-letter"
        style={{ animationDelay: `${(delayStart + index * step).toFixed(3)}s` }}
      >
        {char === ' ' ? '\u00A0' : char}
      </span>
    ))

  return (
    <div
      className={`splash${leaving ? ' is-leaving' : ''}${reduced ? ' is-reduced' : ''}${sceneReady ? ' is-playing' : ''}`}
      role="status"
      aria-label="Открываем Git it"
    >
      <div className="splash-scene" aria-hidden>
        <span className="splash-blob blob-a" />
        <span className="splash-blob blob-b" />
        <span className="splash-vignette" />
      </div>

      {sceneReady && (
        <div className="splash-inner" aria-hidden>
          <div className="splash-logo" ref={logoRef}>
            <svg viewBox="0 0 64 64" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="splash-gradient" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#7c5cff" />
                  <stop offset="1" stopColor="#23d3a0" />
                </linearGradient>
              </defs>
              <path className="splash-stroke stroke-branch" d="M20 46V30a10 10 0 0 1 10-10h14" />
              <path className="splash-stroke stroke-plus" d="M44 14v12M38 20h12" />
              <circle className="splash-stroke stroke-dot" cx="20" cy="49" r="5" />
            </svg>
            <span className="splash-halo" />
          </div>

          {/* слоган привязан к правому краю надписи — то есть ровно под «it» */}
          <div className="splash-lockup">
            <div className="splash-word">
              <span className="splash-word-main">{letters(WORD, 0.95, 0.09)}</span>
              <span className="splash-word-accent">{letters(WORD_ACCENT, 1.22, 0.09)}</span>
            </div>
            <p className="splash-tag">{letters(TAGLINE, 1.52, 0.028)}</p>
          </div>

          <span className="splash-bar">
            <i />
          </span>
        </div>
      )}
    </div>
  )
}
