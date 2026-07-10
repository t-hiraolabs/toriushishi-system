// =======================================================
// Web Push 通知
// =======================================================

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

let pushToggleInitialized = false;

async function initPushNotify() {
    if (pushToggleInitialized) return;
    const toggle = document.getElementById("pushNotifyToggle");
    const hint = document.getElementById("pushNotifyHint");
    if (!toggle) return;

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
        toggle.disabled = true;
        if (hint) hint.textContent = "この端末／ブラウザはプッシュ通知に対応していません。（iPhoneはホーム画面に追加したアプリから利用してください）";
        pushToggleInitialized = true;
        return;
    }

    // 現在の購読状態を反映
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        toggle.checked = !!sub && Notification.permission === "granted";
    } catch (_) {}

    toggle.addEventListener("change", async () => {
        if (toggle.checked) {
            const ok = await enablePushNotify(hint);
            toggle.checked = ok;
        } else {
            await disablePushNotify(hint);
        }
    });

    pushToggleInitialized = true;
}

async function enablePushNotify(hint) {
    try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            if (hint) hint.textContent = "通知が許可されませんでした。端末の設定から許可してください。";
            return false;
        }

        const res = await callGasApi({ action: "getVapidPublicKey" });
        if (!res?.publicKey) {
            if (hint) hint.textContent = "サーバー側の通知設定が未完了です。管理者にお問い合わせください。";
            return false;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(res.publicKey),
            });
        }

        const save = await callGasApi({
            action: "savePushSubscription",
            sessionId: localStorage.getItem("sessionId"),
            subscription: sub.toJSON(),
        });
        if (!save?.success) {
            if (hint) hint.textContent = save?.msg || "通知の登録に失敗しました。";
            return false;
        }
        if (hint) hint.textContent = "プッシュ通知をオンにしました。新しいイベント登録時に通知が届きます。";
        return true;
    } catch (err) {
        console.error("push subscribe error:", err);
        if (hint) hint.textContent = "通知の登録に失敗しました。";
        return false;
    }
}

async function disablePushNotify(hint) {
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await callGasApi({ action: "deletePushSubscription", endpoint: sub.endpoint });
            await sub.unsubscribe();
        }
        if (hint) hint.textContent = "プッシュ通知をオフにしました。";
    } catch (err) {
        console.error("push unsubscribe error:", err);
    }
}

// ===== 初回のみの通知許可プロンプト =====
const PUSH_PROMPT_KEY = "pushPromptShown";

async function maybeShowPushPrompt() {
    if (localStorage.getItem(PUSH_PROMPT_KEY)) return;

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return;
    if (Notification.permission !== "default") {
        // すでに許可/拒否済みなら二度と聞かない
        localStorage.setItem(PUSH_PROMPT_KEY, "1");
        return;
    }

    const modal = document.getElementById("pushPromptModal");
    if (!modal) return;
    modal.style.display = "flex";

    document.getElementById("pushPromptAllowBtn")?.addEventListener("click", async () => {
        localStorage.setItem(PUSH_PROMPT_KEY, "1");
        modal.style.display = "none";
        await enablePushNotify();
        const toggle = document.getElementById("pushNotifyToggle");
        if (toggle) toggle.checked = true;
    }, { once: true });

    document.getElementById("pushPromptDenyBtn")?.addEventListener("click", () => {
        localStorage.setItem(PUSH_PROMPT_KEY, "1");
        modal.style.display = "none";
    }, { once: true });
}
