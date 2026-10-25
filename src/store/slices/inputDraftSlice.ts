import { createPromptLibraryItem, normalizePromptLibraryItems } from "@/store/domain"
import { evictImage } from "@/store/imageAssets"
import { DEFAULT_PARAMS } from "@/store/taskParams"

export function createInputDraftSlice(set: any) {
  return {
    prompt: "",
    setPrompt(prompt: string) { set({ prompt }) },

    promptLibrary: [] as any[],
    replacePromptLibrary(promptLibrary: any) {
      set(() => ({ promptLibrary: normalizePromptLibraryItems(promptLibrary) }))
    },
    savePromptLibraryItem(input: { title?: string; content: string }) {
      const nextItem = createPromptLibraryItem(input.content, input.title)
      set((state: any) => ({
        promptLibrary: [nextItem, ...state.promptLibrary.filter((item: any) => item.id !== nextItem.id)],
      }))
      return nextItem
    },
    removePromptLibraryItem(id: string) {
      set((state: any) => ({ promptLibrary: state.promptLibrary.filter((item: any) => item.id !== id) }))
    },

    inputImages: [] as any[],
    addInputImage(image: any) {
      set((state: any) => {
        if (state.inputImages.find((item: any) => item.id === image.id)) return state
        return { inputImages: [...state.inputImages, image] }
      })
    },
    removeInputImage(index: number) {
      set((state: any) => ({ inputImages: state.inputImages.filter((_: any, i: number) => i !== index) }))
    },
    clearInputImages() {
      set((state: any) => {
        for (const image of state.inputImages) evictImage(image.id)
        return { inputImages: [] }
      })
    },
    setInputImages(inputImages: any[]) { set({ inputImages }) },

    params: { ...DEFAULT_PARAMS },
    setParams(params: any) {
      set((state: any) => ({ params: { ...state.params, ...params } }))
    },
  }
}
