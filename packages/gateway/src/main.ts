import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';
import { CapabilityRegistry, logger } from '@clawbody/core';
import { GatewayServer, HttpServer, ServiceDiscovery } from './index.js';

// === 配置类型 ===

export interface PersonaConfig {
  name: string;
  voice: {
    provider: string;
    id: string;
    language: string;
  };
  model: {
    path: string;
    scale?: number;
    position?: string;
  };
  expressions: Record<string, string>;
  motions: Record<string, string>;
}

export interface BodyConfig {
  persona?: PersonaConfig;
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
      providers?: Record<string, { type: string; baseUrl?: string }>;
    };
    stt?: {
      enabled?: boolean;
      providers?: Record<string, { type: string; baseUrl?: string }>;
    };
    vision?: { enabled?: boolean; preferredTool?: string };
  };
  openclaw?: {
    webhookUrl: string;
    sessionKey?: string;
  };
  logging?: {
    level?: string;
  };
}

// 全局配置 (供其他模块访问)
let globalConfig: BodyConfig | null = null;

export function getConfig(): BodyConfig | null {
  return globalConfig;
}

export function getPersona(): PersonaConfig | null {
  return globalConfig?.persona ?? null;
}

function loadConfig(): BodyConfig {
  const configPaths = [
    join(process.cwd(), 'config', 'default.yaml'),
    join(__dirname, '..', '..', '..', 'config', 'default.yaml'),
  ];

  let config: BodyConfig = {
    grpc: { port: 50051 },
    http: { port: 4000 },
    discovery: { enabled: true },
  };

  // Load default config
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      logger.info('main', `Loading config from ${configPath}`);
      const content = readFileSync(configPath, 'utf-8');
      config = parse(content) as BodyConfig;
      break;
    }
  }

  // Load local config (overrides default, contains secrets)
  const localPaths = [
    join(process.cwd(), 'config', 'local.yaml'),
    join(__dirname, '..', '..', '..', 'config', 'local.yaml'),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      logger.info('main', `Loading local config from ${localPath}`);
      const localContent = readFileSync(localPath, 'utf-8');
      const localConfig = parse(localContent) as Partial<BodyConfig>;
      // Merge local config into default (shallow merge per section)
      if (localConfig.persona) config.persona = { ...config.persona, ...localConfig.persona };
      if (localConfig.grpc) config.grpc = { ...config.grpc, ...localConfig.grpc };
      if (localConfig.http) config.http = { ...config.http, ...localConfig.http };
      if (localConfig.discovery) config.discovery = { ...config.discovery, ...localConfig.discovery };
      if (localConfig.capabilities) config.capabilities = { ...config.capabilities, ...localConfig.capabilities };
      if (localConfig.openclaw) config.openclaw = localConfig.openclaw;
      if (localConfig.logging) config.logging = { ...config.logging, ...localConfig.logging };
      break;
    }
  }

  return config;
}

/**
 * ClawBody 主入口
 */
async function main(): Promise<void> {
  const config = loadConfig();
  globalConfig = config;

  // 设置日志级别
  if (config.logging?.level) {
    logger.setLevel(config.logging.level as 'debug' | 'info' | 'warn' | 'error');
  }

  logger.info('main', 'Starting ClawBody...');

  if (config.persona) {
    logger.info('main', `Persona: ${config.persona.name}`, {
      voice: `${config.persona.voice.provider}/${config.persona.voice.id}`,
      model: config.persona.model.path,
    });
  }

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

  if (config.capabilities?.stt?.enabled !== false) {
    try {
      const { createSTTCapability } = await import('@clawbody/stt');
      const stt = createSTTCapability();
      registry.register(stt);
    } catch (err) {
      logger.warn('main', 'STT capability not available', err);
    }
  }

  // 初始化所有能力
  const defaultProvider = config.persona?.voice.provider ?? 'qwen';
  await registry.initializeAll({
    live2d: {},
    tts: {
      defaultProvider,
      providers: config.capabilities?.tts?.providers ?? {
        qwen: { type: 'qwen', baseUrl: 'http://localhost:8765' },
      },
    },
    stt: {
      defaultProvider: 'qwen',
      providers: config.capabilities?.stt?.providers ?? {
        qwen: { type: 'qwen', baseUrl: 'http://localhost:8766' },
      },
    },
    vision: {
      preferredTool: config.capabilities?.vision?.preferredTool,
    },
  });

  // 启动 gRPC 服务器
  const grpcServer = new GatewayServer(registry);
  await grpcServer.start(config.grpc);

  // 启动 HTTP/WS/SSE 服务器 (传入 persona 配置和 openclaw 配置)
  const httpServer = new HttpServer(registry, config.http, config.persona, config.openclaw);
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
