import type { AppView } from '@/types'

export function createViewerSlice(set: any) {
  return {
    appView: 'local' as AppView,
    setAppView(appView: AppView) {
      set((state: any) => ({
        appView,
        selectedTaskIds: [],
        imageEditSession: null,
        detailTaskId: null,
        shareToSquareTarget: appView === 'square' ? null : state.shareToSquareTarget,
      }))
    },
    imageEditSession: null as any,
    setImageEditSession(imageEditSession: any) { set({ imageEditSession }) },
    detailTaskId: null as string | null,
    setDetailTaskId(detailTaskId: string | null) { set({ detailTaskId }) },
    lightboxImageId: null as string | null,
    lightboxImageList: [] as string[],
    setLightboxImageId(lightboxImageId: string | null, list?: string[]) {
      set({ lightboxImageId, lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []) })
    },
    showSettings: false,
    setShowSettings(showSettings: boolean) {
      set((state: any) => ({ showSettings, showPromptLibrary: showSettings ? false : state.showPromptLibrary }))
    },
    showPromptLibrary: false,
    setShowPromptLibrary(showPromptLibrary: boolean) {
      set((state: any) => ({ showPromptLibrary, showSettings: showPromptLibrary ? false : state.showSettings }))
    },
    shareToSquareTarget: null as any,
    setShareToSquareTarget(shareToSquareTarget: any) {
      set({ shareToSquareTarget })
    },
  }
}
