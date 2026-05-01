import { describe, expect, it } from "vitest"
import {
  buildResponsesOutputItemFromFieldReaders,
  sanitizeResponsesOutputItem,
  buildCompactResponsesPayload,
} from "../payloadFacts"

function fieldReadersFromRecord(record: Record<string, unknown>) {
  return {
    readString: (fieldName: string) => {
      const v = record[fieldName]
      return typeof v === "string" && v.trim() ? v : undefined
    },
    readNumber: (fieldName: string) => {
      const v = record[fieldName]
      return typeof v === "number" && Number.isFinite(v) ? v : undefined
    },
  }
}

describe("sanitizeResponsesOutputItem", () => {
  it("preserves result field for downstream fallback parsing", () => {
    const item = {
      id: "item_1",
      type: "image_generation_call",
      status: "completed",
      result: "base64imagedatahere",
      output_index: 0,
    }
    const sanitized = sanitizeResponsesOutputItem(item)
    expect(sanitized.result).toBe("base64imagedatahere")
    expect(sanitized.id).toBe("item_1")
    expect(sanitized.status).toBe("completed")
  })

  it("preserves b64_json field for downstream fallback parsing", () => {
    const item = {
      id: "item_2",
      type: "image_generation_call",
      b64_json: "base64imagedatahere",
    }
    const sanitized = sanitizeResponsesOutputItem(item)
    expect(sanitized.b64_json).toBe("base64imagedatahere")
  })

  it("preserves url and image_url fields", () => {
    const item = {
      id: "item_3",
      url: "https://example.com/image.png",
      image_url: "https://example.com/thumb.png",
    }
    const sanitized = sanitizeResponsesOutputItem(item)
    expect(sanitized.url).toBe("https://example.com/image.png")
    expect(sanitized.image_url).toBe("https://example.com/thumb.png")
  })

  it("returns fallback type when no fields match", () => {
    const sanitized = sanitizeResponsesOutputItem({})
    expect(sanitized.type).toBe("image_generation_call")
  })
})

describe("buildResponsesOutputItemFromFieldReaders", () => {
  it("reads result from field readers", () => {
    const record = { result: "abc123" }
    const { readString, readNumber } = fieldReadersFromRecord(record)
    const result = buildResponsesOutputItemFromFieldReaders(readString, readNumber)
    expect(result.result).toBe("abc123")
  })

  it("reads b64_json from field readers", () => {
    const record = { b64_json: "xyz789" }
    const { readString, readNumber } = fieldReadersFromRecord(record)
    const result = buildResponsesOutputItemFromFieldReaders(readString, readNumber)
    expect(result.b64_json).toBe("xyz789")
  })
})

describe("buildCompactResponsesPayload", () => {
  it("preserves output array from response", () => {
    const response = {
      id: "resp_1",
      object: "response",
      status: "completed",
      model: "gpt-image-2",
      output: [{ id: "img_1", result: "data123" }, { id: "img_2", b64_json: "data456" }],
    } as Record<string, unknown>
    const compact = buildCompactResponsesPayload(response)
    expect(compact.output).toEqual(response.output)
  })

  it("preserves error from response", () => {
    const response = {
      id: "resp_err",
      status: "failed",
      error: { message: "something went wrong", code: "internal_error" },
    } as Record<string, unknown>
    const compact = buildCompactResponsesPayload(response)
    expect(compact.error).toEqual(response.error)
  })

  it("uses outputOverride when provided", () => {
    const response = {
      id: "resp_2",
      output: [{ id: "old" }],
    } as Record<string, unknown>
    const override = [{ id: "new_1", result: "abc" }]
    const compact = buildCompactResponsesPayload(response, override)
    expect(compact.output).toEqual(override)
  })
})
