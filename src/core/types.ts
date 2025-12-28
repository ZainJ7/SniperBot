export interface PoolCandidate {
  poolId: string;
  baseMint: string;
  quoteMint: string;
  createdAt: number;
}

export interface PriceSnapshot {
  mint: string;
  priceSol: number;
  liquiditySol: number;
  marketCap: number;
  supply: number;
  topHolderPct: number;
  isToken2022: boolean;
  updatedAt: number;
}

export interface OpenPosition {
  id: string;
  mint: string;
  quoteMint: string;
  entryPriceSol: number;
  amountTokens: number;
  openedAt: number;
  tp1Taken: boolean;
  highestPriceSol: number;
  closedAt?: number;
}

export interface TradeRecord {
  id: string;
  mint: string;
  side: "buy" | "sell";
  priceSol: number;
  amountTokens: number;
  timestamp: number;
  reason?: string;
}

export interface ExitDecision {
  shouldExit: boolean;
  reason: string;
  sellPortion: number;
}
