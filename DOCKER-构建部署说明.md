# 故障检测系统 - Docker 构建与部署说明（2026-09-29 记录）

## 一、当前部署形态

| 项 | 值 |
|---|---|
| 容器名 | `fault-detect-system-java` |
| 镜像 | `fault-detect-system-java:latest`（486 MB，基于 `eclipse-temurin:11-jre`） |
| 端口 | `8000:8000`（application.yml 中 `server.port: 8000`） |
| 数据卷 | `./data:/app/data`（SQLite 数据库 + 自定义场景，**删容器不丢数据**） |
| 重启策略 | `unless-stopped`（开机自启） |
| 前端 | 已打进 jar 的 `BOOT-INF/classes/static/`（20~26 个条目），由 Spring 从 classpath 提供 |
| 启动方式 | `java -jar /app/fault-detect-system.jar` |

访问：<http://localhost:8000>

## 二、两个 Dockerfile 的区别（重要）

| 文件 | 用途 | 是否需要 maven 镜像 |
|---|---|---|
| `java-backend/Dockerfile` | 原版，**多阶段构建**：先从 `maven:3.9-eclipse-temurin-11` 编译，再拷进 JRE 镜像 | 需要，首次构建要拉约 500 MB |
| `java-backend/Dockerfile.simple` | **新增（2026-09-29）**：直接复用已打好的 `target/fault-detect-system.jar`，只有一个 JRE 层 | 不需要，构建几秒钟 |

> 用 `.simple` 的原因：本机网络拉 maven 镜像慢；且 `mvn package` 本机已经有了新装的绿色版 Maven 可以完成，没必要在容器里再编译一遍。

## 三、重新打包 + 重新部署

本机 Maven 是绿色版：`D:\Tools\apache-maven-3.9.16`，JDK 在 `E:\JDK11`。
本地仓库：`E:\MavenRepo\repository`（配置来自**用户级** `C:\Users\yangboquan\.m2\settings.xml`：阿里云镜像 + 内网 Nexus 备用；用户级优先于 Maven 自带的 `conf/settings.xml`）。
> 因此依赖齐全、可离线构建：`mvn -o clean package` 也能成功。

```powershell
$env:JAVA_HOME = 'E:\JDK11'

# ① 如果改了前端（frontend-vue3/src）→ 先构建前端，再把 dist 拷进后端静态目录
Set-Location 'E:\Desktop\FaultDetect\fault-detect-system-main\frontend-vue3'
npm run build
# 把 dist 内容拷到 java-backend/src/main/resources/static（前端进 jar 的方式）
Copy-Item 'dist\*' '..\java-backend\src\main\resources\static\' -Recurse -Force

# ② 打包 jar
Set-Location 'E:\Desktop\FaultDetect\fault-detect-system-main\java-backend'
D:\Tools\apache-maven-3.9.16\bin\mvn.cmd -B clean package -DskipTests
# 产物：target\fault-detect-system.jar（约 30 MB）

# ③ 构建镜像（在项目根目录）
Set-Location 'E:\Desktop\FaultDetect\fault-detect-system-main'
docker build -f java-backend/Dockerfile.simple -t fault-detect-system-java:latest java-backend

# ④ 重建容器
docker rm -f fault-detect-system-java
docker run -d --name fault-detect-system-java -p 8000:8000 `
  -v "E:\Desktop\FaultDetect\fault-detect-system-main\data:/app/data" `
  --restart unless-stopped fault-detect-system-java:latest
```

> 也可以直接用 compose（`docker-compose-java.yml`）：因为镜像名一致、镜像已存在，`docker compose -f docker-compose-java.yml up -d` 不会再触发 `build`。
> 但注意该 compose 的 build 段指向原版 `Dockerfile`，如果哪天要它自己重建，会去拉 500 MB 的 maven 镜像。

## 四、验证

```powershell
docker ps -f name=fault-detect-system-java
docker logs fault-detect-system-java | Select-String 'Started FaultDetectApplication|Tomcat started'
(Invoke-WebRequest 'http://127.0.0.1:8000/' -UseBasicParsing).StatusCode          # 200
(Invoke-WebRequest 'http://127.0.0.1:8000/api/scenarios' -UseBasicParsing).StatusCode  # 200
```

## 五、2026-09-29 本次结果

- jar：9/24 15:52 打包（源码最后改动 9/24 15:50，**jar 已是最新**，本次未重打）
- 镜像：重建为 `f9bbe883c04b`（486 MB）
- 容器：启动成功，`Started FaultDetectApplication in 1.496 seconds`，Tomcat 8000
- 验证：首页 HTTP 200（394 字节）、`/api/scenarios` HTTP 200（97 KB 数据）
- 环境变量：`FAULT_DETECT_DATA_DIR=/app/data`、`TZ=Asia/Shanghai`、`JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8`

## 六、可选：启用 LLM 增强层

`application.yml` 的 `faultdetect.llm` 默认关闭（不配置就不会发起任何外部请求）。要启用就加环境变量：

```powershell
-e FAULTDETECT_LLM_ENABLED=true -e FAULTDETECT_LLM_ENDPOINT=http://192.0.2.10:8000/v1 `
-e FAULTDETECT_LLM_MODEL=Qwen3.5-35B-A3B -e FAULTDETECT_LLM_API_KEY=<key>
```
