#!/usr/bin/env python3
"""
VAD → STT 链路测试脚本

麦克风输入 → VAD 检测 → 语音结束时自动触发 STT 转录

使用方法:
  uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_stt.py
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
    print("请运行: uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_stt.py")
    sys.exit(1)

VAD_URL = "http://localhost:8767"
STT_URL = "http://localhost:8766"

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


def check_services():
    """检查 VAD 和 STT 服务是否运行"""
    try:
        r = httpx.get(f"{VAD_URL}/health", timeout=2)
        if r.status_code != 200 or r.json().get("status") != "ready":
            print(f"❌ VAD 服务未就绪: {VAD_URL}")
            return False
        print(f"✅ VAD 服务已就绪: {VAD_URL}")
    except Exception as e:
        print(f"❌ VAD 服务连接失败: {e}")
        return False

    try:
        r = httpx.get(f"{STT_URL}/health", timeout=2)
        if r.status_code != 200 or r.json().get("status") != "ready":
            print(f"❌ STT 服务未就绪: {STT_URL}")
            return False
        print(f"✅ STT 服务已就绪: {STT_URL}")
    except Exception as e:
        print(f"❌ STT 服务连接失败: {e}")
        return False

    return True


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


def transcribe_audio(audio_buffer: str) -> str:
    """发送音频到 STT 服务进行转录"""
    r = httpx.post(
        f"{STT_URL}/transcribe",
        json={"audio": audio_buffer, "language": "auto"},
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
    print("🎙️  VAD → STT 链路测试")
    print("=" * 60)

    if not check_services():
        sys.exit(1)

    print("\n说话时会自动检测并转录，按 Ctrl+C 退出\n")
    print("-" * 60)

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
                    start_time = time.time()
                    text = transcribe_audio(audio_buffer)
                    elapsed = time.time() - start_time
                    print(f"✅ [{speech_count}] 转录结果 ({elapsed:.2f}s): \"{text}\"")
                    print("-" * 60)
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
        print(f"\n\n👋 退出，共转录 {speech_count} 段语音")


if __name__ == "__main__":
    main()
