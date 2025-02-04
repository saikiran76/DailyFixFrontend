import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { contactService } from '../../services/contactService';
import logger from '../../utils/logger';

// Async thunks
export const fetchContacts = createAsyncThunk(
  'contacts/fetchAll',
  async (userId, { rejectWithValue }) => {
    try {
      logger.info('[Contacts] Fetching contacts for user:', userId);
      const result = await contactService.getCurrentUserContacts();
      
      // Handle in-progress sync case
      if (result.inProgress) {
        return { inProgress: true, contacts: [] };
      }
      
      logger.info('[Contacts] Fetched contacts:', result.contacts?.length);
      return { contacts: result.contacts || [] };
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

// export const updateContactStatus = createAsyncThunk(
//   'contacts/updateStatus',
//   async ({ contactId, status }, { rejectWithValue }) => {
//     try {
//       const result = await contactService.updateContactStatus(contactId, status);
//       return result;
//     } catch (error) {
//       logger.info('[ContactSlice] Failed to update contact status:', error);
//       return rejectWithValue(error.message);
//     }
//   }
// );

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
    },
    initialLoadComplete: false
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
      state.initialLoadComplete = false;
    },
    updateContactMembership: (state, action) => {
      const { contactId, updatedContact } = action.payload;
      const contactIndex = state.items.findIndex(c => c.id === contactId);
      if (contactIndex !== -1) {
        logger.info('[ContactSlice] Updating contact membership:', {
          contactId,
          oldMembership: state.items[contactIndex].metadata?.membership,
          newMembership: updatedContact.metadata?.membership
        });
        state.items[contactIndex] = updatedContact;
      }
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
        
        if (action.payload.inProgress) {
          state.syncStatus.inProgress = true;
          if (!state.items.length) {
            state.items = [];
          }
        } else {
          state.items = action.payload.contacts.map(contact => ({
            ...contact,
            metadata: {
              ...contact.metadata,
              membership: contact.metadata?.membership || 'join'
            }
          }));
          state.syncStatus.inProgress = false;
          state.syncStatus.lastSyncTime = Date.now();
        }
        
        state.initialLoadComplete = true;
        logger.info('[Contacts] Contacts fetch successful:', {
          count: state.items.length,
          hasMetadata: state.items.some(item => item.metadata?.membership)
        });
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch contacts';
        state.initialLoadComplete = true;
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
        if (action.payload.contacts) {
          state.items = action.payload.contacts;
        }
      })
      .addCase(syncContact.rejected, (state, action) => {
        state.syncStatus.inProgress = false;
        state.syncStatus.error = action.payload || 'Failed to sync contacts';
      });
  }
});

// Export actions
export const { 
  clearContactError, 
  clearContacts,
  updateContactMembership 
} = contactSlice.actions;

// Export reducer
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
export const selectInitialLoadComplete = (state) => state.contacts.initialLoadComplete; 