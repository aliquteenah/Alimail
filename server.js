const express=require("express");
const path=require("path");
const app=express();
const PORT=process.env.PORT||8080;
const API="https://www.1secmail.com/api/v1/";
app.use(express.static(__dirname));

async function api(params){
  const u=new URL(API);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
  try{
    const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"ALI-MAIL/1.0"},signal:c.signal});
    const text=await r.text();
    if(!r.ok)throw Error(`الخدمة الخارجية HTTP ${r.status}`);
    try{return JSON.parse(text)}catch{throw Error("استجابة غير صالحة من الخدمة الخارجية")}
  }finally{clearTimeout(t)}
}
app.get("/api/status",(req,res)=>res.json({success:true,service:"ALI MAIL",server:"online",time:new Date().toISOString()}));
app.get("/api/new",async(req,res)=>{
  try{
    const d=await api({action:"genRandomMailbox",count:"1"});
    if(!Array.isArray(d)||!d[0])throw Error("لم يتم إنشاء البريد");
    const [login,domain]=d[0].split("@");
    if(!login||!domain)throw Error("عنوان البريد غير صالح");
    res.json({success:true,email:d[0],login,domain});
  }catch(e){console.error(e);res.status(502).json({success:false,error:"تعذر إنشاء البريد المؤقت",details:e.name==="AbortError"?"انتهت مهلة الاتصال":e.message})}
});
app.get("/api/messages",async(req,res)=>{
  const {login,domain}=req.query;
  if(!login||!domain)return res.status(400).json({success:false,error:"بيانات البريد ناقصة"});
  try{const d=await api({action:"getMessages",login,domain});res.json({success:true,messages:Array.isArray(d)?d:[]})}
  catch(e){console.error(e);res.status(502).json({success:false,error:"تعذر جلب الرسائل",details:e.name==="AbortError"?"انتهت مهلة الاتصال":e.message})}
});
app.get("/api/message",async(req,res)=>{
  const {login,domain,id}=req.query;
  if(!login||!domain||!id)return res.status(400).json({success:false,error:"بيانات الرسالة ناقصة"});
  try{const d=await api({action:"readMessage",login,domain,id});res.json({success:true,message:d})}
  catch(e){console.error(e);res.status(502).json({success:false,error:"تعذر قراءة الرسالة",details:e.name==="AbortError"?"انتهت مهلة الاتصال":e.message})}
});
app.listen(PORT,"0.0.0.0",()=>console.log(`ALI MAIL running on http://127.0.0.1:${PORT}`));