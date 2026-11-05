package com.faultdetect;

import com.faultdetect.Knowledge.Scenario;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SQLite 任务历史、跟进状态、自定义场景持久化。
 * 数据目录：环境变量 FAULT_DETECT_DATA_DIR 指定，默认 ./data。
 */
@Component
public class HistoryRepository {

    private final Path dataDir;
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<Scenario> customScenarios = new ArrayList<>();
    private final Path customFile;

    public HistoryRepository() {
        String env = System.getenv("FAULT_DETECT_DATA_DIR");
        String dir = (env == null || env.trim().isEmpty())
                ? new File("data").getAbsolutePath() : env.trim();
        dataDir = Path.of(dir);
        try {
            Files.createDirectories(dataDir);
        } catch (Exception e) {
            throw new IllegalStateException("无法创建数据目录: " + dataDir, e);
        }
        customFile = dataDir.resolve("custom_scenarios.json");
        loadCustomScenarios();
        initDb();
        purgeExpiredHistory();
    }

    // ================= 自定义场景 =================

    private void loadCustomScenarios() {
        if (!Files.exists(customFile)) {
            return;
        }
        try {
            String json = Files.readString(customFile);
            List<Scenario> list = mapper.readValue(json,
                    mapper.getTypeFactory().constructCollectionType(List.class, Scenario.class));
            customScenarios.clear();
            if (list != null) {
                customScenarios.addAll(list);
            }
        } catch (Exception e) {
            customScenarios.clear();
        }
    }

    private void saveCustomScenarios() {
        try {
            Files.writeString(customFile,
                    mapper.writerWithDefaultPrettyPrinter()
                            .writeValueAsString(customScenarios));
        } catch (Exception e) {
            throw new IllegalStateException("保存自定义场景失败", e);
        }
    }

    public List<Scenario> getCustomScenarios() {
        return new ArrayList<>(customScenarios);
    }

    public void addCustomScenario(Scenario sc) {
        customScenarios.add(sc);
        saveCustomScenarios();
    }

    // ================= SQLite 任务历史 =================

    private Connection open() throws SQLException {
        return DriverManager.getConnection("jdbc:sqlite:" + dataDir.resolve("fault_detect.db"));
    }

    private void initDb() {
        try (Connection conn = open();
             Statement st = conn.createStatement()) {
            st.executeUpdate("CREATE TABLE IF NOT EXISTS detect_history ("
                    + "id TEXT PRIMARY KEY,"
                    + "report_id TEXT,"
                    + "ts TEXT,"
                    + "updated_at TEXT,"
                    + "url TEXT,"
                    + "symptom TEXT,"
                    + "status_code TEXT,"
                    + "root_cause TEXT,"
                    + "scenario_name TEXT,"
                    + "confidence REAL,"
                    + "report TEXT,"
                    + "full_report_json TEXT,"
                    + "case_status TEXT DEFAULT 'new',"
                    + "owner TEXT,"
                    + "follow_up_note TEXT,"
                    + "closed_reason TEXT,"
                    + "promoted_scenario_id TEXT,"
                    + "resolution_summary TEXT"
                    + ")");
            addColumnIfAbsent(conn, "report_id", "TEXT");
            addColumnIfAbsent(conn, "updated_at", "TEXT");
            addColumnIfAbsent(conn, "symptom", "TEXT");
            addColumnIfAbsent(conn, "full_report_json", "TEXT");
            addColumnIfAbsent(conn, "case_status", "TEXT DEFAULT 'new'");
            addColumnIfAbsent(conn, "owner", "TEXT");
            addColumnIfAbsent(conn, "follow_up_note", "TEXT");
            addColumnIfAbsent(conn, "closed_reason", "TEXT");
            addColumnIfAbsent(conn, "promoted_scenario_id", "TEXT");
            addColumnIfAbsent(conn, "resolution_summary", "TEXT");
            st.executeUpdate("CREATE UNIQUE INDEX IF NOT EXISTS idx_detect_history_report_id "
                    + "ON detect_history(report_id) WHERE report_id IS NOT NULL");
        } catch (SQLException e) {
            throw new IllegalStateException("初始化数据库失败", e);
        }
    }

    private void addColumnIfAbsent(Connection conn, String name, String definition) {
        try (Statement st = conn.createStatement()) {
            st.executeUpdate("ALTER TABLE detect_history ADD COLUMN " + name + " " + definition);
        } catch (SQLException ignored) {
            // 列已存在
        }
    }

    public void startCase(String reportId, String url, String symptom) {
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String now = now();
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO detect_history "
                             + "(id, report_id, ts, updated_at, url, symptom, case_status) "
                             + "VALUES (?,?,?,?,?,?, 'in_progress')")) {
            ps.setString(1, id);
            ps.setString(2, reportId);
            ps.setString(3, now);
            ps.setString(4, now);
            ps.setString(5, url);
            ps.setString(6, symptom == null ? "" : symptom);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("创建诊断任务失败", e);
        }
    }

    public void completeCase(String reportId, String url, String symptom,
                             String normalizedStatus, Map<String, Object> conclusion,
                             String fullReportJson) {
        String rootCause = String.valueOf(conclusion.getOrDefault("root_cause_label", ""));
        String scenarioName = String.valueOf(conclusion.getOrDefault("scenario_name", ""));
        Object confObj = conclusion.get("confidence");
        double confidence = confObj instanceof Number ? ((Number) confObj).doubleValue() : 0.0;
        String conclusionJson;
        try {
            conclusionJson = mapper.writeValueAsString(conclusion);
        } catch (Exception e) {
            conclusionJson = "{}";
        }
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "UPDATE detect_history SET updated_at=?, url=?, symptom=?, status_code=?, "
                             + "root_cause=?, scenario_name=?, confidence=?, report=?, full_report_json=?, "
                             + "case_status='waiting_confirmation' WHERE report_id=?")) {
            ps.setString(1, now());
            ps.setString(2, url);
            ps.setString(3, symptom == null ? "" : symptom);
            ps.setString(4, normalizedStatus);
            ps.setString(5, rootCause);
            ps.setString(6, scenarioName);
            ps.setDouble(7, confidence);
            ps.setString(8, conclusionJson);
            ps.setString(9, fullReportJson);
            ps.setString(10, reportId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("保存诊断结果失败", e);
        }
    }

    public void failCase(String reportId, String message) {
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "UPDATE detect_history SET updated_at=?, case_status='waiting_confirmation', "
                             + "follow_up_note=? WHERE report_id=?")) {
            ps.setString(1, now());
            ps.setString(2, "诊断未完成：" + (message == null ? "未知错误" : message));
            ps.setString(3, reportId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("更新失败任务状态失败", e);
        }
    }

    public Map<String, Object> getReport(String reportId) {
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT full_report_json, report FROM detect_history "
                             + "WHERE report_id=? OR id=? LIMIT 1")) {
            ps.setString(1, reportId);
            ps.setString(2, reportId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                String json = rs.getString("full_report_json");
                if (json == null || json.isBlank()) {
                    json = rs.getString("report");
                }
                return json == null ? null : mapper.readValue(json, Map.class);
            }
        } catch (Exception e) {
            throw new IllegalStateException("读取报告失败", e);
        }
    }

    public boolean updateFollowUp(String reportId, String status, String owner,
                                  String note, String closedReason) {
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "UPDATE detect_history SET updated_at=?, case_status=?, owner=?, "
                             + "follow_up_note=?, closed_reason=? WHERE report_id=? OR id=?")) {
            ps.setString(1, now());
            ps.setString(2, status);
            ps.setString(3, owner);
            ps.setString(4, note);
            ps.setString(5, closedReason);
            ps.setString(6, reportId);
            ps.setString(7, reportId);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new IllegalStateException("更新跟进信息失败", e);
        }
    }

    public boolean deleteHistory(String reportId) {
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "DELETE FROM detect_history WHERE report_id=? OR id=?")) {
            ps.setString(1, reportId);
            ps.setString(2, reportId);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new IllegalStateException("删除历史失败", e);
        }
    }

    public boolean promoteCase(String reportId, String scenarioId, String resolutionSummary,
                               String owner, String note) {
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "UPDATE detect_history SET updated_at=?, case_status='fixed', owner=?, "
                             + "follow_up_note=?, promoted_scenario_id=?, resolution_summary=? "
                             + "WHERE report_id=? OR id=?")) {
            ps.setString(1, now());
            ps.setString(2, owner == null ? "" : owner);
            ps.setString(3, note == null ? "" : note);
            ps.setString(4, scenarioId);
            ps.setString(5, resolutionSummary);
            ps.setString(6, reportId);
            ps.setString(7, reportId);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new IllegalStateException("归档未知问题失败", e);
        }
    }

    public void addRuleCandidate(Map<String, Object> candidate) {
        Path file = dataDir.resolve("rule_candidates.json");
        List<Map<String, Object>> list = new ArrayList<>();
        if (Files.exists(file)) {
            try {
                list = mapper.readValue(Files.readString(file),
                        mapper.getTypeFactory().constructCollectionType(List.class, Map.class));
            } catch (Exception ignored) {
                list = new ArrayList<>();
            }
        }
        list.add(candidate);
        try {
            Files.writeString(file,
                    mapper.writerWithDefaultPrettyPrinter().writeValueAsString(list),
                    java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("保存规则候选失败", e);
        }
    }

    public void clearHistory() {
        try (Connection conn = open();
             Statement st = conn.createStatement()) {
            st.executeUpdate("DELETE FROM detect_history");
        } catch (SQLException e) {
            throw new IllegalStateException("清空历史失败", e);
        }
    }

    public List<Map<String, Object>> listHistory(int limit) {
        List<Map<String, Object>> rows = new ArrayList<>();
        String sql = "SELECT id, report_id, ts, updated_at, url, symptom, status_code, root_cause, "
                + "scenario_name, confidence, case_status, owner, follow_up_note, closed_reason, "
                + "promoted_scenario_id, resolution_summary "
                + "FROM detect_history ORDER BY COALESCE(updated_at, ts) DESC LIMIT ?";
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, limit);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    String id = rs.getString("id");
                    String reportId = rs.getString("report_id");
                    row.put("id", id);
                    row.put("report_id", reportId == null || reportId.isBlank() ? id : reportId);
                    row.put("ts", rs.getString("ts"));
                    row.put("updated_at", rs.getString("updated_at"));
                    row.put("url", rs.getString("url"));
                    row.put("symptom", rs.getString("symptom"));
                    row.put("status_code", rs.getString("status_code"));
                    row.put("root_cause", rs.getString("root_cause"));
                    row.put("scenario_name", rs.getString("scenario_name"));
                    row.put("confidence", rs.getDouble("confidence"));
                    row.put("case_status", defaultString(rs.getString("case_status"), "new"));
                    row.put("owner", defaultString(rs.getString("owner"), ""));
                    row.put("follow_up_note", defaultString(rs.getString("follow_up_note"), ""));
                    row.put("closed_reason", defaultString(rs.getString("closed_reason"), ""));
                    row.put("promoted_scenario_id", defaultString(rs.getString("promoted_scenario_id"), ""));
                    row.put("resolution_summary", defaultString(rs.getString("resolution_summary"), ""));
                    rows.add(row);
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("查询历史失败", e);
        }
        return rows;
    }

    private void purgeExpiredHistory() {
        int days;
        try {
            days = Integer.parseInt(System.getenv().getOrDefault("FAULT_DETECT_RETENTION_DAYS", "180"));
        } catch (Exception ignored) {
            days = 180;
        }
        days = Math.max(1, days);
        String cutoff = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
                .format(new Date(System.currentTimeMillis() - days * 86400000L));
        try (Connection conn = open();
             PreparedStatement ps = conn.prepareStatement(
                     "DELETE FROM detect_history WHERE COALESCE(updated_at, ts) < ?")) {
            ps.setString(1, cutoff);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("清理过期历史失败", e);
        }
    }

    private static String now() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
    }

    private static String defaultString(String value, String fallback) {
        return value == null ? fallback : value;
    }
}
