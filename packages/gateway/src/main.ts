import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';
import { CapabilityRegistry, logger } from '@clawbody/core';
import { GatewayServer, HttpServer, ServiceDiscovery } from './index.js';

export interface BodyConfig {
  grpc: {
    port: number;
    host?: string;
  };
  http: {
    port: number;
    host?: string;
    apiKey?: string;
  };
  discovery?: {
    enabled: boolean;
    serviceName?: string;
  };
  capabilities?: {
    live2d?: { enabled?: boolean };
    tts?: {
      enabled?: boolean;
      defaultProvider?: string;
      providers?: Record<string, { type: string; baseUrl?: string }>;
    };
    vision?: { enabled?: boolean; preferredTool?: string };
  };
}

function loadConfig(): BodyConfig {
  const configPaths = [
    join(process.cwd(), 'config', 'default.yaml'),
    join(__dirname, '..', '..', '..', 'config', 'default.yaml'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      logger.info('main', `Loading config from ${configPath}`);
      const content = readFileSync(configPath, 'utf-8');
      return parse(content) as BodyConfig;
    }
  }

  logger.warn('main', 'No config file found, using defaults');
  return {
    grpc: { port: 50051 },
    http: { port: 4000 },
    discovery: { enabled: true },
  };
}

/**
 * ClawBody 主入口
 */
async function main(): Promise<void> {
  const config = loadConfig();

  logger.info('main', 'Starting ClawBody...');

  // 创建能力注册表
  const registry = new CapabilityRegistry();

  // 动态加载能力
  if (config.capabilities?.live2d?.enabled !== false) {
    try {
      const { Live2DCapability } = await import('@clawbody/live2d');
      const live2d = new Live2DCapability();
      registry.register(live2d);
    } catch (err) {
      logger.warn('main', 'Live2D capability not available', err);
    }
  }

  if (config.capabilities?.tts?.enabled !== false) {
    try {
      const { createTTSCapability } = await import('@clawbody/tts');
      const tts = createTTSCapability();
      registry.register(tts);
    } catch (err) {
      logger.warn('main', 'TTS capability not available', err);
    }
  }

  if (config.capabilities?.vision?.enabled !== false) {
    try {
      const { VisionCapability } = await import('@clawbody/vision');
      const vision = new VisionCapability();
      registry.register(vision);
    } catch (err) {
      logger.warn('main', 'Vision capability not available', err);
    }
  }

  // 初始化所有能力
  await registry.initializeAll({
    live2d: {},
    tts: {
      defaultProvider: config.capabilities?.tts?.defaultProvider ?? 'edge',
      providers: config.capabilities?.tts?.providers ?? {
        edge: { type: 'edge' },
      },
    },
    vision: {
      preferredTool: config.capabilities?.vision?.preferredTool,
    },
  });

  // 启动 gRPC 服务器
  const grpcServer = new GatewayServer(registry);
  await grpcServer.start(config.grpc);

  // 启动 HTTP/WS/SSE 服务器
  const httpServer = new HttpServer(registry, config.http);
  await httpServer.start();

  // 启动 mDNS 服务发现
  let discovery: ServiceDiscovery | null = null;
  if (config.discovery?.enabled) {
    discovery = new ServiceDiscovery({
      grpcPort: config.grpc.port,
      httpPort: config.http.port,
      serviceName: config.discovery.serviceName,
    });
    discovery.publish();
  }

  logger.info('main', 'ClawBody started', {
    grpc: config.grpc.port,
    http: config.http.port,
    capabilities: registry.getAllIds().join(', '),
  });

  // 优雅关闭
  const shutdown = async (): Promise<void> => {
    logger.info('main', 'Shutting down...');

    discovery?.unpublish();
    await httpServer.stop();
    await grpcServer.stop();
    await registry.shutdownAll();

    logger.info('main', 'Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('main', 'Fatal error', err);
  process.exit(1);
});
