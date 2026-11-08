import type { TaskRecord } from '@/types'
import { STORE_TASKS, dbTransaction, writeDbBatch } from './schema'

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return dbTransaction(STORE_TASKS, 'readonly', (s) => s.getAll())
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.put(task))
}

export function putTasks(tasks: TaskRecord[]): Promise<void> {
  return writeDbBatch([STORE_TASKS], (transaction) => {
    const store = transaction.objectStore(STORE_TASKS)
    for (const task of tasks) store.put(task)
  })
}

export function deleteTask(id: string): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.delete(id))
}

export function clearTasks(): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.clear())
}
