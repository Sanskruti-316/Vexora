import React, { useState } from "react";

import InventoryTable from "./InventoryTable";

export default function ManagerPage({ onsignout, store }) {
  const {
    timber,
    setTimber,
    requests,
    setRequests,
    workers,
    setWorkers,
    txns,
    setTxns,
  } = store;
  const [tab, setTab] = useState("inventory");
  const [msg, setMsg] = useState("");
  const [wName, setWName] = useState("");
  const [wEmail, setWEmail] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const low = timber.filter((t) => t.qty < t.min);
  const pending = requests.filter((r) => r.status === "Pending");
  const maxQty = Math.max(...timber.map((t) => t.qty), 1);

  const stats = [
    { label: "Timber types", value: timber.length },
    { label: "Low stock", value: low.length },
    { label: "Pending", value: pending.length },
    { label: "Workers", value: workers.length },
  ];

  const logTxn = (kind, r) =>
    setTxns((p) => [
      {
        id: Date.now(),
        date: today,
        kind,
        type: r.type,
        qty: r.qty,
        by: r.worker,
      },
      ...p,
    ]);
  const setStatus = (id, status) =>
    setRequests((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));

  const accept = (r) => {
    setMsg("");
    if (r.kind === "allocate") {
      const t = timber.find((x) => x.id === r.timberId);
      if (!t || t.qty < r.qty) {
        setMsg("Not enough stock for " + r.type);
        return;
      }
      setTimber((p) =>
        p.map((x) => (x.id === t.id ? { ...x, qty: x.qty - r.qty } : x)),
      );
      logTxn("Allocated", r);
    } else {
      const t = timber.find((x) => x.type === r.type && x.size === r.size);
      if (t)
        setTimber((p) =>
          p.map((x) => (x.id === t.id ? { ...x, qty: x.qty + r.qty } : x)),
        );
      else
        setTimber((p) => [
          ...p,
          {
            id: Date.now(),
            type: r.type,
            size: r.size,
            qty: r.qty,
            min: 10,
            price: r.price,
            date: today,
          },
        ]);
      logTxn("Added", r);
    }
    setStatus(r.id, "Accepted");
  };

  const addWorker = (e) => {
    e.preventDefault();
    const name = wName.trim();
    const email = wEmail.toLowerCase().trim();
    if (!name || !email) return setMsg("Name and email are required");
    if (workers.some((w) => w.email === email))
      return setMsg("Worker already exists");
    setWorkers((p) => [...p, { name, email }]);
    setWName("");
    setWEmail("");
    setMsg("");
  };

  const tabs = [
    ["inventory", "Inventory"],
    ["requests", "Requests (" + pending.length + ")"],
    ["workers", "Workers"],
    ["txns", "Transactions"],
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
          <button className="op-btn" onClick={onsignout}>
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
          {low.length > 0 && (
            <div className="rpalert">
              Low stock:{" "}
              {low
                .map((t) => t.type + " (" + t.qty + " left, min " + t.min + ")")
                .join(", ")}
            </div>
          )}

          <div className="rptabs">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                className={tab === k ? "on" : ""}
                onClick={() => {
                  setTab(k);
                  setMsg("");
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {msg && <p className="rpmsg">{msg}</p>}

          {tab === "inventory" && <InventoryTable timber={timber} />}

          {tab === "requests" && (
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
                      <th>Timber</th>
                      <th className="r">Qty</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan="6" className="opempty">
                          No requests
                        </td>
                      </tr>
                    )}
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td>{r.worker}</td>
                        <td>
                          {r.kind === "allocate" ? "Allocation" : "Add timber"}
                        </td>
                        <td>
                          {r.type} {r.size}
                        </td>
                        <td className="r">{r.qty}</td>
                        <td>{r.status}</td>
                        <td>
                          {r.status === "Pending" && (
                            <>
                              <button
                                className="rpbtn"
                                onClick={() => accept(r)}
                              >
                                Accept
                              </button>{" "}
                              <button
                                className="rpbtn grey"
                                onClick={() => setStatus(r.id, "Rejected")}
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "workers" && (
            <>
              <div className="ophead">
                <h2>Workers</h2>
              </div>
              <form className="rpform" onSubmit={addWorker}>
                <input
                  type="text"
                  placeholder="Name"
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={wEmail}
                  onChange={(e) => setWEmail(e.target.value)}
                />
                <button className="rpbtn" type="submit">
                  Add Worker
                </button>
              </form>
              <div className="opscroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((w) => (
                      <tr key={w.email}>
                        <td>{w.name}</td>
                        <td>{w.email}</td>
                        <td>
                          <button
                            className="rpbtn grey"
                            onClick={() =>
                              setWorkers((p) =>
                                p.filter((x) => x.email !== w.email),
                              )
                            }
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

          {tab === "txns" && (
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
                          No transactions
                        </td>
                      </tr>
                    )}
                    {txns.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
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
