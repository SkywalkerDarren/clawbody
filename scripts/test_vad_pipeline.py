#!/usr/bin/env python3
"""
完整语音链路：麦克风 → Gateway (VAD → SV → STT → OpenClaw) → TTS

通过 Gateway 的集成链路自动处理，无需手动按键。

使用方法:
  uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_pipeline.py
"""

import sys
import base64
import time
import atexit

try:
    import numpy as np
    import sounddevice as sd
    import httpx
except ImportError as e:
    print(f"缺少依赖: {e}")
    print("请运行: uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_pipeline.py")
    sys.exit(1)

GATEWAY_URL = "http://localhost:4000"

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


def check_services():
    """检查 Gateway 是否运行"""
    try:
        r = httpx.get(f"{GATEWAY_URL}/api/health", timeout=2)
        if r.status_code == 200:
            print("✅ ClawBody Gateway 已就绪")
            return True
        else:
            print(f"❌ Gateway: HTTP {r.status_code}")
            return False
    except Exception as e:
        print(f"❌ Gateway: {e}")
        return False


def enable_pipeline():
    """启用 VAD → SV → STT → OpenClaw 链路"""
    try:
        r = httpx.post(f"{GATEWAY_URL}/api/pipeline/enable", timeout=5)
        r.raise_for_status()
        print("✅ Pipeline 已启用")
        return True
    except Exception as e:
        print(f"❌ 启用 Pipeline 失败: {e}")
        return False


def disable_pipeline():
    """禁用链路"""
    try:
        httpx.post(f"{GATEWAY_URL}/api/pipeline/disable", timeout=5)
        print("\n🔇 Pipeline 已禁用")
    except Exception:
        pass


def process_vad_via_gateway(audio_chunk: np.ndarray) -> dict:
    """通过 Gateway 发送音频块到 VAD (会自动触发 SV → STT → OpenClaw)"""
    pcm = (audio_chunk * 32767).astype(np.int16).tobytes()
    audio_b64 = base64.b64encode(pcm).decode()

    r = httpx.post(
        f"{GATEWAY_URL}/api/vad/process",
        json={"audio": audio_b64},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()


def reset_vad():
    """重置 VAD 状态"""
    try:
        httpx.post(f"{GATEWAY_URL}/api/vad/reset", timeout=2)
    except Exception:
        pass


def main():
    print("=" * 60)
    print("🎙️  完整语音链路：VAD → SV → STT → OpenClaw → TTS")
    print("=" * 60)
    print()

    if not check_services():
        print("\n❌ Gateway 未就绪，请先启动: ./scripts/start.sh")
        sys.exit(1)

    # 启用 Pipeline
    if not enable_pipeline():
        sys.exit(1)

    # 退出时禁用 Pipeline
    atexit.register(disable_pipeline)

    print("\n" + "=" * 60)
    print("说话时会自动检测并转录")
    print("只有注册用户的声音才会被转录并发送给 AI")
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
            result = process_vad_via_gateway(chunk)
            event = result.get("event")
            confidence = result.get("confidence", 0)

            if event == "speech_start":
                is_speaking = True
                print(f"\n🎤 检测到说话开始 (置信度: {confidence:.2f})")

            elif event == "speech_end":
                is_speaking = False
                speech_count += 1
                print(f"\n⏹️  说话结束，Gateway 正在处理 (SV → STT → OpenClaw)...")
                print("-" * 60)

            elif event == "speech_end_with_audio":
                # Gateway 会自动处理: SV 验证 → STT 转录 → 转发 OpenClaw
                is_speaking = False
                speech_count += 1
                print(f"\n⏹️  说话结束，Gateway 正在处理...")
                print("   → SV 验证说话人")
                print("   → STT 转录")
                print("   → 转发给 OpenClaw")
                print("   → 等待 AI 回复 + TTS 播放")
                print("-" * 60)

            elif is_speaking:
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
