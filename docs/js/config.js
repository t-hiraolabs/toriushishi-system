
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

async function tryAutoLogin() {
    const username = localStorage.getItem("savedUsername");
    const password = localStorage.getItem("savedPassword");
    if (!username || !password) return false;
    try {
        const res = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({ action: "login", username, password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem("sessionId", data.sessionId);
            return true;
        }
    } catch (e) {}
    return false;
}

async function checkSessionAndGetUserId() {
    try {
        let sessionId = localStorage.getItem("sessionId");
        if (!sessionId) {
            const ok = await tryAutoLogin();
            if (!ok) { location.href = "index.html"; return false; }
            sessionId = localStorage.getItem("sessionId");
        }

        const res = await callGasApi({ action: "validateSession", sessionId });

        if (!res.valid) {
            localStorage.removeItem("sessionId");
            const ok = await tryAutoLogin();
            if (!ok) { location.href = "index.html"; return false; }
            const res2 = await callGasApi({ action: "validateSession", sessionId: localStorage.getItem("sessionId") });
            if (!res2.valid) { location.href = "index.html"; return false; }
            userId = res2.userId;
            userRole = res2.role;
            return true;
        }

        userId = res.userId;
        userRole = res.role;
        return true;

    } catch (err) {
        console.error("Session check error:", err);
        location.href = "index.html";
        return false;
    }
}

async function checkAdminAccess() {
    try {
        let sessionId = localStorage.getItem("sessionId");
        if (!sessionId) {
            const ok = await tryAutoLogin();
            if (!ok) { location.href = "index.html"; return false; }
            sessionId = localStorage.getItem("sessionId");
        }

        let res = await callGasApi({ action: "validateSession", sessionId, requiredRole: "admin" });

        if (!res.valid) {
            localStorage.removeItem("sessionId");
            const ok = await tryAutoLogin();
            if (ok) {
                res = await callGasApi({ action: "validateSession", sessionId: localStorage.getItem("sessionId"), requiredRole: "admin" });
            }
            if (!res.valid) {
                alert(res.msg || "権限がありません");
                location.href = "index.html";
                return false;
            }
        }

        userId = res.userId;
        userRole = res.role;
        return true;

    } catch (err) {
        console.error("Admin check error:", err);
        location.href = "index.html";
        return false;
    }
}
