# nonelinear-image v0.3.0 迭代记录与复盘

> 基线版本：v0.2.0（2026-07-29）
> 当前版本：v0.3.0
> 版本记录日期：2026-08-06
> 复盘日期：2026-08-28
> 周期说明：以 v0.2.0 日期和 v0.3.0 Changelog 日期推定为 2026-07-30～2026-08-06；仓库没有单独的工时或周报记录。
> 当前状态：代码、测试和本地候选包已完成；尚未完成 v0.3.0 commit、tag 和对外 Release，因此不能视为正式发布闭环。

## 一、目标管理总表

| 周期 | 目标 | 行动项 | 效果追踪 | 目标完成度 | 问题复盘 | 下阶段计划 |
| --- | --- | --- | --- | --- | --- | --- |
| 7/30～8/6 | 将模型适配从散落在脚本和文档中的规则，升级为版本化模型能力注册表。<br><br>【子目标 1】统一模型 ID、状态、operation、参考图数量、参数值和超时。<br>【子目标 2】脚本按注册表执行参数校验和候选模型拦截。<br>【子目标 3】补齐测试、发布校验和 v0.3.0 安装包。 | 1. 新增 `model-capabilities.json`。<br>2. 将默认模型、接口、上传后缀、operation、参考图数量、参数、超时和本地文件大小限制接入注册表。<br>3. 对 `candidate` 模型返回 `not_implemented`。<br>4. 更新 Skill、模型说明、API 说明、README 和 Changelog。<br>5. 新增 3 个注册表相关测试。<br>6. 更新打包及发布校验脚本，产出 ZIP、TGZ 和 SHA256。 | 1. 测试：37/37 通过，较 v0.2 增加 3 个测试。<br>2. 发布校验：27 个仓库文件通过，无阻止发布的路径或疑似凭据。<br>3. 注册表：12 个精确模型、12 个模型 family。<br>4. 状态分布：1 个 `host_verified`、2 个 `implemented`、8 个 `passthrough`、1 个 `candidate`。<br>5. 候选包：ZIP 20 KB、TGZ 17 KB，SHA256 与清单一致；包内 6 个文件与当前 Skill 源文件一致。<br>6. 真实 API：本轮自动化测试全部为 mock，没有形成完整真实联调矩阵。 | 按 8 项版本闭环检查：5/8，62.5%。<br><br>开发与质量门禁 4/4：完成。<br>候选包 1/1：完成。<br>commit、v0.3.0 tag、对外 Release 0/3：未完成。 | 1. Changelog 已写 v0.3.0，但 Git 当前只有 v0.2.0 tag，版本状态容易被误判为已正式发布。<br>2. 原产品规划中的缓存、输出落盘、耗时 metadata、宿主认证等范围未在 v0.3.0 中完成，存在范围收缩但缺少正式决策记录的问题。<br>3. 状态字段把适配程度、API 验证和宿主验证混在一个枚举中。<br>4. passthrough/family 的校验仍偏宽松。<br>5. 图生图统一发送 `image`，不能覆盖 `image_ref` 等模型差异。<br>6. 本地图片类型仍按后缀判断。<br>7. 输出数量授权、URL 校验、上游错误脱敏仍需完善。 | 1. 先完成 v0.3.0 发布闭环：冻结源文件、确认 clean build、commit、tag、Release 和外部链接。<br>2. 启动 v0.4 阶段零：正式 JSON Schema、per-operation 映射、`effective_n` 和执行授权计划。<br>3. 修复图生图字段、图片格式识别、输出 URL 和错误脱敏。<br>4. 再生成行为/价格快照，最后开发只读推荐器。 |

## 二、本版本目标

### 2.1 核心目标

建立一份可版本化、可由脚本读取的模型能力注册表，让模型适配从“文档描述 + 代码硬编码”转向
“注册表定义 + 脚本执行校验”。

### 2.2 子目标

1. 集中管理模型身份和能力信息。
2. 让脚本依据注册表校验 operation、参考图数量和模型参数。
3. 阻止未接入的 candidate 模型产生付费请求。
4. 让 Skill 文档、测试、发布校验和安装包与版本号一致。
5. 为后续模型画像、评测快照和辅助选模提供数据基础。

### 2.3 本版本明确没有完成的范围

以下内容在产品规划中出现过，但没有进入 v0.3.0 的实际 Changelog 范围：

- 上传缓存和下载缓存。
- 输出图片自动下载和本地落盘。
- 输出文件签名检测和实际图片尺寸 metadata。
- `elapsed_ms`、`parameters`、`cache` 等扩展结果字段。
- Claude Code、Codex 之外宿主的完整真机认证。
- 批量真实 API smoke test 和完整 live verification 矩阵。
- 智能选模、价格快照和质量画像。

这部分不能计入 v0.3.0 已完成功能，应进入后续版本重新排期。

## 三、版本内容

### 3.1 模型能力注册表

新增：

```text
skills/nonelinear-image/references/model-capabilities.json
```

集中记录：

- 注册表版本和默认模型。
- 固定图片生成接口与本地上传接口。
- 本地图片允许后缀。
- 模型 ID、厂商和支持状态。
- `generate`、`edit`、`fuse` operation。
- 参考图最小值、最大值和输入限制。
- `aspect_ratio`、`size`、`quality`、`n` 等参数范围。
- 模型请求超时、已知错误和响应格式行为。
- candidate、passthrough、implemented、live_verified、host_verified 状态说明。

当前精确登记 12 个模型：

| 状态 | 数量 | 模型 |
| --- | ---: | --- |
| `host_verified` | 1 | `gemini-2.5-flash-image` |
| `implemented` | 2 | `gpt-image-2`、`doubao-seedream-5-0-pro-260628` |
| `passthrough` | 8 | Gemini 3.1/3 Pro、Seedream 4/4.5/Lite、Imagen 4 三个配置 |
| `candidate` | 1 | `qwen-mt-image` |

另外登记 12 个模型 family，覆盖 Zhipu、Qwen、Wan、Flux、Luma、MiniMax、Vidu 等文档模型的
基础 operation 和透传状态。

### 3.2 脚本注册表驱动

`generate-image.mjs` 不再分别硬编码全部模型信息，改为从注册表读取：

- 默认模型。
- 图片生成及上传接口。
- 本地文件允许后缀。
- 模型 operation。
- 参数值和自定义约束。
- 参考图数量。
- 请求超时时间。
- 本地图片大小限制。
- candidate 模型拦截。

保留的模型专项逻辑：

- `gpt-image-2` 自定义像素尺寸约束。
- Seedream 5 Pro 专属参数和输入限制。
- Gemini 空图片及纯文本结果处理。
- base64-only 响应阻止。

### 3.3 文档同步

已同步更新：

- `SKILL.md`：版本、工作流和模型注册表读取规则。
- `references/models.md`：状态等级、深度适配模型及主要参数。
- `references/image-api.md`：注册表职责和候选模型错误码。
- `README.md`：v0.3.0 下载、能力、平台兼容性和注册表说明。
- `CHANGELOG.md`：记录 v0.3.0 变更。

### 3.4 测试与发布校验

测试由 v0.2.0 的 34 个增加到 37 个，新增：

1. 加载并核对版本化模型能力注册表。
2. 使用注册表约束 Gemini 图片模型。
3. 使用注册表处理 candidate 和仅文生图模型。

发布校验新增：

- `model-capabilities.json` 必须存在。
- 注册表版本必须是 `0.3.0`。
- 默认模型必须是 `gemini-2.5-flash-image`。
- 精确模型数量不能少于 10。
- Skill、package 和注册表版本必须一致。

### 3.5 打包交付

打包脚本由 `git archive HEAD` 改为复制当前 `skills/nonelinear-image` 源目录后生成 ZIP 和 TGZ，确保
候选包包含本轮新增的能力注册表。

当前产物：

| 产物 | 大小 | SHA256 |
| --- | ---: | --- |
| `nonelinear-image-0.3.0.zip` | 20 KB | `e6febe0a028f885573a7d03e2b09e6eec4e94a6f250b25b0c27bcb5099ce60c9` |
| `nonelinear-image-0.3.0.tgz` | 17 KB | `65ef664fe9839ddebaa39f55aa392832f53c86ee01313c3b9222c23cea21488f` |

候选包内含 6 个实际文件，总未压缩大小约 65 KB；文件内容与当前 Skill 源目录一致。

## 四、解决的问题

### 4.1 模型能力缺少统一来源

此前模型 ID、参数和限制分散在脚本及说明文档中，新增模型时容易漏改。v0.3.0 建立注册表后，
脚本和文档可以围绕同一个版本化数据源工作。

### 4.2 无法明确区分接入状态

新增 candidate、passthrough、implemented、live_verified、host_verified 状态，能够区分：

- 只在文档中出现。
- 可以透传但校验不完整。
- 已有模型专项适配。
- 已通过真实 API 或宿主验证。

该状态模型仍不够完善，但比“所有模型都视为同等支持”更可控。

### 4.3 candidate 模型可能被错误调用

对精确登记为 candidate 的模型，脚本在本地返回 `not_implemented`，不向图片 API 发送请求，降低
无效付费调用风险。

### 4.4 模型参数校验容易漂移

默认模型、operation、参考图数量、参数取值和请求超时改为由注册表提供，减少脚本、Skill 和 API
说明之间的不一致。

### 4.5 候选包缺少本轮新增文件

原打包方式只归档 Git HEAD，无法包含尚未提交的新增注册表。新打包方式可以从当前源目录生成完整候选包。
但正式 Release 仍必须以干净、已提交的版本为基础，不能长期依赖脏工作区打包。

## 五、效果追踪

### 5.1 自动化结果

| 指标 | v0.2.0 | v0.3.0 当前结果 | 变化 |
| --- | ---: | ---: | ---: |
| 自动化测试 | 34 | 37 | +3 |
| 测试通过 | 34 | 37 | +3 |
| 测试失败 | 0 | 0 | 0 |
| 精确模型注册数 | 无统一统计 | 12 | 新增 |
| 模型 family 数 | 无统一统计 | 12 | 新增 |
| 发布校验文件数 | 未复测 | 27 | 当前通过 |

本次复盘实测结果：

```text
tests: 37
pass: 37
fail: 0
release validation: passed
blocked paths or suspected credentials: 0
```

### 5.2 交付结果

- ZIP、TGZ 和 SHA256SUMS 已生成。
- SHA256SUMS 与候选包重新计算结果一致。
- ZIP 内 6 个实际文件与当前 Skill 源文件哈希一致。
- 候选包只包含 `SKILL.md`、`agents`、`references` 和 `scripts`。

### 5.3 尚不能证明的效果

由于测试全部使用 mock，本轮数据不能证明：

- 12 个精确模型都能通过真实 API 出图。
- passthrough 模型的所有参数都能正确生效。
- Claude Code、Codex、TRAE、Cherry Studio、WorkBuddy 均能端到端运行。
- 不同模型的实际费用、耗时、输出尺寸和质量表现。
- v0.3.0 已被外部用户安装或使用。

这些项目需要真实联调、宿主认证、发布数据和用户反馈继续追踪。

## 六、目标完成度

### 6.1 计算口径

采用可核验的 8 项闭环检查，不按主观感受打分：

| 检查项 | 状态 | 证据 |
| --- | --- | --- |
| 版本化能力注册表 | 完成 | 注册表版本 0.3.0，12 个精确模型、12 个 family |
| 脚本接入注册表 | 完成 | 默认值、operation、参数、参考图、超时等已由注册表驱动 |
| 文档同步 | 完成 | Skill、README、模型/API 说明、Changelog 已更新 |
| 自动化与发布校验 | 完成 | 37/37 测试通过，27 个文件校验通过 |
| 候选包及校验和 | 完成 | ZIP、TGZ、SHA256SUMS 已生成并复核 |
| v0.3.0 commit | 未完成 | 当前 v0.3.0 变更仍在工作区 |
| v0.3.0 tag | 未完成 | 当前最新 tag 为 v0.2.0 |
| 对外 Release 与产出链接 | 未完成 | 仓库内只有本地 dist 产物，没有 v0.3.0 外部 Release 证据 |

完成度：`5 / 8 = 62.5%`。

其中：

- 开发与质量门禁：完成。
- 候选包：完成。
- 正式发布闭环：未完成。

## 七、问题复盘

### 7.1 版本状态和发布状态混淆

`package.json`、Skill、README 和 Changelog 已显示 0.3.0，dist 也已有 0.3.0 文件，但 Git 只有
v0.2.0 tag，且 v0.3.0 变更尚未提交。内部容易把“本地候选包完成”误认为“正式发布完成”。

改进：后续统一使用 `开发中 → 候选包 → 已提交 → 已打 tag → 已发布 → 已验证安装` 状态机。

### 7.2 规划范围与实际版本范围不一致

早期 v0.3 产品规划还包含缓存、本地落盘、宿主兼容矩阵、扩展 metadata 和真实 smoke test；实际
v0.3.0 Changelog 收敛为模型能力注册表。范围收缩本身合理，但缺少明确的范围变更记录。

改进：每次版本开始时冻结“必做、可选、延期”三类清单，范围变化写入迭代记录。

### 7.3 支持状态语义混合

当前 `status` 同时表达接入程度、真实 API 验证和宿主验证，无法表达“已实现但只在某个宿主验证”的情况。

改进：v0.4 拆为 lifecycle、integration、live verification 和 host verifications。

### 7.4 Passthrough 与 family 校验不充分

passthrough 和 family 可以减少接入成本，但当前部分能力属于通用推定，不等于完整的模型专项校验；未知模型
也可能绕过部分检查。

改进：自动推荐只使用已结构化适配并完成真实验证的模型；passthrough 只允许显式调用并额外确认。

### 7.5 图生图字段仍未模型化

当前所有参考图最终统一发送到 `body.image`，无法适配要求 `image_ref` 或其他字段的模型。

改进：v0.4 用 per-operation Schema 定义参考图字段、单值/数组形态和数量限制。

### 7.6 图片格式识别依赖后缀

上传 `type` 取自文件后缀。文件后缀与真实内容不一致时，可能导致上传或下游模型失败。

改进：根据文件签名字节识别真实格式，后缀只作为前置筛选。

### 7.7 付费输出数量缺少有效值校验

当前只检查显式 `n`，不能阻止服务商默认多图产生额外费用。

改进：规范化 `effective_n`，默认显式发送 `n=1`；多图、多模型、批量和重试按执行计划确认。

### 7.8 输出和错误边界仍需加固

成功图片 URL 主要按非空字符串判断；上游自由文本错误也可能包含 Prompt、URL 或其他请求信息。

改进：验证 HTTPS URL 和公共主机；默认只输出稳定错误码及本地固定文案。

### 7.9 自动化测试缺少真实联调证据

37 个测试验证了参数和安全契约，但全部为 mock，不能替代真实 API 和真实宿主验证。

改进：建立受控 smoke test，限定模型、请求数、预算、脱敏字段和失败停止条件。

## 八、下阶段计划

### P0：完成 v0.3.0 正式发布闭环

1. 冻结 v0.3.0 源文件，排除 v0.4 设计文档和后续代码混入候选包。
2. 确保工作区版本文件全部纳入 Git，并复跑测试与发布校验。
3. 从干净 commit 重新生成 ZIP、TGZ 和 SHA256SUMS。
4. 创建 v0.3.0 tag 和正式 Release。
5. 记录 Release URL、commit SHA、产物 SHA256 和安装验证结果。

验收：外部用户可以从固定链接下载，经 SHA256 校验后在至少一个正式宿主成功安装和调用。

### P0：v0.4 阶段零——Schema 和执行安全

1. 定稿能力、行为快照和价格快照 JSON Schema。
2. 将模型能力改为 per-operation 唯一执行事实源。
3. 拆分 lifecycle、integration、live verification 和 host verification。
4. 增加 `effective_n`、最大输出数和付费执行计划校验。
5. 修复 `image`/`image_ref`、文件签名、HTTPS URL 和上游错误脱敏。

验收：同一模型不会出现相互矛盾的 operation 约束；未授权多图和未完整校验的 passthrough 不会静默执行。

### P1：评测数据进入 Skill

1. 构建行为快照和价格快照。
2. 区分请求参数、实际输出尺寸、请求数、图片数和账单费用。
3. 使用确定性的 ID、Decimal 金额和比较组。
4. 先支持参数、成本、速度和尺寸风险查询。

验收：相同输入生成相同快照；不可比较的价格不会被强制排序。

### P2：只读辅助选模

1. 实现不访问生图 API 的推荐脚本。
2. 返回推荐、备选、理由、数据版本、`as_of` 和不确定性。
3. 用户指定模型时不静默替换。
4. 质量和文字准确偏好等待正式评分方法后再接入。

验收：查询和推荐不产生费用；相同数据版本、规则版本和 `as_of` 返回稳定结果。

## 九、产出

### 9.1 候选包

- [nonelinear-image-0.3.0.zip](/Users/weichen/Downloads/my-docs/nonelinear-skills/dist/nonelinear-image-0.3.0.zip)
- [nonelinear-image-0.3.0.tgz](/Users/weichen/Downloads/my-docs/nonelinear-skills/dist/nonelinear-image-0.3.0.tgz)
- [SHA256SUMS](/Users/weichen/Downloads/my-docs/nonelinear-skills/dist/SHA256SUMS)

### 9.2 配套文档

- [产品规划](/Users/weichen/Downloads/my-docs/nonelinear-skills/docs/nonelinear-image-product-plan.md)
- [三层架构设计](/Users/weichen/Downloads/my-docs/nonelinear-skills/docs/nonelinear-image-three-layer-architecture.md)

### 9.3 待补产出

- v0.3.0 commit SHA。
- v0.3.0 Git tag。
- v0.3.0 GitHub Release 或正式文档下载链接。
- 正式宿主安装验证记录。
