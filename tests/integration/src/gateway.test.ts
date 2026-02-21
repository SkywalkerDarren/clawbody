/**
 * ClawBody 集成测试
 *
 * 测试完整的 Gateway + Capabilities 集成
 */

import { CapabilityRegistry, logger } from '@clawbody/core';
import { GatewayServer, HttpServer } from '@clawbody/gateway';
import { Live2DCapability } from '@clawbody/live2d';
import { createTTSCapability } from '@clawbody/tts';
import { VisionCapability } from '@clawbody/vision';

const GRPC_PORT = 50052;  // 使用不同端口避免冲突
const HTTP_PORT = 4001;

// 简单的测试框架
let passed = 0;
let failed = 0;

function log(msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  if (data) {
    console.log(`[${timestamp}] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${msg}`);
  }
}

function assert(condition: boolean, name: string): void {
  if (condition) {
    passed++;
    log(`✅ PASS: ${name}`);
  } else {
    failed++;
    log(`❌ FAIL: ${name}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(url, options);
  return res.json();
}

async function main(): Promise<void> {
  log('========================================');
  log('🚀 ClawBody 集成测试开始');
  log('========================================');

  // === Phase 1: 初始化能力 ===
  log('');
  log('📦 Phase 1: 初始化能力');
  log('----------------------------------------');

  const registry = new CapabilityRegistry();

  // 注册 Live2D
  const live2d = new Live2DCapability();
  registry.register(live2d);
  log('  ✓ Live2D 能力已注册');

  // 注册 TTS
  const tts = createTTSCapability();
  registry.register(tts);
  log('  ✓ TTS 能力已注册');

  // 注册 Vision
  const vision = new VisionCapability();
  registry.register(vision);
  log('  ✓ Vision 能力已注册');

  // 初始化所有能力
  log('  → 初始化所有能力...');
  await registry.initializeAll({
    live2d: {},
    tts: {
      defaultProvider: 'edge',
      providers: {
        edge: { type: 'edge' },
      },
    },
    vision: {},
  });

  const allCaps = registry.getAll();
  log(`  ✓ 已初始化 ${allCaps.length} 个能力`);

  for (const cap of allCaps) {
    log(`    - ${cap.meta.id}: ${cap.status}`);
  }

  // === Phase 2: 启动服务器 ===
  log('');
  log('🌐 Phase 2: 启动服务器');
  log('----------------------------------------');

  // 启动 gRPC 服务器
  const grpcServer = new GatewayServer(registry);
  await grpcServer.start({ port: GRPC_PORT });
  log(`  ✓ gRPC 服务器已启动 (端口: ${GRPC_PORT})`);

  // 启动 HTTP 服务器
  const httpServer = new HttpServer(registry, { port: HTTP_PORT });
  await httpServer.start();
  log(`  ✓ HTTP 服务器已启动 (端口: ${HTTP_PORT})`);

  await sleep(500);  // 等待服务器完全启动

  // === Phase 3: HTTP API 测试 ===
  log('');
  log('🔌 Phase 3: HTTP API 测试');
  log('----------------------------------------');

  const baseUrl = `http://localhost:${HTTP_PORT}`;

  // 测试 /api/health
  log('  → 测试 GET /api/health');
  try {
    const health = await fetchJson(`${baseUrl}/api/health`) as { ok: boolean; uptime: number };
    log('    响应:', health);
    assert(health.ok === true, 'Health check 返回 ok=true');
    assert(typeof health.uptime === 'number', 'Health check 包含 uptime');
  } catch (err) {
    log('    错误:', err);
    assert(false, 'Health check 请求成功');
  }

  // 测试 /api/capabilities
  log('  → 测试 GET /api/capabilities');
  try {
    const caps = await fetchJson(`${baseUrl}/api/capabilities`) as { capabilities: Array<{ id: string }> };
    log('    响应:', caps);
    assert(Array.isArray(caps.capabilities), 'Capabilities 返回数组');
    assert(caps.capabilities.length >= 3, 'Capabilities 包含至少 3 个能力');
  } catch (err) {
    log('    错误:', err);
    assert(false, 'Capabilities 请求成功');
  }

  // 测试 /api/model-info (Live2D)
  log('  → 测试 GET /api/model-info');
  try {
    const modelInfo = await fetchJson(`${baseUrl}/api/model-info`) as { loaded: boolean };
    log('    响应:', modelInfo);
    assert(typeof modelInfo.loaded === 'boolean', 'Model info 包含 loaded 字段');
  } catch (err) {
    log('    错误:', err);
    assert(false, 'Model info 请求成功');
  }

  // === Phase 4: 能力执行测试 ===
  log('');
  log('⚡ Phase 4: 能力执行测试');
  log('----------------------------------------');

  // 测试 Live2D expression
  log('  → 测试 Live2D expression');
  try {
    const result = await live2d.execute('expression', { name: 'f01' }) as { success: boolean };
    log('    结果:', result);
    assert(result.success === true, 'Live2D expression 执行成功');
  } catch (err) {
    log('    错误:', err);
    assert(false, 'Live2D expression 执行');
  }

  // 测试 Live2D motion
  log('  → 测试 Live2D motion');
  try {
    const result = await live2d.execute('motion', { group: 'idle', index: 0 }) as { success: boolean };
    log('    结果:', result);
    assert(result.success === true, 'Live2D motion 执行成功');
  } catch (err) {
    log('    错误:', err);
    assert(false, 'Live2D motion 执行');
  }

  // 测试 Live2D getModelInfo
  log('  → 测试 Live2D getModelInfo');
  try {
    const result = await live2d.execute('getModelInfo', {}) as { loaded: boolean };
    log('    结果:', result);
    assert(typeof result.loaded === 'boolean', 'Live2D getModelInfo 返回 loaded');
  } catch (err) {
    log('    错误:', err);
    assert(false, 'Live2D getModelInfo 执行');
  }

  // 测试 TTS listVoices
  log('  → 测试 TTS listVoices');
  if (tts.status === 'ready') {
    try {
      const result = await tts.execute('listVoices', {}) as { voices: unknown[] };
      log('    结果: voices count =', result.voices?.length ?? 0);
      assert(Array.isArray(result.voices), 'TTS listVoices 返回数组');
    } catch (err) {
      log('    错误:', err);
      assert(false, 'TTS listVoices 执行');
    }
  } else {
    log('    ⚠️ TTS 不可用 (无提供商)，跳过测试');
  }

  // 测试 Vision (如果可用)
  log('  → 测试 Vision screenshot');
  if (vision.status === 'ready') {
    try {
      const result = await vision.execute('screenshot', {}) as { width: number; height: number };
      log('    结果: width =', result.width, 'height =', result.height);
      assert(result.width > 0 && result.height > 0, 'Vision screenshot 返回有效尺寸');
    } catch (err) {
      log('    错误:', err);
      assert(false, 'Vision screenshot 执行');
    }
  } else {
    log('    ⚠️ Vision 不可用，跳过测试');
  }

  // === Phase 5: 健康检查 ===
  log('');
  log('💓 Phase 5: 能力健康检查');
  log('----------------------------------------');

  const healthResults = await registry.healthCheckAll();
  for (const [id, health] of Object.entries(healthResults)) {
    log(`  ${id}: ${health.status} - ${health.message ?? 'OK'}`);
  }

  // === Phase 6: 清理 ===
  log('');
  log('🧹 Phase 6: 清理');
  log('----------------------------------------');

  await httpServer.stop();
  log('  ✓ HTTP 服务器已停止');

  await grpcServer.stop();
  log('  ✓ gRPC 服务器已停止');

  await registry.shutdownAll();
  log('  ✓ 所有能力已关闭');

  // === 结果汇总 ===
  log('');
  log('========================================');
  log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
  log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ 集成测试失败:', err);
  process.exit(1);
});
