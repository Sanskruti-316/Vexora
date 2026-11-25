import React, { useState, useEffect } from 'react';
import { api } from '../api';
import InventoryTable from './InventoryTable';

export default function WorkerPage({ onsignout, name = 'Worker' }) {
    const [tab, setTab] = useState('inventory'); // 'inventory' | 'requests' | 'wastage' (FR6)
    const [timber, setTimber] = useState([]);
    const [requests, setRequests] = useState([]);
    const [myAllocations, setMyAllocations] = useState([]);
    const [wastageList, setWastageList] = useState([]);
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);

    // Request forms state
    const [aId, setAId] = useState('');
    const [aQty, setAQty] = useState('');
    const [nType, setNType] = useState('');
    const [nSize, setNSize] = useState('');
    const [nQty, setNQty] = useState('');
    const [nPrice, setNPrice] = useState('');

    // FR6: Wastage form state (based on what the worker was allocated)
    const [selectedAllocId, setSelectedAllocId] = useState('');
    const [wQty, setWQty] = useState('');
    const [wWhy, setWWhy] = useState('');
    const [submittingWastage, setSubmittingWastage] = useState(false);
    const [submittingReq, setSubmittingReq] = useState(false);

    // Load data from live backend
    const loadData = async () => {
        setLoading(true);
        try {
            const [tData, rData, wData, allocData] = await Promise.all([
                api.getTimber().catch(() => []),
                api.getRequests().catch(() => []),
                api.getWastage().catch(() => []),
                api.getMyAllocations().catch(() => []),
            ]);
            if (Array.isArray(tData)) setTimber(tData);
            if (Array.isArray(rData)) setRequests(rData);
            if (Array.isArray(wData)) setWastageList(wData);
            if (Array.isArray(allocData)) setMyAllocations(allocData);
        } catch (err) {
            console.error('Error loading worker data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // FR2: Worker sends allocation request
    const sendAllocation = async (e) => {
        e.preventDefault();
        if (submittingReq) return;
        setMsg({ text: '', type: '' });
        const t = timber.find((x) => String(x.id || x.timber_id) === String(aId));
        const qty = Number(aQty);

        if (!t || qty <= 0) {
            return setMsg({ text: 'Select a timber item and enter a valid quantity', type: 'error' });
        }
        const availableQty = Number(t.qty ?? t.quantity ?? 0);
        if (qty > availableQty) {
            return setMsg({ text: `Requested quantity (${qty}) exceeds available stock (${availableQty})`, type: 'error' });
        }

        setSubmittingReq(true);
        try {
            await api.requestAllocation(t.id || t.timber_id, qty);
            setMsg({
                text: `Allocation request for ${qty} units of ${t.type || t.type_name} submitted successfully!`,
                type: 'success',
            });
            setAId('');
            setAQty('');
            const rData = await api.getRequests();
            setRequests(rData);
        } catch (err) {
            setMsg({ text: err.message || 'Failed to submit allocation request', type: 'error' });
        } finally {
            setSubmittingReq(false);
        }
    };

    // FR2: Worker sends add timber request
    const sendAdd = async (e) => {
        e.preventDefault();
        if (submittingReq) return;
        setMsg({ text: '', type: '' });

        const cleanType = nType.trim();
        if (!cleanType) {
            return setMsg({ text: 'Timber species name is required', type: 'error' });
        }
        if (/^\d+$/.test(cleanType)) {
            return setMsg({ text: 'Timber species cannot be numeric. Enter a valid wood name (e.g. Teak, Rosewood, Pine, Oak, Cedar)', type: 'error' });
        }
        if (!/^[a-zA-Z][a-zA-Z0-9\s\-]{1,49}$/.test(cleanType)) {
            return setMsg({ text: 'Timber species must start with a letter and be at least 2 characters (e.g. Teak, Rosewood)', type: 'error' });
        }

        const sizeMatch = nSize.trim().match(/^(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*(?:ft|in|m)?)?$/);
        if (!sizeMatch) {
            return setMsg({ text: 'Dimensions must be formatted as positive Diameter x Length (e.g. 4x10 or 12x32)', type: 'error' });
        }
        const diam = parseFloat(sizeMatch[1]);
        const len = parseFloat(sizeMatch[2]);
        if (isNaN(diam) || isNaN(len) || diam <= 0 || len <= 0) {
            return setMsg({ text: 'Dimensions must be positive numbers greater than 0', type: 'error' });
        }

        const qty = parseInt(nQty, 10);
        const price = parseFloat(nPrice);
        if (isNaN(qty) || qty <= 0) {
            return setMsg({ text: 'Quantity must be a positive integer greater than 0', type: 'error' });
        }
        if (isNaN(price) || price <= 0) {
            return setMsg({ text: 'Unit price must be greater than 0', type: 'error' });
        }

        setSubmittingReq(true);
        try {
            await api.requestAddTimber({ type: cleanType, size: `${diam}x${len}`, qty, price });
            setMsg({ text: `Request to add ${qty} units of ${cleanType} (${diam}x${len}) submitted!`, type: 'success' });
            setNType('');
            setNSize('');
            setNQty('');
            setNPrice('');
            const rData = await api.getRequests();
            setRequests(rData);
        } catch (err) {
            setMsg({ text: err.message || 'Failed to submit add request', type: 'error' });
        } finally {
            setSubmittingReq(false);
        }
    };

    // =========================================================================
    // FR6: WORKER RECORDS WASTAGE FOR TIMBER ALLOCATED TO THEM
    // =========================================================================
    const selectedAllocation = myAllocations.find(
        (a) => String(a.allocation_id || a.id) === String(selectedAllocId)
    );

    const handleRecordWastage = async (e) => {
        e.preventDefault();
        setMsg({ text: '', type: '' });

        if (!selectedAllocation) {
            return setMsg({ text: 'Please select which allocated timber you are logging wastage for', type: 'error' });
        }

        const qty = parseFloat(wQty);
        const reason = wWhy.trim();

        if (Number(selectedAllocation.wasted_qty || 0) > 0) {
            return setMsg({
                text: `Wastage has already been recorded for this allocated wood (Allocation #${selectedAllocation.allocation_id || selectedAllocation.id}). A worker cannot allot wastage for a certain wood more than once.`,
                type: 'error',
            });
        }

        if (isNaN(qty) || qty <= 0) {
            return setMsg({ text: 'Wastage quantity must be greater than zero', type: 'error' });
        }
        if (qty > selectedAllocation.remaining_qty) {
            return setMsg({
                text: `Recorded wastage (${qty} ft) exceeds remaining allocated timber (${selectedAllocation.remaining_qty} ft available)`,
                type: 'error',
            });
        }

        setSubmittingWastage(true);
        try {
            await api.recordWastage({
                allocation_id: selectedAllocation.allocation_id || selectedAllocation.id,
                timber_id: selectedAllocation.timber_id,
                qty,
                reason: reason || 'Defects / Cutting Loss',
            });
            setMsg({
                text: `Successfully accounted for ${qty} ft of wastage for Allocation #${selectedAllocation.allocation_id || selectedAllocation.id} (${selectedAllocation.type})!`,
                type: 'success',
            });
            setSelectedAllocId('');
            setWQty('');
            setWWhy('');

            // Reload allocations, stock, and wastage history
            const [tData, wData, allocData] = await Promise.all([
                api.getTimber(),
                api.getWastage(),
                api.getMyAllocations(),
            ]);
            setTimber(tData);
            setWastageList(wData);
            setMyAllocations(allocData);
        } catch (err) {
            setMsg({ text: err.message || 'Failed to record timber wastage', type: 'error' });
        } finally {
            setSubmittingWastage(false);
        }
    };

    const stats = [
        { label: 'Timber in Mill', value: timber.length },
        { label: 'Allocated Batches', value: myAllocations.length },
        { label: 'Usable Units Held', value: myAllocations.reduce((a, b) => a + Number(b.remaining_qty || 0), 0) },
        { label: 'Wastage Logged', value: wastageList.length },
    ];

    const tabs = [
        ['inventory', 'Timber Stock'],
        ['requests', 'Submit Requests '],
        ['wastage', 'Record Wastage '],
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
                        Worker: <strong>{name}</strong>
                    </span>
                    <button className="opbtn" onClick={onsignout}>
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="opmain">
                <aside className="opstats">
                    {stats.map((s) => (
                        <div className="opstat" key={s.label}>
                            <div className="opnum">{s.value}</div>
                            <div className="oplbl">{s.label}</div>
                        </div>
                    ))}
                </aside>

                <div className="opcontent">
                    {/* Navigation Tabs including FR6 Record Wastage */}
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

                    {/* Inventory Tab */}
                    {tab === 'inventory' && <InventoryTable timber={timber} />}

                    {/* Requests Tab (FR2) */}
                    {tab === 'requests' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                                {/* Allocation Request Form */}
                                <form className="rpform" onSubmit={sendAllocation} style={{ margin: 0 }}>
                                    <h3>Request Stored Timber Allocation</h3>
                                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                        Request timber pieces from storage for assigned mill tasks. Once approved by the manager, you can log wastage for it.
                                    </p>
                                    <select value={aId} onChange={(e) => setAId(e.target.value)} required>
                                        <option value="">Select timber in stock</option>
                                        {timber.map((t) => (
                                            <option key={t.id || t.timber_id} value={t.id || t.timber_id}>
                                                {t.type || t.type_name} ({t.size}) : Available: {t.qty ?? t.quantity}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        placeholder="Quantity needed "
                                        value={aQty}
                                        onChange={(e) => setAQty(e.target.value)}
                                        min="1"
                                        required
                                    />
                                    <button className="rpbtn" type="submit" disabled={submittingReq}>
                                        {submittingReq ? 'Submitting...' : 'Send Allocation Request'}
                                    </button>
                                </form>

                                {/* Add Timber Request Form */}
                                <form className="rpform" onSubmit={sendAdd} style={{ margin: 0 }} autoComplete="off">
                                    <h3>Request Add New Timber Stock</h3>
                                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                        Notify manager of newly arrived timber stock to be added to inventory.
                                    </p>
                                    <input
                                        type="text"
                                        placeholder="Species / Type "
                                        value={nType}
                                        onChange={(e) => setNType(e.target.value)}
                                        required
                                        autoComplete="off"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Diameter x Length "
                                        value={nSize}
                                        onChange={(e) => setNSize(e.target.value)}
                                        required
                                        autoComplete="off"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Quantity"
                                        value={nQty}
                                        onChange={(e) => setNQty(e.target.value)}
                                        min="1"
                                        required
                                    />
                                    <input
                                        type="number"
                                        placeholder="Unit Price (₹)"
                                        value={nPrice}
                                        onChange={(e) => setNPrice(e.target.value)}
                                        min="1"
                                        required
                                    />
                                    <button className="rpbtn" type="submit" disabled={submittingReq}>
                                        {submittingReq ? 'Submitting...' : 'Send Add Request'}
                                    </button>
                                </form>
                            </div>

                            <div className="ophead">
                                <h2>My Submitted Requests</h2>
                            </div>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Timber Item</th>
                                            <th className="r">Qty</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requests.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="opempty">
                                                    No requests submitted yet.
                                                </td>
                                            </tr>
                                        )}
                                        {requests.map((r) => {
                                            const status = String(r.status).toUpperCase();
                                            const isApproved = status === 'ACCEPTED' || status === 'APPROVED';
                                            const isPending = status === 'PENDING';
                                            return (
                                                <tr key={r.id}>
                                                    <td>
                                                        <span style={{ fontWeight: '600' }}>
                                                            {r.kind === 'allocate' ? 'Allocation' : 'Add Stock'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {r.type} {r.size}
                                                    </td>
                                                    <td className="r">{r.qty}</td>
                                                    <td>
                                                        <span className={`rptag ${isApproved ? 'ok' : isPending ? 'warn' : 'bad'}`}>
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ========================================================================= */}
                    {/* FR6: WORKERS RECORD AND ACCOUNT FOR WASTAGE FOR TIMBER ALLOCATED TO THEM */}
                    {/* ========================================================================= */}
                    {tab === 'wastage' && (
                        <div className="wastage-management-section">
                            <div className="ophead">
                                <h2>Timber Wastage Management</h2>
                            </div>

                            {/* Section 1: Overview of What Was Allocated to this Worker */}
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
                                <h3 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>
                                    My Allocated Timber Batches (Timber You Took / Received)
                                </h3>
                                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                                    You can only log wastage against timber batches that have been allocated to you and approved by the manager.
                                </p>

                                {myAllocations.length === 0 ? (
                                    <div
                                        style={{
                                            padding: '16px',
                                            backgroundColor: '#f8fafc',
                                            border: '1px dashed #cbd5e1',
                                            borderRadius: '6px',
                                            textAlign: 'center',
                                            color: '#64748b',
                                        }}
                                    >
                                        You currently have no active timber allocations. Go to the <strong>"Submit Requests"</strong> tab to request timber from the manager. Once approved, it will appear here so you can account for any wastage.
                                    </div>
                                ) : (
                                    <div className="opscroll" style={{ maxHeight: '200px' }}>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Allocation ID</th>
                                                    <th>Timber Species</th>
                                                    <th>Diameter x Length</th>
                                                    <th className="r">Total Allocated</th>
                                                    <th className="r">Already Wasted (ft)</th>
                                                    <th className="r">Remaining Usable (ft)</th>
                                                    <th>Wastage Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {myAllocations.map((a) => (
                                                    <tr
                                                        key={a.allocation_id || a.id}
                                                        style={{
                                                            backgroundColor:
                                                                String(selectedAllocId) === String(a.allocation_id || a.id)
                                                                    ? '#fef2f2'
                                                                    : 'transparent',
                                                            cursor: 'pointer',
                                                        }}
                                                        onClick={() => setSelectedAllocId(String(a.allocation_id || a.id))}
                                                    >
                                                        <td>
                                                            <strong>#{a.allocation_id || a.id}</strong>
                                                        </td>
                                                        <td>{a.type}</td>
                                                        <td>{a.size}</td>
                                                        <td className="r">{a.allocated_qty} units</td>
                                                        <td className="r" style={{ color: '#dc2626' }}>
                                                            {a.wasted_qty} ft
                                                        </td>
                                                        <td className="r" style={{ fontWeight: 'bold', color: a.remaining_qty > 0 ? '#15803d' : '#94a3b8' }}>
                                                            {a.remaining_qty} ft
                                                        </td>
                                                        <td>
                                                            {Number(a.wasted_qty || 0) > 0 ? (
                                                                <span className="rptag bad">Allotted</span>
                                                            ) : (
                                                                <span className="rptag ok">Eligible</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Record Wastage Form Against Allocated Timber */}
                            {myAllocations.length > 0 && (
                                <div
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '24px',
                                        marginBottom: '30px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        maxWidth: '650px',
                                    }}
                                >
                                    <h3 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>
                                        Log Wastage for Your Allocated Timber
                                    </h3>
                                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                                        Specify the quantity lost from your allocated batch and state the cause of loss .
                                    </p>
                                    <form onSubmit={handleRecordWastage} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                                                Select From Your Allocated Timber:
                                            </label>
                                            <select
                                                value={selectedAllocId}
                                                onChange={(e) => setSelectedAllocId(e.target.value)}
                                                required
                                                style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #cbd5e1' }}
                                            >
                                                <option value="">-- Select your allocation batch --</option>
                                                {myAllocations.map((a) => (
                                                    <option
                                                        key={a.allocation_id || a.id}
                                                        value={a.allocation_id || a.id}
                                                        disabled={Number(a.wasted_qty || 0) > 0 || a.remaining_qty <= 0}
                                                    >
                                                        Allocation #{a.allocation_id || a.id}: {a.type} ({a.size}) — {Number(a.wasted_qty || 0) > 0 ? 'Wastage Already Allotted' : `${a.remaining_qty} ft available`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {selectedAllocation && (
                                            <div
                                                style={{
                                                    padding: '10px 14px',
                                                    backgroundColor: Number(selectedAllocation.wasted_qty || 0) > 0 ? '#fee2e2' : '#f1f5f9',
                                                    color: Number(selectedAllocation.wasted_qty || 0) > 0 ? '#991b1b' : 'inherit',
                                                    border: Number(selectedAllocation.wasted_qty || 0) > 0 ? '1px solid #f87171' : 'none',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                }}
                                            >
                                                <span>
                                                    Selected: <strong>{selectedAllocation.type} ({selectedAllocation.size})</strong>
                                                    {Number(selectedAllocation.wasted_qty || 0) > 0 && ' — Wastage already allotted'}
                                                </span>
                                                <span style={{ color: Number(selectedAllocation.wasted_qty || 0) > 0 ? '#991b1b' : '#047857', fontWeight: 'bold' }}>
                                                    {Number(selectedAllocation.wasted_qty || 0) > 0 ? 'Cannot Allot Again' : `Max Allowable Wastage: ${selectedAllocation.remaining_qty} ft`}
                                                </span>
                                            </div>
                                        )}

                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                                                Wastage Length (ft):
                                            </label>
                                            <input
                                                type="number"
                                                step="any"
                                                placeholder="Enter wastage length in ft "
                                                value={wQty}
                                                onChange={(e) => setWQty(e.target.value)}
                                                min="0.01"
                                                max={selectedAllocation?.remaining_qty || undefined}
                                                required
                                                style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #cbd5e1' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                                                Reason for Scrap / Wastage:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder=""
                                                value={wWhy}
                                                onChange={(e) => setWWhy(e.target.value)}
                                                required
                                                style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #cbd5e1' }}
                                            />
                                        </div>

                                        <button
                                            className="rpbtn"
                                            type="submit"
                                            disabled={
                                                submittingWastage ||
                                                !selectedAllocation ||
                                                Number(selectedAllocation.wasted_qty || 0) > 0 ||
                                                selectedAllocation.remaining_qty <= 0
                                            }
                                            style={{
                                                backgroundColor: Number(selectedAllocation?.wasted_qty || 0) > 0 ? '#94a3b8' : '#b91c1c',
                                                padding: '12px',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                cursor: Number(selectedAllocation?.wasted_qty || 0) > 0 ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {submittingWastage
                                                ? 'Recording...'
                                                : Number(selectedAllocation?.wasted_qty || 0) > 0
                                                    ? 'Wastage Already Allotted for This Wood'
                                                    : 'Log Wastage for This Allocation'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Section 3: Wastage History Accounting Table */}
                            <div className="ophead">
                                <h3>Logged Wastage Accounting History ({wastageList.length})</h3>
                            </div>
                            <div className="opscroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Timber Species</th>
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
                                                    No timber wastage recorded yet.
                                                </td>
                                            </tr>
                                        )}
                                        {wastageList.map((w) => (
                                            <tr key={w.id || w.wastage_id}>
                                                <td>{w.date ? String(w.date).slice(0, 10) : 'Recent'}</td>
                                                <td>
                                                    <strong>{w.type || w.type_name}</strong>
                                                </td>
                                                <td>{w.size || 'Standard'}</td>
                                                <td className="r" style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                                    -{w.qty ?? w.quantity} ft
                                                </td>
                                                <td>{w.reason}</td>
                                                <td>{w.worker_name || name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
