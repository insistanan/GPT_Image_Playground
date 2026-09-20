import { beforeEach, describe, expect, it } from "vitest"
import {
  buildImagesRequestPlans,
  buildResponsesRequestPlans,
  createImagesPlanner,
  isResponsesRelayFailure,
  shouldRetryImagesPlan,
  shouldRetryResponsesWithCompatibility,
} from "../requestPlanner"
import { resetStreamSupportCache } from "../streamSupport"

beforeEach(() => {
  resetStreamSupportCache()
})

function fakeSettings(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    model: "gpt-image-2",
    responsesImageModel: "gpt-image-2",
    responsesTransport: "auto",
    responsesImageInputMode: "auto",
    responsesPromptRevisionMode: "allow",
    timeout: 900,
    apiProtocol: "responses",
    requestMode: "direct",
    ...overrides,
  } as any
}

function fakeCallApiOptions(overrides: Record<string, unknown> = {}) {
  return {
    settings: fakeSettings(overrides),
    params: { n: 1, size: "1024x1024", quality: "high", output_format: "png", output_compression: null, moderation: "auto" },
    prompt: "test prompt",
    editMaskDataUrl: null,
  } as any
}

describe("buildImagesRequestPlans", () => {
  it("returns transport-only plans for non-edit scenarios", () => {
    const plans = buildImagesRequestPlans(fakeSettings(), { isEdit: false })
    expect(plans.length).toBe(2)
    expect(plans[0].id).toBe("stream")
    expect(plans[0].bodyMode).toBe("json")
    expect(plans[1].id).toBe("json")
  })

  it("returns json+multipart plans for edit scenarios", () => {
    const plans = buildImagesRequestPlans(fakeSettings(), { isEdit: true })
    expect(plans.length).toBe(4)
    expect(plans.map(p => p.bodyMode)).toEqual(["json", "multipart", "json", "multipart"])
  })

  it("returns only json when transport set to json", () => {
    const plans = buildImagesRequestPlans(fakeSettings({ responsesTransport: "json" }), { isEdit: false })
    expect(plans.length).toBe(1)
    expect(plans[0].transport).toBe("json")
  })
})

describe("shouldRetryImagesPlan", () => {
  const streamPlan = { id: "stream", transport: "stream" as const, bodyMode: "json" as const }
  const jsonPlan = { id: "json", transport: "json" as const, bodyMode: "json" as const }

  it("allows stream->json fallback for server errors", () => {
    expect(shouldRetryImagesPlan(new Error("HTTP 500 error"), streamPlan, jsonPlan)).toBe(true)
  })

  it("blocks fallback on auth errors", () => {
    const err = Object.assign(new Error("auth_not_found"), { status: 401 })
    expect(shouldRetryImagesPlan(err, streamPlan, jsonPlan)).toBe(false)
  })

  it("returns false when no next plan", () => {
    expect(shouldRetryImagesPlan(new Error("fail"), streamPlan, undefined)).toBe(false)
  })
})

describe("isResponsesRelayFailure", () => {
  it("detects 524 as relay failure", () => {
    expect(isResponsesRelayFailure(Object.assign(new Error("timeout"), { status: 524 }))).toBe(true)
  })

  it("detects cloudflare/timeout text", () => {
    expect(isResponsesRelayFailure(new Error("do_request_failed: upstream error"))).toBe(true)
    expect(isResponsesRelayFailure(new Error("timeout occurred"))).toBe(true)
  })

  it("returns false for non-error", () => {
    expect(isResponsesRelayFailure("just a string")).toBe(false)
  })
})

describe("shouldRetryResponsesWithCompatibility", () => {
  it("retries on 404/405 status", () => {
    expect(shouldRetryResponsesWithCompatibility(Object.assign(new Error("not found"), { status: 404 }))).toBe(true)
  })

  it("does not retry on relay failures", () => {
    expect(shouldRetryResponsesWithCompatibility(new Error("do_request_failed"))).toBe(false)
  })
})

describe("buildResponsesRequestPlans", () => {
  it("generates plans without reference images", () => {
    const plans = buildResponsesRequestPlans(fakeCallApiOptions(), [] as any)
    expect(plans.length).toBeGreaterThan(0)
    expect(plans[0].id).toContain("official")
  })
})

describe("stream capability memory", () => {
  it("records unsupported stream after upstream rejection and skips probing later", () => {
    const settings = fakeSettings()

    const planner = createImagesPlanner(settings, { isEdit: false })
    expect(planner.currentPlan.transport).toBe("stream")

    const nextPlan = planner.failAndAdvance(
      new Error("field Stream invalid, only false is allowed for this model"),
    )
    expect(nextPlan?.transport).toBe("json")

    // 同一目标后续请求不再生成 stream plan，省掉一次必然失败的探测。
    const plans = buildImagesRequestPlans(settings, { isEdit: false })
    expect(plans).toHaveLength(1)
    expect(plans[0].transport).toBe("json")
  })

  it("keeps stream plans when no capability failure was recorded", () => {
    const plans = buildImagesRequestPlans(fakeSettings(), { isEdit: false })
    expect(plans.map((plan) => plan.transport)).toEqual(["stream", "json"])
  })
})
