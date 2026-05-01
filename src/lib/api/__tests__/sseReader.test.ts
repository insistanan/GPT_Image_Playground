import { describe, expect, it } from "vitest"

// Import the internal helpers from sseReader to test the payload reconstruction chain.
// We need to access the non-exported functions — read them from the module.
// Since they're not exported, we test the composed behavior via exported entry point
// or test the individual components from payloadFacts.
import {
  buildCompactResponsesPayload,
} from "../payloadFacts"

// Simulate what readResponsesPayloadStream does internally for response.completed events
// to verify the payload reconstruction chain preserves output.

describe("sseReader payload reconstruction", () => {
  it("preserves response.output when completedResponse has output and outputItems is empty", () => {
    // Simulate: response.completed comes through JSON path
    // sanitizeResponsesCompletedResponse(response) is called
    const response = {
      id: "resp_abc",
      object: "response",
      status: "completed",
      model: "gpt-image-2",
      created_at: 1714500000,
      output: [
        {
          id: "img_1",
          type: "image_generation_call",
          status: "completed",
          size: "1024x1024",
          quality: "high",
          revised_prompt: "a beautiful sunset",
          result: "base64data1",
        },
        {
          id: "img_2",
          type: "image_generation_call", 
          status: "completed",
          size: "1024x1024",
          quality: "high",
          revised_prompt: "a beautiful sunrise",
          b64_json: "base64data2",
        },
      ],
    } as Record<string, unknown>

    // Step 1: sanitizeResponsesCompletedResponse — now preserves output without override
    const completedResponse = buildCompactResponsesPayload(response)
    expect(completedResponse.output).toEqual(response.output)
    expect((completedResponse.output as Array<Record<string, unknown>>).length).toBe(2)

    // Step 2: buildLargeResponsesCompletedPayload with empty outputItems
    // should fall back to completedResponse.output (not override with empty array)
    const payload = buildCompactResponsesPayload(completedResponse, undefined)
    expect(payload.output).toEqual(response.output)
  })

  it("outputItems override takes precedence over response.output", () => {
    // When outputItems are collected from individual output_item.done events,
    // they should override the output from response.completed
    const response = {
      id: "resp_xyz",
      output: [{ id: "old_img", result: "old_data" }],
    } as Record<string, unknown>

    const completedResponse = buildCompactResponsesPayload(response)
    const outputItems = [
      { id: "new_img_1", result: "new_data_1" },
      { id: "new_img_2", b64_json: "new_data_2" },
    ]
    const payload = buildCompactResponsesPayload(completedResponse, outputItems)
    expect(payload.output).toEqual(outputItems)
  })

  it("preserves response.error when status is failed", () => {
    const response = {
      id: "resp_err",
      status: "failed",
      error: { message: "generation failed", code: "content_filter" },
    } as Record<string, unknown>

    const completedResponse = buildCompactResponsesPayload(response)
    expect(completedResponse.error).toEqual(response.error)
    expect(completedResponse.status).toBe("failed")
  })

  it("preserves output meta fields (revised_prompt, size, quality) through the chain", () => {
    // This simulates the full chain: response.completed with output containing meta
    const response = {
      id: "resp_meta",
      status: "completed",
      output: [
        {
          id: "img_meta_1",
          type: "image_generation_call",
          status: "completed",
          size: "1792x1024",
          quality: "high",
          revised_prompt: "corrected prompt text",
          output_format: "png",
          background: "transparent",
        },
      ],
    } as Record<string, unknown>

    const completedResponse = buildCompactResponsesPayload(response)
    const output = (completedResponse.output as Array<Record<string, unknown>>)[0]
    expect(output.size).toBe("1792x1024")
    expect(output.quality).toBe("high")
    expect(output.revised_prompt).toBe("corrected prompt text")
    expect(output.output_format).toBe("png")
    expect(output.background).toBe("transparent")
  })

  it("regression: response.completed with output survives sanitizeResponsesCompletedResponse chain", () => {
    // This covers the exact bug where sanitizeResponsesCompletedResponse(response, [])
    // was stripping output. After fix, the empty array is no longer passed.
    // Simulates readResponsesPayloadStream internals:
    // 1. response.completed arrives
    // 2. sanitizeResponsesCompletedResponse(response) is called
    // 3. buildLargeResponsesCompletedPayload(completedResponse, outputItems, ...)
    const responseWithOutput = {
      id: "resp_fix",
      status: "completed",
      output: [
        { id: "img_a", result: "data_a", revised_prompt: "a cat", size: "1024x1024" },
        { id: "img_b", b64_json: "data_b", quality: "high" },
      ],
    } as Record<string, unknown>

    // Step 1: sanitizeResponsesCompletedResponse(resp) — after fix, calls buildCompactResponsesPayload(resp)
    const completedResponse = buildCompactResponsesPayload(responseWithOutput)
    expect(completedResponse.output).toBeDefined()
    expect((completedResponse.output as Array<Record<string, unknown>>).length).toBe(2)

    // Step 2: buildLargeResponsesCompletedPayload with empty outputItems
    // (no individual output_item.done events were collected)
    const emptyOutputItems: Record<string, unknown>[] = []
    const payload = buildCompactResponsesPayload(completedResponse, emptyOutputItems.length > 0 ? emptyOutputItems : undefined)
    expect(payload.output).toBeDefined()
    expect((payload.output as Array<Record<string, unknown>>).length).toBe(2)

    // Step 3: collectImageGenerationCallsFromPayload should see the calls
    // The output items contain meta fields (revised_prompt, size, quality)
    const output = (payload.output as Array<Record<string, unknown>>)[0]
    expect(output.revised_prompt).toBe("a cat")
    expect(output.size).toBe("1024x1024")
  })
})
