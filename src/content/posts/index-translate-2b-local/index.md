---
title: "再接一个本地翻译引擎：Index-Translate-2B 的接入、压测与 MTP 撕票实录"
published: 2026-10-06
description: "在 smodeltrans 里接入第二个本地翻译模型 Index-Translate-2B：从显存 6G 到 2.5G、从 44 秒到 2.26 秒的压测实录，四个静默数值 bug，一次接受率 86% 却被撕票的 MTP 实验。"
image: ""
tags: [Rust, Candle, 小模型, Index-Translate, 推理优化, Tauri]
category: AI 与本地模型
draft: true
lang: zh_CN
---

起因很简单：想试试 `Index-Translate-2B`。但模型太新，Ollama 上没人上传适配好的版本——没有现成的量化包，没有 Modelfile，`ollama run` 这条路直接走不通。与此同时官方放出的测试参数看着比 Hy-MT2 还要强。两下一合计：反正手里有 Candle 的轮子，不如直接接到 `smodeltrans` 里跑原生推理，顺手验证下官方数字到底有几斤几两。

于是有了这一次的折腾——把 `Index-Translate-2B` 接进来做第二个本地翻译引擎，Q4_K_M / Q8_0 双档，与 Hy-MT2 并存。项目已开源：[izumkineno/smodeltrans](https://github.com/izumkineno/smodeltrans)，本次对应 `0.5.0`（PR #2）。

> [!NOTE]
> 本文记录接入过程中的真问题与解法：显存、速度、四个静默数值 bug、一次被撕票的 MTP 实验。数字均出自 RTX 4070 SUPER + CUDA 本地实测，不同环境会有差异。

## 接入设计：按 arch 分发，与旧引擎零冲突

Index-Translate-2B 和 Hy-MT2 架构完全不同（前者是 DeltaNet 类递推结构），硬塞进同一套前向只会制造分支地狱。做法是新增独立的 `src-tauri/src/models/index` 模块（`model / prompt / session / full / deltanet / translation`），用 `is_index_gguf` 按 arch 分发。

关键约束只有一条：**激活、删除、下载这些链路零改**。新模型只是清单里多两行（`model_download.rs` + 前端 `model-download-provider.ts`），`openai_compat` 的 `GET /v1/models` 则从写死改成返回当前激活模型。e2e 默认权重选了 `Q8_0`——精度优先，先保证翻译质量不 regression，速度后面再抠。

## 第一刀：显存 6G → 2.5G

Q4 模型一加载，整卡显存干到约 6G。根因取证很直接：`model.rs::load_qmat` 把权重**全量反量化成 F16 再搬上卡**，光权重就占 3.89G。

解法是改用 `from_qtensor`，让量化权重以量化形态常驻显存，Q4 权重部分压到约 1.3G，整卡回到约 2.5G。这里有个细节：`from_qtensor` 对 f16 权重不省显存，所以定下规矩——**Q4 为主、f16 备用**。决策过程记在 `docs/plans/work/001-index-trim.md`，包括后面所有的压测数字。

## 第二刀：44 秒 → 2.26 秒，约 20 倍

显存下来之后，速度原形毕露：debug 构建下跑一个长输入要 44 秒。`StepProfile` 打点后发现真凶——每 token 每层约 73 次 `to_vec1` 的 D2H 同步，加上逐 token prefill，时间全交了过路费。

优化分两步走，都是无损手段：

- **P2b：hidden 常驻 GPU**。层间残差、norm、FFN 全 tensor 化，只有 DeltaNet 递推、GQA、argmax 过 CPU；每 linear 层只剩 1 次 D2H + 1 次 H2D。
- **P2c：hidden 全程 F16 + prefill 单 batch 前向**。消掉每步约 300 次 dtype cast，投影走 mmq，TTFT 不再随 prompt 长度放大。

结果：release 下总量 **44s → 2.26s**，TTFT 稳定在 366–598ms（<1s 达标，约 200 字 prompt 首测 500ms），decode 稳定 50–60 tok/s，与上游公开数据基本持平。e2e 从 3 例加到 4 例（补 long 长输入），计时基线直接打印在日志里：

```text
index_profile steps=64 proj=..ms cpu=..ms ffn=..ms norm=..ms delta=..ms attn=..ms d2h_syncs=64
```

`d2h_syncs` 等于 token 数——这是故意设计的：同步次数从不可见变成可断言的指标，e2e 里直接断言 `cpu=0ms`。

## 四个静默的数值 bug

速度优化过程中顺手抓出四个 bug，共同点是**都不崩、只悄悄损质量**：

| # | 问题 | 根因 |
| --- | --- | --- |
| 1 | Q/Gate 切分错位 | 权重是按头交织存放的，直接按半切会把 Q 和 Gate 张冠李戴，需 reshape 到 `(seq, n_head, 2 * head_dim)` 再拆 |
| 2 | K 被归一化两次 | `kn` 权重加载了却没用，K 走了重复归一化 |
| 3 | rope 精度漂移 | rope 输入应为 `F16 F32 F32` 的 dtype 组合，传错直接影响旋转位置编码 |
| 4 | `rms_norm` 报错 | CustomOp 要求输入 contiguous，`narrow` 后的视图必须先 `.contiguous()` |

第 1 个最典型：输出看起来像模像样，只是质量差一截，没有对照根本发现不了。这类 bug 的教训是——**新架构接入时，第一个 e2e 质量断言必须在优化前就钉死**，否则你根本不知道是在优化还是在修 bug。本次 e2e 的三例质量断言从接入第一天就全程绿，算是做对的一件事。

## MTP 撕票：接受率 86%，但更慢了

速度达标后，用户（就是我自己）追问了一句：还能不能更快？备选大牌是 MTP（Multi-Token Prediction）：用 draft 前向 + 推测循环一次吐多个 token。

实现不复杂：`model.rs` 加 `MtpWeights` + 第 24 块加载（缺失则 None），`session.rs` 做 draft 前向、快照回绕、接受率打印，环境变量 `SMODELTRANS_INDEX_MTP=1` 开关，默认关。判定标准事先写死：**接受率 ≥60% 立项，<50% 撕票**。

实测接受率 86%——远超立项线。但总量从 3.40s **涨到** 4.04s，更慢了。原因很结构性：当前递推走 CPU，MTP 的验证 batch 成本 ≥ 单步成本，draft 猜对了也省不出时间，纯纯的负收益。

于是撕票：loader、draft、循环、快照、env 门**全部回退**，parity 跑输出逐字一致（3.46s / long 60.2 tok/s）。结论写进计划文档：**纯 candle + CPU 递推架构即达天花板**，阶段二结项。100 tok/s 需要抠 op 和分配器，投入产出比不值得，当场 stop。

这次最大的收获不是 MTP 本身，而是**事先写死判定标准**的习惯。没有那行“<50% 撕票”，86% 的接受率足够让人上头，再烧两周去“优化验证 batch”——而那在当前架构下注定是死胡同。

## 前端债：写死的地方一个个还

后端折腾完，前端还了一圈写死债：

- 翻译引擎名、语言档位全部从 manifest 驱动（`translationEngineDisplayName`，OCR 变体查 `ocrVariant` 而不是 hardcode 五个 key），后加规格零改动跟随；
- 目标语言字段抽成 `TargetLanguageField.vue` + store，四页复用、即时保存；
- 修了一个真实误判：`isModelInstalled` 曾用文件名后缀匹配，在零下载时把所有模型标成“已启用”——改为以后端已下载态为准。好在后端 `activate` 本来就有文件存在校验，误判只影响显示，没造成破坏操作。

## 工具链红线

两条工程纪律，写进 `AGENT.md` 了：

1. **严禁触发 `candle-flash-attn` 重编**。日常只用 `cargo check` + 复用构建产物，一次 `cargo clean` 后的全量编译是超长编译时间和磁盘的双重灾难。
2. Windows 上遇到过一次 `LNK2038`：`esaxx` 用 `/MT` 而 `libflashattention.a` 用 `/MD`，运行时库不一致直接链接失败。这类问题自愈（升级/重装后消失），但排查时记住先看运行时库标记，能省半天。

## 收尾数字

| 指标 | 接入初 | 现在 |
| --- | --- | --- |
| 整卡显存（Q4） | ~6G | ~2.5G |
| 长输入总量 | 44s | 2.26s（约 20x） |
| TTFT | 随 prompt 放大 | 366–598ms |
| decode | — | 50–60 tok/s |
| e2e | 3 例 | 4 例全过 |

下一步是 `mmproj` 视觉接入的调研（已记在 docs 里），多模态翻译还在路上。这次接入最大的三条经验：**质量断言先于优化、判定标准先于实验、架构天花板要认**——第三条最难，MTP 的 86% 差点就让人不认了。
