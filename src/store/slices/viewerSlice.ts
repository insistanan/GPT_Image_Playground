import type { AppView } from '@/types'
import type { AppState, StoreSetter } from '../contracts'

type ViewerSlice = Pick<AppState,
  | 'appView' | 'setAppView' | 'imageEditSession' | 'setImageEditSession' | 'detailTaskId' | 'setDetailTaskId'
  | 'lightboxImageId' | 'lightboxImageList' | 'setLightboxImageId' | 'showSettings' | 'setShowSettings'
  | 'showPromptLibrary' | 'setShowPromptLibrary' | 'shareToSquareTarget' | 'setShareToSquareTarget'
>

export function createViewerSlice(set: StoreSetter): ViewerSlice {
  return {
    appView: 'local' as AppView,
    setAppView(appView: AppView) {
      set((state) => ({
        appView,
        selectedTaskIds: [],
        imageEditSession: null,
        detailTaskId: null,
        shareToSquareTarget: appView === 'square' ? null : state.shareToSquareTarget,
      }))
    },
    imageEditSession: null,
    setImageEditSession(imageEditSession) { set({ imageEditSession }) },
    detailTaskId: null as string | null,
    setDetailTaskId(detailTaskId: string | null) { set({ detailTaskId }) },
    lightboxImageId: null as string | null,
    lightboxImageList: [] as string[],
    setLightboxImageId(lightboxImageId: string | null, list?: string[]) {
      set({ lightboxImageId, lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []) })
    },
    showSettings: false,
    setShowSettings(showSettings: boolean) {
      set((state) => ({ showSettings, showPromptLibrary: showSettings ? false : state.showPromptLibrary }))
    },
    showPromptLibrary: false,
    setShowPromptLibrary(showPromptLibrary: boolean) {
      set((state) => ({ showPromptLibrary, showSettings: showPromptLibrary ? false : state.showSettings }))
    },
    shareToSquareTarget: null,
    setShareToSquareTarget(shareToSquareTarget) {
      set({ shareToSquareTarget })
    },
  }
}
