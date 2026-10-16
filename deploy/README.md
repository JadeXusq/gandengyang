# 干瞪眼 · 腾讯云 Lighthouse 部署手册

与捡红点共用同一实例（lhins-rqks9jzc / 49.232.26.158），端口规划：

| 服务 | 端口 | 地址 |
|------|------|------|
| 前端页面 | 8080 | http://49.232.26.158:8080/ |
| 游戏 WS / API | 2568 | ws://49.232.26.158:2568 |

## 部署（代码已在 /opt/gandengyang）

```bash
# 1. 构建前端（必须注入 VITE_WS，否则客户端回连 2567 是捡红点的服务器）
docker run --rm -v "$PWD":/app -w /app \
  -e VITE_WS=ws://49.232.26.158:2568 \
  node:20-alpine sh -c "npm ci && npm run build -w client"

# 2. 启动
docker compose up -d --build

# 3. 验证
curl http://localhost:2568/api/health
curl -I http://localhost:8080/
```

## 更新部署

重复上面两步即可（`docker compose up -d --build` 会自动重建变化部分）。

## 运维命令

```bash
docker compose ps        # 容器状态
docker compose logs -f   # 日志
docker compose restart   # 重启
```

> 数据为内存存储，重启清档（与捡红点一致）。
