import fs from "node:fs";
import path from "node:path";

export type Mode = "paper" | "live";

export interface BotConfig {
  rpc: {
    rpcUrl: string;
    wsUrl: string;
  };
  mode: Mode;
  wallet: {
    secretKey: string | null;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
  trade: {
    buySizeSol: number;
    maxOpenPositions: number;
  };
  filters: {
    minLiquiditySol: number;
    maxMarketCapAtLaunch: number;
    smartWalletScoreMin: number;
  };
  risk: {
    tp1Pct: number;
    tp1PartialPct: number;
    stopLossPct: number;
    timeStopMinutes: number;
    trailActivatePct: number;
    trailDrawDownPct: number;
    maxDailyLossPct: number;
  };
}

const defaultConfigPath = path.resolve("config", "config.json");

export const loadConfig = (configPath = defaultConfigPath): BotConfig => {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found at ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as BotConfig;
};
