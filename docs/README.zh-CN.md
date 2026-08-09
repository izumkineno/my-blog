# 🍥Fuwari

基于 [Astro](https://astro.build) 开发的静态博客模板。

[**🖥️在线预览（Vercel）**](https://fuwari.vercel.app)

![Preview Image](https://raw.githubusercontent.com/saicaca/resource/main/fuwari/home.png)
> 开发者请先阅读[开发文档索引](./0_index.md)。

## ✨ 功能特性

- [x] 基于 Astro 和 Tailwind CSS 开发
- [x] 流畅的动画和页面过渡
- [x] 亮色 / 暗色模式
- [x] 自定义主题色和横幅图片
- [x] 响应式设计
- [ ] 评论
- [x] 搜索
- [x] 文内目录

## 👀 要求

- Node.js >= 20
- pnpm >= 9
- Git

## 🚀 使用方法 1

使用 [create-fuwari](https://github.com/L4Ph/create-fuwari) 在本地初始化项目。

```sh
# npm
npm create fuwari@latest

# yarn
yarn create fuwari

# pnpm
pnpm create fuwari@latest

# bun
bun create fuwari@latest

# deno
deno run -A npm:create-fuwari@latest
```

1. 通过配置文件 `src/config.ts` 自定义博客
2. 执行 `pnpm new-post <filename>` 创建新文章，并在 `src/content/posts/` 目录中编辑
3. 参考[官方指南](https://docs.astro.build/zh-cn/guides/deploy/)将博客部署至 Vercel, Netlify, GitHub Pages 等；部署前需编辑 `astro.config.mjs` 中的站点设置。

## 🚀 使用方法 2

1. 使用此模板[生成新仓库](https://github.com/saicaca/fuwari/generate)或 Fork 此仓库
2. 进行本地开发，Clone 新的仓库并执行 `pnpm install` 安装依赖
   - 若未安装 [pnpm](https://pnpm.io)，执行 `npm install -g pnpm`

3. 通过配置文件 `src/config.ts` 自定义博客
4. 执行 `pnpm new-post <filename>` 创建新文章，并在 `src/content/posts/` 目录中编辑
5. 参考[官方指南](https://docs.astro.build/zh-cn/guides/deploy/)将博客部署至 Vercel, Netlify, GitHub Pages 等；部署前需编辑 `astro.config.mjs` 中的站点设置。

## ⚙️ 文章 Frontmatter

```yaml
---
title: My First Blog Post
published: 2023-09-09
description: This is the first post of my new Astro blog.
image: ./cover.jpg
tags: [Foo, Bar]
category: Front-end
draft: false
lang: jp      # Set only when the post language differs from the site language in config.ts
---
```

## 🧞 指令

下列指令均需要在项目根目录执行：

| Command                   | Action                                      |
|:--------------------------|:--------------------------------------------|
| `pnpm install`            | 安装依赖                                    |
| `pnpm dev`                | 在 `localhost:4321` 启动本地开发服务器      |
| `pnpm check`              | 运行 Astro 类型与诊断检查                   |
| `pnpm type-check`         | 运行 TypeScript 声明检查                    |
| `pnpm build`              | 构建网站并生成 Pagefind 搜索索引            |
| `pnpm preview`            | 本地预览已构建的网站                        |
| `pnpm new-post <filename>` | 创建新文章                                  |
| `pnpm lint`               | 使用 Biome 检查并自动修复 `src/`            |
| `pnpm format`             | 使用 Biome 格式化 `src/`                   |
| `pnpm astro ...`           | 执行 Astro CLI 指令                         |
| `pnpm astro --help`        | 显示 Astro CLI 帮助                         |
