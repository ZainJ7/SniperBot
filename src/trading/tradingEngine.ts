import { randomUUID } from "node:crypto";
import { BotConfig } from "../config/config.js";
import { OpenPosition, PoolCandidate, TradeRecord } from "../core/types.js";
import { JsonFileStorage } from "../storage/jsonFileStorage.js";
import { BalanceManager } from "./balanceManager.js";
import { CandidateFilters } from "./filters.js";
import { PriceOracle } from "./priceOracle.js";
import { TradeExecutor } from "./executors.js";
import { TelegramNotifier } from "../core/telegramNotifier.js";

const COOLDOWN_MS = 10 * 60 * 1000;
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export class TradingEngine {
  private readonly config: BotConfig;
  private readonly storage: JsonFileStorage;
  private readonly balanceManager: BalanceManager;
  private readonly filters: CandidateFilters;
  private readonly priceOracle: PriceOracle;
  private readonly executor: TradeExecutor;
  private readonly notifier: TelegramNotifier;
  private readonly cooldowns = new Map<string, number>();

  constructor(
    config: BotConfig,
    storage: JsonFileStorage,
    balanceManager: BalanceManager,
    filters: CandidateFilters,
    priceOracle: PriceOracle,
    executor: TradeExecutor,
    notifier: TelegramNotifier
  ) {
    this.config = config;
    this.storage = storage;
    this.balanceManager = balanceManager;
    this.filters = filters;
    this.priceOracle = priceOracle;
    this.executor = executor;
    this.notifier = notifier;
  }

  async handlePool(candidate: PoolCandidate): Promise<void> {
    if (candidate.quoteMint !== WSOL_MINT) {
      return;
    }

    if (this.balanceManager.isDailyLossExceeded(this.config.risk.maxDailyLossPct)) {
      return;
    }

    const now = Date.now();
    const cooldown = this.cooldowns.get(candidate.baseMint);
    if (cooldown && cooldown > now) {
      return;
    }

    const state = this.storage.read();
    if (state.positions.length >= this.config.trade.maxOpenPositions) {
      return;
    }

    const price = await this.priceOracle.getPrice(candidate.baseMint);
    const filterResult = this.filters.passes(price);
    if (!filterResult.ok) {
      return;
    }

    if (!this.balanceManager.reserveSol(this.config.trade.buySizeSol)) {
      return;
    }

    const execution = await this.executor.executeBuy(
      candidate.baseMint,
      candidate.quoteMint,
      this.config.trade.buySizeSol
    );
    const position: OpenPosition = {
      id: randomUUID(),
      mint: candidate.baseMint,
      quoteMint: candidate.quoteMint,
      entryPriceSol: price.priceSol,
      amountTokens: execution.amountTokens,
      openedAt: Date.now(),
      tp1Taken: false,
      highestPriceSol: price.priceSol
    };

    state.positions.push(position);
    const trade: TradeRecord = {
      id: position.id,
      mint: candidate.baseMint,
      side: "buy",
      priceSol: price.priceSol,
      amountTokens: execution.amountTokens,
      timestamp: Date.now()
    };
    state.trades.push(trade);
    this.storage.write(state);

    this.cooldowns.set(candidate.baseMint, now + COOLDOWN_MS);
    await this.notifier.send(`Opened trade for ${candidate.baseMint} at ${price.priceSol.toFixed(6)} SOL`);
  }
}
