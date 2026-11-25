import React, { useState } from 'react';
import { processTimberQuery } from '../utils/algorithms';

const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN');

const formatDim = (s) => {
    if (!s) return '';
    const str = String(s).trim();
    if (/\s*ft$/i.test(str)) return str;
    return `${str} ft`;
};

export default function InventoryTable({ timber = [] }) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('type');
    const [sortOrder, setSortOrder] = useState('ASC');
    const [avail, setAvail] = useState('all');

    // Execute Main Algorithm (Search: Binary Search -> Filter: Linear -> Sort: Merge Sort)
    const { records: rows, message } = processTimberQuery(timber, {
        search,
        searchField: 'all',
        filter: avail !== 'all' ? avail : null,
        sortField: sortBy,
        sortOrder: sortOrder,
    });

    return (
        <>
            <div className="ophead">
                <h2>Inventory</h2>
                <div className="rptools">
                    <select value={avail} onChange={(e) => setAvail(e.target.value)}>
                        <option value="all">All Stock</option>
                        <option value="in">In Stock </option>
                        <option value="low">Low Stock </option>
                        <option value="out">Out of Stock</option>
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="type">Sort: Type </option>
                        <option value="qty">Sort: Quantity </option>
                        <option value="price">Sort: Price </option>
                        <option value="date">Sort: Date added </option>
                    </select>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                        <option value="ASC">Order: Ascending</option>
                        <option value="DESC">Order: Descending</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search timber"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="opscroll">
                <table>
                    <thead>
                        <tr>
                            <th>Timber Species</th>
                            <th>Diameter x Length</th>
                            <th className="r">Qty</th>
                            <th className="r">Min</th>
                            <th className="r">Price</th>
                            <th>Added</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr><td colSpan="7" className="opempty">{message || 'No Records Found'}</td></tr>
                        )}
                        {rows.map((t) => (
                            <tr key={t.id || t.timber_id}>
                                <td>{t.type || t.type_name}</td>
                                <td>{formatDim(t.size)}</td>
                                <td className="r">{t.qty ?? t.quantity}</td>
                                <td className="r">{t.min ?? t.min_stock_level ?? 10}</td>
                                <td className="r">{rupees(t.price)}</td>
                                <td>{t.date ? String(t.date).slice(0, 10) : 'N/A'}</td>
                                <td>
                                    {(t.qty ?? t.quantity) === 0 ? <span className="rptag bad">Out</span>
                                        : (t.qty ?? t.quantity) <= (t.min ?? t.min_stock_level ?? 10) ? <span className="rptag warn">Low</span>
                                            : <span className="rptag ok">In stock</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
