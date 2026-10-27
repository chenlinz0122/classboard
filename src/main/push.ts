import { logLine } from './log'

const WXPUSHER_API = 'https://wxpusher.zjiecode.com/api/send/message'
const REQUEST_TIMEOUT_MS = 10_000

export interface WxPusherConfig {
  appToken: string
  uid: string
}

interface WxPusherResponse {
  code: number
  msg: string
  data: unknown
  success: boolean
}

export function wxPusherConfigured(config: WxPusherConfig): boolean {
  return Boolean(config.appToken.trim() && config.uid.trim())
}

async function postMessage(config: WxPusherConfig, payload: Record<string, unknown>): Promise<WxPusherResponse> {
  const response = await fetch(WXPUSHER_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appToken: config.appToken.trim(),
      ...payload
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`WxPusher 服务返回 ${response.status}`)
  }
  const payloadJson = (await response.json().catch(() => null)) as WxPusherResponse | null
  if (!payloadJson) {
    throw new Error('WxPusher 返回内容无法解析')
  }
  return payloadJson
}

/** 发送一条提醒到微信（WxPusher 公众号消息）。失败只记录日志，不影响本机通知。 */
export async function sendWxPusher(
  config: WxPusherConfig,
  title: string,
  body: string
): Promise<void> {
  if (!wxPusherConfigured(config)) return
  try {
    const result = await postMessage(config, {
      content: `${title}\n${body}`,
      summary: title.slice(0, 99),
      contentType: 1,
      uids: [config.uid.trim()]
    })
    if (result.code !== 1000) {
      logLine(`[wxpusher] 发送失败 code=${result.code} msg=${result.msg}`)
      throw new Error(result.msg || `WxPusher 错误码 ${result.code}`)
    }
    logLine(`[wxpusher] sent: ${title}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WxPusher')) throw error
    const message = error instanceof Error ? error.message : String(error)
    logLine(`[wxpusher] 请求异常: ${message}`)
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('微信推送请求超时')
    }
    throw new Error(`微信推送请求失败：${message}`)
  }
}

/** 发送测试消息，返回错误信息；成功返回 null。 */
export async function testWxPusher(config: WxPusherConfig): Promise<string | null> {
  if (!config.appToken.trim()) return '请先填写 appToken'
  if (!config.uid.trim()) return '请先填写 UID'
  try {
    await sendWxPusher(config, '看板测试推送', '收到这条消息说明微信推送配置成功。')
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
