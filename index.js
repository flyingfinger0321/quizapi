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
// questions.json 格式: { "00001": { "image": "圖片網址", "answer": "正確答案", "author": "作者", "rating": 9 }, ... }
const questionsPath = path.join(__dirname, 'questions.json');
function loadQuestions() {
  return JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
}
 
// ====== 答錯回覆語句庫(可以一直往裡面加) ======
const WRONG_REPLIES = [
  '別給我臭酸掉的腦細胞!退貨!!!💩',
  '你是麻瓜嗎?蛤??🍈',
  '睜大你的雙眼!👁️👁️用不到就捐出來!',
  '你答錯是為了解鎖我的罵人詞彙嗎蛤???門都沒有!🚪',
  '照你的回答來看，你大概是要在此地化成白骨了💀',
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
 
// 把題號依數字排序,回傳排好的字串陣列
function sortedCodes(codes) {
  return codes.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
 
// 依題號清單組出要回覆的文字
function formatCodeList(title, codes) {
  if (codes.length === 0) {
    return `${title}\n目前沒有符合的題目喔`;
  }
  const lines = sortedCodes(codes).map((c) => `・${c}`);
  return `${title}(共 ${codes.length} 題)\n${lines.join('\n')}`;
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
 
  const text = event.message.text.trim();
  const questions = loadQuestions();
 
  // ====== 指令一:抽X星 -> 從該星等題目中隨機抽一題,直接出圖 ======
  const drawMatch = text.match(/^抽(\d{1,2})星$/);
  if (drawMatch) {
    const rating = Number(drawMatch[1]);
    const codes = Object.keys(questions).filter(
      (code) => Number(questions[code].rating) === rating
    );
    if (codes.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `目前沒有 ${rating} 星的題目喔`,
      });
    }
    const pickedCode = pickRandom(codes);
    const picked = questions[pickedCode];
    return client.replyMessage(event.replyToken, {
      type: 'image',
      originalContentUrl: picked.image,
      previewImageUrl: picked.image,
    });
  }
 
  // ====== 指令二:X星 -> 列出該星等的所有題號 ======
  const ratingMatch = text.match(/^(\d{1,2})星$/);
  if (ratingMatch) {
    const rating = Number(ratingMatch[1]);
    const codes = Object.keys(questions).filter(
      (code) => Number(questions[code].rating) === rating
    );
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: formatCodeList(`⭐ ${rating} 星題目`, codes),
    });
  }
 
  // ====== 指令三:作者(類別)名稱 -> 列出該作者的所有題號 ======
  // 只要文字完全等於某個題目的 author 欄位,就視為查目錄指令
  const allAuthors = new Set(
    Object.values(questions)
      .map((q) => q.author)
      .filter(Boolean)
  );
  if (allAuthors.has(text)) {
    const codes = Object.keys(questions).filter(
      (code) => questions[code].author === text
    );
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: formatCodeList(`📁 ${text} 的題目`, codes),
    });
  }
 
  // ====== 指令四(原本邏輯):題號 / 題號+提示 / 題號+答案 ======
  const parsed = parseInput(text);
 
  // 不符合任何指令格式,完全不處理、不回覆
  // (避免使用者聊天講其他話時被誤判成答錯)
  if (!parsed) return Promise.resolve(null);
 
  const { code, rest } = parsed;
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