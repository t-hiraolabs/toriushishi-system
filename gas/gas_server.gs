// =======================================================
// グローバル設定
// =======================================================
const SPREADSHEET_ID = '16AIWCya73T6kOkVujh5PrSUsHx9NosY0el8-uTrk3wo';

// ヘルパー関数: スプレッドシート取得
const getSS = () => SpreadsheetApp.openById(SPREADSHEET_ID);
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

const SHEETS = {
  USERS: () => getSS().getSheetByName("users"),
  CHILDREN: () => getSS().getSheetByName("children"),
  EVENTS: () => getSS().getSheetByName("events"),
  PRACTICES: () => getSS().getSheetByName("practices"),
  EVENTS_ANS: () => getSS().getSheetByName("answers-events"),
  PRACTICES_ANS: () => getSS().getSheetByName("answers-practices")
};

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "GET OK" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');

    let result;

    switch (data.action) {
      case "login":
        result = loginAPI(data.username, data.password);
        break;

      case "regist":
        result = registUserAPI(data);
        break;

      case "validateSession":
        result = validateSessionAPI(data.sessionId,data.requiredRole);
        break;

      case "getEventsWithStats":
        result = {
          success: true,
          events: getEventsWithStatsGAS(data.userId)
        };
        break;

      case "getPracticeWithStats":
        result = {
          success: true,
          practices: getPracticeWithStatsGAS(data.userId)
        };
        break;

      case "getEventDetailWithUserData":
        result = getEventDetailWithUserDataGAS(data.eventId, data.userId);
        break;

      case "updateEventResponse":
        result = updateEventResponseGAS(
          data.eventId,
          data.userId,
          data.status || data.answer
        );
        break;

      case "updatePracticeResponse":
        result = updatePracticeResponseGAS(
          data.practiceId,
          data.userId,
          data.status || data.answer
        );
        break;

      case "chatAI":
        result = chatAI_local(data.text || data.message);
        break;

      case "getMembers": {
        const role = data.role || "user";
        result = getMembersAPI(role);
        break;
      }

      case "approveMember":
        result = approveMemberAPI(data.userId);
        break;

      case "deleteMember":
        result = deleteMemberAPI(data.userId);
        break;

      case "deleteChild":
        result = deleteChildAPI(data.childId, data.userId);
        break;

      case "saveEvent":
        result = saveEventGAS(data.event);
        break;

      case "savePractice":
        result = savePracticeGAS(data.practice);
        break;

      case "addPerformance":
        result = addPerformanceGAS(data.performance);
        break;

      case "getPerformanceRoles":
        result = getPerformanceRoles();
        break;

      // ===== お旅管理 =====
      case "getOtabiPlaces":
        result = getOtabiPlacesGAS();
        break;

      case "saveOtabiPlace":
        result = saveOtabiPlaceGAS(data.place);
        break;

      case "deleteOtabiPlace":
        result = deleteOtabiPlaceGAS(data.placeId);
        break;

      case "getOtabiSchedule":
        result = getOtabiScheduleGAS(data.year, data.group, data.day);
        break;

      case "saveOtabiEntry":
        result = saveOtabiEntryGAS(data.entry);
        break;

      case "deleteOtabiEntry":
        result = deleteOtabiEntryGAS(data.entryId);
        break;

      case "copyOtabiSchedule":
        result = copyOtabiScheduleGAS(data.fromYear, data.toYear, data.group);
        break;

      case "getOtabiDonations":
        result = getOtabiDonationsGAS(data.year);
        break;

      case "saveOtabiDonations":
        result = saveOtabiDonationsGAS(data.donations);
        break;

      case "getParticipationStats":
        result = getParticipationStatsGAS(data.filter || "event");
        break;

      case "getMemos":
        result = getMemosGAS();
        break;

      case "saveMemo":
        result = saveMemoGAS(data.text, data.userId);
        break;

      case "deleteMemo":
        result = deleteMemoGAS(data.memoId, data.userId);
        break;

      case "getGear":
        result = getGearGAS();
        break;

      case "saveGear":
        result = saveGearGAS(data.targetUserId, data.gear, data.userId);
        break;

      case "getGearSpare":
        result = getGearSpareGAS();
        break;

      case "upsertGearSpare":
        result = upsertGearSpareGAS(data.item_type, data.value, data.quantity, data.userId);
        break;

      case "saveChildGear":
        result = saveChildGearGAS(data.childId, data.gear, data.userId);
        break;

      case "getMyPage":
        result = getMyPageGAS(data.userId);
        break;

      default:
        result = { success: false, msg: "unknown action" };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// セッション作成
function saveSession(user) {
  const sessionId = Utilities.getUuid();
  const cache = CacheService.getScriptCache();

  const sessionData = JSON.stringify({
    userId: user.userId,
    username: user.username,
    role: user.role,
    children: user.children,
    createdAt: Date.now()
  });

  cache.put(sessionId, sessionData, 6 * 60 * 60);

  return sessionId;
}

function validateSessionAPI(sessionId, requiredRole) {
  const cache = CacheService.getScriptCache();
  const sessionData = cache.get(sessionId);

  if (!sessionData) {
    return { valid: false, msg: "セッションが無効です" };
  }

  const session = JSON.parse(sessionData);

  if (requiredRole && session.role !== requiredRole) {
    return { valid: false, msg: "権限がありません" };
  }

  return {
    valid: true,
    userId: session.userId,
    role: session.role,
    msg: "OK"
  };
}

function hashPassword(password) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((name, i) => {
    if (name) map[name] = i;
  });
  return map;
}
