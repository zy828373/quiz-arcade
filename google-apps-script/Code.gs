/**
 * Google Apps Script — Quiz Arcade Backend
 *
 * Deploy this as a Web App from the Google Sheets Script Editor:
 *   1. Extensions > Apps Script
 *   2. Paste this code into Code.gs
 *   3. Deploy > New deployment > Web app
 *   4. Execute as: Me / Who has access: Anyone
 *   5. Copy the URL and set it as VITE_GOOGLE_APP_SCRIPT_URL
 *
 * Google Sheets structure:
 *   Sheet "题目": 题号 | 题目 | A | B | C | D | 解答
 *   Sheet "回答": ID | 闯关次数 | 总分 | 最高分 | 第一次通关分数 | 花了几次通关 | 最近游玩时间
 */

// ───────── Configuration ─────────
var SPREADSHEET_ID = '1HibRAeHrjjWZx46xFMEKWH3PcToLrlhDxZ0AEKUdPn0';
var QUESTION_SHEET_NAME = '题目';
var ANSWER_SHEET_NAME = '回答';

// ───────── GET Handler ─────────
function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getQuestions') {
    return handleGetQuestions(e);
  }

  if (action === 'listSheets') {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var names = ss.getSheets().map(function(s) { return s.getName(); });
    return jsonResponse({ sheets: names });
  }

  return jsonResponse({ error: 'Unknown action: ' + action });
}

// ───────── POST Handler ─────────
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON body' });
  }

  var action = body.action;

  if (action === 'submitAnswers') {
    return handleSubmitAnswers(body);
  }

  return jsonResponse({ error: 'Unknown action: ' + action });
}

// ───────── Get Questions ─────────
function handleGetQuestions(e) {
  var count = parseInt(e.parameter.count, 10) || 10;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(QUESTION_SHEET_NAME);

  if (!sheet) {
    return jsonResponse({ error: 'Sheet "' + QUESTION_SHEET_NAME + '" not found' });
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0]; // [题号, 题目, A, B, C, D, 解答]
  var rows = data.slice(1).filter(function (row) {
    return row[0] !== '' && row[0] !== null;
  });

  // Shuffle using Fisher-Yates
  for (var i = rows.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = rows[i];
    rows[i] = rows[j];
    rows[j] = temp;
  }

  var selected = rows.slice(0, Math.min(count, rows.length));

  var questions = selected.map(function (row) {
    return {
      id: row[0],       // 题号
      question: row[1],  // 题目
      A: row[2],
      B: row[3],
      C: row[4],
      D: row[5]
      // Note: row[6] (解答) is intentionally excluded
    };
  });

  return jsonResponse({ questions: questions });
}

// ───────── Submit Answers ─────────
function handleSubmitAnswers(body) {
  var playerId = body.playerId;
  var answers = body.answers; // [{questionId, answer}]

  if (!playerId || !answers || !Array.isArray(answers)) {
    return jsonResponse({ error: 'Missing playerId or answers' });
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── Look up correct answers ──
  var qSheet = ss.getSheetByName(QUESTION_SHEET_NAME);
  if (!qSheet) {
    return jsonResponse({ error: 'Sheet "' + QUESTION_SHEET_NAME + '" not found' });
  }

  var qData = qSheet.getDataRange().getValues();
  var answerMap = {};
  for (var i = 1; i < qData.length; i++) {
    answerMap[qData[i][0]] = String(qData[i][6]).trim().toUpperCase(); // 题号 → 解答
  }

  // ── Grade ──
  var score = 0;
  var total = answers.length;
  answers.forEach(function (a) {
    var correct = answerMap[a.questionId];
    if (correct && correct === String(a.answer).trim().toUpperCase()) {
      score++;
    }
  });

  // ── Read pass threshold from script properties or default to 8 ──
  var props = PropertiesService.getScriptProperties();
  var passThreshold = parseInt(props.getProperty('PASS_THRESHOLD'), 10) || 8;
  var passed = score >= passThreshold;

  // ── Update "回答" sheet ──
  var rSheet = ss.getSheetByName(ANSWER_SHEET_NAME);
  if (!rSheet) {
    return jsonResponse({ error: 'Sheet "' + ANSWER_SHEET_NAME + '" not found' });
  }

  var rData = rSheet.getDataRange().getValues();
  var rHeaders = rData[0];
  // Columns: 0=ID, 1=闯关次数, 2=总分, 3=最高分, 4=第一次通关分数, 5=花了几次通关, 6=最近游玩时间
  var playerRow = -1;
  for (var r = 1; r < rData.length; r++) {
    if (String(rData[r][0]).trim() === String(playerId).trim()) {
      playerRow = r + 1; // 1-indexed for Sheet API
      break;
    }
  }

  var now = new Date();
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  if (playerRow === -1) {
    // New player — append row
    var attemptCount = 1;
    var firstPassScore = passed ? score : '';
    var passAttempts = passed ? 1 : '';
    rSheet.appendRow([playerId, attemptCount, score, score, firstPassScore, passAttempts, timeStr]);
  } else {
    // Existing player — update
    var prevAttempts = Number(rSheet.getRange(playerRow, 2).getValue()) || 0;
    var prevTotal = Number(rSheet.getRange(playerRow, 3).getValue()) || 0;
    var prevHigh = Number(rSheet.getRange(playerRow, 4).getValue()) || 0;
    var prevFirstPass = rSheet.getRange(playerRow, 5).getValue();
    var prevPassAttempts = rSheet.getRange(playerRow, 6).getValue();

    var newAttempts = prevAttempts + 1;
    var newTotal = prevTotal + score;
    var newHigh = Math.max(prevHigh, score);

    // First pass score: only set if not already set AND this attempt passed
    var newFirstPass = prevFirstPass;
    var newPassAttempts = prevPassAttempts;

    if (passed && (prevFirstPass === '' || prevFirstPass === null || prevFirstPass === undefined)) {
      newFirstPass = score;
      newPassAttempts = newAttempts; // How many attempts until first pass
    }

    rSheet.getRange(playerRow, 2).setValue(newAttempts);      // 闯关次数
    rSheet.getRange(playerRow, 3).setValue(newTotal);          // 总分
    rSheet.getRange(playerRow, 4).setValue(newHigh);           // 最高分
    rSheet.getRange(playerRow, 5).setValue(newFirstPass);      // 第一次通关分数
    rSheet.getRange(playerRow, 6).setValue(newPassAttempts);   // 花了几次通关
    rSheet.getRange(playerRow, 7).setValue(timeStr);           // 最近游玩时间
  }

  // Build per-question details for client-side review
  var details = answers.map(function(a) {
    return {
      questionId: a.questionId,
      playerAnswer: String(a.answer).trim().toUpperCase(),
      correctAnswer: answerMap[a.questionId] || '?'
    };
  });

  return jsonResponse({
    score: score,
    total: total,
    passed: passed,
    details: details
  });
}

// ───────── Utility ─────────
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
