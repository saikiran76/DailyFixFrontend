import { createSlice, createAsyncThunk, createAction } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabase';
import api from '../../utils/api';
import logger from '../../utils/logger';

export const ONBOARDING_ROUTES = {
  WELCOME: '/onboarding/welcome',
  PROTOCOL_SELECTION: '/onboarding/protocol_selection',
  MATRIX: '/onboarding/matrix',
  WHATSAPP: '/onboarding/whatsapp',
  COMPLETE: '/onboarding/complete'
};

export const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX: 'matrix',
  WHATSAPP: 'whatsapp',
  COMPLETE: 'complete'
};

const PROTOCOLS = {
  MATRIX: 'matrix',
  DIRECT_API: 'direct_api'
};

export const PLATFORMS = {
  MATRIX: {
    id: 'matrix',
    protocol: PROTOCOLS.MATRIX,
    required: true
  },
  WHATSAPP: {
    id: 'whatsapp',
    protocol: PROTOCOLS.MATRIX,
    required: true
  },
  DISCORD: {
    id: 'discord',
    protocol: PROTOCOLS.DIRECT_API,
    required: false
  }
};

const initialState = {
  currentStep: 'welcome',
  loading: false,
  error: null,
  matrixConnected: false,
  whatsappConnected: false,
  isComplete: false,
  connectedPlatforms: [],
  whatsappSetup: {
    loading: false,
    error: null,
    qrCode: null,
    setupState: 'preparing',
    timeLeft: 300,
    qrExpired: false,
    bridgeRoomId: null,
    phoneNumber: null,
    realTimeSetup: false
  }
};

// Async thunks
export const fetchOnboardingStatus = createAsyncThunk(
  'onboarding/fetchStatus',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/user/onboarding-status');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const updateOnboardingStep = createAsyncThunk(
  'onboarding/updateStep',
  async ({ step, data = {} }, { rejectWithValue }) => {
    try {
      await api.post('/user/onboarding-status', {
        currentStep: step,
        ...data
      });
      return { step, data };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const setWhatsappPhoneNumber = createAction('onboarding/setWhatsappPhoneNumber');

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    setOnboardingError: (state, action) => {
      state.error = action.payload;
    },
    setWhatsappQRCode: (state, action) => {
      state.whatsappSetup.qrCode = action.payload;
      state.whatsappSetup.timeLeft = 300;
      state.whatsappSetup.qrExpired = false;
      state.whatsappSetup.error = null;
      state.whatsappSetup.loading = false;
      // state.whatsappSetup.realTimeSetup = false;
      if (state.whatsappSetup.setupState === 'waiting_for_qr') {
        state.whatsappSetup.setupState = 'qr_ready';
      }
    },
    setWhatsappSetupState: (state, action) => {
      state.whatsappSetup.setupState = action.payload;
      // Update loading state based on setupState
      state.whatsappSetup.loading = ['preparing', 'waiting_for_qr'].includes(action.payload);
      // Clear error when changing state (except for error state)
      if (action.payload !== 'error') {
        state.whatsappSetup.error = null;
      }
      // Update main whatsappConnected flag when setup is complete
      if (action.payload === 'connected') {
        state.whatsappConnected = true;
        if (!state.connectedPlatforms.includes('whatsapp')) {
          state.connectedPlatforms.push('whatsapp');
        }
      }

      if (action.payload === 'puppet_sent') {
        state.whatsappSetup.realTimeSetup = true;
      }
    },
    setWhatsappTimeLeft: (state, action) => {
      state.whatsappSetup.timeLeft = action.payload;
      if (action.payload <= 0) {
        state.whatsappSetup.qrExpired = true;
        state.whatsappSetup.setupState = 'error';
        state.whatsappSetup.error = { message: 'QR Code expired. Please try again.' };
      }
    },
    setWhatsappError: (state, action) => {
      state.whatsappSetup.error = action.payload;
      state.whatsappSetup.setupState = 'error';
    },
    setBridgeRoomId: (state, action) => {
      state.whatsappSetup.bridgeRoomId = action.payload;
    },
    resetWhatsappSetup: (state) => {
      state.whatsappSetup = {
        ...initialState.whatsappSetup,
        setupState: 'initial'
      };
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
        state.isComplete = action.payload.isComplete;
        state.connectedPlatforms = action.payload.connectedPlatforms;
      })
      .addCase(fetchOnboardingStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateOnboardingStep.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateOnboardingStep.fulfilled, (state, action) => {
        state.loading = false;
        state.currentStep = action.payload.step;
        
        // Update connection states if provided
        if (action.payload.data) {
          const { data } = action.payload;
          if (data.matrixConnected !== undefined) {
            state.matrixConnected = data.matrixConnected;
          }
          if (data.whatsappConnected !== undefined) {
            state.whatsappConnected = data.whatsappConnected;
          }
          if (data.isComplete !== undefined) {
            state.isComplete = data.isComplete;
          }
          if (data.connectedPlatforms) {
            state.connectedPlatforms = data.connectedPlatforms;
          }
        }
      })
      .addCase(updateOnboardingStep.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(setWhatsappPhoneNumber, (state, action) => {
        state.whatsappSetup.phoneNumber = action.payload;
      });
  }
});

// Export all actions individually for clarity
export const {
  setOnboardingError,
  setWhatsappQRCode,
  setWhatsappSetupState,
  setWhatsappTimeLeft,
  setWhatsappError,
  setBridgeRoomId,
  resetWhatsappSetup
} = onboardingSlice.actions;

// Selectors
export const selectOnboardingState = (state) => state.onboarding;
export const selectWhatsappSetup = (state) => state.onboarding.whatsappSetup;

export default onboardingSlice.reducer; 