# Helius Raydium Meme Coin Sniper Bot

A Solana meme coin trading bot written in TypeScript and Node.js. It uses only Helius services for WebSocket detection and RPC calls, it does not use Jupiter or any other swap or quote API. The bot supports paper mode and live mode, with local JSON storage so open positions persist across restarts.

## Features

- Helius WebSocket subscription for new Raydium pool detection
- Helius RPC for all other reads and writes
- Paper mode with full simulation, no on-chain transactions
- Live mode with on-chain execution through Helius RPC
- Liquidity, market cap, supply, and holder concentration filters
- TP1, trailing stop, stop loss, and time based exit
- Local JSON storage for positions and trade history
- Telegram notifications on trade open and close
- Cooldown to avoid duplicate buys
- Price caching to prevent RPC spam

## Project layout

```
config/             Config files
src/
  bots/             Bot orchestration
  config/           Config models and loader
  core/             Core types and utilities
  listeners/        WebSocket listeners
  rpc/              Helius RPC wrapper
  storage/          Local JSON storage
  trading/          Trading, exits, and execution
```

## Install dependencies

```bash
npm install
```

## Create your config

1. Copy the example config.

```bash
cp config/example.config.json config/config.json
```

2. Edit `config/config.json` with your Helius URLs, Telegram details, and your wallet secret key.

Example secret key format, base58 encoded:

```
2a6QhJm1HP7QJt1r3xR5P3y6J2XfU8x9n9smc2QvRkZpJvRkYdUu7P6GZEXAMPLEKEY
```

Use `bs58` to decode when loading the wallet key. The bot already uses `bs58.decode` internally, and expects the secret key to be in base58.

### Important security notes

- Do not commit your `config/config.json` to version control.
- Store your secret key securely, use an environment secret store if possible.
- Avoid sharing the key in chat or logs.

## Run in paper mode

Edit `config/config.json` and set:

```json
"mode": "paper"
```

Then start the bot:

```bash
npm run dev
```

Paper mode simulates swaps, it does not send transactions to the chain.

## Run in live mode

Edit `config/config.json` and set:

```json
"mode": "live"
```

Then build and run:

```bash
npm run build
npm start
```

Live mode builds Raydium swaps locally using on-chain data and sends transactions through Helius RPC. It supports SOL to token and token to SOL swaps, it does not route through any third party services.

## How the bot decides when to buy and sell

- **Detection**: `RaydiumListener` listens for Raydium programme logs via Helius WebSocket, then fetches transactions to identify base and quote mints.
- **Filters**: `CandidateFilters` enforces minimum liquidity and maximum market cap. It also applies supply limits, holder concentration checks, and rejects Token-2022 mints by default.
- **Entry**: `TradingEngine` opens positions only if the balance manager allows it, and if the open position cap has not been reached.
- **Exits**: `ExitEngine` applies TP1, trailing drawdown, stop loss, and a time based exit. `PriceWatcher` polls prices at a safe interval.

## Adjust behaviour in the config

- Increase `trade.buySizeSol` for larger entries, reduce it for smaller entries.
- Increase `filters.minLiquiditySol` to target deeper pools.
- Reduce `filters.maxMarketCapAtLaunch` to target smaller launches.
- Tighten `risk.stopLossPct` for conservative stops, loosen it for more risk.
- Increase `risk.trailActivatePct` to let trades run longer before trailing stops engage.
- Adjust `filters.smartWalletScoreMin` to tighten the holder concentration limit, higher values permit fewer large holders.

For supply, Token-2022 acceptance, and holder limits, update `src/trading/filters.ts` to match your policy.

## Safety, risks, and how to limit losses

- Meme coin launches are high risk and can go to zero quickly.
- Use paper mode to validate behaviour before live trading.
- Keep `maxOpenPositions` low until you have confidence in the strategy.
- Use conservative stop losses and time stops to limit exposure.
- Set `maxDailyLossPct` to cap daily loss, and monitor manually.

## Telegram bot setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Start a conversation with your bot and send a message.
3. Find your chat ID using a bot such as [@userinfobot](https://t.me/userinfobot).
4. Add `botToken` and `chatId` to `config/config.json`.

## Troubleshooting

- **No pools detected**: check your WebSocket URL, and ensure your API key is valid.
- **RPC errors**: reduce the polling frequency, and ensure you are not rate limited.
- **Price is zero**: the token may not have price data yet, or the mint is not indexed.
- **Telegram messages fail**: confirm the bot token, and ensure the bot can message your chat.
- **Swaps fail**: confirm the pool is a SOL pair, and ensure your wallet has enough SOL for fees and the buy size.

## Notes about API credit usage

- Price and liquidity requests are cached for 20 seconds by default.
- `PriceWatcher` checks prices every 15 seconds, adjust this if you need to conserve credits.
- Avoid running multiple instances against the same API key.

## What this bot does, in plain English

It watches for new Raydium pools on Solana, applies your filters, then opens and manages trades using Helius. It takes partial profit, trails winners, and exits losers based on your risk rules.

## How to make it more aggressive or conservative

- **More aggressive**: increase `trade.buySizeSol`, lower `filters.minLiquiditySol`, and widen `risk.stopLossPct`.
- **More conservative**: reduce `trade.buySizeSol`, raise `filters.minLiquiditySol`, and tighten `risk.stopLossPct`.

## How to monitor behaviour safely

Run in paper mode first, review the JSON state in `data/state.json`, and confirm Telegram notifications match expectations before using real funds.
