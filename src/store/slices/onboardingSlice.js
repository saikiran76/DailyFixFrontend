import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabase';
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
      const { data, error } = await supabase
        .from('user_onboarding')
        .select('*')
        .single();

      if (error) throw error;

      return {
        currentStep: data?.current_step || ONBOARDING_STEPS.WELCOME,
        matrixConnected: data?.matrix_connected || false,
        whatsappConnected: data?.whatsapp_connected || false,
        completedSteps: data?.completed_steps || []
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
      const { error } = await supabase
        .from('user_onboarding')
        .upsert({
          current_step: step,
          ...data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      return { step, ...data };
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