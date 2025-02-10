import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';
import store, { persistor } from './store/store';
import AppRoutes from './routes/AppRoutes';
import { Toaster } from 'react-hot-toast';
import LoadingSpinner from './components/LoadingSpinner';

const App = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={<LoadingSpinner />} persistor={persistor}>
        <BrowserRouter>
          <Toaster position="top-right" />
          <AppRoutes />
        </BrowserRouter>
      </PersistGate>
    </Provider>
  );
};

export default App;
