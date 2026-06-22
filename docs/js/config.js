
// GAS URL
window.GAS_URL = "https://script.google.com/macros/s/AKfycbyzeUMTM_AK_8v00OUNz_BivDg-tL8GBhQclvMkUjLO5v60Xy4MlfyNjBev1xMT4gEj/exec";

/* =======================================================
共通 API 呼び出し関数 (CORS回避 & 共通化)
======================================================= */
async function callGasApi(payload) {
    // headers を完全に削除、または指定しないのがコツです
    const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload) 
    });

    // 実は GAS + fetch はレスポンスを直接 json() で取れない場合が多いです
    // 一旦以下の構成で試してください
    return await response.json(); 
}

/* =======================================================
権限チェック
======================================================= */
let userId;   // ページ内で一時的に保持
let userRole; // ページ内で一時的に保持

async function checkSessionAndGetUserId() {
    try {
        const sessionId = localStorage.getItem("sessionId");
        if (!sessionId) {
            alert("ログインしてください");
            location.href = "index.html";
            return false;
        }

        const res = await callGasApi({
            action: "validateSession",
            sessionId
        });

        if (!res.valid) {
            alert("ログインし直してください");
            localStorage.removeItem("sessionId");
            location.href = "index.html";
            return false;
        }

        // 🔥 ここで userId と role をセット
        userId = res.userId;
        userRole = res.role;

        return true;

    } catch (err) {
        console.error("Session check error:", err);
        alert("通信エラー");
        location.href = "index.html";
        return false;
    }
}

async function checkAdminAccess() {
    try {
        const sessionId = localStorage.getItem("sessionId");
        if (!sessionId) {
            alert("ログインしてください");
            location.href = "index.html";
            return false;
        }

        const res = await callGasApi({
            action: "validateSession",
            sessionId,
            requiredRole: "admin"
        });

        if (!res.valid) {
            alert(res.msg || "権限がありません");

            // セッション無効なら sessionId 削除
            if (res.reason === "invalid_session") {
                localStorage.removeItem("sessionId");
            }

            // 必ずログインページへ戻す
            location.href = "index.html";
            return false;
        }

        // --- 管理者OK の場合 ---
        userId = res.userId;
        userRole = res.role;
        return true;

    } catch (err) {
        console.error("Admin check error:", err);
        alert("通信エラー");

        // 念のためトップへ戻す
        location.href = "index.html";
        return false;
    }
}
