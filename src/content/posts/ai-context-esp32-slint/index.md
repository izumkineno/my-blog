---
title: "给 AI 足够上下文，能把 Slint 搬到 ESP32 上吗？"
published: 2026-07-26
draft: false
description: 从微雪官方 LVGL Demo 提取硬件信息，先用 embedded-graphics 完成 Rust 亮屏实验，再沿 Slint 源码找到 no_std 软件渲染接口，将声明式 GUI 跑上 ESP32-S3 圆屏。
image: ""
tags:
  - ESP32
  - Rust
  - Slint
  - embedded-graphics
  - AI 编程
category: 嵌入式与硬件
lang: zh_CN
---

我一开始有一个很直接的想法：**只要给 AI 足够多的上下文，它应该就能完成大部分项目。**

这次我拿一块微雪 `ESP32-S3-Touch-LCD-1.85C` 做了实验。官方主要提供 Arduino、ESP-IDF 和 LVGL 示例，而我想走一条并不在官方 Demo 里的路线：使用 Rust 驱动整块开发板，再把 Slint 的 GUI 跑到这块 360 × 360 的圆形触摸屏上。

最后，屏幕成功点亮，Slint 界面能够正常渲染，触摸也可以转换为界面事件。项目已经公开在 GitHub：[izumkineno/esp32_slint_waveshare](https://github.com/izumkineno/esp32_slint_waveshare)。

> [!NOTE]
> 本文先记录从官方 Demo 到 Rust、再到 Slint 的移植过程。开发板实拍和运行界面截图将在后续更新中补充。

## 我真正想验证的是什么

如果只把一句“帮我给 ESP32 写个 Slint GUI”交给 AI，得到的结果很可能只是能够解释概念、却无法在真实硬件上工作的代码。

嵌入式开发的问题不只在语言和框架。屏幕型号、总线协议、GPIO 映射、复位顺序、初始化命令、像素格式、内存位置和工具链版本，任何一项错误都可能让设备停在黑屏。AI 并不知道我手里这块板子的实际连接方式，也无法凭空判断厂商 Demo 中哪些步骤不能省略。

所以这次实验里的“足够上下文”，并不是简单地把大量文件塞进提示词，而是给出一条可以追溯的证据链：

1. [微雪官方硬件文档](https://docs.waveshare.net/ESP32-S3-Touch-LCD-1.85C/)负责说明板载器件和基础规格。
2. 官方 Arduino 与 ESP-IDF 的 LVGL Demo 负责说明这块板子实际上如何初始化和通信。
3. `esp-hal` 与 Rust 工程负责约束目标平台、所有权模型和 `no_std` 环境。
4. [embedded-graphics](https://github.com/embedded-graphics/embedded-graphics)先验证底层显示与触摸链路。
5. [Slint 源码](https://github.com/slint-ui/slint)负责回答框架在没有桌面窗口系统时如何接入自定义平台和显示设备。
6. 编译、烧录和真实触摸操作负责验证结果，而不是让“代码看起来合理”成为终点。

这条链路把一个模糊目标拆成了可以逐层验证的问题。

## 第一步：从 LVGL Demo 中提取硬件使用方式

目标开发板的核心硬件是：

| 模块 | 型号与配置 |
| --- | --- |
| 主控 | ESP32-S3，最高 240 MHz |
| 存储 | 16 MB Flash、8 MB Octal PSRAM |
| LCD | ST77916，1.85 英寸，360 × 360，RGB565 |
| LCD 总线 | QSPI |
| 触摸 | CST816S，I2C 单点电容触摸 |
| IO 扩展 | TCA9554PWR |
| RTC | PCF85063 |

硬件介绍只能告诉我“有什么”，真正决定驱动能否工作的，是 Demo 告诉我的“怎么用”。我让 AI 同时阅读官方 Arduino 和 ESP-IDF 示例，把信息整理成独立的硬件笔记，而不是直接照抄某一套 C/C++ API。

提取出的关键连接包括：

| 信号 | 配置 |
| --- | --- |
| I2C SDA / SCL | GPIO11 / GPIO10，400 kHz |
| TCA9554PWR | I2C 地址 `0x20` |
| LCD reset | TCA9554PWR EXIO2 |
| Touch reset | TCA9554PWR EXIO1 |
| LCD QSPI SCK | GPIO40 |
| LCD QSPI D0 / D1 / D2 / D3 | GPIO46 / GPIO45 / GPIO42 / GPIO41 |
| LCD CS | GPIO21 |
| LCD backlight | GPIO5 |
| CST816S | I2C 地址 `0x15`，中断 GPIO4 |

更重要的是初始化顺序：先建立 I2C，再配置 TCA9554PWR；通过扩展 IO 释放 LCD 复位后，才能初始化 ST77916；触摸控制器也依赖同一条 I2C 和另一根扩展复位线。

```text
I2C
  ↓
TCA9554PWR
  ├─ EXIO2 → LCD reset
  └─ EXIO1 → Touch reset
       ↓
ST77916 QSPI + CST816S I2C
```

ST77916 也不是“把像素通过 SPI 发出去”这么简单。Rust 驱动最终保留了 Demo 中能够被验证的面板命令流：低速读取面板信息、软件复位并等待、切换到 40 MHz QSPI、设置 RGB565 像素格式、发送厂商初始化表，最后打开显示。

这一步让我确认了一件事：**厂商 Demo 不只是示例代码，它还是硬件行为的可执行文档。** AI 的价值在于跨 Arduino、ESP-IDF 和芯片资料提取不变量，再把它们映射到新的语言与 HAL，而不是逐行翻译 API。

## 第二步：先做 `esp_learn` 亮屏实验

我没有直接把 Slint 接上去，而是先建立了 `esp_learn`。这个工程只解决三个问题：

1. Rust 能否通过 `esp-hal` 正确初始化 ST77916；
2. `embedded-graphics` 能否在圆屏上绘图；
3. CST816S 的触摸坐标能否进入 Rust 主循环。

`St77916Display` 实现 `embedded_graphics::DrawTarget`，颜色格式使用 `Rgb565`。360 × 360 × 2 字节的完整 framebuffer 大约是 253 KiB，因此它被放在静态存储区，而不是入口任务的栈上。绘制完成后，再通过 QSPI 把 framebuffer 刷到 LCD。

圆形面板的控制器仍暴露 360 × 360 的方形地址空间。实验程序先把整个区域填黑，再绘制直径 356 像素的白色圆形画布；触摸命中判断也使用相同的圆形边界，避免在物理屏幕之外的四角继续绘图。

最终的实验很简单：在屏幕上拖动可以画线，点击 `CLEAR` 可以清空画板。它没有复杂 UI，却验证了完整的最小闭环：

```text
触摸坐标 → Rust 输入逻辑 → embedded-graphics → RGB565 framebuffer → ST77916 QSPI
```

这一步非常关键。假如我一开始就引入 Slint，那么黑屏可能来自面板初始化、像素字节序、渲染器、内存分配或事件循环中的任何一层。先让 `embedded-graphics` 亮屏，相当于把后续问题收敛成“如何把 Slint 的输出和输入接到已经工作的驱动上”。

## 第三步：从 Slint 源码里找移植接口

确认硬件链路后，我把 Slint 的源码拉到本地，让 AI 不再猜测框架应该怎样移植，而是直接查找已有的 MCU、软件渲染器和自定义 Platform 实现。

最终找到的关键接口是：

- `Platform`：为没有桌面窗口系统的目标提供窗口和时间来源；
- `MinimalSoftwareWindow`：在裸机或 RTOS 环境中承载 Slint 窗口；
- `SoftwareRenderer`：把 Slint 场景渲染为软件像素；
- `LineBufferProvider`：逐行接收渲染结果并交给显示驱动；
- `WindowEvent`：把触摸坐标转换为按下、移动、释放和离开事件。

工程关闭了 Slint 的默认功能，只保留 MCU 移植需要的部分：

```toml
slint = { version = "=1.16.0", default-features = false, features = [
    "compat-1-2",
    "unsafe-single-threaded",
    "libm",
    "renderer-software",
] }
```

构建脚本使用 `EmbedForSoftwareRenderer` 编译 `.slint` 文件并把所需资源嵌入固件。`no_std` 环境下 Slint 仍需要动态分配，因此工程在创建任何 Slint 对象之前初始化板载 Octal PSRAM allocator。

渲染侧则使用 `RepaintBufferType::ReusedBuffer` 和一条 360 像素的 RGB565 行缓冲：

```rust
let window = MinimalSoftwareWindow::new(RepaintBufferType::ReusedBuffer);
window.set_size(PhysicalSize::new(360, 360));

let mut line_buffer = [Rgb565Pixel(0); 360];
window.draw_if_needed(|renderer| {
    renderer.render_by_line(DisplayLineBuffer {
        display: &mut display,
        buffer: &mut line_buffer,
    });
});
```

`DisplayLineBuffer::process_line()` 让 Slint 先填充需要重绘的行片段，再调用显示驱动的 `write_line()`。驱动把行号和像素范围转换成 ST77916 的写入窗口，随后用 QSPI 发送 RGB565 数据。

```text
Slint scene
    ↓
MinimalSoftwareWindow + SoftwareRenderer
    ↓
LineBufferProvider
    ↓
360 像素 RGB565 行缓冲
    ↓
ST77916 局部窗口 + QSPI
```

与 `esp_learn` 的完整 framebuffer 相比，这条路径不需要为 Slint 再准备一张 360 × 360 的整屏缓冲。单行 RGB565 像素本身只有 720 字节，渲染完成后就可以直接写入屏幕。

输入方向正好相反：轮询 CST816S 得到坐标后，第一次接触发送 `PointerPressed`，坐标变化发送 `PointerMoved`，触摸结束发送 `PointerReleased` 和 `PointerExited`。这样 Slint 控件并不需要知道底层使用的是哪一款触摸芯片。

## 从亮屏到真正的 GUI

完成 Platform、渲染和输入适配后，我先做了一个 360 × 360 的圆形控制界面：触摸按钮可以更新计数，`CLEAR` 可以清零，动画页面用于确认定时器和连续重绘能够运行。

最初的成功版本证明了下面这条链路可以成立：

```text
微雪 LVGL Demo
    ↓ 提取硬件事实
Rust + esp-hal 驱动
    ↓ 验证显示和触摸
embedded-graphics 亮屏实验
    ↓ 替换图形层
Slint no_std software renderer
    ↓
ESP32-S3 圆屏声明式 GUI
```

项目后来继续加入了时钟、RTC、WiFi、Bluetooth LE 和更多圆屏页面，但这些都建立在最初的显示、触摸和 Slint 平台适配之上。本文记录的重点仍是第一次把 Slint 真正跑上这块开发板的过程。

实际工程与构建说明：<https://github.com/izumkineno/esp32_slint_waveshare>

## 这次实验后，我重新理解了“足够的上下文”

实验结果基本支持我最初的判断，但也给它加上了几个前提。

### 1. 上下文的质量比数量重要

官方文档、厂商 Demo、目标框架源码、确定的工具链版本和真实编译错误，都是高价值上下文。论坛里缺少版本和硬件条件的零散代码，即使很多，也可能把 AI 带到错误方向。

### 2. 先建立可验证的中间结果

`esp_learn` 不是多余的临时工程。它把“移植 Slint”拆成了“先让 Rust 可靠控制硬件”和“再替换图形层”两个可验证阶段。AI 可以快速生成和修改代码，但物理世界仍需要亮屏、触摸和烧录结果来裁决对错。

### 3. 源码可以成为最精确的提示词

当高层文档没有覆盖我的硬件组合时，Slint 源码中的 MCU 适配方式比继续追问“应该怎么做”更有效。让 AI 在源码里查找 `MinimalSoftwareWindow`、`LineBufferProvider` 和软件渲染流程，得到的是框架已经支持的扩展点，而不是一套平行实现。

### 4. 人仍然要定义边界和验收条件

AI 可以帮助阅读、归纳、移植和排错，但“先验证哪一层”“什么结果算成功”“哪些资料可信”仍需要人来决定。这次的验收条件一直很具体：能编译、能烧录、能亮屏、能接收触摸、能让 Slint 控件响应。

所以我现在会把最初的想法改写成：

> 对于边界能够描述、结果能够验证的项目，只要向 AI 提供足够准确且结构化的上下文，它确实可以完成很大一部分工程工作。

这不是让 AI 凭空替代嵌入式开发，而是把硬件文档、厂商实现、框架源码和真实设备组织成一个能够持续验证的工作环境。对我来说，这次从 LVGL Demo 到 Rust，再到 Slint 的移植，就是这套方法第一次完整跑通。
