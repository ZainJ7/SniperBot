import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import { Liquidity, Token, TokenAmount, Percent } from "@raydium-io/raydium-sdk";
import { Market } from "@project-serum/serum";
import bs58 from "bs58";
import { HeliusRpcClient } from "../rpc/heliusClient.js";

export interface ExecutionResult {
  signature: string;
  amountTokens: number;
}

export interface TradeExecutor {
  executeBuy(mint: string, quoteMint: string, amountSol: number): Promise<ExecutionResult>;
  executeSell(mint: string, quoteMint: string, amountTokens: number): Promise<ExecutionResult>;
}

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey("RVKd61ztZW9S3P5s8s6Eky8AfW1f5t3KqR9DkDgnsGb");
const DEFAULT_SLIPPAGE = new Percent(1, 100);

const POOL_LAYOUT_OFFSETS = {
  baseMint: 368,
  quoteMint: 400,
  baseDecimals: 32,
  quoteDecimals: 40,
  baseVault: 304,
  quoteVault: 336,
  lpMint: 432,
  openOrders: 464,
  marketId: 496,
  marketProgramId: 528,
  targetOrders: 560,
  withdrawQueue: 592,
  lpVault: 624,
  owner: 656
};

const readPublicKey = (buffer: Buffer, offset: number): PublicKey => {
  return new PublicKey(buffer.subarray(offset, offset + 32));
};

const readU64 = (buffer: Buffer, offset: number): number => {
  return Number(buffer.readBigUInt64LE(offset));
};

export class PaperExecutor implements TradeExecutor {
  async executeBuy(mint: string, quoteMint: string, amountSol: number): Promise<ExecutionResult> {
    void quoteMint;
    return {
      signature: `paper-buy-${mint}-${Date.now()}`,
      amountTokens: amountSol * 1000
    };
  }

  async executeSell(mint: string, quoteMint: string, amountTokens: number): Promise<ExecutionResult> {
    void quoteMint;
    return {
      signature: `paper-sell-${mint}-${Date.now()}`,
      amountTokens
    };
  }
}

export class SolanaExecutor implements TradeExecutor {
  private readonly client: HeliusRpcClient;
  private readonly connection: Connection;
  private readonly keypair: Keypair;

  constructor(client: HeliusRpcClient, rpcUrl: string, secretKey: string) {
    const decoded = bs58.decode(secretKey);
    this.keypair = Keypair.fromSecretKey(decoded);
    this.client = client;
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  getPublicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async executeBuy(mint: string, quoteMint: string, amountSol: number): Promise<ExecutionResult> {
    const outputMint = new PublicKey(mint);
    const outputAccount = await getAssociatedTokenAddress(outputMint, this.keypair.publicKey);
    const before = await this.getTokenBalanceRaw(outputAccount);

    const result = await this.buildAndSendSwap(
      new PublicKey(quoteMint),
      outputMint,
      amountSol,
      true
    );

    const after = await this.getTokenBalanceRaw(outputAccount);
    const received = Math.max(after - before, 0);

    return { signature: result.signature, amountTokens: received };
  }

  async executeSell(mint: string, quoteMint: string, amountTokens: number): Promise<ExecutionResult> {
    const result = await this.buildAndSendSwap(
      new PublicKey(mint),
      new PublicKey(quoteMint),
      amountTokens,
      false
    );
    return { signature: result.signature, amountTokens };
  }

  private async buildAndSendSwap(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    amountIsSol: boolean
  ): Promise<{ signature: string }> {
    if (!inputMint.equals(WSOL_MINT) && !outputMint.equals(WSOL_MINT)) {
      throw new Error("Only SOL to token or token to SOL swaps are supported in this build.");
    }

    const poolKeys = await this.fetchPoolKeys(inputMint, outputMint);
    const inputDecimals = await this.getMintDecimals(inputMint);
    const outputDecimals = await this.getMintDecimals(outputMint);

    const tokenIn = new Token(inputMint, inputDecimals, "INPUT", "INPUT");
    const tokenOut = new Token(outputMint, outputDecimals, "OUTPUT", "OUTPUT");

    const rawAmount = amountIsSol ? Math.round(amount * 1_000_000_000) : Math.round(amount);
    const amountIn = new TokenAmount(tokenIn, rawAmount, true);

    const poolInfo = await Liquidity.fetchInfo({ connection: this.connection, poolKeys });
    const { minAmountOut } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut: tokenOut,
      slippage: DEFAULT_SLIPPAGE
    });

    const owner = this.keypair.publicKey;
    const tokenAccountIn = await getAssociatedTokenAddress(inputMint, owner);
    const tokenAccountOut = await getAssociatedTokenAddress(outputMint, owner);

    const instructions: Transaction["instructions"] = [];
    const cleanupInstructions: Transaction["instructions"] = [];

    const inAccountInfo = await this.connection.getAccountInfo(tokenAccountIn);
    if (!inAccountInfo) {
      instructions.push(createAssociatedTokenAccountInstruction(owner, tokenAccountIn, owner, inputMint));
    }

    const outAccountInfo = await this.connection.getAccountInfo(tokenAccountOut);
    if (!outAccountInfo) {
      instructions.push(createAssociatedTokenAccountInstruction(owner, tokenAccountOut, owner, outputMint));
    }

    if (inputMint.equals(WSOL_MINT)) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: tokenAccountIn,
          lamports: rawAmount
        })
      );
      instructions.push(createSyncNativeInstruction(tokenAccountIn));
      cleanupInstructions.push(createCloseAccountInstruction(tokenAccountIn, owner, owner));
    }

    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
      connection: this.connection,
      poolKeys,
      userKeys: {
        tokenAccountIn,
        tokenAccountOut,
        owner
      },
      amountIn,
      amountOutMin: minAmountOut,
      fixedSide: "in",
      makeTxVersion: 0
    });

    const transaction = new Transaction();
    for (const instruction of instructions) {
      transaction.add(instruction);
    }

    for (const inner of innerTransactions) {
      for (const instruction of inner.instructions) {
        transaction.add(instruction);
      }
    }

    for (const instruction of cleanupInstructions) {
      transaction.add(instruction);
    }

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = owner;

    const signers = innerTransactions.flatMap((inner) => inner.signers);
    transaction.sign(this.keypair, ...signers);

    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    await this.connection.confirmTransaction(signature, "confirmed");
    return { signature };
  }

  private async fetchPoolKeys(inputMint: PublicKey, outputMint: PublicKey) {
    const filters = [
      { dataSize: 696 },
      { memcmp: { offset: POOL_LAYOUT_OFFSETS.baseMint, bytes: inputMint.toBase58() } },
      { memcmp: { offset: POOL_LAYOUT_OFFSETS.quoteMint, bytes: outputMint.toBase58() } }
    ];

    const accounts = await this.connection.getProgramAccounts(RAYDIUM_AMM_PROGRAM_ID, { filters });
    if (accounts.length === 0) {
      throw new Error("No Raydium pool found for the provided mints.");
    }

    const account = accounts[0];
    const data = account.account.data;

    const baseMint = readPublicKey(data, POOL_LAYOUT_OFFSETS.baseMint);
    const quoteMint = readPublicKey(data, POOL_LAYOUT_OFFSETS.quoteMint);
    const baseDecimals = readU64(data, POOL_LAYOUT_OFFSETS.baseDecimals);
    const quoteDecimals = readU64(data, POOL_LAYOUT_OFFSETS.quoteDecimals);

    const marketId = readPublicKey(data, POOL_LAYOUT_OFFSETS.marketId);
    const marketProgramId = readPublicKey(data, POOL_LAYOUT_OFFSETS.marketProgramId);

    const market = await Market.load(this.connection, marketId, {}, marketProgramId);
    const marketAuthority = Market.getAssociatedAuthority({ programId: marketProgramId, marketId }).publicKey;

    return {
      id: account.pubkey,
      baseMint,
      quoteMint,
      lpMint: readPublicKey(data, POOL_LAYOUT_OFFSETS.lpMint),
      baseDecimals,
      quoteDecimals,
      version: 4,
      programId: RAYDIUM_AMM_PROGRAM_ID,
      authority: Liquidity.getAssociatedAuthority({ programId: RAYDIUM_AMM_PROGRAM_ID }).publicKey,
      openOrders: readPublicKey(data, POOL_LAYOUT_OFFSETS.openOrders),
      targetOrders: readPublicKey(data, POOL_LAYOUT_OFFSETS.targetOrders),
      baseVault: readPublicKey(data, POOL_LAYOUT_OFFSETS.baseVault),
      quoteVault: readPublicKey(data, POOL_LAYOUT_OFFSETS.quoteVault),
      withdrawQueue: readPublicKey(data, POOL_LAYOUT_OFFSETS.withdrawQueue),
      lpVault: readPublicKey(data, POOL_LAYOUT_OFFSETS.lpVault),
      marketVersion: 3,
      marketProgramId,
      marketId,
      marketAuthority,
      marketBaseVault: market.baseVault,
      marketQuoteVault: market.quoteVault,
      marketBids: market.bidsAddress,
      marketAsks: market.asksAddress,
      marketEventQueue: market.eventQueueAddress
    };
  }

  private async getMintDecimals(mint: PublicKey): Promise<number> {
    if (mint.equals(WSOL_MINT)) {
      return 9;
    }

    const info = await this.connection.getParsedAccountInfo(mint);
    const parsed = info.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
    const decimals = parsed?.parsed?.info?.decimals;
    if (typeof decimals !== "number") {
      throw new Error("Failed to resolve mint decimals.");
    }
    return decimals;
  }

  private async getTokenBalanceRaw(account: PublicKey): Promise<number> {
    const info = await this.connection.getParsedAccountInfo(account);
    const parsed = info.value?.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } } | undefined;
    const amount = parsed?.parsed?.info?.tokenAmount?.amount;
    return amount ? Number(amount) : 0;
  }
}
