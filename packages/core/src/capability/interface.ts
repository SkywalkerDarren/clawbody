/**
 * 能力元数据
 */
export interface CapabilityMeta {
  /** 唯一标识符 */
  id: string;
  /** 人类可读名称 */
  name: string;
  /** 版本号 (semver) */
  version: string;
  /** 能力类型 */
  type: CapabilityType;
  /** 描述 */
  description?: string;
  /** 依赖的其他能力 */
  dependencies?: string[];
}

export type CapabilityType = 'output' | 'input' | 'action' | 'composite';

/**
 * 能力状态
 */
export type CapabilityStatus =
  | 'initializing'
  | 'ready'
  | 'busy'
  | 'degraded'
  | 'unavailable'
  | 'error';

/**
 * 能力健康信息
 */
export interface CapabilityHealth {
  status: CapabilityStatus;
  message?: string;
  lastCheck: Date;
  details?: Record<string, unknown>;
}

/**
 * 操作描述符
 */
export interface OperationDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  streaming?: boolean;
}

/**
 * JSON Schema 简化类型
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  requestId: string;
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, string>;
}

/**
 * 事件处理器
 */
export type EventHandler = (event: CapabilityEvent) => void;

/**
 * 能力事件
 */
export interface CapabilityEvent {
  capabilityId: string;
  eventType: string;
  data: unknown;
  timestamp: Date;
}

/**
 * 取消订阅函数
 */
export type Unsubscribe = () => void;

/**
 * 能力接口 - 所有能力必须实现
 */
export interface ICapability<TConfig = unknown> {
  /** 元数据 */
  readonly meta: CapabilityMeta;

  /** 当前状态 */
  readonly status: CapabilityStatus;

  /** 初始化 */
  initialize(config: TConfig): Promise<void>;

  /** 健康检查 */
  healthCheck(): Promise<CapabilityHealth>;

  /** 获取支持的操作列表 */
  getOperations(): OperationDescriptor[];

  /** 执行操作 */
  execute<TInput, TOutput>(
    operation: string,
    input: TInput,
    context?: ExecutionContext
  ): Promise<TOutput>;

  /** 流式执行操作 (可选) */
  executeStream?<TInput>(
    operation: string,
    input: TInput,
    context?: ExecutionContext
  ): AsyncIterable<Buffer>;

  /** 订阅事件 (输入型能力) */
  subscribe?(handler: EventHandler): Unsubscribe;

  /** 优雅关闭 */
  shutdown(): Promise<void>;
}
