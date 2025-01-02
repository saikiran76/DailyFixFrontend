import WhatsAppChatList from './platforms/WhatsAppChatList';
import WhatsAppMessageViewer from './platforms/WhatsAppMessageViewer';
import TelegramChatList from './platforms/TelegramChatList';
import TelegramMessageViewer from './platforms/TelegramMessageViewer';
import SlackChatList from './platforms/SlackChatList';
import SlackMessageViewer from './platforms/SlackMessageViewer';

const PlatformAdapter = {
  whatsapp: {
    ChatList: WhatsAppChatList,
    MessageViewer: WhatsAppMessageViewer
  },
  telegram: {
    ChatList: TelegramChatList,
    MessageViewer: TelegramMessageViewer
  },
  slack: {
    ChatList: SlackChatList,
    MessageViewer: SlackMessageViewer
  }
};

export function getPlatformAdapter(platform) {
  return PlatformAdapter[platform];
}
