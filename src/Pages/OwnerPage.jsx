import React, { useState } from 'react';

const stats = [
    { label: 'Timber types', value: '100' },
    { label: 'Invested', value: '₹80,000' },
    { label: 'Warehouses', value: '3' },
    { label: 'Managers', value: '3' },
    { label: 'Workers', value: '10' },
];

const inventory = [
    { type: 'Teak', warehouse: 'Gokul Manufacturing', qty: 100, dim: '10x10', cost: 10000, manager: 'Mallikarjun P' },
    { type: 'Rosewood', warehouse: 'Keshwapur Works', qty: 50, dim: '5x5', cost: 50000, manager: 'Rajesh T' },
    { type: 'Mahogany', warehouse: 'Gokul Manufacturing', qty: 30, dim: '3x3', cost: 5000, manager: 'Mallikarjun P' },
    { type: 'Oak', warehouse: 'Silver Town Woods', qty: 20, dim: '2x2', cost: 15000, manager: 'Shivam D' },
];

const managers = [
    { name: 'Mallikarjun P', email: 'mallikarjun@example.com', phone: '+91 8951560323', warehouse: 'Gokul Manufacturing', revenue: 10000 },
    { name: 'Rajesh T', email: 'rajesh@example.com', phone: '+91 7338039208', warehouse: 'Keshwapur Works', revenue: 15000 },
    { name: 'Shivam D', email: 'shivam@example.com', phone: '+91 9481857729', warehouse: 'Silver Town Woods', revenue: 25000 },
];

const rupees = (n) => '₹' + n.toLocaleString('en-IN');
function searchInventory(list, text) {
    const q = text.toLowerCase().trim();

    return list.filter(
        (r) =>
            r.type.toLowerCase().includes(q) ||
            r.warehouse.toLowerCase().includes(q) ||
            r.manager.toLowerCase().includes(q)
    );
}
export default function OwnerPage({ onsignout }) {
    const [search, setSearch] = useState('');
const rows = searchInventory(inventory, search);

    return (    
        <div className="op">
            <header id="head">
                <div id="two">
                    {/* <div id="hone"> */}

                    <div id="symbol">DT</div>
                    <div id="name1"><div id="name3">Durga </div><div id="name2">Timbers</div></div>

                    {/* </div> */}
                </div>
                <div className="opright">
                    <button className="opbtn" onClick={onsignout}>Sign Out</button>
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
                    <div className="ophead">
                        <h2>Inventory</h2>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="opscroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Timber</th>
                                    <th>Warehouse</th>
                                    <th className="r">Qty</th>
                                    <th>Size</th>
                                    <th className="r">Cost</th>
                                    <th>Manager</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <tr><td colSpan="6" className="opempty">Nothing found</td></tr>
                                )}
                                {rows.map((r) => (
                                    <tr key={r.type + r.warehouse}>
                                        <td>{r.type}</td>
                                        <td>{r.warehouse}</td>
                                        <td className="r">
                                            {r.qty}
                                        </td>
                                        <td>{r.dim}</td>
                                        <td className="r">{rupees(r.cost)}</td>
                                        <td>{r.manager}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="ophead">
                        <h2>Managers</h2>
                    </div>
                    <div className="opscroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Warehouse</th>
                                    <th className="r">Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {managers.map((m) => (
                                    <tr key={m.email}>
                                        <td>{m.name}</td>
                                        <td>{m.email}</td>
                                        <td>{m.phone}</td>
                                        <td>{m.warehouse}</td>
                                        <td className="r">{rupees(m.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}