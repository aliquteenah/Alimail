const express = require("express");
const https = require("https");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

const agent = new https.Agent({ rejectUnauthorized: false });

function fetchViaProxy(targetUrl) {
  return new Promise((resolve, reject) => {
    // تمرير الطلب عبر خادم وسيط لتجاوز حظر Render
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    
    const req = https.get(proxyUrl, { agent }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsedProxy = JSON.parse(data);
          if (parsedProxy.contents) {
            resolve(JSON.parse(parsedProxy.contents));
          } else {
            reject(new Error("استجابة البروكسي فارغة"));
          }
        } catch (e) {
          reject(new Error("فشل تحليل بيانات البروكسي"));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("انتهت مهلة الاتصال"));
    });
  });
}

app.get("/api/status", (req, res) => {
  res.json({ success: true, service: "ALI MAIL", server: "online" });
});

app.get("/api/new", async (req, res) => {
  try {
    const target = "https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1";
    const d = await fetchViaProxy(target);
    if (!Array.isArray(d) || !d[0]) throw Error("لم يتم إنشاء البريد");
    const [login, domain] = d[0].split("@");
    res.json({ success: true, email: d[0], login, domain });
  } catch (e) {
    console.error(e);
    res.status(502).json({ success: false, error: "تعذر إنشاء البريد", details: e.message });
  }
});

app.get("/api/messages", async (req, res) => {
  const { login, domain } = req.query;
  if (!login || !domain) return res.status(400).json({ success: false, error: "بيانات ناقصة" });
  try {
    const target = `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`;
    const d = await fetchViaProxy(target);
    res.json({ success: true, messages: Array.isArray(d) ? d : [] });
  } catch (e) {
    console.error(e);
    res.status(502).json({ success: false, error: "تعذر جلب الرسائل", details: e.message });
  }
});

app.get("/api/message", async (req, res) => {
  const { login, domain, id } = req.query;
  if (!login || !domain || !id) return res.status(400).json({ success: false, error: "بيانات ناقصة" });
  try {
    const target = `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${id}`;
    const d = await fetchViaProxy(target);
    res.json({ success: true, message: d });
  } catch (e) {
    console.error(e);
    res.status(502).json({ success: false, error: "تعذر قراءة الرسالة", details: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
