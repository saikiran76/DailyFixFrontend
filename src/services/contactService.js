import api from '../utils/api';
import logger from '../utils/logger';
import { handleError, ErrorTypes, AppError } from '../utils/errorHandler';
import store from '../store/store';

const WHATSAPP_API_PREFIX = '/api/whatsapp-entities';
const MATRIX_API_PREFIX = '/api/matrix';

/**
 * Service for managing contacts across platforms
 * @class ContactService
 */
class ContactService {
  constructor() {
    this.cache = new Map();
    this.syncInProgress = new Map();
    this.lastSyncTime = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Validates and returns cached contacts if available
   */
  _getCachedContacts(userId) {
    const cached = this.cache.get(userId);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
    if (isExpired) {
      this.clearCache(userId);
      return null;
    }

    return cached.contacts;
  }

  /**
   * Gets a specific contact by ID
   * @param {string} contactId - The contact ID
   * @returns {Promise<Object>} Contact data
   */
  async getContact(contactId) {
    if (!contactId) {
      throw new AppError(ErrorTypes.VALIDATION, 'Contact ID is required');
    }

    try {
      const response = await api.get(`${WHATSAPP_API_PREFIX}/contacts/${contactId}`);
      if (!response?.data?.data) {
        throw new AppError(ErrorTypes.API, 'Invalid response from contact API');
      }
      return response.data.data;
    } catch (error) {
      logger.error('[ContactService] Error fetching contact:', error);
      throw handleError(error, 'Failed to fetch contact');
    }
  }

  /**
   * Gets all contacts for a user with caching
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Array of contacts
   */
  async getUserContacts(userId) {
    if (!userId) {
      throw new AppError(ErrorTypes.VALIDATION, 'User ID is required');
    }

    // Check cache first
    const cachedContacts = this._getCachedContacts(userId);
    if (cachedContacts) {
      logger.info('[ContactService] Returning cached contacts for user:', userId);
      return cachedContacts;
    }

    try {
      logger.info('[ContactService] Fetching contacts for user:', userId);
      const response = await api.get(`${WHATSAPP_API_PREFIX}/contacts`, {
        params: { userId }
      });

      if (!response?.data?.data) {
        throw new AppError(ErrorTypes.API, 'Invalid response from contacts API');
      }

      const contacts = response.data.data;

      // Update cache
      this.cache.set(userId, {
        contacts,
        timestamp: Date.now()
      });

      logger.info('[ContactService] Successfully fetched contacts:', contacts.length);
      return contacts;
    } catch (error) {
      logger.error('[ContactService] Error fetching user contacts:', error);
      throw handleError(error, 'Failed to fetch user contacts');
    }
  }

  /**
   * Gets all contacts for the current user with caching
   * @returns {Promise<Array>} Array of contacts
   */
  async getCurrentUserContacts() {
    try {
      const state = store.getState();
      const userId = state.auth.session?.user?.id;

      if (!userId) {
        throw new AppError(ErrorTypes.AUTH, 'No authenticated user found');
      }

      return this.getUserContacts(userId);
    } catch (error) {
      logger.error('[ContactService] Error fetching current user contacts:', error);
      throw handleError(error, 'Failed to fetch current user contacts');
    }
  }

  /**
   * Syncs a specific contact
   * @param {string} contactId - The contact ID to sync
   * @returns {Promise<Object>} Sync result
   */
  async syncContact(contactId) {
    if (!contactId) {
      throw new AppError(ErrorTypes.VALIDATION, 'Contact ID is required');
    }

    if (this.syncInProgress.get(contactId)) {
      logger.info('[ContactService] Sync already in progress for contact:', contactId);
      return { status: 'in_progress' };
    }

    try {
      this.syncInProgress.set(contactId, true);
      logger.info('[ContactService] Starting sync for contact:', contactId);

      const response = await api.post(`${WHATSAPP_API_PREFIX}/contacts/${contactId}/sync`);
      
      if (!response?.data) {
        throw new AppError(ErrorTypes.API, 'Invalid response from sync API');
      }

      // Update last sync time
      this.lastSyncTime.set(contactId, Date.now());
      
      // Clear cache to force fresh data on next fetch
      this.clearCache();

      logger.info('[ContactService] Successfully synced contact:', contactId);
      return response.data;
    } catch (error) {
      logger.error('[ContactService] Error syncing contact:', error);
      throw handleError(error, 'Failed to sync contact');
    } finally {
      this.syncInProgress.set(contactId, false);
    }
  }

  /**
   * Updates a contact's status
   * @param {string} contactId - The contact ID
   * @param {Object} status - The new status
   * @returns {Promise<Object>} Updated contact
   */
  async updateContactStatus(contactId, status) {
    if (!contactId) {
      throw new AppError(ErrorTypes.VALIDATION, 'Contact ID is required');
    }

    try {
      logger.info('[ContactService] Updating contact status:', { contactId, status });
      const response = await api.patch(`${WHATSAPP_API_PREFIX}/contacts/${contactId}/status`, status);
      
      if (!response?.data?.data) {
        throw new AppError(ErrorTypes.API, 'Invalid response from status update API');
      }

      // Clear cache to ensure fresh data on next fetch
      this.clearCache();

      logger.info('[ContactService] Successfully updated contact status:', contactId);
      return response.data.data;
    } catch (error) {
      logger.error('[ContactService] Error updating contact status:', error);
      throw handleError(error, 'Failed to update contact status');
    }
  }

  /**
   * Clears the contact cache for a specific user or all users
   * @param {string} [userId] - Optional user ID to clear specific cache
   */
  clearCache(userId = null) {
    if (userId) {
      this.cache.delete(userId);
      logger.info('[ContactService] Cleared cache for user:', userId);
    } else {
      this.cache.clear();
      logger.info('[ContactService] Cleared all contact cache');
    }
  }
}

// Create singleton instance
const contactService = new ContactService();

// Named export to match imports
export { contactService };

// Also provide default export for flexibility
export default contactService; 