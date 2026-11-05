#!/usr/bin/env python3
"""Local read-only targets for the FaultDetect field-task walkthrough."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/capture-test"):
            self._html(
                200,
                """<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>FaultDetect 采集测试页</title></head>
<body>
  <h1>业务系统模拟页面</h1>
  <p>点击下面的按钮，模拟一次接口请求失败。</p>
  <button id="trigger">执行订单查询</button>
  <pre id="result"></pre>
  <script>
    document.cookie = "fd_session=capture-cookie; SameSite=Lax";
    fetch("/ok?auto=1");
    document.getElementById("trigger").onclick = async () => {
      const response = await fetch("/error", {
        headers: {
          "Authorization": "Bearer capture-test-token",
          "X-Tenant": "demo-tenant"
        }
      });
      document.getElementById("result").textContent = "HTTP " + response.status;
    };
  </script>
</body>
</html>""",
            )
        elif self.path.startswith("/ok"):
            self._json(200, {"code": 0, "message": "ok", "data": {"status": "healthy"}})
        elif self.path.startswith("/missing"):
            self._json(404, {"code": 404, "message": "route not found"})
        elif self.path.startswith("/error"):
            self.server.last_request_headers = {
                "authorization": self.headers.get("Authorization", ""),
                "cookie": self.headers.get("Cookie", ""),
                "tenant": self.headers.get("X-Tenant", ""),
            }
            self._json(500, {
                "code": 500,
                "message": "java.lang.NullPointerException: service failed",
            })
        elif self.path.startswith("/debug-last-headers"):
            self._json(200, {
                "headers": getattr(self.server, "last_request_headers", {}),
            })
        elif self.path.startswith("/empty"):
            self._json(200, {"code": 0, "message": "ok", "data": []})
        elif self.path.startswith("/duplicate"):
            self._json(417, {
                "code": 417,
                "message": "TooManyResultsException: Expected one result, but found: 2",
            })
        elif self.path.startswith("/unknown-598"):
            self._json(598, {
                "code": 598,
                "message": "UnregisteredVendorStateException: state graph mismatch",
            })
        elif self.path.startswith("/unknown"):
            self._json(599, {
                "code": 599,
                "message": "VendorWidgetUnavailableException: palette cache mismatch",
            })
        else:
            self._json(200, {"code": 0, "message": "ok"})

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=UTF-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, status, html):
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=UTF-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 18080), Handler)
    print("FaultDetect mock target: http://127.0.0.1:18080")
    server.serve_forever()
