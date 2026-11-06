package com.faultdetect;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 内置教学业务系统使用的本地接口。
 * 只服务演示页面，不读取或修改真实业务数据。
 */
@RestController
public class DemoController {

    @GetMapping(value = "/demo/api/ok", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> ok() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("code", 0);
        result.put("message", "查询成功");
        result.put("data", "demo-order-001");
        return result;
    }

    @GetMapping(value = "/demo/api/error", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> error() {
        return failure(500, "DemoServiceException: 模拟订单查询失败");
    }

    @GetMapping(value = "/demo/api/not-found", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> notFound() {
        return failure(404, "DemoRouteNotFound: 模拟接口不存在");
    }

    @GetMapping(value = "/demo/api/unauthorized", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> unauthorized() {
        return failure(401, "DemoTokenExpired: 模拟登录态过期");
    }

    @GetMapping(value = "/demo/api/unavailable", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> unavailable() {
        return failure(503, "DemoUpstreamUnavailable: 模拟上游服务不可用");
    }

    @GetMapping(value = "/demo/api/empty", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> empty() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("code", 0);
        result.put("message", "查询成功但数据为空");
        result.put("data", new Object[0]);
        return result;
    }

    @PostMapping(value = "/demo/api/post-error", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> postError() {
        return failure(500, "DemoServiceException: 模拟审批提交失败");
    }

    private ResponseEntity<Map<String, Object>> failure(int status, String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("code", status);
        result.put("message", message);
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(result);
    }
}
