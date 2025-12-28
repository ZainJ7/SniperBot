import { BotConfig } from "../config/config.js";
import { ExitDecision, OpenPosition, PriceSnapshot } from "../core/types.js";

export class ExitEngine {
  private readonly config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  evaluate(position: OpenPosition, price: PriceSnapshot): ExitDecision {
    const pnlPct = ((price.priceSol - position.entryPriceSol) / position.entryPriceSol) * 100;

    if (pnlPct <= -this.config.risk.stopLossPct) {
      return { shouldExit: true, reason: "Stop loss", sellPortion: 1 };
    }

    if (!position.tp1Taken && pnlPct >= this.config.risk.tp1Pct) {
      return { shouldExit: true, reason: "Take profit 1", sellPortion: this.config.risk.tp1PartialPct / 100 };
    }

    if (pnlPct >= this.config.risk.trailActivatePct) {
      const drawdownPct = ((position.highestPriceSol - price.priceSol) / position.highestPriceSol) * 100;
      if (drawdownPct >= this.config.risk.trailDrawDownPct) {
        return { shouldExit: true, reason: "Trailing stop", sellPortion: 1 };
      }
    }

    const heldMinutes = (Date.now() - position.openedAt) / 60000;
    if (heldMinutes >= this.config.risk.timeStopMinutes) {
      return { shouldExit: true, reason: "Time stop", sellPortion: 1 };
    }

    return { shouldExit: false, reason: "Hold", sellPortion: 0 };
  }
}
