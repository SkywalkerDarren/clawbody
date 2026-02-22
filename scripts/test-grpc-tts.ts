#!/usr/bin/env npx tsx
/**
 * gRPC TTS 全链路测试脚本
 * 测试 Brain -> Body 流式 TTS
 */

import * as grpc from '@grpc/grpc-js';
import {
  NervousSystemClient,
  NervousSystemService,
  ExecuteRequest,
  ExecuteChunk,
} from '@clawbody/proto-gen';

const GRPC_HOST = process.env.GRPC_HOST || 'localhost:50051';

// 测试文本
const TEST_TEXT = `其实生活就是这种间歇性踌躇满志持续性混吃等死，每天早上恨不得把闹钟砸了并在心里上演一百场辞职大戏，结果一到公司立刻化身毫无感情的点头机器，好不容易熬到下班点灵魂才算回了窍，回家往沙发上一瘫就开始心安理得地刷手机，明明累得眼皮打架还得坚持刷到凌晨两点，主打一个在深夜里找寻自我，可能这就是咱们成年人最后的倔强吧，虽然没啥大志向但起码活得挺真实。`;

// 按标点符号分句
function splitSentences(text: string): string[] {
  // 按中文标点分割，保留标点
  const sentences = text.split(/(?<=[，。！？；、])/);
  return sentences.filter(s => s.trim().length > 0);
}

// 创建 gRPC 客户端
function createClient(): NervousSystemClient {
  const Client = grpc.makeGenericClientConstructor(
    NervousSystemService,
    'NervousSystem'
  ) as unknown as new (
    address: string,
    credentials: grpc.ChannelCredentials
  ) => NervousSystemClient;

  return new Client(GRPC_HOST, grpc.credentials.createInsecure());
}

// 发送单个句子并接收流式音频
async function speakSentence(
  client: NervousSystemClient,
  sentence: string,
  index: number
): Promise<{ chunks: number; bytes: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let chunkCount = 0;
    let totalBytes = 0;

    const request: ExecuteRequest = {
      requestId: `req-${index}-${Date.now()}`,
      capabilityId: 'tts',
      operation: 'synthesizeStream',
      input: Buffer.from(JSON.stringify({
        text: sentence,
        voice: '2',
        provider: 'qwen',
      })),
      options: undefined,
    };

    console.log(`\n[${index}] 发送: "${sentence.slice(0, 30)}${sentence.length > 30 ? '...' : ''}"`);

    const stream = client.executeStream(request);

    stream.on('data', (chunk: ExecuteChunk) => {
      chunkCount++;
      totalBytes += chunk.data.length;

      if (chunkCount === 1) {
        const firstChunkMs = Date.now() - startTime;
        console.log(`    首 chunk 延迟: ${firstChunkMs}ms`);
      }

      if (chunk.isFinal) {
        console.log(`    完成: ${chunkCount} chunks, ${totalBytes} bytes`);
      }
    });

    stream.on('error', (err: Error) => {
      console.error(`    错误: ${err.message}`);
      reject(err);
    });

    stream.on('end', () => {
      const durationMs = Date.now() - startTime;
      console.log(`    总耗时: ${durationMs}ms`);
      resolve({ chunks: chunkCount, bytes: totalBytes, durationMs });
    });
  });
}

// 主函数
async function main() {
  console.log('=== gRPC TTS 全链路测试 ===');
  console.log(`服务器: ${GRPC_HOST}`);
  console.log('');

  const client = createClient();

  // 先测试健康检查
  console.log('检查服务状态...');
  await new Promise<void>((resolve, reject) => {
    client.healthCheck({ capabilityIds: [] }, (err, response) => {
      if (err) {
        console.error('健康检查失败:', err.message);
        reject(err);
        return;
      }
      console.log(`服务状态: ${response?.overallStatus}`);
      response?.capabilities.forEach(cap => {
        console.log(`  - ${cap.capabilityId}: ${cap.status}`);
      });
      resolve();
    });
  });

  // 分句
  const sentences = splitSentences(TEST_TEXT);
  console.log(`\n共 ${sentences.length} 个句子:`);
  sentences.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  // 逐句发送
  console.log('\n开始流式 TTS 测试...');
  const results: { chunks: number; bytes: number; durationMs: number }[] = [];

  for (let i = 0; i < sentences.length; i++) {
    try {
      const result = await speakSentence(client, sentences[i], i + 1);
      results.push(result);
    } catch (err) {
      console.error(`句子 ${i + 1} 失败:`, err);
    }
  }

  // 统计
  console.log('\n=== 统计 ===');
  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  console.log(`总 chunks: ${totalChunks}`);
  console.log(`总字节: ${(totalBytes / 1024).toFixed(2)} KB`);
  console.log(`总耗时: ${totalDuration}ms`);
  console.log(`平均每句: ${(totalDuration / sentences.length).toFixed(0)}ms`);

  client.close();
}

main().catch(console.error);
