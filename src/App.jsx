import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import store from './store/store';
import AppContent from './AppContent';
import logger from './utils/logger';

const App = () => {
  logger.info('[App] Rendering root component');
  
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppContent />
        <Toaster position="top-right" />
      </BrowserRouter>
    </Provider>
  );
};

export default App;
