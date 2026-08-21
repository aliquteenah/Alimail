const express = require("express");
const https = require("https");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

// وكيل يتجاوز حظر القيود والشهادات
const agent = new https.Agent({ rejectUnauthorized: false });

// قائمة السيرفرات البديلة المتاحة لنفس الخدمة
const MIRRORS = [
  "https://www.1secmail.com/api/v1/",
  "https://www.1secmail.org/api/v1/",
  "https://www.1secmail.net/api/v1/"
];

function requestApi(apiUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(apiUrl);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      agent: agent,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("JSON Parse Error"));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

// دالة تجربة المصادر التلقائية
async function fetchWithFallback(params) {
  for (const mirror of MIRRORS) {
    try {
      const u = new URL(mirror);
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      const result = await requestApi(u.href);
      return result;
    } catch (e) {
      // التجربة على السيرفر التالي
    }
  }
  throw new Error("تعذر الاتصال بجميع الخوادم المتاحة");
}

app.get("/api/status", (req, res) => {
  res.json({ success: true, service: "ALI MAIL", server: "online" });
});

app.get("/api/new", async (req, res) => {
  try {
    const d = await fetchWithFallback({ action: "genRandomMailbox", count: "1" });
    if (!Array.isArray(d) || !d[0]) throw Error("لم يتم التوليد");
    const [login, domain] = d[0].split("@");
    res.json({ success: true, email: d[0], login, domain });
  } catch (e) {
    res.status(502).json({ success: false, error: "تعذر إنشاء البريد", details: e.message });
  }
});

app.get("/api/messages", async (req, res) => {
  const { login, domain } = req.query;
  if (!login || !domain) return res.status(400).json({ success: false, error: "بيانات ناقصة" });
  try {
    const d = await fetchWithFallback({ action: "getMessages", login, domain });
    res.json({ success: true, messages: Array.isArray(d) ? d : [] });
  } catch (e) {
    res.status(502).json({ success: false, error: "تعذر جلب الرسائل", details: e.message });
  }
});

app.get("/api/message", async (req, res) => {
  const { login, domain, id } = req.query;
  if (!login || !domain || !id) return res.status(400).json({ success: false, error: "بيانات ناقصة" });
  try {
    const d = await fetchWithFallback({ action: "readMessage", login, domain, id });
    res.json({ success: true, message: d });
  } catch (e) {
    res.status(502).json({ success: false, error: "تعذر قراءة الرسالة", details: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server ready on port ${PORT}`));
