import type { PromptLibraryItem } from '@/types'
import { genId } from '../constants'

function normalizePromptLibraryContent(content: unknown): string {
  return typeof content === 'string' ? content.replace(/\r\n/g, '\n').trim() : ''
}

function normalizePromptLibraryTitle(title: unknown, content: string): string {
  const normalizedTitle =
    typeof title === 'string' ? title.trim().replace(/\s+/g, ' ').slice(0, 48) : ''
  if (normalizedTitle) {
    return normalizedTitle
  }

  const fallbackTitle = content
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .find(Boolean)

  if (!fallbackTitle) {
    throw new Error('提示词标题不能为空')
  }

  return fallbackTitle.slice(0, 48)
}

export function createPromptLibraryItem(
  content: string,
  title?: string,
  id = `prompt-${genId()}`,
  createdAt = Date.now(),
  updatedAt = createdAt,
): PromptLibraryItem {
  const normalizedContent = normalizePromptLibraryContent(content)
  if (!normalizedContent) {
    throw new Error('提示词不能为空')
  }

  return {
    id,
    title: normalizePromptLibraryTitle(title, normalizedContent),
    content: normalizedContent,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : createdAt,
  }
}

export function normalizePromptLibraryItems(items: unknown): PromptLibraryItem[] {
  if (!Array.isArray(items)) {
    return []
  }

  const seenIds = new Set<string>()
  const normalized: PromptLibraryItem[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Partial<PromptLibraryItem> & Record<string, unknown>
    const content = normalizePromptLibraryContent(record.content)
    if (!content) {
      continue
    }

    const id =
      typeof record.id === 'string' && record.id.trim() && !seenIds.has(record.id)
        ? record.id
        : `prompt-${genId()}`

    try {
      normalized.push(
        createPromptLibraryItem(
          content,
          record.title,
          id,
          typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
            ? record.createdAt
            : Date.now() + index,
          typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
            ? record.updatedAt
            : typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
              ? record.createdAt
              : Date.now() + index,
        ),
      )
      seenIds.add(id)
    } catch {
      continue
    }
  }

  return normalized.sort((left, right) => right.updatedAt - left.updatedAt)
}

function getPromptLibraryItemSignature(item: PromptLibraryItem): string {
  return `${item.title.trim().toLocaleLowerCase()}\u0000${normalizePromptLibraryContent(item.content)}`
}

export function mergePromptLibraryItems(
  currentItems: PromptLibraryItem[],
  importedItems: PromptLibraryItem[],
): { promptLibrary: PromptLibraryItem[]; addedCount: number } {
  const merged = [...normalizePromptLibraryItems(currentItems)]
  const seenSignatures = new Set(merged.map(getPromptLibraryItemSignature))
  let addedCount = 0

  for (const importedItem of normalizePromptLibraryItems(importedItems)) {
    const signature = getPromptLibraryItemSignature(importedItem)
    if (seenSignatures.has(signature)) {
      continue
    }

    const nextItem = merged.some((item) => item.id === importedItem.id)
      ? { ...importedItem, id: `prompt-${genId()}` }
      : importedItem

    merged.push(nextItem)
    seenSignatures.add(signature)
    addedCount += 1
  }

  return {
    promptLibrary: merged.sort((left, right) => right.updatedAt - left.updatedAt),
    addedCount,
  }
}

// ===== Image Utilities =====
