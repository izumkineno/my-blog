/* This is a script to create a new post markdown file with front-matter */

import fs from "node:fs";
import path from "node:path";

function getDate() {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error(`错误：未提供文章 slug
用法：pnpm new-post <slug> [标题]`);
	process.exit(1);
}

const slug = args[0];
if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) {
	console.error("错误：slug 只能包含字母、数字和用于分隔单词的连字符");
	process.exit(1);
}

const title = args.slice(1).join(" ") || slug;
const targetDir = path.join("src", "content", "posts", slug);
const fullPath = path.join(targetDir, "index.md");

if (fs.existsSync(fullPath)) {
	console.error(`错误：文章 ${fullPath} 已存在`);
	process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

const content = `---
title: ${JSON.stringify(title)}
published: ${getDate()}
description: ""
image: ""
tags: []
category: ""
draft: true
lang: zh_CN
---
`;

fs.writeFileSync(fullPath, content, "utf8");

console.log(`已创建文章：${fullPath}`);
