import { supabase } from '../utils/supabase';
import { tokenManager } from '../utils/tokenManager';
import api from '../utils/api';
import logger from '../utils/logger';
import { debounce } from 'lodash';

class OnboardingService {
  constructor() {
    this.cache = new Map();
    this.pendingChecks = new Map();
    this.updateLocks = new Map();
    this.CACHE_TTL = 30000; // 30 seconds
    
    // Debounced status check
    this.debouncedCheckStatus = debounce(this._checkStatus.bind(this), 100, {
      leading: true,
      trailing: true
    });
  }

  async getOnboardingStatus(forceRefresh = false) {
    try {
      // If there's an update in progress, wait for it
      const updateLock = this.updateLocks.get('current');
      if (updateLock) {
        await updateLock;
        forceRefresh = true; // Force refresh after update
      }

      // Check cache if not forcing refresh
      if (!forceRefresh) {
        const cached = this._getCachedStatus();
        if (cached) {
          logger.info('[OnboardingService] Using cached status:', cached);
          return cached;
        }
      }

      // Check if there's a pending request
      const pending = this.pendingChecks.get('current');
      if (pending) {
        logger.info('[OnboardingService] Using pending request');
        return pending;
      }

      // Create new request promise
      const promise = this.debouncedCheckStatus();
      this.pendingChecks.set('current', promise);

      try {
        const result = await promise;
        logger.info('[OnboardingService] Got fresh status:', result);
        return result;
      } finally {
        this.pendingChecks.delete('current');
      }
    } catch (error) {
      logger.info('[OnboardingService] Error getting status:', error);
      throw error;
    }
  }

  async _checkStatus() {
    try {
      logger.debug('[OnboardingService] Making API request to /user/onboarding-status');
      
      // Get onboarding status from backend
      const { data, error } = await api.get('/user/onboarding-status');
      
      logger.debug('[OnboardingService] Received response:', { data, error });
      
      if (error) throw error;

      // Ensure we copy ALL fields from the backend response
      const status = {
        ...data,
        lastChecked: Date.now()
      };

      logger.debug('[OnboardingService] Parsed status:', status);

      // Update cache with complete status
      this.cache.set('current', status);
      return status;
    } catch (error) {
      logger.info('[OnboardingService] Status check failed:', error);
      throw error;
    }
  }

  _getCachedStatus() {
    const cached = this.cache.get('current');
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.lastChecked < this.CACHE_TTL) {
      return cached;
    }

    this.cache.delete('current');
    return null;
  }

  _validateStepTransition(currentStep, nextStep, isComplete = false) {
    // If onboarding is complete, prevent any changes
    if (isComplete) {
      logger.info('[OnboardingService] Preventing step change - onboarding complete');
      throw new Error('Cannot modify completed onboarding');
    }

    // If no current step, only allow initial steps
    if (!currentStep) {
      const validInitialSteps = ['initial', 'whatsapp', 'matrix'];
      const isValid = validInitialSteps.includes(nextStep);
      logger.debug('[OnboardingService] Validating initial step:', { nextStep, isValid });
      return isValid;
    }

    // Define valid transitions
    const validTransitions = {
      'initial': ['whatsapp', 'matrix'],
      'whatsapp': ['matrix', 'complete'],
      'matrix': ['whatsapp', 'complete'],
      'complete': [] // No transitions allowed from complete
    };

    const isValid = validTransitions[currentStep]?.includes(nextStep) ?? false;
    logger.debug('[OnboardingService] Validating step transition:', {
      from: currentStep,
      to: nextStep,
      isValid
    });
    return isValid;
  }

  async updateOnboardingStep(step, data) {
    const lockKey = `update_${step}`;
    try {
      const updatePromise = (async () => {
        // Get current status first
        const currentStatus = await this.getOnboardingStatus(true);
        logger.debug('[OnboardingService] Current status before update:', currentStatus);
        
        // If onboarding is complete, prevent any changes
        if (currentStatus.isComplete) {
          logger.info('[OnboardingService] Rejecting update - onboarding already complete');
          throw new Error('Cannot modify completed onboarding');
        }

        // Add step validation
        if (!this._validateStepTransition(currentStatus.currentStep, step, currentStatus.isComplete)) {
          logger.info('[OnboardingService] Rejecting invalid step transition:', {
            from: currentStatus.currentStep,
            to: step
          });
          throw new Error(`Invalid step transition from ${currentStatus.currentStep} to ${step}`);
        }

        // Verify platform connections for completion
        if (step === 'complete') {
          const missingPlatforms = this._checkRequiredPlatforms(currentStatus);
          if (missingPlatforms.length > 0) {
            logger.info('[OnboardingService] Cannot complete - missing platforms:', missingPlatforms);
            throw new Error(`Cannot complete onboarding: missing platforms: ${missingPlatforms.join(', ')}`);
          }
        }

        // Add optimistic update
        const optimisticStatus = {
          ...currentStatus,
          currentStep: step,
          lastChecked: Date.now()
        };
        this.cache.set('current', optimisticStatus);
        logger.debug('[OnboardingService] Applied optimistic update:', optimisticStatus);

        try {
          await api.post('/user/onboarding-status', {
            step,
            data,
            currentStatus,
            timestamp: Date.now()
          });
        } catch (error) {
          // Revert optimistic update on failure
          this.cache.delete('current');
          logger.info('[OnboardingService] API update failed, reverting optimistic update:', error);
          throw error;
        }

        // Get fresh status
        const newStatus = await this.getOnboardingStatus(true);
        logger.debug('[OnboardingService] Update complete, new status:', newStatus);
        return newStatus;
      })();

      // Store update promise with unique key per step
      this.updateLocks.set(lockKey, updatePromise);

      try {
        return await updatePromise;
      } finally {
        // Only clear if this was the last update for this step
        if (this.updateLocks.get(lockKey) === updatePromise) {
          this.updateLocks.delete(lockKey);
        }
      }
    } catch (error) {
      logger.info('[OnboardingService] Step update failed:', { step, error });
      throw error;
    }
  }

  _checkRequiredPlatforms(status) {
    const required = ['whatsapp', 'matrix'];
    const missing = [];
    
    if (!status.whatsappConnected) missing.push('whatsapp');
    if (!status.matrixConnected) missing.push('matrix');
    
    return missing;
  }
}

export const onboardingService = new OnboardingService(); 