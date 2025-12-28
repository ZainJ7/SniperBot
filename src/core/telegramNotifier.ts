import TelegramBot from "node-telegram-bot-api";

export class TelegramNotifier {
  private readonly bot: TelegramBot;
  private readonly chatId: string;

  constructor(botToken: string, chatId: string) {
    this.bot = new TelegramBot(botToken, { polling: false });
    this.chatId = chatId;
  }

  async send(message: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, message, { disable_web_page_preview: true });
  }
}
