import { useMemo, useRef } from 'react'

import {

  applyImageEditToInput,

  closeImageEditor,

  getImageView,

  useStore,

} from '@/store'

import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'

import ImageEditCanvasPanel from './ImageEditCanvasPanel'

import ImageEditSidebar from './ImageEditSidebar'

import { createMaskFromSelection } from './shared'

import { useImageEditState } from './useImageEditState'

import { useImageSelectionOverlay } from './useImageSelectionOverlay'



export default function ImageEditModal() {

  const imageEditSession = useStore((state) => state.imageEditSession)

  const providers = useStore((state) => state.providers)

  const activeProviderId = useStore((state) => state.activeProviderId)

  const overlayRef = useRef<HTMLDivElement | null>(null)



  useCloseOnEscape(Boolean(imageEditSession), closeImageEditor)



  const {

    promptDraft,

    setPromptDraft,

    providerDraft,

    setProviderDraft,

    selection,

    setSelection,

    naturalSize,

    isSubmitting,

    setIsSubmitting,

    availableImageIds,

    displayRect,

    panelRef,

    imageRef,

    displayImageCount,

    currentImageNumber,

    hasMultipleImages,

    currentImageId,

    displayImageSrc,

    handleImageLoad,

    switchImage,

  } = useImageEditState(imageEditSession, activeProviderId)



  const {

    selectionStyle,

    selectionPixelInfo,

    handlePointerDown,

    handlePointerMove,

    handlePointerUp,

    handlePointerCancel,

  } = useImageSelectionOverlay({

    overlayRef,

    selection,

    setSelection,

    naturalSize,

  })



  const providerOptions = useMemo(

    () =>

      providers.map((provider) => ({

        label: provider.name,

        value: provider.id,

      })),

    [providers],

  )



  if (!imageEditSession) return null



  const selectedProviderId = providerDraft || imageEditSession.providerId || activeProviderId

  const modeLabel = selection ? '局部编辑' : '整图编辑'



  const handleApply = async (submit: boolean) => {

    if (!naturalSize || isSubmitting || !currentImageId || !displayImageSrc) return



    setIsSubmitting(true)

    try {

      const handle = getImageView(currentImageId)

      const sourceImageDataUrl = await handle.getRawDataUrl()

      if (!sourceImageDataUrl) {

        throw new Error('当前图片读取失败，无法写回编辑输入区')

      }



      const maskDataUrl = createMaskFromSelection(naturalSize.width, naturalSize.height, selection)

      await applyImageEditToInput({

        session: {

          ...imageEditSession,

          sourceImageId: currentImageId,

          sourceImageDataUrl,

          sourceImageIds: availableImageIds,

          lineageParentImageId: imageEditSession.lineageParentTaskId ? currentImageId : null,

        },

        prompt: promptDraft,

        providerId: selectedProviderId,

        maskDataUrl,

        selection,

        sourceSize: `${naturalSize.width}x${naturalSize.height}`,

        submit,

      })

    } finally {

      setIsSubmitting(false)

    }

  }



  return (

    <div

      data-image-edit-root

      className="fixed inset-0 z-[85] flex items-center justify-center p-4"

      onClick={closeImageEditor}

      onContextMenu={(event) => event.preventDefault()}

    >

      <div className="absolute inset-0 animate-overlay-in bg-black/45 backdrop-blur-sm" />

      <div

        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#121214] shadow-2xl animate-modal-in lg:flex-row"

        onClick={(event) => event.stopPropagation()}

      >

        <ImageEditCanvasPanel

          displayImageSrc={displayImageSrc}

          hasMultipleImages={hasMultipleImages}

          currentImageNumber={currentImageNumber}

          displayImageCount={displayImageCount}

          selection={selection}

          selectionStyle={selectionStyle}

          selectionPixelInfo={selectionPixelInfo}

          displayRect={displayRect}

          panelRef={panelRef}

          imageRef={imageRef}

          overlayRef={overlayRef}

          onImageLoad={handleImageLoad}

          onSwitchImage={switchImage}

          onPointerDown={handlePointerDown}

          onPointerMove={handlePointerMove}

          onPointerUp={handlePointerUp}

          onPointerCancel={handlePointerCancel}

        />



        <ImageEditSidebar

          imageEditSession={imageEditSession}

          modeLabel={modeLabel}

          naturalSize={naturalSize}

          selectedProviderId={selectedProviderId}

          providerOptions={providerOptions}

          promptDraft={promptDraft}

          currentImageNumber={currentImageNumber}

          displayImageCount={displayImageCount}

          selection={selection}

          isSubmitting={isSubmitting}

          onClose={closeImageEditor}

          onProviderChange={setProviderDraft}

          onPromptChange={setPromptDraft}

          onClearSelection={() => setSelection(null)}

          onRestorePrompt={() => setPromptDraft(imageEditSession.prompt)}

          onApplyToInput={() => {

            void handleApply(false)

          }}

          onSubmit={() => {

            void handleApply(true)

          }}

        />

      </div>

    </div>

  )

}

