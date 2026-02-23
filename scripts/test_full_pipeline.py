#!/usr/bin/env python3
"""
完整链路测试：麦克风 → ClawBody STT → OpenClaw Agent → ClawBody TTS

使用方法:
  uv run --with sounddevice --with numpy --with httpx python scripts/test_full_pipeline.py
"""

import sys
import threading
import queue
import time
import base64

try:
    import numpy as np
    import sounddevice as sd
    import httpx
except ImportError as e:
    print(f'缺少依赖: {e}')
    print('请运行: uv run --with sounddevice --with numpy --with httpx python scripts/test_full_pipeline.py')
    sys.exit(1)

CLAWBODY_URL = 'http://localhost:4000'
API_KEY = ''  # 如果 ClawBody 配置了 apiKey 填这里

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)

headers = {'Content-Type': 'application/json'}
if API_KEY:
    headers['X-API-Key'] = API_KEY


def check_health():
    try:
        r = httpx.get(f'{CLAWBODY_URL}/api/health', timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def create_session() -> str | None:
    try:
        r = httpx.post(f'{CLAWBODY_URL}/api/stt/sessions',
                       json={'language': 'auto'}, headers=headers, timeout=5)
        r.raise_for_status()
        return r.json()['sessionId']
    except Exception as e:
        print(f'❌ 创建 STT 会话失败: {e}')
        return None


def send_chunk(session_id: str, audio: np.ndarray) -> dict | None:
    pcm = (audio * 32767).astype(np.int16).tobytes()
    audio_b64 = base64.b64encode(pcm).decode()
    try:
        r = httpx.post(
            f'{CLAWBODY_URL}/api/stt/sessions/{session_id}/chunks',
            json={'audio': audio_b64},
            headers=headers,
            timeout=5,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f'⚠️  发送音频块失败: {e}')
        return None


def end_session(session_id: str) -> dict | None:
    try:
        r = httpx.post(
            f'{CLAWBODY_URL}/api/stt/sessions/{session_id}/end',
            json={},
            headers=headers,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f'❌ 结束会话失败: {e}')
        return None


def main():
    print('=' * 60)
    print('🎙️  完整链路测试：麦克风 → ClawBody STT → OpenClaw → TTS')
    print('=' * 60)

    if not check_health():
        print('❌ ClawBody Gateway 未运行 (http://localhost:4000)')
        sys.exit(1)
    print('✅ ClawBody Gateway 已就绪')

    print('\n按 Enter 开始录音，再按 Enter 停止并发送给 AI...')
    input()

    session_id = create_session()
    if not session_id:
        sys.exit(1)
    print(f'✅ STT 会话已创建: {session_id}')

    audio_queue: queue.Queue = queue.Queue()
    stop_event = threading.Event()
    chunks_sent = 0

    def audio_callback(indata, frames, time_info, status):
        if status:
            print(f'⚠️ {status}', file=sys.stderr)
        audio_queue.put(indata.copy().flatten())

    def wait_for_enter():
        input()
        stop_event.set()

    enter_thread = threading.Thread(target=wait_for_enter, daemon=True)
    enter_thread.start()

    print('\n🔴 录音中... (按 Enter 停止)\n')

    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=np.float32,
        blocksize=CHUNK_SIZE,
        callback=audio_callback,
    )

    t_record_start = time.monotonic()

    with stream:
        while not stop_event.is_set():
            try:
                chunk = audio_queue.get(timeout=0.2)
                result = send_chunk(session_id, chunk)
                chunks_sent += 1

                if result and result.get('text'):
                    marker = '✅' if result.get('isFinal') else '🎤'
                    print(f'\r{marker} {result[text]}', end='', flush=True)
            except queue.Empty:
                continue

    t_record_end = time.monotonic()
    print(f'\n\n⏹️  录音结束 ({t_record_end - t_record_start:.1f}s)，共 {chunks_sent} 个音频块')
    print('📡 结束 STT 会话，等待最终转录...')

    t_stt_start = time.monotonic()
    result = end_session(session_id)
    t_stt_end = time.monotonic()

    if not result:
        print('❌ 获取最终结果失败')
        return

    text = result.get('text', '')
    duration = result.get('duration', 0)
    print(f'✅ 转录完成 ({t_stt_end - t_stt_start:.1f}s): "{text}"')
    print(f'⏱️  音频时长: {duration:.2f}s')

    if not text.strip():
        print('⚠️  转录结果为空，未触发 OpenClaw')
        return

    print('\n📨 ClawBody 已自动转发给 OpenClaw，等待 AI 回复 + TTS 播放...')
    print('   (回复会通过 ClawBody 的扬声器播放出来)')
    print(f'\n⏱️  计时开始: STT 完成于 {time.strftime(%H:%M:%S)}')
    print('   听到 TTS 播放时记录时间，即为端到端延迟。')


if __name__ == '__main__':
    main()
