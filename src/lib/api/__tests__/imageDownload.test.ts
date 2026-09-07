import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildProxiedImageUrl, fetchRemoteImageBlob, isImageUrlDownloadError } from "../imageDownload"
import { shouldRetryImagesPlan, shouldRetryResponsesWithCompatibility } from "../requestPlanner"

const proxyConfig = { enabled: true, prefix: "/api-proxy" }

function createSignal(): AbortSignal {
  return new AbortController().signal
}

function jsonResponse(status: number, body: ArrayBuffer | string = new ArrayBuffer(0)): Response {
  return new Response(body, { status })
}

function blobResponse(size = 8): Response {
  return jsonResponse(200, new ArrayBuffer(size))
}

describe("buildProxiedImageUrl", () => {
  it("keeps pathname and query of the image url", () => {
    const url =
      "https://example.com/image-gen/abc.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig"
    expect(buildProxiedImageUrl("/api-proxy", url)).toBe(
      "/api-proxy/image-gen/abc.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig",
    )
  })
})

describe("fetchRemoteImageBlob", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns blob when direct fetch succeeds", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(blobResponse())

    const blob = await fetchRemoteImageBlob("https://example.com/a.png", createSignal(), proxyConfig)

    expect(blob.size).toBe(8)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/a.png")
  })

  it("retries via dev proxy when direct fetch is blocked by CORS", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith("/api-proxy/")) {
        return blobResponse(16)
      }
      throw new TypeError("Failed to fetch")
    })

    const blob = await fetchRemoteImageBlob(
      "https://example.com/image-gen/a.png?X-Amz-Expires=3600",
      createSignal(),
      proxyConfig,
    )

    expect(blob.size).toBe(16)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe("/api-proxy/image-gen/a.png?X-Amz-Expires=3600")
    const proxyInit = fetchMock.mock.calls[1][1] as RequestInit
    expect((proxyInit.headers as Record<string, string>)["x-dev-proxy-target"]).toBe("https://example.com")
  })

  it("throws ImageUrlDownloadError with sourceUrl when no proxy is available", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    const error = await fetchRemoteImageBlob(
      "https://example.com/a.png?X-Amz-Signature=sig",
      createSignal(),
      null,
    ).catch((caught) => caught)

    expect(isImageUrlDownloadError(error)).toBe(true)
    expect((error as { sourceUrl: string }).sourceUrl).toBe("https://example.com/a.png?X-Amz-Signature=sig")
    expect((error as { details?: { sourceUrl?: string } }).details?.sourceUrl).toBe(
      "https://example.com/a.png?X-Amz-Signature=sig",
    )
  })

  it("falls back to proxy on http status errors then throws ImageUrlDownloadError if proxy also fails", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(403))

    const error = await fetchRemoteImageBlob("https://example.com/a.png", createSignal(), proxyConfig).catch(
      (caught) => caught,
    )

    expect(isImageUrlDownloadError(error)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("propagates abort errors without proxy fallback", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValue(new DOMException("Aborted", "AbortError"))

    await expect(
      fetchRemoteImageBlob("https://example.com/a.png", createSignal(), proxyConfig),
    ).rejects.toThrow("任务已中止")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("planner blocks retry on image download errors", () => {
  const streamPlan = { id: "stream", transport: "stream" as const, bodyMode: "json" as const }
  const jsonPlan = { id: "json", transport: "json" as const, bodyMode: "json" as const }

  it("shouldRetryImagesPlan blocks stream->json fallback for download errors", () => {
    const error = new TypeError("图片已生成，但下载失败")
    error.name = "ImageUrlDownloadError"
    expect(shouldRetryImagesPlan(error, streamPlan, jsonPlan)).toBe(false)
  })

  it("shouldRetryResponsesWithCompatibility blocks retry for download errors", () => {
    const error = new TypeError("图片已生成，但下载失败")
    error.name = "ImageUrlDownloadError"
    expect(shouldRetryResponsesWithCompatibility(error)).toBe(false)
  })

  it("still allows stream->json fallback for server errors", () => {
    expect(shouldRetryImagesPlan(new Error("HTTP 500 error"), streamPlan, jsonPlan)).toBe(true)
  })
})
