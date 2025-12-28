import { BotConfig } from "../config/config.js";
import { JsonFileStorage } from "../storage/jsonFileStorage.js";
import { BalanceManager } from "./balanceManager.js";
import { ExitEngine } from "./exitEngine.js";
import { PriceOracle } from "./priceOracle.js";
import { TradeExecutor } from "./executors.js";
import { TelegramNotifier } from "../core/telegramNotifier.js";
import { TradeRecord } from "../core/types.js";

export class PriceWatcher {
  private readonly config: BotConfig;
  private readonly storage: JsonFileStorage;
  private readonly exitEngine: ExitEngine;
  private readonly priceOracle: PriceOracle;
  private readonly executor: TradeExecutor;
  private readonly balanceManager: BalanceManager;
  private readonly notifier: TelegramNotifier;
  private interval?: NodeJS.Timeout;

  constructor(
    config: BotConfig,
    storage: JsonFileStorage,
    exitEngine: ExitEngine,
    priceOracle: PriceOracle,
    executor: TradeExecutor,
    balanceManager: BalanceManager,
    notifier: TelegramNotifier
  ) {
    this.config = config;
    this.storage = storage;
    this.exitEngine = exitEngine;
    this.priceOracle = priceOracle;
    this.executor = executor;
    this.balanceManager = balanceManager;
    this.notifier = notifier;
  }

  start(intervalMs = 15_000): void {
    this.interval = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async tick(): Promise<void> {
    const state = this.storage.read();
    for (const position of state.positions) {
      const price = await this.priceOracle.getPrice(position.mint);
      if (price.priceSol > position.highestPriceSol) {
        position.highestPriceSol = price.priceSol;
      }
      const decision = this.exitEngine.evaluate(position, price);
      if (!decision.shouldExit) {
        continue;
      }

      const sellAmount = position.amountTokens * decision.sellPortion;
      const execution = await this.executor.executeSell(position.mint, position.quoteMint, sellAmount);

      position.amountTokens -= sellAmount;
      if (decision.sellPortion === 1 || position.amountTokens <= 0) {
        position.closedAt = Date.now();
      }
      if (decision.reason === "Take profit 1") {
        position.tp1Taken = true;
      }

      const trade: TradeRecord = {
        id: position.id,
        mint: position.mint,
        side: "sell",
        priceSol: price.priceSol,
        amountTokens: execution.amountTokens,
        timestamp: Date.now(),
        reason: decision.reason
      };
      state.trades.push(trade);

      if (position.closedAt) {
        this.balanceManager.releaseSol(this.config.trade.buySizeSol);
        await this.notifier.send(
          `Closed trade for ${position.mint} at ${price.priceSol.toFixed(6)} SOL, reason: ${decision.reason}`
        );
      } else {
        await this.notifier.send(
          `Partial exit for ${position.mint} at ${price.priceSol.toFixed(6)} SOL, reason: ${decision.reason}`
        );
      }
    }

    state.positions = state.positions.filter((position) => !position.closedAt);
    this.storage.write(state);
  }
}
