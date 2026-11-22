import React, { useState } from 'react';

const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN');

export default function InventoryTable({ timber }) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('type');
    const [avail, setAvail] = useState('all');

    let rows = timber.filter((t) =>
        (t.type + ' ' + t.size).toLowerCase().includes(search.toLowerCase().trim())
    );
    if (avail === 'in') rows = rows.filter((t) => t.qty >= t.min);
    if (avail === 'low') rows = rows.filter((t) => t.qty > 0 && t.qty < t.min);
    if (avail === 'out') rows = rows.filter((t) => t.qty === 0);

    rows = [...rows].sort((a, b) =>
        sortBy === 'type' ? a.type.localeCompare(b.type)
        : sortBy === 'date' ? b.date.localeCompare(a.date)
        : b[sortBy] - a[sortBy]
    );

    return (
        <>
            <div className="op-head">
                <h2>Inventory</h2>
                <div className="rp-tools">
                    <select value={avail} onChange={(e) => setAvail(e.target.value)}>
                        <option value="all">All</option>
                        <option value="in">In stock</option>
                        <option value="low">Low stock</option>
                        <option value="out">Out of stock</option>
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="type">Sort: Type</option>
                        <option value="qty">Sort: Quantity</option>
                        <option value="price">Sort: Price</option>
                        <option value="date">Sort: Date added</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="op-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Timber</th>
                            <th>Size</th>
                            <th className="r">Qty</th>
                            <th className="r">Min</th>
                            <th className="r">Price</th>
                            <th>Added</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr><td colSpan="7" className="op-empty">Nothing found</td></tr>
                        )}
                        {rows.map((t) => (
                            <tr key={t.id}>
                                <td>{t.type}</td>
                                <td>{t.size}</td>
                                <td className="r">{t.qty}</td>
                                <td className="r">{t.min}</td>
                                <td className="r">{rupees(t.price)}</td>
                                <td>{t.date}</td>
                                <td>
                                    {t.qty === 0 ? <span className="rp-tag bad">Out</span>
                                    : t.qty < t.min ? <span className="rp-tag warn">Low</span>
                                    : <span className="rp-tag ok">In stock</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}