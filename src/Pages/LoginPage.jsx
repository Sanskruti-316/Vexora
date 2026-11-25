import React, { useState } from 'react';
import { api } from '../api';

export default function LoginPage({ onLoginsuccess, onnavtolanding }) {
    const [isRegister, setIsRegister] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const cleanedemail = email.toLowerCase().trim();
        const cleanedpassword = password.trim();

        if (!cleanedemail || !cleanedpassword) {
            setError('Both Email and Password are required');
            return;
        }

        setLoading(true);
        try {
            if (isRegister) {
                if (!name.trim()) {
                    setLoading(false);
                    return setError('Full name is required to register as owner');
                }
                if (cleanedpassword.length < 6) {
                    setLoading(false);
                    return setError('Password must be at least 6 characters');
                }
                if (phone && phone.trim()) {
                    const rawPhone = phone.trim();
                    if (/^-/.test(rawPhone) || (rawPhone.includes("-") && !/^\+?\d+[\-\s]?\d+$/.test(rawPhone))) {
                        setLoading(false);
                        return setError('Phone number cannot be negative or contain invalid characters');
                    }
                    const cleanedPhone = rawPhone.replace(/[\s\-\(\)]/g, "");
                    if (!/^\+?[1-9]\d{9,14}$/.test(cleanedPhone)) {
                        setLoading(false);
                        return setError('Invalid phone number. Must be a valid 10 to 15 digit number (e.g. +91 9876543210)');
                    }
                }
                const res = await api.registerOwner({
                    name: name.trim(),
                    email: cleanedemail,
                    password: cleanedpassword,
                    phone: phone.trim() || '+91 9999999999',
                });
                setLoading(false);
                if (res && res.user) {
                    onLoginsuccess('owner', res.user);
                } else {
                    throw new Error('Invalid response from server');
                }
            } else {
                const res = await api.login(cleanedemail, cleanedpassword);
                setLoading(false);
                if (res && res.user) {
                    onLoginsuccess(res.user.role, res.user);
                } else {
                    throw new Error('Invalid response from server');
                }
            }
        } catch (err) {
            setLoading(false);
            setError(err.message || 'Operation failed');
        }
    };

    return (
        <>
            <div id="bl">
                <button id="backButton" onClick={onnavtolanding}>Back</button>
            </div>
            <div id="top">
                <div id="bottom">
                    <p id="symbol1">DT</p>
                    <h3>{isRegister ? 'Register as Owner' : 'Durga Timbers'}</h3>
                    <form onSubmit={handleSubmit}>
                        {isRegister && (
                            <>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter owner name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    style={{
                                        padding: '8px',
                                        borderRadius: '5px',
                                        border: '1px solid #ccc',
                                        width: '100%',
                                        marginBottom: '15px',
                                        boxSizing: 'border-box',
                                    }}
                                />
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                                    Phone (optional)
                                </label>
                                <input
                                    type="tel"
                                    placeholder="+91 9876543210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    style={{
                                        padding: '8px',
                                        borderRadius: '5px',
                                        border: '1px solid #ccc',
                                        width: '100%',
                                        marginBottom: '15px',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </>
                        )}
                        <label id="emailLabel">
                            Email <input type="email" placeholder="owner@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </label>
                        <br />
                        <label id="passwordLabel">
                            Password <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </label>
                        <br />
                        <button id="loginButton" type="submit" disabled={loading}>
                            {loading ? (isRegister ? 'Registering...' : 'Logging in...') : (isRegister ? 'Register & Continue as Owner' : 'Login')}
                        </button>

                        {!isRegister ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsRegister(true);
                                    setError('');
                                }}
                                style={{
                                    border: '1px solid brown',
                                    background: 'transparent',
                                    color: 'brown',
                                    fontWeight: 'bold',
                                    padding: '10px',
                                    borderRadius: '10px',
                                    width: '80%',
                                    marginLeft: '10%',
                                    marginTop: '12px',
                                    cursor: 'pointer',
                                }}
                            >
                                Register as Owner
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsRegister(false);
                                    setError('');
                                }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#64748b',
                                    textDecoration: 'underline',
                                    width: '100%',
                                    marginTop: '15px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                }}
                            >
                                Already have an account? Sign in here
                            </button>
                        )}

                        {error && <p id="err">{error}</p>}
                    </form>
                </div>
            </div>
        </>
    );
}
