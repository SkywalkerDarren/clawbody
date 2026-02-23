#!/usr/bin/env python3
"""
麦克风 STT 测试脚本

使用方法:
  cd services/qwen3-stt
  uv run python test_mic.py

按 Enter 开始录音，再按 Enter 停止并转录
"""

import base64
import io
import sys
import threading
import time

import numpy as np
import sounddevice as sd
import soundfile as sf

# STT 服务地址
STT_URL = "http://localhost:8766"

# 录音参数
SAMPLE_RATE = 16000
CHANNELS = 1


def record_audio() -> np.ndarray:
    """录制音频直到用户按 Enter"""
    print("\n🎤 按 Enter 开始录音...")
    input()

    print("🔴 录音中... (按 Enter 停止)")

    audio_chunks = []
    stop_recording = threading.Event()

    def callback(indata, frames, time_info, status):
        if status:
            print(f"  ⚠️ {status}")
        audio_chunks.append(indata.copy())

    # 在后台线程等待 Enter
    def wait_for_enter():
        input()
        stop_recording.set()

    enter_thread = threading.Thread(target=wait_for_enter)
    enter_thread.start()

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=np.float32,
        callback=callback
    ):
        while not stop_recording.is_set():
            time.sleep(0.1)

    enter_thread.join()

    if not audio_chunks:
        return np.array([], dtype=np.float32)

    audio = np.concatenate(audio_chunks, axis=0).flatten()
    duration = len(audio) / SAMPLE_RATE
    print(f"⏹️  录音完成: {duration:.1f} 秒")

    return audio


def audio_to_base64(audio: np.ndarray, sample_rate: int) -> str:
    """将音频转换为 base64 WAV"""
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def transcribe(audio_base64: str) -> dict:
    """调用 STT 服务转录"""
    import httpx

    response = httpx.post(
        f"{STT_URL}/transcribe",
        json={
            "audio": audio_base64,
            "language": "auto",
            "enable_timestamps": False,
        },
        timeout=60.0,
    )
    response.raise_for_status()
    return response.json()


def check_service() -> bool:
    """检查 STT 服务是否运行"""
    import httpx

    try:
        response = httpx.get(f"{STT_URL}/health", timeout=2.0)
        data = response.json()
        return data.get("status") == "ready"
    except Exception:
        return False


def main():
    print("=" * 50)
    print("🎙️  麦克风 STT 测试")
    print("=" * 50)

    # 检查服务
    print("\n检查 STT 服务...")
    if not check_service():
        print("❌ STT 服务未运行!")
        print("\n请先启动 STT 服务:")
        print("  cd services/qwen3-stt")
        print("  ./start.sh")
        sys.exit(1)
    print("✅ STT 服务已就绪")

    # 列出音频设备
    print("\n可用音频设备:")
    print(sd.query_devices())

    while True:
        try:
            # 录音
            audio = record_audio()

            if len(audio) < SAMPLE_RATE * 0.5:  # 少于 0.5 秒
                print("⚠️  录音太短，请重试")
                continue

            # 转换为 base64
            print("\n📤 发送到 STT 服务...")
            audio_base64 = audio_to_base64(audio, SAMPLE_RATE)

            # 转录
            start_time = time.time()
            result = transcribe(audio_base64)
            elapsed = time.time() - start_time

            # 显示结果
            print("\n" + "=" * 50)
            print("📝 转录结果:")
            print("=" * 50)
            print(f"\n  {result.get('text', '(无结果)')}\n")
            print(f"  语言: {result.get('language', 'unknown')}")
            print(f"  时长: {result.get('duration', 0):.2f} 秒")
            print(f"  耗时: {elapsed:.2f} 秒")
            print("=" * 50)

            print("\n继续测试? (Ctrl+C 退出)")

        except KeyboardInterrupt:
            print("\n\n👋 再见!")
            break
        except Exception as e:
            print(f"\n❌ 错误: {e}")
            print("请检查 STT 服务是否正常运行")


if __name__ == "__main__":
    main()
