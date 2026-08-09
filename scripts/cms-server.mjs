import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.CMS_PORT ?? 4325);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error("CMS_PORT 必须是 1 到 65535 之间的整数");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = {
	"/index.html": {
		path: path.join(root, "cms", "index.html"),
		contentType: "text/html; charset=utf-8",
	},
	"/config.yml": {
		path: path.join(root, "cms", "config.yml"),
		contentType: "application/yaml; charset=utf-8",
	},
	"/sveltia-cms.js": {
		path: path.join(
			root,
			"node_modules",
			"@sveltia",
			"cms",
			"dist",
			"sveltia-cms.js",
		),
		contentType: "text/javascript; charset=utf-8",
	},
};

await Promise.all(
	Object.values(assets).map(async (asset) => {
		try {
			await access(asset.path);
		} catch {
			throw new Error(`CMS 资源不存在：${asset.path}`);
		}
	}),
);

// Sveltia 的本地模式通过 Chromium File System Access API 写入仓库。
// 这里只暴露固定的 CMS 资源，不提供可遍历本机文件系统的通用写入 API。
const server = createServer((request, response) => {
	if (request.method !== "GET" && request.method !== "HEAD") {
		response.writeHead(405, { Allow: "GET, HEAD" });
		response.end("Method Not Allowed");
		return;
	}

	const pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
	if (pathname === "/healthz") {
		response.writeHead(200, {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		});
		response.end(request.method === "HEAD" ? undefined : "ok");
		return;
	}

	const asset = assets[pathname === "/" ? "/index.html" : pathname];
	if (!asset) {
		response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Not Found");
		return;
	}

	response.writeHead(200, {
		"Cache-Control": "no-store",
		"Content-Type": asset.contentType,
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
	});

	if (request.method === "HEAD") {
		response.end();
		return;
	}

	const stream = createReadStream(asset.path);
	stream.on("error", (error) => response.destroy(error));
	stream.pipe(response);
});

server.listen(port, host, () => {
	console.log(`Sveltia CMS: http://${host}:${port}/`);
	console.log("请选择当前 Git 仓库根目录，以便在浏览器中直接管理文章。");
});
