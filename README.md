# DSH freeweb

DSH 免费网页搜索 provider：把 DeepSeek 官方按量计费的 `web_search` 切换成 **Parallel 免费搜索后端**（匿名免 key，永久免费层）。

- 🆓 **真·零依赖**：纯全局 `fetch` + 标准 JS，**没有任何 import**——不存在装完缺依赖崩溃的问题
- 🧯 **完整错误处理**：所有异常返回诊断信息，不静默失败
- 🧹 **干净可逆**：安装 = 1 个文件 + 2 行 patch；回退 = 删掉即可，无 npm、无 lock 残留
- ⚠️ **注意**：插件通过 `cordis.patch.yml` 引用本地文件 `./freeweb-search.js`，**该文件必须存在**（随本仓库分发）。缺失时 DSH 启动会报错——回退/删除时请先删 patch 行，再删文件。

## 免费后端：Parallel Search

[Parallel Search MCP](https://parallel.ai/blog/free-web-search-mcp) 官方免费提供：AI agents 匿名调用，无需账号、无需 API key。免费层有速率限制（个人日常使用足够）；要更高限额可注册账号。

| 项 | 值 |
|----|-----|
| 端点 | `https://search.parallel.ai/mcp` |
| 协议 | MCP（JSON-RPC over HTTP），直接 `tools/call`，无需握手 |
| 认证 | 无（匿名） |
| 返回 | 结构化 JSON：`url / title / publish_date / excerpts` |
| 中文 | 可用（中文查询返回中文结果） |

## 安装

### 前置

- DSH 已运行（`npx @deepseek-ai/dsh web`）
- Node.js ≥ 18（`fetch` 全局可用；DSH 本身要求 ≥ 22.19）

### 步骤（两步）

**1. 把 `freeweb-search.js` 放进 profile 目录**

```
~/.dsh/profiles/web/freeweb-search.js     （Windows: C:\Users\<你>\.dsh\profiles\web\）
```

**2. 在 `cordis.patch.yml` 追加**（若已有内容，合并到数组里）：

```yaml
- id: web
  config:
    searchProvider: freeweb

- insert:
    - id: freeweb-search
      name: ./freeweb-search.js
```

**3. 重启 DSH**，模型侧的 `web_search` 工具自动走免费搜索。

## 回退官方

删除 `cordis.patch.yml` 里刚加的两块（`- id: web` 和 `- insert:`），重启即可。**先删 patch 行，再删文件**（反之会让 DSH 启动报找不到文件）。

## 故障排查

| 症状 | 原因 |
|------|------|
| 搜索返回 `freeweb: HTTP 429` | 免费层限速，稍后重试 |
| 搜索返回 `freeweb: MCP error - ...` | Parallel 服务异常，稍后重试 |
| 搜索返回 `freeweb: 响应解析失败` | Parallel 返回格式变化（可能改版） |
| DSH 启动报找不到 `freeweb-search.js` | 文件没放对位置，或删了文件但 patch 行还在——放回文件或删掉 patch 行 |

## 定位与取舍

DSH freeweb 追求**极致轻量化与 DSH 自身安全**，因此功能不会很强：

- 它是一份**快速、无安全负担的免费联网方案**——单文件、零依赖、匿名免 key，装删都在两行之间；
- 适合**联网搜索要求不大的玩家长期使用**，或**高要求玩家作为临时备选**（Parallel 免费层有速率限制，且索引偏向英文）。

如果你需要更强的搜索（更精准的中文、更高频的调用），建议评估带 key 的商用搜索方案。本插件的价值在于：**用最轻的代价，把"联网"这个基本能力免费补上**。

## 设计说明（为什么这么写）

本插件的设计哲学：**最小冲击、故障透明、取舍明确**。

- **零依赖**：只用一个全局 `fetch` 和标准 JS，没有任何 `import`。安装不产生 node_modules、package-lock、pnpm 等任何依赖痕迹——这是"干净可逆"的前提。
- **朴素装配**：只用最简单的 `- insert:` 引用本地文件，不用 `!!js` 表达式做存在性检查（其语法有其风险）。代价是：文件缺失时 DSH 会报错——但这由安装/回退流程管理（README 已写明顺序）。
- **故障透明**：`apply` 和 `search` 的每个失败分支要么返回诊断信息（通过 `content` 字段给模型），要么 `console.error` 留日志（如注册失败）。绝不静默吞错——但不向 Loader 抛错，避免影响 DSH 启动。
- **按码点截断**：查询和摘录用 `Array.from(...)` 按 Unicode 码点截断，避免把 emoji 的代理对劈成半个产生乱码。
- **去重**：多查询返回的重复 URL 会合并。
- **无配置界面**：刻意不做 `Config`（依赖 schemastery），配置就是 patch.yml 那两行。
- **显示名取舍**：本地文件插件的列表显示名是文件名（`./freeweb-search.js`），这是零依赖的合理代价。项目名「DSH freeweb」体现在文档与代码注释中。

## 与社区标准的协作

本项目关注并支持 [dsh-std](https://github.com/Yan-Zero/dsh-std) 社区互操作标准（[dsh-ecosystem-spec](https://github.com/T-Auto/dsh-ecosystem-spec) 基线的 `apiVersion + kind` 协议坐标），待其 manifest 格式稳定后，将补充协议声明（`dsh-plugin.json`）。在此之前，本插件保持零依赖的独立形态，不与草案格式绑定。

## Credits

设计协作：[DeepSeek V4 Flash 0731](https://github.com/deepseek-ai)（AI 协作者）

## License

MIT — see [LICENSE](LICENSE)
