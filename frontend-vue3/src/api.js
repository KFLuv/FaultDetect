// ============================================================
// API 封装与共享状态（与后端 8 个接口对接）
// ============================================================
import { reactive } from 'vue'

// ---------- 共享状态 ----------
export const store = reactive({
    categoryLabels: {},
    categoryColors: {},
    allScenarios: [],
    statusCodes: []
})

// ---------- 通用工具 ----------
let backendRecovery = null

async function localBackendHealthy() {
    try {
        const resp = await fetch("/api/health", { cache: "no-store" })
        if (!resp.ok) return false
        const data = await resp.json()
        return data.status === "ok"
    } catch {
        return false
    }
}

async function recoverLocalBackend() {
    if (backendRecovery) return backendRecovery
    backendRecovery = (async () => {
        if (await localBackendHealthy()) return true
        if (!window.faultDetectDesktop?.restartBackend) return false
        try {
            return await window.faultDetectDesktop.restartBackend()
        } catch {
            return false
        }
    })().finally(() => {
        backendRecovery = null
    })
    return backendRecovery
}

export async function api(url, options) {
    let resp
    try {
        resp = await fetch(url, options)
    } catch (firstError) {
        const recovered = url.startsWith("/api/") && await recoverLocalBackend()
        if (!recovered) {
            throw new Error(
                "本地诊断服务连接中断。请关闭后重新打开 FaultDetect 桌面版；" +
                "如果仍然失败，请检查 8000 端口是否被其他程序占用。"
            )
        }
        try {
            resp = await fetch(url, options)
        } catch {
            throw new Error(
                "本地诊断服务已重启，但仍无法完成请求。请重新打开桌面版后重试，" +
                "并检查安全软件是否拦截了 127.0.0.1:8000。"
            )
        }
    }
    if (!resp.ok) {
        let msg = "请求失败（HTTP " + resp.status + "）";
        try {
            const data = await resp.json();
            msg = data.detail || msg;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
    }
    return resp.json();
}

export async function copyText(text) {
    if (window.faultDetectDesktop?.copyText) {
        const result = await window.faultDetectDesktop.copyText(text)
        if (!result?.ok) throw new Error("桌面剪贴板写入失败")
        return
    }
    await navigator.clipboard.writeText(text)
}

export function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

export function catColor(key) {
    return store.categoryColors[key] || "#8b96ad";
}

export function catLabel(key) {
    return store.categoryLabels[key] || key || "未确定";
}

export function guessCategory(label) {
    for (const [k, v] of Object.entries(store.categoryLabels)) {
        if (v === label) return k;
    }
    return "";
}

// ---------- 数据加载 ----------
export async function loadScenarios() {
    const data = await api("/api/scenarios");
    store.categoryLabels = data.category_labels || {};
    store.categoryColors = data.category_colors || {};
    store.allScenarios = data.scenarios || [];
    return data;
}

export async function loadStatusCodes() {
    const data = await api("/api/status-codes");
    store.statusCodes = data.status_codes || [];
    return data;
}

export async function loadAll() {
    await loadScenarios();
    await loadStatusCodes();
}

export async function getStats() {
    return api("/api/stats");
}

// ---------- 自检 ----------
/**
 * 一键自检：后端用两套互不依赖的实现（真值 HttpURLConnection / 被测 HttpClient）
 * 对内置测试服务各测一轮并比对，返回一致率与逐条明细。
 */
export async function getSelfCheck() {
    return api("/api/selfcheck");
}

// ---------- 本机 LLM 配置 ----------
export async function getLlmConfig() {
    return api("/api/config/llm");
}

export async function saveLlmConfig(payload) {
    return api("/api/config/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}

export async function testLlmConfig(payload) {
    return api("/api/config/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}

export async function promoteUnknownCase(reportId, payload) {
    return api(`/api/history/${encodeURIComponent(reportId)}/promote-unknown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}
