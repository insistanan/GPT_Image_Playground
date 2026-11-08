import type { CategoryConfig, TaskRecord } from '@/types'
import { ALL_CATEGORY_FILTER, FAVORITES_CATEGORY_FILTER, UNCATEGORIZED_CATEGORY_FILTER } from '@/types'

function genCategoryId(): string {
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function findCategoryById(
  categories: CategoryConfig[],
  categoryId: string | null | undefined,
): CategoryConfig | undefined {
  if (!categoryId) {
    return undefined
  }

  return categories.find((category) => category.id === categoryId)
}

export function normalizeCategoryName(name: string): string {
  return name.trim()
}

export function createCategoryConfig(
  name: string,
  id = genCategoryId(),
  createdAt = Date.now(),
): CategoryConfig {
  const normalizedName = normalizeCategoryName(name)
  if (!normalizedName) {
    throw new Error('分类名称不能为空')
  }

  return {
    id,
    name: normalizedName,
    createdAt,
  }
}

export function normalizeCategoryList(categories: unknown): CategoryConfig[] {
  if (!Array.isArray(categories)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: CategoryConfig[] = []

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index]
    if (!category || typeof category !== 'object') {
      continue
    }

    const record = category as Partial<CategoryConfig> & Record<string, unknown>
    if (typeof record.id !== 'string' || !record.id.trim() || seen.has(record.id)) {
      continue
    }

    const normalizedName = normalizeCategoryName(typeof record.name === 'string' ? record.name : '')
    if (!normalizedName) {
      continue
    }

    normalized.push({
      ...record,
      id: record.id,
      name: normalizedName,
      createdAt:
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
          ? record.createdAt
          : Date.now() + index,
    })
    seen.add(record.id)
  }

  return normalized
}

export function mergeCategoriesFromTasks(
  categories: CategoryConfig[],
  tasks: Array<Pick<TaskRecord, 'categoryId' | 'categoryName' | 'createdAt'>>,
): CategoryConfig[] {
  const normalizedCategories = normalizeCategoryList(categories)
  const seen = new Set(normalizedCategories.map((category) => category.id))
  const derivedCategories: CategoryConfig[] = []
  const sortedTasks = [...tasks].sort((left, right) => left.createdAt - right.createdAt)

  for (const task of sortedTasks) {
    const categoryId = typeof task.categoryId === 'string' ? task.categoryId.trim() : ''
    const categoryName =
      typeof task.categoryName === 'string' ? normalizeCategoryName(task.categoryName) : ''
    if (!categoryId || !categoryName || seen.has(categoryId)) {
      continue
    }

    derivedCategories.push(
      createCategoryConfig(
        categoryName,
        categoryId,
        typeof task.createdAt === 'number' && Number.isFinite(task.createdAt)
          ? task.createdAt
          : Date.now(),
      ),
    )
    seen.add(categoryId)
  }

  return derivedCategories.length > 0
    ? [...normalizedCategories, ...derivedCategories]
    : normalizedCategories
}

// ===== Prompt Library =====

export function resolveActiveCategoryFilter(
  filter: unknown,
  categories: CategoryConfig[],
): string {
  if (
    filter === ALL_CATEGORY_FILTER ||
    filter === FAVORITES_CATEGORY_FILTER ||
    filter === UNCATEGORIZED_CATEGORY_FILTER
  ) {
    return filter
  }

  if (typeof filter === 'string' && categories.some((category) => category.id === filter)) {
    return filter
  }

  return ALL_CATEGORY_FILTER
}

export function ensureCategoryNameAvailable(
  categories: CategoryConfig[],
  name: string,
  excludeId?: string,
): string {
  const normalizedName = normalizeCategoryName(name)
  if (!normalizedName) {
    throw new Error('分类名称不能为空')
  }

  const normalizedLower = normalizedName.toLocaleLowerCase()
  const exists = categories.some(
    (category) =>
      category.id !== excludeId && category.name.trim().toLocaleLowerCase() === normalizedLower,
  )
  if (exists) {
    throw new Error('分类名称已存在')
  }

  return normalizedName
}

function getCategoryNameKey(name: string): string {
  return normalizeCategoryName(name).toLocaleLowerCase()
}

export function findCategoryByName(
  categories: CategoryConfig[],
  categoryName: string,
): CategoryConfig | undefined {
  const nameKey = getCategoryNameKey(categoryName)
  if (!nameKey) {
    return undefined
  }

  return categories.find((category) => getCategoryNameKey(category.name) === nameKey)
}

export function mergeImportedCategories(
  currentCategories: CategoryConfig[],
  importedCategories: CategoryConfig[],
): {
  categories: CategoryConfig[]
  categoryIdMap: Map<string, string>
  addedCategoryCount: number
} {
  const mergedCategories = normalizeCategoryList(currentCategories)
  const categoryIdMap = new Map<string, string>()
  const baseCount = mergedCategories.length

  for (const importedCategory of normalizeCategoryList(importedCategories)) {
    const categoryWithSameId = mergedCategories.find((category) => category.id === importedCategory.id)
    const categoryWithSameName = findCategoryByName(mergedCategories, importedCategory.name)

    if (categoryWithSameId && categoryWithSameId.name === importedCategory.name) {
      categoryIdMap.set(importedCategory.id, categoryWithSameId.id)
      continue
    }

    if (categoryWithSameName) {
      categoryIdMap.set(importedCategory.id, categoryWithSameName.id)
      continue
    }

    if (categoryWithSameId) {
      const createdCategory = createCategoryConfig(
        importedCategory.name,
        undefined,
        importedCategory.createdAt,
      )
      mergedCategories.push(createdCategory)
      categoryIdMap.set(importedCategory.id, createdCategory.id)
      continue
    }

    mergedCategories.push(importedCategory)
    categoryIdMap.set(importedCategory.id, importedCategory.id)
  }

  return {
    categories: mergedCategories,
    categoryIdMap,
    addedCategoryCount: mergedCategories.length - baseCount,
  }
}
