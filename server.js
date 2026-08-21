const express = require("express");
const path = require("path");
const https = require("https");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

function fetchGuerrilla(action, params = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL("https://api.guerrillamail.com/ajax.php");
    u.searchParams.set("f", action);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));

    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("استجابة غير صالحة من الخدمة"));
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

app.get("/api/new", async (req, res) => {
  try {
    const data = await fetchGuerrilla("get_email_address");
    if (!data.email_addr) throw Error("تعذر جلب البريد");
    
    const [login, domain] = data.email_addr.split("@");
    res.json({
      success: true,
      email: data.email_addr,
      login,
      domain,
      sid_token: data.sid_token
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({
      success: false,
      error: "تعذر إنشاء البريد المؤقت",
      details: e.message
    });
  }
});

app.get("/api/messages", async (req, res) => {
  const { sid_token } = req.query;
  try {
    const data = await fetchGuerrilla("check_email", { sid_token: sid_token || "", seq: "0" });
    const formattedMessages = (data.list || []).map((msg) => ({
      id: msg.mail_id,
      from: msg.mail_from,
      subject: msg.mail_subject,
      date: msg.mail_date
    }));
    
    res.json({ success: true, messages: formattedMessages });
  } catch (e) {
    console.error(e);
    res.status(502).json({
      success: false,
      error: "تعذر جلب الرسائل",
      details: e.message
    });
  }
});

app.get("/api/message", async (req, res) => {
  const { id, sid_token } = req.query;
  if (!id) return res.status(400).json({ success: false, error: "بيانات الرسالة ناقصة" });
  
  try {
    const data = await fetchGuerrilla("fetch_email", { email_id: id, sid_token: sid_token || "" });
    res.json({
      success: true,
      message: {
        id: data.mail_id,
        from: data.mail_from,
        subject: data.mail_subject,
        date: data.mail_date,
        body: data.mail_body,
        textBody: data.mail_excerpt
      }
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({
      success: false,
      error: "تعذر قراءة الرسالة",
      details: e.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ALI MAIL running on port ${PORT}`);
});
