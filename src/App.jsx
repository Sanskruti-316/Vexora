import { useState } from 'react'
import LandingPage from './Pages/LandingPage'
import LoginPage from './Pages/LoginPage'
import OwnerPage from './Pages/OwnerPage'
import ManagerPage from './Pages/ManagerPage'
import WorkerPage from './Pages/WorkerPage'

function App() {
  const [screen, setScreen] = useState('landing');

  // shared data so worker requests reach the manager
  const [timber, setTimber] = useState([
    { id: 1, type: 'Teak', size: '10x10', qty: 100, min: 20, price: 10000, date: '2026-10-01' },
    { id: 2, type: 'Rosewood', size: '5x5', qty: 50, min: 10, price: 50000, date: '2026-10-12' },
    { id: 3, type: 'Mahogany', size: '3x3', qty: 30, min: 10, price: 5000, date: '2026-10-20' },
    { id: 4, type: 'Oak', size: '2x2', qty: 8, min: 15, price: 15000, date: '2026-11-02' },
  ]);
  const [requests, setRequests] = useState([]);
  const [workers, setWorkers] = useState([
    { name: 'Ravi K', email: 'worker@gmail.com' },
    { name: 'Anil S', email: 'anil@example.com' },
  ]);
  const [txns, setTxns] = useState([]);
  const store = { timber, setTimber, requests, setRequests, workers, setWorkers, txns, setTxns };

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
    return <ManagerPage store={store} onsignout={() => setScreen('login')} />
  }
  else if (screen == 'worker') {
    return <WorkerPage store={store} name="Ravi K" onsignout={() => setScreen('login')} />
  }
}

export default App;