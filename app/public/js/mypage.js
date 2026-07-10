// =======================================================
// マイページ
// =======================================================

let myPageTargetUserId = null;
let myPageCurrentUser = null;

function openMyPage() {
    myPageIsHold = false;
    document.getElementById("myPageTitle").textContent = "マイページ";
    document.getElementById("myPageCard").classList.add("active");
    loadMyPageFor(userId, true);
}

let myPageIsHold = false;

function openMemberProfile(targetUserId, name, isHold = false) {
    myPageIsHold = isHold;
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
    myPageCurrentUser.userId = targetUserId;
    renderMyPage(res, showRate);
}

function renderMyPage({ user, gear, eventRate, practiceRate, children }, showRate = true) {
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
    const isSelf = String(myPageTargetUserId) === String(userId);
    const canImpersonate = typeof isSystemAdmin !== "undefined" && isSystemAdmin && !isSelf;

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
            ${canImpersonate ? `<button class="mypage-impersonate-btn" id="mypageImpersonateBtn"><i class="fas fa-user-secret"></i> このアカウントで入る</button>` : ""}
        </div>

        ${rateSection}
        ${personalSection}

        <div class="mypage-section">
            <div class="mypage-section-title">子供情報</div>
            ${children?.length ? children.map(c => {
                const bd = c.birthday ? c.birthday.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日").replace(/年0(\d)/, "年$1").replace(/月0(\d)/, "月$1") : "";
                const g = c.gear || {};
                const gearRows = [
                    { label: "着物（上）", val: g.kimono_top },
                    { label: "着物（下）", val: g.kimono_bottom },
                ].filter(r => r.val);
                const isHold = c.status === "hold";
                return `
                <div class="mypage-child-block${isHold ? " mypage-child-hold" : ""}">
                    <div class="mypage-child-header">
                        <span class="mypage-child-name">${escHtml(c.childName)}${isHold ? ' <span class="mypage-child-hold-badge">承認待ち</span>' : ""}</span>
                        ${isAdmin ? `
                            ${isHold ? `<button class="mypage-child-approve-btn" data-child-id="${c.childId}">承認</button>` : ""}
                            <button class="mypage-child-del-btn" data-child-id="${c.childId}" data-child-name="${escHtml(c.childName)}">削除</button>
                        ` : ""}
                    </div>
                    ${bd ? `<div class="mypage-gear-row"><span class="mypage-gear-label">生年月日</span><span class="mypage-gear-val">${bd}</span></div>` : ""}
                    ${gearRows.map(r => `<div class="mypage-gear-row"><span class="mypage-gear-label">${escHtml(r.label)}</span><span class="mypage-gear-val">${escHtml(String(r.val))}</span></div>`).join("")}
                </div>`;
            }).join("") : '<p class="mypage-empty">登録なし</p>'}
            ${isSelf ? `
            <div class="mypage-child-add-form" id="myPageChildAddForm" style="display:none;">
                <div class="mypage-child-add-row">
                    <input type="text" id="childAddLastName" placeholder="姓" class="mypage-child-add-input">
                    <input type="text" id="childAddFirstName" placeholder="名" class="mypage-child-add-input">
                </div>
                <input type="date" id="childAddBirthday" class="mypage-child-add-date">
                <div class="mypage-child-add-actions">
                    <button class="mypage-child-add-cancel-btn" id="childAddCancelBtn">キャンセル</button>
                    <button class="mypage-child-add-submit-btn" id="childAddSubmitBtn">申請する</button>
                </div>
            </div>
            <button class="mypage-child-add-open-btn" id="childAddOpenBtn">＋ 子供を追加申請</button>
            ` : ""}
        </div>

        <div class="mypage-section">
            <div class="mypage-section-title">衣装情報</div>
            ${gearRows.length ? gearRows.map(r => `
                <div class="mypage-gear-row">
                    <span class="mypage-gear-label">${escHtml(r.label)}</span>
                    <span class="mypage-gear-val">${escHtml(String(r.val))}</span>
                </div>
            `).join("") : '<p class="mypage-empty">未登録</p>'}
        </div>

        ${isAdmin && myPageIsHold ? `
        <div class="mypage-section mypage-approve-zone">
            <button class="mypage-approve-btn" id="approveMemberBtn">承認する</button>
            <button class="mypage-reject-btn" id="rejectMemberBtn">拒否する</button>
        </div>
        ` : ""}

        ${isAdmin && !showRate && !myPageIsHold ? `
        <div class="mypage-section mypage-danger-zone">
            <button class="mypage-delete-member-btn" id="deleteMemberBtn">このメンバーを削除</button>
        </div>
        ` : ""}
    `;

    if (canImpersonate) {
        document.getElementById("mypageImpersonateBtn")?.addEventListener("click", () => {
            impersonateAsUser(myPageTargetUserId, user.name);
        });
    }

    if (isAdmin) {
        document.getElementById("openMemberInfoEditBtn")?.addEventListener("click", () => openMemberInfoEdit(user));
        document.getElementById("approveMemberBtn")?.addEventListener("click", async () => {
            if (!confirm(`「${user.name}」を承認しますか？`)) return;
            const res = await callGasApi({ action: "approveMember", userId: myPageTargetUserId });
            if (res.success) {
                alert("承認しました");
                myPageIsHold = false;
                document.getElementById("myPageCard").classList.remove("active");
                loadMembersUser();
            } else alert(res.msg || "承認に失敗しました");
        });
        document.getElementById("rejectMemberBtn")?.addEventListener("click", async () => {
            if (!confirm(`「${user.name}」を拒否して削除しますか？\nこの操作は取り消せません。`)) return;
            const res = await callGasApi({ action: "deleteMember", userId: myPageTargetUserId });
            if (res.success) {
                alert("拒否しました");
                myPageIsHold = false;
                document.getElementById("myPageCard").classList.remove("active");
                loadMembersUser();
            } else alert(res.msg || "拒否に失敗しました");
        });
        document.querySelectorAll(".mypage-child-approve-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const childId = btn.dataset.childId;
                if (!confirm("この子供を承認しますか？")) return;
                const res = await callGasApi({ action: "approveChild", childId: Number(childId) });
                if (res.success) { loadMyPageFor(myPageTargetUserId, false); }
                else alert(res.msg || "承認に失敗しました");
            });
        });
        document.querySelectorAll(".mypage-child-del-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const childId = btn.dataset.childId;
                const childName = btn.dataset.childName;
                if (!confirm(`「${childName}」を削除しますか？`)) return;
                const res = await callGasApi({ action: "deleteChild", childId: Number(childId), userId: myPageTargetUserId });
                if (res.success) { alert("削除しました"); loadMyPageFor(myPageTargetUserId, false); }
                else alert(res.msg || "削除に失敗しました");
            });
        });
        document.getElementById("deleteMemberBtn")?.addEventListener("click", async () => {
            const name = user.name;
            if (!confirm(`「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;
            const res = await callGasApi({ action: "deleteMember", userId: myPageTargetUserId });
            if (res.success) {
                alert("削除しました");
                document.getElementById("myPageCard").classList.remove("active");
                loadMembersUser();
            } else alert(res.msg || "削除に失敗しました");
        });
    }

    // 子供追加フォーム（自分のマイページのみ）
    if (isSelf) {
        const openBtn = document.getElementById("childAddOpenBtn");
        const form = document.getElementById("myPageChildAddForm");
        openBtn?.addEventListener("click", () => {
            form.style.display = "";
            openBtn.style.display = "none";
            document.getElementById("childAddLastName").focus();
        });
        document.getElementById("childAddCancelBtn")?.addEventListener("click", () => {
            form.style.display = "none";
            openBtn.style.display = "";
            document.getElementById("childAddLastName").value = "";
            document.getElementById("childAddFirstName").value = "";
            document.getElementById("childAddBirthday").value = "";
        });
        document.getElementById("childAddSubmitBtn")?.addEventListener("click", async () => {
            const last = document.getElementById("childAddLastName").value.trim();
            const first = document.getElementById("childAddFirstName").value.trim();
            const birthday = document.getElementById("childAddBirthday").value;
            if (!last && !first) { alert("名前を入力してください"); return; }
            const childName = [last, first].filter(Boolean).join(" ");
            const res = await callGasApi({ action: "addChild", userId: myPageTargetUserId, childName, birthday: birthday || null });
            if (res.success) {
                alert("申請しました。管理者が承認するまでお待ちください。");
                loadMyPageFor(myPageTargetUserId, true);
            } else alert(res.msg || "申請に失敗しました");
        });
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
