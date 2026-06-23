// =======================================================
// マイページ
// =======================================================

let myPageTargetUserId = null;
let myPageCurrentUser = null;

function openMyPage() {
    document.getElementById("myPageTitle").textContent = "マイページ";
    document.getElementById("myPageCard").classList.add("active");
    loadMyPageFor(userId, true);
}

function openMemberProfile(targetUserId, name) {
    document.getElementById("myPageTitle").textContent = name;
    document.getElementById("myPageCard").classList.add("active");
    loadMyPageFor(targetUserId, false);
}

async function loadMyPageFor(targetUserId, showRate) {
    myPageTargetUserId = targetUserId;
    const card = document.getElementById("myPageCard");
    const overlay = card.querySelector(".loading-overlay");
    const content = document.getElementById("myPageContent");
    overlay.style.display = "flex";
    content.innerHTML = "";
    const res = await callGasApi({ action: "getMyPage", userId: targetUserId });
    overlay.style.display = "none";
    if (!res?.success) { content.innerHTML = '<p style="padding:16px;color:var(--text-3);">取得失敗</p>'; return; }
    myPageCurrentUser = res.user;
    renderMyPage(res, showRate);
}

function renderMyPage({ user, gear, eventRate, practiceRate }, showRate = true) {
    const content = document.getElementById("myPageContent");
    const g = gear || {};
    const gearRows = [
        { label: "法被番号",     val: g.happi_no },
        { label: "Tシャツサイズ", val: g.tshirt_size },
        { label: "手甲",         val: g.tekkou },
        { label: "はかま",       val: g.hakama },
        { label: "着物（上）",   val: g.kimono_top },
        { label: "着物（下）",   val: g.kimono_bottom },
        { label: "メモ",         val: g.memo },
    ].filter(r => r.val !== "" && r.val !== undefined);

    const roleLabel = user.role === "admin" ? "管理者" : "一般";
    const isAdmin = typeof userRole !== "undefined" && userRole === "admin";

    const rateSection = showRate ? `
        <div class="mypage-section">
            <div class="mypage-section-title">参加率</div>
            ${eventRate ? rateBar("イベント", Math.round(eventRate.rate * 100), eventRate.participated, eventRate.total) : '<p class="mypage-empty">データなし</p>'}
            ${practiceRate ? rateBar("練習", Math.round(practiceRate.rate * 100), practiceRate.participated, practiceRate.total) : ""}
        </div>
    ` : "";

    const personalSection = isAdmin ? `
        <div class="mypage-section">
            <div class="mypage-section-title mypage-section-title-row">
                <span>個人情報</span>
                <button class="mypage-edit-btn" id="openMemberInfoEditBtn"><i class="fas fa-pen"></i> 編集</button>
            </div>
            ${[
                { label: "役職",     val: user.position },
                { label: "電話番号", val: user.phone },
                { label: "住所",     val: [user.prefecture, user.city, user.addressDetail].filter(Boolean).join(" ") },
                { label: "生年月日", val: user.birthday ? user.birthday.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日").replace(/年0(\d)/, "年$1").replace(/月0(\d)/, "月$1") : "" },
            ].filter(r => r.val).map(r => `
                <div class="mypage-gear-row">
                    <span class="mypage-gear-label">${escHtml(r.label)}</span>
                    <span class="mypage-gear-val">${escHtml(String(r.val))}</span>
                </div>
            `).join("") || '<p class="mypage-empty">未登録</p>'}
        </div>
    ` : "";

    content.innerHTML = `
        <div class="mypage-profile">
            <div class="mypage-avatar"><i class="fas fa-user"></i></div>
            <div class="mypage-profile-info">
                <div class="mypage-name">${escHtml(user.name)}</div>
                <div class="mypage-role">${roleLabel}</div>
            </div>
        </div>

        ${rateSection}
        ${personalSection}

        <div class="mypage-section">
            <div class="mypage-section-title">衣装情報</div>
            ${gearRows.length ? gearRows.map(r => `
                <div class="mypage-gear-row">
                    <span class="mypage-gear-label">${escHtml(r.label)}</span>
                    <span class="mypage-gear-val">${escHtml(String(r.val))}</span>
                </div>
            `).join("") : '<p class="mypage-empty">未登録</p>'}
        </div>
    `;

    if (isAdmin) {
        document.getElementById("openMemberInfoEditBtn")?.addEventListener("click", () => openMemberInfoEdit(user));
    }
}

function openMemberInfoEdit(user) {
    document.getElementById("memberInfoEditTitle").textContent = `編集：${user.name}`;
    document.getElementById("mEdit_name").value = user.name || "";
    document.getElementById("mEdit_position").value = user.position || "";
    document.getElementById("mEdit_phone").value = user.phone || "";
    document.getElementById("mEdit_prefecture").value = user.prefecture || "";
    document.getElementById("mEdit_city").value = user.city || "";
    document.getElementById("mEdit_addressDetail").value = user.addressDetail || "";
    document.getElementById("mEdit_birthday").value = user.birthday || "";
    document.getElementById("memberInfoEditCard").classList.add("active");
}

async function saveMemberInfo() {
    if (!myPageTargetUserId) return;
    const data = {
        storedName:    document.getElementById("mEdit_name").value.trim(),
        position:      document.getElementById("mEdit_position").value.trim(),
        phone:         document.getElementById("mEdit_phone").value.trim(),
        prefecture:    document.getElementById("mEdit_prefecture").value.trim(),
        city:          document.getElementById("mEdit_city").value.trim(),
        addressDetail: document.getElementById("mEdit_addressDetail").value.trim(),
        birthday:      document.getElementById("mEdit_birthday").value,
    };
    const btn = document.getElementById("memberInfoSaveBtn");
    btn.disabled = true; btn.textContent = "保存中…";
    const res = await callGasApi({ action: "updateMemberInfo", targetUserId: myPageTargetUserId, data, userId });
    btn.disabled = false; btn.textContent = "保存";
    if (!res?.success) { alert(res?.msg || "保存失敗"); return; }
    document.getElementById("memberInfoEditCard").classList.remove("active");
    // myPageのタイトルと表示を更新
    document.getElementById("myPageTitle").textContent = data.storedName;
    if (myPageCurrentUser) {
        myPageCurrentUser.name = data.storedName;
        myPageCurrentUser.position = data.position;
        myPageCurrentUser.phone = data.phone;
        myPageCurrentUser.prefecture = data.prefecture;
        myPageCurrentUser.city = data.city;
        myPageCurrentUser.addressDetail = data.addressDetail;
        myPageCurrentUser.birthday = data.birthday;
        renderMyPage({ user: myPageCurrentUser, gear: null, eventRate: null, practiceRate: null }, false);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("memberInfoSaveBtn")?.addEventListener("click", saveMemberInfo);
});

function rateBar(label, pct, participated, total) {
    return `
        <div class="mypage-rate-item">
            <div class="mypage-rate-header">
                <span class="mypage-rate-label">${label}</span>
                <span class="mypage-rate-pct">${pct}%</span>
                <span class="mypage-rate-count">${participated}/${total}</span>
            </div>
            <div class="mypage-bar-wrap">
                <div class="mypage-bar" style="width:${pct}%"></div>
            </div>
        </div>
    `;
}
