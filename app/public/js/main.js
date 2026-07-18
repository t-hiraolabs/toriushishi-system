/* =======================================================
共通変数・DOM取得
======================================================= */
const homeScheduleContainer = document.getElementById("home-schedule");
const eventActiveScheduleContainer = document.getElementById("event-active-schedule");
const eventPastScheduleContainer = document.getElementById("event-past-schedule");
const loadingOverlay = document.getElementById("globalLoading");
const calendarArea = document.getElementById("calendarArea");
let scheduleContainer = [];
let eventMap = {};
let practiceMap = {};


/* =======================================================
初期処理
======================================================= */
document.addEventListener("DOMContentLoaded", async () => {
    initLoadingScreen();
    initBottomNav();
    initEventDelegation();
    initShishimaru();
    scheduleContainer = [homeScheduleContainer, eventActiveScheduleContainer, eventPastScheduleContainer];
    showSkeleton([homeScheduleContainer], 1);
    showSkeleton([eventActiveScheduleContainer, eventPastScheduleContainer], 2);
    showCalendarSkeleton();
    const ok = await checkSessionAndGetUserId();
    if (!ok) return;
    await Promise.all([getEvents(), getPractices()]);
    loadHomeEvents();
    loadEventEvents();
    initCalendar();
    loadMembersUser();
    initHaruWidget();
    initGameTabVisibility();
    initImpersonateBanner();
    setTimeout(() => { maybeShowPushPrompt(); }, 1500);
});

// ゲームタブは平尾大雅のみ表示
function initGameTabVisibility() {
    const tab = document.getElementById("gameTabItem");
    if (!tab) return;
    tab.style.display = isSystemAdmin ? "" : "none";
}

function initImpersonateBanner() {
    const icon = document.getElementById("accountSwitchIcon");
    if (!icon) return;
    if (!isSystemAdmin && !isImpersonating) return;
    icon.style.display = "flex";
    icon.classList.toggle("active-impersonating", isImpersonating);

    icon.addEventListener("click", openAccountSwitchModal);
    document.getElementById("accountSwitchCloseBtn")?.addEventListener("click", () => {
        document.getElementById("accountSwitchModal").style.display = "none";
    });
    document.getElementById("endImpersonateBtn")?.addEventListener("click", async () => {
        const res = await callGasApi({ action: "endImpersonation", sessionId: localStorage.getItem("sessionId") });
        if (res?.success) {
            localStorage.setItem("sessionId", res.sessionId);
            location.href = "main.html";
        } else {
            alert(res?.msg || "戻れませんでした。再ログインしてください。");
        }
    });
}

async function openAccountSwitchModal() {
    const modal = document.getElementById("accountSwitchModal");
    const returnRow = document.getElementById("accountSwitchReturnRow");
    const list = document.getElementById("accountSwitchList");
    returnRow.style.display = isImpersonating ? "block" : "none";
    if (isImpersonating) {
        const nameEl = document.getElementById("accountSwitchCurrentName");
        if (nameEl) nameEl.textContent = userName || "";
    }
    list.innerHTML = '<li class="account-switch-loading">読み込み中…</li>';
    modal.style.display = "flex";
    const res = await callGasApi({ action: "getMembers", role: "admin" });
    if (!res?.success) { list.innerHTML = '<li class="account-switch-loading">取得失敗</li>'; return; }
    const members = (res.members || []).filter(m => m.status === "active" && String(m.userId) !== String(userId));
    if (!members.length) { list.innerHTML = '<li class="account-switch-loading">対象がありません</li>'; return; }
    list.innerHTML = "";
    members.forEach(m => {
        const li = document.createElement("li");
        li.className = "account-switch-item";
        li.innerHTML = `<span>${escHtml(m.name)}</span>${m.position ? `<span class="account-switch-position">${escHtml(m.position)}</span>` : ""}`;
        li.addEventListener("click", () => {
            modal.style.display = "none";
            impersonateAsUser(m.userId, m.name);
        });
        list.appendChild(li);
    });
}

// システム管理者が対象アカウントへなりすましログインする
async function impersonateAsUser(targetUserId, targetName) {
    if (!confirm(`「${targetName}」としてログインしますか？`)) return;
    const res = await callGasApi({
        action: "impersonateUser",
        sessionId: localStorage.getItem("sessionId"),
        targetUserId,
    });
    if (res?.success) {
        localStorage.setItem("sessionId", res.sessionId);
        location.href = "main.html";
    } else {
        alert(res?.msg || "切り替えに失敗しました");
    }
}

/* =======================================================
共通関数
======================================================= */
function normalize(str) {
    return str.replace(/-/g, "/").split(" ")[0];
}

/* =======================================================
ローディング画面
======================================================= */
function initLoadingScreen() {
    const loadingStart = Date.now();
    window.addEventListener('load', function() {
        const elapsed = Date.now() - loadingStart;
        const minTime = 3000;
        if (elapsed < minTime) setTimeout(hideLoading, minTime - elapsed);
        else hideLoading();
    });
}
function hideLoading() {
    const loading = document.getElementById('loading');
    if (!loading) return;
    loading.style.opacity = 0;
    setTimeout(() => {
        loading.style.display = 'none';
        const main = document.getElementById('main-content');
        if (main) main.style.display = 'block';
    }, 500);
}

/* =======================================================
ボトムナビ
======================================================= */
function initBottomNav() {
    document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            document.querySelectorAll(".bottom-nav-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            document.getElementById(target).classList.add("active");
            const memoInputArea = document.getElementById("memoInputArea");
            if (memoInputArea) {
                const isMemoTabActive = document.querySelector(".shishi-tab-btn.active")?.dataset.shishiTab === "memo";
                memoInputArea.style.display = (target === "chat" && isMemoTabActive) ? "flex" : "none";
            }
            if (target === "chat") {
                const activeShishiTab = document.querySelector(".shishi-tab-btn.active")?.dataset.shishiTab;
                if (activeShishiTab === "memo") loadMemos();
                else loadParticipationStats();
            }
        });
    });
}

/* =======================================================
スケルトン
======================================================= */
function showSkeleton(containers, count = 2) {
    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
    });
}
function showCalendarSkeleton() {
    calendarArea.innerHTML = generateCalendarSkeleton();
}
function generateCalendarSkeleton() {
    let html = `<div class="cal-grid">`;
    for (let i = 0; i < 42; i++) html += `<div class="day"><div class="skeleton-box" style="height:40px;"></div></div>`;
    return html + `</div>`;
}

/* =======================================================
イベント・練習　取得
======================================================= */
async function getEvents() {
    try {
        const res = await callGasApi({ action: "getEventsWithStats", userId });
        if (res && res.success && Array.isArray(res.events)) {
            events = res.events;
            eventMap = {};
            events.forEach(ev => { eventMap[ev.eventId] = ev; });
        } else { events = []; eventMap = {}; }
    } catch (e) { console.error("イベント取得エラー:", e); events = []; eventMap = {}; }
}
async function getPractices() {
    try {
        const res = await callGasApi({ action: "getPracticeWithStats", userId });
        if (res && res.success && Array.isArray(res.practices)) {
            practices = res.practices;
            practiceMap = {};
            practices.forEach(p => { practiceMap[p.practiceId] = p; });
        } else { practices = []; practiceMap = {}; }
    } catch (e) { console.error("practice取得エラー:", e); practices = []; practiceMap = {}; }
}
function loadHomeEvents() { homeScheduleContainer.innerHTML = ""; renderScheduleHome(events, practices); }
function loadEventEvents() {
    eventActiveScheduleContainer.innerHTML = "";
    eventPastScheduleContainer.innerHTML = "";
    renderScheduleEvent(events);
}

/* =======================================================
イベントカード描画
======================================================= */
function createEventCard(ev, options = {}) {
    const { includeDeadline = false } = options;
    const className = ev.type === "festival" ? "event-festival" : "event-regular";
    const card = document.createElement("div");
    card.className = className;
    card.dataset.eventId = ev.eventId;
    card.innerHTML = `
        <div class="event-date">${ev.date}</div>
        <div class="event-title">${ev.title}</div>
        <div class="answer">${ev.myStatus}</div>
        <div class="responses-list">参加:${ev.yes} 不参加:${ev.no}</div>
        ${includeDeadline ? `<div class="deadline">期限:${ev.deadline ? ev.deadline.split("T")[0].replace(/-/g, "/") : ""}</div>` : ""}
    `;
    return card;
}
function renderScheduleHome(events, practices = []) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const items = [];
    events.forEach(ev => { const d = new Date(ev.date); d.setHours(0,0,0,0); if (d >= today) items.push({ type: "event", date: d, data: ev }); });
    practices.forEach(pr => { const d = new Date(pr.date); d.setHours(0,0,0,0); if (d.getTime() === today.getTime()) items.push({ type: "practice", date: d, data: pr }); });
    items.sort((a, b) => a.date - b.date);
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(item.type === "event" ? createEventCard(item.data, { includeDeadline: true }) : createPracticeCard(item.data)));
    homeScheduleContainer.appendChild(fragment);
}
function renderScheduleEvent(events) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const af = document.createDocumentFragment(); const pf = document.createDocumentFragment();
    events.forEach(ev => {
        const d = new Date(ev.date); d.setHours(0,0,0,0);
        eventMap[ev.eventId] = ev;
        (d >= today ? af : pf).appendChild(createEventCard(ev));
    });
    eventActiveScheduleContainer.appendChild(af);
    eventPastScheduleContainer.appendChild(pf);
}

/* =======================================================
練習カード描画
======================================================= */
function createPracticeCard(pr) {
    const card = document.createElement("div");
    card.className = "event-practice";
    card.dataset.practiceId = pr.practiceId;
    card.innerHTML = `
        <div class="practice-date">${pr.date}</div>
        <div class="practice-title">${pr.title || "練習"}</div>
        <div class="answer">${pr.myStatus || ""}</div>
        <div class="responses-list">欠席:${pr.absent.length} 遅れる:${pr.late.length}</div>
    `;
    return card;
}

/* =======================================================
演目フォームヘルパー
======================================================= */
// =============================
// 名前選択ドロップダウン（iOSのdatalist非対応対策として自作）
// =============================
const PERF_NAME_OPTIONS = ["提婆", "狐", "ひょっとこ", "のみとり", "三継ぎ【頭】", "三継ぎ【扇子】", "三番叟", "練る", "宮出し"];

// 役割の基本候補（常に表示）
const PERF_ROLE_BASE_OPTIONS = ["演者", "獅子", "獅子(雄)", "獅子(雌)"];

// 演目名ごとの役割候補（提婆・狐など選択時に優先表示）
const PERF_ROLE_SUGGESTIONS = {
    "提婆": ["演者", "獅子"],
    "狐": ["演者", "獅子"],
    "ひょっとこ": ["演者", "獅子"],
    "のみとり": ["子役", "獅子"],
    "三継ぎ【頭】": ["右", "左", "1本"],
    "三継ぎ【扇子】": ["右", "左", "1本"],
    "三番叟": ["獅子(雄)", "獅子(雌)"],
};

// 役割の中にさらに入る役割の候補（獅子(雄)・獅子(雌)、三継ぎの右・左・1本の下など）
const PERF_SUBROLE_SUGGESTIONS = {
    "獅子(雄)": ["前(子役)", "前(台)", "後右(子役)", "後右(台)", "後左(子役)", "後左(台)", "子役乗せ"],
    "獅子(雌)": ["前(子役)", "前(台)", "後右(子役)", "後右(台)", "後左(子役)", "後左(台)", "子役乗せ"],
    "右": ["子役", "中台", "土台", "子台", "前付き", "湯単持ち"],
    "左": ["子役", "中台", "土台", "子台", "前付き", "湯単持ち"],
    "1本": ["子役", "中台", "土台", "子台", "前付き", "湯単持ち"],
};

// 対になる役割（片方を入れたらもう片方も自動で追加＆一覧では1行にまとめて表示）
const PERF_ROLE_PAIR_MAP = {
    "前(子役)": "前(台)", "前(台)": "前(子役)",
    "後右(子役)": "後右(台)", "後右(台)": "後右(子役)",
    "後左(子役)": "後左(台)", "後左(台)": "後左(子役)",
};

// 時間欄をタップして開いただけで現在時刻が仮に入る端末があるため、
// フォーカス時点の値と実際に変わったか(=確定して選び直したか)をblur時に見て、変わっていた場合だけもう一方へコピーする
function wireTimeAutoFill(mainEl, otherEl) {
    let valueOnFocus = mainEl.value;
    mainEl.addEventListener("focus", () => { valueOnFocus = mainEl.value; });
    mainEl.addEventListener("blur", () => {
        if (mainEl.value && mainEl.value !== valueOnFocus && !otherEl.value) {
            otherEl.value = mainEl.value;
        }
    });
}

// 一回目のタップではキーボードを開かずリストだけ表示し、
// リストが開いている状態でもう一度タップした時だけ入力できるようにする
function wireNamePicker(inputEl, getOptions) {
    const wrap = document.createElement("div");
    wrap.className = "name-picker-wrap";
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    const list = document.createElement("div");
    list.className = "name-picker-list";
    list.style.display = "none";
    wrap.appendChild(list);

    inputEl.setAttribute("readonly", "readonly");

    function render() {
        const options = getOptions();
        const q = inputEl.value.trim();
        const filtered = q ? options.filter(o => o.includes(q)) : options;
        if (!filtered.length) { list.style.display = "none"; return; }
        list.innerHTML = filtered.map(o => `<div class="name-picker-option">${escHtml(o)}</div>`).join("");
        list.style.display = "block";
    }
    function closeList() {
        list.style.display = "none";
        inputEl.setAttribute("readonly", "readonly");
    }
    inputEl.addEventListener("click", () => {
        const isOpen = list.style.display === "block";
        if (isOpen && inputEl.hasAttribute("readonly")) {
            // 2回目のタップ：キーボードを開いて自由入力できるようにする
            inputEl.blur();
            setTimeout(() => {
                inputEl.removeAttribute("readonly");
                inputEl.focus();
            }, 0);
        } else if (!isOpen) {
            render();
        }
    });
    inputEl.addEventListener("focus", () => { if (list.style.display !== "block") render(); });
    inputEl.addEventListener("input", render);
    list.addEventListener("mousedown", (e) => {
        const opt = e.target.closest(".name-picker-option");
        if (!opt) return;
        e.preventDefault();
        inputEl.value = opt.textContent;
        closeList();
        inputEl.dispatchEvent(new Event("change"));
    });
    inputEl.addEventListener("blur", () => { setTimeout(closeList, 150); });
}

function buildPerfItem(data = {}, opts = {}) {
    const div = document.createElement("div");
    div.className = "perf-item" + (opts.collapsed ? " collapsed" : "");
    const escQ = s => (s || '').replace(/"/g, '&quot;');
    div.innerHTML = `
        <div class="perf-item-summary">
            <button type="button" class="perf-summary-toggle">
                <span class="perf-summary-chevron">▾</span>
                <span class="perf-summary-name">${escHtml(data.name || '') || '（演目名未設定）'}</span>
            </button>
            <button class="perf-remove-btn" type="button">✕</button>
        </div>
        <div class="perf-item-body">
            <div class="perf-item-header">
                <div class="perf-time-row">
                    <input type="time" class="perf-time-from" value="${escQ(data.timeFrom || '')}">
                    <span class="perf-tilde">〜</span>
                    <input type="time" class="perf-time-to" value="${escQ(data.timeTo || '')}">
                </div>
            </div>
            <input type="text" class="perf-name" placeholder="演目名（提婆・狐・三継ぎなど）" value="${escQ(data.name || '')}" autocomplete="off">
            <div class="perf-drums">
                <input type="text" class="perf-taiko-dai" placeholder="大太鼓" value="${escQ(data.taikoDai || '')}" autocomplete="off">
                <input type="text" class="perf-taiko-ko" placeholder="小太鼓" value="${escQ(data.taikoKo || '')}" autocomplete="off">
            </div>
            <div class="perf-roles-list"></div>
            <button class="perf-add-role-btn" type="button">＋ 役割を追加（演者・獅子・子役・台…）</button>
        </div>
    `;
    div.querySelector(".perf-remove-btn").addEventListener("click", () => div.remove());
    div.querySelector(".perf-summary-toggle").addEventListener("click", () => div.classList.toggle("collapsed"));
    const nameInput = div.querySelector(".perf-name");
    const summaryName = div.querySelector(".perf-summary-name");
    const syncSummaryName = () => { summaryName.textContent = nameInput.value.trim() || "（演目名未設定）"; };
    nameInput.addEventListener("input", syncSummaryName);
    nameInput.addEventListener("change", syncSummaryName);
    const getPerfName = () => nameInput.value.trim();
    div.querySelector(".perf-add-role-btn").addEventListener("click", () => addRoleRow(div.querySelector(".perf-roles-list"), {}, getPerfName));
    wireNamePicker(nameInput, () => PERF_NAME_OPTIONS);
    wireNamePicker(div.querySelector(".perf-taiko-dai"), () => perfMemberNameOptions);
    wireNamePicker(div.querySelector(".perf-taiko-ko"), () => perfMemberNameOptions);

    // 開始時間を入れたら終了時間にも同じ時間を入れる（逆も同様）
    // ピッカーを開いただけで現在時刻が仮に入ることがあるため、
    // フォーカス時の値と実際に変わったか(＝確定操作をしたか)を見てから、離れたタイミング(blur)で反映する
    const timeFrom = div.querySelector(".perf-time-from");
    const timeTo = div.querySelector(".perf-time-to");
    wireTimeAutoFill(timeFrom, timeTo);
    wireTimeAutoFill(timeTo, timeFrom);

    const rolesList = div.querySelector(".perf-roles-list");
    if (data.roles && Array.isArray(data.roles)) {
        if (data.roles.length) data.roles.forEach(r => addRoleRow(rolesList, r, getPerfName));
        else { addRoleRow(rolesList, { label: "演者" }, getPerfName); addRoleRow(rolesList, { label: "獅子" }, getPerfName); }
    } else if (data.roles && typeof data.roles === 'object') {
        const entries = Object.entries(data.roles).filter(([, v]) => v);
        if (entries.length) entries.forEach(([label, members]) => addRoleRow(rolesList, { label, members: String(members) }, getPerfName));
        else { addRoleRow(rolesList, { label: "演者" }, getPerfName); addRoleRow(rolesList, { label: "獅子" }, getPerfName); }
    } else {
        addRoleRow(rolesList, { label: "演者" }, getPerfName);
        addRoleRow(rolesList, { label: "獅子" }, getPerfName);
    }
    return div;
}

function addRoleRow(container, data = {}, getPerfName, getParentLabel) {
    const row = document.createElement("div");
    row.className = "perf-role-row";
    const escQ = s => (s || '').replace(/"/g, '&quot;');
    row.innerHTML = `
        <div class="perf-role-row-top">
            <input type="text" class="role-label-input" placeholder="役割（演者・獅子・子役・中台・土台…）" value="${escQ(data.label || '')}" autocomplete="off">
            <button class="role-remove-btn" type="button">✕</button>
        </div>
        <div class="role-tags-container"></div>
        <input type="hidden" class="role-members-input" value="${escQ(data.members || '')}">
        <div class="role-member-picker-row">
            <input type="text" class="role-member-picker" placeholder="名前を選んで追加" autocomplete="off">
        </div>
        ${getParentLabel ? "" : `
        <div class="perf-subroles-list"></div>
        <button class="perf-add-subrole-btn" type="button">＋ この役割の中に役割を追加</button>
        `}
    `;
    row.querySelector(".role-remove-btn").addEventListener("click", () => row.remove());
    const labelInput = row.querySelector(".role-label-input");
    wireNamePicker(labelInput, () => {
        if (getParentLabel) {
            const parentLabel = getParentLabel();
            const suggested = PERF_SUBROLE_SUGGESTIONS[parentLabel] || [];
            return [...new Set([...suggested, ...PERF_ROLE_BASE_OPTIONS])];
        }
        const perfName = getPerfName ? getPerfName() : "";
        const suggested = PERF_ROLE_SUGGESTIONS[perfName] || [];
        return [...new Set([...suggested, ...PERF_ROLE_BASE_OPTIONS])];
    });
    // 前(子役)を入れたら前(台)も自動で追加する（後右・後左も同様）
    labelInput.addEventListener("change", () => {
        const label = labelInput.value.trim();
        const pairLabel = PERF_ROLE_PAIR_MAP[label];
        if (!pairLabel) return;
        const siblingLabels = [...container.children].map(r => r.querySelector(".role-label-input")?.value.trim());
        if (!siblingLabels.includes(pairLabel)) {
            addRoleRow(container, { label: pairLabel }, getPerfName, getParentLabel);
        }
    });
    const picker = row.querySelector(".role-member-picker");
    const hiddenInput = row.querySelector(".role-members-input");
    const tagsContainer = row.querySelector(".role-tags-container");
    let tags = (data.members || "").split("\n").map(s => s.trim()).filter(Boolean);

    function renderTags() {
        hiddenInput.value = tags.join("\n");
        tagsContainer.innerHTML = tags.map((t, i) => `
            <span class="role-tag">${escHtml(t)}<button type="button" class="role-tag-remove" data-idx="${i}">✕</button></span>
        `).join("");
        tagsContainer.querySelectorAll(".role-tag-remove").forEach(btn => {
            btn.addEventListener("click", () => {
                tags.splice(Number(btn.dataset.idx), 1);
                renderTags();
            });
        });
    }
    renderTags();

    wireNamePicker(picker, () => {
        const label = labelInput.value.trim();
        const isChildRole = label.includes("子役") && label !== "子役乗せ";
        return isChildRole ? perfChildNameOptions : perfMemberNameOptions;
    });
    const addPickedName = () => {
        const name = picker.value.trim();
        if (!name) return;
        if (!tags.includes(name)) tags.push(name);
        renderTags();
        picker.value = "";
        picker.focus();
    };
    picker.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addPickedName(); }
    });
    picker.addEventListener("change", addPickedName);

    // この役割の中にさらに役割を入れる（例：獅子(雄) の中に 前(子役)・前(台)…）
    // 階層は「演目名→役割→役割」の3階層までなので、すでに役割の中の役割(サブ役割)である場合は追加ボタンを出さない
    if (!getParentLabel) {
        const subRolesList = row.querySelector(".perf-subroles-list");
        const getMyLabel = () => labelInput.value.trim();
        row.querySelector(".perf-add-subrole-btn").addEventListener("click", () => addRoleRow(subRolesList, {}, getPerfName, getMyLabel));
        if (Array.isArray(data.subRoles)) {
            data.subRoles.forEach(sr => addRoleRow(subRolesList, sr, getPerfName, getMyLabel));
        }
    }

    container.appendChild(row);
}

function collectRoleRow(rowEl) {
    const label = rowEl.querySelector(".role-label-input")?.value.trim();
    if (!label) return null;
    const members = rowEl.querySelector(".role-members-input")?.value.trim() || "";
    const subRolesListEl = rowEl.querySelector(".perf-subroles-list");
    const subRoles = subRolesListEl
        ? [...subRolesListEl.children].map(collectRoleRow).filter(Boolean)
        : [];
    return { label, members, subRoles };
}

function collectPerformances() {
    const performances = [];
    let index = 0;
    document.querySelectorAll("#performanceList .perf-item").forEach(item => {
        const name = item.querySelector(".perf-name")?.value.trim();
        if (!name) return;
        index++;
        const rolesListEl = item.querySelector(".perf-roles-list");
        const roles = rolesListEl ? [...rolesListEl.children].map(collectRoleRow).filter(Boolean) : [];
        performances.push({
            no: String(index),
            timeFrom: item.querySelector(".perf-time-from")?.value || "",
            timeTo: item.querySelector(".perf-time-to")?.value || "",
            name,
            taikoDai: item.querySelector(".perf-taiko-dai")?.value.trim() || "",
            taikoKo: item.querySelector(".perf-taiko-ko")?.value.trim() || "",
            roles
        });
    });
    return performances;
}

// =============================
// 演目の並び替え（指ドラッグ）
// =============================
function openPerfReorderPanel() {
    const perfItems = [...document.querySelectorAll("#performanceList .perf-item")];
    if (perfItems.length < 2) { alert("並び替えるには演目が2つ以上必要です"); return; }
    const list = document.getElementById("perfReorderList");
    list.innerHTML = "";
    perfItems.forEach((el, i) => {
        const name = el.querySelector(".perf-name")?.value.trim() || "(名称未設定)";
        const row = document.createElement("div");
        row.className = "perf-reorder-item";
        row.dataset.origIndex = String(i);
        row.innerHTML = `<span class="perf-reorder-handle">☰</span><span class="perf-reorder-name"></span>`;
        row.querySelector(".perf-reorder-name").textContent = name;
        list.appendChild(row);
    });
    wirePerfReorderDrag(list);
    document.getElementById("perfReorderOverlay").style.display = "flex";
}

function closePerfReorderPanel() {
    const list = document.getElementById("perfReorderList");
    const performanceList = document.getElementById("performanceList");
    const perfItems = [...performanceList.querySelectorAll(".perf-item")];
    [...list.querySelectorAll(".perf-reorder-item")].forEach(row => {
        const el = perfItems[Number(row.dataset.origIndex)];
        if (el) performanceList.appendChild(el);
    });
    document.getElementById("perfReorderOverlay").style.display = "none";
}

function wirePerfReorderDrag(list) {
    list.querySelectorAll(".perf-reorder-item").forEach(item => {
        const handle = item.querySelector(".perf-reorder-handle");
        handle.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            const pointerId = e.pointerId;
            handle.setPointerCapture(pointerId);
            item.classList.add("dragging");
            let currentY = e.clientY;

            const onMove = (ev) => {
                currentY = ev.clientY;
                const items = [...list.querySelectorAll(".perf-reorder-item")];
                const idx = items.indexOf(item);
                for (let i = 0; i < items.length; i++) {
                    if (items[i] === item) continue;
                    const r = items[i].getBoundingClientRect();
                    const mid = r.top + r.height / 2;
                    if (i < idx && currentY < mid) { list.insertBefore(item, items[i]); break; }
                    if (i > idx && currentY > mid) { list.insertBefore(item, items[i].nextSibling); break; }
                }
            };
            const onUp = () => {
                item.classList.remove("dragging");
                handle.releasePointerCapture(pointerId);
                handle.removeEventListener("pointermove", onMove);
                handle.removeEventListener("pointerup", onUp);
                handle.removeEventListener("pointercancel", onUp);
            };
            handle.addEventListener("pointermove", onMove);
            handle.addEventListener("pointerup", onUp);
            handle.addEventListener("pointercancel", onUp);
        });
    });
}

// 前(子役)/前(台) のような対になる役割を1行にまとめる（後右・後左も同様）
function groupPairedRoles(roles) {
    const used = new Set();
    const grouped = [];
    roles.forEach((r, i) => {
        if (used.has(i)) return;
        const pairLabel = PERF_ROLE_PAIR_MAP[r.label];
        const noSubRoles = !(r.subRoles && r.subRoles.length);
        if (pairLabel && noSubRoles && r.label.endsWith("(子役)")) {
            const j = roles.findIndex((r2, i2) =>
                i2 !== i && !used.has(i2) && r2.label === pairLabel && !(r2.subRoles && r2.subRoles.length));
            if (j !== -1) {
                used.add(i); used.add(j);
                grouped.push({ paired: true, prefix: r.label.replace("(子役)", ""), child: r, dai: roles[j] });
                return;
            }
        }
        grouped.push(r);
    });
    return grouped;
}

// 改行区切りの名前をタグ表示用のHTMLに変換
function renderNameTags(membersStr) {
    const names = (membersStr || "").split("\n").map(s => s.trim()).filter(Boolean);
    if (!names.length) return '';
    return `<span class="perf-detail-name-tags">${names.map(n => `<span class="perf-detail-name-tag">${escHtml(n)}</span>`).join('')}</span>`;
}

function renderRoleDetail(r, depth = 0) {
    if (r.paired) {
        return `
        <div class="perf-detail-role perf-detail-role-paired" style="margin-left:${depth * 14}px;">
            <span class="perf-role-label-text">${escHtml(r.prefix)}</span>
            <span class="perf-role-pair-members">
                <span class="perf-role-pair-item">子役: ${renderNameTags(r.child.members)}</span>
                <span class="perf-role-pair-item">台: ${renderNameTags(r.dai.members)}</span>
            </span>
        </div>`;
    }
    const subs = Array.isArray(r.subRoles) ? groupPairedRoles(r.subRoles) : [];
    const subHtml = subs.length
        ? `<div class="perf-detail-subroles">${subs.map(sr => renderRoleDetail(sr, depth + 1)).join('')}</div>`
        : '';
    return `
        <div class="perf-detail-role" style="margin-left:${depth * 14}px;">
            <span class="perf-role-label-text">${r.label || ''}</span>
            ${renderNameTags(r.members)}
        </div>${subHtml}`;
}

function renderPerformances(container, performances) {
    container.innerHTML = "";
    if (!performances?.length) return;
    performances.forEach(perf => {
        const div = document.createElement("div");
        div.className = "perf-detail-item";
        const time = perf.timeFrom ? `${perf.timeFrom}〜${perf.timeTo || ''}` : '';
        let rolesHtml = '';
        if (Array.isArray(perf.roles)) {
            rolesHtml = groupPairedRoles(perf.roles).map(r => renderRoleDetail(r)).join('');
        } else if (perf.roles && typeof perf.roles === 'object') {
            rolesHtml = Object.entries(perf.roles).filter(([, v]) => v).map(([k, v]) => `
                <div class="perf-detail-role">
                    <span class="perf-role-label-text">${k}</span>
                    ${renderNameTags(v)}
                </div>`).join('');
        }
        div.innerHTML = `
            <div class="perf-detail-header">
                ${perf.no ? `<span class="perf-no-badge">${perf.no}</span>` : ''}
                ${time ? `<span class="perf-detail-time">${time}</span>` : ''}
                <span class="perf-detail-name">${perf.name || ''}</span>
            </div>
            ${(perf.taikoDai || perf.taikoKo) ? `
            <div class="perf-detail-drums">
                ${perf.taikoDai ? `<span>大太鼓: <span class="perf-detail-name-tag">${escHtml(perf.taikoDai)}</span></span>` : ''}
                ${perf.taikoKo ? `<span>小太鼓: <span class="perf-detail-name-tag">${escHtml(perf.taikoKo)}</span></span>` : ''}
            </div>` : ''}
            <div class="perf-detail-roles">${rolesHtml}</div>
        `;
        container.appendChild(div);
    });
}

/* =======================================================
イベント委譲
======================================================= */
function initEventDelegation() {
    document.body.addEventListener("click", async (event) => {
        const target = event.target;
        if (target.closest(".reload-btn")) { location.reload(); return; }

        const eventCard = target.closest("[data-event-id]");
        if (eventCard && eventCard.closest("#home-schedule, #event-active-schedule, #event-past-schedule, #eventArea")) {
            const eventId = Number(eventCard.dataset.eventId);
            const card = document.getElementById("eventDetailCard");
            card.classList.add("active");
            card.dataset.eventId = eventId;
            await fillDetailCard(eventMap[eventId], userId, card);
            return;
        }

        const practiceCard = target.closest("[data-practice-id]");
        if (practiceCard && !target.closest(".close-card-btn, .response-btn, .toggle-response-btn, .edit-practice-btn")) {
            const practiceId = Number(practiceCard.dataset.practiceId);
            const card = document.getElementById("practiceDetailCard");
            card.classList.add("active");
            card.dataset.practiceId = practiceId;
            await fillPracticeDetailCard(practiceMap[practiceId], userId, card);
            return;
        }

        const toggleBtn = target.closest(".toggle-response-btn, .toggle-performances-btn, .toggle-children-btn");
        if (toggleBtn) {
            const ul = toggleBtn.nextElementSibling;
            if (!ul) return;
            const isOpen = ul.style.display === "block";
            ul.style.display = isOpen ? "none" : "block";
            toggleBtn.classList.toggle("open", !isOpen);
            return;
        }

        const responseBtn = target.closest(".response-btn");
        if (responseBtn) {
            const practiceCard = responseBtn.closest(".practice-detail-card");
            if (practiceCard) {
                const practiceId = Number(practiceCard.dataset.practiceId);
                const dateText = practiceCard.querySelector(".practice-detail-card-date")?.textContent || "";
                const practiceDate = new Date(dateText.replace(/\//g, "-")).setHours(0,0,0,0);
                const today = new Date().setHours(0,0,0,0);
                if (practiceDate < today) { alert("過去の練習には回答できません。"); return; }
                let answer = "";
                const isSelected = responseBtn.classList.contains("selected");
                if (isSelected) {
                    answer = "";
                } else if (responseBtn.classList.contains("absent")) {
                    answer = "欠席";
                } else if (responseBtn.classList.contains("late")) {
                    answer = "遅刻";
                }
                await updatePracticeResponse(practiceId, answer, practiceCard, userId);
                return;
            }
            const card = responseBtn.closest(".event-detail-card");
            const dateText = card.querySelector(".event-detail-card-date")?.textContent || "";
            const eventDate = new Date(dateText.replace(/\//g, "-")).setHours(0,0,0,0);
            const today = new Date().setHours(0,0,0,0);
            if (eventDate < today) { alert("過去のイベントは回答できません。"); return; }
            const eventId = Number(card.dataset.eventId);
            await updateResponse(eventId, responseBtn.classList.contains("yes") ? "参加" : "不参加", card, userId);
            return;
        }

        const closeTarget = target.closest(".close-card-btn");
        if (closeTarget) {
            const t = closeTarget.dataset.target;
            switch (t) {
                case "event":              document.getElementById("eventDetailCard")?.classList.remove("active"); break;
                case "practice":           document.getElementById("practiceDetailCard")?.classList.remove("active"); break;
                case "member":             document.getElementById("membersCardUser")?.classList.remove("active"); break;
                case "create":             document.getElementById("eventCreateCard")?.classList.remove("active"); break;
                case "practice-create":    document.getElementById("practiceCreateCard")?.classList.remove("active"); break;
                case "otabi":              document.getElementById("otabiCard")?.classList.remove("active"); break;
                case "otabi-place-form":   document.getElementById("otabiPlaceFormCard")?.classList.remove("active"); break;
                case "otabi-entry-form":   document.getElementById("otabiEntryFormCard")?.classList.remove("active"); break;
                case "otabi-bulk-entry":   document.getElementById("otabiBulkEntryCard")?.classList.remove("active"); break;
                case "gear-management":    document.getElementById("gearCard")?.classList.remove("active"); break;
                case "app-settings":       document.getElementById("appSettingsCard")?.classList.remove("active"); break;
                case "game":               document.getElementById("gameCard")?.classList.remove("active"); break;
                case "gear-edit":          document.getElementById("gearEditCard")?.classList.remove("active"); break;
                case "mypage":             document.getElementById("myPageCard")?.classList.remove("active"); break;
                case "member-info-edit":   document.getElementById("memberInfoEditCard")?.classList.remove("active"); break;
            }
            return;
        }

        if (target.closest(".edit-event-btn")) {
            const detailCard = document.getElementById("eventDetailCard");
            openEditForm(eventMap[Number(detailCard.dataset.eventId)]);
        }

        if (target.closest(".edit-practice-btn")) {
            const detailCard = document.getElementById("practiceDetailCard");
            openPracticeEditForm(practiceMap[Number(detailCard.dataset.practiceId)]);
        }
    });
}

/* =======================================================
タブ / メンバー
======================================================= */
document.querySelectorAll(".tab-item").forEach(tab => {
    tab.addEventListener("click", async () => {
        const targetTab = tab.dataset.target;
        if (targetTab === "member") { document.getElementById("membersCardUser").classList.add("active"); return; }
        if (targetTab === "event-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } openCreateForm(); return; }
        if (targetTab === "practice-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } openPracticeCreateForm(); return; }
        if (targetTab === "otabi-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } openOtabiCard(); return; }
        if (targetTab === "gear-management") { if (userRole !== "admin") { alert("管理者のみアクセスできます。"); return; } openGearCard(); return; }
        if (targetTab === "app-settings") { openAppSettings(); return; }
        if (targetTab === "game") { openGameCard(); return; }
        if (targetTab === "mypage") { openMyPage(); return; }
    });
});

async function loadMembersUser() {
    const card = document.getElementById("membersCardUser");
    const list = document.getElementById("memberListUser");
    const overlay = card.querySelector(".loading-overlay");
    overlay.style.display = "flex";
    try {
        const role = userRole === "admin" ? "admin" : "user";
        const res = await callGasApi({ action: "getMembers", role });
        list.innerHTML = "";
        if (userRole === "admin") {
            await renderPasswordResetRequests(list);
            const hold = res.members.filter(m => m.status === "hold");
            const active = res.members.filter(m => m.status === "active");
            if (hold.length) { list.appendChild(makeTitle("承認待ちメンバー")); hold.forEach(m => list.appendChild(buildMemberItemUser(m, true))); }
            if (active.length) { list.appendChild(makeTitle("アクティブメンバー")); active.forEach(m => list.appendChild(buildMemberItemUser(m, false))); }
        } else {
            res.members.filter(m => m.status === "active").forEach(m => list.appendChild(buildMemberItemUser(m, false)));
        }
    } finally { overlay.style.display = "none"; }
}
function buildMemberItemUser(member, isHold = false) {
    const li = document.createElement("li"); li.classList.add("member-item");
    if (isHold) li.classList.add("is-hold");
    if (member.position) { const p = document.createElement("span"); p.classList.add("member-position"); p.textContent = member.position; li.appendChild(p); }
    const n = document.createElement("span"); n.classList.add("member-name"); n.textContent = member.name; li.appendChild(n);
    const btn = document.createElement("button");
    btn.classList.add("member-profile-btn");
    btn.innerHTML = `<i class="fas fa-user"></i>`;
    btn.addEventListener("click", () => openMemberProfile(member.userId, member.name, isHold));
    li.appendChild(btn);
    return li;
}
function appendChildren(li, member, isAdmin) {
    if (!member.children?.length) return;
    const details = document.createElement("details"); details.classList.add("children-details");
    const summary = document.createElement("summary"); summary.textContent = `子供 (${member.children.length}人)`;
    details.appendChild(summary);
    const ul = document.createElement("ul");
    member.children.forEach(child => {
        const c = document.createElement("li");
        c.textContent = child.childName;
        if (isAdmin && child.childId) {
            const delBtn = document.createElement("button");
            delBtn.textContent = "削除";
            delBtn.classList.add("child-delete-btn");
            delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!confirm(`「${child.childName}」を削除しますか？`)) return;
                const res = await callGasApi({ action: "deleteChild", childId: Number(child.childId), userId });
                if (res.success) { alert("削除しました"); loadMembersUser(); }
                else alert(res.msg || "削除に失敗しました");
            });
            c.appendChild(delBtn);
        }
        ul.appendChild(c);
    });
    details.appendChild(ul); li.appendChild(details);
}
function makeTitle(text) { const p = document.createElement("p"); p.textContent = text; p.classList.add("list-title"); return p; }

// パスワード再発行申請（管理者）
async function renderPasswordResetRequests(list) {
    const res = await callGasApi({ action: "getPasswordResetRequests", sessionId: localStorage.getItem("sessionId") });
    if (!res?.success || !res.requests?.length) return;
    list.appendChild(makeTitle("パスワード再発行申請"));
    res.requests.forEach(req => {
        const li = document.createElement("li");
        li.classList.add("member-item", "pw-reset-item");
        const n = document.createElement("span");
        n.classList.add("member-name");
        n.textContent = req.user_name;
        li.appendChild(n);
        const btn = document.createElement("button");
        btn.classList.add("pw-reset-btn");
        btn.textContent = "パスワード再設定";
        btn.addEventListener("click", () => resetMemberPassword(req.user_id, req.user_name, req.id));
        li.appendChild(btn);
        list.appendChild(li);
    });
}

async function resetMemberPassword(targetUserId, name, requestId) {
    const newPassword = prompt(`「${name}」さんの新しいパスワードを入力してください（4文字以上）`);
    if (newPassword === null) return;
    if (newPassword.trim().length < 4) { alert("パスワードは4文字以上にしてください"); return; }
    const res = await callGasApi({
        action: "resetMemberPassword",
        sessionId: localStorage.getItem("sessionId"),
        targetUserId,
        newPassword: newPassword.trim(),
        requestId,
    });
    if (res?.success) {
        alert(`パスワードを再設定しました。\n本人に新しいパスワードを伝えてください。`);
        loadMembersUser();
    } else {
        alert(res?.msg || "再設定に失敗しました");
    }
}
async function approveMember(userId) {
    if (!confirm("このユーザーを承認しますか？")) return;
    const res = await callGasApi({ action: "approveMember", userId });
    if (res.success) { alert("承認しました！"); loadMembersUser(); } else alert("承認に失敗しました");
}

/* =======================================================
イベント新規作成
======================================================= */
function initEventCreateCard() {
    delete document.getElementById("eventCreateCard").dataset.eventId;
    document.getElementById("eventTitle").value = "";
    document.getElementById("eventDate").value = "";
    document.getElementById("eventTime").value = "";
    document.getElementById("eventTimeUndecided").checked = false;
    document.getElementById("eventTime").disabled = false;
    document.getElementById("eventLocation").value = "";
    document.getElementById("eventDeadline").value = "";
    document.getElementById("eventComment").value = "";
    document.getElementById("performanceList").innerHTML = "";
    document.getElementById("deleteEventBtn").style.display = "none";
    const overlay = document.querySelector("#eventCreateCard .loading-overlay");
    if (overlay) overlay.style.display = "none";
}
let perfMemberOptionsLoaded = false;
let perfMemberNameOptions = [];
let perfChildNameOptions = [];
async function loadPerfMemberOptions() {
    if (perfMemberOptionsLoaded) return;
    try {
        const res = await callGasApi({ action: "getMembers", role: "admin" });
        const activeMembers = (res?.members || []).filter(m => m.status === "active");
        perfMemberNameOptions = activeMembers.map(m => m.name);
        perfChildNameOptions = activeMembers.flatMap(m => (m.children || []).map(c => c.childName)).filter(Boolean);
        perfMemberOptionsLoaded = true;
    } catch (e) { console.error("演者候補の取得に失敗:", e); }
}

function openCreateForm() {
    initEventCreateCard();
    loadPerfMemberOptions();
    document.getElementById("eventCreateCard").classList.add("active");
}
function openEditForm(eventData) {
    initEventCreateCard();
    loadPerfMemberOptions();
    const editCard = document.getElementById("eventCreateCard");
    editCard.dataset.eventId = eventData.eventId;
    document.querySelectorAll('input[name="eventType"]').forEach(r => r.checked = (r.value === eventData.type));
    document.getElementById("eventTitle").value = eventData.title || "";
    document.getElementById("eventDate").value = (eventData.date || "").replace(/\//g, "-");
    const timeVal = eventData.time || "";
    const isUndecided = timeVal === "未定" || timeVal === "";
    document.getElementById("eventTimeUndecided").checked = isUndecided && timeVal === "未定";
    document.getElementById("eventTime").value = (timeVal && timeVal !== "未定") ? timeVal : "";
    document.getElementById("eventTime").disabled = timeVal === "未定";
    document.getElementById("eventLocation").value = eventData.location || "";
    document.getElementById("eventDeadline").value = (eventData.deadline || "").split("T")[0].replace(/\//g, "-");
    document.getElementById("eventComment").value = eventData.comment || "";
    const performanceList = document.getElementById("performanceList");
    if (Array.isArray(eventData.performances)) {
        eventData.performances.forEach(perf => performanceList.appendChild(buildPerfItem(perf, { collapsed: true })));
    }
    const deleteBtn = document.getElementById("deleteEventBtn");
    deleteBtn.style.display = userRole === "admin" ? "" : "none";
    deleteBtn.disabled = false;
    deleteBtn.textContent = "このイベントを削除";
    deleteBtn.onclick = async () => {
        if (!confirm(`「${eventData.title || "イベント"}」（${eventData.date}）を削除しますか？\nこの操作は取り消せません。`)) return;
        deleteBtn.disabled = true; deleteBtn.textContent = "削除中…";
        const res = await callGasApi({
            action: "deleteEvent",
            sessionId: localStorage.getItem("sessionId"),
            eventId: eventData.eventId,
        });
        if (res?.success) {
            alert("削除しました");
            editCard.classList.remove("active");
            document.getElementById("eventDetailCard").classList.remove("active");
            await getEvents(); loadHomeEvents(); loadEventEvents(); initCalendar();
        } else {
            alert(res?.msg || "削除に失敗しました");
            deleteBtn.disabled = false; deleteBtn.textContent = "このイベントを削除";
        }
    };
    editCard.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("eventTimeUndecided").addEventListener("change", (e) => {
        const timeInput = document.getElementById("eventTime");
        timeInput.disabled = e.target.checked;
        if (e.target.checked) timeInput.value = "";
    });

    document.getElementById("addPerformanceBtn").addEventListener("click", () => {
        document.getElementById("performanceList").appendChild(buildPerfItem({}));
    });

    document.getElementById("reorderPerformancesBtn").addEventListener("click", openPerfReorderPanel);
    document.getElementById("perfReorderDoneBtn").addEventListener("click", closePerfReorderPanel);

    document.querySelector(".save-event-btn").addEventListener("click", async () => {
        if (!confirm("保存しますか？")) return;
        const type = document.querySelector('input[name="eventType"]:checked').value;
        const title = document.getElementById("eventTitle").value.trim();
        const date = document.getElementById("eventDate").value;
        const timeUndecided = document.getElementById("eventTimeUndecided").checked;
        const time = timeUndecided ? "未定" : document.getElementById("eventTime").value;
        const location = document.getElementById("eventLocation").value.trim();
        const deadline = document.getElementById("eventDeadline").value;
        const comment = document.getElementById("eventComment").value;
        if (!title) return alert("タイトルを入力してください");
        if (!date) return alert("日付を選択してください");
        if (!timeUndecided && !time) return alert("時間を選択するか「未定」にチェックしてください");
        const createCard = document.getElementById("eventCreateCard");
        const eventId = createCard.dataset.eventId ? Number(createCard.dataset.eventId) : null;
        const performances = collectPerformances();
        try {
            loadingOverlay.style.display = "flex";
            const res = await callGasApi({ action: "saveEvent", event: { eventId, type, title, date, time, location, deadline, comment, performances } });
            if (!res.success) throw new Error(res.message || "イベント保存失敗");
            alert("保存しました");
            document.getElementById("eventCreateCard").classList.remove("active");
            document.getElementById("eventDetailCard").classList.remove("active");
            await getEvents(); loadHomeEvents(); loadEventEvents(); initCalendar();
        } catch (err) { console.error(err); alert("保存中にエラーが発生しました"); }
        finally { loadingOverlay.style.display = "none"; }
    });
});

/* =======================================================
練習日新規作成
======================================================= */
let practiceSelectedDates = new Set();
let practiceEditingId = null;
function initPracticeCreateCard() {
    delete document.getElementById("practiceCreateCard").dataset.practiceId;
    practiceEditingId = null;
    document.getElementById("practiceTitle").value = "";
    document.getElementById("practiceStart").value = "";
    document.getElementById("practiceEnd").value = "";
    document.getElementById("practiceLocation").value = "";
    document.getElementById("practiceComment").value = "";
    document.getElementById("practiceDateCalLabel").textContent = "日付（カレンダーから複数選択できます）";
    document.getElementById("deletePracticeBtn").style.display = "none";
    practiceSelectedDates = new Set();
    document.getElementById("practiceDateSelectedLabel").textContent = "未選択";
    const today = new Date();
    renderPracticeDateCalendar(today.getFullYear(), today.getMonth());
}
function openPracticeCreateForm() { initPracticeCreateCard(); document.getElementById("practiceCreateCard").classList.add("active"); }

function openPracticeEditForm(practiceData) {
    initPracticeCreateCard();
    const card = document.getElementById("practiceCreateCard");
    card.dataset.practiceId = practiceData.practiceId;
    practiceEditingId = practiceData.practiceId;
    document.getElementById("practiceTitle").value = practiceData.title || "";
    document.getElementById("practiceStart").value = practiceData.start || "";
    document.getElementById("practiceEnd").value = practiceData.end || "";
    document.getElementById("practiceLocation").value = practiceData.location || "";
    document.getElementById("practiceComment").value = practiceData.comment || "";
    document.getElementById("practiceDateCalLabel").textContent = "日付（変更する場合はカレンダーで選択）";
    const isoDate = (practiceData.date || "").replace(/\//g, "-");
    practiceSelectedDates = new Set([isoDate]);
    document.getElementById("practiceDateSelectedLabel").textContent = pcFormatJa(isoDate);
    const deleteBtn = document.getElementById("deletePracticeBtn");
    deleteBtn.style.display = userRole === "admin" ? "" : "none";
    deleteBtn.disabled = false;
    deleteBtn.textContent = "この練習日を削除";
    deleteBtn.onclick = async () => {
        if (!confirm(`「${practiceData.title || "練習"}」（${practiceData.date}）を削除しますか？\nこの操作は取り消せません。`)) return;
        deleteBtn.disabled = true; deleteBtn.textContent = "削除中…";
        const res = await callGasApi({
            action: "deletePractice",
            sessionId: localStorage.getItem("sessionId"),
            practiceId: practiceData.practiceId,
        });
        if (res?.success) {
            alert("削除しました");
            card.classList.remove("active");
            document.getElementById("practiceDetailCard").classList.remove("active");
            await getPractices(); loadHomeEvents(); initCalendar();
        } else {
            alert(res?.msg || "削除に失敗しました");
            deleteBtn.disabled = false; deleteBtn.textContent = "この練習日を削除";
        }
    };
    const [y, m] = isoDate.split("-").map(Number);
    renderPracticeDateCalendar(y, m - 1);
    card.classList.add("active");
}

/* ---- 練習日フォーム内ミニカレンダー ---- */
function pcToStr(y, m, d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function pcFormatJa(dateStr) {
    if (!dateStr) return "未選択";
    const [y, m, d] = dateStr.split("-");
    return `${y}年${Number(m)}月${Number(d)}日`;
}
function buildMiniCalendarHtml(year, month, isSelectedFn) {
    const weekdays = ["日","月","火","水","木","金","土"];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    let grid = weekdays.map(w => `<div class="cal-weekday">${w}</div>`).join("");
    for (let i = 0; i < startWeekday; i++) grid += `<div class="empty"></div>`;
    for (let d = 1; d <= totalDays; d++) {
        const dateStr = pcToStr(year, month, d);
        const sel = isSelectedFn(dateStr);
        const slashDate = `${year}/${String(month+1).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
        const event = Object.values(eventMap).find(e => normalize(e.date) === normalize(slashDate));
        const practice = Object.values(practiceMap).find(p => normalize(p.date) === normalize(slashDate));
        let dots = "";
        if (event?.type === "festival") dots += '<span class="event-dot festival"></span>';
        if (event?.type === "regular") dots += '<span class="event-dot regular"></span>';
        if (practice) dots += '<span class="event-dot practice"></span>';
        const disabled = !!practice && (!practiceEditingId || practice.practiceId !== practiceEditingId);
        grid += `<div class="day${sel ? " selected" : ""}${disabled ? " day-disabled" : ""}" data-date="${dateStr}">${d}<div class="dots">${dots}</div></div>`;
    }
    return `
        <div class="cal-header">
            <button type="button" class="cal-prev" title="前の月">&#8249;</button>
            <div class="cal-header-center"><span class="cal-year-month">${year}年 ${month+1}月</span></div>
            <button type="button" class="cal-next" title="次の月">&#8250;</button>
        </div>
        <div class="cal-grid">${grid}</div>
    `;
}
function renderPracticeDateCalendar(year, month) {
    const el = document.getElementById("practiceDateCal");
    if (!el) return;
    el.innerHTML = buildMiniCalendarHtml(year, month, dateStr => practiceSelectedDates.has(dateStr));
    el.querySelectorAll(".day:not(.day-disabled)").forEach(day => {
        day.addEventListener("click", () => {
            const d = day.dataset.date;
            if (practiceEditingId) {
                // 編集中は1日のみ選択（置き換え）
                practiceSelectedDates = new Set([d]);
            } else if (practiceSelectedDates.has(d)) {
                practiceSelectedDates.delete(d);
            } else {
                practiceSelectedDates.add(d);
            }
            const sorted = [...practiceSelectedDates].sort();
            document.getElementById("practiceDateSelectedLabel").textContent =
                sorted.length ? sorted.map(pcFormatJa).join("、") : "未選択";
            renderPracticeDateCalendar(year, month);
        });
    });
    el.querySelector(".cal-prev").addEventListener("click", () => { const p = new Date(year, month - 1); renderPracticeDateCalendar(p.getFullYear(), p.getMonth()); });
    el.querySelector(".cal-next").addEventListener("click", () => { const n = new Date(year, month + 1); renderPracticeDateCalendar(n.getFullYear(), n.getMonth()); });
}

document.addEventListener("DOMContentLoaded", () => {
    const savePracticeBtn = document.querySelector(".save-practice-btn");
    if (!savePracticeBtn) return;
    savePracticeBtn.addEventListener("click", async () => {
        const title = document.getElementById("practiceTitle").value.trim();
        const start = document.getElementById("practiceStart").value;
        const end = document.getElementById("practiceEnd").value;
        const location = document.getElementById("practiceLocation").value.trim();
        const comment = document.getElementById("practiceComment").value.trim();
        const dates = [...practiceSelectedDates].sort();
        if (dates.length === 0) return alert("カレンダーで日付を選択してください");
        if (!start) return alert("開始時間を選択してください");
        const isEdit = !!practiceEditingId;
        if (isEdit && dates.length !== 1) return alert("日付を1つ選択してください");
        if (!confirm(isEdit ? "練習日を更新しますか？" : `${dates.length}件の練習日を保存しますか？`)) return;
        try {
            loadingOverlay.style.display = "flex";
            if (isEdit) {
                const res = await callGasApi({ action: "savePractice", practice: { practiceId: practiceEditingId, title: title || "練習", date: dates[0], start, end, location, comment } });
                if (!res.success) throw new Error(res.message || "練習日保存失敗");
            } else {
                for (const date of dates) {
                    const res = await callGasApi({ action: "savePractice", practice: { title: title || "練習", date, start, end, location, comment } });
                    if (!res.success) throw new Error(res.message || "練習日保存失敗");
                }
            }
            alert("保存しました");
            document.getElementById("practiceCreateCard").classList.remove("active");
            document.getElementById("practiceDetailCard").classList.remove("active");
            await getPractices(); loadHomeEvents(); initCalendar();
        } catch (err) { console.error(err); alert(err.message || "保存中にエラーが発生しました"); }
        finally { loadingOverlay.style.display = "none"; }
    });
});

/* =======================================================
API 連携ロジック
======================================================= */
async function updateResponse(eventId, answer, card, userId) {
    if (loadingOverlay) loadingOverlay.style.display = "flex";
    try {
        const result = await callGasApi({ action: "updateEventResponse", eventId, userId, answer });
        card.querySelector(".response-btn.yes").classList.toggle("selected", answer === "参加");
        card.querySelector(".response-btn.no").classList.toggle("selected", answer === "不参加");
        fillResponseList(card.querySelector("ul.response-list.yes"), result.yes);
        fillResponseList(card.querySelector("ul.response-list.no"), result.no);
        fillResponseList(card.querySelector("ul.response-list.na"), result.na);
        card.querySelector(".toggle-response-btn.yes").textContent = `参加者 ${result.yes.length}人`;
        card.querySelector(".toggle-response-btn.no").textContent = `不参加者 ${result.no.length}人`;
        card.querySelector(".toggle-response-btn.na").textContent = `未回答者 ${result.na.length}人`;
    } catch(e) { console.error(e); }
    if (loadingOverlay) loadingOverlay.style.display = "none";
}
async function updatePracticeResponse(practiceId, answer, card, userId) {
    if (loadingOverlay) loadingOverlay.style.display = "flex";
    try {
        const result = await callGasApi({ action: "updatePracticeResponse", practiceId, userId, answer });
        card.querySelector(".response-btn.absent")?.classList.toggle("selected", answer === "欠席");
        card.querySelector(".response-btn.late")?.classList.toggle("selected", answer === "遅刻");
        fillResponseList(card.querySelector("ul.response-list.absent"), result.absent);
        fillResponseList(card.querySelector("ul.response-list.late"), result.late);
        card.querySelector(".toggle-response-btn.absent").textContent = `欠席 ${result.absent.length}人`;
        card.querySelector(".toggle-response-btn.late").textContent = `遅れて参加 ${result.late.length}人`;
    } catch(e) { console.error(e); }
    if (loadingOverlay) loadingOverlay.style.display = "none";
}
async function fillDetailCard(eventData, userId, card) {
    if (loadingOverlay) loadingOverlay.style.display = "flex";
    card.querySelector(".edit-event-btn").style.display = (userRole === "admin") ? "block" : "none";
    try {
        card.querySelector(".event-detail-card-title").textContent = eventData.title || "";
        card.querySelector(".event-detail-card-date").textContent = eventData.date || "";
        card.querySelector(".event-detail-card-time-text").textContent = eventData.time || "";
        card.querySelector(".event-detail-card-location").textContent = eventData.location || "場所未設定";
        card.querySelector(".event-detail-card-comment").textContent = eventData.comment || "";
        const myStatus = eventData.myStatus || "未回答";
        card.querySelector(".response-btn.yes").classList.toggle("selected", myStatus === "参加");
        card.querySelector(".response-btn.no").classList.toggle("selected", myStatus === "不参加");
        fillResponseList(card.querySelector("ul.response-list.yes"), eventData.members.yes);
        fillResponseList(card.querySelector("ul.response-list.no"), eventData.members.no);
        fillResponseList(card.querySelector("ul.response-list.na"), eventData.members.na);
        card.querySelector(".toggle-response-btn.yes").textContent = `参加者 ${eventData.members.yes.length}人`;
        card.querySelector(".toggle-response-btn.no").textContent = `不参加者 ${eventData.members.no.length}人`;
        card.querySelector(".toggle-response-btn.na").textContent = `未回答者 ${eventData.members.na.length}人`;
        renderPerformances(card.querySelector(".performance-list"), eventData.performances);
        card.querySelectorAll(".response-list").forEach(ul => ul.style.display = "none");
        const perfList = card.querySelector(".performance-list");
        if (perfList) perfList.style.display = "none";
    } catch(e) { console.error(e); }
    finally { if (loadingOverlay) loadingOverlay.style.display = "none"; }
}
function fillResponseList(ulElement, names) {
    if (!ulElement) return;
    ulElement.innerHTML = (names || []).map(name => `<li><span class="name">${name}</span></li>`).join('');
}
async function fillPracticeDetailCard(practiceData, userId, card) {
    card.querySelector(".practice-detail-card-title").textContent = practiceData.title || "練習";
    card.querySelector(".practice-detail-card-date").textContent = practiceData.date;
    card.querySelector(".practice-detail-card-time-text").textContent = (practiceData.start || "") + (practiceData.end ? " 〜 " + practiceData.end : "");
    card.querySelector(".practice-detail-card-location").textContent = practiceData.location || "";
    card.querySelector(".practice-detail-card-comment").textContent = practiceData.comment || "";
    const attendList = card.querySelector(".response-list.attend"); const absentList = card.querySelector(".response-list.absent"); const lateList = card.querySelector(".response-list.late");
    if (attendList) attendList.innerHTML = ""; absentList.innerHTML = ""; lateList.innerHTML = "";
    card.querySelectorAll(".response-list").forEach(ul => ul.style.display = "none");
    const isAdmin = userRole === "admin";
    const attendMembers = practiceData.attendMembers || (practiceData.attend || []).map(name => ({ userId: null, name }));
    attendMembers.forEach(m => {
        const li = document.createElement("li");
        const nameSpan = document.createElement("span");
        nameSpan.textContent = m.name;
        li.appendChild(nameSpan);
        if (isAdmin && m.userId != null) {
            li.classList.add("attend-row");
            const btn = document.createElement("button");
            btn.className = "mark-absent-btn";
            btn.textContent = "欠席にする";
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!confirm(`「${m.name}」さんを欠席にしますか？`)) return;
                btn.disabled = true; btn.textContent = "更新中…";
                const res = await callGasApi({
                    action: "setPracticeStatusForMember",
                    sessionId: localStorage.getItem("sessionId"),
                    practiceId: practiceData.practiceId,
                    targetUserId: m.userId,
                    status: "欠席",
                });
                if (res?.success) {
                    await getPractices();
                    fillPracticeDetailCard(practiceMap[practiceData.practiceId], userId, card);
                } else {
                    alert(res?.msg || "更新に失敗しました");
                    btn.disabled = false; btn.textContent = "欠席にする";
                }
            });
            li.appendChild(btn);
        }
        attendList?.appendChild(li);
    });
    (practiceData.absent || []).forEach(name => { const li = document.createElement("li"); li.textContent = name; absentList.appendChild(li); });
    (practiceData.late || []).forEach(name => { const li = document.createElement("li"); li.textContent = name; lateList.appendChild(li); });
    const attendToggle = card.querySelector(".toggle-response-btn.attend"); const absentToggle = card.querySelector(".toggle-response-btn.absent"); const lateToggle = card.querySelector(".toggle-response-btn.late");
    if (attendToggle) attendToggle.textContent = `出席 ${(practiceData.attend || []).length}人`;
    if (absentToggle) absentToggle.textContent = `欠席 ${(practiceData.absent || []).length}人`;
    if (lateToggle) lateToggle.textContent = `遅れて参加 ${(practiceData.late || []).length}人`;
    card.querySelector(".response-btn.absent")?.classList.toggle("selected", (practiceData.myStatus || "") === "欠席");
    card.querySelector(".response-btn.late")?.classList.toggle("selected", (practiceData.myStatus || "") === "遅刻");

    const editBtn = document.getElementById("editPracticeBtn");
    if (editBtn) editBtn.style.display = userRole === "admin" ? "block" : "none";
}

/* =======================================================
ししまるタブ（参加率・気づきメモ）
======================================================= */
let currentStatsFilter = "event";

function initShishimaru() {
    document.querySelectorAll(".shishi-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".shishi-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const tab = btn.dataset.shishiTab;
            document.querySelectorAll(".shishi-tab-content").forEach(c => c.classList.remove("active"));
            document.getElementById("shishi" + tab.charAt(0).toUpperCase() + tab.slice(1) + "Tab")?.classList.add("active");
            const memoInput = document.getElementById("memoInputArea");
            if (memoInput) memoInput.style.display = tab === "memo" ? "flex" : "none";
            if (tab === "stats") loadParticipationStats();
            if (tab === "memo") loadMemos();
        });
    });

    document.querySelectorAll(".stats-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".stats-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentStatsFilter = btn.dataset.filter;
            loadParticipationStats();
        });
    });

    document.getElementById("memoSendBtn")?.addEventListener("click", sendMemo);
    document.getElementById("memoInput")?.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMemo(); }
    });

    document.getElementById("shishiRefreshBtn")?.addEventListener("click", () => {
        const activeTab = document.querySelector(".shishi-tab-btn.active")?.dataset.shishiTab;
        if (activeTab === "memo") loadMemos();
        else loadParticipationStats();
    });
}

async function loadParticipationStats() {
    const area = document.getElementById("statsArea");
    if (!area) return;
    area.innerHTML = '<div class="stats-empty">読み込み中…</div>';
    const res = await callGasApi({ action: "getParticipationStats", filter: currentStatsFilter });
    if (!res?.success || !res.stats?.length) {
        area.innerHTML = '<div class="stats-empty">データなし</div>';
        return;
    }
    area.innerHTML = "";
    res.stats.forEach((s, i) => {
        const pct = Math.round(s.rate * 100);
        const div = document.createElement("div");
        div.className = "stat-item";
        div.innerHTML = `
            <span class="stat-rank">${i + 1}</span>
            <span class="stat-name">${s.name}</span>
            <div class="stat-bar-wrap"><div class="stat-bar" style="width:0%"></div></div>
            <span class="stat-pct">${pct}%</span>
            <span class="stat-count">${s.participated}/${s.total}</span>
        `;
        area.appendChild(div);
        requestAnimationFrame(() => { div.querySelector(".stat-bar").style.width = pct + "%"; });
    });
}

async function loadMemos() {
    const feed = document.getElementById("memoFeed");
    if (!feed) return;
    feed.innerHTML = '<div class="memo-empty">読み込み中…</div>';
    const res = await callGasApi({ action: "getMemos" });
    if (!res?.success) { feed.innerHTML = '<div class="memo-empty">取得失敗</div>'; return; }
    renderMemos(res.memos || []);
}

function renderMemos(memos) {
    const feed = document.getElementById("memoFeed");
    if (!feed) return;
    if (!memos.length) { feed.innerHTML = '<div class="memo-empty">まだメモがありません</div>'; return; }
    feed.innerHTML = "";
    memos.forEach(m => feed.appendChild(buildMemoItem(m)));
}

function buildMemoItem(m) {
    const div = document.createElement("div");
    div.className = "memo-item";
    const canDelete = (m.user_id == userId) || userRole === "admin";
    div.innerHTML = `
        <div class="memo-header">
            <span class="memo-author">${m.user_name || "名無し"}</span>
            <span class="memo-date">${m.date || ""}</span>
            ${canDelete ? `<button class="memo-delete-btn" data-memo-id="${m.memo_id}">削除</button>` : ""}
        </div>
        <div class="memo-text">${escHtml(m.text || "")}</div>
    `;
    if (canDelete) {
        div.querySelector(".memo-delete-btn").addEventListener("click", () => deleteMemo(m.memo_id));
    }
    return div;
}

async function sendMemo() {
    const input = document.getElementById("memoInput");
    const text = input?.value.trim();
    if (!text) return;
    input.value = "";
    const res = await callGasApi({ action: "saveMemo", text, userId });
    if (res?.success) loadMemos();
    else { alert("投稿に失敗しました"); input.value = text; }
}

async function deleteMemo(memoId) {
    if (!confirm("削除しますか？")) return;
    const res = await callGasApi({ action: "deleteMemo", memoId, userId });
    if (res?.success) loadMemos();
    else alert("削除に失敗しました");
}

function escHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* =======================================================
春例大祭 進行状況ウィジェット
======================================================= */
let haruDay = "土曜";
let haruGroup = "上組";
let haruAllGroups = {};
let haruYear = new Date().getFullYear();

async function applyHaruWidgetVisibility(visible) {
    const widget = document.getElementById("haruWidget");
    const sw = document.getElementById("haruWidgetToggleSwitch");
    if (widget) widget.style.display = visible ? "" : "none";
    if (sw) sw.checked = visible;
}

function openAppSettings() {
    document.getElementById("appSettingsCard").classList.add("active");
    const adminSection = document.getElementById("appSettingsAdminSection");
    if (adminSection) adminSection.style.display = (userRole === "admin") ? "" : "none";
    if (userRole === "admin") initHaruWidgetVisibility();
    initPasswordChange();
    initPushNotify();
}

let pwChangeListenerAttached = false;
function initPasswordChange() {
    if (pwChangeListenerAttached) return;
    const btn = document.getElementById("pwChangeBtn");
    const msg = document.getElementById("pwChangeMessage");
    const cur = document.getElementById("pwChangeCurrent");
    const next = document.getElementById("pwChangeNew");
    const conf = document.getElementById("pwChangeConfirm");
    if (!btn) return;

    // タイトルクリックで開閉
    const toggle = document.getElementById("pwChangeToggle");
    const form = document.getElementById("pwChangeForm");
    toggle?.addEventListener("click", () => {
        const open = form.style.display === "none";
        form.style.display = open ? "" : "none";
        toggle.classList.toggle("open", open);
    });

    btn.addEventListener("click", async () => {
        const setMsg = (text, ok) => { msg.style.color = ok ? "green" : "red"; msg.textContent = text; };
        const c = cur.value.trim(), n = next.value.trim(), cf = conf.value.trim();
        if (!c || !n || !cf) { setMsg("すべて入力してください", false); return; }
        if (n.length < 4) { setMsg("新しいパスワードは4文字以上にしてください", false); return; }
        if (n !== cf) { setMsg("新しいパスワード（確認）が一致しません", false); return; }
        btn.disabled = true; btn.textContent = "変更中...";
        const res = await callGasApi({
            action: "changePassword",
            sessionId: localStorage.getItem("sessionId"),
            currentPassword: c,
            newPassword: n,
        });
        btn.disabled = false; btn.textContent = "パスワードを変更";
        if (res?.success) {
            setMsg("パスワードを変更しました", true);
            cur.value = ""; next.value = ""; conf.value = "";
            // 自動ログイン用に保存されたパスワードも更新
            if (localStorage.getItem("savedPassword") !== null) {
                localStorage.setItem("savedPassword", n);
            }
        } else {
            setMsg(res?.msg || "変更に失敗しました", false);
        }
    });
    pwChangeListenerAttached = true;
}

let haruWidgetSwitchListenerAttached = false;
async function initHaruWidgetVisibility() {
    const res = await callGasApi({ action: "getSetting", key: "haruWidgetVisible" });
    const visible = res.value === null ? true : res.value === "true";
    applyHaruWidgetVisibility(visible);

    if (!haruWidgetSwitchListenerAttached) {
        const sw = document.getElementById("haruWidgetToggleSwitch");
        sw?.addEventListener("change", async () => {
            const v = sw.checked;
            applyHaruWidgetVisibility(v);
            await callGasApi({ action: "saveSetting", key: "haruWidgetVisible", value: String(v), userId: localStorage.getItem("sessionId") });
        });
        haruWidgetSwitchListenerAttached = true;
    }
}

function initHaruWidget() {
    initHaruWidgetVisibility();
    // トグル（開閉）
    const toggleBtn = document.getElementById("haruWidgetToggle");
    const body = document.getElementById("haruWidgetBody");
    const icon = toggleBtn?.querySelector(".haru-toggle-icon");
    toggleBtn?.addEventListener("click", (e) => {
        // 日曜/土曜ボタンのクリックはトグルに伝播させない
        if (e.target.closest(".haru-day-btn")) return;
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        if (icon) icon.textContent = isOpen ? "▼" : "▲";
        if (!isOpen) {
            renderHaruYearChips();
            if (!Object.keys(haruAllGroups).length) loadHaruProgress();
        }
    });

    // 土曜/日曜切り替え
    document.querySelectorAll(".haru-day-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            haruDay = btn.dataset.day;
            document.querySelectorAll(".haru-day-btn").forEach(b => b.classList.toggle("active", b.dataset.day === haruDay));
            if (body.style.display !== "none") loadHaruProgress();
        });
    });

    // 上組/下組タブ
    document.querySelectorAll(".haru-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            haruGroup = btn.dataset.group;
            document.querySelectorAll(".haru-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.group === haruGroup));
            renderHaruProgress(haruAllGroups);
        });
    });
}

function renderHaruYearChips() {
    const container = document.getElementById("haruYearChips");
    if (!container) return;
    const cy = new Date().getFullYear();
    const years = [cy - 1, cy, cy + 1];
    container.innerHTML = years.map(y =>
        `<button class="haru-year-chip${y === haruYear ? " active" : ""}" data-year="${y}">${y}年</button>`
    ).join("");
    container.querySelectorAll(".haru-year-chip").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            haruYear = Number(btn.dataset.year);
            haruAllGroups = {};
            renderHaruYearChips();
            loadHaruProgress();
        });
    });
}

async function loadHaruProgress() {
    renderHaruYearChips();
    const list = document.getElementById("haruProgressList");
    list.innerHTML = '<div class="skeleton skeleton-card" style="height:60px;"></div>';
    try {
        const res = await callGasApi({ action: "getOtabiAllProgress", year: haruYear, day: haruDay });
        if (!res.success) throw new Error();
        haruAllGroups = res.groups || {};
        renderHaruProgress(haruAllGroups);
    } catch(e) {
        list.innerHTML = '<p style="color:var(--text-3);padding:12px;">読み込みに失敗しました</p>';
    }
}

function haruTimeDiff(planned, actual) {
    if (!planned || !actual) return "";
    const [ph, pm] = planned.split(":").map(Number);
    const [ah, am] = actual.split(":").map(Number);
    const diff = (ah * 60 + am) - (ph * 60 + pm);
    if (diff === 0) return "±0分";
    return diff > 0 ? `+${diff}分` : `${diff}分`;
}

function renderHaruProgress(groups) {
    const list = document.getElementById("haruProgressList");
    const groupKeys = Object.keys(groups).filter(g => g === haruGroup);
    if (!groupKeys.length) {
        list.innerHTML = '<p style="color:var(--text-3);padding:12px;">データがありません</p>';
        return;
    }
    const isAdmin = userRole === "admin";
    list.innerHTML = groupKeys.map(g => {
        const entries = groups[g];
        const done = entries.filter(e => e.actual_time).length;
        const rows = entries.map(e => {
            const isDone = !!e.actual_time;
            const diff = haruTimeDiff(e.time, e.actual_time);
            const diffClass = diff.startsWith("+") ? "haru-diff-late" : diff.startsWith("-") ? "haru-diff-early" : "haru-diff-zero";
            const completeBtn = isAdmin
                ? `<button class="haru-complete-btn${isDone ? ' done' : ''}" data-id="${e.entry_id}" data-name="${escHtml(e.place_name)}">${isDone ? '完了済' : '完了'}</button>`
                : '';
            const jointBadge = e.is_joint ? '<span class="haru-joint-badge">合同</span>' : '';
            return `<div class="haru-entry-row${isDone ? ' done' : ''}${e.is_joint ? ' haru-joint' : ''}">
                <span class="haru-no">${e.no}</span>
                <span class="haru-time">${e.time || '--:--'}</span>
                <span class="haru-name">${escHtml(e.place_name)}${jointBadge}</span>
                <span class="haru-actual">${e.actual_time || ''}</span>
                ${diff ? `<span class="haru-diff ${diffClass}">${diff}</span>` : '<span></span>'}
                ${completeBtn}
            </div>`;
        }).join('');
        return `<div class="haru-group-block">
            <div class="haru-group-label">${g} <span class="haru-count">${done}/${entries.length}</span></div>
            ${rows}
        </div>`;
    }).join('');

    if (isAdmin) {
        list.querySelectorAll(".haru-complete-btn").forEach(btn => {
            btn.addEventListener("click", () => haruMarkComplete(Number(btn.dataset.id), btn.dataset.name));
        });
    }
}

async function haruMarkComplete(entryId, placeName) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const input = prompt(`「${placeName}」の到着時間`, `${hh}:${mm}`);
    if (input === null) return;
    const timeVal = input.trim() || `${hh}:${mm}`;
    loadingOverlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "markOtabiComplete", entryId, actualTime: timeVal });
        if (!res.success) throw new Error(res.msg || "失敗");
        // ローカルキャッシュを更新して再描画
        Object.values(haruAllGroups).forEach(entries => {
            const e = entries.find(e => e.entry_id === entryId);
            if (e) e.actual_time = timeVal;
        });
        renderHaruProgress(haruAllGroups);
    } catch(e) { alert("保存中にエラーが発生しました"); }
    finally { loadingOverlay.style.display = "none"; }
}

/* =======================================================
カレンダー描画
======================================================= */
function initCalendar() { const t = new Date(); generateCalendar(t.getFullYear(), t.getMonth()); }

function generateCalendar(year, month, direction) {
    const cal = document.getElementById("calendarArea");
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const weekdays = ["日","月","火","水","木","金","土"];
    const todayObj = new Date();
    const isCurrentMonth = (todayObj.getFullYear() === year && todayObj.getMonth() === month);
    let gridHtml = weekdays.map(w => `<div class="cal-weekday">${w}</div>`).join('');
    for (let i = 0; i < startWeekday; i++) gridHtml += `<div class="empty"></div>`;
    for (let d = 1; d <= totalDays; d++) {
        const fullDate = `${year}/${String(month+1).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
        const event = Object.values(eventMap).find(e => normalize(e.date) === normalize(fullDate));
        const practice = Object.values(practiceMap).find(p => normalize(p.date) === normalize(fullDate));
        let dots = "";
        if (event?.type === "festival") dots += '<span class="event-dot festival"></span>';
        if (event?.type === "regular") dots += '<span class="event-dot regular"></span>';
        if (practice) dots += '<span class="event-dot practice"></span>';
        const isToday = (todayObj.getFullYear() === year && todayObj.getMonth() === month && todayObj.getDate() === d);
        gridHtml += `<div class="day${isToday ? " today" : ""}" data-date="${fullDate}">${d}<div class="dots">${dots}</div></div>`;
    }
    const newHtml = `
        <div class="cal-header">
            <button class="cal-prev-year" title="前の年">&#171;</button>
            <button class="cal-prev" title="前の月">&#8249;</button>
            <div class="cal-header-center">
                <span class="cal-year-month">${year}年 ${month+1}月</span>
                ${!isCurrentMonth ? `<button class="cal-today-btn">今月</button>` : ""}
            </div>
            <button class="cal-next" title="次の月">&#8250;</button>
            <button class="cal-next-year" title="次の年">&#187;</button>
        </div>
        <div class="cal-grid">${gridHtml}</div>
    `;
    if (direction) {
        cal.style.transition = "none";
        cal.style.transform = `translateX(${direction > 0 ? "30%" : "-30%"})`;
        cal.style.opacity = "0";
        cal.innerHTML = newHtml;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            cal.style.transition = "transform 0.28s ease, opacity 0.28s ease";
            cal.style.transform = "translateX(0)";
            cal.style.opacity = "1";
        }));
    } else { cal.style.transform = ""; cal.style.opacity = ""; cal.innerHTML = newHtml; }

    function selectDay(dayElem) {
        cal.querySelectorAll(".day.selected").forEach(el => el.classList.remove("selected"));
        dayElem.classList.add("selected");
        loadEventByDate(dayElem.dataset.date);
    }
    cal.querySelectorAll(".day").forEach(day => day.addEventListener("click", () => selectDay(day)));
    if (isCurrentMonth) {
        const todayStr = `${year}/${String(month+1).padStart(2,"0")}/${String(todayObj.getDate()).padStart(2,"0")}`;
        const todayCell = cal.querySelector(`.day[data-date="${todayStr}"]`);
        if (todayCell) selectDay(todayCell);
    }
    cal.querySelector(".cal-prev").addEventListener("click", () => { const p = new Date(year, month-1); generateCalendar(p.getFullYear(), p.getMonth(), 1); });
    cal.querySelector(".cal-next").addEventListener("click", () => { const n = new Date(year, month+1); generateCalendar(n.getFullYear(), n.getMonth(), -1); });
    cal.querySelector(".cal-prev-year").addEventListener("click", () => generateCalendar(year-1, month, 1));
    cal.querySelector(".cal-next-year").addEventListener("click", () => generateCalendar(year+1, month, -1));
    const todayBtn = cal.querySelector(".cal-today-btn");
    if (todayBtn) todayBtn.addEventListener("click", () => { const n = new Date(); generateCalendar(n.getFullYear(), n.getMonth()); });
    let touchStartX = 0; let touchStartY = 0;
    cal.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
    cal.addEventListener("touchend", e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) { const n = new Date(year, month+1); generateCalendar(n.getFullYear(), n.getMonth(), -1); }
            else { const p = new Date(year, month-1); generateCalendar(p.getFullYear(), p.getMonth(), 1); }
        }
    }, { passive: true });
}

function loadEventByDate(dateStr) { renderEventsOfDate(dateStr); }
function renderEventsOfDate(dateStr) {
    const eventArea = document.getElementById("eventArea");
    eventArea.innerHTML = "";
    const norm = s => s.replace(/-/g, "/").split(" ")[0];
    const eventsToday = Object.values(eventMap).filter(ev => norm(ev.date) === norm(dateStr));
    const practiceToday = Object.values(practiceMap).filter(pr => norm(pr.date) === norm(dateStr));
    if (!eventsToday.length && !practiceToday.length) { eventArea.innerHTML = `<div class="no-event">予定なし</div>`; return; }
    const fragment = document.createDocumentFragment();
    eventsToday.forEach(ev => fragment.appendChild(createEventCard(ev, { includeDeadline: true })));
    practiceToday.forEach(pr => fragment.appendChild(createPracticeCard(pr)));
    eventArea.appendChild(fragment);
}
