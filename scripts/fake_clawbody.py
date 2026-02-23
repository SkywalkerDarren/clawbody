#!/usr/bin/env python3
"""
Fake ClawBody - 模拟 ClawBody 向 OpenClaw 发送 STT 结果
"""
import urllib.request
import json

OPENCLAW_URL = "http://localhost:18789"
TOKEN = "your-webhook-token"
SESSION_KEY = "voice:default"
DELIVER_TO = ""  # Telegram user ID (optional)

text = input("输入要发送的文本: ").strip()
if not text:
    text = "fake clawbody 测试消息"

body = {
    "message": text,
    "deliver": True,
    "channel": "telegram",
    "to": DELIVER_TO,
    "sessionKey": SESSION_KEY,
}

data = json.dumps(body).encode()
req = urllib.request.Request(
    f"{OPENCLAW_URL}/hooks/agent",
    data=data,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read())
        print(f"✅ OpenClaw 响应: {result}")
except Exception as e:
    print(f"❌ 失败: {e}")
