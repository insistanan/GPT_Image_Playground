import { useLayoutEffect, useState, type RefObject } from 'react'
interface GridViewportMetrics {
  scrollTop: number
  viewportHeight: number
  viewportWidth: number
  gridTop: number
}

type ScrollContainer = Window | HTMLElement

function isWindowScrollContainer(container: ScrollContainer): container is Window {
  return container === window
}

function isScrollableOverflow(value: string): boolean {
  return /(auto|scroll|overlay)/.test(value)
}

function resolveScrollContainer(element: HTMLElement | null): ScrollContainer {
  let current = element?.parentElement ?? null

  while (current) {
    const style = window.getComputedStyle(current)
    if (isScrollableOverflow(style.overflowY) || isScrollableOverflow(style.overflow)) {
      return current
    }
    current = current.parentElement
  }

  return window
}

function readScrollTop(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.scrollY : container.scrollTop
}

function readViewportHeight(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.innerHeight : container.clientHeight
}

function readGridTop(grid: HTMLDivElement | null, container: ScrollContainer): number {
  const rect = grid?.getBoundingClientRect()
  if (!rect) {
    return 0
  }

  if (isWindowScrollContainer(container)) {
    return rect.top + window.scrollY
  }

  const containerRect = container.getBoundingClientRect()
  return rect.top - containerRect.top + container.scrollTop
}

function readGridViewportMetrics(
  grid: HTMLDivElement | null,
  container: ScrollContainer,
): GridViewportMetrics {
  return {
    scrollTop: readScrollTop(container),
    viewportHeight: readViewportHeight(container),
    viewportWidth: window.innerWidth,
    gridTop: readGridTop(grid, container),
  }
}

export function useGridViewport(
  wrapperRef: RefObject<HTMLDivElement | null>,
  gridRef: RefObject<HTMLDivElement | null>,
  layoutVersion: number,
  itemCount: number,
) {
  const [metrics, setMetrics] = useState<GridViewportMetrics>(() => readGridViewportMetrics(null, window))
  useLayoutEffect(() => {
    let frameId = 0
    const scrollContainer = resolveScrollContainer(wrapperRef.current)

    const updateMetrics = () => {
      frameId = 0
      setMetrics(readGridViewportMetrics(gridRef.current, scrollContainer))
    }

    const requestMetricsUpdate = () => {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(updateMetrics)
    }

    updateMetrics()
    scrollContainer.addEventListener('scroll', requestMetricsUpdate, { passive: true })
    window.addEventListener('resize', requestMetricsUpdate)

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            updateMetrics()
          })
        : null
    if (resizeObserver) {
      if (!isWindowScrollContainer(scrollContainer)) {
        resizeObserver.observe(scrollContainer)
      }
      if (wrapperRef.current) {
        resizeObserver.observe(wrapperRef.current)
      }
      if (gridRef.current) {
        resizeObserver.observe(gridRef.current)
      }
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }
      scrollContainer.removeEventListener('scroll', requestMetricsUpdate)
      window.removeEventListener('resize', requestMetricsUpdate)
      resizeObserver?.disconnect()
    }
  }, [gridRef, layoutVersion, itemCount, wrapperRef])

  return metrics
}
