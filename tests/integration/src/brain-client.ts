/**
 * Brain 示例客户端
 *
 * 演示如何通过 gRPC 控制 ClawBody
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

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
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : '');
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

// 健康检查
function healthCheck(): Promise<any> {
  return new Promise((resolve, reject) => {
    client.HealthCheck({}, (err: Error | null, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// === Body 控制封装 ===

class Body {
  // Live2D 控制
  static async setExpression(name: string): Promise<void> {
    log(`😊 设置表情: ${name}`);
    await execute('live2d', 'expression', { name });
  }

  static async playMotion(group: string, index = 0): Promise<void> {
    log(`💃 播放动作: ${group}[${index}]`);
    await execute('live2d', 'motion', { group, index });
  }

  static async getModelInfo(): Promise<any> {
    const result = await execute('live2d', 'getModelInfo', {});
    return result.output;
  }

  // TTS 控制 (直接调用 TTS 服务)
  static async speak(text: string, voice = 'vivian'): Promise<void> {
    log(`🎤 说话: "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`);

    // 同时触发说话动作
    await this.playMotion('tap_body', Math.floor(Math.random() * 3));

    // 调用 TTS 服务
    const ttsUrl = process.env['TTS_URL'] ?? 'http://localhost:8765';
    const res = await fetch(`${ttsUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker: voice, language: 'Auto' }),
    });

    if (!res.ok) {
      throw new Error(`TTS failed: ${res.status}`);
    }

    const data = (await res.json()) as { duration_ms: number };
    log(`   ← 语音时长: ${data.duration_ms}ms`);

    // 等待语音播放完成
    await sleep(data.duration_ms);
  }

  // Vision 控制
  static async screenshot(): Promise<{ width: number; height: number; data: string }> {
    log('📷 截取屏幕...');
    const result = await execute('vision', 'screenshot', {});
    log(`   ← 尺寸: ${result.output.width}x${result.output.height}`);
    return result.output;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// === 演示场景 ===

async function demoGreeting(): Promise<void> {
  log('');
  log('=== 场景: 打招呼 ===');

  await Body.setExpression('f02'); // 开心
  await Body.speak('你好！我是 ClawBody，很高兴认识你！', 'vivian');
  await Body.setExpression('f01'); // 恢复默认
}

async function demoThinking(): Promise<void> {
  log('');
  log('=== 场景: 思考问题 ===');

  await Body.setExpression('f01');
  await Body.playMotion('idle');
  log('   (思考中...)');
  await sleep(2000);

  await Body.setExpression('f02');
  await Body.speak('我想到了！答案是 42！', 'vivian');
}

async function demoSurprise(): Promise<void> {
  log('');
  log('=== 场景: 表达惊讶 ===');

  await Body.setExpression('f03');
  await Body.playMotion('shake');
  await Body.speak('哇！这太厉害了！', 'vivian');
  await Body.setExpression('f01');
}

async function demoLookScreen(): Promise<void> {
  log('');
  log('=== 场景: 查看屏幕 ===');

  await Body.setExpression('f03');
  const screen = await Body.screenshot();
  log(`   屏幕尺寸: ${screen.width}x${screen.height}`);

  await Body.speak('我看到了你的屏幕，分辨率是 ' + screen.width + ' 乘 ' + screen.height, 'vivian');
  await Body.setExpression('f01');
}

// === 交互式命令 ===

async function interactiveMode(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log('=== 交互模式 ===');
  console.log('命令:');
  console.log('  expr <name>     - 设置表情 (f01, f02, f03, f04)');
  console.log('  motion <group>  - 播放动作 (idle, tap_body, shake, ...)');
  console.log('  say <text>      - 说话');
  console.log('  screen          - 截屏');
  console.log('  demo            - 运行演示');
  console.log('  quit            - 退出');
  console.log('');

  const prompt = (): void => {
    rl.question('> ', async (input) => {
      const [cmd, ...args] = input.trim().split(' ');

      try {
        switch (cmd) {
          case 'expr':
            await Body.setExpression(args[0] || 'f01');
            break;
          case 'motion':
            await Body.playMotion(args[0] || 'idle');
            break;
          case 'say':
            await Body.speak(args.join(' ') || '你好');
            break;
          case 'screen':
            await Body.screenshot();
            break;
          case 'demo':
            await runDemo();
            break;
          case 'quit':
          case 'exit':
            rl.close();
            client.close();
            process.exit(0);
          default:
            console.log('未知命令:', cmd);
        }
      } catch (err) {
        console.error('错误:', err);
      }

      prompt();
    });
  };

  prompt();
}

async function runDemo(): Promise<void> {
  await demoGreeting();
  await sleep(1000);
  await demoThinking();
  await sleep(1000);
  await demoSurprise();
  await sleep(1000);
  await demoLookScreen();
}

async function main(): Promise<void> {
  log('========================================');
  log('🧠 Brain 示例客户端');
  log(`   连接: ${GRPC_HOST}`);
  log('========================================');

  // 健康检查
  log('');
  log('📡 检查身体状态...');
  const health = await healthCheck();
  log(`← 状态: ${health.overall_status}, 运行时间: ${health.uptime_seconds}s`);

  // 获取模型信息
  const modelInfo = await Body.getModelInfo();
  log(`← Live2D: loaded=${modelInfo.loaded}, expressions=${modelInfo.expressions?.length || 0}`);

  // 检查命令行参数
  const arg = process.argv[2];

  if (arg === '--demo') {
    await runDemo();
    client.close();
  } else if (arg === '--interactive' || arg === '-i') {
    await interactiveMode();
  } else {
    console.log('');
    console.log('用法:');
    console.log('  --demo         运行演示场景');
    console.log('  --interactive  交互模式');
    client.close();
  }
}

main().catch((err) => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
