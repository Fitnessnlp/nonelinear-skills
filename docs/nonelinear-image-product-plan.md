# NoneLinear 生图 Skill 产品规划

## 1. 定位

`nonelinear-image` 面向已接入 NoneLinear 的 Agent 用户，在 Claude Code、Codex、TRAE、
Cherry Studio、WorkBuddy 等工具中，用自然语言完成生图、编辑和多图融合。

核心价值：

- 不安装 CLI，不学习 API 参数。
- 统一不同生图模型的调用差异。
- 本地图片不进入 Agent 上下文。
- 输出稳定 JSON，便于 Agent 解析。
- 固定请求域名，保护 API key。

不做：视频、音频、搜索、通用 CLI、未确认的批量付费请求、自动重试、密钥或 base64 输出。

## 2. 已完成迭代

| 版本 | 时间 | 目标 | 已完成 | 主要不足 |
| --- | --- | --- | --- | --- |
| v0.1 | 2026.7.19 | Skill 内置脚本直接请求 NoneLinear API | 文生图、Node.js 18+、无依赖脚本、默认 `gemini-2.5-flash-image`、稳定 JSON、固定域名、环境变量取 key | 不支持编辑/融合，本地图片无上传，模型校验弱，未独立发布 |
| v0.2 | 2026.7.29 | 可分发的图片生成与编辑 Skill | 文生图、单图编辑、多图融合、本地图片上传、base64 隔离、3 个模型深度适配、Release 包、CI、34 个 mock 测试 | 模型支持未分级，部分模型仅透传，无智能选模，无本地落盘，非 Claude/Codex 宿主未完整认证 |

v0.3.0 当前处于候选包完成、正式发布闭环未完成的状态，详细目标、效果追踪和问题复盘见
[v0.3.0 迭代记录与复盘](nonelinear-image-v0.3-iteration-review.md)。

v0.2 深度适配模型：

- `gemini-2.5-flash-image`
- `gpt-image-2`
- `doubao-seedream-5-0-pro-260628`

## 3. 当前能力

| 能力 | 状态 |
| --- | --- |
| 文生图 | 可用 |
| 单图编辑 | 可用 |
| 多图融合 | 可用 |
| 本地图片上传 | 可用 |
| base64 上下文隔离 | 脚本侧可用，仍需验证宿主行为 |
| 模型深度适配 | 3 个 |
| 其他文档模型 | 主要透传 |
| 本地落盘 | 未实现 |
| 智能选模 | 未实现 |
| 成本/耗时统计 | 未实现 |
| Claude Code / Codex | 标准结构可用 |
| TRAE / Cherry Studio / WorkBuddy | 待真机认证 |

## 4. v0.3 改进重点

### 4.1 缓存命中

目标：减少重复上传和重复下载，不默认缓存生图结果。

| 缓存 | 方案 | 约束 |
| --- | --- | --- |
| 上传缓存 | 本地图片按 SHA256 缓存上传 URL | 文件变化或 URL 过期后重新上传 |
| 下载缓存 | 同一图片 URL 已下载且校验通过时复用本地文件 | 校验文件签名，不只看后缀 |
| 能力缓存 | 模型能力注册表随 Skill 发布 | 不运行时拉取模型列表 |
| 结果缓存 | 暂不默认启用 | 避免静默跳过付费生图请求 |

JSON 增加：

```json
{
  "cache": {
    "upload_cache_hit": true,
    "download_cache_hit": false,
    "result_cache_hit": false
  }
}
```

安全要求：缓存不包含 API key、Authorization header、base64、完整 prompt。

### 4.2 不同工具的使用

目标：建立宿主兼容矩阵。

| 维度 | 验证内容 |
| --- | --- |
| 安装 | 用户级、项目级、ZIP 导入、市场安装 |
| 触发 | `/nonelinear-image`、`$nonelinear-image` 或宿主入口 |
| 密钥 | 是否继承 `NONELINEAR_API_KEY` 或兼容变量 |
| 脚本 | 是否允许执行 Node.js |
| 本地文件 | 是否把路径交给脚本，而不是读入上下文 |
| 网络 | 是否能访问 `api.nonelinear.com`、`nonelinear.com` |
| 输出 | URL、本地路径、错误 JSON 是否展示正常 |

v0.3 验收：

- Claude Code：macOS、Linux、Windows。
- Codex：macOS、Linux、Windows。
- TRAE、Cherry Studio、WorkBuddy：至少验证两个。

原则：一份核心 Skill，多平台薄适配文档，不复制脚本。

### 4.3 支持的模型

v0.3 使用 `candidate`、`passthrough`、`implemented`、`live_verified`、`host_verified` 的单字段分级。
v0.4 将其迁移为正交结构，避免把适配程度和验证环境混为同一等级：

| 字段 | 取值或结构 | 含义 |
| --- | --- | --- |
| `lifecycle` | `active`, `retired` | 模型是否允许继续调用 |
| `support.integration` | `candidate`, `passthrough`, `implemented` | 参数映射、限制和错误处理程度 |
| `support.live_verification` | 验证状态与日期 | 真实 API 请求验证 |
| `support.host_verifications` | 宿主、OS、版本、日期数组 | 真实 Agent 端到端验证 |

v0.3 优先级：

- 复核 `gemini-2.5-flash-image`、`gpt-image-2`、`doubao-seedream-5-0-pro-260628`。
- 优先补齐 `gemini-3.1-flash-image-preview`、`gemini-3-pro-image-preview`。
- 梳理 Qwen、Imagen、GLM 等文档明确模型。
- 未真实联调的模型不进入默认推荐。

每个模型记录：支持模式、参数、参考图数量、超时、空图行为、最近验证时间。

### 4.4 生图模式

| 模式 | 用途 | 规则 |
| --- | --- | --- |
| `generate` | 文生图 | 不接受参考图 |
| `edit` | 单图编辑 | 默认一张参考图 |
| `fuse` | 多图融合 | 保留参考图顺序；`fusion` 只作为输入兼容别名 |
| `variation` | 参考图变体 | 作为 `edit` 场景支持，不承诺像素级一致 |

后续预设：商品图、海报、社媒配图、Logo、UI 信息图、人像写真。

预设只能补齐 prompt 和参数建议，不能绕过模型能力校验。

### 4.5 结果交付

v0.3 增加：

- `output_dir` 下载。
- 文件名防覆盖。
- 文件签名校验。
- URL 和本地路径同时返回。
- 脱敏 metadata。

metadata 记录：模型、模式、尺寸、质量、耗时、request ID、生成时间。

metadata 不记录：API key、Authorization header、base64、完整请求头。

### 4.6 安全与费用

要求：

- 固定请求域名。
- 不读取 `.env`、cc-switch 数据库或宿主配置文件。
- 只读取进程环境变量。
- 不输出密钥、请求头、base64。
- 不默认上传 prompt 和本地路径到遥测。
- 超时和下载失败不自动重新生成。

需确认后执行：规范化后的 `effective_n > 1`、多模型现场调用、批量任务、passthrough 模型调用、自动重试。
读取历史快照进行多模型比较属于只读操作，不需要付费确认。

## 5. 版本路线图

### v0.3  2026.8 中旬

主题：客户可交付。

范围：

- 模型能力注册表和支持分级。
- 上传缓存、下载缓存、能力缓存。
- 生图模式标准化。
- 本地落盘和文件校验。
- JSON 增加 `elapsed_ms`、`output_files`、`parameters`、`cache`、注册表版本。
- 复核 3 个完整支持模型。
- 补齐 Gemini 3.1、Gemini 3 Pro 等候选模型。
- Claude Code、Codex 三系统端到端验证。
- TRAE、Cherry Studio、WorkBuddy 至少验证两个。
- 受控真实 API smoke test。

验收：

- `live_verified` 模型有脱敏联调记录。
- 生成、编辑、融合均有成功和失败用例。
- 无效参数本地拦截，不产生付费请求。
- 重复本地参考图命中上传缓存。
- 修改本地参考图后不复用旧 URL。
- 公开模型都有状态标记。
- 安装包不含 `.env`、API key、测试产物和技术文档仓库内容。
- stdout 始终是小型 JSON。
- base64 不进入上下文。

### v0.4  2026.9

主题：辅助选模。

范围：

- 接入版本化模型画像。
- 支持成本、速度、尺寸口径和技术可用性偏好。
- 质量、文字准确等偏好等待人工评分、OCR 或结构化评测方法成熟后进入后续版本。
- 返回推荐模型、备选模型、理由、数据版本和不确定性。
- 历史快照支持只读多模型比较；现场多模型调用前确认请求数和最大输出数。
- 记录技术成功率、无图片率、耗时、下载成功率。
- 评估是否调整默认模型。

验收：

- 先按能力过滤，再推荐。
- 用户指定模型时不静默替换。
- 推荐结果可解释、可复现。
- 多模型模式不会未确认就发起付费请求。

### v0.5  2026.10

主题：真实图片工作流。

范围：连续编辑链路、场景预设、一致性工作流、批量变体、输出目录、命名规则、badcase 分类、反馈回流评测集。

### v1.0  2026 Q4

主题：稳定发布。

范围：稳定契约、语义化版本、正式兼容矩阵、平台市场发布、自动化 Release、校验和、签名、模型上下线流程、安全审计。

## 6. 产品指标

北极星指标：

- 有效任务完成率：一次已授权图片任务后，用户获得至少一张可用图片的比例。

核心指标：

- Skill 识别率
- 安装成功率
- 技术成功率
- 无图片率
- 本地落盘成功率
- 首图可用率
- 生成耗时 P50 / P90 / P95
- 单张返回图片成本
- 人工可用图片成本（仅在存在质量标注时）
- 参数前置拦截率
- 宿主兼容率
- 密钥、请求头、base64 泄露事件数

安全目标：泄露事件数为 0。

## 7. 测试与发布

测试：

1. 参数与安全单元测试。
2. HTTP mock 契约测试。
3. 文档一致性测试。
4. 受控真实 API 测试。
5. Agent 真机测试。

发布记录保留：Skill 版本、模型 ID、模式、非敏感参数、测试时间、HTTP 状态、错误码、是否返回 URL、耗时、文件格式、request ID、宿主信息。

发布记录不保留：API key、Authorization header、图片 base64、未经允许的用户 prompt、未经允许的本地路径。

## 8. 与生图评测协同

- 技术文档定义可调用能力。
- 真实联调验证接口可用性。
- 生图评测提供选模证据。
- Skill 将证据转成执行决策。
- 评测更新后，先更新模型画像和候选清单。
- 文档和真实联调均通过后，提升模型支持等级。
- Skill 回传技术成功率、空图率、耗时、参数错误和 badcase。
- 默认模型变化必须经过回归、成本评估和版本发布。
- 每个 Release 固定引用评测集版本、能力注册表版本和最近验证日期。
