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
    if (userRole === "admin") loadMembersAdmin();
    initHaruWidget();
});

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
function buildPerfItem(data = {}) {
    const div = document.createElement("div");
    div.className = "perf-item";
    const escQ = s => (s || '').replace(/"/g, '&quot;');
    div.innerHTML = `
        <div class="perf-item-header">
            <div class="perf-item-header-left">
                <input type="number" class="perf-no-input" placeholder="No." value="${escQ(String(data.no || ''))}" min="1">
                <input type="time" class="perf-time-from" value="${escQ(data.timeFrom || '')}">
                <span class="perf-tilde">〜</span>
                <input type="time" class="perf-time-to" value="${escQ(data.timeTo || '')}">
            </div>
            <button class="perf-remove-btn" type="button">✕</button>
        </div>
        <input type="text" class="perf-name" placeholder="演目名（提蠹・狐・三継ぎなど）" value="${escQ(data.name || '')}">
        <div class="perf-drums">
            <input type="text" class="perf-taiko-dai" placeholder="大太鼓" value="${escQ(data.taikoDai || '')}">
            <input type="text" class="perf-taiko-ko" placeholder="小太鼓" value="${escQ(data.taikoKo || '')}">
        </div>
        <div class="perf-roles-list"></div>
        <button class="perf-add-role-btn" type="button">＋ 役割を追加（演者・獅子・子役・台…）</button>
    `;
    div.querySelector(".perf-remove-btn").addEventListener("click", () => div.remove());
    div.querySelector(".perf-add-role-btn").addEventListener("click", () => addRoleRow(div.querySelector(".perf-roles-list")));
    const rolesList = div.querySelector(".perf-roles-list");
    if (data.roles && Array.isArray(data.roles)) {
        if (data.roles.length) data.roles.forEach(r => addRoleRow(rolesList, r));
        else { addRoleRow(rolesList, { label: "演者" }); addRoleRow(rolesList, { label: "獅子" }); }
    } else if (data.roles && typeof data.roles === 'object') {
        const entries = Object.entries(data.roles).filter(([, v]) => v);
        if (entries.length) entries.forEach(([label, members]) => addRoleRow(rolesList, { label, members: String(members) }));
        else { addRoleRow(rolesList, { label: "演者" }); addRoleRow(rolesList, { label: "獅子" }); }
    } else {
        addRoleRow(rolesList, { label: "演者" });
        addRoleRow(rolesList, { label: "獅子" });
    }
    return div;
}

function addRoleRow(container, data = {}) {
    const row = document.createElement("div");
    row.className = "perf-role-row";
    const escQ = s => (s || '').replace(/"/g, '&quot;');
    row.innerHTML = `
        <div class="perf-role-row-top">
            <input type="text" class="role-label-input" placeholder="役割（演者・獅子・子役・中台・土台…）" value="${escQ(data.label || '')}">
            <button class="role-remove-btn" type="button">✕</button>
        </div>
        <textarea class="role-members-input" placeholder="名前（複数の場合は改行で区切る）" rows="2">${data.members || ''}</textarea>
    `;
    row.querySelector(".role-remove-btn").addEventListener("click", () => row.remove());
    container.appendChild(row);
}

function collectPerformances() {
    const performances = [];
    document.querySelectorAll("#performanceList .perf-item").forEach(item => {
        const name = item.querySelector(".perf-name")?.value.trim();
        if (!name) return;
        const roles = [];
        item.querySelectorAll(".perf-role-row").forEach(row => {
            const label = row.querySelector(".role-label-input")?.value.trim();
            const members = row.querySelector(".role-members-input")?.value.trim();
            if (label) roles.push({ label, members: members || "" });
        });
        performances.push({
            no: item.querySelector(".perf-no-input")?.value || "",
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

function renderPerformances(container, performances) {
    container.innerHTML = "";
    if (!performances?.length) return;
    performances.forEach(perf => {
        const div = document.createElement("div");
        div.className = "perf-detail-item";
        const time = perf.timeFrom ? `${perf.timeFrom}〜${perf.timeTo || ''}` : '';
        let rolesHtml = '';
        if (Array.isArray(perf.roles)) {
            rolesHtml = perf.roles.map(r => `
                <div class="perf-detail-role">
                    <span class="perf-role-label-text">${r.label || ''}</span>
                    <span class="perf-role-members-text">${(r.members || '').replace(/\n/g, '、')}</span>
                </div>`).join('');
        } else if (perf.roles && typeof perf.roles === 'object') {
            rolesHtml = Object.entries(perf.roles).filter(([, v]) => v).map(([k, v]) => `
                <div class="perf-detail-role">
                    <span class="perf-role-label-text">${k}</span>
                    <span class="perf-role-members-text">${v}</span>
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
                ${perf.taikoDai ? `<span>大太鼓: ${perf.taikoDai}</span>` : ''}
                ${perf.taikoKo ? `<span>小太鼓: ${perf.taikoKo}</span>` : ''}
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
        if (practiceCard && !target.closest(".close-card-btn, .response-btn, .toggle-response-btn")) {
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
                case "member-management":  document.getElementById("membersCardAdmin")?.classList.remove("active"); break;
                case "create":             document.getElementById("eventCreateCard")?.classList.remove("active"); break;
                case "practice-create":    document.getElementById("practiceCreateCard")?.classList.remove("active"); break;
                case "otabi":              document.getElementById("otabiCard")?.classList.remove("active"); break;
                case "otabi-place-form":   document.getElementById("otabiPlaceFormCard")?.classList.remove("active"); break;
                case "otabi-entry-form":   document.getElementById("otabiEntryFormCard")?.classList.remove("active"); break;
                case "otabi-bulk-entry":   document.getElementById("otabiBulkEntryCard")?.classList.remove("active"); break;
                case "gear-management":    document.getElementById("gearCard")?.classList.remove("active"); break;
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
    });
}

/* =======================================================
タブ / メンバー
======================================================= */
document.querySelectorAll(".tab-item").forEach(tab => {
    tab.addEventListener("click", async () => {
        const targetTab = tab.dataset.target;
        if (targetTab === "member") { document.getElementById("membersCardUser").classList.add("active"); return; }
        if (targetTab === "member-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } document.getElementById("membersCardAdmin").classList.add("active"); return; }
        if (targetTab === "event-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } openCreateForm(); return; }
        if (targetTab === "practice-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } openPracticeCreateForm(); return; }
        if (targetTab === "otabi-management") { if (userRole === "user") { alert("管理者のみアクセスできます。"); return; } openOtabiCard(); return; }
        if (targetTab === "gear-management") { openGearCard(); return; }
        if (targetTab === "mypage") { openMyPage(); return; }
    });
});

async function loadMembersUser() {
    const card = document.getElementById("membersCardUser");
    const list = document.getElementById("memberListUser");
    const overlay = card.querySelector(".loading-overlay");
    overlay.style.display = "flex";
    const res = await callGasApi({ action: "getMembers", role: "user" });
    list.innerHTML = "";
    res.members.filter(m => m.status === "active").forEach(m => list.appendChild(buildMemberItemUser(m)));
    overlay.style.display = "none";
}
async function loadMembersAdmin() {
    const card = document.getElementById("membersCardAdmin");
    const list = document.getElementById("memberListAdmin");
    const overlay = card.querySelector(".loading-overlay");
    overlay.style.display = "flex";
    try {
        const res = await callGasApi({ action: "getMembers", role: "admin" });
        list.innerHTML = "";
        const hold = res.members.filter(m => m.status === "hold");
        const active = res.members.filter(m => m.status === "active");
        if (hold.length) { list.appendChild(makeTitle("承認待ちメンバー")); hold.forEach(m => list.appendChild(buildMemberItemAdmin(m, true))); }
        if (active.length) { list.appendChild(makeTitle("アクティブメンバー")); active.forEach(m => list.appendChild(buildMemberItemAdmin(m, false))); }
    } finally { overlay.style.display = "none"; }
}
function buildMemberItemUser(member) {
    const li = document.createElement("li"); li.classList.add("member-item");
    if (member.position) { const p = document.createElement("span"); p.classList.add("member-position"); p.textContent = member.position; li.appendChild(p); }
    const n = document.createElement("span"); n.classList.add("member-name"); n.textContent = member.name; li.appendChild(n);
    appendChildren(li, member, false);
    const btn = document.createElement("button");
    btn.classList.add("member-profile-btn");
    btn.innerHTML = `<i class="fas fa-user"></i>`;
    btn.addEventListener("click", () => openMemberProfile(member.userId, member.name));
    li.appendChild(btn);
    return li;
}
function buildMemberItemAdmin(member, isHold) {
    const li = document.createElement("li"); li.classList.add("member-item");
    if (isHold) li.classList.add("is-hold");
    if (member.position) { const p = document.createElement("span"); p.classList.add("member-position"); p.textContent = member.position; li.appendChild(p); }
    const n = document.createElement("span"); n.classList.add("member-name"); n.textContent = member.name; li.appendChild(n);
    appendChildren(li, member, true);
    const btn = document.createElement("button"); btn.classList.add("member-action");
    if (isHold) { btn.textContent = "承認する"; btn.addEventListener("click", () => approveMember(member.userId)); }
    else { btn.textContent = "削除"; btn.addEventListener("click", () => deleteMember(member.userId)); }
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
            delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteChild(child.childId, child.childName); });
            c.appendChild(delBtn);
        }
        ul.appendChild(c);
    });
    details.appendChild(ul); li.appendChild(details);
}
function makeTitle(text) { const p = document.createElement("p"); p.textContent = text; p.classList.add("list-title"); return p; }
async function approveMember(userId) {
    if (!confirm("このユーザーを承認しますか？")) return;
    const res = await callGasApi({ action: "approveMember", userId });
    if (res.success) { alert("承認しました！"); loadMembersAdmin(); } else alert("承認に失敗しました");
}
async function deleteMember(userId) {
    if (!confirm("本当に削除しますか？")) return;
    const res = await callGasApi({ action: "deleteMember", userId });
    if (res.success) { alert("削除しました！"); loadMembersAdmin(); } else alert("削除に失敗しました");
}
async function deleteChild(childId, childName) {
    if (!confirm(`「${childName}」を削除しますか？`)) return;
    const res = await callGasApi({ action: "deleteChild", childId, userId });
    if (res.success) { alert("削除しました！"); loadMembersAdmin(); } else alert(res.msg || "削除に失敗しました");
}

/* =======================================================
イベント新規作成
======================================================= */
function initEventCreateCard() {
    document.getElementById("eventTitle").value = "";
    document.getElementById("eventDate").value = "";
    document.getElementById("eventTime").value = "";
    document.getElementById("eventTimeUndecided").checked = false;
    document.getElementById("eventTime").disabled = false;
    document.getElementById("eventLocation").value = "";
    document.getElementById("eventDeadline").value = "";
    document.getElementById("eventComment").value = "";
    document.getElementById("performanceList").innerHTML = "";
    const overlay = document.querySelector(".event-create-card .loading-overlay");
    if (overlay) overlay.style.display = "none";
}
function openCreateForm() {
    initEventCreateCard();
    document.querySelector(".event-create-card").classList.add("active");
}
function openEditForm(eventData) {
    initEventCreateCard();
    const editCard = document.querySelector(".event-create-card");
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
        eventData.performances.forEach(perf => performanceList.appendChild(buildPerfItem(perf)));
    }
    editCard.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("eventTimeUndecided").addEventListener("change", (e) => {
        const timeInput = document.getElementById("eventTime");
        timeInput.disabled = e.target.checked;
        if (e.target.checked) timeInput.value = "";
    });

    document.getElementById("addPerformanceBtn").addEventListener("click", () => {
        const list = document.getElementById("performanceList");
        const nextNo = list.querySelectorAll(".perf-item").length + 1;
        list.appendChild(buildPerfItem({ no: nextNo }));
    });

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
        const createCard = document.querySelector(".event-create-card");
        const eventId = createCard.dataset.eventId ? Number(createCard.dataset.eventId) : null;
        const performances = collectPerformances();
        try {
            loadingOverlay.style.display = "flex";
            const res = await callGasApi({ action: "saveEvent", event: { eventId, type, title, date, time, location, deadline, comment, performances } });
            if (!res.success) throw new Error(res.message || "イベント保存失敗");
            alert("保存しました");
            document.getElementById("eventCreateCard").classList.remove("active");
        } catch (err) { console.error(err); alert("保存中にエラーが発生しました"); }
        finally { loadingOverlay.style.display = "none"; }
    });
});

/* =======================================================
練習日新規作成
======================================================= */
function initPracticeCreateCard() {
    document.getElementById("practiceTitle").value = "";
    document.getElementById("practiceDate").value = "";
    document.getElementById("practiceStartDate").value = "";
    document.getElementById("practiceEndDate").value = "";
    document.getElementById("practiceStart").value = "";
    document.getElementById("practiceEnd").value = "";
    document.getElementById("practiceLocation").value = "";
    document.getElementById("practiceComment").value = "";
    const rangeMode = document.getElementById("practiceRangeMode");
    if (rangeMode) rangeMode.checked = false;
    document.getElementById("practiceSingleDate").style.display = "";
    document.getElementById("practiceRangeDates").style.display = "none";
    document.querySelectorAll('input[name="practiceWeekday"]').forEach(cb => cb.checked = false);
}
function openPracticeCreateForm() { initPracticeCreateCard(); document.getElementById("practiceCreateCard").classList.add("active"); }

document.addEventListener("DOMContentLoaded", () => {
    const rangeModeCheck = document.getElementById("practiceRangeMode");
    if (rangeModeCheck) {
        rangeModeCheck.addEventListener("change", () => {
            document.getElementById("practiceSingleDate").style.display = rangeModeCheck.checked ? "none" : "";
            document.getElementById("practiceRangeDates").style.display = rangeModeCheck.checked ? "" : "none";
        });
    }
    const savePracticeBtn = document.querySelector(".save-practice-btn");
    if (!savePracticeBtn) return;
    savePracticeBtn.addEventListener("click", async () => {
        const title = document.getElementById("practiceTitle").value.trim();
        const start = document.getElementById("practiceStart").value;
        const end = document.getElementById("practiceEnd").value;
        const location = document.getElementById("practiceLocation").value.trim();
        const comment = document.getElementById("practiceComment").value.trim();
        const isRange = document.getElementById("practiceRangeMode").checked;
        let datesToSave = [];
        if (isRange) {
            const startDate = document.getElementById("practiceStartDate").value;
            const endDate = document.getElementById("practiceEndDate").value;
            const selectedWeekdays = [...document.querySelectorAll('input[name="practiceWeekday"]:checked')].map(cb => Number(cb.value));
            if (!startDate) return alert("開始日を選択してください");
            if (!endDate) return alert("終了日を選択してください");
            if (startDate > endDate) return alert("開始日は終了日より前にしてください");
            if (selectedWeekdays.length === 0) return alert("曜日を選択してください");
            const cur = new Date(startDate + "T00:00:00"); const last = new Date(endDate + "T00:00:00");
            while (cur <= last) {
                if (selectedWeekdays.includes(cur.getDay())) datesToSave.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`);
                cur.setDate(cur.getDate() + 1);
            }
            if (datesToSave.length === 0) return alert("指定の期間・曜日に該当する日がありません");
            if (!confirm(`${datesToSave.length}件の練習日を登録します。よろしいですか？`)) return;
        } else {
            const date = document.getElementById("practiceDate").value;
            if (!date) return alert("日付を選択してください");
            datesToSave = [date];
            if (!confirm("練習日を保存しますか？")) return;
        }
        if (!start) return alert("開始時間を選択してください");
        try {
            loadingOverlay.style.display = "flex";
            for (const date of datesToSave) {
                const res = await callGasApi({ action: "savePractice", practice: { title: title || "練習", date, start, end, location, comment } });
                if (!res.success) throw new Error(res.message || "練習日保存失敗");
            }
            alert("保存しました");
            document.getElementById("practiceCreateCard").classList.remove("active");
            await getPractices(); loadHomeEvents(); initCalendar();
        } catch (err) { console.error(err); alert("保存中にエラーが発生しました"); }
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
    const absentList = card.querySelector(".response-list.absent"); const lateList = card.querySelector(".response-list.late");
    absentList.innerHTML = ""; lateList.innerHTML = "";
    card.querySelectorAll(".response-list").forEach(ul => ul.style.display = "none");
    (practiceData.absent || []).forEach(name => { const li = document.createElement("li"); li.textContent = name; absentList.appendChild(li); });
    (practiceData.late || []).forEach(name => { const li = document.createElement("li"); li.textContent = name; lateList.appendChild(li); });
    const absentToggle = card.querySelector(".toggle-response-btn.absent"); const lateToggle = card.querySelector(".toggle-response-btn.late");
    if (absentToggle) absentToggle.textContent = `欠席 ${(practiceData.absent || []).length}人`;
    if (lateToggle) lateToggle.textContent = `遅れて参加 ${(practiceData.late || []).length}人`;
    card.querySelector(".response-btn.absent")?.classList.toggle("selected", (practiceData.myStatus || "") === "欠席");
    card.querySelector(".response-btn.late")?.classList.toggle("selected", (practiceData.myStatus || "") === "遅刻");
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

function initHaruWidget() {
    document.querySelectorAll(".haru-day-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            haruDay = btn.dataset.day;
            document.querySelectorAll(".haru-day-btn").forEach(b => b.classList.toggle("active", b.dataset.day === haruDay));
            loadHaruProgress();
        });
    });
    document.querySelectorAll(".haru-group-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            haruGroup = btn.dataset.group;
            document.querySelectorAll(".haru-group-btn").forEach(b => b.classList.toggle("active", b.dataset.group === haruGroup));
            renderHaruProgress(haruAllGroups);
        });
    });
    loadHaruProgress();
}

async function loadHaruProgress() {
    const list = document.getElementById("haruProgressList");
    list.innerHTML = '<div class="skeleton skeleton-card" style="height:60px;"></div>';
    try {
        const year = new Date().getFullYear();
        const res = await callGasApi({ action: "getOtabiAllProgress", year, day: haruDay });
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
