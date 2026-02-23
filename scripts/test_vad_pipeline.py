#!/usr/bin/env python3
"""
完整语音链路：麦克风 → VAD → STT → OpenClaw → TTS

自动检测说话，无需手动按键。

使用方法:
  uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_pipeline.py
"""

import sys
import base64
import time

try:
    import numpy as np
    import sounddevice as sd
    import httpx
except ImportError as e:
    print(f"缺少依赖: {e}")
    print("请运行: uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_pipeline.py")
    sys.exit(1)

CLAWBODY_URL = "http://localhost:4000"
VAD_URL = "http://localhost:8767"
STT_URL = "http://localhost:8766"

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


def check_services():
    """检查所有服务是否运行"""
    services = [
        ("ClawBody Gateway", f"{CLAWBODY_URL}/api/health"),
        ("VAD Service", f"{VAD_URL}/health"),
        ("STT Service", f"{STT_URL}/health"),
    ]

    all_ok = True
    for name, url in services:
        try:
            r = httpx.get(url, timeout=2)
            if r.status_code == 200:
                data = r.json()
                status = data.get("status", data.get("ok", "unknown"))
                if status in ("ready", True, "ok"):
                    print(f"✅ {name}")
                else:
                    print(f"⚠️  {name}: {status}")
                    all_ok = False
            else:
                print(f"❌ {name}: HTTP {r.status_code}")
                all_ok = False
        except Exception as e:
            print(f"❌ {name}: {e}")
            all_ok = False

    return all_ok


def process_vad(audio_chunk: np.ndarray) -> dict:
    """发送音频块到 VAD 服务"""
    pcm = (audio_chunk * 32767).astype(np.int16).tobytes()
    audio_b64 = base64.b64encode(pcm).decode()

    r = httpx.post(
        f"{VAD_URL}/process",
        json={"audio": audio_b64},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()


def transcribe_audio(audio_b64: str) -> str:
    """发送音频到 STT 服务进行转录"""
    r = httpx.post(
        f"{STT_URL}/transcribe",
        json={"audio": audio_b64, "language": "auto"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("text", "")


def reset_vad():
    """重置 VAD 状态"""
    try:
        httpx.post(f"{VAD_URL}/reset", timeout=2)
    except Exception:
        pass


def main():
    print("=" * 60)
    print("🎙️  完整语音链路：VAD → STT → OpenClaw → TTS")
    print("=" * 60)
    print()

    if not check_services():
        print("\n❌ 部分服务未就绪，请先启动所有服务")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("说话时会自动检测并转录，转录结果自动发送给 AI")
    print("AI 回复会通过 TTS 播放出来")
    print("按 Ctrl+C 退出")
    print("=" * 60 + "\n")

    reset_vad()

    is_speaking = False
    speech_count = 0

    def audio_callback(indata, frames, time_info, status):
        nonlocal is_speaking, speech_count

        if status:
            print(f"⚠️ {status}", file=sys.stderr)

        chunk = indata.copy().flatten()

        try:
            result = process_vad(chunk)
            event = result.get("event")
            confidence = result.get("confidence", 0)

            if event == "speech_start":
                is_speaking = True
                print(f"\n🎤 检测到说话开始 (置信度: {confidence:.2f})")

            elif event == "speech_end":
                is_speaking = False
                speech_count += 1
                audio_buffer = result.get("audio_buffer")

                if audio_buffer:
                    print(f"⏹️  说话结束，正在转录...")

                    # 转录
                    t_start = time.time()
                    text = transcribe_audio(audio_buffer)
                    t_stt = time.time() - t_start

                    if text.strip():
                        print(f"✅ [{speech_count}] 转录 ({t_stt:.1f}s): \"{text}\"")
                        print(f"📨 已自动转发给 OpenClaw，等待 AI 回复...")
                        print("-" * 60)
                    else:
                        print(f"⚠️  [{speech_count}] 转录结果为空")
                else:
                    print("⚠️  说话结束但没有音频缓冲区")

            elif is_speaking:
                # 显示说话中的状态
                print(f"\r🔴 说话中... (置信度: {confidence:.2f})", end="", flush=True)

        except Exception as e:
            print(f"\n❌ 处理错误: {e}")

    print("🎧 开始监听麦克风...\n")

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=np.float32,
            blocksize=CHUNK_SIZE,
            callback=audio_callback,
        ):
            while True:
                sd.sleep(100)
    except KeyboardInterrupt:
        print(f"\n\n👋 退出，共处理 {speech_count} 段语音")


if __name__ == "__main__":
    main()
