import { HeliusRpcClient } from "../rpc/heliusClient.js";
import { PriceSnapshot } from "../core/types.js";

interface CacheEntry {
  snapshot: PriceSnapshot;
  expiresAt: number;
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export class PriceOracle {
  private readonly client: HeliusRpcClient;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(client: HeliusRpcClient, ttlMs = 20_000) {
    this.client = client;
    this.ttlMs = ttlMs;
  }

  async getPrice(mint: string): Promise<PriceSnapshot> {
    const cached = this.cache.get(mint);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }

    const asset = await this.client.request<{ priceInfo?: { pricePerToken: number } }>(
      "getAsset",
      [mint]
    );

    const supply = await this.client.request<{ value: { uiAmount: number; decimals: number } }>(
      "getTokenSupply",
      [mint]
    );

    const largestAccounts = await this.client.request<{ value: { amount: string }[] }>(
      "getTokenLargestAccounts",
      [mint]
    );

    const accountInfo = await this.client.request<{ value?: { owner?: string } }>(
      "getAccountInfo",
      [mint, { encoding: "jsonParsed" }]
    );

    const supplyAmount = supply.value.uiAmount ?? 0;
    const decimals = supply.value.decimals ?? 0;
    const topHolderAmount = largestAccounts.value?.[0]?.amount ? Number(largestAccounts.value[0].amount) : 0;
    const topHolderSupply = supplyAmount * 10 ** decimals;
    const topHolderPct = topHolderSupply > 0 ? (topHolderAmount / topHolderSupply) * 100 : 0;

    const priceSol = asset.priceInfo?.pricePerToken ?? 0;
    const liquiditySol = priceSol * supplyAmount;
    const marketCap = liquiditySol;
    const isToken2022 = accountInfo.value?.owner !== TOKEN_PROGRAM;

    const snapshot: PriceSnapshot = {
      mint,
      priceSol,
      liquiditySol,
      marketCap,
      supply: supplyAmount,
      topHolderPct,
      isToken2022,
      updatedAt: Date.now()
    };

    this.cache.set(mint, { snapshot, expiresAt: Date.now() + this.ttlMs });
    return snapshot;
  }
}
