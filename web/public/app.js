// Ballast dashboard.
//
// Deliberately thin. The interesting work happens on the ledger, and the one thing this file
// must never do is decide what a party can see — it renders whatever each per-party query
// returned. Where a count is zero, that is Canton's answer, not a filter here.

const $ = (sel) => document.querySelector(sel);

const state = {
  lenses: [],
  selected: null,
  ledger: null,
};

// ── routing ────────────────────────────────────────────────────────────────
const VIEWS = { "/": "view-home", "/lenses": "view-lenses", "/verify": "view-verify" };

function route() {
  const path = (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const id = VIEWS[path] ?? VIEWS["/"];
  for (const viewId of Object.values(VIEWS)) {
    document.getElementById(viewId)?.classList.toggle("hidden", viewId !== id);
  }
  document.querySelectorAll(".top nav a[data-route]").forEach((a) => {
    a.classList.toggle("on", a.dataset.route === path);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}

window.addEventListener("hashchange", route);

// ── health ─────────────────────────────────────────────────────────────────
async function health() {
  const dot = $("#dot");
  const label = $("#ledger-label");
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    state.ledger = h.ledger;
    if (h.ok) {
      dot.className = "dot live";
      label.textContent = `canton ${h.version}`;
      const foot = $("#foot-ledger");
      if (foot) foot.textContent = h.ledger;
    } else {
      dot.className = "dot down";
      label.textContent = "ledger unreachable";
    }
  } catch {
    dot.className = "dot down";
    label.textContent = "ledger unreachable";
  }
}

// ── lenses ─────────────────────────────────────────────────────────────────
function lensCard(lens, interactive) {
  const el = document.createElement(interactive ? "button" : "div");
  el.className = "lens" + (interactive && state.selected === lens.id ? " on" : "");
  if (!interactive) el.style.cursor = "default";
  el.innerHTML = `
    <div class="role"></div>
    <div class="count">
      <span class="n${lens.count === 0 ? " zero" : ""}"></span>
      <span class="unit">contracts visible</span>
    </div>
    <p class="blurb"></p>`;
  el.querySelector(".role").textContent = lens.label;
  el.querySelector(".n").textContent = lens.party ? lens.count : "—";
  el.querySelector(".blurb").textContent = lens.blurb;
  if (interactive) {
    el.addEventListener("click", () => {
      state.selected = lens.id;
      renderLenses();
    });
  }
  return el;
}

function renderPanel(lens) {
  const panel = $("#lens-panel");
  if (!panel) return;
  panel.innerHTML = "";
  if (!lens) return;

  const box = document.createElement("div");
  box.className = "panel";

  const head = document.createElement("div");
  head.className = "panel-head";
  const h3 = document.createElement("h3");
  h3.textContent = `${lens.label} — ${lens.count} contract${lens.count === 1 ? "" : "s"}`;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = lens.party ? shortParty(lens.party) : "party not allocated";
  head.append(h3, who);
  box.append(head);

  if (lens.contracts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<div class="big"></div><p></p>`;
    empty.querySelector(".big").textContent = lens.party ? "Sees nothing" : "Not on this ledger";
    empty.querySelector("p").textContent = lens.party
      ? "Not a stakeholder on any contract in this fund. The ledger returns an empty set."
      : "Run provisioning to allocate this party.";
    box.append(empty);
  } else {
    const rows = document.createElement("div");
    rows.className = "rows";
    for (const c of lens.contracts) {
      const row = document.createElement("div");
      row.className = "row" + (c.secret ? " secret" : "");
      row.innerHTML = `<span class="kind"></span><span class="headline"></span><span class="detail"></span>`;
      row.querySelector(".kind").textContent = c.kind;
      row.querySelector(".headline").textContent = c.headline;
      row.querySelector(".detail").textContent = c.detail;
      rows.append(row);
    }
    box.append(rows);
  }
  panel.append(box);
}

const shortParty = (p) => (p.length > 34 ? `${p.slice(0, 22)}…${p.slice(-6)}` : p);

function renderLenses() {
  const grid = $("#lens-cards");
  if (grid) {
    grid.innerHTML = "";
    for (const lens of state.lenses) grid.append(lensCard(lens, true));
    renderPanel(state.lenses.find((l) => l.id === state.selected) ?? null);
  }
  const home = $("#lens-cards-home");
  if (home) {
    home.innerHTML = "";
    for (const lens of state.lenses) home.append(lensCard(lens, false));
  }
}

async function loadLenses() {
  try {
    const r = await fetch("/api/lenses");
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    state.lenses = data.lenses;
    state.ledger = data.ledger;
    // Open on the investor: the point of the whole page is what is missing from that column.
    if (!state.selected) state.selected = "investor";
    renderLenses();
  } catch (e) {
    const grid = $("#lens-cards") ?? $("#lens-cards-home");
    if (grid) {
      grid.innerHTML = "";
      const msg = document.createElement("div");
      msg.className = "note";
      msg.innerHTML = `<b>No ledger.</b> Start one and reload — the lenses are read from a live participant node, so there is nothing to show without it.`;
      grid.append(msg);
    }
  }
}

route();
await health();
await loadLenses();
// The ledger is the source of truth, so keep asking it rather than caching a snapshot.
setInterval(loadLenses, 8000);
