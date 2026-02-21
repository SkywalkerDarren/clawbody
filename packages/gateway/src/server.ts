import * as grpc from '@grpc/grpc-js';
import type { CapabilityRegistry, ICapability, ExecutionContext } from '@clawbody/core';
import { logger } from '@clawbody/core';
import {
  ExecuteRequest,
  ExecuteResponse,
  ExecuteChunk,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  HealthCheckRequest,
  HealthCheckResponse,
  BrainMessage,
  BodyMessage,
  ErrorCode,
  ErrorMessage,
  CapabilityInfo,
  CapabilityHealth as ProtoCapabilityHealth,
  CapabilityStatus,
  CapabilityType,
} from '@clawbody/proto-gen';

export interface GatewayServerConfig {
  port: number;
  host?: string;
}

type ExecuteHandler = grpc.handleUnaryCall<ExecuteRequest, ExecuteResponse>;
type ExecuteStreamHandler = grpc.handleServerStreamingCall<ExecuteRequest, ExecuteChunk>;
type GetCapabilitiesHandler = grpc.handleUnaryCall<GetCapabilitiesRequest, GetCapabilitiesResponse>;
type HealthCheckHandler = grpc.handleUnaryCall<HealthCheckRequest, HealthCheckResponse>;
type ConnectHandler = grpc.handleBidiStreamingCall<BrainMessage, BodyMessage>;

/**
 * gRPC Gateway Server
 */
export class GatewayServer {
  private server: grpc.Server;
  private registry: CapabilityRegistry;
  private startTime: Date;
  private connections = new Set<grpc.ServerDuplexStream<BrainMessage, BodyMessage>>();

  constructor(registry: CapabilityRegistry) {
    this.registry = registry;
    this.server = new grpc.Server();
    this.startTime = new Date();
    this.setupServices();
  }

  private setupServices(): void {
    const serviceDefinition = {
      Execute: this.handleExecute.bind(this) as ExecuteHandler,
      ExecuteStream: this.handleExecuteStream.bind(this) as ExecuteStreamHandler,
      GetCapabilities: this.handleGetCapabilities.bind(this) as GetCapabilitiesHandler,
      HealthCheck: this.handleHealthCheck.bind(this) as HealthCheckHandler,
      Connect: this.handleConnect.bind(this) as ConnectHandler,
    };

    // Register service with gRPC
    this.server.addService(
      {
        Execute: {
          path: '/clawbody.nervous.NervousSystem/Execute',
          requestStream: false,
          responseStream: false,
          requestSerialize: (value: ExecuteRequest) => Buffer.from(ExecuteRequest.encode(value).finish()),
          requestDeserialize: (value: Buffer) => ExecuteRequest.decode(value),
          responseSerialize: (value: ExecuteResponse) => Buffer.from(ExecuteResponse.encode(value).finish()),
          responseDeserialize: (value: Buffer) => ExecuteResponse.decode(value),
        },
        ExecuteStream: {
          path: '/clawbody.nervous.NervousSystem/ExecuteStream',
          requestStream: false,
          responseStream: true,
          requestSerialize: (value: ExecuteRequest) => Buffer.from(ExecuteRequest.encode(value).finish()),
          requestDeserialize: (value: Buffer) => ExecuteRequest.decode(value),
          responseSerialize: (value: ExecuteChunk) => Buffer.from(ExecuteChunk.encode(value).finish()),
          responseDeserialize: (value: Buffer) => ExecuteChunk.decode(value),
        },
        GetCapabilities: {
          path: '/clawbody.nervous.NervousSystem/GetCapabilities',
          requestStream: false,
          responseStream: false,
          requestSerialize: (value: GetCapabilitiesRequest) => Buffer.from(GetCapabilitiesRequest.encode(value).finish()),
          requestDeserialize: (value: Buffer) => GetCapabilitiesRequest.decode(value),
          responseSerialize: (value: GetCapabilitiesResponse) => Buffer.from(GetCapabilitiesResponse.encode(value).finish()),
          responseDeserialize: (value: Buffer) => GetCapabilitiesResponse.decode(value),
        },
        HealthCheck: {
          path: '/clawbody.nervous.NervousSystem/HealthCheck',
          requestStream: false,
          responseStream: false,
          requestSerialize: (value: HealthCheckRequest) => Buffer.from(HealthCheckRequest.encode(value).finish()),
          requestDeserialize: (value: Buffer) => HealthCheckRequest.decode(value),
          responseSerialize: (value: HealthCheckResponse) => Buffer.from(HealthCheckResponse.encode(value).finish()),
          responseDeserialize: (value: Buffer) => HealthCheckResponse.decode(value),
        },
        Connect: {
          path: '/clawbody.nervous.NervousSystem/Connect',
          requestStream: true,
          responseStream: true,
          requestSerialize: (value: BrainMessage) => Buffer.from(BrainMessage.encode(value).finish()),
          requestDeserialize: (value: Buffer) => BrainMessage.decode(value),
          responseSerialize: (value: BodyMessage) => Buffer.from(BodyMessage.encode(value).finish()),
          responseDeserialize: (value: Buffer) => BodyMessage.decode(value),
        },
      },
      serviceDefinition
    );
  }

  private handleExecute(
    call: grpc.ServerUnaryCall<ExecuteRequest, ExecuteResponse>,
    callback: grpc.sendUnaryData<ExecuteResponse>
  ): void {
    const { requestId, capabilityId, operation, input } = call.request;
    const startTime = Date.now();

    logger.debug('gateway', `Execute: ${capabilityId}.${operation}`, { requestId });

    const capability = this.registry.get(capabilityId);
    if (!capability) {
      callback(null, {
        requestId,
        success: false,
        output: new Uint8Array(),
        error: this.createError(ErrorCode.ERROR_CAPABILITY_NOT_FOUND, `Capability not found: ${capabilityId}`),
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const context: ExecutionContext = { requestId };
    const inputData = input.length > 0 ? JSON.parse(Buffer.from(input).toString('utf-8')) : {};

    capability
      .execute(operation, inputData, context)
      .then((output) => {
        callback(null, {
          requestId,
          success: true,
          output: Buffer.from(JSON.stringify(output)),
          error: undefined,
          durationMs: Date.now() - startTime,
        });
      })
      .catch((err: Error) => {
        logger.error('gateway', `Execute failed: ${capabilityId}.${operation}`, err);
        callback(null, {
          requestId,
          success: false,
          output: new Uint8Array(),
          error: this.createError(ErrorCode.ERROR_INTERNAL, err.message),
          durationMs: Date.now() - startTime,
        });
      });
  }

  private handleExecuteStream(
    call: grpc.ServerWritableStream<ExecuteRequest, ExecuteChunk>
  ): void {
    const { requestId, capabilityId, operation, input } = call.request;

    logger.debug('gateway', `ExecuteStream: ${capabilityId}.${operation}`, { requestId });

    const capability = this.registry.get(capabilityId);
    if (!capability) {
      call.write({
        requestId,
        sequence: 0,
        data: new Uint8Array(),
        isFinal: true,
        error: this.createError(ErrorCode.ERROR_CAPABILITY_NOT_FOUND, `Capability not found: ${capabilityId}`),
      });
      call.end();
      return;
    }

    const context: ExecutionContext = { requestId };
    const inputData = input.length > 0 ? JSON.parse(Buffer.from(input).toString('utf-8')) : {};

    // Check if capability supports streaming
    if (capability.executeStream) {
      this.handleStreamingExecution(capability, operation, inputData, context, requestId, call);
    } else {
      // Fallback to non-streaming
      capability
        .execute(operation, inputData, context)
        .then((output) => {
          call.write({
            requestId,
            sequence: 0,
            data: Buffer.from(JSON.stringify(output)),
            isFinal: true,
            error: undefined,
          });
          call.end();
        })
        .catch((err: Error) => {
          call.write({
            requestId,
            sequence: 0,
            data: new Uint8Array(),
            isFinal: true,
            error: this.createError(ErrorCode.ERROR_INTERNAL, err.message),
          });
          call.end();
        });
    }
  }

  private async handleStreamingExecution(
    capability: ICapability,
    operation: string,
    inputData: unknown,
    context: ExecutionContext,
    requestId: string,
    call: grpc.ServerWritableStream<ExecuteRequest, ExecuteChunk>
  ): Promise<void> {
    try {
      const stream = capability.executeStream!(operation, inputData, context);
      let sequence = 0;

      for await (const chunk of stream) {
        call.write({
          requestId,
          sequence: sequence++,
          data: chunk,
          isFinal: false,
          error: undefined,
        });
      }

      call.write({
        requestId,
        sequence,
        data: new Uint8Array(),
        isFinal: true,
        error: undefined,
      });
    } catch (err) {
      call.write({
        requestId,
        sequence: 0,
        data: new Uint8Array(),
        isFinal: true,
        error: this.createError(ErrorCode.ERROR_INTERNAL, err instanceof Error ? err.message : 'Stream error'),
      });
    } finally {
      call.end();
    }
  }

  private handleGetCapabilities(
    call: grpc.ServerUnaryCall<GetCapabilitiesRequest, GetCapabilitiesResponse>,
    callback: grpc.sendUnaryData<GetCapabilitiesResponse>
  ): void {
    const { capabilityIds } = call.request;

    const capabilities = capabilityIds.length > 0
      ? capabilityIds.map((id) => this.registry.get(id)).filter((c): c is ICapability => c !== undefined)
      : this.registry.getAll();

    const capabilityInfos: CapabilityInfo[] = capabilities.map((cap) => ({
      meta: {
        id: cap.meta.id,
        name: cap.meta.name,
        version: cap.meta.version,
        type: this.mapCapabilityType(cap.meta.type),
        description: cap.meta.description ?? '',
        dependencies: cap.meta.dependencies ?? [],
      },
      status: this.mapCapabilityStatus(cap.status),
      operations: cap.getOperations().map((op) => ({
        name: op.name,
        description: op.description,
        inputSchema: JSON.stringify(op.inputSchema),
        outputSchema: JSON.stringify(op.outputSchema),
        streaming: op.streaming ?? false,
      })),
    }));

    callback(null, { capabilities: capabilityInfos });
  }

  private handleHealthCheck(
    call: grpc.ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
    callback: grpc.sendUnaryData<HealthCheckResponse>
  ): void {
    const { capabilityIds } = call.request;

    this.registry.healthCheckAll().then((healthResults) => {
      const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

      const capabilities: ProtoCapabilityHealth[] = [];
      const idsToCheck = capabilityIds.length > 0 ? capabilityIds : this.registry.getAllIds();

      for (const id of idsToCheck) {
        const health = healthResults.get(id);
        if (health) {
          capabilities.push({
            status: this.mapCapabilityStatus(health.status),
            message: health.message ?? '',
            lastCheck: health.lastCheck,
            details: health.details ? Object.fromEntries(
              Object.entries(health.details).map(([k, v]) => [k, String(v)])
            ) : {},
          });
        }
      }

      const allReady = capabilities.every((c) => c.status === CapabilityStatus.CAPABILITY_STATUS_READY);
      const overallStatus = allReady ? 'healthy' : 'degraded';

      callback(null, {
        overallStatus,
        uptimeSeconds,
        capabilities,
      });
    });
  }

  private handleConnect(
    call: grpc.ServerDuplexStream<BrainMessage, BodyMessage>
  ): void {
    logger.info('gateway', 'Brain connected');
    this.connections.add(call);

    call.on('data', async (message: BrainMessage) => {
      try {
        const response = await this.processMessage(message);
        call.write(response);
      } catch (err) {
        call.write({
          requestId: message.requestId,
          timestamp: new Date(),
          error: this.createError(ErrorCode.ERROR_INTERNAL, err instanceof Error ? err.message : 'Unknown error'),
        });
      }
    });

    call.on('end', () => {
      logger.info('gateway', 'Brain disconnected');
      this.connections.delete(call);
      call.end();
    });

    call.on('error', (err) => {
      logger.error('gateway', 'Connection error', err);
      this.connections.delete(call);
    });
  }

  private async processMessage(message: BrainMessage): Promise<BodyMessage> {
    // Check which payload type is present
    if (message.command) {
      const { capabilityId, operation, input } = message.command;
      const capability = this.registry.get(capabilityId);

      if (!capability) {
        return this.createErrorResponse(message.requestId, ErrorCode.ERROR_CAPABILITY_NOT_FOUND, `Capability not found: ${capabilityId}`);
      }

      const startTime = Date.now();
      const context: ExecutionContext = { requestId: message.requestId };
      const inputData = input.length > 0 ? JSON.parse(Buffer.from(input).toString('utf-8')) : {};

      try {
        const output = await capability.execute(operation, inputData, context);
        return {
          requestId: message.requestId,
          timestamp: new Date(),
          response: {
            success: true,
            output: Buffer.from(JSON.stringify(output)),
            durationMs: Date.now() - startTime,
          },
        };
      } catch (err) {
        return this.createErrorResponse(message.requestId, ErrorCode.ERROR_INTERNAL, err instanceof Error ? err.message : 'Execution failed');
      }
    }

    if (message.heartbeat) {
      return {
        requestId: message.requestId,
        timestamp: new Date(),
        heartbeatAck: { sequence: message.heartbeat.sequence },
      };
    }

    return this.createErrorResponse(message.requestId, ErrorCode.ERROR_UNKNOWN, 'Unknown message type');
  }

  private createError(code: ErrorCode, message: string): ErrorMessage {
    return { code, message, details: '' };
  }

  private createErrorResponse(requestId: string, code: ErrorCode, message: string): BodyMessage {
    return {
      requestId,
      timestamp: new Date(),
      error: this.createError(code, message),
    };
  }

  private mapCapabilityType(type: string): CapabilityType {
    switch (type) {
      case 'output': return CapabilityType.CAPABILITY_TYPE_OUTPUT;
      case 'input': return CapabilityType.CAPABILITY_TYPE_INPUT;
      case 'action': return CapabilityType.CAPABILITY_TYPE_ACTION;
      case 'composite': return CapabilityType.CAPABILITY_TYPE_COMPOSITE;
      default: return CapabilityType.CAPABILITY_TYPE_UNKNOWN;
    }
  }

  private mapCapabilityStatus(status: string): CapabilityStatus {
    switch (status) {
      case 'initializing': return CapabilityStatus.CAPABILITY_STATUS_INITIALIZING;
      case 'ready': return CapabilityStatus.CAPABILITY_STATUS_READY;
      case 'busy': return CapabilityStatus.CAPABILITY_STATUS_BUSY;
      case 'degraded': return CapabilityStatus.CAPABILITY_STATUS_DEGRADED;
      case 'unavailable': return CapabilityStatus.CAPABILITY_STATUS_UNAVAILABLE;
      case 'error': return CapabilityStatus.CAPABILITY_STATUS_ERROR;
      default: return CapabilityStatus.CAPABILITY_STATUS_UNKNOWN;
    }
  }

  /** Broadcast event to all connected brains */
  broadcast(capabilityId: string, eventType: string, data: unknown): void {
    const message: BodyMessage = {
      requestId: '',
      timestamp: new Date(),
      event: {
        capabilityId,
        eventType,
        data: Buffer.from(JSON.stringify(data)),
        timestamp: new Date(),
      },
    };

    for (const conn of this.connections) {
      conn.write(message);
    }
  }

  /** Start the gRPC server */
  async start(config: GatewayServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const address = `${config.host ?? '0.0.0.0'}:${config.port}`;
      this.server.bindAsync(
        address,
        grpc.ServerCredentials.createInsecure(),
        (err, boundPort) => {
          if (err) {
            reject(err);
            return;
          }
          logger.info('gateway', `gRPC server listening on port ${boundPort}`);
          resolve();
        }
      );
    });
  }

  /** Stop the gRPC server */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        logger.info('gateway', 'gRPC server stopped');
        resolve();
      });
    });
  }

  /** Get number of connected clients */
  get connectionCount(): number {
    return this.connections.size;
  }
}
