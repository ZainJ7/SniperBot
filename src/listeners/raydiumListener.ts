import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { HeliusRpcClient } from "../rpc/heliusClient.js";
import { PoolCandidate } from "../core/types.js";

const RAYDIUM_PROGRAM_ID = "RVKd61ztZW9S3P5s8s6Eky8AfW1f5t3KqR9DkDgnsGb";

interface SubscriptionMessage {
  method?: string;
  params?: {
    result?: {
      value?: {
        signature?: string;
      };
    };
  };
}

export class RaydiumListener extends EventEmitter {
  private readonly client: HeliusRpcClient;
  private socket?: WebSocket;

  constructor(client: HeliusRpcClient) {
    super();
    this.client = client;
  }

  start(): void {
    this.socket = this.client.connectWebSocket();
    this.socket.on("open", () => {
      const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "logsSubscribe",
        params: [{ mentions: [RAYDIUM_PROGRAM_ID] }, { commitment: "confirmed" }]
      };
      this.socket?.send(JSON.stringify(payload));
    });

    this.socket.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as SubscriptionMessage;
        if (message.method !== "logsNotification") {
          return;
        }
        const signature = message.params?.result?.value?.signature;
        if (!signature) {
          return;
        }
        const transaction = await this.client.request<{
          transaction?: { message?: { accountKeys: string[] } };
        }>("getTransaction", [signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);

        const keys = transaction.transaction?.message?.accountKeys ?? [];
        const baseMint = keys[5];
        const quoteMint = keys[6];
        if (!baseMint || !quoteMint) {
          return;
        }
        const candidate: PoolCandidate = {
          poolId: signature,
          baseMint,
          quoteMint,
          createdAt: Date.now()
        };
        this.emit("pool", candidate);
      } catch (error) {
        this.emit("error", error);
      }
    });

    this.socket.on("error", (error) => this.emit("error", error));
    this.socket.on("close", () => this.emit("close"));
  }

  stop(): void {
    this.socket?.close();
  }
}
