import React from 'react';
import { useState } from 'react';
export default function LoginPage({ onLoginsuccess, onnavtolanding }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        const cleanedemail = email.toLowerCase().trim();
        const cleanedpassword = password.trim();

        if (!cleanedemail || !cleanedpassword) {
            setError('Both Email and Password are required');
            return;
        }

        if (cleanedpassword !== '12345678') {
            setError('Invalid Password');
            return;
        }

        if (cleanedemail === 'owner@gmail.com') {
            onLoginsuccess('owner', cleanedemail);
        }
        else if (cleanedemail === 'manager@gmail.com') {
            onLoginsuccess('manager', cleanedemail);
        }
        else if (cleanedemail === 'worker@gmail.com') {
            onLoginsuccess('worker', cleanedemail);
        }
        else {
            setError('Invalid Email');
            return;
        }
    }

    return (
        <>
            <div id="bl">
                <button id="backButton" onClick={onnavtolanding}>Back</button>
            </div>
            <div id="top">
                <div id="bottom">
                    <p id="symbol1">DT</p>
                    <h3>Durga Timbers</h3>
                    <form onSubmit={handleSubmit}>
                        <label id="emailLabel">Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}></input></label><br></br>
                        <label id="passwordLabel">Password <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)}></input></label><br></br>
                        <button id="loginButton" type="submit">Login</button>
                        {error && <p id="err">{error}</p>}
                    </form>
                </div>
            </div>
        </>
    );
}