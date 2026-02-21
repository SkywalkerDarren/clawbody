import type { CapabilityRegistry, ExecutionContext } from '@clawbody/core';
import { logger } from '@clawbody/core';

export interface RouteResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * 能力路由器 - 将请求路由到对应的能力
 */
export class CapabilityRouter {
  private registry: CapabilityRegistry;

  constructor(registry: CapabilityRegistry) {
    this.registry = registry;
  }

  /**
   * 路由并执行操作
   */
  async route(
    capabilityId: string,
    operation: string,
    input: unknown,
    context?: ExecutionContext
  ): Promise<RouteResult> {
    const startTime = Date.now();

    const capability = this.registry.get(capabilityId);
    if (!capability) {
      return {
        success: false,
        error: `Capability not found: ${capabilityId}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Check if capability is ready
    if (capability.status !== 'ready' && capability.status !== 'busy') {
      return {
        success: false,
        error: `Capability not available: ${capabilityId} (status: ${capability.status})`,
        durationMs: Date.now() - startTime,
      };
    }

    // Check if operation exists
    const operations = capability.getOperations();
    const op = operations.find((o) => o.name === operation);
    if (!op) {
      return {
        success: false,
        error: `Operation not found: ${operation} on capability ${capabilityId}`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      logger.debug('router', `Executing ${capabilityId}.${operation}`, { context });
      const output = await capability.execute(operation, input, context);
      return {
        success: true,
        output,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      logger.error('router', `Execution failed: ${capabilityId}.${operation}`, err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取所有可用的路由
   */
  getRoutes(): Array<{ capabilityId: string; operation: string; description: string }> {
    const routes: Array<{ capabilityId: string; operation: string; description: string }> = [];

    for (const capability of this.registry.getAll()) {
      for (const op of capability.getOperations()) {
        routes.push({
          capabilityId: capability.meta.id,
          operation: op.name,
          description: op.description,
        });
      }
    }

    return routes;
  }
}
