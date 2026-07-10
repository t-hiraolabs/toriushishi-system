
// API URL (Vercel Next.js — replaces Google Apps Script)
window.GAS_URL = "/api/gas";

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
let userId;         // ページ内で一時的に保持
let userRole;       // ページ内で一時的に保持
let userName;       // ページ内で一時的に保持
let isSystemAdmin;  // 全アカウントへなりすませるシステム管理者か
let isImpersonating; // 現在なりすまし中か

async function checkSessionAndGetUserId() {
    try {
        const sessionId = localStorage.getItem("sessionId");
        if (!sessionId) {
            location.href = "index.html";
            return false;
        }

        const res = await callGasApi({ action: "validateSession", sessionId });

        if (!res.valid) {
            localStorage.removeItem("sessionId");
            location.href = "index.html";
            return false;
        }

        userId = res.userId;
        userRole = res.role;
        userName = res.name;
        isSystemAdmin = !!res.isSystemAdmin;
        isImpersonating = !!res.impersonating;
        if (res.demo) {
            const banner = document.getElementById("demoBanner");
            if (banner) banner.style.display = "block";
            document.body.classList.add("demo-mode");
        }
        if (isImpersonating) {
            const banner = document.getElementById("impersonateBanner");
            if (banner) {
                banner.style.display = "block";
                banner.querySelector(".impersonate-banner-name").textContent = userName;
            }
        }
        return true;

    } catch (err) {
        console.error("Session check error:", err);
        location.href = "index.html";
        return false;
    }
}

async function checkAdminAccess() {
    try {
        const sessionId = localStorage.getItem("sessionId");
        if (!sessionId) {
            location.href = "index.html";
            return false;
        }

        const res = await callGasApi({ action: "validateSession", sessionId, requiredRole: "admin" });

        if (!res.valid) {
            alert(res.msg || "権限がありません");
            localStorage.removeItem("sessionId");
            location.href = "index.html";
            return false;
        }

        userId = res.userId;
        userRole = res.role;
        userName = res.name;
        return true;

    } catch (err) {
        console.error("Admin check error:", err);
        location.href = "index.html";
        return false;
    }
}
