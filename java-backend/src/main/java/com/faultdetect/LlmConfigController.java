package com.faultdetect;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/**
 * 本机 LLM 配置页接口。Key 只写入用户目录，不进入仓库、jar 或响应正文。
 */
@RestController
public class LlmConfigController {

    private static final String K_ENABLED = "faultdetect.llm.enabled";
    private static final String K_ENDPOINT = "faultdetect.llm.endpoint";
    private static final String K_API_KEY = "faultdetect.llm.api-key";
    private static final String K_MODEL = "faultdetect.llm.model";
    private static final String K_TIMEOUT = "faultdetect.llm.timeout-seconds";
    private static final String K_INSECURE = "faultdetect.llm.insecure-tls";

    private final LlmAdvisor llmAdvisor;

    public LlmConfigController(LlmAdvisor llmAdvisor) {
        this.llmAdvisor = llmAdvisor;
    }

    public static class LlmConfigRequest {
        public Boolean enabled;
        public String endpoint = "";
        public String model = "";
        public String api_key = "";
        public Boolean clear_api_key = false;
        public Integer timeout_seconds = 20;
        public Boolean insecure_tls = false;
    }

    @GetMapping("/api/config/llm")
    public Map<String, Object> get() {
        Properties props = read();
        Map<String, Object> status = llmAdvisor.configStatus();
        String key = props.getProperty(K_API_KEY, "");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "success");
        out.put("file", configFile().toString());
        out.put("enabled", Boolean.parseBoolean(props.getProperty(
                K_ENABLED, String.valueOf(status.get("enabled")))));
        out.put("endpoint", props.getProperty(K_ENDPOINT, String.valueOf(status.get("endpoint"))));
        out.put("model", props.getProperty(K_MODEL, String.valueOf(status.get("model"))));
        out.put("timeout_seconds", parseInt(
                props.getProperty(K_TIMEOUT, String.valueOf(status.get("timeout_seconds"))), 20));
        out.put("insecure_tls", Boolean.parseBoolean(props.getProperty(
                K_INSECURE, String.valueOf(status.get("insecure_tls")))));
        out.put("has_api_key", !key.isBlank());
        out.put("masked_api_key", mask(key));
        out.put("configured", !key.isBlank() && !String.valueOf(out.get("endpoint")).isBlank());
        out.put("key_source", key.isBlank() ? "none" : "file");
        return out;
    }

    @PostMapping("/api/config/llm")
    public Map<String, Object> save(@RequestBody LlmConfigRequest req) {
        validateEndpoint(req.endpoint);
        Properties props = read();
        boolean enabled = Boolean.TRUE.equals(req.enabled);
        int timeout = Math.max(5, Math.min(
                req.timeout_seconds == null ? 20 : req.timeout_seconds, 120));
        boolean insecure = Boolean.TRUE.equals(req.insecure_tls);
        String oldKey = props.getProperty(K_API_KEY, "");
        String key = Boolean.TRUE.equals(req.clear_api_key)
                ? "" : (req.api_key == null || req.api_key.isBlank() ? oldKey : req.api_key.trim());

        props.setProperty(K_ENABLED, String.valueOf(enabled));
        props.setProperty(K_ENDPOINT, req.endpoint == null ? "" : req.endpoint.trim());
        props.setProperty(K_MODEL, req.model == null ? "" : req.model.trim());
        props.setProperty(K_TIMEOUT, String.valueOf(timeout));
        props.setProperty(K_INSECURE, String.valueOf(insecure));
        if (key.isBlank()) {
            props.remove(K_API_KEY);
        } else {
            props.setProperty(K_API_KEY, key);
        }
        write(props);
        llmAdvisor.updateConfig(
                enabled, req.endpoint, key, req.model, timeout, insecure);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "success");
        out.put("message", "配置已保存并立即生效");
        out.put("file", configFile().toString());
        out.put("configured", enabled && !key.isBlank());
        out.put("has_api_key", !key.isBlank());
        out.put("masked_api_key", mask(key));
        return out;
    }

    @PostMapping("/api/config/llm/test")
    public Map<String, Object> test(@RequestBody LlmConfigRequest req) {
        validateEndpoint(req.endpoint);
        Properties props = read();
        String key = req.api_key == null || req.api_key.isBlank()
                ? props.getProperty(K_API_KEY, "") : req.api_key.trim();
        return llmAdvisor.testConnection(
                req.endpoint,
                key,
                req.model,
                req.timeout_seconds == null ? 20 : req.timeout_seconds,
                Boolean.TRUE.equals(req.insecure_tls));
    }

    private static void validateEndpoint(String endpoint) {
        if (endpoint == null || endpoint.trim().isEmpty()) {
            throw new ApiException(400, "Endpoint 不能为空");
        }
        try {
            URI uri = URI.create(endpoint.trim());
            if (!"http".equalsIgnoreCase(uri.getScheme())
                    && !"https".equalsIgnoreCase(uri.getScheme())) {
                throw new ApiException(400, "Endpoint 必须是 HTTP 或 HTTPS 地址");
            }
            if (uri.getHost() == null) {
                throw new ApiException(400, "Endpoint 缺少主机名");
            }
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "Endpoint 格式不正确");
        }
    }

    private static Path configFile() {
        return Paths.get(System.getProperty("user.home"), ".faultdetect", "application.properties");
    }

    private static Properties read() {
        Properties props = new Properties();
        Path file = configFile();
        if (!Files.exists(file)) {
            return props;
        }
        try (InputStream in = Files.newInputStream(file);
             InputStreamReader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
            props.load(reader);
        } catch (Exception e) {
            throw new ApiException(500, "读取本机 LLM 配置失败：" + e.getMessage());
        }
        return props;
    }

    private static void write(Properties props) {
        Path file = configFile();
        try {
            Files.createDirectories(file.getParent());
            List<String> keys = new ArrayList<>(props.stringPropertyNames());
            Collections.sort(keys);
            StringBuilder text = new StringBuilder();
            text.append("# FaultDetect 本机 LLM 配置\n");
            text.append("# 此文件位于用户目录，不会进入仓库\n");
            for (String key : keys) {
                text.append(key).append('=').append(props.getProperty(key, "")).append('\n');
            }
            Files.writeString(file, text.toString(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new ApiException(500, "保存本机 LLM 配置失败：" + e.getMessage());
        }
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String mask(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        if (value.length() <= 8) {
            return "****";
        }
        return value.substring(0, 2) + "****" + value.substring(value.length() - 4);
    }
}
