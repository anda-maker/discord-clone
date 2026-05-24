import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AuthPage from './pages/AuthPage';
import MainApp from './pages/MainApp';
import LandingPage from './pages/LandingPage';
import LoadingScreen from './components/ui/LoadingScreen';

export default function App() {
  const { user, loading, loadSession } = useAuthStore();

  useEffect(() => { loadSession(); }, []);

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      {/* Public landing page — always accessible at "/" */}
      <Route path="/" element={user ? <Navigate to="/app" /> : <LandingPage />} />

      {/* Auth page (login/register) */}
      <Route path="/auth" element={user ? <Navigate to="/app" /> : <AuthPage />} />

      {/* Main app — requires login */}
      <Route path="/app/*" element={user ? <MainApp /> : <Navigate to="/auth" />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
