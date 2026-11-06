document.cookie = "demo_session=teaching-session; SameSite=Lax";

const result = document.getElementById("result");
const headers = {
  "Authorization": "Bearer faultdetect-demo-token",
  "X-Demo-Tenant": "teaching"
};

document.querySelectorAll("[data-endpoint]").forEach(button => {
  button.addEventListener("click", async () => {
    const method = button.dataset.method || "GET";
    result.textContent = `请求中：${method} ${button.dataset.endpoint}`;
    const options = {
      method,
      headers: method === "POST"
        ? { ...headers, "Content-Type": "application/json" }
        : headers
    };
    if (method === "POST") options.body = "{}";
    try {
      const response = await fetch(button.dataset.endpoint, options);
      result.textContent = `HTTP ${response.status}\n${await response.text()}`;
    } catch (error) {
      result.textContent = `请求失败：${error.message}`;
    }
  });
});
