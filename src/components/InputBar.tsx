import { useRef, useEffect, useCallback, useState } from 'react'
import {
  useStore,
  submitTask,
  addImageFromFile,
  addImageFromUrl,
  clearInputImageEdit,
  reopenImageEditorFromInputImage,
} from '../store'
import {
  ALL_CATEGORY_FILTER,
  DEFAULT_PARAMS,
  FAVORITES_CATEGORY_FILTER,
  resolveCategoryFilterName,
} from '../types'
import { normalizeImageSize } from '../lib/size'
import Select from './Select'
import SizePickerModal from './SizePickerModal'

/** 通用悬浮气泡提示 */
function ButtonTooltip({ visible, text }: { visible: boolean; text: string }) {
  if (!visible) return null
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-10 whitespace-nowrap">
      <div className="relative bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </div>
    </div>
  )
}

/** API 支持的最大参考图数量 */
const API_MAX_IMAGES = 16

function isRemotePreviewUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function shouldIgnoreExpandShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tagName = target.tagName
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'BUTTON' ||
    tagName === 'A' ||
    target.closest('[role="button"]') !== null
  )
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function InputBar() {
  const prompt = useStore((s) => s.prompt)
  const setPrompt = useStore((s) => s.setPrompt)
  const inputImages = useStore((s) => s.inputImages)
  const removeInputImage = useStore((s) => s.removeInputImage)
  const clearInputImages = useStore((s) => s.clearInputImages)
  const categories = useStore((s) => s.categories)
  const activeCategoryFilter = useStore((s) => s.activeCategoryFilter)
  const providers = useStore((s) => s.providers)
  const activeProviderId = useStore((s) => s.activeProviderId)
  const setActiveProvider = useStore((s) => s.setActiveProvider)
  const params = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const settings = useStore((s) => s.settings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(42)

  const [isDragging, setIsDragging] = useState(false)
  const [submitHover, setSubmitHover] = useState(false)
  const [attachHover, setAttachHover] = useState(false)
  const [mobileCollapsed, setMobileCollapsed] = useState(false)
  const [promptCollapsed, setPromptCollapsed] = useState(false)
  const [showSizePicker, setShowSizePicker] = useState(false)
  const [showImageUrlInput, setShowImageUrlInput] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const handleRef = useRef<HTMLDivElement>(null)
  const dragTouchRef = useRef({ startY: 0, moved: false })
  const [outputCompressionInput, setOutputCompressionInput] = useState(
    params.output_compression == null ? '' : String(params.output_compression),
  )
  const [nInput, setNInput] = useState(String(params.n))
  const dragCounter = useRef(0)
  const isMobile = useIsMobile()
  const providerOptions = providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  }))
  const generationTargetLabel =
    activeCategoryFilter === ALL_CATEGORY_FILTER || activeCategoryFilter === FAVORITES_CATEGORY_FILTER
      ? '未分类'
      : resolveCategoryFilterName(activeCategoryFilter, categories)

  const canSubmit = (prompt.trim() || inputImages.length) && settings.apiKey
  const atImageLimit = inputImages.length >= API_MAX_IMAGES
  const localInputImageCount = inputImages.filter((img) => !isRemotePreviewUrl(img.dataUrl)).length
  const remoteInputImageCount = inputImages.length - localInputImageCount
  const maskedInputCount = inputImages.filter((img) => Boolean(img.maskDataUrl)).length
  const primaryMaskedInputIndex = inputImages.findIndex((img) => Boolean(img.maskDataUrl))
  const primaryMaskedInput =
    primaryMaskedInputIndex >= 0 ? inputImages[primaryMaskedInputIndex] : null
  const normalizedPrompt = prompt.trim()
  const promptPreview =
    normalizedPrompt.replace(/\s+/g, ' ').slice(0, 120) || '输入框已收起，点击展开继续编辑'
  const normalizedSize = normalizeImageSize(params.size) || DEFAULT_PARAMS.size
  const activeApiProtocol = settings.apiProtocol === 'responses' ? 'responses' : 'images'
  const requestDebugItems = [
    { label: '协议', value: activeApiProtocol },
    { label: '主模型', value: settings.model.trim() || '-' },
    ...(activeApiProtocol === 'responses'
      ? [{ label: '图像模型', value: settings.responsesImageModel.trim() || 'gpt-image-2' }]
      : []),
    { label: '尺寸', value: normalizedSize },
    { label: '质量', value: params.quality },
    { label: '格式', value: params.output_format },
    { label: '审核', value: params.moderation },
    { label: '数量', value: String(params.n) },
    ...(params.output_format !== 'png' && params.output_compression != null
      ? [{ label: '压缩率', value: String(params.output_compression) }]
      : []),
  ]
  const expandPromptInput = useCallback((focusTextarea = true) => {
    setPromptCollapsed(false)
    if (!focusTextarea) return
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    setOutputCompressionInput(
      params.output_compression == null ? '' : String(params.output_compression),
    )
  }, [params.output_compression])

  useEffect(() => {
    setNInput(String(params.n))
  }, [params.n])

  const commitOutputCompression = useCallback(() => {
    if (outputCompressionInput.trim() === '') {
      setOutputCompressionInput('')
      setParams({ output_compression: null })
      return
    }

    const nextValue = Number(outputCompressionInput)
    if (Number.isNaN(nextValue)) {
      setOutputCompressionInput(params.output_compression == null ? '' : String(params.output_compression))
      return
    }

    setOutputCompressionInput(String(nextValue))
    setParams({ output_compression: nextValue })
  }, [outputCompressionInput, params.output_compression, setParams])

  const commitN = useCallback(() => {
    const nextValue = Number(nInput)
    const normalizedValue =
      nInput.trim() === '' ? DEFAULT_PARAMS.n : Number.isNaN(nextValue) ? params.n : nextValue
    setNInput(String(normalizedValue))
    setParams({ n: normalizedValue })
  }, [nInput, params.n, setParams])

  const handleFiles = async (files: FileList | File[]) => {
    try {
      const currentCount = useStore.getState().inputImages.length
      if (currentCount >= API_MAX_IMAGES) {
        useStore.getState().showToast(
          `参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`,
          'error',
        )
        return
      }

      const remaining = API_MAX_IMAGES - currentCount
      const accepted = Array.from(files).filter((f) => f.type.startsWith('image/'))
      const toAdd = accepted.slice(0, remaining)
      const discarded = accepted.length - toAdd.length

      for (const file of toAdd) {
        await addImageFromFile(file)
      }

      if (discarded > 0) {
        useStore.getState().showToast(
          `已达上限 ${API_MAX_IMAGES} 张，${discarded} 张图片被丢弃`,
          'error',
        )
      }
    } catch (err) {
      useStore.getState().showToast(
        `图片添加失败：${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    }
  }

  const handleFilesRef = useRef(handleFiles)
  handleFilesRef.current = handleFiles

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleFilesRef.current(e.target.files || [])
    e.target.value = ''
  }

  const handleAddImageUrl = async () => {
    try {
      const currentCount = useStore.getState().inputImages.length
      if (currentCount >= API_MAX_IMAGES) {
        useStore.getState().showToast(
          `参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`,
          'error',
        )
        return
      }

      await addImageFromUrl(imageUrlInput)
      setImageUrlInput('')
      setShowImageUrlInput(false)
    } catch (err) {
      useStore.getState().showToast(
        `图片 URL 添加失败：${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      submitTask()
    }
  }

  // 粘贴图片
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        handleFilesRef.current(imageFiles)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  // 拖拽图片 - 监听整个页面
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) {
        setIsDragging(false)
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        handleFilesRef.current(files)
      }
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    if (promptCollapsed) {
      el.style.transition = 'height 150ms ease, border-color 200ms, box-shadow 200ms'
      el.style.height = '42px'
      el.style.overflowY = 'hidden'
      prevHeightRef.current = 42
      return
    }

    // 计算图片区域和其他固定元素占用的高度
    const imagesHeight = imagesRef.current?.offsetHeight ?? 0
    const fixedOverhead = imagesHeight + 140

    // textarea 最大高度 = 页面 40% 减去固定开销，至少保留 80px
    const maxH = Math.max(window.innerHeight * 0.4 - fixedOverhead, 80)

    // 1. 关闭过渡动画，设高度为 0 以获取真实的文本内容高度
    el.style.transition = 'none'
    el.style.height = '0'
    el.style.overflowY = 'hidden'
    const scrollH = el.scrollHeight
    const minH = 42
    const desired = Math.max(scrollH, minH)
    const targetH = desired > maxH ? maxH : desired

    // 2. 将高度设回上一次的实际高度，强制重绘，准备开始动画
    el.style.height = prevHeightRef.current + 'px'
    void el.offsetHeight

    // 3. 恢复平滑过渡，并设置目标高度
    el.style.transition = 'height 150ms ease, border-color 200ms, box-shadow 200ms'
    el.style.height = targetH + 'px'
    el.style.overflowY = desired > maxH ? 'auto' : 'hidden'

    prevHeightRef.current = targetH
  }, [promptCollapsed])

  useEffect(() => {
    adjustTextareaHeight()
  }, [prompt, promptCollapsed, adjustTextareaHeight])

  // 图片队列变化时也重新计算
  useEffect(() => {
    adjustTextareaHeight()
  }, [inputImages.length, promptCollapsed, adjustTextareaHeight])

  useEffect(() => {
    window.addEventListener('resize', adjustTextareaHeight)
    return () => window.removeEventListener('resize', adjustTextareaHeight)
  }, [adjustTextareaHeight])

  useEffect(() => {
    if (!promptCollapsed) return

    const handleExpandShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (event.isComposing) return
      if (shouldIgnoreExpandShortcutTarget(event.target)) return

      event.preventDefault()
      expandPromptInput()
    }

    document.addEventListener('keydown', handleExpandShortcut)
    return () => document.removeEventListener('keydown', handleExpandShortcut)
  }, [expandPromptInput, promptCollapsed])

  // 移动端拖动条手势
  useEffect(() => {
    const el = handleRef.current
    if (!el) return
    const onTouchStart = (e: TouchEvent) => {
      dragTouchRef.current = { startY: e.touches[0].clientY, moved: false }
    }
    const onTouchMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - dragTouchRef.current.startY
      if (Math.abs(dy) > 10) dragTouchRef.current.moved = true
      if (dy > 30) setMobileCollapsed(true)
      if (dy < -30) setMobileCollapsed(false)
    }
    const onTouchEnd = () => {
      if (!dragTouchRef.current.moved) {
        setMobileCollapsed((v) => !v)
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const selectClass = 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm'

  const renderImageThumbs = () => (
    <div ref={imagesRef}>
      <div className="grid grid-cols-[repeat(auto-fill,52px)] justify-between gap-x-2 gap-y-3 mb-3">
        {inputImages.map((img, idx) => (
          <div key={img.id} className="relative group inline-block">
            <div className="relative w-[52px] h-[52px] rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.08] shadow-sm cursor-pointer">
              <img
                src={img.dataUrl}
                className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                onClick={() => setLightboxImageId(img.id, inputImages.map((i) => i.id))}
                alt=""
              />
              <span
                className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] leading-none text-white shadow-sm ${
                  isRemotePreviewUrl(img.dataUrl) ? 'bg-emerald-500/90' : 'bg-amber-500/90'
                }`}
              >
                {isRemotePreviewUrl(img.dataUrl) ? 'URL' : '本地'}
              </span>
              {img.maskDataUrl && (
                <span className="absolute right-1 bottom-1 rounded bg-emerald-500/90 px-1 py-0.5 text-[9px] leading-none text-white shadow-sm">
                  蒙版
                </span>
              )}
            </div>
            <span
              className="absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
              onClick={() => removeInputImage(idx)}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          </div>
        ))}

        {/* 清空全部按钮 */}
        <button
          onClick={() =>
            setConfirmDialog({
              title: '清空参考图',
              message: `确定要清空全部 ${inputImages.length} 张参考图吗？`,
              action: () => clearInputImages(),
            })
          }
          className="w-[52px] h-[52px] rounded-xl border border-dashed border-gray-300 dark:border-white/[0.08] flex flex-col items-center justify-center gap-0.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-all cursor-pointer flex-shrink-0"
          title="清空全部参考图"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-[9px] leading-none">清空</span>
        </button>
      </div>
    </div>
  )

  const renderParams = (cols: string) => (
    <div className={`grid ${cols} gap-2 text-xs flex-1`}>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">供应商</span>
        <Select
          value={activeProviderId}
          onChange={(val) => setActiveProvider(String(val))}
          options={providerOptions}
          className={selectClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">尺寸</span>
        <button
          type="button"
          onClick={() => setShowSizePicker(true)}
          className="px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] focus:outline-none text-xs text-left transition-all duration-200 shadow-sm font-mono"
          title="选择尺寸"
        >
          {normalizedSize}
        </button>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">质量</span>
        <Select
          value={params.quality}
          onChange={(val) => setParams({ quality: val as any })}
          options={[
            { label: 'auto', value: 'auto' },
            { label: 'low', value: 'low' },
            { label: 'medium', value: 'medium' },
            { label: 'high', value: 'high' },
          ]}
          className={selectClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">格式</span>
        <Select
          value={params.output_format}
          onChange={(val) => setParams({ output_format: val as any })}
          options={[
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
            { label: 'WebP', value: 'webp' },
          ]}
          className={selectClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">压缩率</span>
        <input
          value={outputCompressionInput}
          onChange={(e) => setOutputCompressionInput(e.target.value)}
          onBlur={commitOutputCompression}
          disabled={params.output_format === 'png'}
          type="number"
          min={0}
          max={100}
          placeholder="0-100"
          className={`px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] focus:outline-none text-xs transition-all duration-200 shadow-sm ${
            params.output_format === 'png'
              ? 'bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed'
              : 'bg-white/50 dark:bg-white/[0.03]'
          }`}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">审核</span>
        <Select
          value={params.moderation}
          onChange={(val) => setParams({ moderation: val as any })}
          options={[
            { label: 'auto', value: 'auto' },
            { label: 'low', value: 'low' },
          ]}
          className={selectClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">数量</span>
        <input
          value={nInput}
          onChange={(e) => setNInput(e.target.value)}
          onBlur={commitN}
          type="number"
          min={1}
          max={4}
          className="px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] focus:outline-none text-xs transition-all duration-200 shadow-sm"
        />
      </label>
    </div>
  )

  return (
    <>
      {/* 全屏拖拽遮罩 */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-white/60 dark:bg-gray-900/60 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 p-8 rounded-3xl">
            <div className={`w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center ${
              atImageLimit ? 'bg-red-50 dark:bg-red-500/10 border-red-300' : 'bg-blue-50 dark:bg-blue-500/10 border-blue-400'
            }`}>
              {atImageLimit ? (
                <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div className="text-center">
              {atImageLimit ? (
                <>
                  <p className="text-lg font-semibold text-red-500">已达上限 {API_MAX_IMAGES} 张</p>
                  <p className="text-sm text-gray-400 mt-1">请先移除部分参考图后再添加</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">释放以添加参考图</p>
                  <p className="text-sm text-gray-400 mt-1">支持 JPG、PNG、WebP 等格式</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showSizePicker && (
        <SizePickerModal
          currentSize={params.size}
          onSelect={(size) => setParams({ size })}
          onClose={() => setShowSizePicker(false)}
        />
      )}

      <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-4xl px-3 sm:px-4 transition-all duration-300">
        <div ref={cardRef} className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-2xl border border-white/50 dark:border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-2xl sm:rounded-3xl p-3 sm:p-4 ring-1 ring-black/5 dark:ring-white/10">
          {/* 移动端拖动条 */}
          <div
            ref={handleRef}
            className="sm:hidden flex justify-center pt-0.5 pb-2 -mt-1 cursor-pointer touch-none"
            onClick={() => setMobileCollapsed((v) => !v)}
          >
            <div className={`w-10 h-1 rounded-full bg-gray-300 dark:bg-white/[0.06] transition-transform duration-200 ${mobileCollapsed ? 'scale-x-75' : ''}`} />
          </div>

          {/* 输入图片行（移动端可折叠） */}
          {inputImages.length > 0 && (
            isMobile ? (
              <>
                <div className={`collapse-section${mobileCollapsed ? ' collapsed' : ''}`}>
                  <div className="collapse-inner">
                    {renderImageThumbs()}
                  </div>
                </div>
                {mobileCollapsed && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 ml-1">
                    {inputImages.length} 张参考图
                    {remoteInputImageCount > 0 ? ` · URL ${remoteInputImageCount}` : ''}
                    {localInputImageCount > 0 ? ` · 本地 ${localInputImageCount}` : ''}
                  </div>
                )}
              </>
            ) : (
              renderImageThumbs()
            )
          )}

          {maskedInputCount > 0 && (
            <div className="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-700 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div>
                    当前输入包含 {maskedInputCount} 张带蒙版的局部编辑参考图。提交时会按选区进行编辑。
                  </div>
                  {maskedInputCount > 1 && (
                    <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                      当前仅支持 1 张带蒙版参考图参与提交，请先清理多余蒙版。
                    </div>
                  )}
                </div>
                {primaryMaskedInput && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (primaryMaskedInput) {
                          reopenImageEditorFromInputImage(primaryMaskedInput)
                        }
                      }}
                      className="rounded-full border border-emerald-300/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-emerald-700 transition hover:bg-white dark:border-emerald-400/20 dark:bg-white/[0.06] dark:text-emerald-200 dark:hover:bg-white/[0.1]"
                    >
                      继续调整选区
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (primaryMaskedInputIndex >= 0) {
                          clearInputImageEdit(primaryMaskedInputIndex)
                        }
                      }}
                      className="rounded-full border border-emerald-300/60 px-3 py-1.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100/80 dark:border-emerald-400/20 dark:text-emerald-200 dark:hover:bg-emerald-400/10"
                    >
                      清除蒙版
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {settings.apiProtocol === 'responses' && localInputImageCount > 0 && (
            <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-700 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              {settings.responsesImageInputMode === 'file_id'
                ? `当前参考图里有 ${localInputImageCount} 张“本地”图片。它们会先上传到 /v1/files，再以 file_id 引用；如果中转站没实现文件上传，接口会直接报错。`
                : `当前参考图里有 ${localInputImageCount} 张“本地”图片。它们会直接内联进 Responses 请求体，并在发送前自动缩边压缩；如果中转站处理较慢，仍可能触发 524，此时优先使用链条按钮添加的公网 URL 参考图会更稳。`}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-gray-500">
            <div className="min-w-0 truncate">
              {normalizedPrompt ? `提示词 ${normalizedPrompt.length} 字` : '提示词为空'}
            </div>
            <button
              type="button"
              onClick={() => {
                if (promptCollapsed) {
                  expandPromptInput()
                  return
                }
                setPromptCollapsed(true)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200/80 bg-white/70 px-2.5 py-1 text-xs text-gray-500 transition hover:bg-white hover:text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform duration-200 ${promptCollapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {promptCollapsed ? '展开输入' : '收起输入'}
            </button>
          </div>

          {promptCollapsed && (
            <button
              type="button"
              onClick={expandPromptInput}
              className="mt-2 block w-full rounded-2xl border border-dashed border-gray-200/80 bg-white/40 px-4 py-3 text-left text-sm text-gray-500 transition hover:bg-white/70 hover:text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
              title="展开提示词输入区"
            >
              <span className="block truncate">{promptPreview}</span>
            </button>
          )}

          <div className={`collapse-section${promptCollapsed ? ' collapsed' : ''}`}>
            <div className="collapse-inner">
              {/* 输入框 */}
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="描述你想生成的图片..."
                className="mt-2 w-full px-4 py-3 rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] text-sm focus:outline-none leading-relaxed resize-none shadow-sm transition-[border-color,box-shadow] duration-200"
              />

              {showImageUrlInput && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddImageUrl()
                      }
                    }}
                    type="url"
                    placeholder="粘贴公网图片 URL，例如 https://example.com/reference.png"
                    className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] text-sm focus:outline-none shadow-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="px-4 py-2.5 rounded-2xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all shadow-sm"
                    >
                      添加 URL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImageUrlInput(false)
                        setImageUrlInput('')
                      }}
                      className="px-4 py-2.5 rounded-2xl bg-gray-200 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-300 dark:hover:bg-white/[0.1] transition-all shadow-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span>本次生成将保存到</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              {generationTargetLabel}
            </span>
            {activeCategoryFilter === ALL_CATEGORY_FILTER && (
              <span>当前位于全部分类视图，默认进入未分类。</span>
            )}
            {activeCategoryFilter === FAVORITES_CATEGORY_FILTER && (
              <span>当前位于收藏视图，默认进入未分类，不会自动加入收藏。</span>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-sky-600 dark:text-sky-300">
              当前提交快照
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {requestDebugItems.map((item) => (
                <span
                  key={`${item.label}-${item.value}`}
                  className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-sky-700 shadow-sm dark:bg-white/[0.06] dark:text-sky-100"
                  title={`${item.label}: ${item.value}`}
                >
                  <span className="text-sky-500 dark:text-sky-300">{item.label}</span>
                  <span className="font-mono">{item.value}</span>
                </span>
              ))}
            </div>
          </div>

          {/* 参数 + 按钮 */}
          <div className="mt-3">
            {/* 桌面端布局 */}
            <div className="hidden sm:flex items-end justify-between gap-3">
              {renderParams('grid-cols-7')}

              <div className="flex gap-2 flex-shrink-0 mb-0.5">
                <div
                  className="relative"
                  onMouseEnter={() => setAttachHover(true)}
                  onMouseLeave={() => setAttachHover(false)}
                >
                  <ButtonTooltip visible={atImageLimit && attachHover} text={`参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`} />
                  <button
                    onClick={() => !atImageLimit && fileInputRef.current?.click()}
                    className={`p-2.5 rounded-xl transition-all shadow-sm ${
                      atImageLimit
                        ? 'bg-gray-200 dark:bg-white/[0.04] text-gray-300 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-gray-200 dark:bg-white/[0.06] hover:bg-gray-300 dark:hover:bg-white/[0.1] text-gray-500 dark:text-gray-300 hover:shadow'
                    }`}
                    title={atImageLimit ? `已达上限 ${API_MAX_IMAGES} 张` : '添加参考图'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    expandPromptInput(false)
                    setShowImageUrlInput((v) => !v)
                  }}
                  className="p-2.5 rounded-xl bg-gray-200 dark:bg-white/[0.06] hover:bg-gray-300 dark:hover:bg-white/[0.1] text-gray-500 dark:text-gray-300 transition-all shadow-sm"
                  title="添加公网图片 URL"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-1.414 1.414a4 4 0 01-5.657-5.656l1.414-1.414m3-3a4 4 0 015.657 0l1.414 1.414a4 4 0 01-5.657 5.656l-1.414-1.414" />
                  </svg>
                </button>
                <div
                  className="relative"
                  onMouseEnter={() => setSubmitHover(true)}
                  onMouseLeave={() => setSubmitHover(false)}
                >
                  <ButtonTooltip visible={!settings.apiKey && submitHover} text="尚未完成 API 配置，请在右上角设置中进行" />
                  <button
                    onClick={() => settings.apiKey ? submitTask() : setShowSettings(true)}
                    disabled={settings.apiKey ? !canSubmit : false}
                    className={`p-2.5 rounded-xl transition-all shadow-sm hover:shadow ${
                      !settings.apiKey
                        ? 'bg-gray-300 dark:bg-white/[0.06] text-white cursor-pointer'
                        : 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                    title={settings.apiKey ? '生成 (Ctrl+Enter)' : '请先配置 API'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* 移动端布局 */}
            <div className="sm:hidden flex flex-col gap-2">
              <div className={`collapse-section${mobileCollapsed ? ' collapsed' : ''}`}>
                <div className="collapse-inner">
                  {renderParams('grid-cols-2')}
                  <div className="h-2" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="relative"
                  onMouseEnter={() => setAttachHover(true)}
                  onMouseLeave={() => setAttachHover(false)}
                >
                  <ButtonTooltip visible={atImageLimit && attachHover} text={`参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`} />
                  <button
                    onClick={() => !atImageLimit && fileInputRef.current?.click()}
                    className={`p-2.5 rounded-xl transition-all shadow-sm flex-shrink-0 ${
                      atImageLimit
                        ? 'bg-gray-200 dark:bg-white/[0.04] text-gray-300 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-gray-200 dark:bg-white/[0.06] hover:bg-gray-300 dark:hover:bg-white/[0.1] text-gray-500 dark:text-gray-300'
                    }`}
                    title={atImageLimit ? `已达上限 ${API_MAX_IMAGES} 张` : '添加参考图'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    expandPromptInput(false)
                    setShowImageUrlInput((v) => !v)
                  }}
                  className="p-2.5 rounded-xl bg-gray-200 dark:bg-white/[0.06] hover:bg-gray-300 dark:hover:bg-white/[0.1] text-gray-500 dark:text-gray-300 transition-all shadow-sm flex-shrink-0"
                  title="添加公网图片 URL"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-1.414 1.414a4 4 0 01-5.657-5.656l1.414-1.414m3-3a4 4 0 015.657 0l1.414 1.414a4 4 0 01-5.657 5.656l-1.414-1.414" />
                  </svg>
                </button>
                <div
                  className="relative flex-1"
                  onMouseEnter={() => setSubmitHover(true)}
                  onMouseLeave={() => setSubmitHover(false)}
                >
                  <ButtonTooltip visible={!settings.apiKey && submitHover} text="尚未完成 API 配置，请在右上角设置中进行" />
                  <button
                    onClick={() => settings.apiKey ? submitTask() : setShowSettings(true)}
                    disabled={settings.apiKey ? !canSubmit : false}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm ${
                      !settings.apiKey
                        ? 'bg-gray-300 dark:bg-white/[0.06] text-white cursor-pointer'
                        : 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    生成图像
                  </button>
                </div>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </div>
    </>
  )
}
