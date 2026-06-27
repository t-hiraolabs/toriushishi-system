document.addEventListener("DOMContentLoaded", () => {
const loginBtn = document.getElementById("loginBtn");
const gotoRegist = document.getElementById("gotoRegist");
const message = document.getElementById("message");

// 保存済みの認証情報を自動入力
const savedUsername = localStorage.getItem("savedUsername");
const savedPassword = localStorage.getItem("savedPassword");
if (savedUsername && savedPassword) {
    const form = document.getElementById("loginForm");
    form.username.value = savedUsername;
    form.password.value = savedPassword;
}


if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
        const form = document.getElementById("loginForm");
        const username = form.username.value.trim();
        const password = form.password.value.trim();

        if (!username || !password) {
            message.textContent = "ユーザー名とパスワードを入力してください";
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = "ログイン中...";

        try {
            const res = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ action: "login", username, password })
            });

            const data = await res.json(); 
            console.log(data);

            if (data.success) {
                localStorage.setItem("sessionId", data.sessionId);
                localStorage.setItem("savedUsername", username);
                localStorage.setItem("savedPassword", password);
                location.href = "main.html";
            } else {
                message.textContent = data.msg;
                loginBtn.disabled = false;
                loginBtn.textContent = "ログイン";
            }
        } catch (err) {
            message.textContent = "通信エラー";
            loginBtn.disabled = false;
            loginBtn.textContent = "ログイン";
            console.error(err);
        }
    });
}

if (gotoRegist) {
    gotoRegist.addEventListener("click", () => {
        location.href = "regist.html";
    });
}

// ===== パスワード再発行申請 =====
const forgotPwBtn = document.getElementById("forgotPwBtn");
const forgotForm = document.getElementById("forgotForm");
const forgotCancelBtn = document.getElementById("forgotCancelBtn");
const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");
const forgotMessage = document.getElementById("forgotMessage");

if (forgotPwBtn) {
    forgotPwBtn.addEventListener("click", () => {
        forgotForm.style.display = "block";
        forgotPwBtn.style.display = "none";
        forgotMessage.textContent = "";
        document.getElementById("forgotUsername").focus();
    });
}
if (forgotCancelBtn) {
    forgotCancelBtn.addEventListener("click", () => {
        forgotForm.style.display = "none";
        forgotPwBtn.style.display = "";
        document.getElementById("forgotUsername").value = "";
        forgotMessage.textContent = "";
    });
}
if (forgotSubmitBtn) {
    forgotSubmitBtn.addEventListener("click", async () => {
        const username = document.getElementById("forgotUsername").value.trim();
        if (!username) {
            forgotMessage.style.color = "red";
            forgotMessage.textContent = "ユーザー名を入力してください";
            return;
        }
        forgotSubmitBtn.disabled = true;
        forgotSubmitBtn.textContent = "申請中...";
        try {
            const res = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ action: "requestPasswordReset", username })
            });
            const data = await res.json();
            if (data.success) {
                forgotMessage.style.color = "green";
                forgotMessage.textContent = "申請しました。管理者の対応をお待ちください。";
                document.getElementById("forgotUsername").value = "";
            } else {
                forgotMessage.style.color = "red";
                forgotMessage.textContent = data.msg || "申請に失敗しました";
            }
        } catch (err) {
            forgotMessage.style.color = "red";
            forgotMessage.textContent = "通信エラー";
            console.error(err);
        } finally {
            forgotSubmitBtn.disabled = false;
            forgotSubmitBtn.textContent = "申請する";
        }
    });
}

});