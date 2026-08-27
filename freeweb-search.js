// DSH freeweb — 免费网页搜索 provider（Parallel 后端，匿名免 key）
// 零依赖：纯全局 fetch + 标准 JS，无任何 import
// 设计目标：最差情况 = provider 不可用，绝不阻断 DSH 启动
module.exports = {
  inject: ['web'],
  apply(ctx) {
    const ENDPOINT = 'https://search.parallel.ai/mcp'

    const provider = {
      id: 'freeweb',
      // 无 key 无配置：只要 fetch 在就可用
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
          if (data.isError || content.length === 0) {
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
          const seen = {}
          for (let i = 0; i < results.length; i++) {
            const item = results[i] || {}
            const url = item.url
            if (!url || seen[url]) continue
            seen[url] = true
            const s = { url: url }
            if (item.title) s.title = String(item.title)
            if (Array.isArray(item.excerpts) && item.excerpts.length) {
              s.snippet = Array.from(String(item.excerpts[0])).slice(0, 300).join('')
            }
            if (item.publish_date) s.publishedAt = String(item.publish_date)
            sources.push(s)
          }

          // 硬上限 50：防止请求方传超大 maxResults 撑大 sources
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
  },
}