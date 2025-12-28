import fs from "node:fs";
import path from "node:path";
import { OpenPosition, TradeRecord } from "../core/types.js";

interface StorageShape {
  positions: OpenPosition[];
  trades: TradeRecord[];
  balanceSol: number;
  dailyStartBalance: number;
  dailyStartTimestamp: number;
  lastUpdated: number;
}

export class JsonFileStorage {
  private readonly storagePath: string;

  constructor(storageDir: string) {
    this.storagePath = path.join(storageDir, "state.json");
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.storagePath)) {
      const initial: StorageShape = {
        positions: [],
        trades: [],
        balanceSol: 0,
        dailyStartBalance: 0,
        dailyStartTimestamp: Date.now(),
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(initial, null, 2));
    }
  }

  read(): StorageShape {
    const raw = fs.readFileSync(this.storagePath, "utf-8");
    const parsed = JSON.parse(raw) as StorageShape;
    const positions = (parsed.positions ?? []).map((position) => ({
      quoteMint: "So11111111111111111111111111111111111111112",
      ...position
    }));
    return {
      positions,
      trades: parsed.trades ?? [],
      balanceSol: parsed.balanceSol ?? 0,
      dailyStartBalance: parsed.dailyStartBalance ?? 0,
      dailyStartTimestamp: parsed.dailyStartTimestamp ?? Date.now(),
      lastUpdated: parsed.lastUpdated ?? Date.now()
    };
  }

  write(state: StorageShape): void {
    const next = { ...state, lastUpdated: Date.now() };
    fs.writeFileSync(this.storagePath, JSON.stringify(next, null, 2));
  }
}
