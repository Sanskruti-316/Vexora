import React, { useState, useEffect } from 'react';
import { api } from '../api';
import InventoryTable from './InventoryTable';

const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const consolidateStockByType = (items = []) => {
    const map = new Map();
    for (const item of items) {
        const rawType = String(item.type || item.type_name || 'Timber').trim();
        const normalizedType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
        const existing = map.get(normalizedType) || { type: normalizedType, qty: 0, value: 0 };
        const q = Number(item.qty ?? item.quantity ?? 0);
        const v = item.value != null ? Number(item.value) : (q * Number(item.price || 0));
        existing.qty += q;
        existing.value += v;
        map.set(normalizedType, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.type.localeCompare(b.type));
};

export default function OwnerPage({ onsignout }) {
    const [tab, setTab] = useState('analytics'); // 'analytics' | 'inventory' | 'users' | 'txns'
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [timber, setTimber] = useState([]);
    const [txns, setTxns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    // FR7: Add User Form state
    const [uName, setUName] = useState('');
    const [uEmail, setUEmail] = useState('');
    const [uPhone, setUPhone] = useState('');
    const [uWarehouse, setUWarehouse] = useState('');
    const [uPassword, setUPassword] = useState('');
    const [uRole, setURole] = useState('manager'); // 'manager' | 'worker'

    // Load initial data
    const loadAllData = async () => {
        setLoading(true);
        try {
            const [dashData, usersData, timberData, txnData] = await Promise.all([
                api.getDashboardStats().catch(() => null),
                api.getUsers().catch(() => []),
                api.getTimber().catch(() => []),
                api.getTransactions().catch(() => []),
            ]);
            if (dashData) setStats(dashData);
            if (Array.isArray(usersData)) setUsers(usersData);
            if (Array.isArray(timberData)) setTimber(timberData);
            if (Array.isArray(txnData)) setTxns(txnData);
        } catch (err) {
            console.error('Error loading owner data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllData();
    }, []);

    // FR7: Owner creates a manager or worker account
    const handleAddUser = async (e) => {
        e.preventDefault();
        setMsg({ text: '', type: '' });

        const cleanName = uName.trim();
        if (!cleanName || !uEmail.trim() || !uPassword.trim()) {
            return setMsg({ text: 'Name, email, and password are required', type: 'error' });
        }
        if (/^\d+$/.test(cleanName) || /^-?\d+$/.test(cleanName) || /[0-9=<>_$%^&*()+!]/.test(cleanName)) {
            return setMsg({ text: 'Name cannot be numbers or symbols. It must be text only (e.g. Ramesh Kumar).', type: 'error' });
        }
        if (!/^[a-zA-Z][a-zA-Z\s\-\.']{1,99}$/.test(cleanName)) {
            return setMsg({ text: 'Name must start with a letter and contain text only (e.g. Ramesh Kumar).', type: 'error' });
        }

        if (uRole === 'manager') {
            const cleanWh = uWarehouse.trim();
            if (!cleanWh) {
                return setMsg({ text: 'Warehouse name that the manager belongs to is required', type: 'error' });
            }
            if (/^\d+$/.test(cleanWh) || /^-?\d+$/.test(cleanWh) || /[0-9=<>_$%^&*()+!]/.test(cleanWh)) {
                return setMsg({ text: 'Warehouse name cannot be numbers or symbols. It must be text only (e.g. Gokul Road, Central Yard).', type: 'error' });
            }
            if (!/^[a-zA-Z][a-zA-Z\s\-\.]{1,99}$/.test(cleanWh)) {
                return setMsg({ text: 'Warehouse name must start with a letter and contain text only (e.g. Gokul Road, Central Yard).', type: 'error' });
            }
        }
        if (uPassword.length < 6) {
            return setMsg({ text: 'Password must be at least 6 characters', type: 'error' });
        }
        if (uPhone && uPhone.trim()) {
            const rawPhone = uPhone.trim();
            if (/^-/.test(rawPhone) || (rawPhone.includes("-") && !/^\+?\d+[\-\s]?\d+$/.test(rawPhone))) {
                return setMsg({ text: 'Phone number cannot be negative or contain invalid characters', type: 'error' });
            }
            const cleanedPhone = rawPhone.replace(/[\s\-\(\)]/g, "");
            if (!/^\+?[1-9]\d{9,14}$/.test(cleanedPhone)) {
                return setMsg({ text: 'Invalid phone number. Must be a valid 10 to 15 digit number (e.g. +91 9876543210)', type: 'error' });
            }
        }

        try {
            await api.createUser({
                name: uName.trim(),
                email: uEmail.trim(),
                phone: uPhone.trim() || '+91 9999900000',
                password: uPassword,
                role: uRole,
                warehouse: uWarehouse.trim(),
                address: uWarehouse.trim(),
            });
            setMsg({ text: `${uRole.toUpperCase()} account created successfully!`, type: 'success' });
            setUName('');
            setUEmail('');
            setUPhone('');
            setUWarehouse('');
            setUPassword('');
            const updatedUsers = await api.getUsers();
            setUsers(updatedUsers);
        } catch (err) {
            setMsg({ text: err.message || 'Failed to create user', type: 'error' });
        }
    };

    // FR7: Owner deletes a manager or worker account
    const handleDeleteUser = async (userId, userName, role) => {
        if (!window.confirm(`Are you sure you want to delete ${role} '${userName}'?`)) return;
        try {
            await api.deleteUser(userId, role);
            setMsg({ text: `Removed ${role} '${userName}' successfully.`, type: 'success' });
            setUsers((prev) => prev.filter((u) => !(u.id === userId && u.role === role)));
        } catch (err) {
            setMsg({ text: err.message || 'Failed to delete user', type: 'error' });
        }
    };

    const managers = users.filter((u) => u.role === 'manager').sort((a, b) => Number(a.id) - Number(b.id));
    const workers = users.filter((u) => u.role === 'worker').sort((a, b) => Number(a.id) - Number(b.id));

    // Chart calculations for FR3 - group all dimensions of each timber type together into one item
    const rawStockSource = (stats?.stockByType && stats.stockByType.length > 0) ? stats.stockByType : timber;
    const stockItems = consolidateStockByType(rawStockSource);
    const totalQty = stockItems.reduce((acc, s) => acc + Number(s.qty || 0), 0);
    const totalValue = stockItems.reduce((acc, s) => acc + Number(s.value || 0), 0);

    const tabs = [
        ['analytics', 'Charts & Analytics'],
        ['inventory', 'Timber Stock'],
        ['users', 'Manage Accounts'],
        ['txns', 'Transactions'],
    ];

    return (
        <div className="op">
            <header id="head">
                <div id="two">
                    <div id="symbol">DT</div>
                    <div id="name1">
                        <div id="name3">Durga </div>
                        <div id="name2">Timbers</div>
                    </div>
                </div>
                <div className="opright">
                    <span className="opwho" style={{ marginRight: '15px', color: '#555' }}>
                        Logged in as: <strong>Owner</strong>
                    </span>
                    <button
                        className="opbtn"
                        style={{ color: 'white', backgroundColor: '#8a1f1f', cursor: 'pointer', fontWeight: 'bold' }}
                        onClick={onsignout}
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="opmain">
                {/* Real-time KPI Statistics Bar */}
                <aside className="opstats">
                    <div className="opstat">
                        <div className="opnum">{stats?.totals?.types ?? timber.length}</div>
                        <div className="oplbl">Timber Types</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum">{stats?.totals?.units ?? timber.reduce((a, b) => a + Number(b.qty || 0), 0)}</div>
                        <div className="oplbl">Units in Stock</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum" style={{ fontSize: '1.25rem' }}>
                            {rupees(stats?.totals?.value ?? timber.reduce((a, b) => a + (Number(b.qty || 0) * Number(b.price || 0)), 0))}
                        </div>
                        <div className="oplbl">Total Valuation</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum" style={{ color: (stats?.totals?.low ?? 0) > 0 ? '#b91c1c' : '#15803d' }}>
                            {stats?.totals?.low ?? 0}
                        </div>
                        <div className="oplbl">Low Stock Types</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum">{managers.length}</div>
                        <div className="oplbl">Managers</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum">{workers.length}</div>
                        <div className="oplbl">Workers</div>
                    </div>
                </aside>

                <div className="opcontent">
                    {/* Navigation Tabs */}
                    <div className="rptabs" style={{ marginBottom: '20px' }}>
                        {tabs.map(([k, label]) => (
                            <button
                                key={k}
                                className={tab === k ? 'on' : ''}
                                onClick={() => {
                                    setTab(k);
                                    setMsg({ text: '', type: '' });
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {msg.text && (
                        <div
                            className="rpmsg"
                            style={{
                                padding: '12px',
                                borderRadius: '6px',
                                marginBottom: '15px',
                                backgroundColor: msg.type === 'error' ? '#fee2e2' : '#dcfce7',
                                color: msg.type === 'error' ? '#991b1b' : '#166534',
                                border: `1px solid ${msg.type === 'error' ? '#f87171' : '#86efac'}`,
                            }}
                        >
                            {msg.text}
                        </div>
                    )}

                    {/* FR3: DASHBOARD DISPLAYING INVENTORY STATISTICS USING CHARTS */}
                    {tab === 'analytics' && (
                        <div className="analytics-section">
                            <div className="ophead">
                                <h2>Inventory Statistics & Graphical Visualizations</h2>
                                <button className="rpbtn grey" onClick={loadAllData} disabled={loading}>
                                    {loading ? 'Refreshing...' : 'Refresh Data'}
                                </button>
                            </div>

                            {/* Chart 1: Stock Quantity Distribution by Timber Type */}
                            <div
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '20px',
                                    marginBottom: '25px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>
                                    Stock Volume by Timber Type (Quantity in CFT)
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {stockItems.length === 0 && <p className="opempty">No timber stock recorded yet.</p>}
                                    {stockItems.map((item) => {
                                        const pct = totalQty > 0 ? Math.round((Number(item.qty || 0) / totalQty) * 100) : 0;
                                        return (
                                            <div key={item.type}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                                                    <span style={{ fontWeight: '600', color: '#334155' }}>{item.type}</span>
                                                    <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{item.qty} units</span>
                                                </div>
                                                <div style={{ width: '100%', backgroundColor: '#f1f5f9', borderRadius: '6px', height: '22px', overflow: 'hidden' }}>
                                                    <div
                                                        style={{
                                                            width: `${Math.max(pct, 4)}%`,
                                                            height: '100%',
                                                            backgroundColor: '#8a1f1f',
                                                            borderRadius: '6px',
                                                            transition: 'width 0.6s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'flex-end',
                                                            paddingRight: '8px',
                                                            color: 'white',
                                                            fontSize: '11px',
                                                            fontWeight: 'bold',
                                                        }}
                                                    >
                                                        {pct}%
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Chart 2: Inventory Value Distribution by Species */}
                            <div
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '20px',
                                    marginBottom: '25px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>
                                    Stock Valuation Distribution (Investment per Species in Rupees)
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {stockItems.map((item) => {
                                        const pctVal = totalValue > 0 ? Math.round((Number(item.value || 0) / totalValue) * 100) : 0;
                                        return (
                                            <div key={item.type}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                                                    <span style={{ fontWeight: '600', color: '#334155' }}>{item.type}</span>
                                                    <span style={{ fontWeight: 'bold', color: '#15803d' }}>{rupees(item.value)}</span>
                                                </div>
                                                <div style={{ width: '100%', backgroundColor: '#f1f5f9', borderRadius: '6px', height: '22px', overflow: 'hidden' }}>
                                                    <div
                                                        style={{
                                                            width: `${Math.max(pctVal, 4)}%`,
                                                            height: '100%',
                                                            backgroundColor: '#047857',
                                                            borderRadius: '6px',
                                                            transition: 'width 0.6s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'flex-end',
                                                            paddingRight: '8px',
                                                            color: 'white',
                                                            fontSize: '11px',
                                                            fontWeight: 'bold',
                                                        }}
                                                    >
                                                        {pctVal}%
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Chart 3: Request Status Graphical Breakdown */}
                            <div
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '20px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>
                                    Request Status Graphical Representation
                                </h3>
                                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                    {(stats?.requestsByStatus || []).map((r) => {
                                        const isPending = r.status.toUpperCase() === 'PENDING';
                                        const isApproved = ['APPROVED', 'ACCEPTED'].includes(r.status.toUpperCase());
                                        const color = isPending ? '#d97706' : isApproved ? '#16a34a' : '#dc2626';
                                        const bg = isPending ? '#fef3c7' : isApproved ? '#dcfce7' : '#fee2e2';
                                        return (
                                            <div
                                                key={r.status}
                                                style={{
                                                    flex: '1 1 200px',
                                                    padding: '16px',
                                                    backgroundColor: bg,
                                                    border: `1px solid ${color}`,
                                                    borderRadius: '8px',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{r.count}</div>
                                                <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>{r.status} Requests</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Timber Stock Tab */}
                    {tab === 'inventory' && <InventoryTable timber={timber} />}

                    {/* FR7: THE SYSTEM SHALL ALLOW THE OWNER TO ADD AND DELETE ACCOUNTS */}
                    {tab === 'users' && (
                        <div className="users-management-section">
                            <div className="ophead">
                                <h2>Account Management</h2>
                            </div>

                            {/* Add Account Form */}
                            <div
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '24px',
                                    marginBottom: '30px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 20px 0', color: '#1e293b', fontSize: '18px', fontWeight: '700' }}>
                                    Add Manager or Worker Account
                                </h3>
                                <form
                                    onSubmit={handleAddUser}
                                    autoComplete="off"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                        columnGap: '20px',
                                        rowGap: '22px',
                                        alignItems: 'start',
                                    }}
                                >
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                            Role
                                        </label>
                                        <select
                                            value={uRole}
                                            onChange={(e) => setURole(e.target.value)}
                                            style={{
                                                width: '100%',
                                                height: '42px',
                                                padding: '0 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '14px',
                                                boxSizing: 'border-box',
                                                backgroundColor: '#fff',
                                                color: '#1e293b',
                                                outline: 'none',
                                            }}
                                        >
                                            <option value="manager">Warehouse Manager</option>
                                            <option value="worker">Mill Worker</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Ramesh K"
                                            value={uName}
                                            onChange={(e) => setUName(e.target.value.replace(/[^a-zA-Z\s\-\.']/g, ''))}
                                            required
                                            autoComplete="off"
                                            style={{
                                                width: '100%',
                                                height: '42px',
                                                padding: '0 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '14px',
                                                boxSizing: 'border-box',
                                                color: '#1e293b',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                    {uRole === 'manager' ? (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                                Belonging Warehouse
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Warehouse A, Central Yard"
                                                value={uWarehouse}
                                                onChange={(e) => setUWarehouse(e.target.value.replace(/[^a-zA-Z\s\-\.]/g, ''))}
                                                required
                                                autoComplete="off"
                                                style={{
                                                    width: '100%',
                                                    height: '42px',
                                                    padding: '0 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '14px',
                                                    boxSizing: 'border-box',
                                                    color: '#1e293b',
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                                Phone Number
                                            </label>
                                            <input
                                                type="tel"
                                                placeholder="+91 9876543210"
                                                value={uPhone}
                                                onChange={(e) => setUPhone(e.target.value)}
                                                autoComplete="off"
                                                style={{
                                                    width: '100%',
                                                    height: '42px',
                                                    padding: '0 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '14px',
                                                    boxSizing: 'border-box',
                                                    color: '#1e293b',
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            placeholder="ramesh@example.com"
                                            value={uEmail}
                                            onChange={(e) => setUEmail(e.target.value)}
                                            required
                                            autoComplete="off"
                                            style={{
                                                width: '100%',
                                                height: '42px',
                                                padding: '0 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '14px',
                                                boxSizing: 'border-box',
                                                color: '#1e293b',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                    {uRole === 'manager' && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                                Phone Number
                                            </label>
                                            <input
                                                type="tel"
                                                placeholder="+91 9876543210"
                                                value={uPhone}
                                                onChange={(e) => setUPhone(e.target.value)}
                                                autoComplete="off"
                                                style={{
                                                    width: '100%',
                                                    height: '42px',
                                                    padding: '0 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '14px',
                                                    boxSizing: 'border-box',
                                                    color: '#1e293b',
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div style={{ gridColumn: uRole === 'worker' ? 'span 2' : 'span 1' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', height: '18px', lineHeight: '18px', marginBottom: '8px', color: '#334155' }}>
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            placeholder="Min. 6 characters"
                                            value={uPassword}
                                            onChange={(e) => setUPassword(e.target.value)}
                                            required
                                            autoComplete="new-password"
                                            style={{
                                                width: '100%',
                                                height: '42px',
                                                padding: '0 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '14px',
                                                boxSizing: 'border-box',
                                                color: '#1e293b',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            gridColumn: '1 / -1',
                                            display: 'flex',
                                            justifyContent: 'flex-end',
                                            alignItems: 'center',
                                            paddingTop: '20px',
                                            marginTop: '6px',
                                            borderTop: '1px solid #f1f5f9',
                                        }}
                                    >
                                        <button
                                            className="rpbtn"
                                            type="submit"
                                            style={{
                                                height: '42px',
                                                padding: '0 32px',
                                                backgroundColor: '#8a1f1f',
                                                color: '#ffffff',
                                                fontWeight: '600',
                                                fontSize: '14px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                            }}
                                        >
                                            Create Account
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Managers Table with Delete Action */}
                            <div className="ophead" style={{ marginTop: '20px' }}>
                                <h3>Warehouse Managers ({managers.length})</h3>
                            </div>
                            <div className="opscroll" style={{ marginBottom: '30px' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Belonging Warehouse</th>
                                            <th>Email</th>
                                            <th>Phone</th>
                                            <th>Role</th>
                                            <th style={{ textAlign: 'center' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {managers.length === 0 && (
                                            <tr>
                                                <td colSpan="7" className="opempty">
                                                    No managers found
                                                </td>
                                            </tr>
                                        )}
                                        {managers.map((m, index) => (
                                            <tr key={m.id}>
                                                <td>{index + 1}</td>
                                                <td>
                                                    <strong>{m.name}</strong>
                                                </td>
                                                <td>
                                                    <span style={{ fontWeight: '600', color: '#1e3a8a' }}>{m.warehouse || m.address || 'Standard Warehouse'}</span>
                                                </td>
                                                <td>{m.email}</td>
                                                <td>{m.phone || 'N/A'}</td>
                                                <td>
                                                    <span className="rptag ok">Manager</span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        className="rpbtn grey"
                                                        style={{ backgroundColor: '#dc2626', color: 'white', padding: '4px 10px' }}
                                                        onClick={() => handleDeleteUser(m.id, m.name, 'manager')}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Workers Table with Delete Action */}
                            <div className="ophead">
                                <h3>Mill Workers ({workers.length})</h3>
                            </div>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Phone</th>
                                            <th>Role</th>
                                            <th style={{ textAlign: 'center' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {workers.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="opempty">
                                                    No workers found
                                                </td>
                                            </tr>
                                        )}
                                        {workers.map((w, index) => (
                                            <tr key={w.id}>
                                                <td>{index + 1}</td>
                                                <td>
                                                    <strong>{w.name}</strong>
                                                </td>
                                                <td>{w.email}</td>
                                                <td>{w.phone || 'N/A'}</td>
                                                <td>
                                                    <span className="rptag warn">Worker</span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        className="rpbtn grey"
                                                        style={{ backgroundColor: '#dc2626', color: 'white', padding: '4px 10px' }}
                                                        onClick={() => handleDeleteUser(w.id, w.name, 'worker')}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Transactions History Tab */}
                    {tab === 'txns' && (
                        <>
                            <div className="ophead">
                                <h2>Transaction History</h2>
                            </div>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Action / Kind</th>
                                            <th>Timber Type</th>
                                            <th className="r">Qty</th>
                                            <th>Performed By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {txns.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="opempty">
                                                    No transactions recorded
                                                </td>
                                            </tr>
                                        )}
                                        {txns.map((t) => (
                                            <tr key={t.id}>
                                                <td>{t.date ? String(t.date).slice(0, 10) : 'N/A'}</td>
                                                <td>{t.kind}</td>
                                                <td>{t.type}</td>
                                                <td className="r">{t.qty}</td>
                                                <td>{t.by}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
