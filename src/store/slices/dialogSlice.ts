import type { AppState, StoreSetter } from '../contracts'

export function createDialogSlice(set: StoreSetter): Pick<AppState, 'toast' | 'showToast' | 'confirmDialog' | 'setConfirmDialog'> {
  return {
    toast: null,
    showToast(message: string, type: "info" | "success" | "error" = "info") {
      set({ toast: { message, type } })
      setTimeout(() => {
        set((state) => (state.toast?.message === message ? { toast: null } : state))
      }, 3000)
    },
    confirmDialog: null,
    setConfirmDialog(confirmDialog) { set({ confirmDialog }) },
  }
}
