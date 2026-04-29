import type { AppSettings, ApiProtocol, RequestMode } from '../../../../types'
import type { DevProxyConfig } from '../../../../lib/devProxy'
import Select from '../../../../shared/components/Select'
import { API_PROTOCOL_OPTIONS, REQUEST_MODE_OPTIONS } from './options'
import { fieldClassName } from './apiSettingsShared'

interface ApiRequestSettingsProps {
  draft: AppSettings
  proxyConfig: DevProxyConfig | null
  commitSettings: (nextDraft: AppSettings) => void
}

export default function ApiRequestSettings({
  draft,
  proxyConfig,
  commitSettings,
}: ApiRequestSettingsProps) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">API 协议</span>
        <Select
          value={draft.apiProtocol}
          onChange={(value) => commitSettings({ ...draft, apiProtocol: value as ApiProtocol })}
          options={API_PROTOCOL_OPTIONS}
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          <div>Images API：直接请求 `/v1/images/generations` 或 `/v1/images/edits`。</div>
          <div>Responses API：直接请求 `/v1/responses`，不再自动回退或切换。</div>
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">请求模式</span>
        <Select
          value={draft.requestMode}
          onChange={(value) => commitSettings({ ...draft, requestMode: value as RequestMode })}
          options={REQUEST_MODE_OPTIONS}
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          <div>直连：浏览器直接请求 API URL。</div>
          <div>本地代理：先请求同源代理，再由本地 dev server 转发到 API URL，可绕过浏览器 CORS 预检。</div>
          {draft.requestMode === 'local_proxy' ? (
            proxyConfig?.enabled ? (
              <div>
                已检测到本地代理前缀：
                <code className="ml-1 rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{proxyConfig.prefix}</code>
                ，仅 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">npm run dev</code> 生效。
              </div>
            ) : (
              <div className="text-amber-500 dark:text-amber-400">
                未检测到可用代理配置。请确认 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">dev-proxy.config.json</code> 存在，并重启 dev server。
              </div>
            )
          ) : null}
        </div>
      </label>
    </>
  )
}
