// @clawbody/gateway
// 网关服务：gRPC 服务端、HTTP/WS/SSE 服务端、路由、mDNS 发现

export { GatewayServer, type GatewayServerConfig } from './server.js';
export { HttpServer, type HttpServerConfig } from './http-server.js';
export { CapabilityRouter, type RouteResult } from './router.js';
export {
  ServiceDiscovery,
  BodyDiscovery,
  type DiscoveryConfig,
  type DiscoveredBody,
} from './discovery.js';
