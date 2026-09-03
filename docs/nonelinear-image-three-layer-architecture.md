# NoneLinear Image 三层架构设计

> 状态：设计提案
> 目标版本：`nonelinear-image` v0.4
> 核心结构：能力事实（Capabilities）+ 评测快照（Benchmark Snapshots）+ 决策规则（Decision Rules）

## 目录

- [1. 背景](#1-背景)
- [2. 目标与非目标](#2-目标与非目标)
- [3. 总体架构](#3-总体架构)
- [4. 第一层：能力事实](#4-第一层能力事实)
- [5. 第二层：评测快照](#5-第二层评测快照)
- [6. 第三层：决策规则](#6-第三层决策规则)
- [7. 数据构建与发布](#7-数据构建与发布)
- [8. Skill 运行流程](#8-skill-运行流程)
- [9. 当前实现需要先修复的问题](#9-当前实现需要先修复的问题)
- [10. 分阶段落地](#10-分阶段落地)
- [11. 验收标准](#11-验收标准)
- [12. 目录规划](#12-目录规划)

## 1. 背景

当前 `nonelinear-image` 已具备文生图、单图编辑和多图融合能力，并通过
`model-capabilities.json` 记录部分模型的接口参数和支持状态。

现有文生图、图生图评测又积累了另一类信息：

- 不同模型使用 `size`、`aspect_ratio`、分辨率档位等不同尺寸控制方式。
- 请求参数和最终输出图片尺寸可能不一致。
- 文生图与图生图可能使用不同的参考图字段。
- 部分模型按张计费，部分模型按 Token 计费。
- 同一个模型在不同模式、参数和 Prompt 下的费用、耗时、出图情况不同。
- 个别模型存在空图、提示词敏感、参数不生效或接口字段特殊等现象。

这些评测结果不能直接写进 `SKILL.md`，也不能与接口文档事实混为一谈。合理的做法是把 Skill
升级为三层结构，让接口事实、实测证据和运行决策分别维护。

## 2. 目标与非目标

### 2.1 目标

1. 统一文生图、图生图和多图融合的模型参数差异。
2. 区分“文档明确支持”与“评测中实际观察到”。
3. 支持按模式、目标尺寸、预算和偏好筛选模型配置。
4. 提供可解释、可复现的推荐结果。
5. 保留价格、耗时、实际尺寸等数据的时间和样本范围。
6. 不因查询参数、价格或模型能力而触发付费请求。
7. 让评测数据通过构建脚本进入 Skill，避免人工复制统计表。

### 2.2 非目标

- 不把微信公众号文章、价格表 PNG、原始图片或完整评测目录打包进 Skill。
- 不把单次评测结果表述成长期价格、稳定成功率或普遍质量结论。
- 不在用户指定模型时静默替换成其他模型。
- 不在缺少质量评分时宣称某模型“画质最好”或“中文文字能力最好”。
- 不默认发起多模型比较、批量生成或失败自动重试。
- 不把请求 ID、API Key、完整本地路径、图片 Base64 等敏感数据写入发布快照。

## 3. 总体架构

```json
用户请求
   │
   ▼
意图解析：generate / edit / fuse
   │
   ▼
能力事实层：过滤不支持的模型和非法参数
   │
   ▼
评测快照层：补充价格、耗时、输出尺寸和已知风险
   │
   ▼
决策规则层：选择配置或生成解释性建议
   │
   ├── 只查询/比较：返回结果，不调用 API
   │
   └── 明确生成/编辑：执行一次已授权的付费请求
```

三层职责必须分开：

| 层级 | 回答的问题 | 数据性质 | 更新依据 |
| --- | --- | --- | --- |
| 能力事实 | “这个模型能不能这样调用？” | 接口契约 | `images.mdx`、真实接口验证 |
| 评测快照 | “实际调用时观察到了什么？” | 有时间范围的经验数据 | 评测 `results.json`、后台账单 |
| 决策规则 | “这次请求应该怎样选择和提醒？” | 可解释规则 | 用户意图、能力事实、评测快照 |

## 4. 第一层：能力事实

### 4.1 文件定位

继续使用：

```json
references/model-capabilities.json
```

它是模型 ID、支持模式、参数名称、参数取值、参考图限制和请求映射的唯一事实来源。

文件 envelope 至少包含 `schema_version`、`data_version`、`defaults`、`endpoints` 和 `models`；以下示例是
`models` 数组中的单个条目，不代表完整文件。

### 4.2 建议字段

为减少迁移成本，能力注册表继续使用 `models[].id` 作为主键。行为快照和价格快照中的
`model_id` 是指向该 `id` 的外键；不得再定义另一套模型主键。

每个 operation 的定义是执行时的唯一事实源。模型是否支持某个 operation、参考图字段、字段形态、
参考图数量和可用参数都从 `operations` 派生，不再同时人工维护 `supported_operations`、模型级
`reference_images` 等重复字段。

```json
{
  "id": "example-model",
  "display_name": "Example Model",
  "vendor": "Example Provider",
  "lifecycle": "active",
  "support": {
    "integration": "implemented",
    "live_verification": {
      "verified": true,
      "verified_at": "2026-08-18"
    },
    "host_verifications": [
      {
        "host": "codex",
        "os": "macos",
        "host_version": "unknown",
        "verified_at": "2026-08-18"
      }
    ]
  },
  "operations": {
    "generate": {
      "endpoint": "image_generation",
      "reference": null,
      "allowed_parameters": ["aspect_ratio", "response_format"],
      "request_timeout_ms": 300000
    },
    "edit": {
      "endpoint": "image_generation",
      "reference": {
        "request_field": "image_ref",
        "value_shape": "single_url",
        "min_items": 1,
        "max_items": 1
      },
      "input_image_limits_ref": "default",
      "allowed_parameters": ["aspect_ratio", "response_format"],
      "request_timeout_ms": 300000
    }
  },
  "input_image_limits": {
    "default": {
      "source": "provider_validated"
    }
  },
  "parameters": {
    "aspect_ratio": {
      "allowed": ["1:1", "16:9"]
    },
    "response_format": {
      "allowed": ["url"],
      "default": "url"
    }
  },
  "last_document_reviewed_at": "2026-08-26"
}
```

以上示例仅描述 Schema 形状；具体模型是否使用独立的 generate/edit 模型 ID，必须以参数文档和真实
API 验证为准。例如，如果服务实际要求基础模型与 edit 模型分别调用，就应分别登记两个模型，
不得为了统一 operation 而虚构同一个模型支持两种模式。

### 4.3 模型身份与配置身份

必须区分：

- `id`：能力注册表中 API 使用的真实模型 ID，也是注册表主键。
- `model_id`：行为和价格快照中的外键，必须精确匹配能力注册表中的 `models[].id`。
- `display_name`：面向用户的展示名称。
- `configuration_label`：模型加参数形成的评测配置名称。

例如 Google 模型：

```json
{
  "id": "gemini-3.1-flash-image-preview",
  "display_name": "Nano Banana 2"
}
```

例如 GPT Image 2：

```json
{
  "model_id": "gpt-image-2",
  "configuration_label": "GPT Image 2 · High",
  "effective_request_params": {
    "quality": "high"
  }
}
```

不得把 `gpt-image-2-high` 当作真实模型 ID。

能力注册表必须通过正式 JSON Schema 校验。Schema 应定义文件 envelope、必填字段、null 语义、枚举、
`additionalProperties` 以及以下交叉约束：

- `operations.*.allowed_parameters` 中的名称必须存在于 `parameters`。
- operation 引用的 `input_image_limits_ref` 必须存在于 `input_image_limits`。
- operation 没有参考图时 `reference` 必须为 `null`。
- `single_url` 必须满足 `min_items=max_items=1`。
- `url_array` 必须有明确的 `min_items` 和 `max_items`。
- `lifecycle=retired` 的模型不得通过自动推荐准入检查。

### 4.4 请求尺寸控制类型

建议统一为以下枚举：

| 类型 | 含义 | 示例 |
| --- | --- | --- |
| `pixel_size` | API 接受明确像素尺寸参数，但不承诺返回像素一定一致 | `size=1024x1024` |
| `resolution_tier` | API 接受独立分辨率档位 | `size=1K` |
| `resolution_and_aspect_ratio` | 分辨率档位与宽高比共同控制 | `size=1K, aspect_ratio=1:1` |
| `aspect_ratio` | 只控制宽高比 | `aspect_ratio=1:1` |
| `provider_default` | 不传尺寸参数，由服务商决定 | 无 |
| `unknown` | 无法从结构化能力和有效请求确定 | 未完整适配的 passthrough 配置 |

`request_dimension_mode` 由 operation 的参数 Schema 和规范化后的实际参数值派生，而不是作为模型级常量。
因此，同一模型传 `size=1K` 时可以是 `resolution_tier`，传 `size=1024x1024` 时可以是
`pixel_size`。原始 API 参数名必须保留，不能为了展示统一而改写为“比例”“图片字段”等模糊名称。

### 4.5 生命周期、支持等级与推荐准入

`lifecycle` 与 `support` 是正交字段：

| 字段 | 枚举 | 含义 |
| --- | --- | --- |
| `lifecycle` | `active`, `retired` | 模型当前是否允许继续调用 |
| `support.integration` | `candidate`, `passthrough`, `implemented` | Skill 的参数映射与本地校验程度 |
| `support.live_verification` | 对象 | 是否完成真实 API 请求验证及日期 |
| `support.host_verifications` | 数组 | 各宿主、系统、版本和验证日期 |

当前注册表中的 `status` 在 v0.4 迁移为上述三个正交维度；注册表加载代码、校验逻辑和测试必须在同一
变更中更新。不得再通过字符串大小或隐含序关系判断支持程度。

自动推荐候选必须同时满足：

1. `lifecycle=active`。
2. `support.integration=implemented`。
3. `support.live_verification.verified=true`；作为默认模型时还应存在当前宿主或受支持宿主的验证记录。
4. 当前 operation、参数和参考图限制均有结构化能力描述。
5. 不依赖只有文字摘要、没有结构化约束的 family 级兜底规则。

`candidate` 不允许执行。`passthrough` 只允许用户显式指定；执行前必须明确告知缺少完整本地校验并取得
额外确认。未知模型默认拒绝，不进入自动推荐，也不以 family 摘要自动补出参考图数量或参数范围。

### 4.6 字段归属

| 信息 | 能力事实层 | 评测快照层 |
| --- | --- | --- |
| 文档规定的参数、限制、错误码 | 保存 | 不重复 |
| 文档明确说明可能空图 | 保存为 provider constraint | 可记录本轮实际空图次数 |
| 某次调用的 HTTP 错误或空图 | 不保存 | 保存结构化 observation code |
| 请求超时配置 | 保存 | 可保存实际耗时分布 |
| 模型适配/验证等级 | 保存 | 不用于代表质量高低 |
| 画质、文字准确、尺寸一致性 | 不保存 | 有相应评测方法后保存 |

当前注册表中的 `may_return_empty_image`、`known_errors` 需要逐项核对来源：文档或供应商契约明确的内容
保留在能力层；仅由本轮测试观察到的现象迁移到行为快照。

## 5. 第二层：评测快照

评测数据属于“实测证据”，不属于接口契约。建议拆为行为快照和价格快照。

### 5.1 行为快照

文件：

```json
references/model-benchmark-snapshot.json
```

快照文件使用统一 envelope，不能把示例单条对象直接当成完整文件：

```json
{
  "schema_version": "1.0.0",
  "data_version": "2026-08-18.1",
  "methodology_version": "1.0.0",
  "generated_at": "2026-08-19T00:00:00+08:00",
  "profiles": []
}
```

行为快照按评测套件、场景和配置分层聚合，不能只留下跨场景总中位数。使用三种不同 ID：

- `params_sha256`：只标识补齐默认值后的有效请求参数。
- `configuration_id`：标识 operation、模型、参考图数量、输入特征和有效请求参数构成的调用配置。
- `profile_id`：标识评测套件、方法、场景和 configuration 构成的本轮评测画像。

逻辑关系为：

```json
params_sha256 = SHA256(RFC 8785(effective_request_params))

configuration_identity = {
  "operation": operation,
  "model_id": model_id,
  "reference_count": reference_count,
  "input_profile": input_profile,
  "params_sha256": params_sha256
}
configuration_id = SHA256(RFC 8785(configuration_identity))

profile_identity = {
  "benchmark_suite_id": benchmark_suite_id,
  "methodology_version": methodology_version,
  "scenario_class": scenario_class,
  "configuration_id": configuration_id
}
profile_id = SHA256(RFC 8785(profile_identity))
```

`effective_request_params` 只能从 operation Schema 的参数允许列表重新构造，并补齐 Skill 安全默认值和已知
服务商默认值。不得通过从原始请求中删除敏感字段的 denylist 方式生成。Prompt、URL、路径和 Request ID
不在允许列表中，因此不会进入配置身份。

示例：

```json
{
  "profile_id": "sha256:example-profile-hash",
  "configuration_id": "sha256:example-configuration-hash",
  "params_sha256": "sha256:example-params-hash",
  "comparison_group_id": "t2i-square-1024-cost-v1",
  "benchmark_suite_id": "image-price-benchmark-2026-08",
  "methodology_version": "1.0.0",
  "scenario_class": "mixed_t2i_prompts",
  "operation": "generate",
  "model_id": "gpt-image-2",
  "configuration_label": "GPT Image 2 · High",
  "reference_count": 0,
  "prompt_count": 4,
  "input_profile": {},
  "effective_request_params": {
    "size": "1024x1024",
    "quality": "high",
    "n": 1
  },
  "request_dimension_mode": "pixel_size",
  "requested_size_class": "square_1024_pixel_request",
  "requests": {
    "attempted": 4,
    "http_succeeded": 4,
    "with_image": 4
  },
  "images": {
    "returned": 4,
    "measured": 4,
    "unmeasurable": 0
  },
  "observed_output_sizes": {
    "1024x1024": 4
  },
  "elapsed_seconds": {
    "scope": "generation_api_request",
    "min": 160.183,
    "median": 173.832,
    "max": 200.875
  },
  "observed_output_pixel_bands": {
    "square_1mp_to_lt_2mp": 4
  },
  "exact_size_match": {
    "unit": "image",
    "eligible_images": 4,
    "matched_images": 4,
    "rate": 1
  },
  "observation_codes": [],
  "observed_from": "2026-08-18",
  "observed_to": "2026-08-18",
  "confidence": "repeated"
}
```

### 5.2 请求参数与实际输出必须分开

以下字段不能互相覆盖：

- `effective_request_params`：补齐安全默认值后实际发送给 API 的有效参数。
- `observed_output_sizes`：下载图片后检测到的像素尺寸。
- `request_dimension_mode`：API 接受哪一种尺寸控制方式。
- `requested_size_class`：为可比性定义的请求口径。
- `observed_output_pixel_bands`：实际输出所属的像素和形状区间。
- `exact_size_match`：有明确像素请求时，以图片为单位计算的精确匹配数量和比例。

`requested_size_class` 使用以下正式枚举：

| 枚举 | 规则 |
| --- | --- |
| `square_1024_pixel_request` | 请求明确传入文档支持的 1024×1024 像素值 |
| `square_1k_tier_request` | 请求使用 1K 档位，并明确或默认采用 1:1 |
| `square_aspect_only_request` | 仅传入 1:1，不推定像素分辨率 |
| `square_native_non_1024_request` | 文档所允许的最低方图请求不是 1024 像素或 1K 档位 |
| `other` | 非方图或不属于以上分组 |
| `unknown` | 能力或有效请求不足，无法确定 |

`observed_output_pixel_bands` 由方向和总像素数组合。方向规则为：宽高相等是 `square`，宽大于高是
`landscape`，宽小于高是 `portrait`。总像素区间采用左闭右开：`lt_1mp`、`1mp_to_lt_2mp`、
`2mp_to_lt_4mp`、`4mp_or_more`；1 MP 按 1,000,000 像素计算。无法测量时计入
`images.unmeasurable`，不能进入匹配率分母。

如果请求使用精确 `size=1024x1024`，但返回图片像素不同，仍归入固定 1024 参数组；同时在
`observed_output_sizes` 和风险提示中保留真实观察结果。

“参数比较分组”与“是否满足用户硬性输出要求”必须分开。仅比例控制的模型即使本轮曾输出
1024×1024，也不能被描述为支持 1024 像素参数。若用户把最终输出 1024×1024 作为硬要求，则应：

1. 排除已有不一致观察且无法保证输出尺寸的配置；或
2. 明确告知模型不能保证，并在用户接受时提供确定性的生成后缩放/裁切方案。

### 5.3 价格快照

文件：

```json
references/model-pricing-snapshot.json
```

价格快照与行为快照使用相同的文件 envelope，价格条目放在顶层 `profiles` 数组中，并通过
`profile_id`、`configuration_id` 和 `comparison_group_id` 与行为画像及比较方法关联。

示例：

```json
{
  "profile_id": "sha256:example-profile-hash",
  "configuration_id": "sha256:example-configuration-hash",
  "comparison_group_id": "t2i-square-1024-cost-v1",
  "model_id": "gpt-image-2",
  "benchmark_suite_id": "image-price-benchmark-2026-08",
  "methodology_version": "1.0.0",
  "scenario_class": "mixed_t2i_prompts",
  "prompt_count": 4,
  "reference_count": 0,
  "operation": "generate",
  "effective_request_params": {
    "size": "1024x1024",
    "quality": "high",
    "n": 1
  },
  "request_dimension_mode": "pixel_size",
  "requested_size_class": "square_1024_pixel_request",
  "billing_mode": "token",
  "billing_scope": "nonelinear_account_price_tier",
  "cost_completeness": "complete",
  "requests": {
    "attempted": 4,
    "billed": 4,
    "http_succeeded": 4,
    "with_image": 4
  },
  "images": {
    "requested": 4,
    "returned": 4
  },
  "total_observed_billed_cost": {
    "currency": "CNY",
    "amount_decimal": "5.927824"
  },
  "billed_request_cost_distribution": {
    "unit": "request",
    "sample_count": 4,
    "min_decimal": "1.476440",
    "median_decimal": "1.480164",
    "max_decimal": "1.491056"
  },
  "aggregate_cost_per_returned_image": {
    "currency": "CNY",
    "amount_decimal": "1.481956",
    "numerator": "total_observed_billed_cost",
    "denominator_images": 4
  },
  "usage": {
    "input_tokens_total": 494,
    "output_tokens_total": 28096,
    "cache_tokens_total": 0
  },
  "billing_rounding": "as_reported_by_dashboard",
  "observed_from": "2026-08-18",
  "observed_to": "2026-08-18",
  "fresh_until": "2026-09-18",
  "source": "nonelinear_dashboard"
}
```

价格规则：

- 金额使用定标十进制字符串和十进制定点算法，不使用二进制浮点数累计。
- 同时保存请求数、已计费请求数、有图请求数、请求图片数、返回图片数和总账单费用。
- `aggregate_cost_per_returned_image` 固定定义为“全部已确认账单费用 ÷ 全部返回图片张数”，不代表人工判断后的可用图片成本。
- 返回图片数为 0 时该聚合字段必须为 `null`，不得除以零或用 0 元代替。
- `cost_completeness=complete` 表示所有尝试请求都有已确认账单；`partial` 表示只有部分请求有账单；
  `unknown` 表示没有足够账单数据。
- 按张计费模型记录本轮观测单价，但仍保留日期、来源和成本单位。
- 按 Token 计费模型记录 usage、样本数、最小值、中位数和最大值，不标成固定单价。
- 后台费用为 0 只表示本次账单记录为 0，不外推为长期免费。
- 失败或空图的账单未知时标记 `cost_completeness=partial|unknown`，不得假定为 0。
- 失败或空图若后台确认计费，费用必须计入 `total_observed_billed_cost`。
- 只有同币种、同 billing scope、同 `comparison_group_id` 且价格仍在新鲜期内的数据才可直接排序。
- `comparison_group_id` 由方法文件定义受控变量，至少约束评测套件、场景集合、operation、参考图特征、
  目标尺寸口径、`effective_n` 和允许变化的参数。不同 `quality` 只有在方法明确声明可比时才进入同组，
  否则必须分组展示。
- 过期、缺少单位或无法归一化的数据返回“不可比较”，不得强行排序。
- 价格快照只用于估算和比较，不替代 NoneLinear 实时账单。
- `billing_scope` 使用不含账号标识的稳定价格档位别名，不写入真实账户 ID。

### 5.4 样本置信度

置信度不是人工自由填写，而是由 `benchmark-methodology.md` 对应的方法版本给出机器可判定阈值。建议默认规则：

| 等级 | 建议条件 | 可使用的措辞 |
| --- | --- | --- |
| `exploratory` | 不满足 `repeated` | “本轮观察到” |
| `repeated` | 至少 3 个请求、2 个 Prompt 或场景，且无未知关键字段 | “多次实测中” |
| `stable` | 至少 10 个请求、3 个场景、2 个不同日期，且关键指标无未解释冲突 | “近期重复验证中较稳定” |

当前多数配置每个 Prompt 只调用一次，不应直接计算并宣传为稳定成功率。

### 5.5 暂不从现有数据推导的结论

当前结果可以支持：

- 接口是否成功返回图片。
- 请求参数和实际输出尺寸。
- 单次费用及样本费用区间。
- 调用耗时。
- 空图、HTTP 错误和已知参数异常。

当前结果不能单独支持：

- 画质排名。
- 中文文字准确率排名。
- 主体一致性排名。
- 商品可用率排名。

这些结论需要人工评分、OCR、结构化标注或更多重复样本。

## 6. 第三层：决策规则

### 6.1 规则优先级

```json
接口能力、安全限制与授权边界
    > 用户明确指定的有效模型和参数
    > 用户声明的尺寸、预算和效果偏好
    > 有足够证据的评测快照
    > Skill 默认模型
```

能力事实是硬约束，评测快照是软证据。

### 6.2 基本规则

1. 先按 operation 过滤模型，再校验参数。
2. 用户指定模型且参数有效时，不静默换模。
3. 参数无效时，在请求前返回错误或给出可选修正，不产生费用。
4. 用户没有指定模型时，才允许根据偏好推荐配置。
5. 查询参数、价格、能力或推荐时，不调用生图 API。
6. 历史快照的多模型比较始终只读；现场调用多个模型比较时，必须先确认请求数量和费用风险。
7. 评测样本不足时返回不确定性，不输出绝对化排名。
8. 返回结果时区分真实模型 ID、展示名称和配置参数。
9. 授权判断使用规范化执行计划中的 `effective_n`、模型数、Prompt 数、最大尝试次数和付费请求数，
   不能只看用户是否显式传入 `n`。
10. `effective_n>1`、多模型、批量任务和任何自动重试均需单独确认；失败后默认停止。
11. 用户给出硬预算但快照只能提供估算时，不得承诺不超预算；无法建立安全上界时先请求确认。

发送付费请求前先生成规范化执行计划：

```json
{
  "model_count": 1,
  "prompt_count": 1,
  "billable_request_count": 1,
  "max_attempts_per_request": 1,
  "effective_n": 1,
  "max_output_images": 1,
  "requires_additional_confirmation": false,
  "confirmation_reasons": []
}
```

`effective_n` 的计算顺序为：用户显式值、Skill 安全默认值、文档明确的服务商默认值。对于支持 `n` 的模型，
Skill 应显式发送安全默认 `n=1`。如果接口无法覆盖一个大于 1 的服务商默认值，则不得在无额外确认时执行或推荐。
执行脚本必须接收并校验已授权的最大输出数或等价的执行计划摘要，拒绝实际 `effective_n` 超出授权范围。

### 6.3 付费授权矩阵

| 场景 | 是否需要额外确认 | 规则 |
| --- | --- | --- |
| 单个明确图片任务、一个模型、`effective_n=1` | 否 | 用户的生成或编辑请求授权一次付费 API 请求 |
| `effective_n>1` | 是 | 告知最大输出图片数和预计口径 |
| 一次调用多个模型 | 是 | 告知模型数、请求数和预计费用范围 |
| 批量 Prompt 或批量参考图任务 | 是 | 告知批次数与最大请求数 |
| 失败自动重试 | 是 | 默认不重试；确认次数和停止条件后才可执行 |
| 显式调用 `passthrough` 模型 | 是 | 告知本地参数校验不完整，确认后仅按已知约束执行一次 |
| 读取历史快照进行多模型比较 | 否 | 只读，不访问生图 API |

### 6.4 典型决策

#### 要求精确 1024 方图

1. 优先过滤支持精确 `size=1024x1024` 或文档等价写法的模型。
2. 再参考该配置的实测尺寸一致性。
3. 如果用户只是要求传入 1024 参数，模型可保留并提示实际尺寸观察。
4. 如果最终像素必须严格为 1024×1024，则排除已知不一致且无法保证的配置，或在用户接受时增加确定性后处理。
5. 不使用“实际曾输出 1024”反向证明模型支持精确尺寸参数。

#### 要求低成本

1. 只比较同币种、同 billing scope、同 `comparison_group_id` 且仍在新鲜期内的价格条目。
2. 优先比较 `aggregate_cost_per_returned_image`；缺少完整账单或返回图片数时不得自行推导。
3. 固定按张计费可按仍在新鲜期内的观测单价排序。
4. Token 计费可按同口径样本中位数排序，并明确实际费用会随输入和输出 Token 变化。
5. 过期或不可归一化的数据返回“不可比较”。
6. 0 元观测不得自动标为免费。

#### 图生图

1. 过滤支持 `edit` 的模型。
2. 根据能力注册表选择 `image`、`image_ref` 等真实字段。
3. 校验参考图数量、大小和格式。
4. 参考实测数据添加空图、尺寸偏差或提示词兼容性提醒。

#### 有文字图片

在没有文字准确率评分前，只能按接口可用性、费用和尺寸筛选；不得依据是否曾成功返回图片就声称文字能力更强。

### 6.5 只读推荐脚本

新增：

```json
scripts/recommend-image-config.mjs
```

示例：

```bash
node scripts/recommend-image-config.mjs \
  --operation generate \
  --target-size 1024x1024 \
  --priority cost \
  --as-of 2026-08-27
```

输出应包含：

```json
{
  "recommended": {
    "model_id": "example-model",
    "display_name": "Example Model",
    "effective_request_params": {
      "size": "1024x1024"
    },
    "reason": "Supports an exact square size parameter and has comparable recent cost samples."
  },
  "alternatives": [],
  "data_version": "2026-08-18.1",
  "as_of": "2026-08-27",
  "versions": {
    "capabilities": "0.4.0",
    "benchmark": "2026-08-18.1",
    "pricing": "2026-08-18.1",
    "rules": "1.0.0"
  },
  "confidence": "exploratory",
  "comparability": "comparable",
  "billable_request": false
}
```

推荐脚本只读取本地注册表和快照，不访问生图接口。`--as-of` 决定价格新鲜度判断；省略时可使用宿主当前
日期，但输出必须回显实际 `as_of`。相同输入、版本和 `as_of` 的排序必须稳定，最终 tie-break 固定使用
`model_id`、`configuration_id`。

## 7. 数据构建与发布

### 7.1 不直接复制原始评测文件

在仓库开发工具目录增加构建脚本，例如：

```json
tools/build-image-benchmark-snapshots.mjs
```

构建脚本读取：

- 文生图 `results.json`。
- 图生图 `results.json`。
- 已人工补充的后台账单 CSV。
- 场景和 Prompt 分类元数据。
- 已版本化的 `model-capabilities.json`，只用于外键和生命周期校验。

模型上下线信息由能力注册表的独立审核流程维护。快照构建器不得接受另一份上下线清单并覆盖
`lifecycle`，避免同一事实双重维护。

输出：

- `model-benchmark-snapshot.json`
- `model-pricing-snapshot.json`

### 7.2 构建步骤

1. 校验输入文件结构。
2. 统一使用 canonical operation：`generate`、`edit`、`fuse`。输入中的 `fusion` 只能作为边界 alias，
   快照、哈希和输出一律写 `fuse`。
3. 规范 model ID 和参数表达，并从 operation 参数允许列表构建 `effective_request_params`。
4. 将展示名称与真实模型 ID 分离。
5. 根据有效参数和值识别尺寸控制类型，不从模型级常量复制。
6. 分别记录请求尺寸和输出图片尺寸。
7. 分别统计请求数和图片数，区分 HTTP 成功、有图请求、返回图片、可测量图片、空图和限流。
8. 合并 API usage 与后台账单。
9. 按 benchmark suite、方法版本、场景、operation、参考图数量和参数配置分层聚合。
10. 计算请求成本、返回图片数量和可比较时的单张返回图片成本。
11. 使用允许列表中的结构化 observation code，不复制上游错误全文或自由文本备注。
12. 对对象键稳定排序、保留数组顺序，并使用确定性的中位数算法。
13. 写入数据版本、时间范围和输入摘要哈希。
14. 校验快照中的 `model_id` 均匹配能力注册表中的 `models[].id`。

确定性细则：

- canonical JSON 使用 RFC 8785；字符串使用标准 JSON Unicode 表达，数字在进入 canonical JSON 前转换为
  Schema 规定的整数或定标十进制字符串。
- 参数缺省值先按能力 Schema 补齐；显式默认值和省略后补齐的默认值必须得到相同 `params_sha256`。
- 去重键为 `source + billing_scope + request_id`。同一键内容不一致时构建失败，不自行选择其中一条。
- 没有 Request ID 的账单行必须提供稳定的 `source_row_id`；否则只进入待人工处理清单，不参与聚合。
- 输入文件按规范化绝对标识排序，CSV 使用固定编码、表头和转义规则。
- 中位数先按定标十进制值排序；奇数样本取中间值，偶数样本取中间两值算术平均，最终保留 6 位小数。
- `generated_at` 来源优先级固定为：显式 `SOURCE_DATE_EPOCH`、发布元数据时间、最新输入记录时间。
- `confidence` 按 methodology version 中的机器阈值生成。

### 7.3 不进入发布包的数据

- 完整 Prompt。
- 原始图片和水印图片。
- API 原始响应。
- Request ID。
- 用户本地绝对路径。
- API Key、请求头和 Base64。
- 微信公众号文章和展示用表格图片。

### 7.4 版本规则

每次发布至少记录：

```json
{
  "schema_version": "1.0.0",
  "data_version": "2026-08-18.1",
  "generated_at": "2026-08-19T00:00:00+08:00",
  "generated_at_basis": "latest_source_timestamp",
  "capability_registry_version": "0.4.0",
  "content_sha256": "sha256:example-content-hash",
  "benchmark_window": {
    "from": "2026-08-11",
    "to": "2026-08-19"
  }
}
```

Schema 变化使用语义化版本；新增评测数据只更新 `data_version`。为保证相同输入生成相同输出，
`generated_at` 必须按前述优先级来自显式 `SOURCE_DATE_EPOCH`、发布元数据时间或最新输入记录时间，不能直接使用每次构建的系统当前时间。
JSON 输出采用固定字段顺序、UTF-8 和统一换行；`content_sha256` 对不含自身字段的 canonical JSON 计算。

三个发布数据文件必须分别提供 JSON Schema：

- `model-capabilities.schema.json`
- `model-benchmark-snapshot.schema.json`
- `model-pricing-snapshot.schema.json`

构建、测试和发布均须通过 Schema 校验；推荐器不得加载 Schema 验证失败或版本不兼容的快照。

## 8. Skill 运行流程

`SKILL.md` 只保留核心工作流和读取条件，详细数据放在 references 中。

建议流程：

1. 判断用户是查询还是执行图片任务。
2. 查询任务不产生付费请求。
3. 识别 `generate`、`edit` 或 `fuse`。
4. 读取能力注册表并校验模型和参数。
5. 仅在选模、估价、尺寸风险判断时读取评测和价格快照。
6. 补齐安全默认值并生成包含 `effective_n` 的执行计划。
7. 按授权矩阵判断是否需要额外确认；没有满足授权范围时不执行。
8. 用户授权后，执行计划允许的付费请求；任何失败默认停止且不自动重试。
9. 只有响应包含可解析且符合允许协议的 HTTPS 图片 URL 时才报告成功。
10. 返回模型 ID、展示名称、operation、有效请求参数、执行计划摘要和 request ID。
11. 如果可以可靠检测，再单独返回输出图片尺寸；不得用它覆盖请求参数。

## 9. 当前实现需要先修复的问题

### 9.1 图生图字段映射

当前 `generate-image.mjs` 对所有模型统一发送 `body.image`。这无法覆盖部分模型使用
`image_ref` 的情况。

应由 `operations.*.reference` 控制请求字段，而不是在脚本中继续增加散落的模型 ID 判断。

### 9.2 本地图片格式识别

当前上传请求的 `type` 来源于文件后缀。如果文件名为 `.jpg`，但文件内容实际为 PNG，可能造成上传或后续调用失败。

应根据文件签名字节识别 JPEG、PNG、WebP、GIF、BMP 和 TIFF；文件后缀只用于前置筛选，不作为最终 MIME 依据。

### 9.3 支持状态与评测结论混淆

`support.integration`、`support.live_verification` 和 `support.host_verifications` 表示 Skill 接入或验证状态，
不表示模型画质、成功率或价格水平。评测结论必须进入独立快照。

### 9.4 模型下线

下线模型应在能力层标记 `lifecycle=retired`，不得进入默认推荐，也不得因为历史评测成功而继续调用。

### 9.5 Passthrough 与 family 兜底

当前脚本允许部分未注册模型或 family 级模型绕过完整参数校验，还可能统一套用并不真实的参考图数量。
v0.4 自动推荐不得使用这些兜底结果。未知模型默认拒绝；`passthrough` 仅供用户显式指定，并应避免
伪造结构化能力限制。

### 9.6 输出 URL 验证

当前成功提取逻辑主要判断 URL 字段是否为非空字符串。应验证 URL 可以解析、协议为 HTTPS，并符合输出
安全策略；无效 URL 应映射为稳定错误码，且不得报告任务完成。

返回链接策略至少要求：URL 可解析、协议为 HTTPS、没有 userinfo、主机不是本机或私网/保留地址、长度不超过
限制。若阶段零加入下载和本地落盘，则每次 DNS 解析和每次重定向都要重新拒绝私网及保留地址；禁止协议
降级，不向下载主机转发 Authorization，限制重定向次数、响应大小和 Content-Type，并用文件签名验证内容。
下载失败只报告下载错误，不得重新发起生图请求。

### 9.7 上游错误脱敏

当前脚本可能把上游自由文本错误返回给 Skill。v0.4 默认 stdout 只输出稳定错误码和本地固定文案，不直接回显
可能包含 Prompt、URL、路径或上游诊断信息的原始错误。显式 debug 模式也必须脱敏，且调试信息不得进入标准
Skill stdout 或发布快照。

## 10. 分阶段落地

### 阶段零：Schema 基础与 v0.3 执行契约

- 定稿三个 JSON Schema、canonical operation、默认值和 v0.3→v0.4 字段迁移规则。
- 在同一变更中迁移能力注册表、生成脚本、测试和 `SKILL.md`，避免同时存在两套执行契约。
- 将 per-operation 定义作为参数、参考图字段及数量限制的唯一执行事实源。
- 在结果中返回 operation、真实模型 ID、脱敏请求参数和耗时。
- 完成本地落盘、文件签名校验和可选的输出尺寸检测。
- 修复参考图字段映射、本地文件类型识别和输出 URL 验证。
- 收紧未知模型、family 兜底和 passthrough 的执行边界。
- 实现 `effective_n=1` 安全默认、执行计划和授权范围校验。

### 阶段一：数据可查询

- 按阶段零 Schema 补齐纳入评测快照的模型能力事实。
- 生成行为与价格快照。
- 实现确定性构建、外键校验和比较组。
- 支持查询模型参数、尺寸控制方式和实测价格。
- 暂不自动选模。

### 阶段二：只读推荐

- 增加 `recommend-image-config.mjs`。
- 支持按 operation、尺寸和成本筛选。
- 返回推荐理由、数据版本和置信度。
- 不触发付费调用。

### 阶段三：执行前辅助决策

- 用户未指定模型时使用推荐结果。
- 用户指定模型时只做校验和风险提示。
- 输出预计费用口径，不承诺最终账单。

### 阶段四：质量画像

- 引入人工评分、OCR 或结构化评测标签。
- 增加文字准确、主体一致性、指令遵循和商品可用性等维度。
- 样本和方法达到要求后，再支持质量偏好选模。

## 11. 验收标准

### 数据

- 能力事实和评测观察没有混写。
- 每个快照包含数据版本、时间范围和样本数。
- 快照 `model_id` 必须匹配能力注册表 `models[].id`。
- 有效请求参数和输出图片尺寸分别保存。
- 尺寸控制方式、请求尺寸口径和实测像素区间分别保存。
- Token 计费不显示为固定价格。
- 失败调用不进入 0 元样本。
- 请求级计数、图片级计数和各自分母明确。
- 已确认计费的失败请求进入总账单成本，未知账单不假定为 0。
- 请求总成本、请求图片数、返回图片数和单张返回图片成本不会混为同一单位。
- 下线模型不进入推荐候选。

### 决策

- 先按能力过滤，再使用评测数据排序。
- 用户指定模型时不静默替换。
- 参数查询和推荐不会调用生图 API。
- `effective_n>1`、多模型、批量任务、passthrough 调用和自动重试必须得到明确授权。
- 服务商默认多图不会绕过执行计划和最大输出数校验。
- 历史快照比较与现场多模型付费调用有不同的行为和提示。
- 推荐输出包含理由、数据版本和不确定性。
- 无法归一化或已经过期的价格返回“不可比较”，不强制排名。

### 工程

- 构建脚本输出确定、可重复。
- 三个数据文件均通过正式 JSON Schema 校验。
- 快照中的模型 ID 必须通过能力注册表外键校验。
- 单元测试覆盖 RFC 8785 哈希、默认值补齐、尺寸分组、Decimal 成本聚合、重复冲突和下线模型过滤。
- 本地图片格式按文件签名识别。
- 图生图字段和数量限制由 per-operation 定义决定。
- 输出图片 URL 通过 HTTPS URL 校验。
- 下载实现通过 DNS、重定向、协议、大小、Content-Type 和文件签名安全检查。
- 上游自由文本错误不进入默认 stdout。
- 未达到准入门槛的模型不会进入自动推荐。
- Skill 发布包不包含原始图片、Prompt、Request ID 或敏感信息。

## 12. 目录规划

建议最终结构：

```json
nonelinear-skills/
├── docs/
│   ├── nonelinear-image-product-plan.md
│   └── nonelinear-image-three-layer-architecture.md
├── tools/
│   └── build-image-benchmark-snapshots.mjs
└── skills/
    └── nonelinear-image/
        ├── SKILL.md
        ├── agents/
        │   └── openai.yaml
        ├── references/
        │   ├── model-capabilities.json
        │   ├── model-capabilities.schema.json
        │   ├── model-benchmark-snapshot.json
        │   ├── model-benchmark-snapshot.schema.json
        │   ├── model-pricing-snapshot.json
        │   ├── model-pricing-snapshot.schema.json
        │   ├── benchmark-methodology.md
        │   └── models.md
        └── scripts/
            ├── generate-image.mjs
            └── recommend-image-config.mjs
```

其中：

- `SKILL.md` 保持简短，只描述执行流程和何时读取 references。
- `references` 保存发布时使用的模型事实和精简快照。
- `scripts` 保存最终用户运行时需要的确定性逻辑。
- `tools` 保存仓库维护者使用、但不随 Skill 打包的评测数据构建逻辑。
