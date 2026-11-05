#!/usr/bin/env python3
"""Local read-only targets for the FaultDetect field-task walkthrough."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/ok"):
            self._json(200, {"code": 0, "message": "ok", "data": {"status": "healthy"}})
        elif self.path.startswith("/missing"):
            self._json(404, {"code": 404, "message": "route not found"})
        elif self.path.startswith("/error"):
            self._json(500, {
                "code": 500,
                "message": "java.lang.NullPointerException: service failed",
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

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 18080), Handler)
    print("FaultDetect mock target: http://127.0.0.1:18080")
    server.serve_forever()
