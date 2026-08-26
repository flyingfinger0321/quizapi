# LINE 解謎遊戲機器人

處理三件事,全部整合在同一支 Webhook 裡,避免衝突:
1. 輸入 `00001`(純題號)→ 回傳題目圖片
2. 輸入 `00001答案` → 判斷對錯
3. 答錯 → 從 `WRONG_REPLIES` 隨機挑一句回覆(絕對不會在答對時觸發)

## 檔案說明
- `index.js`:主程式邏輯
- `questions.json`:題庫,格式 `{ "題號": { "image": "圖片網址", "answer": "正確答案" } }`,要加新題目直接加在這裡就好
- 答錯語句在 `index.js` 裡的 `WRONG_REPLIES` 陣列,要加句子直接往裡面加一行

## 部署步驟(以 Render.com 為例,有免費方案,不用信用卡)

1. 到 https://render.com 註冊帳號
2. 把這個資料夾上傳到一個 GitHub repo(或用 Render 的「Upload」功能,如果不熟 GitHub 可以先問我)
3. 在 Render 點「New +」→「Web Service」,選你的 repo
4. Build Command 填 `npm install`,Start Command 填 `npm start`
5. 到「Environment」分頁,新增兩個環境變數:
   - `CHANNEL_ACCESS_TOKEN`
   - `CHANNEL_SECRET`
   (這兩個值下一步教你去哪裡拿)
6. 部署完成後,Render 會給你一個網址,例如 `https://your-app.onrender.com`

## 到 LINE Developers Console 設定(這步才是你說的「貼連結」)

**注意:這裡是 LINE Developers Console(developers.line.biz),不是 LINE Official Account Manager(官方帳號後台)。這是兩個不同的網站,很多人會搞混。**

1. 前往 https://developers.line.biz/console/ 登入,選你的 Provider → 選你的 Channel(你的 Messaging API 頻道)
2. 在「Basic settings」分頁,找到:
   - `Channel secret` → 複製起來,填進 Render 的 `CHANNEL_SECRET`
3. 切到「Messaging API」分頁:
   - 找到 `Channel access token`,按 Issue(發行)產生一組長字串 → 複製起來,填進 Render 的 `CHANNEL_ACCESS_TOKEN`
   - 往下找到 `Webhook settings`,在 `Webhook URL` 欄位貼上:
     ```
     https://your-app.onrender.com/webhook
     ```
     (記得結尾要加 `/webhook`,這是我程式裡設定的路徑)
   - 按 `Verify`,應該要顯示成功
   - 把 `Use webhook` 這個開關打開(這一步最容易漏掉)

## 一定要做的最後一步:關掉舊的自動回應,避免衝突

回到 **LINE Official Account Manager**(官方帳號後台,manager.line.biz):
1. 左側選單找「設定」→「回應設定」(或「Response settings」)
2. 把 **「自動回應訊息」關掉**
3. 確認「Webhook」是開啟的(跟上面 Developers Console 開的是同一個開關,兩邊會同步)

這樣一來,所有訊息就只會經過你這支程式處理,不會有兩邊搶著回覆、導致答對了還跳出答錯訊息的狀況。

## 之後要加題目 / 加答錯句子

- 加題目:編輯 `questions.json`,照格式加一組新的題號進去
- 加答錯句子:編輯 `index.js` 裡的 `WRONG_REPLIES` 陣列,加一行字串進去
- 改完後重新 push 到 GitHub,Render 會自動重新部署

## 本地測試(選用)

```bash
npm install
cp .env.example .env   # 填入你的兩把金鑰
npm start
```

本地測試時 LINE 連不到 localhost,如果想在正式上線前先測,可以用 [ngrok](https://ngrok.com) 開一個公開的暫時網址代替 Render。
