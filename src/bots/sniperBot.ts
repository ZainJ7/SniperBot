import path from "node:path";
import { BotConfig } from "../config/config.js";
import { HeliusRpcClient } from "../rpc/heliusClient.js";
import { JsonFileStorage } from "../storage/jsonFileStorage.js";
import { BalanceManager } from "../trading/balanceManager.js";
import { CandidateFilters } from "../trading/filters.js";
import { PriceOracle } from "../trading/priceOracle.js";
import { ExitEngine } from "../trading/exitEngine.js";
import { PaperExecutor, SolanaExecutor, TradeExecutor } from "../trading/executors.js";
import { TradingEngine } from "../trading/tradingEngine.js";
import { PriceWatcher } from "../trading/priceWatcher.js";
import { RaydiumListener } from "../listeners/raydiumListener.js";
import { TelegramNotifier } from "../core/telegramNotifier.js";

export class SniperBot {
  private readonly config: BotConfig;
  private readonly client: HeliusRpcClient;
  private readonly listener: RaydiumListener;
  private readonly tradingEngine: TradingEngine;
  private readonly priceWatcher: PriceWatcher;
  private readonly balanceManager: BalanceManager;
  private readonly executor: TradeExecutor;

  constructor(config: BotConfig) {
    this.config = config;

    this.client = new HeliusRpcClient(config.rpc.rpcUrl, config.rpc.wsUrl);
    const storage = new JsonFileStorage(path.resolve("data"));
    this.balanceManager = new BalanceManager(storage);
    const priceOracle = new PriceOracle(this.client);
    const filters = new CandidateFilters(config);
    const exitEngine = new ExitEngine(config);
    const notifier = new TelegramNotifier(config.telegram.botToken, config.telegram.chatId);

    this.executor =
      config.mode === "paper"
        ? new PaperExecutor()
        : new SolanaExecutor(this.client, config.rpc.rpcUrl, config.wallet.secretKey ?? "");

    this.listener = new RaydiumListener(this.client);
    this.tradingEngine = new TradingEngine(
      config,
      storage,
      this.balanceManager,
      filters,
      priceOracle,
      this.executor,
      notifier
    );
    this.priceWatcher = new PriceWatcher(
      config,
      storage,
      exitEngine,
      priceOracle,
      this.executor,
      this.balanceManager,
      notifier
    );
  }

  async start(): Promise<void> {
    await this.initialiseBalance();
    this.listener.on("pool", (candidate) => void this.tradingEngine.handlePool(candidate));
    this.listener.on("error", (error) => console.error("Listener error", error));
    this.listener.start();
    this.priceWatcher.start();
  }

  private async initialiseBalance(): Promise<void> {
    const current = this.balanceManager.getBalanceSol();
    if (current > 0) {
      return;
    }

    if (this.config.mode === "paper") {
      const fallback = this.config.trade.buySizeSol * this.config.trade.maxOpenPositions;
      this.balanceManager.setBalanceSol(fallback);
      return;
    }

    if (!this.config.wallet.secretKey) {
      throw new Error("Live mode requires a wallet secret key");
    }

    const executor = this.executor as SolanaExecutor;
    const pubkey = executor.getPublicKey();
    const balanceLamports = await this.client.request<{ value: number }>("getBalance", [pubkey.toBase58()]);
    this.balanceManager.setBalanceSol(balanceLamports.value / 1_000_000_000);
  }
}
