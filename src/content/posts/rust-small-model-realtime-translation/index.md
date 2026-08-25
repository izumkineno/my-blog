---
title: "Rust 跑小模型：从翻译与 OCR 到 1 秒内实时游戏翻译"
published: 2026-08-25
draft: false
description: "以最通用的翻译与 OCR 为起点，实测 Hy-MT2 1.8B 在本地 1 秒内完成翻译，从 MinerU 1.2B 到 PaddleOCR V5/V6 的选型演进，最终在 Rust + Candle + Tauri 的 smodeltrans 中把 720P 游戏画面的捕捉、识别与翻译压到 1 秒以内。"
image: ""
tags: [Rust, Candle, 小模型, OCR, PaddleOCR, Hy-MT2, 实时翻译, Tauri]
category: AI 与本地模型
lang: zh_CN
---

一开始并没有想做“实时”。只是想验证一件事：**在 Rust 侧用 Candle 把最通用、最小的翻译和 OCR 模型跑通，本地推理到底能有多快。**

选型刻意保守：翻译用 `Hy-MT2 1.8B`，OCR 先试 `MinerU2.5-Pro-2604-1.2B`。结果翻译侧给了意外惊喜——单句翻译在本地直接压到 **1 秒以内**，这让我立刻产生下一个想法：

> 如果翻译本身不到 1 秒，是否可以把 **OCR 识别 + 翻译** 整条链路也控制在 1 秒内，做一套离线的、本地小模型实时翻译方案？

于是有了 `smodeltrans`：一个用 Rust 跑小模型的 Windows 原生应用，`窗口捕获 → PP-OCR → Hy-MT2` 全链路本地推理，不依赖云端 API。项目已开源，核心链路在 `E:/Code/small_model/smodeltrans`，技术栈 `Tauri 2 + Vue 3 + Candle 0.11`。

> [!NOTE]
> 本文记录从模型选型、OCR 换代到工程化压测的过程。文中模型与速度均基于本地 CUDA 环境实测，不同显卡/驱动会有差异。

## 为什么先做“最简单的”

通用任务最能暴露短板。如果翻译和 OCR 在通用场景下都不可用，叠加再多业务逻辑也没有意义。反之，如果通用模型在本地就能低延迟跑通，后续无论是游戏字幕、会议同传还是 PDF 批处理，都只是同一条链路的不同入口。

所以第一阶段的约束只有三条：

1. 模型要小、通用、能在消费级显卡上离线跑；
2. 推理框架选 Rust 生态，避免 Python 胶水层的额外开销与分发成本；
3. 只测端到端耗时，不做 Prompt 技巧掩盖。

## 翻译：Hy-MT2 把延迟拉进 1 秒

翻译最终落在 `Hy-MT2 1.8B` 的 GGUF 量化版（`Q4_K_M / Q6_K / Q8_0`），通过 `candle-transformers + candle-flash-attn` 在 CUDA 上执行。相比早期 Python 方案，Rust 侧的优势很直接：模型加载后常驻、显存策略可控、取消与超时可在同一套 `CancellationToken` 中处理。

实测结论也很直接：**单次短文本翻译稳定进入 1 秒以内**，短句甚至更快。这个结果比预期好，也直接催生了实时方案——既然翻译不是瓶颈，瓶颈必然在 OCR 和链路调度。

```toml
# src-tauri/Cargo.toml
candle-core = { git = "https://github.com/huggingface/candle.git", rev = "31f35b", version = "=0.11.0" }
candle-flash-attn = { optional = true }
hy-mt2 = "1.8B GGUF Q6_K"
device = "CUDA + flash-attn"
```

前端通过 `translate_text` 直通 Hy 会话，支持目标语言自然语言输入（`Chinese / English / Japanese ...`）和翻译记忆，实时场景则复用同一会话做逐区域流式翻译。

## OCR 的换代：从 MinerU 到 PaddleOCR V5/V6

OCR 的演进比翻译曲折得多。

*   **起点：MinerU2.5-Pro-2604-1.2B**。作为文档解析模型，它在版面还原上很强，但对游戏对话这种小字、异形排版、半透明背景的实时场景，体积和延迟都不占优，且链路更重。
*   **转向：百度 PaddleOCR V5**。项目启动时上游还是 V5，提供了 `mobile / server` 两档检测与识别，`83.9 MB` 的 `server_det` 和 `80.5 MB` 的 `server_rec` 在当时算小模型里的甜点，720P 画面整图 OCR 大约 **1 秒左右**，刚好卡在实时门槛上。
*   **拐点：PaddleOCR V6**。V6 发布后新增 `tiny / small / medium` 三档，`smodeltrans` 引入 `ppocr-v6-small` 后延迟大幅下降。同一张 720P 游戏画面，**捕捉→裁剪→识别→翻译** 整条链路被压到 **1 秒以内**，且 `small` 在准确率与速度间取得最佳平衡。

| 阶段 | 模型 | 体感延迟（720P 游戏对话） | 备注 |
| --- | --- | --- | --- |
| 初期 | MinerU2.5-Pro-1.2B | >1s，且更重 | 版面型，不适合实时字幕 |
| V5 时期 | PP-OCR V5 mobile/server | ~1s | 刚好可用，p95 仍有毛刺 |
| V6 至今 | PP-OCR V6 small | **<1s 端到端** | 当前主力，`small_det/small_rec` 常驻 |

模型文件通过 `ModelScope` 按需下载，存储在 `models/downloads/<modelId>`，支持 `simple_downloader` 的断点续传与多线程探测，避免每次启动重复拉取。

## 1 秒约束下的实时链路

有了“翻译 <1s”和“V6 small 足够快”的实测数据，实时方案的目标就变得具体：**从拿到一帧到字幕/覆盖层更新，整体 <1s**。为此 `smodeltrans` 没有走“截屏→压缩→解码”的老路，而是做了无损原生链路：

```mermaid
flowchart LR
    A[Windows Graphics Capture BGRA8] --> B[去标题栏/ROI裁剪/BGRA→RGB]
    B --> C[LatestFrameSlot 容量1]
    C --> D[StabilityScheduler 自动/按键触发]
    D --> E[PP-OCR detector 整图检测]
    E --> F[透视校正/旋转/批处理识别]
    F --> G[CTC解码+有界复核]
    G --> H[行分组/碎片合并]
    H --> I[Hy-MT2 逐区域流式翻译]
    I --> J[live-subtitle 覆盖层]
```

关键设计点，来自 `docs/LIVE_OCR_PIPELINE.md` 的实现约束：

1.  **零编码捕获**：`windows-capture` 直接拿 `BGRA8` 原始帧，ROI `24×24` 起步，手动 `BGRA→RGB`，没有 JPEG/PNG 编解码损耗。
2.  **最新帧槽**：`LatestFrameSlot` 容量为 1，捕获线程只覆盖最新帧，会话线程决定是否消费，避免队列堆积导致的延迟叠加。
3.  **稳定性调度**：`automatic` 模式等画面稳定再触发 OCR；`key_trigger`（默认 `F8`，支持 `vk:`）则按按下/松开触发，适合剧情对话。
4.  **OCR 后处理**：检测后做 `warpPerspective`（与 PaddleOCR `INTER_CUBIC A=-0.75` 对齐）、条件旋转（`h/w >= 1.5`）、识别批处理与最多 24 个候选的有界复核，避免对整图二次识别。
5.  **版本化去重**：`roi_version / session_id / revision` 丢弃过期结果，防止重新框选后旧结果覆盖新结果。

这套链路的耗时被拆得很细，任何一步的抖动都会在 720P 画面上被放大——所以才需要把单步都控制在毫秒级。

## 720P 游戏画面的实测体感

在 `smodeltrans` 的 **实时翻译（Live）** 页面，选择目标窗口后可框选 ROI，默认全客户区，支持 `字幕模式`（底部/顶部附着）与 `逐区替换`（回贴到原文本四边形）两种覆盖层。

以 720P 游戏对话为基准（窗口模式/无边框全屏，独占全屏无法捕获）：

*   V5 时期：检测+识别约 600–800ms，加上翻译与渲染，端到端经常在 1s 上下徘徊，快速切屏时 p95 更差；
*   **V6 small**：同一场景下端到端 **<1s**，连续对话也能跟上语速，字幕不再明显滞后。V6 的 `det`/`rec` 体积更小、预处理更轻，是延迟下降的主因。

> [!TIP]
> 游戏场景建议开 `small` 而非 `medium`，并将 ROI 限定在对话区域而非全屏，检测区域越小，整链路越稳。

## Rust 跑小模型的几点体会

1.  **选小不选大**。1–2B 的通用小模型在受限任务上已经可用，本地化的价值在于延迟与隐私，而非参数量。Hy-MT2 1.8B 与 PP-OCR V6 small 的组合证明“够用且够快”比“更大但更慢”更适合实时。
2.  **框架比参数重要**。Candle 的 `VarBuilder + flash-attn` 与 Rust 的显存/生命周期控制，让模型常驻与空闲卸载变得可预期，这点在 Python 胶水层里往往需要额外工作。
3.  **用通用任务校准，再做专用优化**。先让翻译与 OCR 在最通用的输入上达标，再针对游戏字幕做 ROI、稳定性与覆盖层优化，路径比一开始就做专用模型更稳。
4.  **换代要快**。PaddleOCR V5 到 V6 的升级几乎是无痛替换，但收益巨大。对小模型项目，跟进上游小版本的迭代比追大模型更划算。

## 下一步

`smodeltrans` 接下来会继续在 `Rust + Candle + 本地小模型` 路线上迭代：更细的 ROI 策略、选区翻译的全局快捷键链路（已在 `docs/SELECTED_TEXT_TRANSLATION_RESEARCH.md` 调研 UI Automation + 剪贴板兼容方案）、以及 `simple_downloader` 的多源/代理下载能力开放。

如果你也在 Rust 侧玩小模型，欢迎直接看工程与文档：

*   工程：`E:/Code/small_model/smodeltrans`
*   链路详解：`docs/LIVE_OCR_PIPELINE.md`
*   架构与下载器：`README.md` 与 `simple_downloader`

本地、小、快，这三件事同时满足时，实时翻译才真正从“演示”变成“可用”。
