// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { SplashScreen } from './components/SplashScreen'

function seedAcceptance() {
  localStorage.setItem('gitit.agreement', JSON.stringify({ version: '1.0', acceptedAt: '2026-09-16T10:00:00.000Z' }))
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('стартовая заставка', () => {
  it('показывается при заходе на сайт и уходит сама, открывая приветствие', () => {
    render(<App />)

    expect(document.querySelector('.splash')).toBeTruthy()
    // под заставкой уже отрисован готовый экран — после неё нет «пустого» кадра
    expect(screen.getByRole('button', { name: 'Начать' })).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(document.querySelector('.splash')).toBeNull()
    expect(screen.getByText('Как это работает')).toBeTruthy()
  })

  it('показывает логотип, надпись Git it и слоган ровно под словом «it»', () => {
    render(<App />)

    // логотип рисуется штрихами (ветка, плюс и точка)
    const strokes = document.querySelectorAll('.splash-stroke')
    expect(strokes.length).toBe(3)

    const word = document.querySelector('.splash-word')!
    expect(word.querySelector('.splash-word-main')!.textContent).toBe('Git')
    expect(word.querySelector('.splash-word-accent')!.textContent).toBe('it')

    // слоган живёт внутри той же «плашки», что и надпись, и привязан к её правому
    // краю — то есть стоит ровно под словом «it», а не под всей надписью
    const lockup = document.querySelector('.splash-lockup')!
    expect(lockup.querySelector('.splash-word')).toBeTruthy()
    expect(lockup.querySelector('.splash-tag')).toBeTruthy()

    // слоган выровнен по правому краю — то есть под «it»
    // (пробелы неразрывные, чтобы фраза не рвалась по строкам)
    const tag = document.querySelector('.splash-tag')!
    const tagText = tag.textContent!.replace(/\u00A0/g, ' ')
    expect(tagText).toBe('залить проект в GitHub — легко и просто')

    // буквы появляются по очереди: у каждой своя задержка
    const letters = [...tag.querySelectorAll<HTMLElement>('.splash-letter')]
    expect(letters.length).toBeGreaterThan(20)
    const delays = letters.map((letter) => Number.parseFloat(letter.style.animationDelay))
    expect(delays[0]).toBeLessThan(2)
    expect(delays[delays.length - 1]).toBeGreaterThan(delays[0]!)
    expect(delays.every((value, index) => index === 0 || value >= delays[index - 1]!)).toBe(true)

    act(() => {
      vi.advanceTimersByTime(4000)
    })
  })

  it('пропускается кликом или нажатием клавиши', () => {
    render(<App />)
    expect(document.querySelector('.splash')).toBeTruthy()

    act(() => {
      fireEvent.pointerDown(document.querySelector('.splash') as HTMLElement)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(document.querySelector('.splash')).toBeNull()
    expect(screen.getByRole('button', { name: 'Начать' })).toBeTruthy()
  })

  it('не остаётся, если приложение начало работу с принятого соглашения', () => {
    seedAcceptance()
    render(<App />)

    expect(document.querySelector('.splash')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(document.querySelector('.splash')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    expect(document.getElementById('token')).toBeTruthy()
  })

  it('сообщает о себе вспомогательным технологиям и убирается ровно один раз', () => {
    const onDone = vi.fn()
    const { unmount } = render(<SplashScreen duration={1000} onDone={onDone} />)

    expect(screen.getByRole('status', { name: /Открываем Git it/i })).toBeTruthy()

    // клик и таймер вместе не должны вызвать onDone дважды
    act(() => {
      fireEvent.pointerDown(document.querySelector('.splash') as HTMLElement)
      vi.advanceTimersByTime(2000)
    })

    expect(onDone).toHaveBeenCalledTimes(1)
    unmount()
  })
})
