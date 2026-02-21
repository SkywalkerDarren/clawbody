import type {
  ICapability,
  CapabilityMeta,
  CapabilityStatus,
  CapabilityHealth,
  OperationDescriptor,
  ExecutionContext,
  EventHandler,
  Unsubscribe,
} from '@clawbody/core';
import { logger } from '@clawbody/core';

export interface Live2DConfig {
  modelPath?: string;
}

export interface ExpressionInput {
  name: string;
}

export interface MotionInput {
  group: string;
  index?: number;
}

export interface ShowInput {
  type: 'image' | 'text';
  content: string;
}

export interface ModelInfo {
  expressions: string[];
  motions: Record<string, number>;
}

/**
 * Live2D 能力 - 桌面伴侣控制
 *
 * 纯能力实现，通过事件系统与 Gateway 通信
 * Gateway 负责将事件广播到前端
 */
export class Live2DCapability implements ICapability<Live2DConfig> {
  readonly meta: CapabilityMeta = {
    id: 'live2d',
    name: 'Live2D Desktop Companion',
    version: '1.0.0',
    type: 'output',
    description: '桌面 Live2D 角色控制，支持表情、动作、显示内容',
  };

  private _status: CapabilityStatus = 'initializing';
  private modelLoaded = false;
  private modelInfo: ModelInfo = { expressions: [], motions: {} };
  private eventHandlers = new Set<EventHandler>();

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(_config: Live2DConfig): Promise<void> {
    this._status = 'ready';
    logger.info('live2d', 'Live2D capability initialized');
  }

  async healthCheck(): Promise<CapabilityHealth> {
    return {
      status: this._status,
      message: this.modelLoaded ? 'Model loaded' : 'Waiting for model',
      lastCheck: new Date(),
      details: {
        modelLoaded: String(this.modelLoaded),
        expressions: this.modelInfo.expressions.join(', '),
        motionGroups: Object.keys(this.modelInfo.motions).join(', '),
      },
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'expression',
        description: '设置 Live2D 角色表情',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '表情名称' },
          },
          required: ['name'],
        },
        outputSchema: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
        },
        streaming: false,
      },
      {
        name: 'motion',
        description: '触发 Live2D 角色动作',
        inputSchema: {
          type: 'object',
          properties: {
            group: { type: 'string', description: '动作组名称' },
            index: { type: 'number', description: '动作索引（可选）' },
          },
          required: ['group'],
        },
        outputSchema: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
        },
        streaming: false,
      },
      {
        name: 'show',
        description: '显示图片或文字内容',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['image', 'text'] },
            content: { type: 'string', description: '内容（图片为 base64，文字为纯文本）' },
          },
          required: ['type', 'content'],
        },
        outputSchema: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
        },
        streaming: false,
      },
      {
        name: 'getModelInfo',
        description: '获取当前模型信息',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: {
          type: 'object',
          properties: {
            loaded: { type: 'boolean' },
            expressions: { type: 'array', items: { type: 'string' } },
            motions: { type: 'object' },
          },
        },
        streaming: false,
      },
    ];
  }

  async execute<TInput, TOutput>(
    operation: string,
    input: TInput,
    _context?: ExecutionContext
  ): Promise<TOutput> {
    switch (operation) {
      case 'expression':
        return this.setExpression(input as ExpressionInput) as TOutput;
      case 'motion':
        return this.triggerMotion(input as MotionInput) as TOutput;
      case 'show':
        return this.showContent(input as ShowInput) as TOutput;
      case 'getModelInfo':
        return this.getModelInfoResult() as TOutput;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  subscribe(handler: EventHandler): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async shutdown(): Promise<void> {
    this._status = 'unavailable';
    this.modelLoaded = false;
    this.modelInfo = { expressions: [], motions: {} };
    this.eventHandlers.clear();
    logger.info('live2d', 'Live2D capability shutdown');
  }

  // === 前端回调方法（由 Gateway 调用） ===

  /**
   * 设置模型加载状态（前端加载完成后调用）
   */
  setModelLoaded(loaded: boolean, info?: ModelInfo): void {
    this.modelLoaded = loaded;
    if (loaded && info) {
      this.modelInfo = info;
      logger.info('live2d', 'Model loaded', info);
    } else if (!loaded) {
      this.modelInfo = { expressions: [], motions: {} };
      logger.info('live2d', 'Model unloaded');
    }
    this.emitEvent('modelStateChanged', { loaded, info: this.modelInfo });
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  getModelInfo(): ModelInfo {
    return this.modelInfo;
  }

  // === Private ===

  private setExpression(input: ExpressionInput): { success: boolean } {
    this.warnIfNotLoaded('expression');
    logger.info('live2d', 'setExpression', input);
    // 发送事件，Gateway 会广播到前端
    this.emitEvent('command', { type: 'expression', data: input });
    return { success: true };
  }

  private triggerMotion(input: MotionInput): { success: boolean } {
    this.warnIfNotLoaded('motion');
    logger.info('live2d', 'triggerMotion', input);
    this.emitEvent('command', { type: 'motion', data: input });
    return { success: true };
  }

  private showContent(input: ShowInput): { success: boolean } {
    this.warnIfNotLoaded('show');
    logger.info('live2d', 'showContent', { type: input.type, contentLen: input.content.length });
    this.emitEvent('command', { type: 'show', data: input });
    return { success: true };
  }

  private getModelInfoResult(): { loaded: boolean; expressions: string[]; motions: Record<string, number> } {
    return {
      loaded: this.modelLoaded,
      expressions: this.modelInfo.expressions,
      motions: this.modelInfo.motions,
    };
  }

  private warnIfNotLoaded(action: string): void {
    if (!this.modelLoaded) {
      logger.warn('live2d', `Model not loaded, but sending '${action}' anyway (frontend will cache)`);
    }
  }

  private emitEvent(eventType: string, data: unknown): void {
    const event = {
      capabilityId: this.meta.id,
      eventType,
      data,
      timestamp: new Date(),
    };
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}
