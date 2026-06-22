// =======================================================
// 衣装管理
// =======================================================

const GEAR_FIELDS = ["happi_no", "tshirt_size", "tekkou", "hakama", "kimono_top", "kimono_bottom", "memo"];
const GEAR_LABELS = { happi_no: "法被", tshirt_size: "T", tekkou: "手甲", hakama: "はかま", kimono_top: "着物上", kimono_bottom: "着物下" };

let gearData = [];
let spareData = [];
let gearEditTargetUserId = null;
let currentGearTab = "members";

function openGearCard() {
    document.getElementById("gearCard").classList.add("active");
    loadGear();
    if (currentGearTab === "spare") loadGearSpare();
}

// ===== タブ切り替え =====
function initGearTabs() {
    document.querySelectorAll(".gear-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".gear-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".gear-tab-pane").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            currentGearTab = btn.dataset.gearTab;
            document.getElementById(currentGearTab === "members" ? "gearMembersPane" : "gearSparePane").classList.add("active");
            if (currentGearTab === "spare") loadGearSpare();
        });
    });
}

// ===== メンバー衣装 =====
async function loadGear() {
    const card = document.getElementById("gearCard");
    const overlay = card.querySelector(".loading-overlay");
    overlay.style.display = "flex";
    const res = await callGasApi({ action: "getGear" });
    overlay.style.display = "none";
    if (!res?.success) { document.getElementById("gearList").innerHTML = '<p style="padding:16px;color:var(--text-3);">取得失敗</p>'; return; }
    gearData = res.members || [];
    renderGearList();
}

function renderGearList() {
    const list = document.getElementById("gearList");
    if (!gearData.length) { list.innerHTML = '<p style="padding:16px;color:var(--text-3);">メンバーなし</p>'; return; }
    list.innerHTML = "";
    gearData.forEach(m => {
        const g = m.gear || {};
        const isAdmin = typeof userRole !== "undefined" && userRole === "admin";
        const tags = Object.entries(GEAR_LABELS)
            .filter(([f]) => g[f] !== "" && g[f] !== undefined)
            .map(([f, label]) => `<span class="gear-tag">${label}：${escHtml(String(g[f]))}</span>`).join("");
        const memoTag = g.memo ? `<span class="gear-tag gear-tag-memo">${escHtml(String(g.memo))}</span>` : "";
        const item = document.createElement("div");
        item.className = "gear-item";
        item.innerHTML = `
            <div class="gear-item-header">
                <span class="gear-member-name">${escHtml(m.name)}</span>
                ${isAdmin ? `<button class="gear-edit-btn" aria-label="編集"><i class="fas fa-pen"></i></button>` : ""}
            </div>
            <div class="gear-tags">${tags || memoTag ? tags + memoTag : '<span style="color:var(--text-3);font-size:.8rem;">未登録</span>'}</div>
        `;
        if (isAdmin) item.querySelector(".gear-edit-btn").addEventListener("click", () => openGearEdit(m));
        list.appendChild(item);
    });
}

function openGearEdit(member) {
    gearEditTargetUserId = member.userId;
    document.getElementById("gearEditTitle").textContent = `衣装編集：${member.name}`;
    const g = member.gear || {};
    GEAR_FIELDS.forEach(f => {
        const el = document.getElementById("gEdit_" + f);
        if (el) el.value = g[f] !== undefined ? String(g[f]) : "";
    });
    document.getElementById("gearEditCard").classList.add("active");
}

async function saveGear() {
    if (!gearEditTargetUserId) return;
    const gear = {};
    GEAR_FIELDS.forEach(f => { gear[f] = document.getElementById("gEdit_" + f)?.value.trim() ?? ""; });
    const btn = document.getElementById("gearSaveBtn");
    btn.disabled = true; btn.textContent = "保存中…";
    const res = await callGasApi({ action: "saveGear", targetUserId: gearEditTargetUserId, gear, userId });
    btn.disabled = false; btn.textContent = "保存";
    if (!res?.success) { alert(res?.msg || "保存失敗"); return; }
    const m = gearData.find(m => m.userId === gearEditTargetUserId);
    if (m) m.gear = gear;
    document.getElementById("gearEditCard").classList.remove("active");
    renderGearList();
}

// ===== 未配布在庫 =====
async function loadGearSpare() {
    const list = document.getElementById("gearSpareList");
    list.innerHTML = '<p style="padding:8px 0;color:var(--text-3);">読み込み中…</p>';
    const res = await callGasApi({ action: "getGearSpare" });
    if (!res?.success) { list.innerHTML = '<p style="color:var(--text-3);">取得失敗</p>'; return; }
    spareData = res.items || [];
    renderSpareList();
    const adminArea = document.getElementById("gearSpareAdminArea");
    if (adminArea) adminArea.style.display = (typeof userRole !== "undefined" && userRole === "admin") ? "block" : "none";
}

function renderSpareList() {
    const list = document.getElementById("gearSpareList");
    const isAdmin = typeof userRole !== "undefined" && userRole === "admin";
    const types = ["Tシャツ", "手甲"];
    list.innerHTML = "";

    types.forEach(type => {
        const items = spareData.filter(s => s.item_type === type).sort((a, b) => String(a.value).localeCompare(String(b.value)));
        const group = document.createElement("div");
        group.className = "gear-spare-group";
        group.innerHTML = `<div class="gear-spare-type-label">${escHtml(type)}</div>`;

        if (!items.length) {
            group.innerHTML += `<p class="gear-spare-empty">在庫なし</p>`;
        } else {
            items.forEach(s => {
                const row = document.createElement("div");
                row.className = "gear-spare-row";

                if (type === "Tシャツ") {
                    // Tシャツ：在庫マスタ - メンバー使用数 = 未配布
                    const available = s.quantity - (s.member_count || 0);
                    row.innerHTML = `
                        <span class="gear-spare-value">${escHtml(String(s.value))}</span>
                        <div class="gear-spare-tshirt-stats">
                            <span class="gear-spare-stat">在庫 <b>${s.quantity}</b></span>
                            <span class="gear-spare-stat">使用中 <b>${s.member_count || 0}</b></span>
                            <span class="gear-spare-stat gear-spare-available ${available <= 0 ? 'gear-spare-zero' : ''}">未配布 <b>${available}</b></span>
                        </div>
                        ${isAdmin ? `
                            <div class="gear-spare-inline-edit">
                                <span class="gear-spare-master-label">在庫マスタ</span>
                                <button class="gear-qty-btn gear-qty-inline-minus">－</button>
                                <span class="gear-spare-qty-display">${s.quantity}</span>
                                <button class="gear-qty-btn gear-qty-inline-plus">＋</button>
                            </div>` : ""}
                    `;
                } else {
                    // 手甲：従来通り数量のみ表示
                    row.innerHTML = `
                        <span class="gear-spare-value">${escHtml(String(s.value))}</span>
                        <span class="gear-spare-qty-badge">${s.quantity}個</span>
                        ${isAdmin ? `
                            <div class="gear-spare-inline-edit">
                                <button class="gear-qty-btn gear-qty-inline-minus">－</button>
                                <span class="gear-spare-qty-display">${s.quantity}</span>
                                <button class="gear-qty-btn gear-qty-inline-plus">＋</button>
                            </div>` : ""}
                    `;
                }

                if (isAdmin) {
                    let qty = s.quantity;
                    const display = row.querySelector(".gear-spare-qty-display");
                    row.querySelector(".gear-qty-inline-minus").addEventListener("click", async () => {
                        if (qty <= 0) return;
                        qty--;
                        display.textContent = qty;
                        await upsertSpare(type, s.value, qty);
                        await loadGearSpare();
                    });
                    row.querySelector(".gear-qty-inline-plus").addEventListener("click", async () => {
                        qty++;
                        display.textContent = qty;
                        await upsertSpare(type, s.value, qty);
                        await loadGearSpare();
                    });
                }
                group.appendChild(row);
            });
        }
        list.appendChild(group);
    });
}

async function upsertSpare(item_type, value, quantity) {
    await callGasApi({ action: "upsertGearSpare", item_type, value, quantity, userId });
}

async function addSpare() {
    const type = document.getElementById("gSpareType").value;
    const value = document.getElementById("gSpareValue").value.trim();
    const qty = parseInt(document.getElementById("gSpareQty").value) || 0;
    if (!value) { alert("サイズ・コードを入力してください"); return; }
    const btn = document.getElementById("gSpareUpsertBtn");
    btn.disabled = true;
    const res = await callGasApi({ action: "upsertGearSpare", item_type: type, value, quantity: qty, userId });
    btn.disabled = false;
    if (!res?.success) { alert(res?.msg || "保存失敗"); return; }
    document.getElementById("gSpareValue").value = "";
    document.getElementById("gSpareQty").value = "1";
    await loadGearSpare();
}

document.addEventListener("DOMContentLoaded", () => {
    initGearTabs();
    document.getElementById("gearSaveBtn")?.addEventListener("click", saveGear);
    document.getElementById("gSpareUpsertBtn")?.addEventListener("click", addSpare);
    document.getElementById("gSpareQtyMinus")?.addEventListener("click", () => {
        const el = document.getElementById("gSpareQty");
        el.value = Math.max(0, parseInt(el.value || 0) - 1);
    });
    document.getElementById("gSpareQtyPlus")?.addEventListener("click", () => {
        const el = document.getElementById("gSpareQty");
        el.value = parseInt(el.value || 0) + 1;
    });
});
