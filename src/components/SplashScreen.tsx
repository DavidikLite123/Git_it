import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Стартовая заставка: белый экран → из пустоты прорисовывается логотип →
 * «выезжает» надпись Git it → под словом «it» побуквенно появляется слоган.
 *
 * Загрузка занимает пару секунд, её можно пропустить кликом, клавишей или
 * прокруткой. При `prefers-reduced-motion` сцена сокращается до мгновенной.
 */

const WORD = 'Git'
const WORD_ACCENT = 'it'
const TAGLINE = 'залить проект в GitHub — легко и просто'

/** Сколько заставка висит на экране, мс. */
const VISIBLE_MS = 2900
const VISIBLE_MS_REDUCED = 700
const FADE_MS = 420
const FADE_MS_REDUCED = 120

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
  /** Заставка доиграла (или её пропустили) — можно убирать из дерева */
  onDone: () => void
  /** Своя длительность сцены, мс (используется в тестах) */
  duration?: number
}

export function SplashScreen({ onDone, duration }: Props) {
  const [leaving, setLeaving] = useState(false)
  const finished = useRef(false)
  const reduced = usePrefersReducedMotion()
  const visibleMs = duration ?? (reduced ? VISIBLE_MS_REDUCED : VISIBLE_MS)
  const fadeMs = reduced ? FADE_MS_REDUCED : FADE_MS

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    setLeaving(true)
    window.setTimeout(onDone, fadeMs)
  }, [fadeMs, onDone])

  useEffect(() => {
    const timer = window.setTimeout(finish, visibleMs)
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
  }, [finish, visibleMs])

  /** Каждая буква появляется со своей задержкой — как в анимации у Google. */
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
      className={`splash${leaving ? ' is-leaving' : ''}${reduced ? ' is-static' : ''}`}
      role="status"
      aria-label="Открываем Git it"
    >
      <div className="splash-scene" aria-hidden>
        <span className="splash-blob blob-a" />
        <span className="splash-blob blob-b" />
        <span className="splash-vignette" />
      </div>

      <div className="splash-inner" aria-hidden>
        <div className="splash-logo">
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
    </div>
  )
}
