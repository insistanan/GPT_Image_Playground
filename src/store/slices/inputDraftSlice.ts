import { createPromptLibraryItem, normalizePromptLibraryItems } from "@/store/domain"
import { evictImage } from "@/store/imageAssets"
import { DEFAULT_PARAMS } from "@/store/taskParams"
import type { AppState, StoreSetter } from '../contracts'
import type { InputImage, PromptLibraryItem, TaskParams } from '@/types'

type InputDraftSlice = Pick<AppState,
  | 'prompt' | 'setPrompt' | 'promptLibrary' | 'replacePromptLibrary' | 'savePromptLibraryItem'
  | 'removePromptLibraryItem' | 'inputImages' | 'addInputImage' | 'removeInputImage'
  | 'clearInputImages' | 'setInputImages' | 'params' | 'setParams'
>

export function createInputDraftSlice(set: StoreSetter): InputDraftSlice {
  return {
    prompt: "",
    setPrompt(prompt: string) { set({ prompt }) },

    promptLibrary: [],
    replacePromptLibrary(promptLibrary: PromptLibraryItem[]) {
      set(() => ({ promptLibrary: normalizePromptLibraryItems(promptLibrary) }))
    },
    savePromptLibraryItem(input: { title?: string; content: string }) {
      const nextItem = createPromptLibraryItem(input.content, input.title)
      set((state) => ({
        promptLibrary: [nextItem, ...state.promptLibrary.filter((item) => item.id !== nextItem.id)],
      }))
      return nextItem
    },
    removePromptLibraryItem(id: string) {
      set((state) => ({ promptLibrary: state.promptLibrary.filter((item) => item.id !== id) }))
    },

    inputImages: [],
    addInputImage(image: InputImage) {
      set((state) => {
        if (state.inputImages.find((item) => item.id === image.id)) return state
        return { inputImages: [...state.inputImages, image] }
      })
    },
    removeInputImage(index: number) {
      set((state) => ({ inputImages: state.inputImages.filter((_, i) => i !== index) }))
    },
    clearInputImages() {
      set((state) => {
        for (const image of state.inputImages) evictImage(image.id)
        return { inputImages: [] }
      })
    },
    setInputImages(inputImages: InputImage[]) { set({ inputImages }) },

    params: { ...DEFAULT_PARAMS },
    setParams(params: Partial<TaskParams>) {
      set((state) => ({ params: { ...state.params, ...params } }))
    },
  }
}
