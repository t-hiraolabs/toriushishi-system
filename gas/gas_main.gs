/**
 * イベント一覧と集計の取得
 */

function getEventsWithStatsGAS(userId) {
  const ss = getSS();

  const eventSheet = SHEETS.EVENTS();
  const answerSheet = SHEETS.EVENTS_ANS();
  const userSheet = SHEETS.USERS();

  const eventsData = eventSheet.getDataRange().getValues();
  const answersData = answerSheet.getDataRange().getValues();
  const usersData = userSheet.getDataRange().getValues();

  const UHEAD = usersData[0];
  const U = {};
  UHEAD.forEach((h, i) => U[h] = i);

  const uid = Number(userId);

  const activeUsers = [];
  const userIdNameMap = {};

  usersData.slice(1).forEach(r => {
    const id = Number(r[U["userId"]]);
    const name = r[U["storedName"]];
    const status = r[U["status"]];
    const createdAt = r[U["created_at"]];

    userIdNameMap[id] = name;
    if (status === "active") activeUsers.push({ id, name, createdAt });
  });

  const EHEAD = eventsData[0];
  const E = {};
  EHEAD.forEach((h, i) => E[h] = i);

  const events = eventsData.slice(1).map(row => {
    const timeValue = row[E["time"]];
    return {
      eventId: Number(row[E["eventId"]]),
      date: row[E["date"]],
      title: row[E["title"]],
      type: row[E["type"]],
      time: timeValue instanceof Date
        ? Utilities.formatDate(timeValue, "Asia/Tokyo", "HH:mm")
        : String(timeValue),
      location: row[E["location"]],
      comment: row[E["comment"]],
      deadline: row[E["deadline"]]
    };
  }).filter(ev => ev.eventId);

  const AHEAD = answersData[0];
  const A = {};
  AHEAD.forEach((h, i) => A[h] = i);

  const answersMap = {};
  answersData.slice(1).forEach(row => {
    const eventId = Number(row[A["eventId"]]);
    const user = Number(row[A["userId"]]);
    const status = row[A["status"]];

    if (!answersMap[eventId]) answersMap[eventId] = [];
    answersMap[eventId].push({ userId: user, status });
  });

  const result = events.map(ev => {
    const eid = ev.eventId;
    const list = answersMap[eid] || [];

    // イベント日付（比較用）
    const evDate = ev.date instanceof Date ? ev.date : new Date(String(ev.date).replace(/\//g, "-"));

    // イベント日時点で登録済みのメンバーのみ対象
    const eligibleUsers = activeUsers.filter(u => {
      if (!u.createdAt) return true;
      const regDate = u.createdAt instanceof Date ? u.createdAt : new Date(String(u.createdAt).replace(/\//g, "-"));
      return regDate <= evDate;
    });

    let yes = 0, no = 0, na = 0;
    let myStatus = "未回答";

    const yesNames = [];
    const noNames = [];

    const answerMap = {};
    list.forEach(a => answerMap[a.userId] = a.status);

    eligibleUsers.forEach(u => {
      const status = answerMap[u.id];

      if (!status) {
        na++;
      } else if (status === "参加") {
        yes++;
        yesNames.push(u.name);
      } else if (status === "不参加") {
        no++;
        noNames.push(u.name);
      } else {
        na++;
      }

      if (u.id === uid && status) myStatus = status;
    });

    const answered = [...yesNames, ...noNames];
    const naNames = eligibleUsers
      .filter(u => !answered.includes(u.name))
      .map(u => u.name);

    let dateStr = "";
    let sortKey = 0;

    if (ev.date instanceof Date) {
      sortKey = ev.date.getTime();
      dateStr = Utilities.formatDate(ev.date, "Asia/Tokyo", "yyyy/MM/dd");
    } else {
      dateStr = String(ev.date);
    }

    return {
      ...ev,
      date: dateStr,
      yes,
      no,
      na,
      myStatus,
      members: {
        yes: yesNames,
        no: noNames,
        na: naNames
      },
      sortKey
    };
  });

  return result.sort((a, b) => a.sortKey - b.sortKey);
}

function getPracticeWithStatsGAS(userId) {
  const ss = getSS();

  const practiceSheet = SHEETS.PRACTICES();
  const answerSheet   = SHEETS.PRACTICES_ANS();
  const userSheet     = SHEETS.USERS();

  const practiceData = practiceSheet.getDataRange().getValues();
  const answersData  = answerSheet.getDataRange().getValues();
  const usersData    = userSheet.getDataRange().getValues();

  const UHEAD = usersData[0];
  const U = {};
  UHEAD.forEach((h,i)=>U[h]=i);

  const uid = Number(userId);

  const activeUsers = usersData
    .slice(1)
    .filter(r => r[U["status"]] === "active")
    .map(r => ({
      id: Number(r[U["userId"]]),
      name: r[U["storedName"]]
    }));

  const PHEAD = practiceData[0];
  const P = {};
  PHEAD.forEach((h,i)=>P[h]=i);

  const practices = practiceData.slice(1).map(row => {
    const startCol = P["start"] !== undefined ? P["start"] : P["time"];
    const startVal = row[startCol];
    const startStr = startVal instanceof Date
      ? Utilities.formatDate(startVal, "Asia/Tokyo", "HH:mm")
      : String(startVal || "");

    const endStr = P["end"] !== undefined
      ? (() => {
          const v = row[P["end"]];
          return v instanceof Date
            ? Utilities.formatDate(v, "Asia/Tokyo", "HH:mm")
            : String(v || "");
        })()
      : "";

    return {
      practiceId: row[P["practiceId"]],
      date: row[P["date"]],
      title: row[P["title"]],
      type: row[P["type"]],
      start: startStr,
      end: endStr,
      location: row[P["location"]],
      comment: row[P["comment"]]
    };
  }).filter(pr => pr.practiceId);

  const AHEAD = answersData[0];
  const A = {};
  AHEAD.forEach((h,i)=>A[h]=i);

  const answersMap = {};
  answersData.slice(1).forEach(row=>{
    const pid = Number(row[A["practiceId"]]);
    if (!answersMap[pid]) answersMap[pid] = [];
    answersMap[pid].push({
      userId: Number(row[A["userId"]]),
      status: row[A["status"]]
    });
  });

  const result = practices.map(pr=>{
    const pid  = Number(pr.practiceId);
    const list = answersMap[pid] || [];

    let absent = [];
    let late   = [];
    let myStatus = "";

    const answerMap = {};
    list.forEach(a => answerMap[a.userId] = a.status);

    activeUsers.forEach(u=>{
      const status = answerMap[u.id];

      if (status === "欠席")  absent.push(u.name);
      if (status === "遅刻")  late.push(u.name);

      if (u.id === uid && status) myStatus = status;
    });

    let sortKey = 0;
    let dateStr = "";
    if (pr.date instanceof Date) {
      sortKey = pr.date.getTime();
      dateStr = Utilities.formatDate(pr.date, "Asia/Tokyo", "yyyy/MM/dd");
    } else {
      dateStr = String(pr.date);
    }

    return {
      ...pr,
      date: dateStr,
      absent,
      late,
      myStatus,
      sortKey
    };
  });

  return result.sort((a,b)=>a.sortKey - b.sortKey);
}

function updateEventResponseGAS(eventId, userId, status) {
  const ss = getSS();

  const answerSheet = SHEETS.EVENTS_ANS();
  const userSheet = SHEETS.USERS();

  const answers = answerSheet.getDataRange().getValues();
  const users = userSheet.getDataRange().getValues();
  const now = new Date();

  const UHEAD = users[0];
  const U = {};
  UHEAD.forEach((h, i) => U[h] = i);

  const AHEAD = answers[0];
  const A = {};
  AHEAD.forEach((h, i) => A[h] = i);

  const eid = Number(eventId);
  const uid = Number(userId);

  const activeUsers = users.slice(1)
    .filter(r => r[U["status"]] === "active")
    .map(r => ({ id: Number(r[U["userId"]]), name: r[U["storedName"]] }));

  let foundRow = -1;

  for (let i = 1; i < answers.length; i++) {
    const r = answers[i];
    if (Number(r[A["eventId"]]) === eid && Number(r[A["userId"]]) === uid) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    answerSheet.getRange(foundRow, A["status"] + 1).setValue(status);
    answerSheet.getRange(foundRow, A["updated_at"] + 1).setValue(now);
  } else {
    const newRow = [];
    newRow[A["eventId"]] = eid;
    newRow[A["userId"]] = uid;
    newRow[A["status"]] = status;
    newRow[A["created_at"]] = now;
    newRow[A["updated_at"]] = now;

    const rowArr = Array(answerSheet.getLastColumn()).fill("");
    Object.keys(A).forEach(key => {
      rowArr[A[key]] = newRow[A[key]] || "";
    });

    answerSheet.appendRow(rowArr);
  }

  const latest = answerSheet.getDataRange().getValues();

  const yes = [], no = [], na = [];

  activeUsers.forEach(u => {
    const row = latest.find(r =>
      Number(r[A["eventId"]]) === eid &&
      Number(r[A["userId"]]) === u.id
    );

    const s = row ? row[A["status"]] : "";
    if (s === "参加") yes.push(u.name);
    else if (s === "不参加") no.push(u.name);
    else na.push(u.name);
  });

  return { yes, no, na };
}

function updatePracticeResponseGAS(practiceId, userId, status) {
  const ss = getSS();

  const answerSheet = SHEETS.PRACTICES_ANS();
  const userSheet   = SHEETS.USERS();

  const answers = answerSheet.getDataRange().getValues();
  const users   = userSheet.getDataRange().getValues();
  const now = new Date();

  const UHEAD = users[0];
  const U = {};
  UHEAD.forEach((h, i) => U[h] = i);

  const AHEAD = answers[0];
  const A = {};
  AHEAD.forEach((h, i) => A[h] = i);

  const pid = Number(practiceId);
  const uid = Number(userId);

  const activeUsers = users.slice(1)
    .filter(r => r[U["status"]] === "active")
    .map(r => ({
      id:   Number(r[U["userId"]]),
      name: r[U["storedName"]]
    }));

  let foundRow = -1;

  for (let i = 1; i < answers.length; i++) {
    const r = answers[i];
    if (Number(r[A["practiceId"]]) === pid && Number(r[A["userId"]]) === uid) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    answerSheet.getRange(foundRow, A["status"] + 1).setValue(status);
    answerSheet.getRange(foundRow, A["updated_at"] + 1).setValue(now);
  } else {
    const newRow = [];
    newRow[A["practiceId"]] = pid;
    newRow[A["userId"]]     = uid;
    newRow[A["status"]]     = status;
    newRow[A["created_at"]] = now;
    newRow[A["updated_at"]] = now;

    const rowArr = Array(answerSheet.getLastColumn()).fill("");
    Object.keys(A).forEach(key => {
      rowArr[A[key]] = newRow[A[key]] || "";
    });

    answerSheet.appendRow(rowArr);
  }

  const latest = answerSheet.getDataRange().getValues();

  const absent = [];
  const late   = [];

  activeUsers.forEach(u => {
    const row = latest.find(r =>
      Number(r[A["practiceId"]]) === pid &&
      Number(r[A["userId"]]) === u.id
    );

    const s = row ? row[A["status"]] : "";

    if (s === "欠席")       absent.push(u.name);
    else if (s === "遅刻") late.push(u.name);
  });

  return { absent, late };
}

function chatAI(userMessage) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { success: false, message: "APIキーが設定されていません。" };
  }

  const rawEvents = getEventsWithStatsGAS("AI_SYSTEM");
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");

  const events = rawEvents.map(e => {
    const d = e.date || "";
    const t = e.title || "";
    const ty = e.type || "";
    return `${d} / ${t} / ${ty}`;
  }).join("\n");

  const systemText = `
あなたは親しみやすいAI「ししまる」です。
今日の日付は ${today} です。利用者は鳥生獅子連中のメンバーです。

演目：天狗、ひょっとこ、きつね、三番叟、練るなど。
特徴：継ぎ獅子（三継ぎ・四継ぎ）。

【イベント予定（要約）】
${events}

ユーザーの質問にフレンドリーに、イベント情報は正確に回答してください。
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemText + "\n\n■ユーザー: " + userMessage }]
      }
    ]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const body = res.getContentText();

    if (code === 200) {
      const json = JSON.parse(body);
      return {
        success: true,
        reply: json.candidates[0].content.parts[0].text
      };
    }

    if (code === 429) {
      return {
        success: false,
        message: "ししまるがお疲れです。しばらくしてから試してください。（429）"
      };
    }

    return { success: false, message: `Geminiエラー: ${body}` };

  } catch (err) {
    return { success: false, message: "通信失敗: " + err.toString() };
  }
}

function chatAI_local(userMessage) {
  const rawEvents = getEventsWithStatsGAS("AI_SYSTEM");
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");

  const msg = userMessage.toLowerCase();

  if (msg.includes("今日") && msg.includes("日")) {
    return { success: true, reply: `今日は ${today} じゃよ。` };
  }

  if (msg.includes("次") && msg.includes("イベント")) {
    const e = rawEvents[0];
    if (e) return {
      success: true,
      reply: `次のイベントは ${e.date} に「${e.title}」があるぞ。`
    };
    return { success: true, reply: "今のところ予定はないのう。" };
  }

  if (msg.includes("天狗")) {
    return { success: true, reply: "天狗は足が速くてかっこいいんじゃ！" };
  }
  if (msg.includes("ひょっとこ")) {
    return { success: true, reply: "ひょっとこは愛嫉たっぷりで人気じゃのう！" };
  }

  if (msg.includes("こんにちは") || msg.includes("やあ")) {
    return { success: true, reply: "おう、こんにちは！ししまるじゃ。" };
  }

  return {
    success: true,
    reply: "すまんのう、うまく答えられん質問じゃった…"
  };
}


function getMembersAPI(currentUserRole) {
  const full = getMemberRawData();
  return {
    success: true,
    members: currentUserRole === "admin"
      ? formatMembersAdmin(full)
      : formatMembersUser(full)
  };
}

function getMemberRawData() {
  const usersSheet = SHEETS.USERS();
  const childrenSheet = SHEETS.CHILDREN();

  const users = usersSheet.getDataRange().getValues();
  const children = childrenSheet.getDataRange().getValues();

  const UHEAD = users[0];
  const U = {};
  UHEAD.forEach((h, i) => U[h] = i);

  const CHEAD = children[0];
  const C = {};
  CHEAD.forEach((h, i) => C[h] = i);

  const raw = [];

  for (let i = 1; i < users.length; i++) {
    const row = users[i];

    const userId          = row[U["userId"]];
    const name            = row[U["storedName"]];
    const role            = row[U["role"]];
    const status          = row[U["status"]];
    const position        = row[U["position"]];

    if (status !== "active" && status !== "hold") continue;

    const kids = children
      .slice(1)
      .filter(c => Number(c[C["userId"]]) === Number(userId))
      .map(c => ({
        childId: c[C["childId"]],
        childName: c[C["childName"]],
        status: status === "hold" ? "hold" : c[C["status"]]
      }));

    raw.push({
        userId,
        name,
        role,
        status,
        position,
        children: kids
    });
  }

  return raw;
}

function formatMembersUser(raw) {
  return raw
    .filter(m => m && m.name)
    .map(m => ({
      userId: m.userId,
      name: m.name,
      status: m.status,
      position: m.position || "",
      children: Array.isArray(m.children)
        ? m.children.map(k => ({
            childName: k.childName
          }))
        : []
    }));
}

function formatMembersAdmin(raw) {
  const holdMembers = raw.filter(m => m.status === "hold");
  const activeMembers = raw.filter(m => m.status === "active");

  return [...holdMembers, ...activeMembers].map(m => ({
    ...m,
    children: m.children || []
  }));
}

function approveMemberAPI(userId) {
  const usersSheet = SHEETS.USERS();
  const childrenSheet = SHEETS.CHILDREN();

  const users = usersSheet.getDataRange().getValues();
  const children = childrenSheet.getDataRange().getValues();

  const UHEAD = users[0];
  const U = {};
  UHEAD.forEach((h, i) => U[h] = i);

  const CHEAD = children[0];
  const C = {};
  CHEAD.forEach((h, i) => C[h] = i);

  for (let i = 1; i < users.length; i++) {
    if (String(users[i][U["userId"]]) === String(userId)) {
      usersSheet.getRange(i + 1, U["status"] + 1).setValue("active");
      break;
    }
  }

  for (let i = 1; i < children.length; i++) {
    if (String(children[i][C["userId"]]) === String(userId)) {
      childrenSheet.getRange(i + 1, C["status"] + 1).setValue("active");
    }
  }

  return { success: true };
}

function deleteMemberAPI(userId) {
  const usersSheet = SHEETS.USERS();
  const childrenSheet = SHEETS.CHILDREN();

  const users = usersSheet.getDataRange().getValues();
  const children = childrenSheet.getDataRange().getValues();

  const UHEAD = users[0];
  const U = {};
  UHEAD.forEach((h, i) => U[h] = i);

  const CHEAD = children[0];
  const C = {};
  CHEAD.forEach((h, i) => C[h] = i);

  for (let i = 1; i < children.length; i++) {
    if (String(children[i][C["userId"]]) === String(userId)) {
      childrenSheet.getRange(i + 1, C["status"] + 1).setValue("deleted");
    }
  }

  for (let i = 1; i < users.length; i++) {
    if (String(users[i][U["userId"]]) === String(userId)) {
      usersSheet.getRange(i + 1, U["status"] + 1).setValue("deleted");
      break;
    }
  }

  return { success: true };
}

function saveEventGAS(event) {
  try {
    const sheet = ss.getSheetByName("events");
    const now = new Date();

    const dateOnly = new Date(event.date);

    const [h, m] = event.time.split(":").map(Number);
    const timeOnly = new Date(1899, 11, 30, h, m);

    if (event.eventId) {
      const id = Number(event.eventId);
      const lastRow = sheet.getLastRow();
      const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

      let targetRow = null;
      for (let i = 0; i < values.length; i++) {
        if (Number(values[i][0]) === id) {
          targetRow = i + 2;
          break;
        }
      }

      if (!targetRow) {
        return { success: false, message: "ID が見つかりません" };
      }

      sheet.getRange(targetRow, 2).setValue(dateOnly);
      sheet.getRange(targetRow, 3).setValue(event.title);
      sheet.getRange(targetRow, 4).setValue(event.type);
      sheet.getRange(targetRow, 5).setValue(timeOnly);
      sheet.getRange(targetRow, 6).setValue(event.location);
      sheet.getRange(targetRow, 7).setValue(event.comment);
      sheet.getRange(targetRow, 8).setValue(event.deadline);
      sheet.getRange(targetRow, 10).setValue(now);

      return { success: true, eventId: id, updated: true };
    }

    const lastRow = sheet.getLastRow();
    const lastId = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() : 0;
    const newId = lastId + 1;

    sheet.appendRow([
      newId,
      dateOnly,
      event.title,
      event.type,
      timeOnly,
      event.location,
      event.comment,
      now,
      now
    ]);

    return { success: true, eventId: newId, created: true };

  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function savePracticeGAS(practice) {
  try {
    const sheet = SHEETS.PRACTICES();
    const now = new Date();

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const P = {};
    headers.forEach((h, i) => { if (h) P[h] = i + 1; });

    const dateOnly = new Date(practice.date);

    const startTime = (() => {
      if (!practice.start) return "";
      const [h, m] = practice.start.split(":").map(Number);
      return new Date(1899, 11, 30, h, m);
    })();

    const endTime = (() => {
      if (!practice.end) return "";
      const [h, m] = practice.end.split(":").map(Number);
      return new Date(1899, 11, 30, h, m);
    })();

    const lastRow = sheet.getLastRow();
    const lastId = lastRow > 1
      ? sheet.getRange(lastRow, P["practiceId"]).getValue()
      : 0;
    const newId = Number(lastId) + 1;

    const rowArr = Array(sheet.getLastColumn()).fill("");

    rowArr[P["practiceId"] - 1] = newId;
    rowArr[P["date"] - 1]       = dateOnly;
    rowArr[P["title"] - 1]      = practice.title || "練習";

    if (P["start"]) {
      rowArr[P["start"] - 1] = startTime;
    } else if (P["time"]) {
      rowArr[P["time"] - 1]  = startTime;
    }

    if (P["end"]) {
      rowArr[P["end"] - 1] = endTime;
    }

    if (P["location"])   rowArr[P["location"] - 1]   = practice.location || "";
    if (P["comment"])    rowArr[P["comment"] - 1]    = practice.comment  || "";
    if (P["created_at"]) rowArr[P["created_at"] - 1] = now;
    if (P["updated_at"]) rowArr[P["updated_at"] - 1] = now;
    if (P["createdAt"])  rowArr[P["createdAt"] - 1]  = now;
    if (P["updatedAt"])  rowArr[P["updatedAt"] - 1]  = now;

    sheet.appendRow(rowArr);

    return { success: true, practiceId: newId, created: true };

  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function addPerformanceGAS(performance) {
  try {
    const sheet = ss.getSheetByName("performances");
    const lastRow = sheet.getLastRow();
    const lastId = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() : 0;
    const newId = lastId + 1;
    const now = new Date();

    sheet.appendRow([
      newId,
      performance.eventId,
      performance.name || "",
      performance.order || "",
      JSON.stringify(performance.roles || {}),
      now,
      now
    ]);

    return { success: true, performanceId: newId };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getPerformanceRoles() {
  try {
    const sheet = ss.getSheetByName("performanceRoles");
    const values = sheet.getDataRange().getValues();

    const roles = {};
    for (let i = 0; i < values.length; i++) {
      const roleName = values[i][0];
      if (roleName) roles[roleName] = "";
    }

    return { success: true, roles };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}