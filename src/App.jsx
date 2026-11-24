import { useState, useEffect } from 'react';
import LandingPage from './Pages/LandingPage';
import LoginPage from './Pages/LoginPage';
import OwnerPage from './Pages/OwnerPage';
import ManagerPage from './Pages/ManagerPage';
import WorkerPage from './Pages/WorkerPage';
import { getCurrentUser, api } from './api';

function App() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [screen, setScreen] = useState(() => {
    const user = getCurrentUser();
    if (user && user.role) {
      return user.role;
    }
    return typeof localStorage !== 'undefined' ? localStorage.getItem('currentScreen') || 'landing' : 'landing';
  });

  // Keep screen state persistent across browser refreshes
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('currentScreen', screen);
    }
  }, [screen]);

  const handleLoginSuccess = (role, user) => {
    setCurrentUser(user);
    setScreen(role);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('currentScreen', role);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
    }
  };

  const handleSignOut = () => {
    api.logout();
    setCurrentUser(null);
    setScreen('login');
  };

  if (screen === 'landing') {
    return <LandingPage onnavtologin={() => setScreen('login')} />;
  } else if (screen === 'login') {
    return (
      <LoginPage
        onLoginsuccess={handleLoginSuccess}
        onnavtolanding={() => setScreen('landing')}
      />
    );
  } else if (screen === 'owner') {
    return <OwnerPage onsignout={handleSignOut} />;
  } else if (screen === 'manager') {
    return <ManagerPage onsignout={handleSignOut} />;
  } else if (screen === 'worker') {
    return (
      <WorkerPage
        name={currentUser?.name || 'Worker'}
        onsignout={handleSignOut}
      />
    );
  }

  return <LandingPage onnavtologin={() => setScreen('login')} />;
}

export default App;
