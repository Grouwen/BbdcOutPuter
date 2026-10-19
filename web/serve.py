#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""前端本地调试服务器（生产环境不需要它）。

它做两件事：
  1. 托管当前目录的静态文件；
  2. 把 /bbdc/* 与 /output/* 反向代理到后端，这样前端可以始终使用
     「同源相对路径」，与集成到 FastAPI 后的行为完全一致（不依赖 CORS）。

用法：
    python3 serve.py                       # 5173 端口，代理到 127.0.0.1:20056
    python3 serve.py 8080                  # 换端口
    python3 serve.py 8080 --api http://192.168.1.10:20056

注意：必须用 HTTP 打开页面，直接双击 index.html（file://）会因同源策略无法加载模块与字体。
"""
import argparse
import http.client
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
PROXY_PREFIXES = ("/bbdc/", "/output/")


class Handler(SimpleHTTPRequestHandler):
    api_base = "http://127.0.0.1:20056"

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
    }

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith((".ttf", ".woff2")):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif path.endswith((".js", ".css", ".mjs", ".html")):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ------------------------------------------------------------ 代理
    def _proxy(self):
        target = urlsplit(self.api_base)
        body = None
        length = self.headers.get("Content-Length")
        if length:
            body = self.rfile.read(int(length))

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in ("host", "connection", "accept-encoding", "content-length")
        }
        conn = http.client.HTTPConnection(target.hostname, target.port or 80, timeout=600)
        try:
            conn.request(self.command, self.path, body=body, headers=headers)
            response = conn.getresponse()
        except Exception as exc:  # 后端没起
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"后端不可达：{self.api_base}（{exc}）".encode())
            conn.close()
            return

        self.send_response(response.status)
        for key, value in response.getheaders():
            if key.lower() in ("transfer-encoding", "connection", "content-length", "content-encoding"):
                continue
            self.send_header(key, value)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        # 用 read1 逐块转发，SSE（二维码登录状态流）才能实时到达浏览器
        try:
            while True:
                chunk = response.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    def do_GET(self):
        if self.path.startswith(PROXY_PREFIXES):
            return self._proxy()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIXES):
            return self._proxy()
        self.send_error(405, "POST 仅支持 /bbdc/ 与 /output/")

    def log_message(self, fmt, *args):
        # 静态请求太啰嗦，只记录代理与异常
        if self.path.startswith(PROXY_PREFIXES):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    parser = argparse.ArgumentParser(description="前端本地调试服务器")
    parser.add_argument("port", nargs="?", type=int, default=5173, help="监听端口，默认 5173")
    parser.add_argument("--api", default="http://127.0.0.1:20056", help="后端地址，默认 http://127.0.0.1:20056")
    args = parser.parse_args()

    Handler.api_base = args.api.rstrip("/")
    handler = partial(Handler, directory=ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"前端调试：   http://127.0.0.1:{args.port}/")
    print(f"接口代理：   /bbdc/* 、/output/*  ->  {Handler.api_base}")
    print("按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
