import { buildResponsesPrompt, getResponsesImageModel } from './config'
import { appendSharedImageParams } from './sharedImageParams'
import type {
  CallApiOptions,
  ResponsesInputContent,
  ResponsesInputImage,
  ResponsesInputImageMask,
  ResponsesInputPayloadMode,
  ResponsesRequestPlan,
} from './types'

interface BuildResponsesRequestBodyOptions {
  opts: Pick<CallApiOptions, 'settings' | 'prompt' | 'params'>
  inputImages: ResponsesInputImage[]
  editMask?: ResponsesInputImageMask
  plan: ResponsesRequestPlan
}

function buildResponsesInput(prompt: string, inputImages: ResponsesInputImage[]) {
  const content: ResponsesInputContent[] = []

  if (prompt.trim()) {
    content.push({ type: 'input_text', text: prompt })
  }

  for (const inputImage of inputImages) {
    content.push(inputImage)
  }

  return [
    {
      role: 'user',
      content,
    },
  ]
}

function buildResponsesInputPayload(
  prompt: string,
  inputImages: ResponsesInputImage[],
  mode: ResponsesInputPayloadMode,
) {
  if (mode === 'compact-string' && !inputImages.length && prompt.trim()) {
    return prompt.trim()
  }

  return buildResponsesInput(prompt, inputImages)
}

export function buildResponsesRequestBody({
  opts,
  inputImages,
  editMask,
  plan,
}: BuildResponsesRequestBodyOptions): Record<string, unknown> {
  const { settings, prompt, params } = opts
  const responsesPrompt = buildResponsesPrompt(prompt, settings)
  const hasReferenceImages = inputImages.length > 0
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    model: getResponsesImageModel(settings),
  }

  if (params.size) {
    tool.size = params.size
  }
  if (params.quality) {
    tool.quality = params.quality
  }
  if (params.output_format) {
    tool.output_format = params.output_format
  }
  if (params.moderation) {
    tool.moderation = params.moderation
  }
  if (params.output_format !== 'png' && params.output_compression != null) {
    tool.output_compression = params.output_compression
  }
  appendSharedImageParams(tool, params, {
    isEdit: hasReferenceImages,
    stream: plan.transport === 'stream',
  })
  if (editMask) {
    tool.input_image_mask = editMask
  }
  if (plan.actionMode === 'explicit') {
    tool.action = hasReferenceImages ? 'edit' : 'generate'
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    input: buildResponsesInputPayload(responsesPrompt, inputImages, plan.inputPayloadMode),
    tools: [tool],
  }

  if (plan.transport === 'stream') {
    body.stream = true
  }
  if (plan.toolChoiceMode === 'force') {
    body.tool_choice = { type: 'image_generation' }
  }

  return body
}
