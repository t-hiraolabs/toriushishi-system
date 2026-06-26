// =============================
// 戻るボタン（ログイン画面に戻す）
// =============================
document.getElementById("backLogin").addEventListener("click", () => {
    window.location.href = "index.html"; 
});


// =============================
// 子供追加
// =============================
const lastNameInput = document.getElementById("lastName");
const childList = document.getElementById("childList");
const addChildBtn = document.getElementById("addChildBtn");

// 親の氏が変わったら全ての子ども欄の氏を更新
lastNameInput.addEventListener("input", () => {
    updateAllChildLastNames();
});

function updateAllChildLastNames() {
    const lastname = lastNameInput.value.trim();
    document.querySelectorAll(".child-lastname").forEach(input => {
        input.value = lastname;
    });
}

// 子どもを追加
addChildBtn.addEventListener("click", () => {
    const lastname = lastNameInput.value.trim();

    const div = document.createElement("div");
    div.classList.add("child-row");

    div.innerHTML = `
        <input type="text" class="child-lastname" readonly placeholder="性" value="${lastname}">
        <input type="text" class="child-firstname" placeholder="名">
        <input type="date" class="child-birth">
    `;

    childList.appendChild(div);
});


// =============================
// 登録ボタン
// =============================
document.getElementById("registBtn").addEventListener("click", async () => {

    const ok = confirm("この内容で登録申請しますか？\n後から変更する場合は管理者が必要です。");
    if (!ok) return;

    // ===== 氏名 =====
    const lastName  = document.getElementById("lastName").value.trim();
    const firstName = document.getElementById("firstName").value.trim();

    // ===== パスワード =====
    const password  = document.getElementById("password").value.trim();

    if (!lastName || !firstName || !password) {
        alert("氏名とパスワードは必須です。");
        return;
    }

    if (password.length < 4) {
        alert("パスワードは4文字以上で入力してください。");
        return;
    }

    // ===== 電話番号 =====
    const phone1 = document.getElementById("phone1").value.trim();
    const phone2 = document.getElementById("phone2").value.trim();
    const phone3 = document.getElementById("phone3").value.trim();
    const phone = `${phone1}-${phone2}-${phone3}`;

    // ===== 住所 =====
    const prefecture = document.getElementById("prefecture").value.trim();
    const city = document.getElementById("city").value.trim();
    const addressDetail = document.getElementById("addressDetail").value.trim();

    // ===== 生年月日（親） =====
    const birthDate = document.getElementById("birthDate").value.trim();

    // ==== 親の誕生日チェック ====
    if (!birthDate) {
        alert("親の生年月日を入力してください。");
        return;
    }

    const parentBirth = new Date(birthDate);
    const today = new Date();

    if (isNaN(parentBirth.getTime())) {
        alert("親の生年月日の形式が正しくありません。");
        return;
    }

    if (parentBirth > today) {
        alert("親の生年月日は未来日を指定できません。");
        return;
    }

    // ===== 子供一覧 =====
    const childRows = document.querySelectorAll(".child-row");
    const children = Array.from(childRows).map(row => {
        return {
            lastName:  row.querySelector(".child-lastname").value.trim(),
            firstName: row.querySelector(".child-firstname").value.trim(),
            birthday:  row.querySelector(".child-birth").value.trim()
        };
    });

    // ==== 子供の誕生日チェック ====
    for (const child of children) {

        // 子供行が完全に空ならスキップ
        if (!child.firstName && !child.birthday) {
            continue;
        }

        // どれか一つでも欠けている場合
        if (!child.lastName || !child.firstName || !child.birthday) {
            alert("子供の氏名と生年月日はすべて入力してください。");
            return;
        }

        const childBirth = new Date(child.birthday);

        if (isNaN(childBirth.getTime())) {
            alert(`子供「${child.lastName} ${child.firstName}」の生年月日の形式が正しくありません。`);
            return;
        }

        if (childBirth > today) {
            alert(`子供「${child.lastName} ${child.firstName}」の生年月日は未来日を指定できません。`);
            return;
        }
    }

    // ===== SNS 掲載同意 =====
    const snsConsent = document.getElementById("snsConsent").checked;

    if (!snsConsent) {
        const noOk = confirm("SNS掲載に同意しない場合、顔にモザイク処理を行います。\n本当に同意しませんか？");
        if (!noOk) {
            // 同意しない → 取り消し → 処理中断
            return;
        }
    }

    // ===== 送信データ =====
    const form = {
        action: "regist",
        lastName,
        firstName,
        password,
        phone,
        prefecture,
        city,
        addressDetail,
        birthDate,
        children,
        snsConsent
    };

    // ===== 連打防止 =====
    const btn = document.getElementById("registBtn");
    btn.disabled = true;
    btn.textContent = "申請中...";

    try {
        const result = await callGasApi(form);
        if (result.success) {
            alert("申請を行いました。承認されるまでお待ちください。");
            window.location.href = "index.html";
        } else {
            throw new Error(result.msg || "エラーが発生しました。");
        }

    } catch (err) {
        alert("エラー：" + err.message);
        btn.disabled = false;
        btn.textContent = "申請";
    }
});

// =============================
// 電話番号自動移動
// =============================
const phone1 = document.getElementById("phone1");
const phone2 = document.getElementById("phone2");
const phone3 = document.getElementById("phone3");

function onlyNumber(el) {
    el.value = el.value.replace(/\D/g, "");
}

phone1.addEventListener("input", () => {
    onlyNumber(phone1);
    if (phone1.value.length === phone1.maxLength) phone2.focus();
});

phone2.addEventListener("input", () => {
    onlyNumber(phone2);
    if (phone2.value.length === phone2.maxLength) phone3.focus();
});

phone3.addEventListener("input", () => {
    onlyNumber(phone3);
});


// =============================
// 愛媛県の市区町村一覧
// =============================
const ehimeCities = [
    "松山市", "今治市", "宇和島市", "八幡浜市", "新居浜市",
    "西条市", "大洲市", "伊予市", "四国中央市", "西予市", "東温市"
];

const citySelect = document.getElementById("city");

window.addEventListener("DOMContentLoaded", () => {
    ehimeCities.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        citySelect.appendChild(opt);
    });
});