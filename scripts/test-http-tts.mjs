#!/usr/bin/env node
/**
 * HTTP TTS 流式测试脚本
 * 模拟 Brain 每 100ms 发送一个句子到 /api/speak/stream
 */

const HTTP_HOST = process.env.HTTP_HOST || 'http://localhost:4000';

// 测试文本
const TEST_TEXT = `其实生活就是这种间歇性踌躇满志持续性混吃等死，每天早上恨不得把闹钟砸了并在心里上演一百场辞职大戏，结果一到公司立刻化身毫无感情的点头机器，好不容易熬到下班点灵魂才算回了窍，回家往沙发上一瘫就开始心安理得地刷手机，明明累得眼皮打架还得坚持刷到凌晨两点，主打一个在深夜里找寻自我，可能这就是咱们成年人最后的倔强吧，虽然没啥大志向但起码活得挺真实。`;

// 按标点符号分句
function splitSentences(text) {
  const sentences = text.split(/(?<=[，。！？；、])/);
  return sentences.filter(s => s.trim().length > 0);
}

// 发送单个句子
async function speakSentence(sentence, index) {
  const startTime = Date.now();

  console.log(`[${index}] 发送: "${sentence}"`);

  try {
    const response = await fetch(`${HTTP_HOST}/api/speak/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence }),
    });

    if (!response.ok) {
      console.error(`    错误: HTTP ${response.status}`);
      return;
    }

    // 读取 SSE 流，处理分块
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    let firstChunkTime = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按换行分割，处理完整的行
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // 保留不完整的最后一行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(line.slice(6));

          if (data.audio) {
            chunkCount++;
            if (chunkCount === 1) {
              firstChunkTime = Date.now() - startTime;
              console.log(`    首 chunk: ${firstChunkTime}ms`);
            }
          }

          if (data.done) {
            const totalTime = Date.now() - startTime;
            console.log(`    完成: ${data.chunks} chunks, ${totalTime}ms`);
          }
        } catch (e) {
          // 忽略解析错误（可能是空行或不完整数据）
        }
      }
    }
  } catch (err) {
    console.error(`    错误: ${err.message}`);
  }
}

// 延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 主函数
async function main() {
  console.log('=== HTTP TTS 流式测试 ===');
  console.log(`服务器: ${HTTP_HOST}`);
  console.log('发送间隔: 100ms');
  console.log('');

  // 分句
  const sentences = splitSentences(TEST_TEXT);
  console.log(`共 ${sentences.length} 个句子\n`);

  const startTime = Date.now();

  // 并发发送所有句子，每 100ms 发一个
  const promises = sentences.map(async (sentence, i) => {
    await delay(i * 100);  // 每 100ms 发一个
    return speakSentence(sentence, i + 1);
  });

  await Promise.all(promises);

  const totalTime = Date.now() - startTime;
  console.log(`\n=== 完成 ===`);
  console.log(`总耗时: ${totalTime}ms`);
}

main().catch(console.error);
