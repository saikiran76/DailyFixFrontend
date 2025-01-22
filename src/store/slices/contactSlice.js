import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { contactService } from '../../services/contactService';
import logger from '../../utils/logger';

// Async thunks
export const fetchContacts = createAsyncThunk(
  'contacts/fetchAll',
  async (userId, { rejectWithValue }) => {
    try {
      logger.info('[Contacts] Fetching contacts for user:', userId);
      const contacts = userId ? 
        await contactService.getUserContacts(userId) :
        await contactService.getCurrentUserContacts();
      logger.info('[Contacts] Fetched contacts:', contacts.length);
      return contacts;
    } catch (error) {
      logger.info('[Contacts] Failed to fetch contacts:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const syncContact = createAsyncThunk(
  'contacts/sync',
  async (contactId, { rejectWithValue }) => {
    try {
      const result = await contactService.syncContact(contactId);
      return result;
    } catch (error) {
      logger.info('[ContactSlice] Failed to sync contact:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateContactStatus = createAsyncThunk(
  'contacts/updateStatus',
  async ({ contactId, status }, { rejectWithValue }) => {
    try {
      const result = await contactService.updateContactStatus(contactId, status);
      return result;
    } catch (error) {
      logger.info('[ContactSlice] Failed to update contact status:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Slice definition
const contactSlice = createSlice({
  name: 'contacts',
  initialState: {
    items: [],
    loading: false,
    error: null,
    syncStatus: {
      inProgress: false,
      lastSyncTime: null,
      error: null
    }
  },
  reducers: {
    clearContactError: (state) => {
      state.error = null;
      state.syncStatus.error = null;
    },
    clearContacts: (state) => {
      state.items = [];
      state.loading = false;
      state.error = null;
      state.syncStatus = {
        inProgress: false,
        lastSyncTime: null,
        error: null
      };
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch contacts
      .addCase(fetchContacts.pending, (state) => {
        state.loading = true;
        state.error = null;
        logger.info('[Contacts] Starting contacts fetch');
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        logger.info('[Contacts] Contacts fetch successful:', action.payload.length);
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch contacts';
        logger.info('[Contacts] Contacts fetch failed:', action.payload);
      })
      // Sync contacts
      .addCase(syncContact.pending, (state) => {
        state.syncStatus.inProgress = true;
        state.syncStatus.error = null;
      })
      .addCase(syncContact.fulfilled, (state, action) => {
        state.syncStatus.inProgress = false;
        state.syncStatus.lastSyncTime = Date.now();
        state.items = action.payload.contacts || state.items;
      })
      .addCase(syncContact.rejected, (state, action) => {
        state.syncStatus.inProgress = false;
        state.syncStatus.error = action.payload || 'Failed to sync contacts';
      })
      // Update contact status
      .addCase(updateContactStatus.fulfilled, (state, action) => {
        const updatedContact = action.payload;
        const index = state.items.findIndex(contact => contact.id === updatedContact.id);
        if (index !== -1) {
          state.items[index] = updatedContact;
        }
      });
  }
});

// Export actions
export const { clearContactError, clearContacts } = contactSlice.actions;

// Export reducer as named export to match store's import
export const contactReducer = contactSlice.reducer;

// Selectors
export const selectAllContacts = (state) => state.contacts.items;
export const selectContactById = (state, contactId) =>
  state.contacts.items.find(contact => contact.id === contactId);
export const selectSyncStatus = (state) => state.contacts.syncStatus;
export const selectContactsLoading = (state) => state.contacts.loading;
export const selectContactsError = (state) => state.contacts.error;
export const selectLastSyncTime = (state) => state.contacts.syncStatus.lastSyncTime;
export const selectIsSyncing = (state) => state.contacts.syncStatus.inProgress; 