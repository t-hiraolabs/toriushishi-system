// =======================================================
// 衣装管理 GAS
// =======================================================

const GEAR_COLS = ["userId", "happi_no", "tshirt_size", "tekkou", "hakama", "kimono_top", "kimono_bottom", "memo"];

function ensureGearSheet() {
  const ss = getSS();
  let sheet = ss.getSheetByName("member_gear");
  if (!sheet) {
    sheet = ss.insertSheet("member_gear");
    sheet.appendRow(GEAR_COLS);
  }
  return sheet;
}

function ensureChildGearSheet() {
  const ss = getSS();
  let sheet = ss.getSheetByName("child_gear");
  if (!sheet) {
    sheet = ss.insertSheet("child_gear");
    sheet.appendRow(["childId", "kimono_top", "kimono_bottom"]);
  }
  return sheet;
}

function ensureSpareSheet() {
  const ss = getSS();
  let sheet = ss.getSheetByName("gear_spare");
  if (!sheet) {
    sheet = ss.insertSheet("gear_spare");
    sheet.appendRow(["item_type", "value", "quantity"]);
  }
  return sheet;
}

// ===== メンバー装備 =====
function getGearGAS() {
  const ss = getSS();
  const usersSheet = ss.getSheetByName("users");
  if (!usersSheet) return { success: false };

  const userRows = usersSheet.getDataRange().getValues();
  const uH = {};
  userRows[0].forEach((v, i) => uH[v] = i);
  const members = userRows.slice(1)
    .filter(r => r[uH["status"]] === "active")
    .map(r => ({ userId: String(r[uH["userId"]]), name: r[uH["storedName"]], role: r[uH["role"]] }));

  const gearSheet = ensureGearSheet();
  const gearRows = gearSheet.getDataRange().getValues();
  const gH = {};
  gearRows[0].forEach((v, i) => gH[v] = i);
  const gearMap = {};
  gearRows.slice(1).forEach(r => {
    if (!r[0]) return;
    const obj = {};
    GEAR_COLS.slice(1).forEach(col => { obj[col] = r[gH[col]] ?? ""; });
    gearMap[String(r[gH["userId"]])] = obj;
  });

  // 子供情報
  const childrenSheet = ss.getSheetByName("children");
  const childrenMap = {}; // userId -> [{childId, childName}]
  if (childrenSheet) {
    const cRows = childrenSheet.getDataRange().getValues();
    const cH = {};
    cRows[0].forEach((v, i) => cH[v] = i);
    cRows.slice(1).forEach(r => {
      if (!r[0]) return;
      const uid = String(r[cH["userId"]]);
      if (!childrenMap[uid]) childrenMap[uid] = [];
      childrenMap[uid].push({ childId: String(r[cH["childId"]]), childName: r[cH["childName"]] });
    });
  }

  // 子供衣装情報
  const childGearSheet = ensureChildGearSheet();
  const cgRows = childGearSheet.getDataRange().getValues();
  const cgH = {};
  cgRows[0].forEach((v, i) => cgH[v] = i);
  const childGearMap = {};
  cgRows.slice(1).forEach(r => {
    if (!r[0]) return;
    childGearMap[String(r[cgH["childId"]])] = {
      kimono_top: r[cgH["kimono_top"]] ?? "",
      kimono_bottom: r[cgH["kimono_bottom"]] ?? ""
    };
  });

  return {
    success: true,
    members: members.map(m => ({
      ...m,
      gear: gearMap[m.userId] || {},
      children: (childrenMap[m.userId] || []).map(c => ({
        ...c,
        gear: childGearMap[c.childId] || {}
      }))
    }))
  };
}

function saveGearGAS(targetUserId, gear, requestUserId) {
  if (!isAdmin_(requestUserId)) return { success: false, msg: "権限がありません" };

  const gearSheet = ensureGearSheet();
  const rows = gearSheet.getDataRange().getValues();
  const gH = {};
  rows[0].forEach((v, i) => gH[v] = i);

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][gH["userId"]]) === String(targetUserId)) {
      GEAR_COLS.slice(1).forEach(col => gearSheet.getRange(i + 1, gH[col] + 1).setValue(gear[col] ?? ""));
      return { success: true };
    }
  }
  gearSheet.appendRow(GEAR_COLS.map(col => col === "userId" ? targetUserId : (gear[col] ?? "")));
  return { success: true };
}

// ===== 未配布在庫（Tシャツ・手甲のみ、サイズ×数量） =====
function getGearSpareGAS() {
  const sheet = ensureSpareSheet();
  const rows = sheet.getDataRange().getValues();
  const h = {};
  rows[0].forEach((v, i) => h[v] = i);

  // Tシャツ：メンバーの使用数をカウント
  const tshirtUsage = {};
  const gearSheet = ensureGearSheet();
  const gearRows = gearSheet.getDataRange().getValues();
  const gH = {};
  gearRows[0].forEach((v, i) => gH[v] = i);
  gearRows.slice(1).forEach(r => {
    const size = String(r[gH["tshirt_size"]] || "").trim();
    if (size) tshirtUsage[size] = (tshirtUsage[size] || 0) + 1;
  });

  const items = rows.slice(1)
    .filter(r => r[0])
    .map(r => {
      const item_type = r[h["item_type"]];
      const value = String(r[h["value"]]);
      const quantity = Number(r[h["quantity"]]) || 0;
      const member_count = item_type === "Tシャツ" ? (tshirtUsage[value] || 0) : undefined;
      return { item_type, value, quantity, ...(member_count !== undefined ? { member_count } : {}) };
    });

  // Tシャツはメンバーが使用中だが在庫マスタに未登録のサイズも追加
  Object.entries(tshirtUsage).forEach(([size, count]) => {
    if (!items.find(i => i.item_type === "Tシャツ" && i.value === size)) {
      items.push({ item_type: "Tシャツ", value: size, quantity: 0, member_count: count });
    }
  });

  return { success: true, items };
}

// 在庫をupsert（数量0の場合は行削除）
function upsertGearSpareGAS(item_type, value, quantity, requestUserId) {
  if (!isAdmin_(requestUserId)) return { success: false, msg: "権限がありません" };
  if (!["Tシャツ", "手甲"].includes(item_type)) return { success: false, msg: "不正な種別" };

  const sheet = ensureSpareSheet();
  const rows = sheet.getDataRange().getValues();
  const h = {};
  rows[0].forEach((v, i) => h[v] = i);

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][h["item_type"]] === item_type && String(rows[i][h["value"]]) === String(value)) {
      if (quantity <= 0) {
        sheet.deleteRow(i + 1);
      } else {
        sheet.getRange(i + 1, h["quantity"] + 1).setValue(quantity);
      }
      return { success: true };
    }
  }
  if (quantity > 0) {
    sheet.appendRow([item_type, value, quantity]);
  }
  return { success: true };
}

// ===== マイページ =====
function getMyPageGAS(userId) {
  const ss = getSS();

  // ユーザー情報
  const usersSheet = ss.getSheetByName("users");
  if (!usersSheet) return { success: false };
  const uRows = usersSheet.getDataRange().getValues();
  const uH = {};
  uRows[0].forEach((v, i) => uH[v] = i);
  const uRow = uRows.slice(1).find(r => r[uH["userId"]] == userId);
  if (!uRow) return { success: false, msg: "user not found" };

  const user = {
    name: uRow[uH["storedName"]],
    role: uRow[uH["role"]],
    position: uRow[uH["position"]] || "",
    phone: uRow[uH["phone"]] || "",
    prefecture: uRow[uH["prefecture"]] || "",
    city: uRow[uH["city"]] || "",
    addressDetail: uRow[uH["addressDetail"]] || "",
    birthday: uRow[uH["birthday"]] || "",
    createdAt: uRow[uH["created_at"]] ? new Date(uRow[uH["created_at"]]) : null
  };

  // 装備情報
  const gearSheet = ensureGearSheet();
  const gRows = gearSheet.getDataRange().getValues();
  const gH = {};
  gRows[0].forEach((v, i) => gH[v] = i);
  const gRow = gRows.slice(1).find(r => r[gH["userId"]] == userId);
  const gear = {};
  if (gRow) GEAR_COLS.slice(1).forEach(col => { gear[col] = gRow[gH[col]] ?? ""; });

  // イベント参加率
  const eventSheet = ss.getSheetByName("events");
  const ansEventSheet = ss.getSheetByName("answers-events");
  let eventRate = null;
  if (eventSheet && ansEventSheet) {
    const eRows = eventSheet.getDataRange().getValues();
    const eH = {};
    eRows[0].forEach((v, i) => eH[v] = i);
    const allEvents = eRows.slice(1).filter(r => r[0]).map(r => {
      const d = r[eH["date"]];
      return { eventId: r[eH["eventId"]], date: d instanceof Date ? d : new Date(String(d).replace(/\//g, "-")) };
    });
    const eligible = user.createdAt ? allEvents.filter(ev => ev.date >= user.createdAt) : allEvents;
    const eligibleIds = new Set(eligible.map(ev => String(ev.eventId)));
    const ansRows = ansEventSheet.getDataRange().getValues();
    const aH = {};
    ansRows[0].forEach((v, i) => aH[v] = i);
    const participated = ansRows.slice(1).filter(r =>
      r[aH["userId"]] == userId && r[aH["status"]] === "参加" && eligibleIds.has(String(r[aH["eventId"]]))
    ).length;
    eventRate = eligible.length > 0 ? { participated, total: eligible.length, rate: participated / eligible.length } : null;
  }

  // 練習参加率
  const practiceSheet = ss.getSheetByName("practices");
  const ansPracticeSheet = ss.getSheetByName("answers-practices");
  let practiceRate = null;
  if (practiceSheet && ansPracticeSheet) {
    const pRows = practiceSheet.getDataRange().getValues();
    const pH = {};
    pRows[0].forEach((v, i) => pH[v] = i);
    const allPractices = pRows.slice(1).filter(r => r[0]).map(r => {
      const d = r[pH["date"]];
      return { practiceId: r[pH["practiceId"]], date: d instanceof Date ? d : new Date(String(d).replace(/\//g, "-")) };
    });
    const eligible = user.createdAt ? allPractices.filter(p => p.date >= user.createdAt) : allPractices;
    const eligibleIds = new Set(eligible.map(p => String(p.practiceId)));
    const ansRows = ansPracticeSheet.getDataRange().getValues();
    const aH = {};
    ansRows[0].forEach((v, i) => aH[v] = i);
    const absent = ansRows.slice(1).filter(r =>
      r[aH["userId"]] == userId &&
      (r[aH["status"]] === "欠席" || r[aH["status"]] === "遅刻") &&
      eligibleIds.has(String(r[aH["practiceId"]]))
    ).length;
    const participated = eligible.length - absent;
    practiceRate = eligible.length > 0 ? { participated, total: eligible.length, rate: participated / eligible.length } : null;
  }

  return { success: true, user, gear, eventRate, practiceRate };
}

function saveChildGearGAS(childId, gear, requestUserId) {
  if (!isAdmin_(requestUserId)) return { success: false, msg: "権限がありません" };

  const sheet = ensureChildGearSheet();
  const rows = sheet.getDataRange().getValues();
  const h = {};
  rows[0].forEach((v, i) => h[v] = i);

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][h["childId"]]) === String(childId)) {
      sheet.getRange(i + 1, h["kimono_top"] + 1).setValue(gear.kimono_top ?? "");
      sheet.getRange(i + 1, h["kimono_bottom"] + 1).setValue(gear.kimono_bottom ?? "");
      return { success: true };
    }
  }
  sheet.appendRow([childId, gear.kimono_top ?? "", gear.kimono_bottom ?? ""]);
  return { success: true };
}

function isAdmin_(userId) {
  const usersSheet = getSS().getSheetByName("users");
  if (!usersSheet) return false;
  const rows = usersSheet.getDataRange().getValues();
  const h = {};
  rows[0].forEach((v, i) => h[v] = i);
  const row = rows.slice(1).find(r => r[h["userId"]] == userId);
  return row && row[h["role"]] === "admin";
}
