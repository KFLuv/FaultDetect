package com.faultdetect;

import com.faultdetect.DetectEngine.DetectionResult;
import com.faultdetect.Knowledge.Scenario;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

/**
 * API 控制器（接口与 Python 版完全一致）
 *   GET  /api/health          健康检查
 *   GET  /api/selfcheck       【自检】观测层可信度一键校验（独立真值 vs 系统实测）
 *   GET  /api/status-codes    59 个状态码
 *   GET  /api/scenarios       132 个场景（支持 ?code= 过滤）
 *   POST /api/detect          执行故障检测
 *   POST /api/add-scenario    新增场景
 *   GET  /api/history         检测历史
 *   GET  /api/stats           统计信息
 * 前端页面由 src/main/resources/static 静态资源提供（/ 与 /static/*）
 */
@RestController
public class ApiController {

    private static final AtomicLong REPORT_SEQUENCE = new AtomicLong();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Knowledge knowledge;
    private final DetectEngine detectEngine;
    private final MatcherEngine matcherEngine;
    private final HistoryRepository history;
    /** 【P1】差分隔离层：对同一 URL 跑对照实验并推导结论 */
    private final ContrastProbe contrastProbe;
    /** 【自检】观测层可信度校验：用独立实现（HttpURLConnection）对内置测试服务取真值，与被测实现对比 */
    private final SelfCheckService selfCheckService;

    public ApiController(Knowledge knowledge, DetectEngine detectEngine,
                         MatcherEngine matcherEngine, HistoryRepository history,
                         ContrastProbe contrastProbe, SelfCheckService selfCheckService) {
        this.knowledge = knowledge;
        this.detectEngine = detectEngine;
        this.matcherEngine = matcherEngine;
        this.history = history;
        this.contrastProbe = contrastProbe;
        this.selfCheckService = selfCheckService;
    }

    // ================= 请求模型 =================

    public static class DetectRequest {
        public String url;
        public String symptom = "";
        public boolean enable_service_check = true;
        public int timeout = 10;
        public Map<String, String> headers;   // 可选：自定义请求头（Token/Cookie 等）
        /**
         * 【P1】是否启用差分隔离实验，默认开启。
         * 开启后会在检测主流程之外，对同一 URL 串行追加最多 7 次只读对照请求：
         * 去 Authorization、去全部自定义头、换 HEAD、换协议、追加随机参数各 1 次，另加原样重放 2 次。
         * 全部为幂等方法（GET / HEAD），不会对目标产生写操作。
         */
        public boolean enable_contrast = true;
        /**
         * 【P3】是否请求可选 LLM 增强层，默认关闭。
         * 需要同时满足：本字段为 true + 后端 faultdetect.llm.enabled=true + 已配置 endpoint。
         * 不满足时不会发起任何外部请求；内网不可达 / 调用失败会自动降级为纯规则结论，不影响检测结果。
         */
        public boolean enable_llm = false;
        /** 用户必须确认已获得目标系统授权，避免把工具误用到未授权系统。 */
        public boolean authorized_target = false;
    }

    public static class AddScenarioRequest {
        public String name;
        public List<String> http_codes;
        public List<String> response_patterns = new ArrayList<>();
        public List<String> ui_symptoms = new ArrayList<>();
        public String root_cause = "backend";
        public String conclusion = "";
        public List<String> solution = new ArrayList<>();
        public String priority = "中";
    }

    public static class ScenarioPreviewRequest extends AddScenarioRequest {
        public String test_status = "";
        public String test_response = "";
        public String test_symptom = "";
    }

    public static class CaseUpdateRequest {
        public String status;
        public String owner = "";
        public String note = "";
        public String closed_reason = "";
    }

    public static class UnknownPromotionRequest {
        public String scenario_name = "";
        public String root_cause;
        public String conclusion;
        public String owner = "";
        public List<String> evidence = new ArrayList<>();
        public List<String> solution = new ArrayList<>();
        public List<String> response_patterns = new ArrayList<>();
        public List<String> ui_symptoms = new ArrayList<>();
    }

    // ================= 辅助 =================

    private static final Pattern HEADER_NAME = Pattern.compile("^[A-Za-z0-9-]+$");

    /**
     * 校验自定义请求头：名称只允许字母/数字/连字符，值禁止换行（防 header 注入）。
     * 返回规范化后的请求头；null 表示未提供。
     */
    private Map<String, String> validateHeaders(Map<String, String> headers) {
        if (headers == null || headers.isEmpty()) {
            return null;
        }
        Map<String, String> clean = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            String k = e.getKey();
            String v = e.getValue();
            if (k == null || !HEADER_NAME.matcher(k).matches()) {
                throw new ApiException(400, "请求头名称不合法：" + k);
            }
            if (v != null && (v.contains("\r") || v.contains("\n"))) {
                throw new ApiException(400, "请求头值包含非法字符：" + k);
            }
            clean.put(k, v == null ? "" : v);
        }
        return clean;
    }

    private List<Scenario> allScenarios() {
        List<Scenario> all = new ArrayList<>(knowledge.scenarios);
        all.addAll(history.getCustomScenarios());
        return all;
    }

    private Scenario buildScenario(AddScenarioRequest req, String id) {
        Scenario sc = new Scenario();
        sc.id = id;
        sc.name = req.name;
        sc.http_codes = req.http_codes.stream().map(String::valueOf).collect(Collectors.toList());
        sc.response_patterns = req.response_patterns == null ? new ArrayList<>() : req.response_patterns;
        sc.ui_symptoms = req.ui_symptoms == null ? new ArrayList<>() : req.ui_symptoms;
        sc.root_cause = req.root_cause;
        sc.conclusion = (req.conclusion == null || req.conclusion.trim().isEmpty()) ? req.name : req.conclusion;
        sc.evidence = Collections.singletonList("（自定义场景）请按 SOP 手动补充证据");
        sc.solution = (req.solution == null || req.solution.isEmpty())
                ? Collections.singletonList("联系研发确认处理方案") : req.solution;
        sc.probability = 0.9;
        sc.priority = req.priority == null ? "中" : req.priority;
        sc.custom = true;
        return sc;
    }

    private static String now() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
    }

    private static String nowCompact() {
        long seq = REPORT_SEQUENCE.updateAndGet(v -> v >= 999 ? 1 : v + 1);
        return new SimpleDateFormat("yyyyMMddHHmmssSSS").format(new Date())
                + String.format("%03d", seq);
    }

    private static String redactUrl(String url) {
        if (url == null) {
            return "";
        }
        String redacted = url.replaceAll(
                "(?i)([?&](?:token|access_token|api_key|key|password|passwd|secret|session|auth)[^=]*=)[^&#]*",
                "$1***");
        return redacted.replaceAll("(?<=://)[^/@:]+:[^/@]+@", "***@");
    }

    // ================= 接口 =================

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "ok");
        m.put("version", "1.3.2");
        m.put("security_mode", "local-only");
        m.put("total_scenarios", allScenarios().size());
        m.put("total_status_codes", knowledge.statusCodes.size());
        return m;
    }

    /**
     * 【自检】一键校验「观测层」是否可信。
     *
     * 逻辑：内置一个仅绑 127.0.0.1 的极简测试服务，构造 200 / 404 / 500 / GBK 编码 / 挂起超时 /
     * 端口无人监听 / 域名无法解析 等用例；对每个用例分别用两套互不依赖的实现各探测一次 ——
     * 真值走 java.net.HttpURLConnection，被测走 DetectEngine（java.net.http.HttpClient），
     * 最后比对两者是否给出同一结论，输出一致率与逐条明细。
     *
     * 用途：让使用者可以随时自行验证「系统查得准不准」，而不必依赖口头承诺。
     * 安全：全部为 GET 只读请求，测试服务随本次调用结束即关闭，不读写任何业务数据。
     */
    @GetMapping("/api/selfcheck")
    public Map<String, Object> selfCheck() {
        return selfCheckService.run();
    }

    @GetMapping("/api/status-codes")
    public Map<String, Object> statusCodes() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", knowledge.statusCodes.size());
        m.put("status_codes", knowledge.statusCodes);
        return m;
    }

    @GetMapping("/api/scenarios")
    public Map<String, Object> scenarios(@RequestParam(required = false) String code) {
        List<Scenario> list = allScenarios();
        if (code != null && !code.isEmpty()) {
            list = list.stream()
                    .filter(s -> s.http_codes != null && s.http_codes.contains(code))
                    .collect(Collectors.toList());
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", list.size());
        m.put("category_labels", knowledge.categoryLabels);
        m.put("category_colors", knowledge.categoryColors);
        m.put("scenarios", list);
        return m;
    }

    @PostMapping("/api/detect")
    public Map<String, Object> detect(@RequestBody DetectRequest req) {
        if (req.url == null || req.url.trim().isEmpty()) {
            throw new ApiException(400, "URL 不能为空");
        }
        if (!req.authorized_target) {
            throw new ApiException(400, "请先确认已获得目标系统的诊断授权");
        }
        String url = req.url.trim();
        // 先校验 URL（不合法直接 400，与 Python 版一致）
        detectEngine.parseUrl(url);

        int timeout = Math.max(3, Math.min(req.timeout, 30));
        Map<String, String> headers = validateHeaders(req.headers);
        String symptom = req.symptom == null ? "" : req.symptom;
        String historyUrl = redactUrl(url);
        String reportId = "RPT_" + nowCompact();
        history.startCase(reportId, historyUrl, symptom);

        try {
            DetectionResult dr = detectEngine.runDetection(
                    url, req.enable_service_check, true, timeout, headers);
            if (req.enable_contrast && dr.error == null) {
                contrastProbe.run(dr, headers, timeout);
            }
            Map<String, Object> report = matcherEngine.buildReport(
                    dr, symptom, 3, req.enable_llm);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("report_id", reportId);
            out.put("timestamp", now());
            out.put("input_url", url);
            out.put("status_code", report.get("status_code"));
            out.put("status_text", report.get("status_text"));
            out.put("steps", report.get("steps"));
            out.put("evidence_chain", report.get("evidence_chain"));
            out.put("conclusion", report.get("conclusion"));
            out.put("report", report.get("report"));
            out.put("key_info", report.get("key_info"));
            out.put("contrast", dr.contrast == null ? Collections.emptyMap() : dr.contrast);
            out.put("hypotheses", report.get("hypotheses"));
            out.put("llm", report.get("llm"));
            out.put("unknown_mode", report.get("unknown_mode"));

            if (report.containsKey("error")) {
                history.failCase(reportId, String.valueOf(report.get("error")));
            } else {
                @SuppressWarnings("unchecked")
                Map<String, Object> conclusion = (Map<String, Object>) report.get("conclusion");
                Map<String, Object> persistedReport = new LinkedHashMap<>(out);
                persistedReport.put("input_url", historyUrl);
                history.completeCase(reportId, historyUrl, symptom,
                        String.valueOf(report.get("status_code")), conclusion,
                        MAPPER.writeValueAsString(persistedReport));
            }
            return out;
        } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException e) {
            history.failCase(reportId, e.getMessage());
            throw new ApiException(500, "诊断任务失败：" + e.getMessage());
        }
    }

    @PostMapping("/api/add-scenario")
    public Map<String, Object> addScenario(@RequestBody AddScenarioRequest req) {
        if (req.name == null || req.name.trim().isEmpty()) {
            throw new ApiException(400, "场景名称不能为空");
        }
        if (req.http_codes == null || req.http_codes.isEmpty()) {
            throw new ApiException(400, "至少需要一个状态码");
        }
        if (req.root_cause == null || !knowledge.categoryLabels.containsKey(req.root_cause)) {
            throw new ApiException(400, "问题归属不合法");
        }

        int maxId = 0;
        for (Scenario s : allScenarios()) {
            try {
                maxId = Math.max(maxId, Integer.parseInt(s.id.split("_")[1]));
            } catch (Exception ignored) {
                // 非 SCN_xxx 格式则忽略
            }
        }
        Scenario sc = buildScenario(req, String.format("SCN_%03d", maxId + 1));

        history.addCustomScenario(sc);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("scenario", sc);
        out.put("total", allScenarios().size());
        return out;
    }

    @PostMapping("/api/scenario-preview")
    public Map<String, Object> previewScenario(@RequestBody ScenarioPreviewRequest req) {
        if (req.name == null || req.name.trim().isEmpty()) {
            throw new ApiException(400, "场景名称不能为空");
        }
        if (req.http_codes == null || req.http_codes.isEmpty()) {
            throw new ApiException(400, "至少需要一个状态码");
        }
        if (req.test_status == null || req.test_status.trim().isEmpty()) {
            throw new ApiException(400, "请填写用于验证的状态码");
        }

        String testStatus = req.test_status.trim();
        String response = req.test_response == null ? "" : req.test_response.trim();
        String symptom = req.test_symptom == null ? "" : req.test_symptom.trim();
        List<String> features = response.isEmpty() ? Collections.emptyList() : Collections.singletonList(response);
        Scenario preview = buildScenario(req, "PREVIEW");
        MatcherEngine.ScoreResult previewScore = matcherEngine.scoreScenario(preview, testStatus, features, symptom);

        Scenario bestCompetitor = null;
        MatcherEngine.ScoreResult bestCompetitorScore = null;
        for (Scenario scenario : allScenarios()) {
            MatcherEngine.ScoreResult score = matcherEngine.scoreScenario(scenario, testStatus, features, symptom);
            if (score.score <= 0) continue;
            boolean better = bestCompetitorScore == null
                    || score.score > bestCompetitorScore.score
                    || (score.score == bestCompetitorScore.score
                    && Boolean.TRUE.equals(scenario.custom)
                    && !Boolean.TRUE.equals(bestCompetitor.custom));
            if (better) {
                bestCompetitor = scenario;
                bestCompetitorScore = score;
            }
        }

        double confidence = matcherEngine.confidenceFromScore(previewScore.score);
        boolean beatsCompetitor = bestCompetitorScore == null
                || previewScore.score >= bestCompetitorScore.score;
        boolean wouldMatch = confidence >= com.faultdetect.HypothesisEngine.FAST_PATH_MIN_CONFIDENCE
                && beatsCompetitor;

        List<String> advice = new ArrayList<>();
        if (response.isEmpty() && symptom.isEmpty()) {
            advice.add("补充响应特征或界面症状，否则无法与同状态码的内置场景区分。");
        }
        if (!beatsCompetitor && bestCompetitor != null) {
            advice.add("当前示例会优先命中已有场景「" + bestCompetitor.name + "」，请增加更具体的关键词。");
        }
        if (!wouldMatch && advice.isEmpty()) {
            advice.add("当前置信度不足，保存后不会直接成为主结论。");
        }
        if (wouldMatch) {
            advice.add("当前示例会命中该自定义场景，可以保存。");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("would_match", wouldMatch);
        result.put("score", previewScore.score);
        result.put("confidence", confidence);
        result.put("reasons", previewScore.reasons);
        result.put("advice", advice);
        Map<String, Object> competitor = new LinkedHashMap<>();
        competitor.put("id", bestCompetitor == null ? "" : bestCompetitor.id);
        competitor.put("name", bestCompetitor == null ? "无" : bestCompetitor.name);
        competitor.put("score", bestCompetitorScore == null ? 0 : bestCompetitorScore.score);
        competitor.put("custom", bestCompetitor != null && Boolean.TRUE.equals(bestCompetitor.custom));
        result.put("best_competitor", competitor);
        return result;
    }

    @GetMapping("/api/history")
    public Map<String, Object> history(@RequestParam(defaultValue = "30") int limit) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("history", history.listHistory(limit));
        return m;
    }

    @GetMapping("/api/history/{reportId}")
    public Map<String, Object> historyDetail(@PathVariable String reportId) {
        Map<String, Object> report = history.getReport(reportId);
        if (report == null) {
            throw new ApiException(404, "报告不存在或已删除");
        }
        return report;
    }

    @PostMapping("/api/history/{reportId}/follow-up")
    public Map<String, Object> updateFollowUp(@PathVariable String reportId,
                                              @RequestBody CaseUpdateRequest req) {
        String status = req.status == null ? "" : req.status.trim();
        if (!List.of("new", "in_progress", "waiting_confirmation", "fixed", "closed").contains(status)) {
            throw new ApiException(400, "任务状态不合法");
        }
        if ("closed".equals(status)
                && (req.closed_reason == null || req.closed_reason.trim().isEmpty())) {
            throw new ApiException(400, "关闭任务时必须填写关闭原因");
        }
        boolean updated = history.updateFollowUp(
                reportId, status,
                req.owner == null ? "" : req.owner.trim(),
                req.note == null ? "" : req.note.trim(),
                req.closed_reason == null ? "" : req.closed_reason.trim());
        if (!updated) {
            throw new ApiException(404, "报告不存在或已删除");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("report_id", reportId);
        out.put("case_status", status);
        return out;
    }

    @DeleteMapping("/api/history/{reportId}")
    public Map<String, Object> deleteHistory(@PathVariable String reportId) {
        boolean deleted = history.deleteHistory(reportId);
        if (!deleted) {
            throw new ApiException(404, "报告不存在或已删除");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("history_count", history.listHistory(9999).size());
        return out;
    }

    @GetMapping("/api/history/{reportId}/export")
    public ResponseEntity<byte[]> exportHistory(@PathVariable String reportId,
                                                @RequestParam(defaultValue = "json") String format)
            throws Exception {
        Map<String, Object> report = history.getReport(reportId);
        if (report == null) {
            throw new ApiException(404, "报告不存在或已删除");
        }
        boolean markdown = "markdown".equalsIgnoreCase(format) || "md".equalsIgnoreCase(format);
        byte[] body = (markdown ? toMarkdown(reportId, report)
                : MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(report))
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String filename = reportId + (markdown ? ".md" : ".json");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(markdown
                ? MediaType.parseMediaType("text/markdown; charset=UTF-8")
                : MediaType.APPLICATION_JSON);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setCacheControl("no-store");
        return ResponseEntity.ok().headers(headers).body(body);
    }

    @PostMapping("/api/history/{reportId}/promote-unknown")
    @SuppressWarnings("unchecked")
    public Map<String, Object> promoteUnknown(@PathVariable String reportId,
                                              @RequestBody UnknownPromotionRequest req) {
        Map<String, Object> report = history.getReport(reportId);
        if (report == null) {
            throw new ApiException(404, "报告不存在或已删除");
        }
        Object unknownObj = report.get("unknown_mode");
        if (!(unknownObj instanceof Map)
                || !Boolean.TRUE.equals(((Map<String, Object>) unknownObj).get("active"))) {
            throw new ApiException(400, "只有未知场景模式生成的报告可以执行此操作");
        }
        if (req.root_cause == null || !knowledge.categoryLabels.containsKey(req.root_cause)) {
            throw new ApiException(400, "最终根因归属不合法");
        }
        if (req.conclusion == null || req.conclusion.trim().isEmpty()) {
            throw new ApiException(400, "最终根因说明不能为空");
        }

        int maxId = 0;
        for (Scenario s : allScenarios()) {
            try {
                maxId = Math.max(maxId, Integer.parseInt(s.id.split("_")[1]));
            } catch (Exception ignored) {
            }
        }
        Scenario sc = new Scenario();
        sc.id = String.format("SCN_%03d", maxId + 1);
        sc.name = req.scenario_name == null || req.scenario_name.trim().isEmpty()
                ? "未知现场问题归档 " + reportId
                : req.scenario_name.trim();
        String reportStatus = String.valueOf(report.getOrDefault("status_code", "pending"));
        sc.http_codes = List.of(reportStatus);
        sc.response_patterns = req.response_patterns == null
                ? new ArrayList<>() : req.response_patterns;
        sc.ui_symptoms = req.ui_symptoms == null
                ? new ArrayList<>() : req.ui_symptoms;
        sc.root_cause = req.root_cause;
        sc.conclusion = req.conclusion.trim();
        sc.evidence = req.evidence == null || req.evidence.isEmpty()
                ? List.of("来自未知场景报告 " + reportId) : req.evidence;
        sc.solution = req.solution == null || req.solution.isEmpty()
                ? List.of("按最终根因修复，并使用该报告重新回归") : req.solution;
        sc.probability = 1.0;
        sc.priority = "高";
        sc.custom = true;
        history.addCustomScenario(sc);

        Map<String, Object> ruleCandidate = new LinkedHashMap<>();
        ruleCandidate.put("report_id", reportId);
        ruleCandidate.put("scenario_id", sc.id);
        ruleCandidate.put("root_cause", sc.root_cause);
        ruleCandidate.put("conclusion", sc.conclusion);
        ruleCandidate.put("status_code", reportStatus);
        ruleCandidate.put("evidence", sc.evidence);
        ruleCandidate.put("review_status", "pending");
        ruleCandidate.put("created_at", now());
        history.addRuleCandidate(ruleCandidate);

        history.promoteCase(reportId, sc.id, sc.conclusion,
                req.owner == null ? "" : req.owner.trim(),
                "未知问题已解决，自动归档为场景 " + sc.id
                        + "；通用规则候选等待人工审核");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("scenario", sc);
        out.put("rule_candidate", ruleCandidate);
        out.put("message", "已加入自定义场景库，并生成待审核的规则候选");
        return out;
    }

    /** 一键清空检测历史记录 */
    @DeleteMapping("/api/history")
    public Map<String, Object> clearHistory() {
        history.clearHistory();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "ok");
        m.put("history_count", history.listHistory(9999).size());
        return m;
    }

    @GetMapping("/api/stats")
    public Map<String, Object> stats() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total_scenarios", allScenarios().size());
        m.put("total_status_codes", knowledge.statusCodes.size());
        m.put("custom_scenarios", history.getCustomScenarios().size());
        m.put("history_count", history.listHistory(9999).size());
        m.put("category_labels", knowledge.categoryLabels);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static String toMarkdown(String reportId, Map<String, Object> report) {
        Map<String, Object> conclusion =
                (Map<String, Object>) report.getOrDefault("conclusion", Collections.emptyMap());
        Map<String, Object> reportText =
                (Map<String, Object>) report.getOrDefault("report", Collections.emptyMap());
        StringBuilder md = new StringBuilder();
        md.append("# FaultDetect 诊断报告\n\n");
        md.append("- 报告号：").append(reportId).append('\n');
        md.append("- 时间：").append(report.getOrDefault("timestamp", "—")).append('\n');
        md.append("- URL：").append(report.getOrDefault("input_url", "—")).append('\n');
        md.append("- 状态码：").append(report.getOrDefault("status_code", "—")).append('\n');
        md.append("- 归属：").append(conclusion.getOrDefault("root_cause_label", "未确定")).append('\n');
        Object confidence = conclusion.get("confidence");
        if (confidence instanceof Number) {
            md.append("- 置信度：").append(Math.round(((Number) confidence).doubleValue() * 100)).append("%\n");
        }
        md.append("\n## 现象\n\n").append(reportText.getOrDefault("phenomenon", "—")).append('\n');
        md.append("\n## 排查过程\n\n").append(reportText.getOrDefault("checked", "—")).append('\n');
        md.append("\n## 结论\n\n").append(reportText.getOrDefault("conclusion", "—")).append('\n');
        Object hypotheses = report.get("hypotheses");
        if (hypotheses instanceof List && !((List<?>) hypotheses).isEmpty()) {
            md.append("\n## 候选假设\n\n");
            for (Object item : (List<?>) hypotheses) {
                if (item instanceof Map) {
                    Map<String, Object> h = (Map<String, Object>) item;
                    Object hc = h.get("confidence");
                    int pct = hc instanceof Number
                            ? (int) Math.round(((Number) hc).doubleValue() * 100) : 0;
                    md.append("- **").append(h.getOrDefault("title", "未命名假设")).append("**（")
                            .append(pct).append("%）：")
                            .append(h.getOrDefault("description", "")).append('\n');
                }
            }
        }
        md.append("\n---\n\n本报告用于排障辅助，最终根因仍需结合现场日志、数据库与业务规则复核。\n");
        return md.toString();
    }
}
