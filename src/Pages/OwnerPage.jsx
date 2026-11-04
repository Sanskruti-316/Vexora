import React from 'react';

export default function OwnerPage({ onsignout }) {
    return (
        <>
        <div id="ownerpage">
            <div id="head1">
                <div id="two">
                    <div id="symbol">DT</div>
                    <div id="name1"><div id="name3">Durga </div><div id="name2">Timbers</div></div>
                </div>
                <div id="three">
                    <button id="sigin" onClick={onsignout}>Sign Out</button>
                </div>
            </div>
            <div id="stats">
                <div id="stats1">
                    <h3>Statistics</h3>
                    <h5>Total types of Timber: 100</h5>
                    <h5>Total Investments: 80000₹ </h5>
                    <h5>Total Warehouse: 3</h5>
                    <h5>Total Managers: 3</h5>
                    <h5>Total Workers: 10</h5>
                </div>
                <div id="stats2">
                    <div id="symbol2">DT</div>
                    <div id="name4"><div id="name3">Durga </div><div id="name2">Timbers</div></div>
                </div>
            </div>
            <div id="inventory">
                <h3 id="ih">Inventory</h3>
                <table>
                    <thead>
                        <tr>
                        <th>Timber Type</th>
                        <th>WareHouse</th>
                        <th>Quantity</th>
                        <th>Dimensions</th>
                        <th>Total Cost</th>
                        <th>Manager</th>
                        </tr>

                    </thead>
                    <tbody>
                        <tr>
                            <td>Teak</td>
                            <td>Gokul Manufacturing</td>
                            <td>100</td>
                            <td>10x10</td>
                            <td>10000₹</td>
                            <td>Mallikarjun P</td>
                        </tr>
                        <tr>
                            <td>Rosewood</td>
                            <td>Keshwapur Works</td>
                            <td>50</td>
                            <td>5x5</td>
                            <td>50000₹</td>
                            <td>Rajesh T</td>
                        </tr>
                        <tr>
                            <td>Mahogany</td>
                            <td>Gokul Manufacturing</td>
                            <td>30</td>
                            <td>3x3</td>
                            <td>5000₹</td>
                            <td>Mallikarjun P</td>
                        </tr>
                        <tr>
                            <td>Oak</td>
                            <td>Silver Town Woods </td>
                            <td>20</td>
                            <td>2x2</td>
                            <td>15000₹</td>
                            <td>Shivam D</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="managers">
                <h3 id="ih">Managers</h3>
                <table>
                    <thead>
                        <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Warehouse</th>
                        <th>Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Mallikarjun P</td>
                            <td>mallikarjun@example.com</td>
                            <td>+91 8951560323</td>
                            <td>Gokul Manufacturing</td>
                            <td>10000₹</td>
                        </tr>
                        <tr>
                            <td>Rajesh T</td>
                            <td>rajesh@example.com</td>
                            <td>+91 7338039208 </td>
                            <td>Keshwapur Works</td>
                            <td>15000₹</td>
                        </tr>
                        <tr>
                            <td>Shivam D</td>
                            <td>shivam@example.com</td>
                            <td>+91 9481857729</td>
                            <td>Silver Town Woods </td>
                            <td>25000₹</td>
                        </tr>
                    </tbody>
                </table>
            </div>

        </div>
        </>
    )
}
