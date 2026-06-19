import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ChatProvider } from './context/ChatContext';
import { AuthLayout } from './components/AuthLayout';
import { Dashboard } from './components/Dashboard';
import { SplashScreen } from './components/SplashScreen';
import { Sparkles } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, token, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Show splash screen for 2.2 seconds
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-[#0b0f19] text-white select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-spin mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-glow">Altma Chat</h2>
          <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Choose between authentication form or chat workspace
  if (!token || !user) {
    return <AuthLayout />;
  }

  return <Dashboard />;
};

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <ChatProvider>
              <AppContent />
            </ChatProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
