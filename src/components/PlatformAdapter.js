import MainEntitiesView from './discord/MainEntitiesView';
import DiscordMessages from './DiscordMessages';

const platformAdapters = {
  discord: {
    ChatList: MainEntitiesView,
    MessageViewer: DiscordMessages
  }
};

export const getPlatformAdapter = (platform) => {
  return platformAdapters[platform] || null;
}; 