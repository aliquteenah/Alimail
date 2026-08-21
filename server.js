const express = require("express");
const https = require("https");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

function requestMailTm(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.mail.tm",
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    };

    if (payload) {
      options.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error("خطأ في معالجة الاستجابة"));
        }
      });
    });

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

app.get("/api/status", (req, res) => {
  res.json({ success: true, service: "ALI MAIL", server: "online" });
});

// إنشاء بريد مؤقت جديد عبر Mail.tm
app.get("/api/new", async (req, res) => {
  try {
    // 1. جلب النطاقات المتاحة
    const domains = await requestMailTm("/domains");
    const domainList = domains["hydra:member"] || domains;
    if (!domainList || domainList.length === 0) throw new Error("لا توجد نطاقات متاحة");
    
    const activeDomain = domainList[0].domain;
    const randomUser = "ali_" + Math.random().toString(36).substring(2, 10);
    const fullEmail = `${randomUser}@${activeDomain}`;
    const password = "Password123!";

    // 2. إنشاء الحساب
    await requestMailTm("/accounts", "POST", { address: fullEmail, password });

    // 3. الحصول على رمز التوثيق (Token)
    const tokenData = await requestMailTm("/token", "POST", { address: fullEmail, password });

    res.json({
      success: true,
      email: fullEmail,
      login: randomUser,
      domain: activeDomain,
      token: tokenData.token
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ success: false, error: "تعذر إنشاء البريد", details: e.message });
  }
});

// جلب الرسائل
app.get("/api/messages", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.json({ success: true, messages: [] });

  try {
    const options = {
      hostname: "api.mail.tm",
      path: "/messages",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0"
      }
    };

    const req = https.request(options, (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const rawMsgs = parsed["hydra:member"] || [];
          const messages = rawMsgs.map((m) => ({
            id: m.id,
            from: m.from.address,
            subject: m.subject,
            date: m.createdAt
          }));
          res.json({ success: true, messages });
        } catch {
          res.json({ success: true, messages: [] });
        }
      });
    });

    req.on("error", () => res.json({ success: true, messages: [] }));
    req.end();
  } catch (e) {
    res.json({ success: true, messages: [] });
  }
});

// قراءة الرسالة
app.get("/api/message", async (req, res) => {
  const { id, token } = req.query;
  if (!id || !token) return res.status(400).json({ success: false, error: "بيانات ناقصة" });

  try {
    const options = {
      hostname: "api.mail.tm",
      path: `/messages/${id}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0"
      }
    };

    const req = https.request(options, (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        try {
          const m = JSON.parse(data);
          res.json({
            success: true,
            message: {
              id: m.id,
              from: m.from.address,
              subject: m.subject,
              date: m.createdAt,
              body: m.html ? m.html[0] : m.text,
              textBody: m.text
            }
          });
        } catch (e) {
          res.status(502).json({ success: false, error: "فشل تحليل الرسالة" });
        }
      });
    });

    req.on("error", (e) => res.status(502).json({ success: false, error: e.message }));
    req.end();
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
