import React from 'react';

export default function BlankPage({ title, onsignout }) {
    return (
        <>
            <div id="head1">
                <div id="two">
                    <div id="symbol">DT</div>
                    <div id="name1">
                        <div id="name3">Durga </div>
                        <div id="name2">Timbers</div>
                    </div>
                </div>
                <div id="three">
                    <button id="sigin" onClick={onsignout}>Sign Out</button>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '80px' }}>
                <h1>{title} Page</h1>
            </div>
        </>
    );
}