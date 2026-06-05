// =====================================
// ユーザー API
// =====================================
/**
 * ユーザー登録処理
 */
function registUserAPI(form) {
  const ss = getSS();
  const userSheet = SHEETS.USERS();
  const childSheet = SHEETS.CHILDREN();
  const now = new Date();

  // ======（ユーザーシート）ヘッダ → index マッピング ======
  const userHeaders = userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0];
  const COL = {};
  userHeaders.forEach((h, i) => { COL[h] = i; });

  // ====== 氏名 ======
  const fullName = `${form.lastName.trim()} ${form.firstName.trim()}`;

  // ====== 既存ユーザー取得 ======
  const userRows = userSheet.getDataRange().getValues();

  // ====== 氏名重複チェック ======
  const isDuplicate = userRows.some((row, i) =>
    i > 0 && row[COL["storedName"]] === fullName
  );

  if (isDuplicate) {
    return { success: false, msg: "この氏名は既に登録されています。" };
  }

  // ====== userId 自動採番 ======
  const lastUserId = userRows.length > 1
    ? Number(userRows[userRows.length - 1][COL["userId"]])
    : 0;

  const newUserId = lastUserId + 1;

  // ====== パスワードハッシュ ======
  const hashed = hashPassword(form.password);

  // ====== 行データ作成（ヘッダー順） ======
  const newRow = Array(userSheet.getLastColumn()).fill("");

  newRow[COL["userId"]]        = newUserId;
  newRow[COL["storedName"]]    = fullName;
  newRow[COL["storedHash"]]    = hashed;
  newRow[COL["role"]]          = "user";
  newRow[COL["status"]]        = "hold";

  newRow[COL["position"]]      = form.position || "";
  newRow[COL["phone"]]         = form.phone || "";
  newRow[COL["prefecture"]]    = form.prefecture || "";
  newRow[COL["city"]]          = form.city || "";
  newRow[COL["addressDetail"]] = form.addressDetail || "";
  newRow[COL["birthday"]]      = form.birthDate || "";
  newRow[COL["snsConsent"]] = form.snsConsent ? "yes" : "no";

  newRow[COL["created_at"]]    = now;
  newRow[COL["updated_at"]]    = now;

  // ====== 保存 ======
  userSheet.appendRow(newRow);

  // =====================================================================
  //                子どもデータ保存（CHILDREN シート）
  // =====================================================================

  const childHeaders = childSheet.getRange(1, 1, 1, childSheet.getLastColumn()).getValues()[0];
  const CH = {};
  childHeaders.forEach((h, i) => { CH[h] = i; });

  const childRows = childSheet.getDataRange().getValues();
  let lastChildId = childRows.length > 1
    ? Number(childRows[childRows.length - 1][CH["childId"]])
    : 0;

  if (Array.isArray(form.children)) {
    form.children.forEach(c => {
      const first = (c.firstName || "").trim();

      // ★ 名が空なら登録しない
      if (!first) return;

      lastChildId++;

      const cr = Array(childSheet.getLastColumn()).fill("");

      cr[CH["childId"]]    = lastChildId;
      cr[CH["userId"]]     = newUserId;
      cr[CH["childName"]]  = first;
      cr[CH["birthday"]]   = c.birthday || "";
      cr[CH["role"]]       = "child";
      cr[CH["status"]]     = "hold";
      cr[CH["created_at"]] = now;
      cr[CH["updated_at"]] = now;

      childSheet.appendRow(cr);
    });
  }

  return { success: true };
}

/**
 * ログイン処理
 */
function loginAPI(username, password) {

  // ---- ★ 空白除去関数（追加する場所）----
  function normalize(name) {
    return String(name).replace(/\s+/g, "");
  }

  const ss = getSS();
  const userSheet = SHEETS.USERS();
  const childSheet = SHEETS.CHILDREN();

  const users = userSheet.getDataRange().getValues();
  const children = childSheet.getDataRange().getValues();

  const headers = users[0];
  const COL = {};
  headers.forEach((h, i) => COL[h] = i);

  const childHeaders = children[0];
  const CH = {};
  childHeaders.forEach((h, i) => CH[h] = i);

  const hashedInput = hashPassword(password);

  for (let i = 1; i < users.length; i++) {

    const row = users[i];

    const userId     = row[COL["userId"]];
    const storedName = row[COL["storedName"]];
    const storedHash = row[COL["storedHash"]];
    const role       = row[COL["role"]];
    const status     = row[COL["status"]];

    // ---- ★ 修正した比較 ----
    if (normalize(storedName) === normalize(username) && storedHash === hashedInput) {

      if (status === "hold") {
        return { success: false, msg: "承認待ちです" };
      }

      const childList = children
        .slice(1)
        .filter(r => r[CH["userId"]] === userId)
        .map(r => ({
          childId: r[CH["childId"]],
          childName: r[CH["childName"]],
          role: r[CH["role"]],
          status: r[CH["status"]]
        }));

      const user = {
        userId,
        username: storedName,
        role,
        phone: row[COL["phone"]] || "",
        prefecture: row[COL["prefecture"]] || "",
        city: row[COL["city"]] || "",
        addressDetail: row[COL["addressDetail"]] || "",
        birthday: row[COL["birthday"]] || "",
        children: childList
      };

      const sessionId = saveSession(user);

      return {
        success: true,
        sessionId,
        user
      };
    }
  }

  return {
    success: false,
    msg: "ユーザー名またはパスワードが違います"
  };
}
