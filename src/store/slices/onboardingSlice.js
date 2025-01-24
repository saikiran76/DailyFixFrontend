import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabase';
import api from '../../utils/api';
import logger from '../../utils/logger';

const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX_SETUP: 'matrix_setup',
  WHATSAPP_SETUP: 'whatsapp_setup',
  COMPLETE: 'complete'
};

export const fetchOnboardingStatus = createAsyncThunk(
  'onboarding/fetchStatus',
  async (_, { rejectWithValue }) => {
    try {
      const { data: response, error } = await api.get('/user/onboarding-status');

      if (error) throw error;

      return {
        currentStep: response?.currentStep || ONBOARDING_STEPS.WELCOME,
        matrixConnected: response?.matrixConnected || false,
        whatsappConnected: response?.whatsappConnected || false,
        isComplete: response?.isComplete || false,
        connectedPlatforms: response?.connectedPlatforms || []
      };
    } catch (error) {
      logger.error('[Onboarding] Error fetching status:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateOnboardingStep = createAsyncThunk(
  'onboarding/updateStep',
  async ({ step, data = {} }, { rejectWithValue }) => {
    try {
      const response = await api.post('/user/onboarding-status', {
        currentStep: step,
        ...data
      });

      if (response.error) throw response.error;

      return { 
        step,
        ...response.data
      };
    } catch (error) {
      logger.error('[Onboarding] Error updating step:', error);
      return rejectWithValue(error.message);
    }
  }
);

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState: {
    currentStep: ONBOARDING_STEPS.WELCOME,
    matrixConnected: false,
    whatsappConnected: false,
    completedSteps: [],
    loading: false,
    error: null
  },
  reducers: {
    resetOnboarding: (state) => {
      state.currentStep = ONBOARDING_STEPS.WELCOME;
      state.completedSteps = [];
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOnboardingStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOnboardingStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.currentStep = action.payload.currentStep;
        state.matrixConnected = action.payload.matrixConnected;
        state.whatsappConnected = action.payload.whatsappConnected;
        state.completedSteps = action.payload.completedSteps;
      })
      .addCase(fetchOnboardingStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateOnboardingStep.fulfilled, (state, action) => {
        state.currentStep = action.payload.step;
        if (action.payload.matrixConnected !== undefined) {
          state.matrixConnected = action.payload.matrixConnected;
        }
        if (action.payload.whatsappConnected !== undefined) {
          state.whatsappConnected = action.payload.whatsappConnected;
        }
        if (!state.completedSteps.includes(action.payload.step)) {
          state.completedSteps.push(action.payload.step);
        }
      });
  }
});

export const { resetOnboarding } = onboardingSlice.actions;
export const selectOnboarding = (state) => state.onboarding;
export const selectCurrentStep = (state) => state.onboarding.currentStep;
export const selectIsStepCompleted = (step) => (state) => 
  state.onboarding.completedSteps.includes(step);

export default onboardingSlice.reducer; 