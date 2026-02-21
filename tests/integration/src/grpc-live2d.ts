/**
 * gRPC 客户端测试脚本
 *
 * 通过 gRPC 控制 Live2D 做动作
 *
 * 使用: npx tsx src/grpc-live2d.ts
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRPC_HOST = process.env['GRPC_HOST'] ?? 'localhost:50051';
const PROTO_PATH = path.join(__dirname, '..', '..', '..', 'proto', 'nervous.proto');

// 加载 proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '..', '..', '..', 'proto')],
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const NervousSystem = protoDescriptor.clawbody.nervous.NervousSystem;

// 创建客户端
const client = new NervousSystem(GRPC_HOST, grpc.credentials.createInsecure());

function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
}

// 执行 gRPC 调用
function execute(capabilityId: string, operation: string, input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = {
      request_id: `req-${Date.now()}`,
      capability_id: capabilityId,
      operation: operation,
      input: Buffer.from(JSON.stringify(input)),
    };

    log(`→ Execute: ${capabilityId}.${operation}`, input);

    client.Execute(request, (err: Error | null, response: any) => {
      if (err) {
        reject(err);
      } else {
        const output = response.output ? JSON.parse(response.output.toString()) : null;
        resolve({ ...response, output });
      }
    });
  });
}

// 获取能力列表
function getCapabilities(): Promise<any> {
  return new Promise((resolve, reject) => {
    client.GetCapabilities({}, (err: Error | null, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// 健康检查
function healthCheck(): Promise<any> {
  return new Promise((resolve, reject) => {
    client.HealthCheck({}, (err: Error | null, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function main(): Promise<void> {
  log('========================================');
  log('🎮 gRPC Live2D 控制测试');
  log(`   连接: ${GRPC_HOST}`);
  log('========================================');

  try {
    // 1. 健康检查
    log('');
    log('📡 健康检查...');
    const health = await healthCheck();
    log('← 响应:', health);

    // 2. 获取能力列表
    log('');
    log('📋 获取能力列表...');
    const caps = await getCapabilities();
    log('← 能力:', caps.capabilities?.map((c: any) => `${c.id} (${c.status})`));

    // 3. Live2D 表情
    log('');
    log('😊 设置表情: f01');
    const expr = await execute('live2d', 'expression', { name: 'f01' });
    log('← 响应:', expr);

    // 等待一下
    await new Promise(r => setTimeout(r, 1000));

    // 4. Live2D 动作
    log('');
    log('💃 触发动作: idle');
    const motion = await execute('live2d', 'motion', { group: 'idle', index: 0 });
    log('← 响应:', motion);

    // 等待一下
    await new Promise(r => setTimeout(r, 1000));

    // 5. 另一个表情
    log('');
    log('😄 设置表情: f02');
    const expr2 = await execute('live2d', 'expression', { name: 'f02' });
    log('← 响应:', expr2);

    // 等待一下
    await new Promise(r => setTimeout(r, 1000));

    // 6. 另一个动作
    log('');
    log('🙆 触发动作: tap_body');
    const motion2 = await execute('live2d', 'motion', { group: 'tap_body', index: 0 });
    log('← 响应:', motion2);

    // 7. 获取模型信息
    log('');
    log('📊 获取模型信息...');
    const modelInfo = await execute('live2d', 'getModelInfo', {});
    log('← 模型信息:', modelInfo);

    log('');
    log('========================================');
    log('✅ 测试完成！');
    log('========================================');

  } catch (err) {
    log('❌ 错误:', err);
    process.exit(1);
  }

  // 关闭连接
  client.close();
}

main();
