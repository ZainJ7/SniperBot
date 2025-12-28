import WebSocket from "ws";

export class HeliusRpcClient {
  private readonly rpcUrl: string;
  private readonly wsUrl: string;

  constructor(rpcUrl: string, wsUrl: string) {
    this.rpcUrl = rpcUrl;
    this.wsUrl = wsUrl;
  }

  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    };
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Helius RPC error ${response.status}`);
    }
    const body = await response.json();
    if (body.error) {
      throw new Error(body.error.message || "Helius RPC returned error");
    }
    return body.result as T;
  }

  connectWebSocket(): WebSocket {
    return new WebSocket(this.wsUrl);
  }
}
