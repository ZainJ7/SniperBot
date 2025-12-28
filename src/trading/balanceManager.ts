import { JsonFileStorage } from "../storage/jsonFileStorage.js";

export class BalanceManager {
  private readonly storage: JsonFileStorage;

  constructor(storage: JsonFileStorage) {
    this.storage = storage;
  }

  getBalanceSol(): number {
    return this.storage.read().balanceSol;
  }

  setBalanceSol(amount: number): void {
    const state = this.storage.read();
    state.balanceSol = amount;
    if (state.dailyStartBalance <= 0) {
      state.dailyStartBalance = amount;
      state.dailyStartTimestamp = Date.now();
    }
    this.storage.write(state);
  }

  reserveSol(amount: number): boolean {
    const state = this.storage.read();
    if (state.balanceSol < amount) {
      return false;
    }
    state.balanceSol -= amount;
    this.storage.write(state);
    return true;
  }

  releaseSol(amount: number): void {
    const state = this.storage.read();
    state.balanceSol += amount;
    this.storage.write(state);
  }

  ensureDailyStart(): void {
    const state = this.storage.read();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    if (state.dailyStartTimestamp < startOfDay.getTime()) {
      state.dailyStartTimestamp = Date.now();
      state.dailyStartBalance = state.balanceSol;
      this.storage.write(state);
    }
  }

  isDailyLossExceeded(maxLossPct: number): boolean {
    this.ensureDailyStart();
    const state = this.storage.read();
    if (state.dailyStartBalance <= 0) {
      return false;
    }
    const lossPct = ((state.dailyStartBalance - state.balanceSol) / state.dailyStartBalance) * 100;
    return lossPct >= maxLossPct;
  }
}
