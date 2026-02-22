#!/usr/bin/env python3
"""
Voice Designer - 为 ClawBody 定制声音

功能:
1. Voice Design: 通过自然语言描述生成声音
2. Voice Clone: 从参考音频克隆声音
3. 保存和管理声音样本

使用:
  uv run python voice_designer.py design --help
  uv run python voice_designer.py clone --help
  uv run python voice_designer.py interactive
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# 输出目录
OUTPUT_DIR = Path(__file__).parent / "voices"
OUTPUT_DIR.mkdir(exist_ok=True)

# 声音库配置文件
VOICE_LIBRARY = OUTPUT_DIR / "library.json"


def load_library() -> dict:
    """加载声音库"""
    if VOICE_LIBRARY.exists():
        return json.loads(VOICE_LIBRARY.read_text())
    return {"voices": [], "clones": []}


def save_library(lib: dict) -> None:
    """保存声音库"""
    VOICE_LIBRARY.write_text(json.dumps(lib, indent=2, ensure_ascii=False))


def play_audio(filepath: Path) -> None:
    """播放音频文件"""
    try:
        subprocess.run(["mpv", str(filepath)], check=False, capture_output=True)
    except FileNotFoundError:
        try:
            subprocess.run(["aplay", str(filepath)], check=False, capture_output=True)
        except FileNotFoundError:
            print(f"⚠️ 无法播放音频，请手动播放: {filepath}")


def get_model(model_type: str):
    """加载模型"""
    import torch
    from qwen_tts import Qwen3TTSModel

    model_map = {
        "design": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "clone": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "custom": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    }

    model_id = model_map.get(model_type, model_type)
    print(f"📦 加载模型: {model_id}")

    # 检查 FlashAttention
    kwargs = {
        "device_map": os.getenv("DEVICE", "cuda:0"),
        "dtype": torch.bfloat16,
    }
    try:
        import flash_attn  # noqa: F401
        kwargs["attn_implementation"] = "flash_attention_2"
        print("   使用 FlashAttention 2")
    except ImportError:
        print("   使用默认 Attention")

    return Qwen3TTSModel.from_pretrained(model_id, **kwargs)


def cmd_design(args):
    """Voice Design 命令"""
    import soundfile as sf

    model = get_model("design")

    # 生成语音
    print(f"\n🎨 Voice Design")
    print(f"   文本: {args.text}")
    print(f"   描述: {args.instruct}")
    print(f"   语言: {args.language}")

    wavs, sr = model.generate_voice_design(
        text=args.text,
        language=args.language,
        instruct=args.instruct,
    )

    # 保存文件
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"design_{timestamp}.wav"
    filepath = OUTPUT_DIR / filename
    sf.write(filepath, wavs[0], sr)

    duration_ms = int(len(wavs[0]) / sr * 1000)
    print(f"\n✅ 已保存: {filepath}")
    print(f"   时长: {duration_ms}ms")

    # 更新声音库
    lib = load_library()
    lib["voices"].append({
        "id": f"design_{timestamp}",
        "type": "design",
        "file": filename,
        "text": args.text,
        "instruct": args.instruct,
        "language": args.language,
        "duration_ms": duration_ms,
        "created_at": datetime.now().isoformat(),
    })
    save_library(lib)

    if args.play:
        play_audio(filepath)


def cmd_clone(args):
    """Voice Clone 命令"""
    import soundfile as sf

    model = get_model("clone")

    print(f"\n🎭 Voice Clone")
    print(f"   参考音频: {args.ref_audio}")
    print(f"   参考文本: {args.ref_text}")
    print(f"   目标文本: {args.text}")

    wavs, sr = model.generate_voice_clone(
        text=args.text,
        language=args.language,
        ref_audio=args.ref_audio,
        ref_text=args.ref_text,
    )

    # 保存文件
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"clone_{timestamp}.wav"
    filepath = OUTPUT_DIR / filename
    sf.write(filepath, wavs[0], sr)

    duration_ms = int(len(wavs[0]) / sr * 1000)
    print(f"\n✅ 已保存: {filepath}")
    print(f"   时长: {duration_ms}ms")

    # 更新声音库
    lib = load_library()
    lib["clones"].append({
        "id": f"clone_{timestamp}",
        "type": "clone",
        "file": filename,
        "text": args.text,
        "ref_audio": args.ref_audio,
        "ref_text": args.ref_text,
        "language": args.language,
        "duration_ms": duration_ms,
        "created_at": datetime.now().isoformat(),
    })
    save_library(lib)

    if args.play:
        play_audio(filepath)


def cmd_list(args):
    """列出声音库"""
    lib = load_library()

    print("\n📚 声音库")
    print("=" * 60)

    if lib["voices"]:
        print("\n🎨 Voice Design:")
        for v in lib["voices"]:
            print(f"  [{v['id']}]")
            print(f"    文件: {v['file']}")
            print(f"    描述: {v['instruct'][:50]}...")
            print(f"    时长: {v['duration_ms']}ms")
            print()

    if lib["clones"]:
        print("\n🎭 Voice Clone:")
        for v in lib["clones"]:
            print(f"  [{v['id']}]")
            print(f"    文件: {v['file']}")
            print(f"    参考: {v['ref_audio']}")
            print(f"    时长: {v['duration_ms']}ms")
            print()

    if not lib["voices"] and not lib["clones"]:
        print("  (空)")


def cmd_play(args):
    """播放声音"""
    lib = load_library()
    all_voices = lib["voices"] + lib["clones"]

    voice = next((v for v in all_voices if v["id"] == args.id), None)
    if not voice:
        print(f"❌ 未找到声音: {args.id}")
        return

    filepath = OUTPUT_DIR / voice["file"]
    print(f"🔊 播放: {filepath}")
    play_audio(filepath)


def cmd_interactive(args):
    """交互模式"""
    import soundfile as sf

    print("\n🎤 Voice Designer 交互模式")
    print("=" * 60)
    print("命令:")
    print("  design <instruct>  - 设计声音 (使用默认测试文本)")
    print("  design-text <text> - 设置测试文本")
    print("  clone <ref_audio> <ref_text>  - 克隆声音")
    print("  test <text>        - 用当前声音测试文本")
    print("  list               - 列出声音库")
    print("  play <id>          - 播放声音")
    print("  save <name>        - 保存当前声音为指定名称")
    print("  lang <language>    - 设置语言 (Chinese/English)")
    print("  quit               - 退出")
    print()

    # 状态
    current_model = None
    current_model_type = None
    current_voice_prompt = None  # 用于 clone 模式
    test_text = "你好！我是 ClawBody 的语音助手，很高兴认识你！"
    language = "Chinese"
    last_wav = None
    last_sr = None

    while True:
        try:
            line = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 再见!")
            break

        if not line:
            continue

        parts = line.split(maxsplit=1)
        cmd = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        try:
            if cmd == "quit" or cmd == "exit":
                print("👋 再见!")
                break

            elif cmd == "lang":
                language = arg or "Chinese"
                print(f"✓ 语言设置为: {language}")

            elif cmd == "design-text":
                test_text = arg or test_text
                print(f"✓ 测试文本: {test_text}")

            elif cmd == "design":
                if not arg:
                    print("用法: design <声音描述>")
                    print("示例: design 温柔甜美的年轻女声，语调轻柔，带有治愈感")
                    continue

                # 加载 design 模型
                if current_model_type != "design":
                    current_model = get_model("design")
                    current_model_type = "design"

                print(f"\n🎨 生成中...")
                print(f"   描述: {arg}")
                print(f"   文本: {test_text}")

                wavs, sr = current_model.generate_voice_design(
                    text=test_text,
                    language=language,
                    instruct=arg,
                )
                last_wav, last_sr = wavs[0], sr

                # 保存临时文件
                temp_file = OUTPUT_DIR / "temp_design.wav"
                sf.write(temp_file, wavs[0], sr)

                duration_ms = int(len(wavs[0]) / sr * 1000)
                print(f"✅ 生成完成 ({duration_ms}ms)")

                # 自动播放
                play_audio(temp_file)

            elif cmd == "clone":
                parts = arg.split(maxsplit=1)
                if len(parts) < 2:
                    print("用法: clone <参考音频路径/URL> <参考文本>")
                    continue

                ref_audio, ref_text = parts[0], parts[1]

                # 加载 clone 模型
                if current_model_type != "clone":
                    current_model = get_model("clone")
                    current_model_type = "clone"

                print(f"\n🎭 克隆中...")
                print(f"   参考: {ref_audio}")

                # 创建可复用的 prompt
                current_voice_prompt = current_model.create_voice_clone_prompt(
                    ref_audio=ref_audio,
                    ref_text=ref_text,
                )

                # 生成测试
                wavs, sr = current_model.generate_voice_clone(
                    text=test_text,
                    language=language,
                    voice_clone_prompt=current_voice_prompt,
                )
                last_wav, last_sr = wavs[0], sr

                temp_file = OUTPUT_DIR / "temp_clone.wav"
                sf.write(temp_file, wavs[0], sr)

                duration_ms = int(len(wavs[0]) / sr * 1000)
                print(f"✅ 克隆完成 ({duration_ms}ms)")

                play_audio(temp_file)

            elif cmd == "test":
                if not arg:
                    print("用法: test <文本>")
                    continue

                if current_model is None:
                    print("❌ 请先使用 design 或 clone 创建声音")
                    continue

                print(f"\n🔊 测试: {arg}")

                if current_model_type == "clone" and current_voice_prompt:
                    wavs, sr = current_model.generate_voice_clone(
                        text=arg,
                        language=language,
                        voice_clone_prompt=current_voice_prompt,
                    )
                elif current_model_type == "design":
                    print("⚠️ Design 模式需要重新指定 instruct，使用 design 命令")
                    continue
                else:
                    print("❌ 当前模式不支持 test")
                    continue

                last_wav, last_sr = wavs[0], sr
                temp_file = OUTPUT_DIR / "temp_test.wav"
                sf.write(temp_file, wavs[0], sr)

                play_audio(temp_file)

            elif cmd == "save":
                if last_wav is None:
                    print("❌ 没有可保存的声音")
                    continue

                name = arg or datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{name}.wav"
                filepath = OUTPUT_DIR / filename
                sf.write(filepath, last_wav, last_sr)
                print(f"✅ 已保存: {filepath}")

            elif cmd == "list":
                cmd_list(None)

            elif cmd == "play":
                if not arg:
                    print("用法: play <id>")
                    continue
                # 简单实现
                filepath = OUTPUT_DIR / f"{arg}.wav"
                if filepath.exists():
                    play_audio(filepath)
                else:
                    # 尝试从库中查找
                    lib = load_library()
                    all_voices = lib["voices"] + lib["clones"]
                    voice = next((v for v in all_voices if v["id"] == arg), None)
                    if voice:
                        fp = OUTPUT_DIR / voice["file"]
                        play_audio(fp)
                    else:
                        print(f"❌ 未找到: {arg}")

            else:
                print(f"未知命令: {cmd}")

        except Exception as e:
            print(f"❌ 错误: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Voice Designer - 为 ClawBody 定制声音",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", help="命令")

    # design 命令
    p_design = subparsers.add_parser("design", help="Voice Design - 通过描述生成声音")
    p_design.add_argument("--text", "-t", default="你好！我是 ClawBody 的语音助手，很高兴认识你！",
                          help="要合成的文本")
    p_design.add_argument("--instruct", "-i", required=True,
                          help="声音描述 (如: 温柔甜美的年轻女声)")
    p_design.add_argument("--language", "-l", default="Chinese",
                          help="语言 (Chinese/English/Japanese/Korean)")
    p_design.add_argument("--play", "-p", action="store_true",
                          help="生成后自动播放")

    # clone 命令
    p_clone = subparsers.add_parser("clone", help="Voice Clone - 从参考音频克隆声音")
    p_clone.add_argument("--ref-audio", "-r", required=True,
                         help="参考音频 (文件路径或 URL)")
    p_clone.add_argument("--ref-text", "-rt", required=True,
                         help="参考音频的文本内容")
    p_clone.add_argument("--text", "-t", default="你好！我是 ClawBody 的语音助手，很高兴认识你！",
                         help="要合成的文本")
    p_clone.add_argument("--language", "-l", default="Chinese",
                         help="语言")
    p_clone.add_argument("--play", "-p", action="store_true",
                         help="生成后自动播放")

    # list 命令
    subparsers.add_parser("list", help="列出声音库")

    # play 命令
    p_play = subparsers.add_parser("play", help="播放声音")
    p_play.add_argument("id", help="声音 ID")

    # interactive 命令
    subparsers.add_parser("interactive", help="交互模式")

    args = parser.parse_args()

    if args.command == "design":
        cmd_design(args)
    elif args.command == "clone":
        cmd_clone(args)
    elif args.command == "list":
        cmd_list(args)
    elif args.command == "play":
        cmd_play(args)
    elif args.command == "interactive":
        cmd_interactive(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
