import React, { useState, useEffect } from 'react';
import { api } from '../api';
import InventoryTable from './InventoryTable';

const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const formatDim = (s) => {
    if (!s) return '';
    const str = String(s).trim();
    if (/\s*ft$/i.test(str)) return str;
    return `${str} ft`;
};

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

export default function ManagerPage({ onsignout }) {
    const [tab, setTab] = useState('inventory'); // 'inventory' | 'charts' (FR3) | 'requests' (FR2) | 'workers' (FR8) | 'wastage' (FR6) | 'txns' (FR5)
    const [timber, setTimber] = useState([]);
    const [requests, setRequests] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [txns, setTxns] = useState([]);
    const [wastageList, setWastageList] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [stats, setStats] = useState(null);
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);

    // FR8: Add Worker state
    const [wName, setWName] = useState('');
    const [wEmail, setWEmail] = useState('');
    const [wPhone, setWPhone] = useState('');
    const [wPassword, setWPassword] = useState('');

    // Fetch data from backend
    const loadAll = async () => {
        setLoading(true);
        try {
            const [tData, rData, uData, txData, wData, notifData, dashData] = await Promise.all([
                api.getTimber().catch(() => []),
                api.getRequests().catch(() => []),
                api.getUsers().catch(() => []),
                api.getTransactions().catch(() => []),
                api.getWastage().catch(() => []),
                api.getNotifications().catch(() => []),
                api.getDashboardStats().catch(() => null),
            ]);
            if (Array.isArray(tData)) setTimber(tData);
            if (Array.isArray(rData)) setRequests(rData);
            if (Array.isArray(uData)) setWorkers(uData.filter((u) => u.role === 'worker').sort((a, b) => Number(a.id) - Number(b.id)));
            if (Array.isArray(txData)) setTxns(txData);
            if (Array.isArray(wData)) setWastageList(wData);
            if (Array.isArray(notifData)) setNotifications(notifData);
            if (dashData) setStats(dashData);
        } catch (err) {
            console.error('Error fetching manager data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    // FR2: Manager accepts a worker request (allocate or add)
    const handleAccept = async (reqItem) => {
        setMsg({ text: '', type: '' });
        try {
            await api.acceptRequest(reqItem.id);
            const itemDesc = reqItem.size
                ? `${reqItem.type} (${formatDim(reqItem.size)})`
                : (reqItem.type || 'timber');
            const message = reqItem.kind === 'allocate'
                ? `Allocated ${reqItem.qty} units of ${itemDesc} to ${reqItem.worker_name || 'worker'}.`
                : `Added ${reqItem.qty} units of ${itemDesc} to inventory.`;
            setMsg({ text: message, type: 'success' });
            loadAll();
        } catch (err) {
            setMsg({ text: err.message || 'Failed to accept request', type: 'error' });
        }
    };

    // FR2: Manager rejects a request
    const handleReject = async (reqItemOrId) => {
        setMsg({ text: '', type: '' });
        const isObj = reqItemOrId && typeof reqItemOrId === 'object';
        const reqId = isObj ? reqItemOrId.id : reqItemOrId;
        try {
            await api.rejectRequest(reqId);
            const itemDesc = isObj && reqItemOrId.size
                ? `${reqItemOrId.type} (${formatDim(reqItemOrId.size)})`
                : (isObj && reqItemOrId.type ? reqItemOrId.type : 'timber');
            const message = isObj
                ? `Rejected request for ${reqItemOrId.qty} units of ${itemDesc}.`
                : 'Request rejected.';
            setMsg({ text: message, type: 'success' });
            loadAll();
        } catch (err) {
            setMsg({ text: err.message || 'Failed to reject request', type: 'error' });
        }
    };

    // FR8: Manager adds a worker account
    const handleAddWorker = async (e) => {
        e.preventDefault();
        setMsg({ text: '', type: '' });
        const name = wName.trim();
        const email = wEmail.toLowerCase().trim();
        const password = wPassword.trim();

        if (!name || !email) {
            return setMsg({ text: 'Name and email are required', type: 'error' });
        }
        if (/^\d+$/.test(name) || /^-?\d+$/.test(name) || /[0-9=<>_$%^&*()+!]/.test(name)) {
            return setMsg({ text: 'Name cannot be numbers or symbols. It must be text only (e.g. Ramesh Kumar).', type: 'error' });
        }
        if (!/^[a-zA-Z][a-zA-Z\s\-\.']{1,99}$/.test(name)) {
            return setMsg({ text: 'Name must start with a letter and contain text only (e.g. Ramesh Kumar).', type: 'error' });
        }
        if (!password || password.length < 6) {
            return setMsg({ text: 'Password must be at least 6 characters long', type: 'error' });
        }
        if (wPhone && wPhone.trim()) {
            const rawPhone = wPhone.trim();
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
                name,
                email,
                phone: wPhone.trim() || '+91 9876500000',
                password,
                role: 'worker',
            });
            setMsg({ text: `Worker '${name}' added successfully!`, type: 'success' });
            setWName('');
            setWEmail('');
            setWPhone('');
            setWPassword('');
            const uData = await api.getUsers();
            setWorkers(uData.filter((u) => u.role === 'worker').sort((a, b) => Number(a.id) - Number(b.id)));
        } catch (err) {
            setMsg({ text: err.message || 'Failed to create worker', type: 'error' });
        }
    };

    // FR8: Manager removes a worker account
    const handleRemoveWorker = async (workerId, workerName) => {
        if (!window.confirm(`Are you sure you want to remove worker '${workerName}'?`)) return;
        try {
            await api.deleteUser(workerId, 'worker');
            setMsg({ text: `Worker '${workerName}' removed.`, type: 'success' });
            setWorkers((prev) => prev.filter((w) => w.id !== workerId));
        } catch (err) {
            setMsg({ text: err.message || 'Failed to delete worker', type: 'error' });
        }
    };

    // Low stock items (FR9)
    const low = timber.filter((t) => Number(t.qty ?? t.quantity ?? 0) <= Number(t.min ?? t.min_stock_level ?? 10));
    const pending = requests.filter((r) => String(r.status).toUpperCase() === 'PENDING');

    // Chart calculations for FR3 - group all dimensions of each timber type together into one item
    const rawStockSource = (stats?.stockByType && stats.stockByType.length > 0) ? stats.stockByType : timber;
    const stockItems = consolidateStockByType(rawStockSource);
    const totalQty = stockItems.reduce((acc, s) => acc + Number(s.qty || 0), 0);
    const totalValue = stockItems.reduce((acc, s) => acc + Number(s.value || 0), 0);
    const sortedWorkers = [...workers].sort((a, b) => Number(a.id) - Number(b.id));

    const tabs = [
        ['inventory', 'Timber Stock'],
        ['charts', 'Charts & Analytics'],
        ['requests', `Requests (${pending.length})`],
        ['workers', `Workers (${workers.length})`],
        ['wastage', `Wastage Log (${wastageList.length}) `],
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
                    <span className="opwho" style={{ marginRight: '15px' }}>
                        Logged in as: <strong>Warehouse Manager</strong>
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
                {/* Stats Side Bar */}
                <aside className="opstats">
                    <div className="opstat">
                        <div className="opnum">{timber.length}</div>
                        <div className="oplbl">Timber Types</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum" style={{ color: low.length > 0 ? '#b91c1c' : '#15803d' }}>
                            {low.length}
                        </div>
                        <div className="oplbl">Low Stock Alerts</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum" style={{ color: pending.length > 0 ? '#d97706' : '#1e293b' }}>
                            {pending.length}
                        </div>
                        <div className="oplbl">Pending Requests</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum">{workers.length}</div>
                        <div className="oplbl">Workers</div>
                    </div>
                    <div className="opstat">
                        <div className="opnum" style={{ color: '#dc2626' }}>
                            {wastageList.length}
                        </div>
                        <div className="oplbl">Wastage Logs</div>
                    </div>
                </aside>

                <div className="opcontent">
                    {/* FR9 Low Stock Notification Banner */}
                    {low.length > 0 && (
                        <div className="rpalert" style={{ marginBottom: '15px' }}>
                            <strong>Low Stock Warning:</strong>{' '}
                            {low
                                .map((t) => `${t.type || t.type_name} (${t.qty ?? t.quantity} left, min ${t.min ?? t.min_stock_level ?? 10})`)
                                .join(' • ')}
                        </div>
                    )}

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

                    {/* Timber Inventory Tab */}
                    {tab === 'inventory' && <InventoryTable timber={timber} />}

                    {/* ========================================================================= */}
                    {/* FR3: DASHBOARD DISPLAYING INVENTORY STATISTICS USING CHARTS              */}
                    {/* ========================================================================= */}
                    {tab === 'charts' && (
                        <div className="charts-section">
                            <div className="ophead">
                                <h2>Manager Graphical Analytics & Charts </h2>
                                <button className="rpbtn grey" onClick={loadAll} disabled={loading}>
                                    {loading ? 'Refreshing...' : 'Refresh Charts'}
                                </button>
                            </div>

                            {/* Chart 1: Stock Quantity by Timber Species */}
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
                                    Available Stock Quantity by Timber Species
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {stockItems.length === 0 && <p className="opempty">No stock records found.</p>}
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

                            {/* Chart 2: Inventory Valuation Chart */}
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
                                    Inventory Valuation per Timber Type (₹)
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

                            {/* Chart 3: Requests Distribution */}
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

                    {/* Requests Tab (FR2) */}
                    {tab === 'requests' && (
                        <>
                            <div className="ophead">
                                <h2>Worker Requests</h2>
                            </div>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Worker</th>
                                            <th>Type</th>
                                            <th>Timber Item</th>
                                            <th className="r">Qty</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requests.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="opempty">
                                                    No requests submitted
                                                </td>
                                            </tr>
                                        )}
                                        {requests.map((r) => {
                                            const isPending = String(r.status).toUpperCase() === 'PENDING';
                                            return (
                                                <tr key={r.id}>
                                                    <td>
                                                        <strong>{r.worker_name || r.worker || 'Worker'}</strong>
                                                    </td>
                                                    <td>{r.kind === 'allocate' ? 'Allocation' : 'Add Timber'}</td>
                                                    <td>
                                                        {r.type} {formatDim(r.size)}
                                                    </td>
                                                    <td className="r">{r.qty}</td>
                                                    <td>
                                                        <span className={`rptag ${isPending ? 'warn' : 'ok'}`}>{r.status}</span>
                                                    </td>
                                                    <td>
                                                        {isPending && (
                                                            <>
                                                                <button
                                                                    className="rpbtn"
                                                                    onClick={() => handleAccept(r)}
                                                                    style={{ marginRight: '8px' }}
                                                                >
                                                                    Accept
                                                                </button>
                                                                <button
                                                                    className="rpbtn grey"
                                                                    onClick={() => handleReject(r)}
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Workers Management Tab (FR8) */}
                    {tab === 'workers' && (
                        <>
                            <div className="ophead">
                                <h2>Worker Account Management</h2>
                            </div>
                            <form className="rpform" onSubmit={handleAddWorker} autoComplete="off">
                                <input
                                    type="text"
                                    placeholder="Worker Name"
                                    value={wName}
                                    onChange={(e) => setWName(e.target.value.replace(/[^a-zA-Z\s\-\.']/g, ''))}
                                    required
                                    autoComplete="off"
                                />
                                <input
                                    type="email"
                                    placeholder="Worker Email"
                                    value={wEmail}
                                    onChange={(e) => setWEmail(e.target.value)}
                                    required
                                    autoComplete="off"
                                />
                                <input
                                    type="tel"
                                    placeholder="Phone Number"
                                    value={wPhone}
                                    onChange={(e) => setWPhone(e.target.value)}
                                    autoComplete="off"
                                />
                                <input
                                    type="password"
                                    placeholder="Password (min 6 chars)"
                                    value={wPassword}
                                    onChange={(e) => setWPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                                <button className="rpbtn" type="submit">
                                    Add Worker
                                </button>
                            </form>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Phone</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {workers.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="opempty">
                                                    No workers registered
                                                </td>
                                            </tr>
                                        )}
                                        {sortedWorkers.map((w, index) => (
                                            <tr key={w.id}>
                                                <td>{index + 1}</td>
                                                <td>
                                                    <strong>{w.name}</strong>
                                                </td>
                                                <td>{w.email}</td>
                                                <td>{w.phone || 'N/A'}</td>
                                                <td>
                                                    <button
                                                        className="rpbtn grey"
                                                        style={{ backgroundColor: '#dc2626', color: 'white' }}
                                                        onClick={() => handleRemoveWorker(w.id, w.name)}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ========================================================================= */}
                    {/* FR6: TIMBER WASTAGE LOG (MANAGER VIEW)                                    */}
                    {/* ========================================================================= */}
                    {tab === 'wastage' && (
                        <>
                            <div className="ophead">
                                <h2>Recorded Timber Wastage & Scrap Logs</h2>
                            </div>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Species</th>
                                            <th>Diameter x Length</th>
                                            <th className="r">Wasted (ft)</th>
                                            <th>Reason</th>
                                            <th>Worker</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {wastageList.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="opempty">
                                                    No timber wastage recorded yet
                                                </td>
                                            </tr>
                                        )}
                                        {wastageList.map((w) => (
                                            <tr key={w.id || w.wastage_id}>
                                                <td>{w.date ? String(w.date).slice(0, 10) : 'Recent'}</td>
                                                <td>
                                                    <strong>{w.type || w.type_name}</strong>
                                                </td>
                                                <td>{formatDim(w.size) || 'Standard'}</td>
                                                <td className="r" style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                                    -{w.qty ?? w.quantity} ft
                                                </td>
                                                <td>{w.reason}</td>
                                                <td>{w.worker_name || 'Worker'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Transaction History Tab (FR5) */}
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
                                            <th>Action</th>
                                            <th>Timber</th>
                                            <th className="r">Qty</th>
                                            <th>By</th>
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
                                                <td>{t.date ? String(t.date).slice(0, 10) : 'Recent'}</td>
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
