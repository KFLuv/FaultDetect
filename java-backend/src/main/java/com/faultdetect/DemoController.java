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
        return failure();
    }

    @PostMapping(value = "/demo/api/post-error", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> postError() {
        return failure();
    }

    private ResponseEntity<Map<String, Object>> failure() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("code", 500);
        result.put("message", "DemoServiceException: 模拟订单查询失败");
        return ResponseEntity.status(500)
                .contentType(MediaType.APPLICATION_JSON)
                .body(result);
    }
}
