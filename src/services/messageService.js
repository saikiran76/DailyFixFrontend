import api from '../utils/api';
import logger from '../utils/logger';

class MessageService {
  async fetchMessages(contactId, params = {}) {
    try {
      const response = await api.get(`/api/whatsapp-entities/contacts/${contactId}/messages`, {
        params: {
          limit: params.limit || 20,
          offset: (params.page || 0) * (params.limit || 20)
        }
      });

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }

      return {
        messages: response.data.data.messages || response.data.messages || [],
        hasMore: (response.data.data.messages || response.data.messages || []).length === (params.limit || 20)
      };
    } catch (error) {
      logger.error('[MessageService] Error fetching messages:', error);
      throw error;
    }
  }

  async sendMessage(contactId, message) {
    try {
      const response = await api.post(
        `/api/whatsapp-entities/send-message/${contactId}`,
        message
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'Failed to send message');
      }

      return response.data;
    } catch (error) {
      logger.error('[MessageService] Error sending message:', error);
      throw error;
    }
  }

  async markMessagesAsRead(contactId, messageIds) {
    try {
      await api.post(`/api/whatsapp-entities/contacts/${contactId}/messages/read`, {
        messageIds: Array.from(messageIds)
      });
      return true;
    } catch (error) {
      logger.error('[MessageService] Error marking messages as read:', error);
      throw error;
    }
  }
}

export const messageService = new MessageService(); 