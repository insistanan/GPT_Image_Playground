import { useEffect, useRef, useState } from 'react'

import type { TaskRecord } from '@/types'

import { getImageView } from '@/store'

import { formatImageRatio } from '@/lib/size'

import { useImageAssetView } from '@/hooks/useImageAssetView'



export function useDetailImageState(task: TaskRecord | null, detailTaskId: string | null) {

  const [imageIndex, setImageIndex] = useState(0)

  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({})

  const [imageLabelLeft, setImageLabelLeft] = useState(8)

  const imagePanelRef = useRef<HTMLDivElement | null>(null)

  const mainImageRef = useRef<HTMLImageElement | null>(null)



  useEffect(() => {

    setImageIndex(0)

  }, [detailTaskId])



  useEffect(() => {

    if (!task) return



    let cancelled = false

    const ids = task.inputImageIds || []



    for (const id of ids) {

      const handle = getImageView(id)

      const cached = handle.displayUrl

        ? { url: handle.displayUrl, metadata: handle.metadata } as { url: string; metadata: unknown }

        : null

      if (cached) {

        setImageSrcs((previous) => ({ ...previous, [id]: cached.url }))

        continue

      }



      void getImageView(id).reload().then((h) => {

        if (!cancelled && h.displayUrl) {

          setImageSrcs((previous) => ({ ...previous, [id]: h.displayUrl! }))

        }

      })

    }



    return () => {

      cancelled = true

    }

  }, [task])



  const currentOutputImageId = task?.outputImages?.[imageIndex] || ''

  const outputLen = task?.outputImages?.length || 0

  const hasGeneratedOutputs = outputLen > 0

  const { url: currentOutputImageSrc, metadata: currentOutputMetadata } = useImageAssetView(

    currentOutputImageId,

    {

      includeMetadata: true,

      inferMetadataFromUrl: true,

    },

  )

  const currentImageRatio = currentOutputMetadata

    ? formatImageRatio(currentOutputMetadata.width, currentOutputMetadata.height)

    : ''

  const currentImageSize = currentOutputMetadata

    ? `${currentOutputMetadata.width}×${currentOutputMetadata.height}`

    : ''



  const updateImageLabelLeft = () => {

    const panel = imagePanelRef.current

    const image = mainImageRef.current

    if (!panel || !image) return



    const panelRect = panel.getBoundingClientRect()

    const imageRect = image.getBoundingClientRect()

    setImageLabelLeft(Math.max(8, imageRect.left - panelRect.left))

  }



  useEffect(() => {

    updateImageLabelLeft()

    window.addEventListener('resize', updateImageLabelLeft)

    return () => window.removeEventListener('resize', updateImageLabelLeft)

  }, [currentOutputImageSrc])



  return {

    imageIndex,

    setImageIndex,

    imageSrcs,

    imageLabelLeft,

    imagePanelRef,

    mainImageRef,

    currentOutputImageId,

    currentOutputImageSrc,

    currentImageRatio,

    currentImageSize,

    outputLen,

    hasGeneratedOutputs,

    updateImageLabelLeft,

  }

}

