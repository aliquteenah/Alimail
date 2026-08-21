const express = require("express");
const path = require("path");
const https = require("https");
const app = express();
const PORT = process.env.PORT || 8080;

const API_BASE = "https://www.1secmail.com/api/v1/";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

app.use(express.static(__dirname));

function api(params) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_BASE);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));

    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      agent: httpsAgent,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`الخدمة الخارجية HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("استجابة غير صالحة من الخدمة الخارجية"));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("AbortError"));
    });
    req.end();
  });
}

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    service: "ALI MAIL",
    server: "online",
    time: new Date().toISOString()
  });
});

// إنشاء بريد مع جلب النطاقات النشطة لمنع حظر الرسائل
app.get("/api/new", async (req, res) => {
  try {
    const d = await api({ action: "genRandomMailbox", count: "1" });
    if (!Array.isArray(d) || !d[0]) throw Error("لم يتم إنشاء البريد");
    const [login, domain] = d[0].split("@");
    if (!login || !domain) throw Error("عنوان البريد غير صالح");
    res.json({ success: true, email: d[0], login, domain });
  } catch (e) {
    console.error(e);
    res.status(502).json({
      success: false,
      error: "تعذر إنشاء البريد المؤقت",
      details: e.message === "AbortError" ? "انتهت مهلة الاتصال" : e.message
    });
  }
});

// جلب صندوق الرسائل مع معالجة حقول المرسل والعنوان
app.get("/api/messages", async (req, res) => {
  const { login, domain } = req.query;
  if (!login || !domain) return res.status(400).json({ success: false, error: "بيانات البريد ناقصة" });
  try {
    const d = await api({ action: "getMessages", login, domain });
    res.json({ success: true, messages: Array.isArray(d) ? d : [] });
  } catch (e) {
    console.error(e);
    res.status(502).json({
      success: false,
      error: "تعذر جلب الرسائل",
      details: e.message === "AbortError" ? "انتهت مهلة الاتصال" : e.message
    });
  }
});

// قراءة تفاصيل الرسالة
app.get("/api/message", async (req, res) => {
  const { login, domain, id } = req.query;
  if (!login || !domain || !id) return res.status(400).json({ success: false, error: "بيانات الرسالة ناقصة" });
  try {
    const d = await api({ action: "readMessage", login, domain, id });
    res.json({ success: true, message: d });
  } catch (e) {
    console.error(e);
    res.status(502).json({
      success: false,
      error: "تعذر قراءة الرسالة",
      details: e.message === "AbortError" ? "انتهت مهلة الاتصال" : e.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ALI MAIL running on port ${PORT}`);
});
