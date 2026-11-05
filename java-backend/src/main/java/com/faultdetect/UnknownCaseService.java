package com.faultdetect;

import com.faultdetect.DetectEngine.DetectionResult;
import com.faultdetect.HypothesisEngine.Hypothesis;
import com.faultdetect.HypothesisEngine.InferenceResult;
import com.faultdetect.Knowledge.Scenario;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 未知场景模式：当知识库没有高置信命中时，不强行套用候选场景，
 * 而是生成现场采集清单、分层排除状态、下一项只读实验和研发交接包。
 */
@Component
public class UnknownCaseService {

    public Map<String, Object> build(DetectionResult dr, String symptom,
                                     Scenario candidate, double candidateConfidence,
                                     InferenceResult inference) {
        boolean active = candidate == null
                || candidateConfidence < HypothesisEngine.FAST_PATH_MIN_CONFIDENCE;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("active", active);
        out.put("match_suppressed", active);
        out.put("threshold", HypothesisEngine.FAST_PATH_MIN_CONFIDENCE);
        out.put("reason", active
                ? "没有达到高置信阈值的场景，候选场景只作为参考，不作为结论"
                : "已命中高置信场景，不需要进入未知场景模式");
        if (!active) {
            return out;
        }

        String symptomText = symptom == null ? "" : symptom.trim();
        String body = dr.probe == null || dr.probe.body == null
                ? "" : dr.probe.body;
        String lowerBody = body.toLowerCase(Locale.ROOT);
        String status = dr.normalizedStatus == null ? "" : dr.normalizedStatus;
        Integer statusCode = dr.probe == null ? null : dr.probe.statusCode;
        boolean hasResponse = statusCode != null;
        boolean authExcluded = authExcluded(dr);
        boolean authSignal = statusCode != null && (statusCode == 401 || statusCode == 403)
                || hasAny(lowerBody, "unauthorized", "forbidden", "token", "未登录", "无权限");
        boolean dataSignal = hasAny(lowerBody,
                "sqlexception", "sql syntax", "duplicate", "unique constraint",
                "toomanyresults", "empty", "数据库", "空数组");
        boolean businessSignal = hasResponse && (
                statusCode >= 400 || hasAny(lowerBody,
                        "business", "业务异常", "validation", "参数", "message"));
        boolean frontendSignal = statusCode != null && statusCode >= 200 && statusCode < 300
                && body.length() > 0
                && hasAny(symptomText.toLowerCase(Locale.ROOT),
                        "页面", "渲染", "按钮", "样式", "白屏", "空白", "点击");

        List<Map<String, Object>> layers = new ArrayList<>();
        if (dr.service == null) {
            layers.add(layer("port", "端口", "unconfirmed",
                    "本次未启用 TCP 检查", "确认目标主机和端口，必要时补做端口检查"));
        } else if (dr.service.ok) {
            layers.add(layer("port", "端口", "ruled_out",
                    dr.service.detail, "端口已连通，转向服务与 HTTP 层"));
        } else {
            layers.add(layer("port", "端口", "suspected",
                    dr.service.detail, "确认进程、监听地址、防火墙和安全组"));
        }

        if (!hasResponse) {
            layers.add(layer("service", "服务", "suspected",
                    "没有获得 HTTP 响应", "检查服务是否启动、是否绑定正确地址"));
        } else if (statusCode == 502 || statusCode == 503 || statusCode == 504) {
            layers.add(layer("service", "服务", "suspected",
                    "网关返回 " + statusCode, "检查后端实例、上游地址与网关超时"));
        } else {
            layers.add(layer("service", "服务", "ruled_out",
                    "服务已返回 HTTP 响应", "继续分析 HTTP 与业务响应"));
        }

        layers.add(layer("http", "HTTP", hasResponse ? "observed" : "unconfirmed",
                hasResponse ? "状态码 " + statusCode + "，耗时 "
                        + (dr.probe.responseTimeMs == null ? "-" : dr.probe.responseTimeMs + "ms")
                        : "未取得状态码",
                hasResponse ? "结合响应体和差分实验继续判断" : "先排查网络与目标服务"));

        if (authExcluded) {
            layers.add(layer("auth", "鉴权", "ruled_out",
                    "差分实验显示鉴权层已通过", "转向业务、数据与下游"));
        } else if (authSignal) {
            layers.add(layer("auth", "鉴权", "suspected",
                    "出现 401/403 或认证关键词", "补做去 Authorization 对照并核对身份与权限"));
        } else {
            layers.add(layer("auth", "鉴权", "unconfirmed",
                    "当前证据不足以确认鉴权状态", "确认是否使用登录态，并做鉴权隔离对照"));
        }

        layers.add(layer("business", "业务", businessSignal ? "suspected" : "unconfirmed",
                businessSignal ? "状态码或响应内容显示业务异常" : "尚未取得业务规则层证据",
                "核对业务码、错误消息、参数与业务规则"));
        layers.add(layer("data", "数据", dataSignal ? "suspected" : "unconfirmed",
                dataSignal ? "响应包含数据库、重复数据或空数据线索" : "尚未确认数据层状态",
                "用只读查询核对数据量、唯一键与数据库日志"));
        layers.add(layer("frontend", "前端", frontendSignal ? "suspected" : "unconfirmed",
                frontendSignal ? "接口成功但症状指向页面展示" : "尚不能区分前端和接口问题",
                "比较直连后端响应与浏览器页面渲染结果"));

        List<String> ruledOut = new ArrayList<>();
        List<String> suspected = new ArrayList<>();
        List<String> unconfirmed = new ArrayList<>();
        for (Map<String, Object> item : layers) {
            String state = String.valueOf(item.get("status"));
            String label = String.valueOf(item.get("label"));
            if ("ruled_out".equals(state)) {
                ruledOut.add(label);
            } else if ("suspected".equals(state)) {
                suspected.add(label);
            } else if (!"observed".equals(state)) {
                unconfirmed.add(label);
            }
        }

        out.put("site_checklist", siteChecklist(dr, symptomText));
        out.put("layers", layers);
        out.put("ruled_out", ruledOut);
        out.put("suspected", suspected);
        out.put("unconfirmed", unconfirmed);
        out.put("next_experiments", nextExperiments(dr, symptomText, authExcluded,
                dataSignal, frontendSignal, statusCode));
        out.put("hypotheses", hypothesisPreview(inference));
        out.put("candidate", candidate == null ? null : candidatePreview(candidate, candidateConfidence));
        out.put("handoff", handoff(dr, symptomText, ruledOut, suspected,
                unconfirmed, inference, candidate));
        out.put("promotion_defaults", promotionDefaults(dr, symptomText, inference));
        return out;
    }

    private static List<Map<String, Object>> siteChecklist(DetectionResult dr, String symptom) {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(check("url", "故障 URL", dr.parsed != null, "记录完整路径，不记录真实凭证"));
        list.add(check("symptom", "预期结果与实际结果", !symptom.isBlank(), "说明应该出现什么、实际出现什么"));
        list.add(check("scope", "影响范围", false, "是单人、单部门还是全局"));
        list.add(check("reproduce", "复现率与触发条件", false, "稳定复现 / 偶发 / 只出现一次"));
        list.add(check("status", "状态码与响应体", dr.probe != null && dr.probe.statusCode != null,
                "包含业务码、message 和异常类"));
        list.add(check("trace", "请求 ID / Trace ID", false, "用于关联网关与后端日志"));
        list.add(check("logs", "后端与网关日志", false, "记录时间窗口和日志位置"));
        list.add(check("change", "最近变更", false, "发版、配置、证书、网络或权限变更"));
        list.add(check("contrast", "只读差分实验", dr.contrast != null
                && dr.contrast.experiments != null && !dr.contrast.experiments.isEmpty(),
                "记录对照组与差异"));
        return list;
    }

    private static List<Map<String, Object>> nextExperiments(
            DetectionResult dr, String symptom, boolean authExcluded,
            boolean dataSignal, boolean frontendSignal, Integer statusCode) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (dr.contrast == null || dr.contrast.experiments.isEmpty()) {
            list.add(experiment("P0", "开启只读差分实验",
                    "对同一 URL 执行去认证头、HEAD、原样重放等对照",
                    "观察故障是否随单个变量变化", "只读"));
        }
        if (!authExcluded) {
            list.add(experiment("P0", "鉴权隔离",
                    "移除 Authorization，其余请求保持不变",
                    "401/403 变化说明鉴权层有问题", "只读"));
        }
        if (statusCode != null && statusCode >= 500) {
            list.add(experiment("P1", "后端日志关联",
                    "按发生时间与 Trace ID 提取第一条业务包异常",
                    "获得异常类、方法名和 Caused by", "人工只读"));
        }
        if (dataSignal) {
            list.add(experiment("P1", "数据键对照",
                    "换一个唯一业务键或筛选条件重放同一查询",
                    "只对特定键失败说明数据或条件问题", "只读"));
        }
        if (frontendSignal) {
            list.add(experiment("P1", "前后端隔离",
                    "直连同一接口，对比浏览器请求和页面渲染",
                    "接口正常而页面异常说明问题在前端", "只读"));
        }
        list.add(experiment("P2", "原样重放",
                "不改变任何参数连续重放一次",
                "结果变化说明存在偶发、缓存或并发因素", "只读"));
        return list.subList(0, Math.min(4, list.size()));
    }

    private static Map<String, Object> handoff(
            DetectionResult dr, String symptom, List<String> ruledOut,
            List<String> suspected, List<String> unconfirmed,
            InferenceResult inference, Scenario candidate) {
        Map<String, Object> handoff = new LinkedHashMap<>();
        handoff.put("title", "FaultDetect 未知问题交接包");
        handoff.put("url", dr.parsed == null ? "" : dr.parsed.url);
        handoff.put("symptom", symptom);
        handoff.put("observed_status", dr.probe == null ? "" : dr.probe.statusText);
        handoff.put("key_info", dr.keyInfo);
        handoff.put("ruled_out", ruledOut);
        handoff.put("suspected", suspected);
        handoff.put("unconfirmed", unconfirmed);
        handoff.put("hypotheses", hypothesisPreview(inference));
        handoff.put("candidate_reference", candidate == null ? "" : candidate.name + "（仅参考）");
        handoff.put("required_evidence", List.of(
                "请求与响应的完整时间点",
                "Trace ID 或请求 ID",
                "后端日志中的异常类与第一个 Caused by",
                "影响范围与最近变更",
                "至少一组差分对照结果"
        ));
        return handoff;
    }

    private static Map<String, Object> promotionDefaults(
            DetectionResult dr, String symptom, InferenceResult inference) {
        Map<String, Object> out = new LinkedHashMap<>();
        String name = symptom.isBlank()
                ? (dr.probe == null ? "未知现场问题" : "状态码 " + dr.probe.statusText)
                : symptom;
        out.put("scenario_name", name.length() > 60 ? name.substring(0, 60) : name);
        out.put("http_codes", dr.probe != null && dr.probe.statusCode != null
                ? List.of(String.valueOf(dr.probe.statusCode))
                : List.of("pending"));
        out.put("root_cause", inference != null && inference.top != null
                ? inference.top.category : "backend");
        out.put("ui_symptoms", symptom.isBlank() ? List.of() : List.of(symptom));
        out.put("response_patterns", new ArrayList<>(dr.keyInfo.values()));
        return out;
    }

    private static List<Map<String, Object>> hypothesisPreview(InferenceResult inference) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (inference == null || inference.hypotheses == null) {
            return list;
        }
        for (Hypothesis h : inference.hypotheses.subList(0, Math.min(3, inference.hypotheses.size()))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("title", h.title);
            item.put("category", h.category);
            item.put("confidence", h.confidence);
            item.put("source", h.source);
            item.put("verify_actions", h.verify_actions);
            list.add(item);
        }
        return list;
    }

    private static Map<String, Object> candidatePreview(Scenario scenario, double confidence) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", scenario.id);
        out.put("name", scenario.name);
        out.put("confidence", confidence);
        out.put("note", "低于高置信阈值，仅作排查参考");
        return out;
    }

    private static boolean authExcluded(DetectionResult dr) {
        if (dr.contrast == null || dr.contrast.conclusions == null) {
            return false;
        }
        return dr.contrast.conclusions.stream().anyMatch(c ->
                c.derived != null && c.derived.contains("鉴权层已通过"));
    }

    private static boolean hasAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private static Map<String, Object> layer(String key, String label, String status,
                                             String evidence, String next) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("key", key);
        item.put("label", label);
        item.put("status", status);
        item.put("evidence", evidence);
        item.put("next", next);
        return item;
    }

    private static Map<String, Object> check(String id, String label,
                                             boolean collected, String hint) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("label", label);
        item.put("collected", collected);
        item.put("hint", hint);
        return item;
    }

    private static Map<String, Object> experiment(String priority, String title,
                                                  String action, String expected,
                                                  String risk) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("priority", priority);
        item.put("title", title);
        item.put("action", action);
        item.put("expected_signal", expected);
        item.put("risk", risk);
        return item;
    }
}
