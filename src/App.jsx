import { useState } from 'react'
import LandingPage from './Pages/LandingPage'
import LoginPage from './Pages/LoginPage'
import OwnerPage from './Pages/OwnerPage'
import BlankPage from './Pages/BlankPage'


function App() {
  const [screen, setScreen] = useState('landing');


  if (screen == 'landing') {
    return <LandingPage onnavtologin={() => setScreen('login')} />
  }
  else if (screen == 'login') {
    return <LoginPage
      onLoginsuccess={(role) => setScreen(role)}
      onnavtolanding={() => setScreen('landing')}
    />
  }
  else if (screen == 'owner') {
    return <OwnerPage onsignout={() => setScreen('login')} />
  }
  else if (screen == 'manager') {
    return <BlankPage title='Manager' onsignout={() => setScreen('login')} />
  }
  else if (screen == 'worker') {
    return <BlankPage title='worker' onsignout={() => setScreen('login')} />
  }
}

export default App;
