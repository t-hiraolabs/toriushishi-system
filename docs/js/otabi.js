/* =======================================================
お旅管理
======================================================= */
let otabiPlaces = [];
let otabiScheduleEntries = [];
let otabiYear = new Date().getFullYear();
let otabiGroup = "上組";  // "上組" | "下組" | "合同"
let otabiDay = "土曜";
let otabiPlaceFilter = "";
let otabiDonGroup = "上組";
let otabiDonDay = "土曜";

function openOtabiCard() {
    otabiYear = new Date().getFullYear();
    document.getElementById("otabiCard").classList.add("active");
    switchOtabiTab("places");
}

function switchOtabiTab(tab) {
    document.querySelectorAll(".otabi-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".otabi-tab-pane").forEach(p => p.classList.toggle("active", p.dataset.tab === tab));
    if (tab === "places")    loadOtabiPlaces();
    if (tab === "schedule")  loadOtabiSchedule();
    if (tab === "donations") loadOtabiDonations();
}

// ===== 訪問先マスタ =====

async function loadOtabiPlaces(forceReload = false) {
    if (!forceReload && otabiPlaces.length) { renderOtabiPlaces(); return; }
    const list = document.getElementById("otabiPlacesList");
    list.innerHTML = '<div class="skeleton skeleton-card"></div>';
    const res = await callGasApi({ action: "getOtabiPlaces" });
    otabiPlaces = res.places || [];
    renderOtabiPlaces();
}

function renderOtabiPlaces() {
    const list = document.getElementById("otabiPlacesList");
    const filtered = otabiPlaceFilter
        ? otabiPlaces.filter(p => p.group === otabiPlaceFilter)
        : otabiPlaces;
    if (!filtered.length) {
        list.innerHTML = '<p class="no-event">訪問先が登録されていません</p>';
        return;
    }
    list.innerHTML = filtered.map(p => {
        const gc = p.group === '上' ? 'ue' : p.group === '下' ? 'shita' : 'joint';
        const addressHtml = p.address
            ? `<a class="otabi-map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}" target="_blank" rel="noopener">${p.address}</a>`
            : '';
        const sub = [addressHtml, p.tel].filter(Boolean).join(' ／ ');
        return `
        <div class="otabi-item" data-place-id="${p.place_id}">
            <span class="otabi-badge otabi-badge-${gc}">${p.group || '-'}</span>
            <div class="otabi-item-body">
                <div class="otabi-item-title">${p.name}</div>
                ${sub ? `<div class="otabi-item-sub">${sub}</div>` : ''}
            </div>
            <button class="otabi-action-btn edit-place-btn" data-id="${p.place_id}">編集</button>
        </div>`;
    }).join('');
    list.querySelectorAll(".edit-place-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            openPlaceForm(otabiPlaces.find(p => p.place_id == btn.dataset.id));
        });
    });
}

function openPlaceForm(place = null) {
    document.getElementById("placeFormId").value = place?.place_id || "";
    document.getElementById("placeFormName").value = place?.name || "";
    document.getElementById("placeFormAddress").value = place?.address || "";
    document.getElementById("placeFormTel").value = place?.tel || "";
    const g = place?.group || "上";
    const radio = document.querySelector(`input[name="placeGroup"][value="${g}"]`);
    if (radio) radio.checked = true;
    document.getElementById("deletePlaceBtn").style.display = place ? "block" : "none";
    document.getElementById("otabiPlaceFormCard").classList.add("active");
}

async function savePlaceForm() {
    const name = document.getElementById("placeFormName").value.trim();
    if (!name) return alert("訪問先名を入力してください");
    const id = document.getElementById("placeFormId").value;
    const place = {
        place_id: id ? Number(id) : null,
        name,
        address: document.getElementById("placeFormAddress").value.trim(),
        tel: document.getElementById("placeFormTel").value.trim(),
        group: document.querySelector('input[name="placeGroup"]:checked')?.value || "上"
    };
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "saveOtabiPlace", place });
        if (!res.success) throw new Error("保存失敗");
        document.getElementById("otabiPlaceFormCard").classList.remove("active");
        otabiPlaces = [];
        await loadOtabiPlaces();
    } catch(e) {
        alert("保存に失敗しました");
    } finally {
        loadingOverlay.style.display = "none";
    }
}

async function deletePlaceForm() {
    const id = document.getElementById("placeFormId").value;
    if (!id) return;
    if (!confirm("この訪問先を削除しますか？")) return;
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "deleteOtabiPlace", place_id: Number(id) });
        if (!res.success) throw new Error();
        document.getElementById("otabiPlaceFormCard").classList.remove("active");
        otabiPlaces = [];
        await loadOtabiPlaces();
    } catch(e) {
        alert("削除に失敗しました");
    } finally {
        loadingOverlay.style.display = "none";
    }
}

// ===== スケジュール =====

async function loadOtabiSchedule(forceReload = false) {
    if (!forceReload && otabiScheduleEntries.length) { renderOtabiSchedule(); return; }
    const list = document.getElementById("otabiScheduleList");
    list.innerHTML = '<div class="skeleton skeleton-card"></div>';
    const res = await callGasApi({ action: "getOtabiSchedule", year: otabiYear, day: otabiDay });
    otabiScheduleEntries = res.entries || [];
    renderOtabiSchedule();
}

function renderOtabiSchedule() {
    const list = document.getElementById("otabiScheduleList");
    const filtered = otabiScheduleEntries.filter(e =>
        e.group === otabiGroup || e.group === "合同"
    );
    if (!filtered.length) {
        list.innerHTML = '<p class="no-event">スケジュールが登録されていません</p>';
        return;
    }
    list.innerHTML = filtered.map(e => {
        const mapBtn = e.address
            ? `<a class="otabi-map-icon" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}" target="_blank" rel="noopener">📍</a>`
            : '';
        const completeBtn = `<button class="otabi-complete-btn${e.actual_time ? ' done' : ''}" data-id="${e.entry_id}">${e.actual_time ? e.actual_time : '完了'}</button>`;
        return `
        <div class="otabi-item otabi-entry-item" data-id="${e.entry_id}">
            <div class="otabi-entry-no">${e.no}</div>
            <div class="otabi-entry-time-col">
                <span class="otabi-entry-time">${e.time || '--:--'}</span>
                ${e.actual_time ? `<div class="otabi-actual-wrap"><span class="otabi-actual-time">${e.actual_time}</span>${timeDiff(e.time, e.actual_time) ? `<span class="otabi-diff ${timeDiff(e.time,e.actual_time).startsWith('+') ? 'otabi-diff-late' : timeDiff(e.time,e.actual_time).startsWith('-') ? 'otabi-diff-early' : 'otabi-diff-zero'}">${timeDiff(e.time,e.actual_time)}</span>` : ''}</div>` : ''}
            </div>
            <div class="otabi-item-body">
                <div class="otabi-item-title">${e.place_name || '未設定'}</div>
                ${e.is_joint ? '<span class="otabi-joint-badge-row">合同</span>' : ''}
                ${e.memo ? `<div class="otabi-item-sub">${e.memo}</div>` : ''}
            </div>
            ${mapBtn}
            ${completeBtn}
        </div>`;
    }).join('');
    // 完了ボタン
    list.querySelectorAll(".otabi-complete-btn:not(.done)").forEach(btn => {
        btn.addEventListener("click", e => { e.stopPropagation(); markEntryComplete(btn.dataset.id); });
    });
    // 行タップで編集
    list.querySelectorAll(".otabi-entry-item").forEach(row => {
        row.addEventListener("click", () => {
            const entry = otabiScheduleEntries.find(e => e.entry_id == row.dataset.id);
            if (entry) openEntryForm(entry);
        });
    });
}

function timeDiff(scheduled, actual) {
    if (!scheduled || !actual) return "";
    const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    const diff = toMin(actual) - toMin(scheduled);
    if (diff === 0) return "±0";
    return (diff > 0 ? '+' : '') + diff + '分';
}

async function markEntryComplete(entryId) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const actual_time = `${hh}:${mm}`;
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "updateActualTime", entry_id: Number(entryId), actual_time });
        if (!res.success) throw new Error();
        const entry = otabiScheduleEntries.find(e => e.entry_id == entryId);
        if (entry) {
            entry.actual_time = actual_time;
            _updateSchedCacheLocally(entry, false);
        }
        renderOtabiSchedule();
    } catch(e) {
        alert("更新に失敗しました");
    } finally {
        loadingOverlay.style.display = "none";
    }
}

function _updateSchedCacheLocally(entry, isDelete) {
    const idx = otabiScheduleEntries.findIndex(e => e.entry_id === entry.entry_id);
    if (isDelete) {
        if (idx >= 0) otabiScheduleEntries.splice(idx, 1);
    } else {
        if (idx >= 0) otabiScheduleEntries[idx] = entry;
        else otabiScheduleEntries.push(entry);
    }
    // 進行状況キャッシュも更新
    if (_progGroups && Object.keys(_progGroups).length) {
        for (const grp of Object.keys(_progGroups)) {
            const arr = _progGroups[grp];
            const i2 = arr.findIndex(e => e.entry_id === entry.entry_id);
            if (isDelete) {
                if (i2 >= 0) arr.splice(i2, 1);
            } else {
                if (i2 >= 0) arr[i2] = entry;
            }
        }
        renderProgressOverlay(_progGroups);
    }
}

// ===== 進行状況オーバーレイ =====

async function openProgressOverlay() {
    const overlay = document.getElementById("otabiProgressOverlay");
    overlay.classList.add("active");
    overlay.querySelector("#otabiProgressContent").innerHTML = '<div class="skeleton skeleton-card"></div>';
    try {
        const res = await callGasApi({ action: "getOtabiAllProgress", year: otabiYear, day: otabiDay });
        if (!res.success) throw new Error();
        renderProgressOverlay(res.groups);
    } catch(e) {
        overlay.querySelector("#otabiProgressContent").innerHTML = '<p>読み込みに失敗しました</p>';
    }
}

let _progGroups = {};
let _progActiveGroup = "";

function renderProgressOverlay(groups) {
    _progGroups = groups;
    const groupKeys = Object.keys(groups).sort();
    if (!groupKeys.length) {
        document.getElementById("otabiProgressContent").innerHTML = '<p style="color:#aaa;padding:16px">データがありません</p>';
        return;
    }
    if (!_progActiveGroup || !groupKeys.includes(_progActiveGroup)) {
        _progActiveGroup = groupKeys[0];
    }
    // タブバー描画
    const tabBar = document.getElementById("progTabBar");
    tabBar.innerHTML = groupKeys.map(g => {
        const entries = groups[g] || [];
        const doneCount = entries.filter(e => !!e.actual_time).length;
        return `<button class="prog-tab-btn${g === _progActiveGroup ? ' active' : ''}" data-group="${g}">${g}<span class="prog-tab-count">${doneCount}/${entries.length}</span></button>`;
    }).join('');
    tabBar.querySelectorAll(".prog-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            _progActiveGroup = btn.dataset.group;
            renderProgressOverlay(_progGroups);
        });
    });
    // 選択中グループのコンテンツを描画
    const entries = groups[_progActiveGroup] || [];
    const rows = entries.map(e => {
        const isDone = !!e.actual_time;
        const diff = timeDiff(e.time, e.actual_time);
        const diffClass = diff.startsWith("+") ? "otabi-diff-late" : diff.startsWith("-") ? "otabi-diff-early" : "otabi-diff-zero";
        const jointBadge = e.is_joint ? '<span class="prog-joint-badge">合同</span>' : '';
        const donationHtml = e.donation ? `<span class="prog-donation">￥${Number(e.donation).toLocaleString()}</span>` : '';
        return `<div class="prog-row${isDone ? ' prog-done' : ''}${e.is_joint ? ' prog-joint' : ''}">
            <span class="prog-no">${e.no}</span>
            <span class="prog-time">${e.time || '--:--'}</span>
            <span class="prog-name">${e.place_name}${donationHtml}${jointBadge ? `<br>${jointBadge}` : ''}</span>
            <span class="prog-actual">${e.actual_time || ''}</span>
            ${diff ? `<span class="otabi-diff ${diffClass}">${diff}</span>` : '<span></span>'}
        </div>`;
    }).join('');
    document.getElementById("otabiProgressContent").innerHTML =
        `<div class="prog-group">${rows}</div>`;
}

function updateEntryFormGroupUI() {
    const group = document.querySelector('input[name="entryGroup"]:checked')?.value;
    document.getElementById("entryFormGroupLabel").textContent =
        group === "上" ? "上組" : group === "下" ? "下組" : "合同";
}

function openEntryForm(entry = null) {
    document.getElementById("entryFormId").value = entry?.entry_id || "";
    document.getElementById("entryFormNo").value = entry?.no || "";
    document.getElementById("entryFormTime").value = entry?.time || "";
    document.getElementById("entryFormActual").value = entry?.actual_time || "";
    document.getElementById("entryFormMemo").value = entry?.memo || "";
    document.getElementById("entryFormDonation").value = entry?.donation || "";
    document.getElementById("entryFormIsJoint").checked = !!entry?.is_joint;

    // 訪問先セレクト
    const sel = document.getElementById("entryFormPlace");
    sel.innerHTML = '<option value="">訪問先を選択</option>' +
        otabiPlaces.map(p => `<option value="${p.place_id}"${entry?.place_id == p.place_id ? ' selected' : ''}>${p.name}</option>`).join('');

    // グループラジオ
    const g = entry?.group || "上";
    const radio = document.querySelector(`input[name="entryGroup"][value="${g}"]`);
    if (radio) radio.checked = true;
    updateEntryFormGroupUI();

    document.getElementById("deleteEntryBtn").style.display = entry ? "block" : "none";
    document.getElementById("otabiEntryFormCard").classList.add("active");
}

async function saveEntryForm() {
    const placeId = document.getElementById("entryFormPlace").value;
    if (!placeId) return alert("訪問先を選択してください");
    const id = document.getElementById("entryFormId").value;
    const entry = {
        entry_id: id ? Number(id) : null,
        year: otabiYear,
        day: otabiDay,
        no: document.getElementById("entryFormNo").value.trim(),
        time: document.getElementById("entryFormTime").value,
        actual_time: document.getElementById("entryFormActual").value,
        memo: document.getElementById("entryFormMemo").value.trim(),
        donation: document.getElementById("entryFormDonation").value,
        place_id: Number(placeId),
        group: document.querySelector('input[name="entryGroup"]:checked')?.value || "上",
        is_joint: document.getElementById("entryFormIsJoint").checked
    };
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "saveOtabiEntry", entry });
        if (!res.success) throw new Error();
        document.getElementById("otabiEntryFormCard").classList.remove("active");
        const saved = res.entry || entry;
        _updateSchedCacheLocally(saved, false);
        renderOtabiSchedule();
    } catch(e) {
        alert("保存に失敗しました");
    } finally {
        loadingOverlay.style.display = "none";
    }
}

async function deleteEntryForm() {
    const id = document.getElementById("entryFormId").value;
    if (!id) return;
    if (!confirm("このスケジュールを削除しますか？")) return;
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "deleteOtabiEntry", entry_id: Number(id) });
        if (!res.success) throw new Error();
        document.getElementById("otabiEntryFormCard").classList.remove("active");
        _updateSchedCacheLocally({ entry_id: Number(id) }, true);
        renderOtabiSchedule();
    } catch(e) {
        alert("削除に失敗しました");
    } finally {
        loadingOverlay.style.display = "none";
    }
}

// ===== お花代 =====

let otabiDonEntries = [];
let otabiDonSearch = "";

async function loadOtabiDonations(forceReload = false) {
    if (!forceReload && otabiDonEntries.length) { renderOtabiDonGrid(); return; }
    const grid = document.getElementById("otabiDonGrid");
    grid.innerHTML = '<div class="skeleton skeleton-card"></div>';
    const res = await callGasApi({ action: "getOtabiSchedule", year: otabiYear, day: otabiDonDay });
    otabiDonEntries = res.entries || [];
    renderOtabiDonGrid();
}

function renderOtabiDonGrid() {
    const grid = document.getElementById("otabiDonGrid");
    let filtered = otabiDonEntries.filter(e =>
        e.group === otabiDonGroup || e.group === "合同"
    );
    if (otabiDonSearch) {
        const q = otabiDonSearch.toLowerCase();
        filtered = filtered.filter(e => (e.place_name || "").toLowerCase().includes(q));
    }
    if (!filtered.length) {
        grid.innerHTML = '<p class="no-event">データがありません</p>';
        return;
    }
    let total = 0;
    filtered.forEach(e => { total += Number(e.donation) || 0; });
    document.getElementById("otabiDonTotal").textContent = `￥${total.toLocaleString()}`;
    grid.innerHTML = filtered.map((e) => {
        const i = otabiDonEntries.indexOf(e);
        const isJoint = e.group === "合同";
        const jointBadge = isJoint ? '<span class="otabi-joint-badge">合同</span>' : '';
        return `
        <div class="otabi-item otabi-don-item">
            <div class="otabi-entry-no">${e.no || '-'}</div>
            <div class="otabi-item-body">
                <div class="otabi-item-title">${e.place_name || ''}${jointBadge}</div>
            </div>
            <div class="dg-amount-col">
                <input type="number" inputmode="numeric" class="dg-input"
                    value="${e.donation || ''}" placeholder="0"
                    data-idx="${i}"
                    onblur="saveDonationInline(this)"
                    onfocus="this.select()">
                <span class="dg-unit">円</span>
            </div>
        </div>`;
    }).join('');
}

async function saveDonationInline(input) {
    const idx = Number(input.dataset.idx);
    const entry = otabiDonEntries[idx];
    if (!entry) return;
    const donation = input.value.trim();
    if (String(entry.donation || '') === donation) return;
    try {
        const res = await callGasApi({
            action: "saveOtabiEntry",
            entry: { ...entry, donation }
        });
        if (res.success) {
            entry.donation = donation;
            // 合計更新
            let total = 0;
            otabiDonEntries
                .filter(e => e.group === otabiDonGroup || e.group === "合同")
                .forEach(e => { total += Number(e.donation) || 0; });
            document.getElementById("otabiDonTotal").textContent = `￥${total.toLocaleString()}`;
        }
    } catch(err) { /* silent */ }
}

// ===== 一括入力 =====

let bulkRows = [];

function openBulkForm() {
    bulkRows = [];
    renderBulkRows();
    document.getElementById("otabiBulkFormCard").classList.add("active");
    loadOtabiPlaces();
}

function addBulkRow() {
    bulkRows.push({ no: '', place_id: '', place_name: '', time: '', memo: '', donation: '', is_joint: false });
    renderBulkRows();
}

function removeBulkRow(idx) {
    bulkRows.splice(idx, 1);
    renderBulkRows();
}

function renderBulkRows() {
    const container = document.getElementById("otabiBulkRows");
    // 既存エントリ表示
    const existingHtml = otabiScheduleEntries
        .filter(e => e.group === otabiGroup || e.group === "合同")
        .map(e => {
            const jointBadge = e.group === '合同' ? '<span class="bulk-joint-badge">合同</span>' : '';
            return `<div class="bulk-existing-row">
                <span class="bulk-exist-no">${e.no}</span>
                <span class="bulk-exist-name">${e.place_name || '-'}${jointBadge}</span>
                <span class="bulk-exist-time">${e.time || ''}</span>
            </div>`;
        }).join('');
    const newRowsHtml = bulkRows.map((row, idx) => `
        <div class="otabi-bulk-row" data-idx="${idx}">
            <div class="otabi-bulk-top">
                <span class="otabi-drag-handle">⠿</span>
                <input type="text" inputmode="numeric" class="bulk-no" placeholder="番号" value="${row.no}" data-field="no" data-idx="${idx}">
                <input type="time" class="bulk-time" value="${row.time}" data-field="time" data-idx="${idx}">
                <button class="otabi-bulk-remove" onclick="removeBulkRow(${idx})">✕</button>
            </div>
            <input type="text" class="bulk-place-search" placeholder="訪問先を検索..." value="${row.place_name}" data-idx="${idx}">
            ${row.place_id ? '' : `<div class="bulk-place-candidates" data-idx="${idx}"></div>`}
            ${row.place_id ? `<input type="text" class="bulk-place-name" value="${row.place_name}" readonly data-idx="${idx}">` : ''}
            <div class="otabi-bulk-bottom">
                <input type="text" class="bulk-memo" placeholder="メモ" value="${row.memo}" data-field="memo" data-idx="${idx}">
                <input type="number" inputmode="numeric" class="bulk-donation" placeholder="お花代" value="${row.donation}" data-field="donation" data-idx="${idx}">
                <label class="otabi-checkbox-label"><input type="checkbox" ${row.is_joint ? 'checked' : ''} data-field="is_joint" data-idx="${idx}"> 合同</label>
            </div>
        </div>
    `).join('');
    container.innerHTML = existingHtml + newRowsHtml;

    // イベント登録
    container.querySelectorAll("input[data-field]").forEach(inp => {
        inp.addEventListener("change", () => {
            const idx2 = Number(inp.dataset.idx);
            const field = inp.dataset.field;
            bulkRows[idx2][field] = inp.type === "checkbox" ? inp.checked : inp.value;
        });
    });
    // 訪問先検索
    container.querySelectorAll(".bulk-place-search").forEach(inp => {
        inp.addEventListener("input", () => {
            const idx2 = Number(inp.dataset.idx);
            const q = inp.value.toLowerCase();
            bulkRows[idx2].place_name = inp.value;
            bulkRows[idx2].place_id = '';
            const cands = document.querySelector(`.bulk-place-candidates[data-idx="${idx2}"]`);
            if (!cands) return;
            if (!q) { cands.innerHTML = ''; return; }
            const matches = otabiPlaces.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
            cands.innerHTML = matches.map(p =>
                `<div class="bulk-candidate" data-place-id="${p.place_id}" data-name="${p.name}">${p.name}</div>`
            ).join('');
            cands.querySelectorAll(".bulk-candidate").forEach(c => {
                c.addEventListener("click", () => {
                    bulkRows[idx2].place_id = c.dataset.placeId;
                    bulkRows[idx2].place_name = c.dataset.name;
                    renderBulkRows();
                });
            });
        });
    });

    // Sortable.js
    if (window.Sortable && container) {
        Sortable.create(container, {
            handle: '.otabi-drag-handle',
            animation: 150,
            ghostClass: 'otabi-drag-ghost',
            onEnd(evt) {
                const moved = bulkRows.splice(evt.oldIndex, 1)[0];
                bulkRows.splice(evt.newIndex, 0, moved);
            }
        });
    }
}

async function saveBulkForm() {
    const valid = bulkRows.filter(r => r.place_id);
    if (!valid.length) return alert("訪問先が選択されていない行があります");
    const entries = valid.map(r => ({
        entry_id: null,
        year: otabiYear,
        day: otabiDay,
        no: r.no,
        time: r.time,
        memo: r.memo,
        donation: r.donation,
        place_id: Number(r.place_id),
        group: otabiGroup === "合同" ? "合同" : otabiGroup.replace("組",""),
        is_joint: r.is_joint
    }));
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "bulkSaveOtabiEntries", entries });
        if (!res.success) throw new Error();
        document.getElementById("otabiBulkFormCard").classList.remove("active");
        otabiScheduleEntries = [];
        await loadOtabiSchedule(true);
    } catch(e) {
        alert("保存に失敗しました");
    } finally {
        loadingOverlay.style.display = "none";
    }
}
