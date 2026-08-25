# 提交信息规范

## 强制要求

1. 所有 Git 提交信息必须遵循 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范。
2. 提交信息首选简体中文；`type`、`scope`、代码标识符、文件路径和协议关键字保留英文。
3. 一个提交只包含一个完整、独立的逻辑变更，不得混入无关修改。
4. 提交前必须确认变更范围，并根据实际内容选择准确的提交类型。

## 提交格式

```text
<type>(<scope>)!: <中文说明>

[可选的中文正文]

[可选的脚注]
```

- `scope` 可选，用于标明受影响的模块或功能。
- `!` 可选，仅用于不兼容变更。
- 说明应简洁、明确，使用祈使语气，不添加结尾句号，建议不超过 72 个字符。
- 不兼容变更必须在脚注中使用 `BREAKING CHANGE: <说明>`。

## 允许的提交类型

| 类型 | 用途 |
| --- | --- |
| `feat` | 新增功能 |
| `fix` | 修复缺陷 |
| `docs` | 修改文档 |
| `style` | 调整格式，不改变程序行为 |
| `refactor` | 重构代码，不新增功能或修复缺陷 |
| `perf` | 改善性能 |
| `test` | 新增或修改测试 |
| `build` | 修改构建系统或外部依赖 |
| `ci` | 修改 CI 配置或脚本 |
| `chore` | 其他维护性修改 |
| `revert` | 撤销已有提交 |

## 示例

```text
feat(posts): 添加文章分类筛选
fix(search): 修复中文搜索索引加载失败
docs: 更新私人博客使用指南
refactor(config): 简化站点语言配置
```

不兼容变更示例：

```text
feat(content)!: 调整文章 Frontmatter 结构

BREAKING CHANGE: category 字段改为必填字段
```

---

## AI 博文发布与管理

> 本节面向 AI 代理（Claude/Codex/Gemini 等），指明在本仓库中创建、编辑、发布博客文章的唯一正确路径。人类作者可继续使用 `pnpm cms` 可视化管理。

### 1. 内容源与路径约定

- 文章集合：`src/content/posts/`，Astro Content Collections `posts`（schema 见 `src/content/config.ts`）
- 单篇文章 = 一个 page bundle 目录：`src/content/posts/<slug>/index.md`，`slug` 即目录名，决定最终 URL `/posts/<slug>/`
- 文章专属资源（封面、正文配图）与 `index.md` 同目录存放，禁止散落到 `public/` 或其他文章目录
- About 页独立于文章集合：`src/content/spec/about.md`
- 构建产物 `dist/`、`.astro/` 不可手动编辑

### 2. 创建文章（AI 首选）

```bash
pnpm new-post <slug> "标题"
# 示例：pnpm new-post esp32-slint-notes "ESP32 上跑通 Slint 的关键笔记"
```

- `slug` 校验：`/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u`，仅字母/数字/连字符分隔，失败则脚本退出
- 脚本自动创建 `src/content/posts/<slug>/index.md`，写入 `draft: true`、`published: <当天日期>`、`lang: zh_CN` 的最小 Frontmatter
- 若需完全自定义，可直接 `write` 上述路径的文件，但必须遵守相同的目录与 Frontmatter 规范
- 目标已存在时脚本会拒绝覆盖，需先处理旧目录

### 3. Frontmatter 规范（AI 必须遵守）

最小可用模板（`src/content/config.ts` Zod 校验）：

```yaml
---
title: "标题（必填）"
published: 2026-08-25  # 必填，YYYY-MM-DD
description: "一句话摘要，用于列表和 SEO，建议填写"
image: "./cover.jpg"   # 可选，相对路径/ /public 路径/远程 URL，默认 ""
tags: [Rust, ESP32]    # 可选，string[]
category: "嵌入式与硬件" # 可选，string
draft: true            # 可选，默认 false；AI 新建一律 true，确认后再改为 false
lang: zh_CN            # 可选，默认跟随 src/config.ts 的 siteConfig.lang
---
```

约束：

- `title`、`published` 必填；`updated` 可选
- `draft: true` 仅开发环境可见，`pnpm build` 会排除，勿用于权限控制
- `prevTitle/prevSlug/nextTitle/nextSlug` 为运行时注入，禁止手写
- 图片字段由 `src/components/misc/ImageWrapper.astro` 解析，见下节

### 4. 图片与资源

- 优先相对路径：`image: ./cover.jpg` 或正文中 `![](./demo.png)`，由 Astro 处理并随 bundle 迁移
- `public/` 资源使用 `/images/xxx.jpg`（会拼接 `astro.config.mjs` 的 `base`）
- 远程图片直接写 `https://...`
- 提交前确认图片文件已放入对应 bundle 目录且路径大小写一致

### 5. 编辑、发布与撤回

| 操作 | 做法 |
| --- | --- |
| 编辑 | 直接改 `src/content/posts/<slug>/index.md` 及同目录资源 |
| 重命名 slug | 重命名整个目录 `src/content/posts/<old>/` → `<new>/` |
| 删除 | 删除整个目录 |
| 发布 | `draft: true` → `false`，本地执行 `pnpm check && pnpm build && pnpm preview` 验证 |
| 撤回 | `draft: false` → `true` 后重新构建，已被搜索引擎缓存的页面需另行处理缓存 |

### 6. 校验与提交（AI 发布前必做）

```bash
pnpm check        # astro check，Frontmatter/类型错误在此暴露
pnpm build        # 含 Pagefind 索引生成，确认 draft 过滤与图片解析
pnpm preview      # 可选，本地预览生产产物
```

- 提交信息遵循本文档上半部分的 Conventional Commits，文章类推荐：
  - `feat(posts): 新增文章《xxx》`
  - `fix(posts): 修正文章 xxx 的配图/Frontmatter`
  - `docs(posts): 调整文章排版与描述`
- 一个提交只做一件事：新增/修改文章与对应的资源，不要混入配置或样式改动

### 7. 禁止事项

- 禁止把 `draft: true` 当作隐私保护手段（生产环境仅是排除构建，已发布 URL 仍可被访问）
- 禁止将密码、Token、私钥写入 Markdown/Frontmatter/图片元数据
- 禁止直接编辑 `dist/` 或手写 `prev/next` 导航字段
- 禁止为 AI 任务启动 `pnpm cms`（CMS 依赖浏览器 File System Access API，仅供人类本地可视化使用）

### 8. 快速索引

- 详细规范：`docs/3-文章与内容开发.md`、`docs/6-私人博客使用指南.md`
- 集合 schema：`src/content/config.ts`
- 创建脚本：`scripts/new-post.js`
- CMS 配置（人类用）：`cms/config.yml`、`scripts/cms-server.mjs`
