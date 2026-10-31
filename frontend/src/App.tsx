import { useEffect, useState } from 'react';
import { api } from './api';
import type { SessionUser } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    const slack = params.get('slack');
    if (authError) setLoginError(authError);
    if (slack === 'connected') setNotice('Slack connected. Rate-limit alerts will post to the channel you picked.');
    if (slack === 'cancelled') setNotice('Slack connection was cancelled. Emails still schedule without it.');
    if (slack === 'error') setNotice('Slack did not finish connecting. Check the app redirect URL and try again.');
    if (authError || slack) {
      window.history.replaceState({}, '', '/');
    }

    api.config().then((config) => setGoogleConfigured(config.google)).catch(() => setGoogleConfigured(true));
    api
      .me()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-xs text-gray-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <LoginScreen googleConfigured={googleConfigured} error={loginError} onError={setLoginError} onLogin={setUser} />;
  }

  return (
    <Dashboard
      user={user}
      onUser={setUser}
      notice={notice}
      onLogout={() => {
        api.logout().finally(() => setUser(null));
      }}
    />
  );
}
