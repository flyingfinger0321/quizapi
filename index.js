require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

// ====== 基本設定 ======
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// ====== 讀取題目資料庫 ======
// questions.json 格式: { "00001": { "image": "圖片網址", "answer": "正確答案" }, ... }
const questionsPath = path.join(__dirname, 'questions.json');
function loadQuestions() {
  return JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
}

// ====== 答錯回覆語句庫(可以一直往裡面加) ======
const WRONG_REPLIES = [
  '別給我臭酸掉的腦細胞!退貨!!!💩',
  '你是麻瓜嗎?蛤??🍈',
];

// ====== 答對回覆語句(可自行改成多句隨機,寫法跟答錯一樣) ======
const CORRECT_REPLIES = [
  '答對了!🎉',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 判斷使用者輸入是「單純題號」還是「題號+答案」
// 例如: "00001" -> 叫圖片 / "00001 香蕉" 或 "00001香蕉" -> 判斷答案
function parseInput(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{5})\s*(.*)$/);
  if (!match) return null;
  const [, code, rest] = match;
  return { code, rest: rest.trim() };
}

// ====== Webhook 進入點 ======
// 注意: line.middleware 會自動驗證簽章,一定要放在 express.json() 之前
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const text = event.message.text;
  const parsed = parseInput(text);

  // 不符合「五碼題號開頭」格式的訊息,完全不處理、不回覆
  // (避免使用者聊天講其他話時被誤判成答錯)
  if (!parsed) return Promise.resolve(null);

  const { code, rest } = parsed;
  const questions = loadQuestions();
  const question = questions[code];

  // 題號根本不存在,不回覆(避免誤判)
  if (!question) return Promise.resolve(null);

  // 情況一:只有輸入題號 -> 回傳題目圖片
  if (rest === '') {
    return client.replyMessage(event.replyToken, {
      type: 'image',
      originalContentUrl: question.image,
      previewImageUrl: question.image,
    });
  }

  // 情況二:題號 + 「提示」關鍵字 -> 回傳提示內容
if (rest === '提示') {
  if (!question.hint) return Promise.resolve(null); // 沒設定提示就不回應
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: question.hint,
  });
}

// 情況三:題號 + 答案 -> 判斷對錯
  const isCorrect =
    rest.toLowerCase() === String(question.answer).trim().toLowerCase();

  if (isCorrect) {
  const replyText = question.correctReply || pickRandom(CORRECT_REPLIES);
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
  } else {
    // 答錯:從答錯語句庫隨機挑一句
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: pickRandom(WRONG_REPLIES),
    });
  }
}

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('LINE quiz bot is running.'));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
