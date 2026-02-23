#!/usr/bin/env python3
"""
麦克风 STT 流式测试脚本

使用 WebSocket 实现实时流式语音识别，支持无限长音频。

使用方法:
  uv run --with httpx --with sounddevice --with websockets --with numpy python scripts/test_stt_stream.py
"""

import asyncio
import json
import sys
import threading
import queue
import time

try:
    import httpx
    import numpy as np
    import sounddevice as sd
    import websockets
except ImportError as e:
    print(f"缺少依赖: {e}")
    print("\n请安装依赖:")
    print("  uv run --with httpx --with sounddevice --with websockets --with numpy python scripts/test_stt_stream.py")
    sys.exit(1)

# STT 服务地址
STT_HOST = "localhost"
STT_PORT = 8766
STT_HTTP_URL = f"http://{STT_HOST}:{STT_PORT}"
STT_WS_URL = f"ws://{STT_HOST}:{STT_PORT}"

# 录音参数
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 100  # 每个音频块的时长 (毫秒) - 100ms 平衡延迟和稳定性
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)  # 每块采样数

# 性能统计
class Stats:
    def __init__(self):
        self.chunks_sent = 0
        self.bytes_sent = 0
        self.transcripts_received = 0
        self.start_time = 0.0
        self.last_send_time = 0.0
        self.latencies: list[float] = []

    def reset(self):
        self.chunks_sent = 0
        self.bytes_sent = 0
        self.transcripts_received = 0
        self.start_time = time.time()
        self.last_send_time = 0.0
        self.latencies = []

    def record_send(self, bytes_count: int):
        self.chunks_sent += 1
        self.bytes_sent += bytes_count
        self.last_send_time = time.time()

    def record_receive(self):
        self.transcripts_received += 1
        if self.last_send_time > 0:
            latency = (time.time() - self.last_send_time) * 1000  # ms
            self.latencies.append(latency)

    def avg_latency(self) -> float:
        if not self.latencies:
            return 0.0
        return sum(self.latencies) / len(self.latencies)

    def min_latency(self) -> float:
        return min(self.latencies) if self.latencies else 0.0

    def max_latency(self) -> float:
        return max(self.latencies) if self.latencies else 0.0

stats = Stats()


def check_service() -> bool:
    """检查 STT 服务是否运行"""
    try:
        response = httpx.get(f"{STT_HTTP_URL}/health", timeout=2.0)
        data = response.json()
        return data.get("status") == "ready"
    except Exception:
        return False


def create_session() -> str | None:
    """创建流式会话"""
    try:
        response = httpx.post(
            f"{STT_HTTP_URL}/sessions",
            json={"language": "auto"},
            timeout=5.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["session_id"]
    except Exception as e:
        print(f"❌ 创建会话失败: {e}")
        return None


async def stream_audio(session_id: str, audio_queue: queue.Queue, stop_event: threading.Event):
    """通过 WebSocket 流式发送音频并接收转录结果"""
    ws_url = f"{STT_WS_URL}/sessions/{session_id}/stream"

    stats.reset()

    try:
        async with websockets.connect(ws_url) as ws:
            print("🔗 WebSocket 已连接")
            print("=" * 60)
            print("📝 实时转录结果:")
            print("=" * 60)

            # 创建发送和接收任务
            send_task = asyncio.create_task(send_audio(ws, audio_queue, stop_event))
            recv_task = asyncio.create_task(receive_transcripts(ws, stop_event))

            # 等待任一任务完成
            done, pending = await asyncio.wait(
                [send_task, recv_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            # 取消未完成的任务
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except websockets.exceptions.ConnectionClosed as e:
        print(f"\n🔌 WebSocket 连接关闭: {e}")
    except Exception as e:
        print(f"\n❌ WebSocket 错误: {e}")


async def send_audio(ws, audio_queue: queue.Queue, stop_event: threading.Event):
    """发送音频数据到 WebSocket"""
    while not stop_event.is_set():
        try:
            # 非阻塞获取音频数据
            try:
                audio_chunk = audio_queue.get(timeout=0.1)
            except queue.Empty:
                await asyncio.sleep(0.01)
                continue

            # 转换为 PCM 16-bit 格式
            pcm_data = (audio_chunk * 32767).astype(np.int16).tobytes()

            # 发送二进制音频数据
            send_start = time.time()
            await ws.send(pcm_data)
            send_time = (time.time() - send_start) * 1000

            stats.record_send(len(pcm_data))

            # 每 10 个 chunk 打印一次发送统计
            if stats.chunks_sent % 10 == 0:
                elapsed = time.time() - stats.start_time
                print(f"\r📊 已发送: {stats.chunks_sent} chunks, {stats.bytes_sent/1024:.1f}KB, "
                      f"时长: {elapsed:.1f}s, 发送耗时: {send_time:.1f}ms", end="", flush=True)

        except Exception as e:
            if not stop_event.is_set():
                print(f"\n❌ 发送错误: {e}")
            break

    # 发送结束信号
    try:
        await ws.send('{"type": "end"}')
    except:
        pass


async def receive_transcripts(ws, stop_event: threading.Event):
    """接收转录结果"""
    while not stop_event.is_set():
        try:
            recv_start = time.time()
            message = await asyncio.wait_for(ws.recv(), timeout=0.5)
            recv_time = (time.time() - recv_start) * 1000

            data = json.loads(message)

            if data.get("type") == "transcript":
                stats.record_receive()
                transcript = data.get("data", {})
                text = transcript.get("text", "")
                is_final = transcript.get("is_final", False)

                if text:
                    latency = stats.latencies[-1] if stats.latencies else 0
                    if is_final:
                        print(f"\n✅ [{latency:.0f}ms] {text}")
                    else:
                        print(f"\n🎤 [{latency:.0f}ms] {text}", end="", flush=True)

            elif data.get("type") == "final":
                # 会话结束的最终结果
                final_data = data.get("data", {})
                text = final_data.get("text", "")
                duration = final_data.get("duration", 0)
                print(f"\n\n{'=' * 60}")
                print(f"📊 最终结果: {text}")
                print(f"⏱️  总时长: {duration:.2f} 秒")
                print(f"{'=' * 60}")
                print(f"\n📈 性能统计:")
                print(f"   发送 chunks: {stats.chunks_sent}")
                print(f"   发送数据量: {stats.bytes_sent/1024:.1f} KB")
                print(f"   收到转录: {stats.transcripts_received} 次")
                print(f"   平均延迟: {stats.avg_latency():.0f} ms")
                print(f"   最小延迟: {stats.min_latency():.0f} ms")
                print(f"   最大延迟: {stats.max_latency():.0f} ms")
                break

        except asyncio.TimeoutError:
            continue
        except Exception as e:
            if not stop_event.is_set():
                print(f"\n❌ 接收错误: {e}")
            break


def main():
    print("=" * 60)
    print("🎙️  麦克风 STT 流式测试")
    print("=" * 60)

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

    print("\n" + "=" * 60)
    print("按 Enter 开始录音，再按 Enter 停止")
    print("=" * 60)
    input()

    # 创建会话
    print("\n📡 创建流式会话...")
    session_id = create_session()
    if not session_id:
        sys.exit(1)
    print(f"✅ 会话已创建: {session_id}")

    # 音频队列和停止事件
    audio_queue: queue.Queue = queue.Queue()
    stop_event = threading.Event()

    def audio_callback(indata, frames, time_info, status):
        """音频输入回调"""
        _ = frames, time_info  # unused
        if status:
            print(f"⚠️ {status}", file=sys.stderr)
        audio_queue.put(indata.copy().flatten())

    # 启动音频输入流
    print("\n🔴 开始录音... (按 Enter 停止)\n")

    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=np.float32,
        blocksize=CHUNK_SIZE,
        callback=audio_callback,
    )

    # 等待 Enter 键的线程
    def wait_for_enter():
        input()
        stop_event.set()

    enter_thread = threading.Thread(target=wait_for_enter)
    enter_thread.start()

    # 运行流式处理
    with stream:
        asyncio.run(stream_audio(session_id, audio_queue, stop_event))

    enter_thread.join()
    print("\n👋 再见!")


if __name__ == "__main__":
    main()
