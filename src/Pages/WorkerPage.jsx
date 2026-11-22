import React, { useState } from 'react';
import './OwnerPage.css';
import './RolePages.css';
import InventoryTable from './InventoryTable';

export default function WorkerPage({ onsignout, store, name }) {
    const { timber, setTimber, requests, setRequests, setTxns } = store;
    const [tab, setTab] = useState('inventory');
    const [msg, setMsg] = useState('');

    const [aId, setAId] = useState('');
    const [aQty, setAQty] = useState('');
    const [nType, setNType] = useState('');
    const [nSize, setNSize] = useState('');
    const [nQty, setNQty] = useState('');
    const [nPrice, setNPrice] = useState('');
    const [wId, setWId] = useState('');
    const [wQty, setWQty] = useState('');
    const [wWhy, setWWhy] = useState('');

    const today = new Date().toISOString().slice(0, 10);
    const mine = requests.filter((r) => r.worker === name);

    const stats = [
        { label: 'Timber types', value: timber.length },
        { label: 'My requests', value: mine.length },
        { label: 'Pending', value: mine.filter((r) => r.status === 'Pending').length },
        { label: 'Accepted', value: mine.filter((r) => r.status === 'Accepted').length },
    ];

    const newReq = (r) => setRequests((p) => [{ id: Date.now(), worker: name, status: 'Pending', ...r }, ...p]);

    const sendAllocation = (e) => {
        e.preventDefault();
        const t = timber.find((x) => x.id === Number(aId));
        const qty = Number(aQty);
        if (!t || qty <= 0) return setMsg('Select timber and enter a valid quantity');
        if (qty > t.qty) return setMsg('Only ' + t.qty + ' available');
        newReq({ kind: 'allocate', timberId: t.id, type: t.type, size: t.size, qty });
        setAId(''); setAQty(''); setMsg('Allocation request sent');
    };

    const sendAdd = (e) => {
        e.preventDefault();
        const qty = Number(nQty);
        const price = Number(nPrice);
        if (!nType.trim() || !nSize.trim() || qty <= 0 || price <= 0) return setMsg('Fill all fields with valid values');
        newReq({ kind: 'add', type: nType.trim(), size: nSize.trim(), qty, price });
        setNType(''); setNSize(''); setNQty(''); setNPrice(''); setMsg('Add timber request sent');
    };

    const recordWastage = (e) => {
        e.preventDefault();
        const t = timber.find((x) => x.id === Number(wId));
        const qty = Number(wQty);
        if (!t || qty <= 0) return setMsg('Select timber and enter a valid quantity');
        if (qty > t.qty) return setMsg('Wastage cannot be more than stock (' + t.qty + ')');
        setTimber((p) => p.map((x) => (x.id === t.id ? { ...x, qty: x.qty - qty } : x)));
        setTxns((p) => [{ id: Date.now(), date: today, kind: 'Wastage' + (wWhy ? ' - ' + wWhy : ''), type: t.type, qty, by: name }, ...p]);
        setWId(''); setWQty(''); setWWhy(''); setMsg('Wastage recorded');
    };

    const tabs = [['inventory', 'Inventory'], ['requests', 'Requests']];

    return (
        <div className="op">
            <header id="head">
                <div id="two">
                    <div id="symbol">DT</div>
                    <div id="name1"><div id="name3">Durga </div><div id="name2">Timbers</div></div>
                </div>
                <div className="op-right">
                    <span className="op-who">{name}</span>
                    <button className="op-btn" onClick={onsignout}>Sign Out</button>
                </div>
            </header>

            <main className="op-main">
                <aside className="op-stats">
                    {stats.map((s) => (
                        <div className="op-stat" key={s.label}>
                            <div className="op-num">{s.value}</div>
                            <div className="op-lbl">{s.label}</div>
                        </div>
                    ))}
                </aside>

                <div className="op-content">
                    <div className="rp-tabs">
                        {tabs.map(([k, label]) => (
                            <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsg(''); }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {msg && <p className="rp-msg">{msg}</p>}

                    {tab === 'inventory' && <InventoryTable timber={timber} />}

                    {tab === 'requests' && (
                        <>
                            <form className="rp-form" onSubmit={sendAllocation}>
                                <h3>Request Allocation</h3>
                                <select value={aId} onChange={(e) => setAId(e.target.value)}>
                                    <option value="">Select timber</option>
                                    {timber.map((t) => (
                                        <option key={t.id} value={t.id}>{t.type} {t.size} ({t.qty})</option>
                                    ))}
                                </select>
                                <input type="number" placeholder="Qty" value={aQty} onChange={(e) => setAQty(e.target.value)} />
                                <button className="rp-btn" type="submit">Send</button>
                            </form>

                            <form className="rp-form" onSubmit={sendAdd}>
                                <h3>Request Add Timber</h3>
                                <input type="text" placeholder="Type" value={nType} onChange={(e) => setNType(e.target.value)} />
                                <input type="text" placeholder="Size" value={nSize} onChange={(e) => setNSize(e.target.value)} />
                                <input type="number" placeholder="Qty" value={nQty} onChange={(e) => setNQty(e.target.value)} />
                                <input type="number" placeholder="Price" value={nPrice} onChange={(e) => setNPrice(e.target.value)} />
                                <button className="rp-btn" type="submit">Send</button>
                            </form>

                            <div className="op-head"><h2>My Requests</h2></div>
                            <div className="op-scroll">
                                <table>
                                    <thead>
                                        <tr><th>Type</th><th>Timber</th><th className="r">Qty</th><th>Status</th></tr>
                                    </thead>
                                    <tbody>
                                        {mine.length === 0 && (
                                            <tr><td colSpan="4" className="op-empty">No requests yet</td></tr>
                                        )}
                                        {mine.map((r) => (
                                            <tr key={r.id}>
                                                <td>{r.kind === 'allocate' ? 'Allocation' : 'Add timber'}</td>
                                                <td>{r.type} {r.size}</td>
                                                <td className="r">{r.qty}</td>
                                                <td>{r.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {tab === 'wastage' && (
                        <form className="rp-form" onSubmit={recordWastage}>
                            <h3>Record Wastage</h3>
                            <select value={wId} onChange={(e) => setWId(e.target.value)}>
                                <option value="">Select timber</option>
                                {timber.map((t) => (
                                    <option key={t.id} value={t.id}>{t.type} {t.size} ({t.qty})</option>
                                ))}
                            </select>
                            <input type="number" placeholder="Qty" value={wQty} onChange={(e) => setWQty(e.target.value)} />
                            <input type="text" placeholder="Reason" value={wWhy} onChange={(e) => setWWhy(e.target.value)} />
                            <button className="rp-btn" type="submit">Record</button>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}