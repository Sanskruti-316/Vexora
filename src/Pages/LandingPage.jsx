import React from 'react';

export default function LandingPage({onnavtologin}) {
    return (
        <>
            <div id="head">
                <div id="two">
                    {/* <div id="hone"> */}

                        <div id="symbol">DT</div>
                        <div id="name1"><div id="name3">Durga </div><div id="name2">Timbers</div></div>
                    
                    {/* </div> */}
                </div>
                <div id="three">
                    <button id="sigin" onClick={onnavtologin} >Sign In</button>
                </div>
            </div>
            <section id="bi" style={{ backgroundImage: "url('/hero-timber.jpg')" }} >
                <div id="four">
                    <div id="middle1">
                        Durga Timbers
                    </div>
                    <div id="middle2">
                        <button id="mb"onClick={onnavtologin}>Sign In</button>
                    </div>
                </div>
            </section>
            <div id="foot">
                <div id="fone">
                    Durga Timbers
                </div>
                <div id="ftwo">
                    +918951560323
                </div>
            </div>
        </>
    );
}
