import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import DashboardPage from './pages/DashboardPage';

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <DashboardPage />
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
