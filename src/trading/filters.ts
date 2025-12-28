import { BotConfig } from "../config/config.js";
import { PriceSnapshot } from "../core/types.js";

const MAX_SUPPLY_DEFAULT = 1_000_000_000;
const MAX_TOP_HOLDER_PCT_DEFAULT = 20;
const ALLOW_TOKEN_2022 = false;

export class CandidateFilters {
  private readonly config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  passes(snapshot: PriceSnapshot): { ok: boolean; reason?: string } {
    if (snapshot.liquiditySol < this.config.filters.minLiquiditySol) {
      return { ok: false, reason: "Liquidity below minimum" };
    }
    if (snapshot.marketCap > this.config.filters.maxMarketCapAtLaunch) {
      return { ok: false, reason: "Market cap too high" };
    }
    if (snapshot.supply > MAX_SUPPLY_DEFAULT) {
      return { ok: false, reason: "Supply too high" };
    }
    if (!ALLOW_TOKEN_2022 && snapshot.isToken2022) {
      return { ok: false, reason: "Token-2022 not allowed" };
    }
    const holderLimit =
      this.config.filters.smartWalletScoreMin > 0
        ? Math.max(0, 100 - this.config.filters.smartWalletScoreMin)
        : MAX_TOP_HOLDER_PCT_DEFAULT;
    if (snapshot.topHolderPct > holderLimit) {
      return { ok: false, reason: "Top holder concentration too high" };
    }
    return { ok: true };
  }
}
