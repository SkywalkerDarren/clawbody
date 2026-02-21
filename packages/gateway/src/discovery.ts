import Bonjour, { Service } from 'bonjour-service';
import { logger } from '@clawbody/core';
import os from 'os';

export interface DiscoveryConfig {
  serviceName?: string;
  grpcPort: number;
  httpPort?: number;
  metadata?: Record<string, string>;
}

/**
 * mDNS 服务发现 - 发布 ClawBody 服务到局域网
 */
export class ServiceDiscovery {
  private bonjour: Bonjour;
  private publishedService?: Service;
  private config: DiscoveryConfig;

  constructor(config: DiscoveryConfig) {
    this.config = config;
    this.bonjour = new Bonjour();
  }

  /** 发布服务到 mDNS */
  publish(): void {
    const hostname = os.hostname();

    this.publishedService = this.bonjour.publish({
      name: this.config.serviceName ?? `clawbody-${hostname}`,
      type: 'clawbody',
      protocol: 'tcp',
      port: this.config.grpcPort,
      txt: {
        version: '1.0.0',
        hostname,
        grpc: String(this.config.grpcPort),
        http: String(this.config.httpPort ?? 0),
        ...this.config.metadata,
      },
    });

    logger.info('discovery', `Published service: ${this.publishedService.name}`, {
      port: this.config.grpcPort,
      type: '_clawbody._tcp.local',
    });
  }

  /** 停止发布 */
  unpublish(): void {
    if (this.publishedService) {
      this.publishedService.stop?.();
      logger.info('discovery', 'Service unpublished');
    }
    this.bonjour.destroy();
  }

  /** 获取服务名称 */
  get serviceName(): string | undefined {
    return this.publishedService?.name;
  }
}

/**
 * 发现的 Body 信息
 */
export interface DiscoveredBody {
  name: string;
  host: string;
  grpcPort: number;
  httpPort?: number;
  version: string;
  metadata: Record<string, string>;
}

/**
 * Body 发现客户端 - 用于 Brain 端发现 Body 服务
 */
export class BodyDiscovery {
  private bonjour: Bonjour;
  private browser?: ReturnType<Bonjour['find']>;
  private bodies = new Map<string, DiscoveredBody>();
  private listeners = new Set<(bodies: DiscoveredBody[]) => void>();

  constructor() {
    this.bonjour = new Bonjour();
  }

  /** 开始发现 */
  startDiscovery(): void {
    this.browser = this.bonjour.find({ type: 'clawbody' });

    this.browser.on('up', (service) => {
      const txt = service.txt as Record<string, string> | undefined;
      const body: DiscoveredBody = {
        name: service.name,
        host: service.host,
        grpcPort: parseInt(txt?.['grpc'] ?? String(service.port), 10),
        httpPort: txt?.['http'] ? parseInt(txt['http'], 10) : undefined,
        version: txt?.['version'] ?? 'unknown',
        metadata: txt ?? {},
      };

      this.bodies.set(service.name, body);
      logger.info('discovery', `Found body: ${service.name}`, { host: service.host });
      this.notifyListeners();
    });

    this.browser.on('down', (service) => {
      this.bodies.delete(service.name);
      logger.info('discovery', `Lost body: ${service.name}`);
      this.notifyListeners();
    });
  }

  /** 获取所有发现的 Body */
  getBodies(): DiscoveredBody[] {
    return Array.from(this.bodies.values());
  }

  /** 订阅变化 */
  subscribe(listener: (bodies: DiscoveredBody[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const bodies = this.getBodies();
    for (const listener of this.listeners) {
      listener(bodies);
    }
  }

  /** 停止发现 */
  stopDiscovery(): void {
    this.browser?.stop();
    this.bonjour.destroy();
  }
}
