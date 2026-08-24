import { createAbortErrorFromSignal, throwIfSignalAborted } from './abort'
import type { ParsedSseEvent } from './types'

export function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

export function parseSseEvents(text: string): ParsedSseEvent[] {
  return feedIncrementalSseParser(createIncrementalSseParserState(), text, true)
}

interface IncrementalSseParserOptions {
  deferJsonParsing?: boolean
  discardPartialImageData?: boolean
}

interface IncrementalSseParserState {
  buffer: string
  event: string
  dataLines: string[]
  hasData: boolean
}

function createIncrementalSseParserState(): IncrementalSseParserState {
  return {
    buffer: '',
    event: 'message',
    dataLines: [],
    hasData: false,
  }
}

export function isPartialImageSseEventName(event: string): boolean {
  return event.includes('partial_image')
}

function shouldCollectSseEventData(
  event: string,
  options?: IncrementalSseParserOptions,
): boolean {
  if (isPartialImageSseEventName(event)) {
    return !options?.discardPartialImageData
  }

  return true
}

function flushIncrementalSseEvent(
  state: IncrementalSseParserState,
  options?: IncrementalSseParserOptions,
): ParsedSseEvent | null {
  const event = state.event || 'message'
  const hasData = state.hasData
  const dataText = hasData && shouldCollectSseEventData(event, options) ? state.dataLines.join('\n') : ''
  state.event = 'message'
  state.dataLines = []
  state.hasData = false
  if (!hasData) {
    return null
  }

  return {
    event,
    dataText,
    json:
      isPartialImageSseEventName(event) || options?.deferJsonParsing
        ? undefined
        : tryParseJson(dataText),
  }
}

function processIncrementalSseLine(
  state: IncrementalSseParserState,
  line: string,
  options?: IncrementalSseParserOptions,
): ParsedSseEvent | null {
  if (!line) {
    return flushIncrementalSseEvent(state, options)
  }

  if (line.startsWith('event:')) {
    state.event = line.slice(6).trim() || 'message'
    return null
  }

  if (line.startsWith('data:')) {
    state.hasData = true
    if (shouldCollectSseEventData(state.event, options)) {
      state.dataLines.push(line.slice(5).trimStart())
    }
  }

  return null
}

function stripLineTrailingCarriageReturn(line: string): string {
  // SSE 行以 \n 分隔；\r\n 的 \r 可能因 chunk 边界被切开而残留在行尾，这里统一剥离。
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

function feedIncrementalSseParser(
  state: IncrementalSseParserState,
  chunk: string,
  flush = false,
  options?: IncrementalSseParserOptions,
): ParsedSseEvent[] {
  state.buffer += chunk
  const events: ParsedSseEvent[] = []

  while (true) {
    const newlineIndex = state.buffer.indexOf('\n')
    if (newlineIndex < 0) {
      break
    }

    const line = stripLineTrailingCarriageReturn(state.buffer.slice(0, newlineIndex))
    state.buffer = state.buffer.slice(newlineIndex + 1)
    const nextEvent = processIncrementalSseLine(state, line, options)
    if (nextEvent) {
      events.push(nextEvent)
    }
  }

  if (flush) {
    if (state.buffer) {
      const finalEvent = processIncrementalSseLine(state, stripLineTrailingCarriageReturn(state.buffer), options)
      state.buffer = ''
      if (finalEvent) {
        events.push(finalEvent)
      }
    }

    const trailingEvent = flushIncrementalSseEvent(state, options)
    if (trailingEvent) {
      events.push(trailingEvent)
    }
  }

  return events
}

export async function consumeSseResponseText(
  response: Response,
  signal: AbortSignal,
  onEvent?: (event: ParsedSseEvent) => void | Promise<void>,
  options?: IncrementalSseParserOptions,
): Promise<{ text: string; sawAnyEvents: boolean }> {
  throwIfSignalAborted(signal)

  if (!response.body) {
    return {
      text: await response.text(),
      sawAnyEvents: false,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parserState = createIncrementalSseParserState()
  let text = ''
  let sawAnyEvents = false

  const readNextChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    throwIfSignalAborted(signal)

    return await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const onAbort = () => {
        void reader.cancel().catch(() => undefined)
        reject(createAbortErrorFromSignal(signal))
      }

      signal.addEventListener('abort', onAbort, { once: true })
      reader
        .read()
        .then((result) => {
          signal.removeEventListener('abort', onAbort)
          resolve(result)
        })
        .catch((error) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        })
    })
  }

  while (true) {
    const { done, value } = await readNextChunk()
    if (done) {
      break
    }

    throwIfSignalAborted(signal)
    const chunk = decoder.decode(value, { stream: true })
    const events = feedIncrementalSseParser(parserState, chunk, false, options)
    if (!sawAnyEvents && events.length === 0) {
      text += chunk
    }
    if (events.length > 0) {
      sawAnyEvents = true
      text = ''
    }
    if (typeof onEvent === 'function') {
      for (const event of events) {
        throwIfSignalAborted(signal)
        await onEvent(event)
      }
    }
  }

  throwIfSignalAborted(signal)
  const finalChunk = decoder.decode()
  const finalEvents = feedIncrementalSseParser(parserState, finalChunk, true, options)
  if (!sawAnyEvents && finalEvents.length === 0) {
    text += finalChunk
  }
  if (finalEvents.length > 0) {
    sawAnyEvents = true
    text = ''
  }
  if (typeof onEvent === 'function') {
    for (const event of finalEvents) {
      throwIfSignalAborted(signal)
      await onEvent(event)
    }
  }

  return { text, sawAnyEvents }
}
