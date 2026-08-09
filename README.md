# izum 的个人博客

这是一个基于 [Fuwari](https://github.com/saicaca/fuwari) 和 [Astro](https://astro.build/) 构建的静态个人博客。文章以 Markdown 文件保存在仓库中，通过 Git 管理版本，并由 GitHub Actions 自动部署到 GitHub Pages。

- 在线站点：<https://izumkineno.github.io/my-blog/>
- 开发文档：[docs/0_index.md](./docs/0_index.md)
- 文章目录：[`src/content/posts/`](./src/content/posts/)

## 功能

- Astro 5 与 Svelte 5
- 响应式布局和亮色、暗色模式
- 中文界面、文章归档、标签和分类
- Pagefind 静态搜索
- RSS、Sitemap 和文章目录
- Expressive Code、KaTeX、提示块和 GitHub 仓库卡片
- Sveltia CMS 本地文章管理界面
- GitHub Pages 自动构建与部署

## 环境要求

- Node.js 20 或更高版本
- pnpm 9；仓库声明的版本为 `pnpm@9.14.4`
- Git
- 使用 Sveltia CMS 时，推荐 Chrome 或 Edge

## 开始使用

```bash
git clone https://github.com/izumkineno/my-blog.git
cd my-blog
pnpm install
pnpm dev
```

开发服务器默认地址：

```text
http://localhost:4321/my-blog/
```

站点名称、作者资料、导航、主题色和 Banner 等配置位于 [`src/config.ts`](./src/config.ts)。站点域名和部署子路径位于 [`astro.config.mjs`](./astro.config.mjs)。

## 使用 Sveltia CMS 管理文章

项目集成了 [Sveltia CMS](https://github.com/sveltia/sveltia-cms)，用于在开发阶段通过浏览器管理本地 Markdown 文章。它直接读写当前 Git 工作区，不需要数据库，也不会在生产站点中提供在线管理后台。

### 1. 启动博客和 CMS

在第一个终端启动 Astro：

```bash
pnpm dev
```

在第二个终端启动 CMS：

```bash
pnpm cms
```

CMS 默认地址：

```text
http://127.0.0.1:4325/
```

本地 CMS 服务只监听 `127.0.0.1`，并且只提供 `cms/index.html`、`cms/config.yml` 和本地安装的 Sveltia CMS 脚本。

### 2. 选择本地仓库

1. 使用 Chrome 或 Edge 打开 CMS 地址。
2. 点击 **Work with Local Repository**。
3. 在浏览器弹出的目录选择器中选择本仓库根目录，即包含 `package.json`、`cms/` 和 `src/` 的目录。
4. 授权后进入“文章”集合。

Sveltia CMS 的本地模式依赖 Chromium 的 File System Access API。Firefox 等不支持该 API 的浏览器无法直接编辑本地仓库。

### 3. 创建或编辑文章

CMS 中的文章表单包含：

- 标题
- 发布日期和更新日期
- 草稿状态
- 摘要
- 封面
- 标签和分类
- 内容语言
- Markdown 正文

新文章使用 page bundle 结构保存：

```text
src/content/posts/
└── article-slug/
    ├── index.md
    └── cover.png
```

文章正文保存到 `index.md`，上传的封面和正文图片保存在同一文章目录。正文编辑器只启用原始 Markdown 模式，避免富文本转换破坏数学公式、提示块或自定义指令。

### 4. 草稿、预览和发布

新文章默认设置为：

```yaml
draft: true
```

草稿可以在 `pnpm dev` 中预览，但会被生产构建排除。CMS 的预览入口会跳转到：

```text
http://localhost:4321/my-blog/posts/<slug>/
```

发布前：

1. 检查标题、摘要、图片、标签和正文排版。
2. 将 `draft` 改为 `false`。
3. 执行 `pnpm check` 和 `pnpm build`。
4. 使用 `git diff` 检查 CMS 对工作区的修改。
5. 提交并推送到 `main` 分支。

CMS 保存、重命名或删除文章时只会修改本地文件，**不会自动执行 Git commit 或 push**。

### 5. 修改 CMS 端口

默认端口 `4325` 被占用时，可以通过 `CMS_PORT` 指定其他端口。

PowerShell：

```powershell
$env:CMS_PORT = "4326"
pnpm cms
```

Windows CMD：

```bat
set CMS_PORT=4326 && pnpm cms
```

Linux 或 macOS：

```bash
CMS_PORT=4326 pnpm cms
```

### 6. CMS 配置位置

| 文件 | 用途 |
| --- | --- |
| [`cms/config.yml`](./cms/config.yml) | 文章集合、字段、目录结构和预览路径 |
| [`cms/index.html`](./cms/index.html) | CMS 浏览器入口 |
| [`scripts/cms-server.mjs`](./scripts/cms-server.mjs) | 仅监听回环地址的本地静态资源服务 |
| [`package.json`](./package.json) | `pnpm cms` 命令和 Sveltia CMS 版本 |

修改字段时，需要同步检查 [`src/content/config.ts`](./src/content/config.ts) 中的 Astro 内容 schema，避免 CMS 能保存但 Astro 无法构建。

## 使用命令行创建文章

不使用 CMS 时，可以运行：

```bash
pnpm new-post easytier-rustdesk "使用 EasyTier 和 RustDesk 搭建远程桌面"
```

脚本会创建：

```text
src/content/posts/easytier-rustdesk/index.md
```

`slug` 只能包含字母、数字和用于分隔单词的连字符。新文章默认是中文草稿。

## 文章 Frontmatter

```yaml
---
title: 我的第一篇文章
published: 2026-08-09
updated: 2026-08-09
description: 文章摘要
image: ./cover.png
tags:
  - Astro
  - 博客
category: 开发
draft: true
lang: zh_CN
---
```

完整字段、图片路径和 Markdown 扩展说明见[文章与内容开发](./docs/3-文章与内容开发.md)。

## 常用命令

所有命令都在仓库根目录执行。

| 命令 | 作用 | 是否修改文件 |
| --- | --- | --- |
| `pnpm install` | 安装依赖 | 是 |
| `pnpm dev` | 启动 Astro 开发服务器 | 否 |
| `pnpm cms` | 启动 Sveltia CMS 本地管理界面 | 否 |
| `pnpm new-post <slug> [标题]` | 创建 page bundle 格式的草稿文章 | 是 |
| `pnpm check` | 运行 Astro 类型和内容诊断 | 否 |
| `pnpm type-check` | 运行 TypeScript 声明检查 | 否 |
| `pnpm build` | 构建站点并生成 Pagefind 索引 | 是，生成 `dist/` |
| `pnpm preview` | 预览生产构建 | 否 |
| `pnpm lint` | 使用 Biome 检查并自动修复 `src/` | 是 |
| `pnpm format` | 格式化 `src/` | 是 |

## 构建和部署

发布前运行：

```bash
pnpm check
pnpm build
pnpm preview
```

`pnpm build` 会先运行 Astro 静态构建，再为 `dist/` 生成 Pagefind 搜索索引。推送到 `main` 分支后，[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) 会构建并部署 GitHub Pages。

## 开发文档

- [开发文档索引](./docs/0_index.md)
- [开发环境与常用命令](./docs/1-开发环境与常用命令.md)
- [工程结构与模块职责](./docs/2-工程结构与模块职责.md)
- [文章与内容开发](./docs/3-文章与内容开发.md)
- [站点配置与主题定制](./docs/4-站点配置与主题定制.md)
- [构建、检查与部署](./docs/5-构建检查与部署.md)
- [私人博客使用指南](./docs/6-私人博客使用指南.md)

## 模板与许可

本项目基于 [Fuwari](https://github.com/saicaca/fuwari) 修改，源码按照仓库中的 [MIT License](./LICENSE) 提供。
