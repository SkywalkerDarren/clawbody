#!/usr/bin/env python3
"""
说话人注册脚本

录制你的声音并注册到 Speaker Verification 服务。

使用方法:
  uv run --with sounddevice --with numpy --with httpx python scripts/enroll_speaker.py
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
    print("请运行: uv run --with sounddevice --with numpy --with httpx python scripts/enroll_speaker.py")
    sys.exit(1)

SV_URL = "http://localhost:8768"
GATEWAY_URL = "http://localhost:4000"

SAMPLE_RATE = 16000
CHANNELS = 1
RECORD_SECONDS = 5  # 每次录制时长


def check_service():
    """检查 SV 服务是否运行"""
    try:
        r = httpx.get(f"{SV_URL}/health", timeout=2)
        if r.status_code == 200:
            data = r.json()
            status = data.get("status")
            if status == "ready":
                return True
            elif status == "unavailable":
                print(f"⚠️  SV 服务运行中但模型未加载")
                print(f"   请检查模型是否已下载到 ~/.cache/wespeaker/")
                return False
        return False
    except Exception:
        return False


def record_audio(seconds: int = RECORD_SECONDS) -> np.ndarray:
    """录制音频"""
    print(f"\n🔴 录音中... ({seconds} 秒)")
    audio = sd.rec(
        int(seconds * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=np.float32,
    )
    sd.wait()
    print("⏹️  录音结束")
    return audio.flatten()


def enroll_speaker(speaker_id: str, speaker_name: str, audio: np.ndarray) -> bool:
    """注册说话人"""
    pcm = (audio * 32767).astype(np.int16).tobytes()
    audio_b64 = base64.b64encode(pcm).decode()

    try:
        r = httpx.post(
            f"{SV_URL}/enroll",
            json={
                "speaker_id": speaker_id,
                "speaker_name": speaker_name,
                "audio": audio_b64,
            },
            timeout=30,
        )
        r.raise_for_status()
        result = r.json()
        if result.get("success"):
            print(f"✅ 注册成功: {speaker_name} ({speaker_id})")
            print(f"   声纹数量: {result.get('embedding_count', 1)}")
            return True
        else:
            print(f"❌ 注册失败: {result.get('message', 'Unknown error')}")
            return False
    except Exception as e:
        print(f"❌ 注册失败: {e}")
        return False


def list_speakers():
    """列出已注册的说话人"""
    try:
        r = httpx.get(f"{SV_URL}/speakers", timeout=5)
        r.raise_for_status()
        speakers = r.json().get("speakers", [])
        if speakers:
            print("\n📋 已注册的说话人:")
            for s in speakers:
                print(f"   - {s['name']} ({s['id']}), 声纹数: {s.get('embedding_count', 1)}")
        else:
            print("\n📋 暂无注册的说话人")
        return speakers
    except Exception as e:
        print(f"❌ 获取说话人列表失败: {e}")
        return []


def verify_speaker(audio: np.ndarray) -> dict:
    """验证说话人"""
    pcm = (audio * 32767).astype(np.int16).tobytes()
    audio_b64 = base64.b64encode(pcm).decode()

    try:
        r = httpx.post(
            f"{SV_URL}/verify",
            json={"audio": audio_b64},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"❌ 验证失败: {e}")
        return {}


def main():
    print("=" * 60)
    print("🎤 说话人注册工具")
    print("=" * 60)

    if not check_service():
        print("❌ SV 服务未运行 (http://localhost:8768)")
        print("   请先启动: cd services/wespeaker-sv && ./start.sh")
        sys.exit(1)
    print("✅ SV 服务已就绪")

    # 显示已注册的说话人
    list_speakers()

    print("\n" + "=" * 60)
    print("选择操作:")
    print("  1. 注册新说话人")
    print("  2. 追加声纹 (同一人多次注册)")
    print("  3. 测试验证")
    print("  4. 退出")
    print("=" * 60)

    choice = input("\n请选择 [1-4]: ").strip()

    if choice == "1":
        speaker_id = input("输入说话人 ID (如 user_001): ").strip()
        if not speaker_id:
            speaker_id = f"user_{int(time.time())}"
        speaker_name = input("输入说话人名称 (如 张三): ").strip()
        if not speaker_name:
            speaker_name = speaker_id

        print(f"\n准备注册: {speaker_name} ({speaker_id})")
        print("请在录音时说一段话 (建议 3-5 秒)")
        input("按 Enter 开始录音...")

        audio = record_audio()
        enroll_speaker(speaker_id, speaker_name, audio)

        # 询问是否追加
        while True:
            more = input("\n是否追加更多声纹? (y/n): ").strip().lower()
            if more == "y":
                input("按 Enter 开始录音...")
                audio = record_audio()
                enroll_speaker(speaker_id, speaker_name, audio)
            else:
                break

    elif choice == "2":
        speakers = list_speakers()
        if not speakers:
            print("没有已注册的说话人，请先注册")
            return

        speaker_id = input("输入要追加的说话人 ID: ").strip()
        speaker = next((s for s in speakers if s["id"] == speaker_id), None)
        if not speaker:
            print(f"未找到说话人: {speaker_id}")
            return

        print(f"\n为 {speaker['name']} 追加声纹")
        input("按 Enter 开始录音...")
        audio = record_audio()
        enroll_speaker(speaker_id, speaker["name"], audio)

    elif choice == "3":
        print("\n测试说话人验证")
        input("按 Enter 开始录音...")
        audio = record_audio()

        print("\n🔍 验证中...")
        result = verify_speaker(audio)

        if result.get("verified"):
            print(f"✅ 验证通过: {result.get('speaker_name')} ({result.get('speaker_id')})")
            print(f"   置信度: {result.get('confidence', 0):.2%}")
        else:
            print(f"❌ 验证失败: 未匹配到注册用户")
            print(f"   最高置信度: {result.get('confidence', 0):.2%}")
            print(f"   阈值: {result.get('threshold', 0.6):.2%}")

    elif choice == "4":
        print("👋 退出")
    else:
        print("无效选择")


if __name__ == "__main__":
    main()
