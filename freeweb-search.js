// DSH freeweb — 免费网页搜索 provider（Parallel 后端，匿名免 key）
// 零依赖：纯全局 fetch + 标准 JS，无任何 require / import
// 设计目标：最差情况 = provider 不可用，绝不阻断 DSH 启动
//
// ★ 核心语义（就这三件事，没有别的）
//   ① 注册 provider：让 seam 有 freeweb 这个选项
//   ② 启用即接管：把 web.searchProvider 写成 freeweb，覆盖官方设置页的选择
//   ③ 停用即回官方：不写任何"让位"逻辑 —— 因为接管写入的 freeweb 恰等于 bundle 默认值，
//      DSH 会把它规范化成"清除覆盖"；插件停用后 bundle patch 消失，配置自然回落到官方默认。
//      （这是我们刻意依赖的性质，不是巧合：它让插件停用时无需任何清理动作。）
//
// ★ 为什么没有 dispose 让位 / 重试链 / 代际计数
//   实测结论：那些时间设计全部无效 ——
//   · dispose 发生在 HMR 事务内，写入被拒；延迟到事务外时 fiber 已销毁，写入同样失败
//   · "避开事务"和"fiber 还活着"在时间上不可兼得
//   既然停工后配置会自动回落，就不需要它们。代码越少，出错面越小。
//
// 已知限制：停用后会回落到 DSH 的默认搜索（当前是某版官方搜索），
//           不保证是你设置页里选的那个版本。官方淘汰旧搜索时再做适配。

/** 接管时写入的选择（等于本 bundle 的 patch 默认值，因此会被规范化成"清除覆盖"）。 */
const TAKE_OVER = { searchProvider: 'freeweb', fetchProvider: 'http' }

/** 取可选的 settings 服务；不可用返回 undefined。 */
function settingsOf(ctx) {
  try {
    return ctx.get('settings')
  } catch (e) {
    return undefined
  }
}

/**
 * 把 `web` 的选择接管为 freeweb（幂等）。失败只降级，不抛。
 * @param ctx - 插件上下文。
 */
function takeOver(ctx) {
  const settings = settingsOf(ctx)
  if (!settings || settings.writable !== true) return

  let forms
  try {
    forms = settings.describe({ redactSecrets: true })
  } catch (e) {
    return
  }
  if (!Array.isArray(forms)) return

  const web = forms.find((f) => f && f.ns === 'web')
  if (!web) return
  const current = web.value && web.value.searchProvider
  if (current === 'freeweb') return

  try {
    const done = settings.update('web', TAKE_OVER, web.revision)
    if (done && typeof done.catch === 'function') done.catch(function () {})
  } catch (e) {
    // 写入失败（只读 profile / HMR 事务内）不影响 provider 注册本身
    console.error('freeweb: 接管搜索选择失败 -', e && e.message ? e.message : String(e))
  }
}

module.exports = {
  name: 'freeweb-search',
  inject: ['web'],
  apply(ctx) {
    const ENDPOINT = 'https://search.parallel.ai/mcp'

    const provider = {
      id: 'freeweb',
      // 关于 available() 为何"恒真"（这是刻意设计，不是漏写）：
      //   · seam 约定它必须是【廉价的本地检查，且不得发起网络调用】
      //   · 恒真的含义是"provider 已注册、可被选中"，不承诺"网络一定通"
      //   · 真实的网络/限流问题在 search() 里以诊断文本返回（见下方各失败分支）
      //   · 若在此处发请求探测，会违反 seam 约定，并让每次提供方选择都变慢
      available: function () {
        return typeof fetch === 'function'
      },
      search: async function (request, signal) {
        // 全 try-catch：任何异常都返回诊断 content，不向上抛
        try {
          // 按 Unicode 码点截断（Array.from），避免把 emoji 代理对劈成半个
          const query = Array.from(String(request.query || '')).slice(0, 200).join('')
          if (!query) {
            return { sources: [], truncated: false, content: 'freeweb: empty query' }
          }

          const resp = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: {
                name: 'web_search',
                arguments: {
                  objective: query,
                  search_queries: [query],
                },
              },
            }),
            signal: signal,
          })

          if (!resp.ok) {
            return { sources: [], truncated: false, content: 'freeweb: HTTP ' + resp.status + (resp.status === 429 ? '（免费层限速，请稍后重试）' : '') }
          }

          const data = await resp.json()
          const result = data && data.result
          const content = result && Array.isArray(result.content) ? result.content : []
          if ((data && data.isError) || content.length === 0) {
            const errText = content.length ? String(content[0].text).slice(0, 200) : 'no content'
            return { sources: [], truncated: false, content: 'freeweb: MCP error - ' + errText }
          }

          const raw = String(content[0].text)
          let parsed
          try {
            parsed = JSON.parse(raw)
          } catch (e) {
            return { sources: [], truncated: false, content: 'freeweb: 响应解析失败（Parallel 返回非 JSON）' }
          }

          const results = Array.isArray(parsed.results) ? parsed.results : []
          const sources = []
          // 用 Set 去重：普通对象会把 constructor/toString 这类 URL 误判成"已见过"
          const seen = new Set()
          for (let i = 0; i < results.length; i++) {
            const item = results[i] || {}
            const url = item.url
            if (!url || seen.has(url)) continue
            seen.add(url)
            const s = { url: url }
            if (item.title) s.title = String(item.title)
            if (Array.isArray(item.excerpts) && item.excerpts.length) {
              s.snippet = Array.from(String(item.excerpts[0])).slice(0, 300).join('')
            }
            if (item.publish_date) s.publishedAt = String(item.publish_date)
            sources.push(s)
          }

          // 结果上限的语义（容易被误读，特此写明）：
          //   · 这里【尊重调用方】传入的 maxResults —— 传 5 就返回 5，不补齐；
          //     未传时才用兜底 10（实际调用方是 dsh-tool-web，其上限默认 8）
          //   · 再兜一层 50 的硬上限，防止请求方传超大值把 sources 撑大
          //   · ★ truncated 的权威判定在 seam 侧（capSources 会按 request.maxResults 再截一次
          //     并置 truncated）；这里的计算是"本 provider 自己截过"的提前告知，语义与之一致
          const maxResults = Math.min(request.maxResults || 10, 50)
          return {
            sources: sources.slice(0, maxResults),
            truncated: sources.length > maxResults,
            content: undefined,
          }
        } catch (err) {
          if (signal && signal.aborted) throw err
          return { sources: [], truncated: false, content: 'freeweb: ' + String(err) }
        }
      },
    }

    try {
      const disposer = ctx.web.registerSearchProvider(provider)
      ctx.effect(function () { return disposer })
    } catch (e) {
      // 注册失败不向上抛（避免阻断启动），但留日志便于诊断
      console.error('freeweb: 注册失败 -', e && e.message ? e.message : String(e))
    }

    // ── 接管：抹掉官方设置页写下的选择 ──
    // apply 的瞬间 settings 服务通常还没挂载（实测约 3 秒后才可用），
    // 所以补一次延迟尝试；官方的设置变更再用事件兜一次。失败都只降级。
    setTimeout(function () { takeOver(ctx) }, 3000)
    try {
      ctx.on('settings/document-updated', function (ns) {
        if (ns !== 'web') return
        setTimeout(function () { takeOver(ctx) }, 0)
      })
    } catch (e) {
      /* 事件 API 不可用时，上面那一次延迟尝试仍然有效 */
    }
  },
}
