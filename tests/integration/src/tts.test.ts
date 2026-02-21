/**
 * TTS 集成测试
 *
 * 测试 Qwen3-TTS 服务可用性，合成语音并保存为 WAV
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GATEWAY_URL = process.env['GATEWAY_URL'] ?? 'http://localhost:4000';
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : '');
}

async function main(): Promise<void> {
  log('========================================');
  log('🎤 TTS 集成测试');
  log(`   Gateway: ${GATEWAY_URL}`);
  log('========================================');

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. 检查 Gateway 健康状态
  log('');
  log('📡 检查 Gateway 健康状态...');
  const healthRes = await fetch(`${GATEWAY_URL}/api/health`);
  const health = await healthRes.json();
  log('← 响应:', health);

  // 2. 获取能力列表
  log('');
  log('📋 获取能力列表...');
  const capsRes = await fetch(`${GATEWAY_URL}/api/capabilities`);
  const caps = (await capsRes.json()) as { capabilities: Array<{ id: string; name: string }> };
  log('← 能力:', caps.capabilities.map(c => `${c.id} (${c.name})`));

  const hasTTS = caps.capabilities.some(c => c.id === 'tts');
  if (!hasTTS) {
    log('❌ TTS 能力不可用');
    process.exit(1);
  }

  // 3. 直接调用 Qwen3-TTS 服务测试
  log('');
  log('🔊 直接测试 Qwen3-TTS 服务...');
  const ttsServiceUrl = 'http://localhost:8765';

  try {
    const ttsHealthRes = await fetch(`${ttsServiceUrl}/health`);
    const ttsHealth = (await ttsHealthRes.json()) as { status: string; model: string };
    log('← TTS 服务状态:', ttsHealth);

    if (ttsHealth.status !== 'ready') {
      log('❌ TTS 服务未就绪');
      process.exit(1);
    }
  } catch (err) {
    log('❌ 无法连接 TTS 服务:', err);
    process.exit(1);
  }

  // 4. 获取说话人列表
  log('');
  log('👥 获取说话人列表...');
  const speakersRes = await fetch(`${ttsServiceUrl}/speakers`);
  const speakers = (await speakersRes.json()) as { speakers: string[]; languages: string[] };
  log('← 说话人:', speakers.speakers);
  log('← 语言:', speakers.languages);

  // 5. 合成语音 - 中文问候
  log('');
  log('🎵 合成中文问候语...');
  const greetingCN = '你好！我是 ClawBody 的语音助手，很高兴认识你！';

  const synthRes = await fetch(`${ttsServiceUrl}/synthesize/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: greetingCN,
      language: 'Chinese',
      speaker: 'Vivian',
    }),
  });

  if (!synthRes.ok) {
    const err = await synthRes.text();
    log('❌ 合成失败:', err);
    process.exit(1);
  }

  const audioBuffer = Buffer.from(await synthRes.arrayBuffer());
  const outputPath = path.join(OUTPUT_DIR, 'greeting_cn.wav');
  fs.writeFileSync(outputPath, audioBuffer);
  log(`✅ 已保存: ${outputPath} (${audioBuffer.length} bytes)`);

  // 6. 合成语音 - 英文问候
  log('');
  log('🎵 合成英文问候语...');
  const greetingEN = 'Hello! I am the voice assistant of ClawBody. Nice to meet you!';

  const synthResEN = await fetch(`${ttsServiceUrl}/synthesize/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: greetingEN,
      language: 'English',
      speaker: 'Ryan',
    }),
  });

  if (!synthResEN.ok) {
    const err = await synthResEN.text();
    log('❌ 合成失败:', err);
    process.exit(1);
  }

  const audioBufferEN = Buffer.from(await synthResEN.arrayBuffer());
  const outputPathEN = path.join(OUTPUT_DIR, 'greeting_en.wav');
  fs.writeFileSync(outputPathEN, audioBufferEN);
  log(`✅ 已保存: ${outputPathEN} (${audioBufferEN.length} bytes)`);

  // 7. 通过 Gateway 测试 TTS (如果可用)
  log('');
  log('🌐 通过 Gateway 测试 TTS...');
  try {
    // 这里假设 Gateway 有 /api/tts 端点，如果没有则跳过
    const gatewayTTSRes = await fetch(`${GATEWAY_URL}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '测试通过网关合成',
        voice: 'Vivian',
      }),
    });

    if (gatewayTTSRes.ok) {
      const result = await gatewayTTSRes.json();
      log('← Gateway TTS 响应:', result);
    } else {
      log('⚠️ Gateway TTS 端点不可用 (这是正常的，直接使用 TTS 服务即可)');
    }
  } catch {
    log('⚠️ Gateway TTS 端点不可用');
  }

  log('');
  log('========================================');
  log('✅ TTS 集成测试完成！');
  log(`   输出目录: ${OUTPUT_DIR}`);
  log('========================================');
}

main().catch((err) => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
