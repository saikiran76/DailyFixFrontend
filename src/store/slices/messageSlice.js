import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { messageService } from '../../services/messageService';
import logger from '../../utils/logger';

// Async thunks
export const fetchMessages = createAsyncThunk(
  'messages/fetchAll',
  async ({ contactId, page = 0, limit = 20 }, { rejectWithValue }) => {
    try {
      logger.info('[Messages] Fetching messages for contact:', contactId);
      const result = await messageService.fetchMessages(contactId, { page, limit });
      logger.info('[Messages] Fetched messages:', result.messages?.length);
      return result;
    } catch (error) {
      logger.error('[Messages] Failed to fetch messages:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'messages/send',
  async ({ contactId, message }, { rejectWithValue }) => {
    try {
      const result = await messageService.sendMessage(contactId, message);
      return result;
    } catch (error) {
      logger.error('[Messages] Failed to send message:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const markMessagesAsRead = createAsyncThunk(
  'messages/markAsRead',
  async ({ contactId, messageIds }, { rejectWithValue }) => {
    try {
      await messageService.markMessagesAsRead(contactId, messageIds);
      return { messageIds };
    } catch (error) {
      logger.error('[Messages] Failed to mark messages as read:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Slice definition
const messageSlice = createSlice({
  name: 'messages',
  initialState: {
    items: {}, // Object instead of Map: { contactId: messages[] }
    loading: false,
    error: null,
    hasMore: true,
    currentPage: 0,
    messageQueue: [],
    unreadMessageIds: [] // Array instead of Set
  },
  reducers: {
    clearMessages: (state) => {
      state.items = {};
      state.loading = false;
      state.error = null;
      state.hasMore = true;
      state.currentPage = 0;
    },
    addToMessageQueue: (state, action) => {
      state.messageQueue.push(action.payload);
    },
    removeFromMessageQueue: (state, action) => {
      state.messageQueue = state.messageQueue.filter(msg => msg.id !== action.payload);
    },
    updateMessageStatus: (state, action) => {
      const { contactId, messageId, status } = action.payload;
      const messages = state.items[contactId];
      if (messages) {
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          messages[messageIndex].status = status;
        }
      }
    },
    messageReceived: (state, action) => {
      const { contactId, message } = action.payload;
      if (!state.items[contactId]) {
        state.items[contactId] = [];
      }
      
      // Create a unique ID if one doesn't exist
      const messageId = message.message_id || message.id;
      if (!messageId) {
        logger.error('[MessageSlice] Message received without ID:', message);
        return;
      }

      // Check for duplicates using a more comprehensive approach
      const isDuplicate = state.items[contactId].some(existingMsg => {
        // Check all possible ID combinations
        const existingIds = [existingMsg.message_id, existingMsg.id].filter(Boolean);
        const newIds = [messageId, message.id, message.message_id].filter(Boolean);
        
        // Check if any IDs match
        return existingIds.some(id => newIds.includes(id)) ||
          // Also check timestamp and content for exact matches
          (existingMsg.timestamp === message.timestamp && 
           existingMsg.content === message.content);
      });

      if (!isDuplicate) {
        // Add message with normalized IDs
        const normalizedMessage = {
          ...message,
          id: messageId,
          message_id: messageId,
          // Add received_at timestamp to help with deduplication
          received_at: new Date().toISOString()
        };
        state.items[contactId].push(normalizedMessage);
        
        // Sort messages by timestamp
        state.items[contactId].sort((a, b) => {
          const dateA = new Date(a.timestamp);
          const dateB = new Date(b.timestamp);
          return dateA - dateB;
        });

        logger.info('[MessageSlice] New message added:', { 
          messageId, 
          contactId,
          timestamp: message.timestamp 
        });
      } else {
        logger.info('[MessageSlice] Duplicate message prevented:', { 
          messageId, 
          contactId,
          timestamp: message.timestamp 
        });
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loading = false;
        const { messages, hasMore } = action.payload;
        const contactId = action.meta.arg.contactId;
        const page = action.meta.arg.page;

        // Initialize or update messages for this contact
        const existingMessages = page === 0 ? [] : (state.items[contactId] || []);
        state.items[contactId] = [...existingMessages, ...messages];
        
        state.hasMore = hasMore;
        state.currentPage = page;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch messages';
      })
      // Send message
      .addCase(sendMessage.fulfilled, (state, action) => {
        const contactId = action.meta.arg.contactId;
        const messages = state.items[contactId] || [];
        messages.push({
          ...action.meta.arg.message,
          id: action.payload.messageId,
          status: 'sent',
          timestamp: new Date().toISOString()
        });
        state.items[contactId] = messages;
      })
      // Mark as read
      .addCase(markMessagesAsRead.fulfilled, (state, action) => {
        const messageIds = action.payload.messageIds;
        state.unreadMessageIds = state.unreadMessageIds.filter(id => !messageIds.includes(id));
      });
  }
});

// Export actions
export const {
  clearMessages,
  addToMessageQueue,
  removeFromMessageQueue,
  updateMessageStatus,
  messageReceived
} = messageSlice.actions;

// Export reducer
export const messageReducer = messageSlice.reducer;

// Selectors
export const selectMessages = (state, contactId) => state.messages.items[contactId] || [];
export const selectMessageLoading = (state) => state.messages.loading;
export const selectMessageError = (state) => state.messages.error;
export const selectHasMoreMessages = (state) => state.messages.hasMore;
export const selectCurrentPage = (state) => state.messages.currentPage;
export const selectMessageQueue = (state) => state.messages.messageQueue;
export const selectUnreadMessageIds = (state) => state.messages.unreadMessageIds; 