import { isRecord } from '@/lib/guards'
import { MAX_OPENAI_OUTPUT_IMAGES } from '@/lib/capabilities'
import type { ExportData, TaskParams, TaskRecord } from '@/types'
import { DEFAULT_PARAMS } from '../taskParams'
import { recoverInterruptedTask } from '../taskRecords'

function fail(path: string): never {
  throw new Error(`备份字段无效：${path}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path)
  return value
}

function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(path)
  return value
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path)
  return value
}

function optionalEnum(value: unknown, allowed: readonly string[], path: string): void {
  if (value !== undefined && (typeof value !== 'string' || !allowed.includes(value))) fail(path)
}

function optionalFields(
  value: Record<string, unknown>,
  path: string,
  strings: string[],
  numbers: string[] = [],
  booleans: string[] = [],
) {
  for (const key of strings) if (value[key] != null) text(value[key], `${path}.${key}`, true)
  for (const key of numbers) if (value[key] != null) finite(value[key], `${path}.${key}`)
  for (const key of booleans) if (value[key] != null && typeof value[key] !== 'boolean') fail(`${path}.${key}`)
}

export function parseImportedParams(value: unknown, path = 'params'): TaskParams {
  const input = record(value, path)
  const enums: Record<string, readonly string[]> = {
    quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
    output_format: ['png', 'jpeg', 'webp', 'gif', 'svg'],
    moderation: ['auto', 'low'],
    background: ['auto', 'opaque', 'transparent'],
    input_fidelity: ['high', 'low'],
    complexity: ['low', 'medium', 'high'],
  }
  for (const [key, allowed] of Object.entries(enums)) {
    const nullable = key === 'complexity' || key === 'input_fidelity'
    if (input[key] === undefined || (nullable && input[key] === null)) continue
    if (typeof input[key] !== 'string' || !allowed.includes(input[key])) fail(`${path}.${key}`)
  }
  if (input.size !== undefined && !/^(auto|\d+x\d+)$/.test(text(input.size, `${path}.size`))) fail(`${path}.size`)
  for (const key of ['n', 'output_compression', 'frame_count', 'frame_duration_ms']) {
    if (input[key] != null) finite(input[key], `${path}.${key}`)
  }
  if (input.n === null) fail(`${path}.n`)
  if (input.n != null && (!Number.isInteger(input.n) ||
      (input.n as number) < 1 || (input.n as number) > MAX_OPENAI_OUTPUT_IMAGES)) fail(`${path}.n`)
  if (input.output_compression != null && ((input.output_compression as number) < 0 || (input.output_compression as number) > 100)) fail(`${path}.output_compression`)
  for (const key of ['frame_count', 'frame_duration_ms']) {
    if (input[key] != null && (!Number.isInteger(input[key]) || (input[key] as number) <= 0)) fail(`${path}.${key}`)
  }
  // 旧备份缺少后来新增的参数时，使用该字段的历史默认值；已提供的非法值会在上面报错。
  return { ...DEFAULT_PARAMS, ...input } as TaskParams
}

function parseTask(value: unknown, index: number): TaskRecord {
  const path = `tasks[${index}]`
  const input = record(value, path)
  text(input.id, `${path}.id`)
  text(input.prompt, `${path}.prompt`, true)
  finite(input.createdAt, `${path}.createdAt`)
  optionalEnum(text(input.status, `${path}.status`), ['running', 'done', 'error', 'partial_error'], `${path}.status`)
  optionalEnum(input.taskKind, ['generation', 'image'], `${path}.taskKind`)
  optionalFields(input, path, [
    'providerId', 'providerName', 'categoryId', 'categoryName', 'parentTaskId', 'parentImageId',
    'editMaskImageId', 'editMarkupImageId', 'editSourceImageId', 'error',
  ], ['deletedAt', 'finishedAt', 'elapsed'], ['isFavorite', 'isAborted'])
  for (const key of ['inputImageIds', 'outputImages']) {
    const ids = input[key]
    if (!Array.isArray(ids)) fail(`${path}.${key}`)
    ids.forEach((id, i) => text(id, `${path}.${key}[${i}]`))
  }
  if (input.editSelection != null) {
    const selection = record(input.editSelection, `${path}.editSelection`)
    for (const key of ['x', 'y', 'width', 'height']) {
      const number = finite(selection[key], `${path}.editSelection.${key}`)
      if (number < 0 || number > 1) fail(`${path}.editSelection.${key}`)
    }
    if ((selection.x as number) + (selection.width as number) > 1.000001 ||
        (selection.y as number) + (selection.height as number) > 1.000001) fail(`${path}.editSelection`)
  }
  if (input.responseMeta != null) {
    const meta = record(input.responseMeta, `${path}.responseMeta`)
    optionalFields(meta, `${path}.responseMeta`, ['revisedPrompt'])
    if (meta.appliedImageParams != null) {
      optionalFields(record(meta.appliedImageParams, `${path}.responseMeta.appliedImageParams`), path,
        ['size', 'quality', 'output_format', 'background', 'action'])
    }
    if (meta.transport != null) {
      optionalFields(record(meta.transport, `${path}.responseMeta.transport`), path, ['requested', 'actual'], [], ['fallbackFromStream'])
    }
  }
  if (input.errorDebug != null) record(input.errorDebug, `${path}.errorDebug`)
  return recoverInterruptedTask({
    ...input,
    params: parseImportedParams(input.params, `${path}.params`),
    error: input.error ?? null,
    finishedAt: input.finishedAt ?? null,
    elapsed: input.elapsed ?? null,
  } as TaskRecord)
}

function validateConfiguration(input: Record<string, unknown>, path: string) {
  optionalFields(input, path, ['activeProviderId', 'activeCategoryFilter', 'galleryDisplayMode', 'appView'])
  optionalEnum(input.galleryDisplayMode, ['standard', 'image'], `${path}.galleryDisplayMode`)
  optionalEnum(input.appView, ['local', 'square'], `${path}.appView`)
  if (input.params != null) parseImportedParams(input.params, `${path}.params`)
  const validateSettings = (value: unknown, field: string) => {
    const settings = record(value, field)
    const stringFields = [
      'baseUrl', 'apiKey', 'model', 'responsesImageModel', 'responsesTransport', 'responsesImageInputMode',
      'responsesPromptRevisionMode', 'apiProtocol', 'requestMode', 'safetyIdentifier',
    ]
    for (const key of stringFields) if (settings[key] !== undefined) text(settings[key], `${field}.${key}`, true)
    if (settings.timeout !== undefined && finite(settings.timeout, `${field}.timeout`) <= 0) fail(`${field}.timeout`)
    if (settings.partialImages !== undefined && (!Number.isInteger(settings.partialImages) ||
        (settings.partialImages as number) < 0 || (settings.partialImages as number) > 3)) fail(`${field}.partialImages`)
    optionalEnum(settings.apiProtocol, ['images', 'responses'], `${field}.apiProtocol`)
    optionalEnum(settings.requestMode, ['direct', 'local_proxy'], `${field}.requestMode`)
    optionalEnum(settings.responsesTransport, ['auto', 'stream', 'json'], `${field}.responsesTransport`)
    optionalEnum(settings.responsesImageInputMode, ['auto', 'file_id'], `${field}.responsesImageInputMode`)
    optionalEnum(settings.responsesPromptRevisionMode, ['allow', 'compat'], `${field}.responsesPromptRevisionMode`)
  }
  if (input.settings !== undefined) validateSettings(input.settings, `${path}.settings`)
  for (const key of ['providers', 'categories', 'promptLibrary']) {
    if (input[key] === undefined) continue
    const items = input[key]
    if (!Array.isArray(items)) fail(`${path}.${key}`)
    const ids = new Set<string>()
    items.forEach((value, index) => {
      const field = `${path}.${key}[${index}]`
      const item = record(value, field)
      const id = text(item.id, `${field}.id`)
      if (ids.has(id)) fail(`${field}.id 重复`)
      ids.add(id)
      if (key === 'providers') {
        text(item.name, `${field}.name`)
        validateSettings(item, field)
      } else if (key === 'categories') {
        text(item.name, `${field}.name`)
        if (item.createdAt !== undefined) finite(item.createdAt, `${field}.createdAt`)
      } else {
        text(item.content, `${field}.content`)
        optionalFields(item, field, ['title'], ['createdAt', 'updatedAt'])
      }
    })
  }
}

export function parseExportManifest(value: unknown): ExportData {
  const input = record(value, 'manifest')
  if (![6, 7, 8, 9].includes(finite(input.version, 'version'))) throw new Error('备份版本不受支持，只支持 v6 至 v9')
  text(input.exportedAt, 'exportedAt')
  validateConfiguration(input, 'manifest')
  if (input.persistedState != null) validateConfiguration(record(input.persistedState, 'persistedState'), 'persistedState')
  if (!Array.isArray(input.tasks)) fail('tasks')
  const tasks = input.tasks.map(parseTask)
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) fail('tasks.id 重复')
  const images = record(input.imageFiles, 'imageFiles')
  for (const [id, value] of Object.entries(images)) {
    text(id, 'imageFiles.id')
    const image = record(value, `imageFiles.${id}`)
    optionalFields(image, `imageFiles.${id}`, ['path', 'thumbnailPath', 'url', 'mimeType', 'contentHash'], ['createdAt', 'width', 'height', 'byteSize'])
    optionalEnum(image.kind, ['local_blob', 'remote_url', 'legacy_data_url'], `imageFiles.${id}.kind`)
    optionalEnum(image.source, ['upload', 'generated'], `imageFiles.${id}.source`)
    for (const key of ['width', 'height', 'byteSize']) {
      if (image[key] != null && (image[key] as number) < 0) fail(`imageFiles.${id}.${key}`)
    }
    if (!image.path && !image.url) fail(`imageFiles.${id}.path/url`)
  }
  return { ...input, tasks } as unknown as ExportData
}
