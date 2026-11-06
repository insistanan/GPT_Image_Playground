import { describe, expect, it } from 'vitest'
import { createApiError } from '../imageTransforms'
import { isModerationRejectionError, normalizeModerationRejectionError } from '../moderation'

describe('moderation rejection', () => {
  it('识别 message 中的 moderation_blocked', () => {
    const error = createApiError('Your request was rejected: moderation_blocked', 400)

    expect(isModerationRejectionError(error)).toBe(true)
  })

  it('识别 details.responseBody 中的安全审核文案', () => {
    const error = createApiError('Bad request', 400, {
      details: {
        responseBody: JSON.stringify({
          error: {
            message: 'This request was rejected as a result of our safety system.',
          },
        }),
      },
    })

    expect(isModerationRejectionError(error)).toBe(true)
  })

  it('把审核拒绝规范成可读中文提示并保留状态与 requestId', () => {
    const error = createApiError('content_policy_violation', 400, {
      requestId: 'req_123',
      details: { responseText: 'safety system rejected' },
    })

    const normalized = normalizeModerationRejectionError(error) as Error & {
      status?: number
      requestId?: string
    }

    expect(normalized.message).toContain('内容被安全审核拦截')
    expect(normalized.status).toBe(400)
    expect(normalized.requestId).toBe('req_123')
  })

  it('不把 moderation 参数兼容性报错误判为审核拒绝', () => {
    const error = createApiError('Unknown parameter: moderation', 400, {
      details: { responseBody: '{"error":{"message":"Unknown parameter: moderation"}}' },
    })

    expect(isModerationRejectionError(error)).toBe(false)
    expect(normalizeModerationRejectionError(error)).toBe(error)
  })

  it('非 Error 输入不识别', () => {
    expect(isModerationRejectionError('moderation_blocked')).toBe(false)
  })
})
