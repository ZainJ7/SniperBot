import { loadConfig } from "./config/config.js";
import { SniperBot } from "./bots/sniperBot.js";

const configPath = process.env.CONFIG_PATH;
const config = loadConfig(configPath);

const bot = new SniperBot(config);

void bot.start();
