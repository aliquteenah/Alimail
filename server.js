const express = require("express");
const https = require("https");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

const tokenStore = new Map();

function requestMailTm(path, method = "GET", body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };

    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const options = {
      hostname: "api.mail.tm",
      path: path,
      method: method,
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
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

app.get("/api/new", async (req, res) => {
  try {
    const domains = await requestMailTm("/domains");
    const domainList = domains["hydra:member"] || domains;
    if (!domainList || domainList.length === 0) throw new Error("لا توجد نطاقات متاحة");

    const activeDomain = domainList[0].domain;
    const randomUser = "ali_" + Math.random().toString(36).substring(2, 10);
    const fullEmail = `${randomUser}@${activeDomain}`;
    const password = "Password123!";

    await requestMailTm("/accounts", "POST", { address: fullEmail, password });
    const tokenData = await requestMailTm("/token", "POST", { address: fullEmail, password });

    if (tokenData && tokenData.token) {
      tokenStore.set(fullEmail.toLowerCase(), tokenData.token);
      tokenStore.set(randomUser.toLowerCase(), tokenData.token);
    }

    res.json({
      success: true,
      email: fullEmail,
      login: randomUser,
      domain: activeDomain
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ success: false, error: "تعذر إنشاء البريد", details: e.message });
  }
});

app.get("/api/messages", async (req, res) => {
  const { login, domain } = req.query;
  if (!login || !domain) return res.json({ success: true, messages: [] });

  const fullEmail = `${login}@${domain}`.toLowerCase();
  const token = tokenStore.get(fullEmail) || tokenStore.get(login.toLowerCase());

  if (!token) return res.json({ success: true, messages: [] });

  try {
    const parsed = await requestMailTm("/messages", "GET", null, token);
    const rawMsgs = parsed["hydra:member"] || [];

    // جلب التفاصيل الكاملة لكل رسالة تلقائياً لدعم الواجهة
    const fullMessages = await Promise.all(
      rawMsgs.map(async (m) => {
        try {
          const detail = await requestMailTm(`/messages/${m.id}`, "GET", null, token);
          const bodyContent = detail.intro || (Array.isArray(detail.html) && detail.html[0]) || detail.text || "";
          const sender = detail.from?.address || m.from?.address || "مرسل مجهول";

          return {
            id: m.id,
            from: sender,
            subject: detail.subject || m.subject || "بدون عنوان",
            date: detail.createdAt || m.createdAt,
            intro: bodyContent,
            body: bodyContent,
            textBody: detail.text || bodyContent,
            html: bodyContent
          };
        } catch {
          return {
            id: m.id,
            from: m.from?.address || "مرسل مجهول",
            subject: m.subject || "بدون عنوان",
            date: m.createdAt,
            intro: m.intro || "",
            body: m.intro || "",
            textBody: m.intro || ""
          };
        }
      })
    );

    res.json({ success: true, messages: fullMessages });
  } catch (e) {
    res.json({ success: true, messages: [] });
  }
});

app.get("/api/message", async (req, res) => {
  const { id, login, domain } = req.query;
  if (!id) return res.status(400).json({ success: false, error: "بيانات ناقصة" });

  const fullEmail = `${login}@${domain}`.toLowerCase();
  const token = tokenStore.get(fullEmail) || tokenStore.get(login.toLowerCase());

  try {
    const m = await requestMailTm(`/messages/${id}`, "GET", null, token);
    const bodyContent = (Array.isArray(m.html) && m.html[0]) || m.text || m.intro || "لا يوجد محتوى للرسالة";
    const sender = m.from?.address || "مرسل مجهول";

    res.json({
      success: true,
      message: {
        id: m.id,
        from: sender,
        subject: m.subject || "بدون عنوان",
        date: m.createdAt || new Date().toISOString(),
        body: bodyContent,
        textBody: m.text || m.intro || bodyContent,
        html: bodyContent
      }
    });
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
