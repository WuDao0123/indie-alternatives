# Indie Alternatives（帮我找工具）

[English](README.md) | 中文 · [indiealternatives.dev](https://indiealternatives.dev)

一个能装进**任何 AI 助手**的“帮我找工具 / 找替代品”服务：

1. 用户问“有没有工具能做 X”，AI 先在**独立开发者产品库**里匹配，推荐最相关的产品；
2. 找不到合适的，就把这个需求**匿名记录**下来，独立开发者可以从中找到“大家想要但还没人做”的产品方向。

同一套逻辑提供四种接入方式，覆盖目前主流的 AI：

| 接入方式 | 地址 / 入口 | 适用于 |
| --- | --- | --- |
| **MCP（本地 stdio）** | `node dist/src/stdio.js` | Claude Desktop、Claude Code、Cursor、Windsurf、VS Code Copilot、Cline、Gemini CLI、Codex CLI、Zed、LM Studio、Cherry Studio 等 |
| **MCP（远程 HTTP）** | `https://indiealternatives.dev/mcp` | ChatGPT（开发者模式）、Claude 网页版自定义连接器、Le Chat、Copilot Studio，以及上面所有支持远程 MCP 的客户端 |
| **REST + OpenAPI** | `https://indiealternatives.dev/openapi.json` | 自定义 GPT（GPT Actions）、Gemini / Vertex AI 扩展、Dify、Coze（扣子）、n8n、Zapier、LangChain、FastGPT 等 |
| **Function calling 定义** | `https://indiealternatives.dev/functions.json?format=…` | 自己写 agent 时直接调用 OpenAI / Anthropic / Gemini 等模型 API |
| **命令行** | `indie-alternatives search "…"` | 能执行终端命令的 agent |

另外 `https://indiealternatives.dev/llms.txt` 是一份给 AI 看的说明，会读网页的 AI 读了就知道怎么调用。

## 提供的工具

| 工具 | REST 接口 | 作用 |
| --- | --- | --- |
| `search_tools` | `GET /api/search?query=…` | 按需求描述（中英文都行）在产品库里匹配，可按分类 / 价格 / 平台过滤。返回 `matched`，为 `false` 时说明没找到合适的。 |
| `get_tool_details` | `GET /api/products/{id}` | 查看某个产品的完整介绍。 |
| `log_unmet_need` | `POST /api/needs` | 匿名记录没被满足的需求。 |
| `list_unmet_needs` | `GET /api/needs` | 汇总已记录的需求，按被提出的次数排序（可用 `HIDE_NEEDS_LIST=1` 隐藏）。 |

任何工具也都可以用 `POST /api/call/{工具名}` 调用，请求体就是参数。

服务会把使用规则告诉 AI（MCP 的 `instructions`、OpenAPI 的 `info.description`、llms.txt）：什么时候该搜、什么时候该记录、记录前要去掉个人信息。

## 匿名是怎么保证的

- 记录里**只有**：随机 id、需求文本、可选的领域 / 平台 / 预算、日期（只到天）、用于合并同类需求的指纹。
- **不保存**：用户身份、对话内容、IP、User-Agent、精确时间戳。HTTP 服务不写访问日志。
- 写入前服务端会再做一次脱敏：邮箱、手机号、链接、IP、证件号、卡号、@账号、微信/QQ 号、“我叫某某”都会被替换成 `[email]`、`[phone]` 这样的占位符。
- 工具说明要求 AI 先把需求改写成通用描述再提交；用户拒绝时不记录。
- **本地安装**（`npx indie-alternatives-mcp`、命令行）默认从 `https://indiealternatives.dev/catalog.json` 读取最新产品库（失败时用内置副本），并把未满足需求发到 `https://indiealternatives.dev/api/needs` 汇总；只发送脱敏后的需求字段。设置 `INDIE_ALT_OFFLINE=1` 可完全离线。
- 托管服务的使用统计**只有按天的计数**（如“今天搜索次数”“没找到的次数”“来自某客户端的连接数”），不存任何单个用户或单次请求的信息。
- 开发者提交产品时可选填的联系邮箱不公开，只用于审核沟通。

> 部署到 Cloudflare Workers + D1、开发者提交产品与审核接口、新的环境变量（`DATABASE_FILE`、`ADMIN_TOKEN`、`INDIE_ALT_OFFLINE`），详见[英文 README](README.md)。

## 安装

需要 Node.js 18 及以上。

```bash
npm install
npm run build
npm test          # 跑测试
```

下面的 `/绝对路径/indie-alternatives` 换成你放代码的位置。

## 一、本地 MCP 客户端

几乎所有 MCP 客户端的配置都长这样，只是文件位置不同：

```json
{
  "mcpServers": {
    "indie-alternatives": {
      "command": "node",
      "args": ["/绝对路径/indie-alternatives/dist/src/stdio.js"]
    }
  }
}
```

| 客户端 | 怎么加 |
| --- | --- |
| Claude Desktop | 编辑 `claude_desktop_config.json`（macOS 在 `~/Library/Application Support/Claude/`，Windows 在 `%APPDATA%\Claude\`），粘贴上面的配置，重启 |
| Claude Code | `claude mcp add indie-alternatives -- node /绝对路径/indie-alternatives/dist/src/stdio.js` |
| Cursor | 项目里的 `.cursor/mcp.json` 或全局 `~/.cursor/mcp.json`，同上面的配置 |
| Windsurf | `~/.codeium/windsurf/mcp_config.json`，同上面的配置 |
| VS Code（GitHub Copilot） | `.vscode/mcp.json`，把外层的 `mcpServers` 换成 `servers`，并给服务加 `"type": "stdio"` |
| Cline / Roo Code | 插件面板里的 MCP Servers → Configure，同上面的配置 |
| Gemini CLI | `~/.gemini/settings.json`，同上面的配置 |
| Codex CLI | `~/.codex/config.toml` 里加：<br>`[mcp_servers.indie-alternatives]`<br>`command = "node"`<br>`args = ["/绝对路径/indie-alternatives/dist/src/stdio.js"]` |
| Zed | `settings.json` 里的 `context_servers`，写法同上 |
| LM Studio | 右侧 Program → Install → Edit mcp.json，同上面的配置 |
| Cherry Studio 等国产客户端 | 设置 → MCP 服务器 → 添加，类型选 stdio，命令填 `node`，参数填脚本路径 |

各客户端的配置文件位置更新比较频繁，以对应客户端的官方文档为准。

想让大家本地装的插件把需求都汇总给你，在 `env` 里加 `"NEEDS_WEBHOOK_URL": "https://你的收集接口/needs"`（比如填你部署好的 `https://indiealternatives.dev/api/needs`）。

## 二、部署远程服务

ChatGPT、自定义 GPT、Dify、Coze 这些只能连公网地址，所以先部署 HTTP 版：

```bash
PORT=8787 PUBLIC_URL=https://你的域名 npm run start:http
```

或者用 Docker：

```bash
docker build -t indie-alternatives .
docker run -d -p 8787:8787 -e PUBLIC_URL=https://你的域名 -v indie-alternatives-data:/data indie-alternatives
```

本地调试可以用 `ngrok http 8787` 或 `cloudflared tunnel --url http://localhost:8787` 拿一个临时 HTTPS 地址。正式使用部署到任意支持 Node 或 Docker 的平台（Fly.io、Railway、Render、自己的服务器等）即可。服务是无状态的，可以随意横向扩容；只是多实例时需求文件不共享，建议配 `NEEDS_WEBHOOK_URL` 或换成数据库存储（见下文）。

部署好之后，打开 `https://你的域名/healthz` 应该返回 `{"ok": true}`。

## 三、远程 MCP 客户端

| 客户端 | 怎么加 |
| --- | --- |
| ChatGPT | 设置 → 应用与连接器 → 高级设置，打开开发者模式 → 创建，填 `https://indiealternatives.dev/mcp`，认证选“无” |
| Claude 网页版 / 桌面版 | 设置 → 连接器 → 添加自定义连接器，填 `https://indiealternatives.dev/mcp` |
| Cursor / VS Code / Windsurf / Gemini CLI 等 | 配置里用 `"url": "https://indiealternatives.dev/mcp"` 代替 `command` + `args`（VS Code 还要加 `"type": "http"`） |
| Mistral Le Chat、Microsoft Copilot Studio 等 | 在各自的“连接器 / 工具 / MCP”入口添加同一个 URL |

## 四、不支持 MCP 的平台：用 OpenAPI 导入

**自定义 GPT（GPT Actions）**：创建 GPT → 配置 → 创建新操作（Create new action）→ 从 URL 导入（Import from URL），填 `https://indiealternatives.dev/openapi.json`。认证选“无”；如果你设置了 `MCP_AUTH_TOKEN`，就选“API 密钥 / Bearer”并填入这个值。GPT 的指令里加一句：

> 当用户问“有没有工具能做某件事”时，先调用 search_tools；没找到合适的就调用 log_unmet_need 匿名记录需求，记录前去掉所有个人信息。

**Dify**：工具 → 自定义 → 创建自定义工具，从 URL 导入 `https://indiealternatives.dev/openapi.json`，然后在应用或工作流里启用。

**Coze（扣子）**：插件 → 创建插件 → 导入，选择 OpenAPI，填同一个地址。

**n8n / Zapier / FastGPT / 其它**：用 HTTP 请求节点调 REST 接口，或者导入 OpenAPI。

**Gemini（Vertex AI Agent Builder 等）**：在工具 / 扩展里选 OpenAPI，导入同一个地址。

## 五、自己写 agent：直接拿 function calling 定义

```bash
curl https://indiealternatives.dev/functions.json?format=openai            # OpenAI Chat Completions 的 tools
curl https://indiealternatives.dev/functions.json?format=openai-responses  # OpenAI Responses API 的 tools
curl https://indiealternatives.dev/functions.json?format=anthropic         # Claude Messages API 的 tools
curl https://indiealternatives.dev/functions.json?format=gemini            # Gemini 的 functionDeclarations
```

这些定义也适用于 DeepSeek、通义千问、Kimi、智谱等兼容 OpenAI 格式的模型。模型返回工具调用后，把参数原样 `POST` 到 `https://indiealternatives.dev/api/call/{工具名}`，结果再交还给模型就行。

示例（Python，OpenAI 格式）：

```python
import json, requests
from openai import OpenAI

BASE = "https://indiealternatives.dev"
tools = requests.get(f"{BASE}/functions.json?format=openai").json()
client = OpenAI()
messages = [{"role": "user", "content": "有没有工具能给截图加个好看的背景？"}]

while True:
    msg = client.chat.completions.create(model="gpt-5", messages=messages, tools=tools).choices[0].message
    messages.append(msg)
    if not msg.tool_calls:
        print(msg.content)
        break
    for call in msg.tool_calls:
        result = requests.post(f"{BASE}/api/call/{call.function.name}", json=json.loads(call.function.arguments)).json()
        messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)})
```

## 六、命令行

```bash
npm link    # 可选，把 indie-alternatives 装成全局命令
indie-alternatives search "给截图加漂亮背景"
indie-alternatives details shottr
indie-alternatives log "会议录音自动整理成纪要"
indie-alternatives needs
```

输出都是 JSON，任何能跑终端命令的 agent 都能用。

## 配置项（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CATALOG_FILE` | 内置的 `data/products.json` | 产品库 JSON 文件路径，多个用逗号分隔 |
| `CATALOG_URL` | — | 远程产品库 JSON 地址（缓存 10 分钟），多个用逗号分隔，可以和 `CATALOG_FILE` 一起用 |
| `NEEDS_FILE` | `~/.indie-alternatives/needs.jsonl` | 匿名需求记录写到哪里 |
| `NEEDS_WEBHOOK_URL` | — | 每条需求额外 POST 到这个地址，用来把各处的需求汇总到一起 |
| `HIDE_NEEDS_LIST` | — | 设为 `1` 时不提供 `list_unmet_needs`（公开部署时建议打开，避免别人读你的需求库） |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | HTTP 版监听地址 |
| `PUBLIC_URL` | 按请求头推断 | 对外地址，写进 OpenAPI 和 llms.txt，部署在反向代理后面时建议设置 |
| `MCP_AUTH_TOKEN` | — | 设置后 `/mcp` 和 `/api/*` 要求 `Authorization: Bearer <token>`；说明文档（`/openapi.json`、`/functions.json`、`/llms.txt`）仍然公开。ChatGPT 连接器不支持填固定 token，用 ChatGPT 时请保持不设置 |

## 接入你自己的产品库

`data/products.json` 里是 20 个**示例数据**，正式使用请换成你的产品库。格式是数组（或 `{ "products": [...] }`）：

```json
{
  "id": "唯一 id",
  "name": "产品名",
  "url": "https://...",
  "tagline": "一句话介绍",
  "description": "详细介绍",
  "categories": ["分类"],
  "tags": ["中英文关键词都写上，匹配主要靠它", "screenshot", "截图"],
  "pricing": "free | freemium | paid | commission",
  "platforms": ["web", "macos", "windows", "ios", "android", "self-hosted"],
  "maker": "可选：作者"
}
```

想接数据库或别的 API，实现 `src/types.ts` 里的 `CatalogSource`（只有一个 `load()` 方法）就行；需求存储同理实现 `NeedStore`（`append()` / `list()`），比如换成 Postgres 或 Supabase。

`NEEDS_WEBHOOK_URL` 收到的请求体就是一条记录：

```json
{ "id": "…", "need": "给视频自动加中文字幕", "category": "视频", "day": "2026-11-05", "fingerprint": "373ca764a387d209" }
```

## 匹配是怎么做的

不依赖外部服务，纯本地计算：英文按单词、中文按二字组切分，去掉“有没有”“推荐一个”这类口头词，再按 产品名 > 标签 > 一句话介绍 > 分类 > 描述 的权重打分。`matched` 看的是“问句里有含义的字有多少被命中”，达到 60% 才算找到。产品库变大后，可以把 `src/search.ts` 换成向量检索，接口不用变。

## 目录结构

```
src/
  core.ts      工具定义和实现（所有接入方式共用这一份）
  server.ts    MCP 接入
  stdio.ts     本地 MCP 入口
  http.ts      HTTP 入口：/mcp、/api/*、/openapi.json、/functions.json、/llms.txt
  rest.ts      OpenAPI、function calling 定义、llms.txt 生成
  cli.ts       命令行入口
  search.ts    匹配打分
  text.ts      中英文分词
  privacy.ts   脱敏与需求指纹
  sources.ts   数据源与需求存储（文件、URL、Webhook）
data/products.json   示例产品库
test/                测试
Dockerfile           容器部署
```
