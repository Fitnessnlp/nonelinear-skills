# NoneLinear Agent Skills

NoneLinear 官方 Agent Skills 仓库。当前提供 `nonelinear-image`：通过 NoneLinear API
生成图片、编辑单张图片或融合多张参考图。

Skill 自带无第三方依赖的 Node.js 脚本，不需要安装 NoneLinear CLI，也不需要执行
`npm install`。运行时需要 Node.js 18 或更高版本。

## 能力

- 文生图
- 单图编辑
- 多图融合
- 本地图片安全上传
- `gemini-2.5-flash-image`
- `gpt-image-2` 的 `size`、`quality` 和透明背景 PNG
- `doubao-seedream-5-0-pro-260628` 的完整参数适配
- 版本化模型能力注册表
- 稳定 JSON 输出
- 阻止 base64 图片进入 Agent 上下文

当前版本：`0.3.0`

后续版本范围、验收指标以及与生图评测的协同方式见
[生图 Skill 产品规划](docs/nonelinear-image-product-plan.md)。

## 平台兼容性

| 平台 | 安装方式 | 状态 |
| --- | --- | --- |
| Claude Code | 用户级或项目级 Skill | 已验证标准结构 |
| Codex | 用户级或项目级 Skill | 已验证标准结构 |
| TRAE | Universal ZIP 或 `.trae/skills/` | 结构兼容，待完整真机认证 |
| Cherry Studio 1.9.1+ | Skills 管理界面 | 结构兼容，待完整真机认证 |
| WorkBuddy | Skills 管理界面 | 实验性，待完整真机认证 |
| 其他工具 | 支持 `SKILL.md`、Node.js 和本地命令执行 | 视宿主权限而定 |

“结构兼容”表示 Skill 使用通用的 `SKILL.md + scripts + references` 结构，但仍需确认
宿主是否允许执行 Node.js 子进程、读取指定本地文件以及访问 NoneLinear HTTPS 接口。

## 下载

推荐从
[GitHub Releases](https://github.com/Fitnessnlp/nonelinear-skills/releases)
下载：

```text
nonelinear-image-0.3.0.zip
nonelinear-image-0.3.0.tgz
SHA256SUMS
```

Universal ZIP 和 TGZ 只包含：

```text
nonelinear-image/
├── SKILL.md
├── agents/
├── references/
└── scripts/
```

它们不包含 `.env`、API key、CLI、`node_modules`、测试输出或 NoneLinear 技术文档仓库。

## 安装到 Claude Code

macOS / Linux：

```bash
mkdir -p ~/.claude/skills
unzip nonelinear-image-0.3.0.zip -d ~/.claude/skills
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null
Expand-Archive .\nonelinear-image-0.3.0.zip -DestinationPath "$HOME\.claude\skills" -Force
```

也可以把 `nonelinear-image` 放在项目的 `.claude/skills/` 下。安装后新建 Claude Code
会话，然后输入：

```text
/nonelinear-image 生成一张 1:1 产品图：白色陶瓷马克杯放在胡桃木桌面上，清晨自然光，真实摄影风格。
```

## 安装到 Codex

macOS / Linux：

```bash
mkdir -p ~/.agents/skills
unzip nonelinear-image-0.3.0.zip -d ~/.agents/skills
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.agents\skills" | Out-Null
Expand-Archive .\nonelinear-image-0.3.0.zip -DestinationPath "$HOME\.agents\skills" -Force
```

也可以把 `nonelinear-image` 放在项目的 `.agents/skills/` 下。安装后新建 Codex
会话，然后输入：

```text
使用 $nonelinear-image 生成一张 16:9 图片：雨后的上海街道，霓虹灯倒映在路面，电影摄影风格。
```

## TRAE、Cherry Studio 和 WorkBuddy

优先下载 `nonelinear-image-0.3.0.zip`，通过宿主的 Skills 管理界面上传或导入。

TRAE 也可以使用项目级目录：

```text
<project>/.trae/skills/nonelinear-image/SKILL.md
```

不同版本的桌面工具可能使用不同的导入入口和沙箱策略。首次运行时应检查：

- 宿主可以执行 `node`。
- Node.js 版本不低于 18。
- 宿主允许访问 `api.nonelinear.com` 和 `nonelinear.com`。
- API key 被注入脚本子进程，而不是粘贴到聊天中。

在这些平台完成真实认证前，问题反馈请包含宿主名称、版本、操作系统和脱敏错误码。

## 模型能力注册表

`skills/nonelinear-image/references/model-capabilities.json` 是 0.3.0 起的模型能力来源。
状态含义：

- `candidate`：文档出现过，当前 Skill 尚未接入。
- `passthrough`：可传模型 ID，缺少完整校验。
- `implemented`：已有参数映射、限制和错误处理。
- `live_verified`：真实 API 请求通过。
- `host_verified`：真实 Agent 端到端通过。

当前深度适配：`gemini-2.5-flash-image`、`gpt-image-2`、
`doubao-seedream-5-0-pro-260628`。其他文档模型按注册表状态处理。

## 配置 API Key

Skill 只从进程环境读取凭据，不读取 `.env`、cc-switch 数据库或 Agent 配置文件。

macOS / Linux：

```bash
export NONELINEAR_API_KEY="nl-xxx"
```

Windows PowerShell：

```powershell
$env:NONELINEAR_API_KEY="nl-xxx"
```

Windows CMD：

```bat
set "NONELINEAR_API_KEY=nl-xxx"
```

当宿主或 cc-switch 把已有配置注入子进程时，Skill 也可以安全复用：

- `OPENAI_API_KEY`：仅当 `OPENAI_BASE_URL` 的 HTTPS 主机名为
  `api.nonelinear.com`。
- `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`：仅当
  `ANTHROPIC_BASE_URL` 的 HTTPS 主机名为 `api.nonelinear.com`。

桌面图标启动的应用不一定继承终端环境变量。此时应使用宿主提供的安全环境变量配置，
不要把真实 key 写入 Skill、项目文件、聊天、截图或问题反馈。

## 图片编辑

公开 HTTPS URL：

```text
使用 nonelinear-image 编辑 https://example.com/product.png，把背景替换成浅灰色摄影棚，保留产品外观。
```

本地路径：

```text
使用 nonelinear-image 编辑本地图片 /home/user/images/product.png，把背景替换成浅灰色摄影棚。不要读取或附加图片，直接把路径交给 Skill 脚本。
```

Windows 路径：

```text
使用 nonelinear-image 编辑本地图片 C:\Users\user\Pictures\product.png，把背景替换成浅灰色摄影棚。不要读取或附加图片，直接把路径交给 Skill 脚本。
```

本地文件由脚本子进程读取并上传。不要把图片拖入对话，也不要使用 `@路径` 让 Agent
提前读取图片，否则宿主可能在 Skill 执行前就把图片计入上下文。

## 多图融合

```text
使用 nonelinear-image 融合 https://example.com/product.png 和 https://example.com/scene.png，把第一张图的产品自然放入第二张图的场景，保持产品外观和比例。
```

本地路径和公开 URL 可以混合使用。参考图顺序会被保留。

## 数据流和安全

文生图请求发送到：

```text
https://api.nonelinear.com/v1/images/generations
```

使用本地参考图时，脚本会在子进程内将文件转换为 base64，并发送到固定上传接口：

```text
https://nonelinear.com/api/upload-file
```

上传接口返回的临时 URL 随后用于图片生成请求。base64、Authorization header、完整
请求体和本地文件路径不会写入 stdout、错误 JSON 或 Agent 回复。

请求可能产生费用。Skill 不会在失败后自动重试图片生成请求。

## 本地开发

```bash
git clone https://github.com/Fitnessnlp/nonelinear-skills.git
cd nonelinear-skills
npm install
npm test
npm run validate
```

测试全部使用 mock，不读取 `.env`，也不发送真实 API 请求。

## 输出

成功：

```json
{
  "status": "completed",
  "operation": "generate",
  "model": "gemini-2.5-flash-image",
  "images": [{ "url": "https://..." }],
  "request_id": "..."
}
```

失败：

```json
{
  "status": "failed",
  "error": "Human readable message",
  "code": "stable_error_code"
}
```

## 许可证

[MIT](LICENSE)
