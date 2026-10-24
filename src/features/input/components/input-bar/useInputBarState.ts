import {
  type ClipboardEventHandler,
  useCallback,
  useEffect,
  useState,
  type ChangeEventHandler,
  type DragEventHandler,
  type KeyboardEventHandler,
  type RefObject,
} from 'react'
import { DEFAULT_PARAMS, openLightbox, resolveTaskParamSizeOrDefault, useStore, submitTask } from '../../../../store'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  resolveCategoryFilterName,
  type InputImage,
  type TaskParams,
} from '../../../../types'
import {
  getChangedParams,
  getImageGenerationModel,
  getImageModelCapabilities,
  normalizeParamsForSettings,
} from '../../../../lib/capabilities'
import { API_MAX_IMAGES } from './shared'
import { getQualityOptions } from './paramsSectionShared'
import { useInputImageControls } from './useInputImageControls'
import { usePromptInputController } from './usePromptInputController'
import { useIsMobile } from './useIsMobile'

interface ProviderOption {
  label: string
  value: string
}

export interface PromptSectionViewModel {
  prompt: string
  normalizedPrompt: string
  promptHintText: string
  isMobile: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onPromptChange: (value: string) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
}

export interface ReferenceImagesSectionViewModel {
  isMobile: boolean
  inputImages: InputImage[]
  maskedInputCount: number
  primaryMaskedInput: InputImage | null
  atImageLimit: boolean
  showImageUrlInput: boolean
  imageUrlInput: string
  imageUrlInputRef: RefObject<HTMLInputElement | null>
  imageUrlPopoverRef: RefObject<HTMLDivElement | null>
  onToggleImageUrlInput: () => void
  onImageUrlInputChange: (value: string) => void
  onCancelImageUrlInput: () => void
  onSubmitImageUrl: () => void
  onOpenFilePicker: () => void
  onPreviewImage: (imageId: string) => void
  onRemoveInputImage: (index: number) => void
  onRequestClearAllImages: () => void
  onReopenMaskedEdit: () => void
  onClearMaskedEdit: () => void
}

export interface ParamsSectionViewModel {
  activeProviderId: string
  providerOptions: ProviderOption[]
  normalizedSize: string
  params: TaskParams
  qualityOptions: Array<{ label: string; value: string }>
  hasInputImages: boolean
  outputCompressionInput: string
  nInput: string
  selectClass: string
  onActiveProviderChange: (providerId: string) => void
  onOpenSizePicker: () => void
  onSetParams: (params: Partial<TaskParams>) => void
  onOutputCompressionInputChange: (value: string) => void
  onCommitOutputCompression: () => void
  onNInputChange: (value: string) => void
  onCommitN: () => void
}

export interface SubmitSectionViewModel {
  generationTargetLabel: string
  hasApiKey: boolean
  canSubmit: boolean
  isMobile: boolean
  onSubmit: () => void
  onOpenSettings: () => void
}

export interface InputPanelBindings {
  onPaste: ClipboardEventHandler<HTMLDivElement>
  onDragEnter: DragEventHandler<HTMLDivElement>
  onDragOver: DragEventHandler<HTMLDivElement>
  onDragLeave: DragEventHandler<HTMLDivElement>
  onDrop: DragEventHandler<HTMLDivElement>
}

export interface InputBarContentViewModel {
  isMobile: boolean
  panelBindings: InputPanelBindings
  promptSectionProps: PromptSectionViewModel
  referenceImagesSectionProps: ReferenceImagesSectionViewModel
  paramsSectionProps: ParamsSectionViewModel
  submitSectionProps: SubmitSectionViewModel
}

export interface InputBarViewModel {
  isMobile: boolean
  normalizedPrompt: string
  promptPreview: string
  isDragging: boolean
  atImageLimit: boolean
  mobileDrawerOpen: boolean
  showSizePicker: boolean
  sizePickerValue: string
  fileInputRef: RefObject<HTMLInputElement | null>
  inputContent: InputBarContentViewModel
  onOpenMobileDrawer: () => void
  onCloseMobileDrawer: () => void
  onFileUpload: ChangeEventHandler<HTMLInputElement>
  onSelectSize: (size: string) => void
  onCloseSizePicker: () => void
}

export function useInputBarState(): InputBarViewModel {
  // ===== Store selectors =====
  const prompt = useStore((state) => state.prompt)
  const setPrompt = useStore((state) => state.setPrompt)
  const inputImages = useStore((state) => state.inputImages)
  const removeInputImage = useStore((state) => state.removeInputImage)
  const clearInputImages = useStore((state) => state.clearInputImages)
  const categories = useStore((state) => state.categories)
  const activeCategoryFilter = useStore((state) => state.activeCategoryFilter)
  const providers = useStore((state) => state.providers)
  const activeProviderId = useStore((state) => state.activeProviderId)
  const setActiveProvider = useStore((state) => state.setActiveProvider)
  const params = useStore((state) => state.params)
  const setParams = useStore((state) => state.setParams)
  const settings = useStore((state) => state.settings)
  const setShowSettings = useStore((state) => state.setShowSettings)
  const setConfirmDialog = useStore((state) => state.setConfirmDialog)

  // ===== Local state =====
  const [showSizePicker, setShowSizePicker] = useState(false)
  const [outputCompressionInput, setOutputCompressionInput] = useState(
    params.output_compression == null ? '' : String(params.output_compression),
  )
  const [nInput, setNInput] = useState(String(params.n))
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // ===== Derived values =====
  const isMobile = useIsMobile()
  const providerOptions = providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  }))
  const generationTargetLabel =
    activeCategoryFilter === ALL_CATEGORY_FILTER || activeCategoryFilter === FAVORITES_CATEGORY_FILTER
      ? '未分类'
      : resolveCategoryFilterName(activeCategoryFilter, categories)
  const promptHintText = isMobile
    ? '先写主体需求，下面直接补充供应商、质量和尺寸'
    : '桌面端支持 Ctrl+Enter 直接生成'
  const canSubmit = (prompt.trim() || inputImages.length) && settings.apiKey
  const atImageLimit = inputImages.length >= API_MAX_IMAGES
  const hasInputImages = inputImages.length > 0
  const imageModelCapabilities = getImageModelCapabilities(getImageGenerationModel(settings))
  const qualityOptions = getQualityOptions(imageModelCapabilities.supportsXHighQuality)
  const maskedInputCount = inputImages.filter((image) => Boolean(image.maskDataUrl)).length
  const primaryMaskedInputIndex = inputImages.findIndex((image) => Boolean(image.maskDataUrl))
  const primaryMaskedInput =
    primaryMaskedInputIndex >= 0 ? inputImages[primaryMaskedInputIndex] : null
  const normalizedPrompt = prompt.trim()
  const promptPreview =
    normalizedPrompt.replace(/\s+/g, ' ').slice(0, 120) || '输入框已收起，点击展开继续编辑'
  const normalizedSize = resolveTaskParamSizeOrDefault(params.size)
  const selectClass = `rounded-xl border border-gray-200/60 bg-white/50 px-3 text-[13px] transition-all duration-200 shadow-sm hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06] ${
    isMobile ? 'py-2.5' : 'py-2'
  }`

  useEffect(() => {
    setOutputCompressionInput(
      params.output_compression == null ? '' : String(params.output_compression),
    )
  }, [params.output_compression])

  useEffect(() => {
    setNInput(String(params.n))
  }, [params.n])

  useEffect(() => {
    const normalizedParams = normalizeParamsForSettings(params, settings, { hasInputImages })
    const patch = getChangedParams(params, normalizedParams)
    if (Object.keys(patch).length > 0) {
      setParams(patch)
    }
  }, [hasInputImages, params, setParams, settings])

  // ===== Callbacks =====
  const commitNormalizedParams = useCallback((nextParams: TaskParams) => {
    const normalizedParams = normalizeParamsForSettings(nextParams, settings, { hasInputImages })
    const patch = getChangedParams(params, normalizedParams)
    if (Object.keys(patch).length > 0) {
      setParams(patch)
    }
    return normalizedParams
  }, [hasInputImages, params, setParams, settings])

  const applyParamPatch = useCallback((patch: Partial<TaskParams>) => {
    commitNormalizedParams({
      ...params,
      ...patch,
    })
  }, [commitNormalizedParams, params])

  const commitOutputCompression = useCallback(() => {
    if (outputCompressionInput.trim() === '') {
      setOutputCompressionInput('')
      applyParamPatch({ output_compression: null })
      return
    }

    const nextValue = Number(outputCompressionInput)
    if (Number.isNaN(nextValue)) {
      setOutputCompressionInput(
        params.output_compression == null ? '' : String(params.output_compression),
      )
      return
    }

    setOutputCompressionInput(String(nextValue))
    applyParamPatch({ output_compression: nextValue })
  }, [applyParamPatch, outputCompressionInput, params.output_compression])

  const commitN = useCallback(() => {
    const nextValue = Number(nInput)
    const requestedValue =
      nInput.trim() === '' ? DEFAULT_PARAMS.n : Number.isNaN(nextValue) ? params.n : nextValue
    const normalizedParams = commitNormalizedParams({
      ...params,
      n: requestedValue,
    })
    setNInput(String(normalizedParams.n))
  }, [commitNormalizedParams, nInput, params])

  const requestClearInputImages = useCallback(() => {
    setConfirmDialog({
      title: '清空参考图',
      message: `确定要清空全部 ${inputImages.length} 张参考图吗？`,
      action: () => clearInputImages(),
    })
  }, [clearInputImages, inputImages.length, setConfirmDialog])

  const handleSubmit = useCallback(() => {
    submitTask()
    setMobileDrawerOpen(false)
  }, [])

  // ===== Sub-ViewModel: PromptSection =====
  const promptSectionProps = usePromptInputController({
    prompt,
    normalizedPrompt,
    promptHintText,
    isMobile,
    inputImageCount: inputImages.length,
    mobileDrawerOpen,
    onPromptChange: setPrompt,
  })

  // ===== Sub-ViewModel: ReferenceImagesSection =====
  const { fileInputRef, isDragging, onFileUpload, panelBindings, referenceImagesSectionProps } =
    useInputImageControls({
      isMobile,
      inputImages,
      maskedInputCount,
      primaryMaskedInput,
      primaryMaskedInputIndex,
    atImageLimit,
    mobileDrawerOpen,
    onPreviewImage: (imageId) => openLightbox(imageId, inputImages.map((image) => image.id)),
    onRemoveInputImage: removeInputImage,
    onRequestClearAllImages: requestClearInputImages,
  })

  // ===== Sub-ViewModel: ParamsSection =====
  const paramsSectionProps: ParamsSectionViewModel = {
    activeProviderId,
    providerOptions,
    normalizedSize,
    params,
    qualityOptions,
    hasInputImages,
    outputCompressionInput,
    nInput,
    selectClass,
    onActiveProviderChange: setActiveProvider,
    onOpenSizePicker: () => setShowSizePicker(true),
    onSetParams: applyParamPatch,
    onOutputCompressionInputChange: setOutputCompressionInput,
    onCommitOutputCompression: commitOutputCompression,
    onNInputChange: setNInput,
    onCommitN: commitN,
  }

  // ===== Sub-ViewModel: SubmitSection =====
  const submitSectionProps: SubmitSectionViewModel = {
    generationTargetLabel,
    hasApiKey: Boolean(settings.apiKey),
    canSubmit: Boolean(canSubmit),
    isMobile,
    onSubmit: handleSubmit,
    onOpenSettings: () => setShowSettings(true),
  }

  // ===== Assemble InputBarViewModel =====
  return {
    isMobile,
    normalizedPrompt,
    promptPreview,
    isDragging,
    atImageLimit,
    mobileDrawerOpen,
    showSizePicker,
    sizePickerValue: params.size,
    fileInputRef,
    inputContent: {
      isMobile,
      panelBindings,
      promptSectionProps,
      referenceImagesSectionProps,
      paramsSectionProps,
      submitSectionProps,
    },
    onOpenMobileDrawer: () => setMobileDrawerOpen(true),
    onCloseMobileDrawer: () => setMobileDrawerOpen(false),
    onFileUpload,
    onSelectSize: (size) => applyParamPatch({ size }),
    onCloseSizePicker: () => setShowSizePicker(false),
  }
}
