# DSH freeweb

DSH 免费网页搜索 provider：把 DeepSeek 官方按量计费的 `web_search` 切换成 **Parallel 免费搜索后端**（匿名免 key，永久免费层）。

- 🆓 **真·零依赖（插件本身）**：纯全局 `fetch` + 标准 JS，**没有任何 import**——不存在装完缺依赖崩溃的问题
  （⚠️ 但**插件页 / CLI 安装**这条路径需要系统里有 `pnpm`；**手动挂载不需要**，见安装章节）
- 🧯 **完整错误处理**：所有异常返回诊断信息，不静默失败
- 📦 **组合包形态（本插件 0.2.0 起）**：声明 `dsh.bundle`，可从 Web **插件页**安装/启停/卸载，卡片显示为 `dsh-freeweb`
- 🧹 **干净可逆**：插件页卸载；或手动方式 = 1 个文件 + 2 行 patch，删掉即回退
- ⚠️ 手动方式下，插件通过 `cordis.patch.yml` 引用本地文件 `./freeweb-search.js`，**该文件必须存在**；缺失时 DSH 启动会报错——回退时请**先删 patch 行，再删文件**。

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

> **分发方式**：本插件通过 GitHub 仓库分发，**尚未发布到 npm**。下面三种方式都以「你手上的这份源码目录」为前提。
>
> **前置条件**
> - **DSH**：手动挂载（方式 C）需要 ≥ 0.1.5；**组合包安装（方式 A / B）建议 ≥ 0.2.0**（组合包链路仅在 0.2.0-rc.2 上实测过，见下文「版本声明」）
> - **Node.js ≥ 18**（插件依赖全局 `fetch`；DSH 本身要求更高的版本）
> - **`pnpm`**：仅方式 A / B 需要（DSH 的插件安装器由 pnpm 驱动，安装与卸载都调它）。没有 pnpm 时用方式 C，**功能完全相同**

### 方式 A：插件页安装（推荐，DSH 0.2.0+）

1. 侧栏 **插件** → **添加插件**
2. 输入本目录的**绝对路径**（例：`D:\plugins\DSH-freeweb`）
3. Host 会先 `inspect`（读 `package.json` 确认声明了 `dsh.bundle`）→ 安装 → **立即启用**
4. 之后在 **已安装** 分组里出现 `dsh-freeweb` 卡片：可整包启停/卸载；点进去可单独启停它的行 `freeweb-search`

### 方式 B：命令行安装

```bash
npx @deepseek-ai/dsh plugin --profile web add "<本目录绝对路径>"
```

与方式 A 等价：都会把包装进 profile 依赖，并写入 `package.json` 的 `dsh.profile.bundles`。

### 方式 C：手动挂载（零打包，最轻）

⚠️ **与方式 A / B 互斥**：两种方式同时存在会注册两个 freeweb provider，seam 以
`WEB_DUPLICATE_PROVIDER` 拒绝第二个。二选一。

**1.** 把 `freeweb-search.js` 放进 profile 目录：

```
~/.dsh/profiles/web/freeweb-search.js     （Windows: C:\Users\<你>\.dsh\profiles\web\）
```

**2.** 在 profile 的 `cordis.patch.yml` 追加（见 [`example-cordis.patch.yml`](example-cordis.patch.yml)）：

```yaml
- id: web
  config:
    searchProvider: freeweb
    fetchProvider: http      # ⚠️ 必须带：config 是整段替换，不写会丢掉 dsh-base 的 fetch provider

- insert:
    - id: freeweb-search
      name: ./freeweb-search.js
```

**3.** 重启 DSH，模型侧的 `web_search` 工具自动走免费搜索。

> 技术细节：插件文件是标准 CJS（`module.exports = { inject, apply }`）；Loader 用动态 `import()`
> 加载它，并会归一化 CJS / `default` 的导出形状。

## 验证安装成功

**先看界面（最快）**

1. 侧栏 **插件 → 已安装** 里能看到 `dsh-freeweb` 卡片
2. 设置 → **内置插件** 里 `include:freeweb-search` 显示「已启用 / 运行中」

**再实测一次**：让 agent 搜一次，能正常返回来源列表即可。

**技术判据（排障用，需要读会话日志）**

官方 DeepSeek 搜索 provider **每次**都会往会话日志写一条 `web/deepseek-search-llm-request`
事件；**freeweb 不写**。所以搜索后：

| 观察 | 结论 |
|---|---|
| 没有新增 `web/deepseek-search-llm-request` | ✅ 走的是 freeweb |
| 有新增 | ❌ 仍是官方 provider（检查 `- id: web` 的覆盖是否生效） |

## 升级 / 降级

- **升级**：DSH 目前**不支持插件自动更新**。先卸载再装新版
  （插件页卸载 → 再「添加插件」，或 CLI `dsh plugin --profile web add <路径>`）
- **降级**：同样操作，装回旧版本即可
- **手动挂载**方式没有版本概念——把文件换掉即可
- 若将来发布到 npm，可直接用包名 spec（如 `dsh-freeweb@<version>`）

## 插件页开关 = 接管开关（0.2.1 起）

启用/停用本插件，就是"用免费搜索 / 回官方搜索"的开关：

- **启用**：`apply` 把 `web.searchProvider` 写成 `freeweb`，**覆盖官方设置页里选的那个**
  （延迟 3 秒等 settings 服务挂载；失败只降级，不影响 provider 注册）
- **停用**：**不做任何清理** —— 接管写入的 `freeweb` 恰好等于本 bundle 的 patch 默认值，
  DSH 会把它规范化成"清除覆盖"；插件停用后 bundle patch 消失，配置**自然回落到官方默认**
- **官方设置页再改也会被抢回**：插件监听 `settings/document-updated`，改动后重新接管

已知限制：

| 项 | 说明 |
|---|---|
| 回落版本不保证 | 停用后回的是 DSH 默认搜索（当前 `deepseek-official`），**不保证是你设置页里选的那版**。官方淘汰旧搜索时再做适配 |
| 3 秒窗口 | `apply` 时 settings 服务尚未挂载，接管延迟 3 秒；极慢的机器上可能仍不可用 → 静默跳过。此时若你在设置页选过官方，搜索会走官方 |
| 不要手动改回 | 停用即回默认，**不需要**再手动改 patch；改回去也会被接管逻辑覆盖 |

## 回退官方

| 安装方式 | 回退操作 |
|---|---|
| 插件页 / CLI | **停用或卸载**皆可：插件不加载后搜索自动回到官方默认（`deepseek-official`）。原理见上一节 |
| 手动挂载 | 删除 `cordis.patch.yml` 里那两块（`- id: web` 与 `- insert:`），重启。**先删 patch 行，再删文件**（反之 DSH 会报找不到文件） |

## 故障排查

| 症状 | 原因 / 处理 |
|------|------|
| 安装时提示 `not-a-bundle` | 该目录没声明 `dsh.bundle`（本仓库已声明；若你复制了旧版单文件，请更新到组合包形态） |
| 安装/卸载时报找不到 `pnpm` | 方式 A / B 需要 pnpm。装一个（`npm i -g pnpm`，或 `corepack enable pnpm`——后者要求 Node 安装目录可写，权限不足时会报 EPERM），或改用方式 C |
| 搜索返回 `freeweb: HTTP 429` | 免费层限速，稍后重试 |
| 搜索返回 `freeweb: MCP error - ...` | Parallel 服务异常，稍后重试 |
| 搜索返回 `freeweb: 响应解析失败` | Parallel 返回格式变化（可能改版） |
| 报 `WEB_PROVIDER_AMBIGUOUS` | 同时有多个可用搜索 provider 但没显式 pin——检查 `- id: web` 的 `searchProvider: freeweb` 是否生效 |
| 报 `WEB_DUPLICATE_PROVIDER` | 同一 profile 里装/挂了两份 freeweb（例如插件页装了、手动挂载又留着一份） |
| DSH 启动报找不到 `freeweb-search.js` | 手动方式下文件没放对位置，或删了文件但 patch 行还在 |

## 已知限制与设计权衡

| 项 | 说明 |
|---|---|
| 免费层限速 | Parallel 匿名层有速率限制（返回 `freeweb: HTTP 429` 时稍后重试） |
| 索引偏英文 | 中文查询可用，但结果质量不如英文查询 |
| ★ 搜索结果**形态**与官方不同 | 官方 DeepSeek 搜索返回结构化引用块（`cited_text` 按 URL 关联成 snippet），Parallel 返回 `excerpts`（首段摘录）。**实测体感**：来源列表（url / title / 日期）够用，但**带原文引用的长摘要变少**——模型能逐条引用的原文片段会比走官方时少 |
| 结果数量 | 上限由调用方决定（`dsh-tool-web` 默认 8）；插件内部再兜一层硬上限 50 |
| ★ `fetchProvider: http` 被本包固定 | `web` 行的 `config` 是**整段替换**，所以本包必须连 `fetchProvider` 一起写。**若将来 dsh-base 换了默认抓取后端，本包会把它按回 `http`**——升级 DSH 后遇到抓取异常，先检查这里 |
| ★ 手动挂载与组合包安装互斥 | 同时存在 → 两个 provider → `WEB_DUPLICATE_PROVIDER` |
| ★ 失败以「答案文本」返回 | 插件失败时把诊断塞进 `content`（模型可见），而 seam 的设计推荐抛 `WebError`（带可按机器路由的 code）。这是**刻意的取舍**：本插件选择"永不阻断、故障透明"，不走抛错路径 |
| 本地依赖是绝对路径 | CLI / 插件页安装会写入 `link:<绝对路径>`；换机器或挪目录需重新安装 |
| 路径含空格 | 安装路径若含空格，命令行与配置里注意加引号（部分工具对空格敏感） |

## 与 DSH 0.2.0 的适配说明

| 层面 | 状态 |
|---|---|
| seam 接口（`registerSearchProvider` / `WebSearchProvider` / 请求与结果字段） | ✅ 完全兼容，未改动一行 |
| 挂载方式 | ✅ 组合包（`dsh.bundle.patch`）；`insert` 的相对路径按 patch 文件锚定 |
| `ctx.effect(() => disposer)` | ✅ 保留。seam 内部用的是 web 服务自己的 `ctx.effect`，因此插件行卸载时需自行注销 provider |
| `web` 行 config | ⚠️ 必须同时写 `searchProvider` 与 `fetchProvider`（整段替换） |
| 插件页显示名 | 组合包形态下显示包名 `dsh-freeweb`（手动方式显示为文件名） |

### 版本声明是「声明式」的（重要）

`package.json` 里声明了官方规范定义的 `dsh.manifestVersion: 1` 与 `engines.dsh`，
但**官方当前并不强制校验它们**——官方文档原话：

> 兼容性仅作声明。当前安装器和加载器不强制检查 `dsh.manifestVersion` 或 `engines.dsh`；
> 声明范围不会拒绝不兼容的宿主，也不会校验 SemVer 语法。

所以：

- **不要**把它理解为「DSH 会自动拦住不兼容版本」——它不会
- 实际兼容下限见下表，由**实测**得出，而不是由字段保证

| 形态 | 实测过的 DSH 版本 | 说明 |
|---|---|---|
| **手动挂载**（单文件 + patch） | 0.1.5-rc.x / 0.1.7-rc.2 / 0.2.0-rc.2 | 早期版本用旧依赖后端，该方式不依赖 `dsh.bundle` |
| **组合包形态**（`dsh.bundle`） | **仅 0.2.0-rc.2** | `dsh-package-manifest` 规范自 0.1.5 时代引入（官方示例即 `dsh: '0.1.5-alpha.1'`），但组合包安装链路在 0.1.5 / 0.1.7 上**未实测** |

> 保守建议：**组合包方式在 DSH ≥ 0.2.0 上使用**；更早版本请用「方式 C 手动挂载」。

## 版本说明

| 版本 | 形态 | 说明 |
|---|---|---|
| 0.1.0 | 裸单文件 + 手动 patch | 只能手动挂载 |
| 0.2.0 | 组合包（bundle） | 声明 `dsh.bundle`；可插件页安装/启停/卸载；**手动挂载仍受支持** |
| **0.2.1** | 组合包 | **插件页开关即接管开关**：启用自动抢占免费搜索、停用自然回落官方；代码从 267 行精简到 184 行（删掉全部时间设计）；零依赖不变 |

## 定位与取舍

DSH freeweb 追求**极致轻量化与 DSH 自身安全**，因此功能不会很强：

- 它是一份**快速、无安全负担的免费联网方案**——单文件、零依赖、匿名免 key；
- 适合**联网搜索要求不大的玩家长期使用**，或**高要求玩家作为临时备选**（Parallel 免费层有速率限制，且索引偏向英文）。

如果你需要更强的搜索（更精准的中文、更高频的调用），建议评估带 key 的商用搜索方案。本插件的价值在于：**用最轻的代价，把"联网"这个基本能力免费补上**。

## 设计说明（为什么这么写）

本插件的设计哲学：**最小冲击、故障透明、取舍明确**。

- **零依赖**：只用一个全局 `fetch` 和标准 JS，没有任何 `import`。本包自身不引入任何依赖
  （「插件页 / CLI 安装」所需的 `pnpm` 属于系统前置，见安装章节；手动挂载连它也不需要）。
- **朴素装配**：只用最简单的 `- insert:` 引用同包内的本地文件，不用 `!!js` 表达式做存在性检查（其语法有其风险）。代价是文件缺失时 DSH 会报错——由安装/回退流程管理（README 已写明顺序）。
- **故障透明**：`apply` 和 `search` 的每个失败分支要么返回诊断信息（通过 `content` 字段给模型），要么 `console.error` 留日志（如注册失败）。绝不静默吞错——但不向 Loader 抛错，避免影响 DSH 启动。
- **按码点截断**：查询和摘录用 `Array.from(...)` 按 Unicode 码点截断，避免把 emoji 的代理对劈成半个产生乱码。
- **去重**：多查询返回的重复 URL 会合并。
- **无配置界面**：刻意不做 `Config` —— `require('@deepseek-ai/schemastery')` 在 profile 里解析不到
  （插件走 ESM 解析，拿不到 DSH 安装目录里的包），三次尝试均失败，最终改为**硬编码接管**：
  开关就是插件页的启用/停用，配置就是 patch 里那两行。
- **保持 CJS**：`module.exports = { inject, apply }` 让"组合包安装"和"手动挂载"两种方式都能工作；改 ESM 会引入 `type: module` / `.mjs` 的解析约束。

## 与社区标准的协作

本项目关注并支持 [dsh-std](https://github.com/Yan-Zero/dsh-std) 社区互操作标准（[dsh-ecosystem-spec](https://github.com/T-Auto/dsh-ecosystem-spec) 基线的 `apiVersion + kind` 协议坐标），待其 manifest 格式稳定后，将补充协议声明（`dsh-plugin.json`）。在此之前，本插件保持零依赖的独立形态，不与草案格式绑定。

## Credits

设计协作：[DeepSeek V4 Flash 0731](https://github.com/deepseek-ai)（AI 协作者）
组合包适配与文档：[DeepSeek V4.1 Flash](https://github.com/deepseek-ai)（AI 协作者）

## License

MIT — see [LICENSE](LICENSE)
