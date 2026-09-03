# NoneLinear Image Skill 优化实施计划（Ponytail 版）

> 目标：先补齐 `gpt-image-2` 透明图和 WorkBuddy 获客案例，再把现有文生图、图生图参数与价格实测数据以最小可维护方式接入 Skill。

## 1. 当前结论

### 1.1 透明图还不能通过 Skill 正确调用

NoneLinear 图像 API 已支持 `gpt-image-2` 的以下请求：

```json
{
  "background": "transparent",
  "output_format": "png"
}
```

但当前 `nonelinear-image` Skill：

- 没有 `--background` 参数。
- `gpt-image-2` 的能力注册表没有 `background` 和 `output_format`。
- `--output-format` 当前只允许 Seedream 5 Pro 使用。
- 因此 Agent 即使理解了“生成透明图”，也无法通过内置脚本发出已经实测通过的请求。

这部分应优先修复，改动小，且可以直接支撑 WorkBuddy 文章案例。

### 1.2 现有评测数据可以接入，但不能直接当长期价格或能力声明

当前数据已经足够回答以下问题：

- 哪个模型用 `size`，哪个模型用 `aspect_ratio`。
- 文生图和图生图分别使用了什么参数。
- 本轮实际输出尺寸、耗时和费用是多少。
- 哪些配置请求成功，哪些配置失败或没有拿到图片。

这些数据不能直接证明画质排名、稳定成功率或长期固定价格。Skill 对外必须使用“本轮实测”“数据日期”“单次样本”等措辞。

### 1.3 WorkBuddy 需要先做真机闭环

仓库当前只把 WorkBuddy 标记为实验性宿主。文章可以规划 WorkBuddy 案例，但发布前必须确认：

1. WorkBuddy 能导入并启用 ZIP Skill。
2. WorkBuddy 能执行 Node.js 子进程。
3. Skill 子进程能获得 NoneLinear API Key。
4. WorkBuddy 能展示脚本返回的图片 URL。
5. 实际生成的 PNG 含透明像素。

未完成以上验证前，不在公众号文章里写“直接可用”。

## 2. 最小架构

保留三层概念，但第一版不实现完整框架：

| 层 | 文件 | 用途 |
| --- | --- | --- |
| 能力事实 | `references/model-capabilities.json` | 判断模型、operation 和参数是否合法 |
| 实测快照 | `references/model-benchmark-snapshot.json` | 保存本轮尺寸、耗时、价格和结果状态 |
| 决策规则 | `SKILL.md` | 规定何时读取快照、如何比较、何时允许执行 |

第一版明确不做：

- 不新增第三方依赖。
- 不把六张表格 PNG、完整 Prompt、原始响应或请求 ID 打进 Skill。
- 不同时维护行为快照和价格快照两份重复记录。
- 不实现 RFC 8785、多个内容哈希和三套 JSON Schema。
- 不实现自动重试、批量多模型实测或质量排名。
- 不重写现有状态字段和整个能力注册表。
- 不读取 WorkBuddy、Claude Code、Codex 或 cc-switch 的本地配置文件。

只有在快照需要由多套数据源长期自动合并，或推荐结果需要跨版本审计时，再增加独立价格快照、正式 Schema 和稳定哈希。

## 3. 实施顺序

### Task 1：固定当前基线

#### 操作

在 `nonelinear-skills` 目录运行：

```bash
npm test
npm run validate
```

当前仓库已有未提交修改。实施时保留这些修改，不重置、不覆盖；先记录失败测试，再判断是否与本次任务相关。

#### 完成标准

- 已记录现有测试和发布校验状态。
- 后续每个任务只修改列出的文件。

### Task 2：给 `gpt-image-2` 增加透明图参数

#### 先写测试

修改：

```text
tests/nonelinear-image-script.test.mjs
```

增加四个最小测试：

1. `gpt-image-2` 接受 `--background transparent --output-format png`。
2. 请求体顶层包含 `background` 和 `output_format`。
3. 其他模型传 `--background` 时在本地拒绝，不产生网络请求。
4. `background=transparent` 与不支持透明通道的输出格式组合在本地拒绝。

#### 最小实现

修改：

```text
skills/nonelinear-image/scripts/generate-image.mjs
skills/nonelinear-image/references/model-capabilities.json
skills/nonelinear-image/references/models.md
skills/nonelinear-image/references/image-api.md
skills/nonelinear-image/SKILL.md
```

实现内容：

- 新增 `--background <auto|opaque|transparent>`。
- 将 `background` 原样发送到请求体顶层。
- 给 `gpt-image-2` 登记 `background` 和 `output_format`。
- 透明图示例固定使用 `output_format=png`。
- 当用户要求透明图时，Skill 选择 `gpt-image-2`，并在 Prompt 中明确“透明背景”，排除地面、投影和场景。
- 第一版只把透明背景作为 `generate` 的已验证能力；编辑和融合需要单独实测后再开放。

推荐脚本调用：

```bash
node "<skill-directory>/scripts/generate-image.mjs" \
  --model "gpt-image-2" \
  --prompt "一瓶高端植物精华液概念瓶，主体完整，透明背景，不要场景、地面、底座和投影" \
  --size "1024x1024" \
  --quality "high" \
  --background "transparent" \
  --output-format "png"
```

#### 验证

```bash
npm test
npm run validate
```

再执行一次受控真实请求，确认：

- HTTP 请求成功。
- 返回 URL。
- 下载文件为 PNG。
- 文件含 Alpha 通道和实际透明像素。
- stdout 不包含 API Key、Authorization、base64 或完整 Prompt。

### Task 3：完成 WorkBuddy 真机验证

#### 测试准备

1. 打包当前 Skill ZIP。
2. 在 WorkBuddy 的 Skills 管理页导入并启用。
3. 确认 WorkBuddy 使用的 Agent 可以运行 `node --version`，版本不低于 18。
4. 优先验证 WorkBuddy 是否把 NoneLinear 模型配置对应的环境变量传给 Skill 子进程。
5. 若返回 `missing_api_key`，只使用系统环境变量 `NONELINEAR_API_KEY` 作为备用方案，并重启 WorkBuddy。

不新增“读取 WorkBuddy 配置文件”的逻辑。该方案会耦合客户端私有格式，也扩大密钥读取范围。

#### 测试用例

在 WorkBuddy 中输入：

```text
请使用 nonelinear-image Skill，调用 gpt-image-2 生成一张 1024x1024、high 质量的透明背景 PNG：一瓶高端植物精华液概念瓶，磨砂玻璃瓶身，浅绿色精华液，银色滴管盖，瓶身没有文字和品牌标识。不要人物、包装、场景、地面、底座、投影和额外物体。
```

#### 验收证据

- WorkBuddy 显示 Skill 被实际调用，而非只返回一段建议或 cURL。
- 实际请求模型为 `gpt-image-2`。
- 实际参数包含 `background=transparent` 和 `output_format=png`。
- 返回图片可打开，且在深色、浅色背景上都能透出底色。
- 记录 WorkBuddy 版本、操作系统、密钥注入方式和脱敏错误码。

### Task 4：把 WorkBuddy 案例加入公众号文章

目标文件：

```text
articles/gpt-image-2-transparent/wechat-article-optimized.md
```

建议插入在“透明母图最适合用在哪？”之后、“复制这行请求直接体验”之前。

建议标题：

```text
## 不写 cURL，在 WorkBuddy 里直接说一句
```

正文只保留四项：

1. 下载并导入 `nonelinear-image` Skill。
2. 在 WorkBuddy 中启用 Skill。
3. 输入 Task 3 的自然语言测试指令。
4. 展示真实调用过程和透明 PNG 结果。

文章中提供两个转化入口：

- NoneLinear API Key 页面。
- `nonelinear-image` Skill 下载页或技术文档。

详细安装、Node.js 和环境变量排障放在技术文档，不全部复制进公众号正文。

同步更新：

```text
skills/nonelinear-image.mdx
scenes/productivity-tools/workbuddy.mdx
```

公众号截图必须来自 Task 3 的真实 WorkBuddy 测试，不能使用命令行结果冒充 WorkBuddy 调用。

### Task 5：生成轻量实测快照

#### 数据来源

文生图：

```text
../outputs/image-price-benchmark/t2i_20260811_122729/normalized-price-matrix.csv
```

图生图：

```text
../outputs/image-price-benchmark/i2i_20260813_185725/normalized-i2i-price-matrix.csv
```

`i2i-parameter-catalog.csv` 只用于人工核对能力注册表，不重复打包进运行时快照。六张表格 PNG 继续作为文章素材，不进入 Skill 包。

#### 构建工具

新增：

```text
tools/build-image-benchmark-snapshot.mjs
```

工具使用 Node.js 标准库读取两个 CSV，通过命令行参数接收源文件路径，不把本机绝对路径写进输出。

输出：

```text
skills/nonelinear-image/references/model-benchmark-snapshot.json
```

最小数据结构：

```json
{
  "schema_version": "1",
  "data_version": "2026-08",
  "currency": "CNY",
  "records": [
    {
      "operation": "generate",
      "comparison_group": "固定 1024×1024 size 参数",
      "provider": "OpenAI",
      "model_id": "gpt-image-2",
      "configuration_label": "gpt-image-2-low",
      "request_size": "1024x1024",
      "request_aspect_ratio": null,
      "actual_size": "1024×1024",
      "elapsed_seconds": "18.235",
      "cost_rmb": "0.044296",
      "cost_source": "API usage",
      "http_status": 200,
      "observation": "single_benchmark_run"
    }
  ]
}
```

金额和耗时以十进制字符串保存，避免二进制浮点累计。第一版不做聚合计算，直接保留已审核总表的一行一配置。

#### 构建测试

新增：

```text
tests/image-benchmark-snapshot.test.mjs
```

测试内容：

1. 能解析 UTF-8 BOM、引号、逗号和空字段。
2. 相同输入产生完全相同的 JSON。
3. 文生图映射为 `generate`，图生图映射为 `edit`。
4. 已知的 `gpt-image-2-low` 文生图和图生图记录映射正确。
5. 输出不包含 Prompt、参考图 URL、请求 ID、API Key、base64 和本机绝对路径。
6. 发布包包含快照，但不包含源 CSV、表格 PNG 和原始结果。

### Task 6：让 Skill 正确使用实测数据

修改：

```text
skills/nonelinear-image/SKILL.md
skills/nonelinear-image/references/models.md
```

增加以下规则：

- 用户只问参数、价格、速度或模型比较时，读取快照，不调用生图 API。
- 只比较相同 `operation` 和 `comparison_group` 的记录。
- 每次引用价格或耗时，都带上数据版本和“本轮实测”说明。
- `configuration_label` 不能当成真实模型 ID。例如 `gpt-image-2-low` 应执行为 `model=gpt-image-2, quality=low`。
- 快照中出现过的模型不等于 Skill 已完成执行适配；执行仍以 `model-capabilities.json` 为准。
- 价格为 0 只表示本次账单记录为 0，不宣称长期免费。
- 用户指定模型时不静默换模。
- 用户没有指定模型且要求“最便宜”或“最快”时，第一版只给出候选与依据，不自动发起付费请求。

这里不新增推荐器脚本。Agent 读取几十条结构化记录已经足够；出现跨版本排序、复杂筛选或宿主结果不一致后，再增加 `recommend-image-config.mjs`。

### Task 7：逐步补齐可执行模型，不批量放开

评测成功只能证明某次请求曾经返回图片，不能替代正式能力定义。

按以下顺序逐批更新 `model-capabilities.json`：

1. 现有深度适配模型。
2. 文生图和图生图都成功、且 `api/images.mdx` 参数明确的模型。
3. 只有单一 operation 成功的模型。
4. 文档未收录或本轮失败的模型保持查询可见、执行禁用。

每增加一个模型，只添加该模型真实支持的 operation、参考图字段、数量限制和参数取值，并至少留下一个请求体映射测试。不要用供应商 family 规则猜测具体模型能力。

### Task 8：发布校验

运行：

```bash
npm test
npm run validate
npm run pack
```

检查发布包：

- 包含 `SKILL.md`、脚本、能力注册表和轻量快照。
- 不包含 `.env`、API Key、Authorization、base64、原始评测图片、原始响应、完整 Prompt 和本机绝对路径。
- ZIP 可在 WorkBuddy 中重新导入。
- Claude Code 和 Codex 原有文生图、单图编辑、多图融合流程不回归。

## 4. 最终验收标准

### 透明图

- Agent 能把“生成透明图”转换为 `gpt-image-2 + background=transparent + output_format=png`。
- 参数和 Prompt 同时明确透明背景。
- 实际输出包含透明像素。
- 其他模型不会误收 `background` 参数。

### 参数与价格

- Skill 可以回答文生图、图生图的参数、实测尺寸、耗时和价格。
- 回答能区分真实模型 ID 和评测配置名。
- 比较不会跨 operation 或跨尺寸口径。
- 查询不会触发付费请求。
- 历史价格不会被描述成实时固定价格。

### WorkBuddy 与文章

- WorkBuddy 完成一次真实透明图调用。
- 公众号文章使用真实 WorkBuddy 截图和真实生成结果。
- 用户可以从文章进入 API Key 获取页和 Skill 下载页。
- WorkBuddy 不继承凭据时，文档明确提供 `NONELINEAR_API_KEY` 备用配置，不宣称自动复用一定成功。

## 5. 建议发布拆分

建议分两次交付：

1. **透明图小版本**：Task 1-4。先完成 `gpt-image-2` 透明图、WorkBuddy 真机验证和公众号转化案例。
2. **数据能力版本**：Task 5-8。再加入轻量快照、只读比较规则和模型能力增量补齐。

这样可以先交付直接产生用户价值的透明图能力，也避免为了完整三层架构延迟 WorkBuddy 案例上线。
