# 部署指南

## 部署模式

### 模式 A: 单机部署 (开发/简单场景)

所有组件在同一台机器上运行。

```
┌─────────────────────────────────────────────────────────┐
│                      单一机器                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Gateway + Live2D + TTS + Vision                │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 模式 B: 分离部署 (生产/资源隔离)

各组件独立进程，通过本地 IPC 通信。

```
┌─────────────────────────────────────────────────────────┐
│                      单一机器                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Gateway  │  │ Live2D   │  │   TTS    │             │
│  │ (主进程) │  │(Electron)│  │ (Python) │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│       │              │              │                  │
│       └──────────────┴──────────────┘                  │
│                 Unix Socket / IPC                       │
└─────────────────────────────────────────────────────────┘
```

### 模式 C: 分布式部署 (多机/高可用)

组件分布在多台机器上。

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Machine1   │     │   Machine2   │     │   Machine3   │
│   Gateway    │◀───▶│     TTS      │◀───▶│    Vision    │
│   + Live2D   │gRPC │   (GPU 机)   │gRPC │  (多屏幕)    │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 单机部署

### 1. 系统要求

- OS: Linux (推荐 Ubuntu 22.04+) / macOS
- CPU: 4 核+
- RAM: 8GB+ (16GB+ 如果使用本地 TTS)
- GPU: NVIDIA (可选，用于 Qwen TTS)
- 显示: X11 或 Wayland

### 2. 安装依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
  nodejs npm \
  python3.12 python3.12-venv \
  scrot imagemagick \
  pulseaudio alsa-utils

# 安装 pnpm
npm install -g pnpm

# 安装 uv (Python 包管理)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 3. 克隆和构建

```bash
git clone https://github.com/your-org/clawbody.git
cd clawbody

# 安装依赖
pnpm install

# 构建
pnpm build
```

### 4. 配置

```bash
# 创建配置文件
cp config/default.yaml config/local.yaml

# 编辑配置
vim config/local.yaml
```

```yaml
# config/local.yaml
gateway:
  grpc:
    port: 50051
  http:
    port: 3000

capabilities:
  tts:
    defaultProvider: "edge"  # 无 GPU 时使用 Edge-TTS
```

### 5. 设置环境变量

```bash
# 创建 .env 文件
cat > .env << EOF
API_KEY=your-secure-api-key
NODE_ENV=production
EOF
```

### 6. 启动服务

```bash
# 方式 1: 使用启动脚本
./start.sh

# 方式 2: 手动启动各服务
# 终端 1: TTS 服务
cd services/qwen-tts && ./start.sh

# 终端 2: Gateway
pnpm --filter @clawbody/gateway start

# 终端 3: Live2D
pnpm --filter @clawbody/live2d start
```

---

## Docker 部署

### 1. 构建镜像

```bash
# 构建所有镜像
docker compose build

# 或单独构建
docker build -t clawbody/gateway -f packages/gateway/Dockerfile .
docker build -t clawbody/tts -f services/qwen-tts/Dockerfile services/qwen-tts
```

### 2. Docker Compose 配置

```yaml
# docker-compose.yaml
version: '3.8'

services:
  gateway:
    image: clawbody/gateway
    ports:
      - "50051:50051"
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - API_KEY=${API_KEY}
    volumes:
      - ./config:/app/config:ro
    depends_on:
      - qwen-tts
    networks:
      - clawbody

  qwen-tts:
    image: clawbody/tts
    ports:
      - "8765:8765"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - tts-cache:/root/.cache
    networks:
      - clawbody

  live2d:
    image: clawbody/live2d
    environment:
      - DISPLAY=${DISPLAY}
      - GATEWAY_URL=gateway:50051
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix
    depends_on:
      - gateway
    networks:
      - clawbody

networks:
  clawbody:
    driver: bridge

volumes:
  tts-cache:
```

### 3. 启动

```bash
# 设置环境变量
export API_KEY="your-api-key"
export DISPLAY=:0

# 启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

---

## Systemd 部署 (Linux)

### 1. 创建用户

```bash
sudo useradd -r -s /bin/false clawbody
sudo mkdir -p /opt/clawbody
sudo chown clawbody:clawbody /opt/clawbody
```

### 2. 安装应用

```bash
sudo cp -r . /opt/clawbody/
cd /opt/clawbody
sudo -u clawbody pnpm install --prod
sudo -u clawbody pnpm build
```

### 3. 创建服务单元

```bash
# Gateway 服务
sudo cat > /etc/systemd/system/clawbody-gateway.service << 'EOF'
[Unit]
Description=ClawBody Gateway Service
After=network.target clawbody-tts.service

[Service]
Type=simple
User=clawbody
WorkingDirectory=/opt/clawbody
ExecStart=/usr/bin/node packages/gateway/dist/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/etc/clawbody/env

[Install]
WantedBy=multi-user.target
EOF

# TTS 服务
sudo cat > /etc/systemd/system/clawbody-tts.service << 'EOF'
[Unit]
Description=ClawBody TTS Service
After=network.target

[Service]
Type=simple
User=clawbody
WorkingDirectory=/opt/clawbody/services/qwen-tts
ExecStart=/opt/clawbody/services/qwen-tts/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8765
Restart=always
RestartSec=5
Environment=CUDA_VISIBLE_DEVICES=0

[Install]
WantedBy=multi-user.target
EOF
```

### 4. 配置环境变量

```bash
sudo mkdir -p /etc/clawbody
sudo cat > /etc/clawbody/env << 'EOF'
API_KEY=your-secure-api-key
NODE_ENV=production
EOF
sudo chmod 600 /etc/clawbody/env
```

### 5. 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable clawbody-gateway clawbody-tts
sudo systemctl start clawbody-tts
sudo systemctl start clawbody-gateway

# 查看状态
sudo systemctl status clawbody-gateway
sudo journalctl -u clawbody-gateway -f
```

---

## 网络配置

### 防火墙规则

```bash
# UFW (Ubuntu)
sudo ufw allow 50051/tcp  # gRPC
sudo ufw allow 3000/tcp   # HTTP (可选)

# firewalld (RHEL/CentOS)
sudo firewall-cmd --permanent --add-port=50051/tcp
sudo firewall-cmd --reload
```

### mDNS 配置

确保 Avahi 服务运行以支持服务发现：

```bash
# Ubuntu/Debian
sudo apt install avahi-daemon
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon
```

---

## 监控

### 健康检查端点

```bash
# HTTP 健康检查
curl http://localhost:3000/api/health

# gRPC 健康检查
grpcurl -plaintext localhost:50051 clawbody.nervous.NervousSystem/HealthCheck
```

### Prometheus 指标 (可选)

Gateway 在 `/metrics` 端点暴露 Prometheus 指标：

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'clawbody'
    static_configs:
      - targets: ['localhost:3000']
```

---

## 故障排除

### 常见问题

**1. TTS 服务启动失败**

```bash
# 检查 CUDA
nvidia-smi

# 检查 Python 环境
cd services/qwen-tts
source .venv/bin/activate
python -c "import torch; print(torch.cuda.is_available())"
```

**2. Live2D 窗口不显示**

```bash
# 检查 X11 权限
xhost +local:

# 检查 DISPLAY 变量
echo $DISPLAY
```

**3. mDNS 发现失败**

```bash
# 检查 Avahi 服务
systemctl status avahi-daemon

# 手动查询
avahi-browse -a
```

**4. gRPC 连接失败**

```bash
# 检查端口监听
ss -tlnp | grep 50051

# 测试连接
grpcurl -plaintext localhost:50051 list
```
