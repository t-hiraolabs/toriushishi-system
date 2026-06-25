// =======================================================
// お旅管理
// =======================================================

function ensureOtabiSheets() {
  const ss = getSS();
  let placesSheet = ss.getSheetByName("otabi_places");
  if (!placesSheet) {
    placesSheet = ss.insertSheet("otabi_places");
    placesSheet.appendRow(["place_id", "name", "address", "tel", "group", "created_at"]);
  }
  let schedSheet = ss.getSheetByName("otabi_schedules");
  if (!schedSheet) {
    schedSheet = ss.insertSheet("otabi_schedules");
    schedSheet.appendRow(["entry_id", "year", "group", "day", "no", "time", "place_id", "place_name", "memo", "donation", "actual_time", "created_at", "updated_at"]);
  } else {
    const headers = schedSheet.getRange(1, 1, 1, schedSheet.getLastColumn()).getValues()[0];
    if (!headers.includes("day")) {
      const groupIdx = headers.indexOf("group");
      schedSheet.insertColumnAfter(groupIdx + 1);
      schedSheet.getRange(1, groupIdx + 2).setValue("day");
    }
    if (!headers.includes("actual_time")) {
      const donIdx = headers.indexOf("donation");
      schedSheet.insertColumnAfter(donIdx + 1);
      schedSheet.getRange(1, donIdx + 2).setValue("actual_time");
    }
  }
  return { placesSheet, schedSheet };
}

function getOtabiPlacesGAS() {
  const { placesSheet } = ensureOtabiSheets();
  const data = placesSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, places: [] };
  const headers = data[0];
  const places = data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    })
    .filter(p => p.place_id);
  return { success: true, places };
}

function saveOtabiPlaceGAS(place) {
  const { placesSheet } = ensureOtabiSheets();
  const now = new Date();
  const data = placesSheet.getDataRange().getValues();
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i + 1; });

  if (place.place_id) {
    for (let r = 2; r <= data.length; r++) {
      if (Number(data[r-1][0]) === Number(place.place_id)) {
        placesSheet.getRange(r, P["name"]).setValue(place.name || "");
        placesSheet.getRange(r, P["address"]).setValue(place.address || "");
        placesSheet.getRange(r, P["tel"]).setValue(place.tel || "");
        placesSheet.getRange(r, P["group"]).setValue(place.group || "");
        return { success: true, place_id: place.place_id };
      }
    }
  }

  const ids = data.slice(1).map(r => Number(r[0])).filter(n => n > 0);
  const newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  placesSheet.appendRow([newId, place.name || "", place.address || "", place.tel || "", place.group || "", now]);
  return { success: true, place_id: newId };
}

function deleteOtabiPlaceGAS(placeId) {
  const { placesSheet } = ensureOtabiSheets();
  const data = placesSheet.getDataRange().getValues();
  for (let r = 2; r <= data.length; r++) {
    if (Number(data[r-1][0]) === Number(placeId)) {
      placesSheet.deleteRow(r);
      return { success: true };
    }
  }
  return { success: false, msg: "not found" };
}

function getOtabiScheduleGAS(year, group, day) {
  const { schedSheet } = ensureOtabiSheets();
  const data = schedSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, entries: [] };
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i; });

  const entries = data.slice(1)
    .filter(row => {
      if (!row[0]) return false;
      if (String(row[P["year"]]) !== String(year)) return false;
      if (row[P["group"]] !== group) return false;
      if (day && P["day"] !== undefined && row[P["day"]] !== day) return false;
      return true;
    })
    .map(row => {
      const timeVal = row[P["time"]];
      const timeStr = timeVal instanceof Date
        ? Utilities.formatDate(timeVal, "Asia/Tokyo", "HH:mm")
        : String(timeVal || "");
      return {
        entry_id: row[P["entry_id"]],
        year: row[P["year"]],
        group: row[P["group"]],
        day: P["day"] !== undefined ? (row[P["day"]] || "土曜") : "土曜",
        no: row[P["no"]],
        time: timeStr,
        place_id: row[P["place_id"]],
        place_name: row[P["place_name"]],
        memo: row[P["memo"]],
        donation: Number(row[P["donation"]]) || 0,
        actual_time: P["actual_time"] !== undefined
          ? (row[P["actual_time"]] instanceof Date
              ? Utilities.formatDate(row[P["actual_time"]], "Asia/Tokyo", "HH:mm")
              : String(row[P["actual_time"]] || ""))
          : ""
      };
    });

  entries.sort((a, b) => Number(a.no) - Number(b.no));
  return { success: true, entries };
}

function saveOtabiEntryGAS(entry) {
  const { schedSheet } = ensureOtabiSheets();
  const now = new Date();
  const data = schedSheet.getDataRange().getValues();
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i + 1; });

  if (entry.entry_id) {
    for (let r = 2; r <= data.length; r++) {
      if (Number(data[r-1][0]) === Number(entry.entry_id)) {
        if (P["day"]) schedSheet.getRange(r, P["day"]).setValue(entry.day || "土曜");
        schedSheet.getRange(r, P["no"]).setValue(entry.no || "");
        schedSheet.getRange(r, P["time"]).setValue(entry.time || "");
        schedSheet.getRange(r, P["place_id"]).setValue(entry.place_id || "");
        schedSheet.getRange(r, P["place_name"]).setValue(entry.place_name || "");
        schedSheet.getRange(r, P["memo"]).setValue(entry.memo || "");
        schedSheet.getRange(r, P["donation"]).setValue(Number(entry.donation) || 0);
        schedSheet.getRange(r, P["updated_at"]).setValue(now);
        return { success: true, entry_id: entry.entry_id };
      }
    }
  }

  const ids = data.slice(1).map(r => Number(r[0])).filter(n => n > 0);
  const newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  schedSheet.appendRow([
    newId, entry.year, entry.group, entry.day || "土曜",
    entry.no || "", entry.time || "",
    entry.place_id || "", entry.place_name || "",
    entry.memo || "", Number(entry.donation) || 0,
    "", now, now
  ]);
  return { success: true, entry_id: newId };
}

function markOtabiCompleteGAS(entryId, actualTime) {
  const { schedSheet } = ensureOtabiSheets();
  const data = schedSheet.getDataRange().getValues();
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i + 1; });
  for (let r = 2; r <= data.length; r++) {
    if (Number(data[r-1][0]) === Number(entryId)) {
      schedSheet.getRange(r, P["actual_time"]).setValue(actualTime);
      schedSheet.getRange(r, P["updated_at"]).setValue(new Date());
      return { success: true };
    }
  }
  return { success: false, msg: "entry not found" };
}

function getOtabiAllProgressGAS(year, day) {
  const { schedSheet } = ensureOtabiSheets();
  const data = schedSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, groups: {} };
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i; });

  const result = {};
  data.slice(1).forEach(row => {
    if (!row[0]) return;
    if (String(row[P["year"]]) !== String(year)) return;
    if (day && row[P["day"]] !== day) return;
    const group = row[P["group"]];
    if (!result[group]) result[group] = [];
    const timeVal = row[P["time"]];
    const timeStr = timeVal instanceof Date
      ? Utilities.formatDate(timeVal, "Asia/Tokyo", "HH:mm")
      : String(timeVal || "");
    const actualVal = P["actual_time"] !== undefined ? row[P["actual_time"]] : "";
    const actualStr = actualVal instanceof Date
      ? Utilities.formatDate(actualVal, "Asia/Tokyo", "HH:mm")
      : String(actualVal || "");
    result[group].push({
      entry_id: row[P["entry_id"]],
      no: row[P["no"]],
      time: timeStr,
      place_name: row[P["place_name"]],
      actual_time: actualStr
    });
  });
  Object.keys(result).forEach(g => result[g].sort((a, b) => Number(a.no) - Number(b.no)));
  return { success: true, groups: result };
}

function deleteOtabiEntryGAS(entryId) {
  const { schedSheet } = ensureOtabiSheets();
  const data = schedSheet.getDataRange().getValues();
  for (let r = 2; r <= data.length; r++) {
    if (Number(data[r-1][0]) === Number(entryId)) {
      schedSheet.deleteRow(r);
      return { success: true };
    }
  }
  return { success: false, msg: "not found" };
}

function copyOtabiScheduleGAS(fromYear, toYear, group) {
  const { schedSheet } = ensureOtabiSheets();
  const now = new Date();
  const data = schedSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, msg: "コピー元のスケジュールが見つかりません" };
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i; });

  const src = data.slice(1).filter(row =>
    row[0] && String(row[P["year"]]) === String(fromYear) && row[P["group"]] === group
  );
  if (src.length === 0) return { success: false, msg: `${fromYear}年の${group}スケジュールが見つかりません` };

  const ids = data.slice(1).map(r => Number(r[0])).filter(n => n > 0);
  let nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

  src.forEach(row => {
    schedSheet.appendRow([
      nextId++, toYear, group,
      P["day"] !== undefined ? (row[P["day"]] || "土曜") : "土曜",
      row[P["no"]] || "", row[P["time"]] || "",
      row[P["place_id"]] || "", row[P["place_name"]] || "",
      row[P["memo"]] || "", 0,
      now, now
    ]);
  });

  return { success: true, count: src.length };
}

function getOtabiDonationsGAS(year) {
  const { schedSheet } = ensureOtabiSheets();
  const data = schedSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, entries: [], total: 0, byGroup: {} };
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i; });

  // その年の全エントリ（お花代0も含む＝入力対象）
  const entries = data.slice(1)
    .filter(row => row[0] && String(row[P["year"]]) === String(year))
    .map(row => ({
      entry_id: row[P["entry_id"]],
      group: row[P["group"]],
      day: P["day"] !== undefined ? (row[P["day"]] || "土曜") : "土曜",
      no: row[P["no"]],
      time: row[P["time"]] instanceof Date
        ? Utilities.formatDate(row[P["time"]], "Asia/Tokyo", "HH:mm")
        : String(row[P["time"]] || ""),
      place_name: row[P["place_name"]],
      memo: row[P["memo"]],
      donation: Number(row[P["donation"]]) || 0
    }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.day.localeCompare(b.day) || Number(a.no) - Number(b.no));

  const total = entries.reduce((s, e) => s + e.donation, 0);
  const byGroup = {};
  entries.forEach(e => { byGroup[e.group] = (byGroup[e.group] || 0) + e.donation; });

  return { success: true, entries, total, byGroup };
}

// お花代だけをまとめて更新（Excel風一括入力用）
function saveOtabiDonationsGAS(donations) {
  const { schedSheet } = ensureOtabiSheets();
  const now = new Date();
  const data = schedSheet.getDataRange().getValues();
  const headers = data[0];
  const P = {};
  headers.forEach((h, i) => { P[h] = i + 1; });

  const rowById = {};
  for (let r = 2; r <= data.length; r++) {
    const id = Number(data[r - 1][0]);
    if (id > 0) rowById[id] = r;
  }

  let count = 0;
  (donations || []).forEach(d => {
    const r = rowById[Number(d.entry_id)];
    if (!r) return;
    schedSheet.getRange(r, P["donation"]).setValue(Number(d.donation) || 0);
    schedSheet.getRange(r, P["updated_at"]).setValue(now);
    count++;
  });

  return { success: true, count };
}
