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
 
// ====== 讀取「保留給 LINE 自動回應」的關鍵字清單 ======
// reserved-keywords.json 格式: ["選單", "說明", ...]
// 這裡面的字,程式會完全不理、不回應,讓 LINE 官方帳號後台自己的自動回應去處理。
// 之後在 LINE 後台新增/刪除關鍵字時,回來這裡同步加一筆或刪一筆字串就好。
const reservedKeywordsPath = path.join(__dirname, 'reserved-keywords.json');
function loadReservedKeywords() {
  try {
    return new Set(JSON.parse(fs.readFileSync(reservedKeywordsPath, 'utf8')));
  } catch (err) {
    // 檔案不存在或格式錯誤時,當作沒有排除清單,避免整支程式掛掉
    console.error('讀取 reserved-keywords.json 失敗:', err.message);
    return new Set();
  }
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
 
// ====== 完全看不懂的輸入(不符合任何指令)時的萬用回覆 ======
// 注意:因為官方帳號後台的「自動回應訊息」已經關掉了,
// 所有訊息都會進到這支程式,所以這裡可以放心直接回覆,不用做任何計時判斷。
const NO_MATCH_REPLIES = [
  '你在說什麼呢?我這裡只聽得懂題號跟指令喔🤔',
  '嗯?打錯格式了吧,再檢查一下你打的東西😏',
  '本王聽不懂人類的語言,麻煩打正確的題號或指令🦹',
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
 
// 把題號依數字排序
function sortedCodes(codes) {
  return [...codes].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
 
// 陣列切成每 chunkSize 一組
function chunkArray(arr, chunkSize) {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}
 
// ====== 把題號清單組成「點了會自動送出訊息」的 Flex 清單,每列左側附縮圖 ======
// 每 12 題一張卡片(因為多了縮圖,一列比較高,一張卡片放太多題會太長)
// 超過 12 題會自動變成可以左右滑動的多張卡片(carousel)
function buildCodeListFlexMessage(title, codes, questions) {
  const sorted = sortedCodes(codes);
 
  // 沒有符合的題目,直接回純文字就好,不用做清單
  if (sorted.length === 0) {
    return {
      type: 'text',
      text: `${title}\n目前沒有符合的題目喔`,
    };
  }
 
  const chunks = chunkArray(sorted, 12);
 
  // 每一列:左側縮圖 + 右側題號文字,整列都可以點,點了直接送出該題號
  const buildRow = (code) => {
    const q = questions[code] || {};
    // 縮圖優先用 thumbnail 欄位(如果有另外設定小圖的話),沒有就用題目本身的 image
    const thumbUrl = q.thumbnail || q.image;
 
    const contents = [];
    if (thumbUrl) {
      contents.push({
        type: 'image',
        url: thumbUrl,
        size: '50px',
        aspectMode: 'cover',
        aspectRatio: '1:1',
        flex: 0,
      });
    }
    contents.push({
      type: 'text',
      text: code,
      gravity: 'center',
      flex: 1,
      size: 'md',
      weight: 'bold',
      margin: 'md',
    });
 
    return {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: '#F5F5F5',
      cornerRadius: 'md',
      paddingAll: 'sm',
      alignItems: 'center',
      action: {
        type: 'message',
        text: code,
      },
      contents,
    };
  };
 
  const buildBubble = (chunk, idx, total) => ({
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: total > 1 ? `${title} (${idx + 1}/${total})` : title,
          weight: 'bold',
          size: 'md',
          wrap: true,
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: chunk.map(buildRow),
    },
  });
 
  const bubbles = chunks.map((chunk, idx) => buildBubble(chunk, idx, chunks.length));
 
  return {
    type: 'flex',
    altText: `${title}(共 ${sorted.length} 題)`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  };
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
 
  // ====== 排除清單:這些字保留給 LINE 官方帳號後台的自動回應處理,本程式完全不回應 ======
  const reservedKeywords = loadReservedKeywords();
  if (reservedKeywords.has(text)) {
    return Promise.resolve(null);
  }
 
  const questions = loadQuestions();
  const allCodes = Object.keys(questions);
 
  // ====== 指令:抽題 -> 從「全部題目」中隨機抽一題,直接出圖 ======
  if (text === '抽題') {
    if (allCodes.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '題庫目前是空的喔',
      });
    }
    const pickedCode = pickRandom(allCodes);
    const picked = questions[pickedCode];
    return client.replyMessage(event.replyToken, {
      type: 'image',
      originalContentUrl: picked.image,
      previewImageUrl: picked.image,
    });
  }
 
  // ====== 指令:抽X星 -> 從該星等題目中隨機抽一題,直接出圖 ======
  const drawMatch = text.match(/^抽(\d{1,2})星$/);
  if (drawMatch) {
    const rating = Number(drawMatch[1]);
    const codes = allCodes.filter((code) => Number(questions[code].rating) === rating);
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
 
  // ====== 指令:X星 -> 列出該星等的所有題號(點了直接送出題號) ======
  const ratingMatch = text.match(/^(\d{1,2})星$/);
  if (ratingMatch) {
    const rating = Number(ratingMatch[1]);
    const codes = allCodes.filter((code) => Number(questions[code].rating) === rating);
    return client.replyMessage(
      event.replyToken,
      buildCodeListFlexMessage(`⭐ ${rating} 星題目`, codes, questions)
    );
  }
 
  // ====== 指令:作者(類別)名稱 -> 列出該作者的所有題號 ======
  const allAuthors = new Set(
    Object.values(questions)
      .map((q) => q.author)
      .filter(Boolean)
  );
  if (allAuthors.has(text)) {
    const codes = allCodes.filter((code) => questions[code].author === text);
    return client.replyMessage(
      event.replyToken,
      buildCodeListFlexMessage(`📁 ${text} 的題目`, codes, questions)
    );
  }
 
  // ====== 題號 / 題號+提示 / 題號+答案 ======
  const parsed = parseInput(text);
 
  if (parsed) {
    const { code, rest } = parsed;
    const question = questions[code];
 
    if (question) {
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
        if (question.hint) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: question.hint,
          });
        }
        // 沒設定提示,走到下面的「看不懂」萬用回覆
      } else {
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
    }
  }
 
  // ====== 以上都不符合 -> 完全看不懂,隨機回一句萬用回覆 ======
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: pickRandom(NO_MATCH_REPLIES),
  });
}
 
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('LINE quiz bot is running.'));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});