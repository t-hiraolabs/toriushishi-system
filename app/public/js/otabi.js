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
    // 管理者のみ設定タブを表示
    const settingsTabBtn = document.getElementById("otabiSettingsTabBtn");
    if (settingsTabBtn) settingsTabBtn.style.display = (typeof userRole !== "undefined" && userRole === "admin") ? "" : "none";
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
    } catch(e) { alert("保存中にエラーが発生しました"); }
    finally { loadingOverlay.style.display = "none"; }
}

async function deletePlaceForm() {
    if (!confirm("この訪問先を削除しますか？")) return;
    const id = document.getElementById("placeFormId").value;
    loadingOverlay.style.display = "flex";
    try {
        await callGasApi({ action: "deleteOtabiPlace", placeId: Number(id) });
        document.getElementById("otabiPlaceFormCard").classList.remove("active");
        otabiPlaces = [];
        await loadOtabiPlaces();
    } finally { loadingOverlay.style.display = "none"; }
}

// ===== スケジュール =====

// キー: "year_group_day" → entries[]
const otabiSchedCache = {};
let otabiSchedCachedYear = null;

function renderOtabiYearChips() {
    const container = document.getElementById("otabiSchedYearChips");
    if (!container) return;
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];
    container.innerHTML = years.map(y =>
        `<button class="otabi-year-chip${y === otabiYear ? " active" : ""}" data-year="${y}">${y}年</button>`
    ).join("");
    container.querySelectorAll(".otabi-year-chip").forEach(btn => {
        btn.addEventListener("click", () => {
            otabiYear = Number(btn.dataset.year);
            renderOtabiYearChips();
            loadOtabiSchedule();
        });
    });
}

async function loadOtabiSchedule(forceReload = false) {
    renderOtabiYearChips();
    document.querySelectorAll(".otabi-group-btn").forEach(b => b.classList.toggle("active", b.dataset.group === otabiGroup));
    document.querySelectorAll(".otabi-day-btn").forEach(b => b.classList.toggle("active", b.dataset.day === otabiDay));

    const cacheKey = `${otabiYear}_${otabiGroup}_${otabiDay}`;
    const yearChanged = otabiSchedCachedYear !== otabiYear;

    if (forceReload || yearChanged || !otabiSchedCache[cacheKey]) {
        const list = document.getElementById("otabiScheduleList");
        list.innerHTML = [1,2,3].map(() => '<div class="skeleton skeleton-card"></div>').join('');
        if (yearChanged) {
            // 年変更時はキャッシュ全クリア
            Object.keys(otabiSchedCache).forEach(k => delete otabiSchedCache[k]);
            otabiSchedCachedYear = otabiYear;
        }
        const fetches = [callGasApi({ action: "getOtabiSchedule", year: otabiYear, group: otabiGroup, day: otabiDay })];
        if (!otabiPlaces.length) fetches.push(callGasApi({ action: "getOtabiPlaces" }));
        const [schedRes, placesRes] = await Promise.all(fetches);
        otabiSchedCache[cacheKey] = schedRes.entries || [];
        if (placesRes) otabiPlaces = placesRes.places || [];
    }

    otabiScheduleEntries = otabiSchedCache[cacheKey];
    renderOtabiSchedule();
}

// 保存・削除後にキャッシュをローカルで更新して再描画（GAS再取得なし）
function _updateSchedCacheLocally(entry, isDelete) {
    Object.keys(otabiSchedCache).forEach(cacheKey => {
        const entries = otabiSchedCache[cacheKey];
        const idx = entries.findIndex(e => e.entry_id === entry.entry_id);
        if (isDelete) {
            if (idx >= 0) entries.splice(idx, 1);
        } else {
            if (idx >= 0) {
                entries[idx] = entry;
            } else {
                // 新規エントリは関連するキャッシュに追加
                const [year, group, day] = cacheKey.split("_");
                if (Number(year) === entry.year && entry.day === day
                    && (entry.group === group || entry.group === "合同")) {
                    entries.push(entry);
                    entries.sort((a, b) => Number(a.no) - Number(b.no));
                }
            }
        }
    });
    otabiScheduleEntries = otabiSchedCache[`${otabiYear}_${otabiGroup}_${otabiDay}`] || [];
    renderOtabiSchedule();
}

function invalidateSchedCache() {
    Object.keys(otabiSchedCache).forEach(k => delete otabiSchedCache[k]);
    otabiSchedCachedYear = null;
}

let otabiBulkSortable = null;

function timeDiff(planned, actual) {
    if (!planned || !actual) return "";
    const [ph, pm] = planned.split(":").map(Number);
    const [ah, am] = actual.split(":").map(Number);
    const diff = (ah * 60 + am) - (ph * 60 + pm);
    if (diff === 0) return "±0分";
    return diff > 0 ? `+${diff}分` : `${diff}分`;
}

function renderOtabiSchedule() {
    const list = document.getElementById("otabiScheduleList");
    if (!otabiScheduleEntries.length) {
        list.innerHTML = '<p class="no-event">スケジュールが登録されていません</p>';
        return;
    }
    list.innerHTML = otabiScheduleEntries.map(e => {
        const place = otabiPlaces.find(p => p.place_id == e.place_id);
        const mapBtn = place?.address
            ? `<a class="otabi-map-icon" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}" target="_blank" rel="noopener" title="地図を見る"><i class="fas fa-map-marker-alt"></i></a>`
            : '';
        const done = !!e.actual_time;
        const diff = timeDiff(e.time, e.actual_time);
        const diffClass = diff.startsWith("+") ? "otabi-diff-late" : diff.startsWith("-") ? "otabi-diff-early" : "otabi-diff-zero";
        const actualHtml = done
            ? `<div class="otabi-actual-wrap"><span class="otabi-actual-time">${e.actual_time}</span><span class="otabi-diff ${diffClass}">${diff}</span></div>`
            : '';
        const completeBtn = done
            ? `<button class="otabi-complete-btn done" data-id="${e.entry_id}">完了済</button>`
            : `<button class="otabi-complete-btn" data-id="${e.entry_id}">完了</button>`;
        return `
        <div class="otabi-item otabi-entry-item${done ? ' otabi-entry-done' : ''}" data-entry-id="${e.entry_id}">
            <div class="otabi-entry-no">${e.no || '-'}</div>
            <div class="otabi-entry-time-col">
                <div class="otabi-entry-time">${e.time || '--:--'}</div>
                ${actualHtml}
            </div>
            <div class="otabi-item-body">
                <div class="otabi-item-title">${e.place_name || '未設定'}</div>
                ${e.memo ? `<div class="otabi-item-sub">${e.memo}</div>` : ''}
            </div>
            ${e.is_joint ? '<span class="otabi-joint-badge">合同</span>' : ''}
            ${mapBtn}
            ${completeBtn}
        </div>`;
    }).join('');
    list.querySelectorAll(".otabi-entry-item").forEach(item => {
        item.addEventListener("click", e => {
            if (e.target.closest(".otabi-map-icon") || e.target.closest(".otabi-complete-btn")) return;
            openEntryForm(otabiScheduleEntries.find(en => en.entry_id == item.dataset.entryId));
        });
    });
    list.querySelectorAll(".otabi-complete-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            markEntryComplete(Number(btn.dataset.id));
        });
    });

}

async function markEntryComplete(entryId) {
    const entry = otabiScheduleEntries.find(e => e.entry_id == entryId);
    if (!entry) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const defaultTime = `${hh}:${mm}`;
    const input = prompt(`「${entry.place_name}」の到着時間を入力してください`, defaultTime);
    if (input === null) return;
    const timeVal = input.trim() || defaultTime;
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "markOtabiComplete", entryId, actualTime: timeVal });
        if (!res.success) throw new Error(res.msg || "失敗");
        entry.actual_time = timeVal;
        const cacheKey = `${otabiYear}_${otabiGroup}_${otabiDay}`;
        if (otabiSchedCache[cacheKey]) {
            const cached = otabiSchedCache[cacheKey].find(e => e.entry_id == entryId);
            if (cached) cached.actual_time = timeVal;
        }
        renderOtabiSchedule();
    } catch(err) { alert("保存中にエラーが発生しました"); }
    finally { loadingOverlay.style.display = "none"; }
}

async function openProgressOverlay() {
    const overlay = document.getElementById("otabiProgressOverlay");
    overlay.style.display = "block";
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
        document.getElementById("otabiProgressContent").innerHTML = '<p style="color:#aaa;">データがありません</p>';
        document.getElementById("progTabBar").innerHTML = '';
        return;
    }
    if (!_progActiveGroup || !groupKeys.includes(_progActiveGroup)) {
        _progActiveGroup = groupKeys[0];
    }
    // タブを描画
    const tabBar = document.getElementById("progTabBar");
    tabBar.innerHTML = groupKeys.map(g => {
        const entries = groups[g] || [];
        const done = entries.filter(e => e.actual_time).length;
        return `<button class="prog-tab-btn${g === _progActiveGroup ? ' active' : ''}" data-group="${g}">${g} <span class="prog-tab-count">${done}/${entries.length}</span></button>`;
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
            <span class="prog-name">${e.place_name}${donationHtml}${jointBadge}</span>
            <span class="prog-actual">${e.actual_time || ''}</span>
            ${diff ? `<span class="otabi-diff ${diffClass}">${diff}</span>` : '<span></span>'}
        </div>`;
    }).join('');
    document.getElementById("otabiProgressContent").innerHTML =
        `<div class="prog-group">${rows}</div>`;
}

function updateEntryFormGroupUI() {
    const group = document.querySelector('input[name="entryGroup"]:checked')?.value;
    const isJoint = group === "合同";
    document.getElementById("entryFormNoRow").style.display = isJoint ? "none" : "";
    document.getElementById("entryFormJointNoRow").style.display = isJoint ? "" : "none";
    document.getElementById("entryFormJointTimeRow").style.display = isJoint ? "" : "none";
}

async function openEntryForm(entry = null) {
    if (!otabiPlaces.length) await loadOtabiPlaces();
    document.getElementById("entryFormId").value = entry?.entry_id || "";
    const entryDay = entry?.day || otabiDay;
    document.querySelectorAll('input[name="entryDay"]').forEach(r => { r.checked = r.value === entryDay; });
    const nextNo = otabiScheduleEntries.length > 0
        ? Math.max(...otabiScheduleEntries.filter(e => e.group !== "合同").map(e => Number(e.no) || 0)) + 1 : 1;
    document.getElementById("entryFormNo").value = entry?.no ?? nextNo;
    document.getElementById("entryFormNoUe").value = entry?.no_ue || "";
    document.getElementById("entryFormNoShita").value = entry?.no_shita || "";
    document.getElementById("entryFormTime").value = entry?.time || "";
    document.getElementById("entryFormTimeJoint").value = entry?.time || "";
    document.getElementById("entryFormPlaceName").value = entry?.place_name || "";
    document.getElementById("entryFormMemo").value = entry?.memo || "";
    document.getElementById("entryFormDonation").value = entry?.donation || "";

    const select = document.getElementById("entryFormPlaceSelect");
    select.innerHTML = '<option value="">― マスタから選択 ―</option>' +
        otabiPlaces.map(p => `<option value="${p.place_id}" ${entry?.place_id == p.place_id ? 'selected' : ''}>${p.name}（${p.group}）</option>`).join('');
    select.onchange = () => {
        const p = otabiPlaces.find(pl => pl.place_id == select.value);
        if (p) document.getElementById("entryFormPlaceName").value = p.name;
    };
    const entryGroup = entry?.group || otabiGroup;
    document.querySelectorAll('input[name="entryGroup"]').forEach(r => { r.checked = r.value === entryGroup; });
    updateEntryFormGroupUI();
    document.querySelectorAll('input[name="entryGroup"]').forEach(r =>
        r.addEventListener("change", updateEntryFormGroupUI)
    );

    document.getElementById("deleteEntryBtn").style.display = entry ? "block" : "none";
    document.getElementById("otabiEntryFormCard").classList.add("active");
}

async function saveEntryForm() {
    const placeName = document.getElementById("entryFormPlaceName").value.trim();
    if (!placeName) return alert("訪問先名を入力してください");
    const id = document.getElementById("entryFormId").value;
    const group = document.querySelector('input[name="entryGroup"]:checked')?.value || otabiGroup;
    const isJoint = group === "合同";
    const no_ue = isJoint ? Number(document.getElementById("entryFormNoUe").value) || 0 : "";
    const no_shita = isJoint ? Number(document.getElementById("entryFormNoShita").value) || 0 : "";
    const time = isJoint
        ? document.getElementById("entryFormTimeJoint").value
        : document.getElementById("entryFormTime").value;
    const entry = {
        entry_id: id ? Number(id) : null,
        year: otabiYear,
        group,
        day: document.querySelector('input[name="entryDay"]:checked')?.value || "土曜",
        no: isJoint ? (no_ue || no_shita) : Number(document.getElementById("entryFormNo").value) || 0,
        no_ue,
        no_shita,
        time,
        place_id: document.getElementById("entryFormPlaceSelect").value || "",
        place_name: placeName,
        memo: document.getElementById("entryFormMemo").value.trim(),
        donation: Number(document.getElementById("entryFormDonation").value) || 0
    };
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "saveOtabiEntry", entry });
        if (!res.success) throw new Error("保存失敗");
        document.getElementById("otabiEntryFormCard").classList.remove("active");
        // キャッシュをローカル更新して再描画（GAS再取得なし）
        const savedEntry = Object.assign({}, entry, { entry_id: res.entry_id || entry.entry_id });
        _updateSchedCacheLocally(savedEntry, false);
    } catch(e) { alert("保存中にエラーが発生しました"); }
    finally { loadingOverlay.style.display = "none"; }
}

async function deleteEntryForm() {
    if (!confirm("このエントリを削除しますか？")) return;
    const id = document.getElementById("entryFormId").value;
    loadingOverlay.style.display = "flex";
    try {
        await callGasApi({ action: "deleteOtabiEntry", entryId: Number(id) });
        document.getElementById("otabiEntryFormCard").classList.remove("active");
        // キャッシュから削除して再描画（GAS再取得なし）
        _updateSchedCacheLocally({ entry_id: Number(id) }, true);
    } finally { loadingOverlay.style.display = "none"; }
}

// ===== 一括入力 =====

async function openBulkEntryForm() {
    if (!otabiPlaces.length) await loadOtabiPlaces();
    renderBulkForm();
    document.getElementById("otabiBulkEntryCard").classList.add("active");
}

function renderBulkForm() {
    const container = document.getElementById("otabiBulkRows");
    container.innerHTML = "";

    // 既存エントリをドラッグ可能な表示行として追加
    const sorted = [...otabiScheduleEntries].sort((a, b) => Number(a.no) - Number(b.no));
    sorted.forEach(e => {
        const row = document.createElement("div");
        row.className = "bulk-existing-row";
        row.dataset.entryId = e.entry_id;
        const isJoint = e.group === "合同";
        row.innerHTML = `
            <div class="otabi-drag-handle">⠷</div>
            <span class="bulk-exist-no">${e.no}</span>
            ${isJoint ? '<span class="bulk-joint-badge">合同</span>' : ''}
            <span class="bulk-exist-name">${e.place_name}</span>
            <span class="bulk-exist-time">${e.time || '--:--'}</span>
        `;
        container.appendChild(row);
    });

    // 既存なければ空行3つ
    if (sorted.length === 0) {
        for (let i = 0; i < 3; i++) container.appendChild(createBulkNewRow());
    }

    // Sortable初期化
    if (otabiBulkSortable) { otabiBulkSortable.destroy(); otabiBulkSortable = null; }
    if (typeof Sortable !== "undefined") {
        otabiBulkSortable = new Sortable(container, {
            animation: 150,
            handle: ".otabi-drag-handle",
            ghostClass: "otabi-drag-ghost"
        });
    }
}

function createBulkNewRow() {
    const div = document.createElement("div");
    div.className = "otabi-bulk-row";

    div.innerHTML = `
        <div class="otabi-bulk-top">
            <div class="otabi-drag-handle">⠷</div>
            <button class="otabi-bulk-remove" type="button">✕</button>
        </div>
        <input type="text" class="bulk-place-search" placeholder="訪問先を検索…" autocomplete="off" />
        <div class="bulk-place-candidates" style="display:none;"></div>
        <input type="hidden" class="bulk-place-id" />
        <input type="text" class="bulk-place-name" placeholder="訪問先名 *" />
    `;

    div.querySelector(".otabi-bulk-remove").addEventListener("click", () => div.remove());

    const searchInput = div.querySelector(".bulk-place-search");
    const candidates = div.querySelector(".bulk-place-candidates");
    const nameInput = div.querySelector(".bulk-place-name");
    const idInput = div.querySelector(".bulk-place-id");

    const updateCandidates = () => {
        const q = searchInput.value.trim().toLowerCase();
        const filtered = q
            ? otabiPlaces.filter(p => p.name.toLowerCase().includes(q) || (p.group || "").includes(q))
            : otabiPlaces;
        if (!filtered.length) { candidates.style.display = "none"; return; }
        candidates.innerHTML = filtered.map(p =>
            `<div class="bulk-candidate" data-id="${p.place_id}" data-name="${p.name}">${p.name}（${p.group || '-'}）</div>`
        ).join('');
        candidates.style.display = "";
        candidates.querySelectorAll(".bulk-candidate").forEach(c => {
            c.addEventListener("click", () => {
                idInput.value = c.dataset.id;
                nameInput.value = c.dataset.name;
                searchInput.value = c.dataset.name;
                candidates.style.display = "none";
            });
        });
    };

    searchInput.addEventListener("input", updateCandidates);
    searchInput.addEventListener("focus", updateCandidates);
    searchInput.addEventListener("blur", () => {
        setTimeout(() => {
            candidates.style.display = "none";
            // 候補選択なしでも入力テキストを訪問先名にフォールバック
            if (!nameInput.value.trim() && searchInput.value.trim()) {
                nameInput.value = searchInput.value.trim();
            }
        }, 150);
    });

    return div;
}

async function saveBulkEntries() {
    const allRows = [...document.querySelectorAll("#otabiBulkRows .bulk-existing-row, #otabiBulkRows .otabi-bulk-row")];
    const newEntries = [];
    const reorderUpdates = [];
    let no = 1;

    allRows.forEach(row => {
        if (row.classList.contains("bulk-existing-row")) {
            // 既存エントリ → no更新
            reorderUpdates.push({ entry_id: Number(row.dataset.entryId), no });
        } else {
            // 新規行 → 訪問先名があれば保存（検索フィールドもフォールバック）
            const name = row.querySelector(".bulk-place-name").value.trim()
                || row.querySelector(".bulk-place-search").value.trim();
            if (name) {
                newEntries.push({
                    entry_id: null,
                    year: otabiYear,
                    group: otabiGroup,
                    day: otabiDay,
                    no,
                    no_ue: "",
                    no_shita: "",
                    time: "",
                    place_id: row.querySelector(".bulk-place-id").value || "",
                    place_name: name,
                    memo: "",
                    donation: 0
                });
            } else {
                no--; // 空行はnoをカウントしない
            }
        }
        no++;
    });

    if (!newEntries.length && reorderUpdates.length === 0) return alert("変更がありません");
    if (!confirm(`新規${newEntries.length}件を保存し、並び順を更新します。よろしいですか？`)) return;
    loadingOverlay.style.display = "flex";
    try {
        // GASタイムアウト防止のため順次実行
        for (const entry of newEntries) {
            await callGasApi({ action: "saveOtabiEntry", entry });
        }
        if (reorderUpdates.length) {
            await callGasApi({ action: "reorderOtabiEntries", updates: reorderUpdates });
        }
        document.getElementById("otabiBulkEntryCard").classList.remove("active");
        invalidateSchedCache(); await loadOtabiSchedule();
    } catch(e) { alert("保存中にエラーが発生しました"); }
    finally { loadingOverlay.style.display = "none"; }
}

async function copyOtabiSchedule() {
    if (otabiScheduleEntries.length > 0) {
        alert("すでにスケジュールが登録されています。\n前年コピーはデータが空の場合のみ使用できます。");
        return;
    }
    const fromYear = otabiYear - 1;
    const groupLabel = otabiGroup;
    if (!confirm(`${fromYear}年の${groupLabel}スケジュールを${otabiYear}年にコピーしますか？\n(お花代はリセットされます)`)) return;
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "copyOtabiSchedule", fromYear, toYear: otabiYear, group: otabiGroup });
        if (!res.success) return alert(res.msg || "コピー失敗");
        alert(`${res.count}件コピーしました`);
        invalidateSchedCache(); await loadOtabiSchedule();
    } finally { loadingOverlay.style.display = "none"; }
}

// ===== お花代（Excel風一括入力） =====

let otabiDonEntries = [];   // 現在表示中（グループ＋曜日でフィルタ済み）
let otabiDonAllCache = [];  // その年の全エントリキャッシュ
let otabiDonCachedYear = null;

async function loadOtabiDonations(forceReload = false) {
    document.getElementById("otabiDonYear").textContent = otabiYear;
    document.querySelectorAll(".otabi-don-group-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.group === otabiDonGroup));
    document.querySelectorAll(".otabi-don-day-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.day === otabiDonDay));

    // 年が変わった場合・強制リロード時のみアピコール
    if (forceReload || otabiDonCachedYear !== otabiYear) {
        const grid = document.getElementById("otabiDonationGrid");
        grid.innerHTML = '<div class="skeleton skeleton-card"></div>';
        const res = await callGasApi({ action: "getOtabiDonations", year: otabiYear });
        otabiDonAllCache = (res.success && res.entries) ? res.entries : [];
        otabiDonCachedYear = otabiYear;
    }

    otabiDonEntries = otabiDonAllCache
        .filter(e => (e.group === otabiDonGroup || e.group === "合同") && e.day === otabiDonDay)
        .sort((a, b) => Number(a.no) - Number(b.no));
    renderOtabiDonations();
}

function renderOtabiDonations() {
    const grid = document.getElementById("otabiDonationGrid");
    if (!otabiDonEntries.length) {
        grid.innerHTML = '<p class="no-event">スケジュールが登録されていません</p>';
        updateDonationTotal();
        return;
    }
    const query = (document.getElementById("otabiDonSearch")?.value || "").trim();
    const filtered = query
        ? otabiDonEntries.filter(e => (e.place_name || "").includes(query))
        : otabiDonEntries;
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
                       data-idx="${i}" value="${e.donation || ''}"
                       placeholder="0" min="0" step="500" />
                <span class="dg-unit">円</span>
            </div>
        </div>`;
    }).join('');

    const inputs = [...grid.querySelectorAll(".dg-input")];
    inputs.forEach((input, idx) => {
        input.addEventListener("input", () => {
            const entryIdx = Number(input.dataset.idx);
            otabiDonEntries[entryIdx].donation = Number(input.value) || 0;
            updateDonationTotal();
        });
        input.addEventListener("keydown", ev => {
            if (ev.key === "Enter" || ev.key === "ArrowDown") {
                ev.preventDefault();
                (inputs[idx + 1] || inputs[0])?.focus();
            } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                (inputs[idx - 1] || inputs[inputs.length - 1])?.focus();
            }
        });
        input.addEventListener("focus", () => input.select());
    });
    updateDonationTotal();
}

function updateDonationTotal() {
    const total = otabiDonEntries.reduce((s, e) => s + (Number(e.donation) || 0), 0);
    document.getElementById("otabiDonationTotal").innerHTML =
        `${otabiDonGroup}・${otabiDonDay} 合計 <span>￥${total.toLocaleString()}</span>`;
}

async function saveOtabiDonations() {
    if (!otabiDonEntries.length) return;
    const donations = otabiDonEntries.map(e => ({ entry_id: e.entry_id, donation: Number(e.donation) || 0 }));
    const btn = document.getElementById("saveDonationsBtn");
    btn.disabled = true; btn.textContent = "保存中…";
    try {
        const res = await callGasApi({ action: "saveOtabiDonations", donations });
        if (!res.success) throw new Error();
        // キャッシュ内の該当エントリの金額を更新
        donations.forEach(d => {
            const cached = otabiDonAllCache.find(e => e.entry_id == d.entry_id);
            if (cached) cached.donation = d.donation;
        });
        btn.textContent = "保存しました ✓";
        setTimeout(() => { btn.textContent = "お花代を保存"; btn.disabled = false; }, 1500);
    } catch (e) {
        alert("保存中にエラーが発生しました");
        btn.textContent = "お花代を保存"; btn.disabled = false;
    }
}

// ===== 初期化 =====
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".otabi-tab-btn").forEach(btn =>
        btn.addEventListener("click", () => switchOtabiTab(btn.dataset.tab))
    );
    // 訪問先フィルタ
    document.querySelectorAll(".otabi-place-filter-btn").forEach(btn =>
        btn.addEventListener("click", () => {
            document.querySelectorAll(".otabi-place-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            otabiPlaceFilter = btn.dataset.group;
            renderOtabiPlaces();
        })
    );
    // スケジュール
    document.querySelectorAll(".otabi-group-btn").forEach(btn =>
        btn.addEventListener("click", () => { otabiGroup = btn.dataset.group; invalidateSchedCache(); loadOtabiSchedule(); })
    );
    document.querySelectorAll(".otabi-day-btn").forEach(btn =>
        btn.addEventListener("click", () => { otabiDay = btn.dataset.day; loadOtabiSchedule(); })
    );
    renderOtabiYearChips();
    // お花代
    document.getElementById("otabiDonYearPrev")?.addEventListener("click",  () => { otabiYear--; loadOtabiDonations(); });
    document.getElementById("otabiDonYearNext")?.addEventListener("click",  () => { otabiYear++; loadOtabiDonations(); });
    document.querySelectorAll(".otabi-don-group-btn").forEach(btn =>
        btn.addEventListener("click", () => { otabiDonGroup = btn.dataset.group; loadOtabiDonations(); })
    );
    document.querySelectorAll(".otabi-don-day-btn").forEach(btn =>
        btn.addEventListener("click", () => { otabiDonDay = btn.dataset.day; loadOtabiDonations(); })
    );
    document.getElementById("otabiDonSearch")?.addEventListener("input", () => renderOtabiDonations());
    document.getElementById("saveDonationsBtn")?.addEventListener("click", saveOtabiDonations);
    document.getElementById("addPlaceBtn")?.addEventListener("click", () => openPlaceForm());
    document.getElementById("addEntryBtn")?.addEventListener("click", () => openBulkEntryForm());
    document.getElementById("saveBulkEntriesBtn")?.addEventListener("click", saveBulkEntries);
    document.getElementById("addBulkRowBtn")?.addEventListener("click", () => {
        const container = document.getElementById("otabiBulkRows");
        const row = createBulkNewRow();
        container.appendChild(row);
        row.querySelector(".bulk-place-search").focus();
    });
    document.getElementById("copyScheduleBtn")?.addEventListener("click", copyOtabiSchedule);
    document.getElementById("otabiProgressBtn")?.addEventListener("click", openProgressOverlay);
    document.getElementById("otabiProgressClose")?.addEventListener("click", () => {
        document.getElementById("otabiProgressOverlay").style.display = "none";
    });
    document.getElementById("savePlaceBtn")?.addEventListener("click", savePlaceForm);
    document.getElementById("deletePlaceBtn")?.addEventListener("click", deletePlaceForm);
    document.getElementById("saveEntryBtn")?.addEventListener("click", saveEntryForm);
    document.getElementById("deleteEntryBtn")?.addEventListener("click", deleteEntryForm);
});
