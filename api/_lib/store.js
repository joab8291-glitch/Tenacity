const base=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
const crypto=require("node:crypto");
function ready(){return !!(base&&token)}
function safeMessage(v){return String(v||"").replace(/[\r\n\t]/g," ").slice(0,240)}
async function redis(command){
 if(!ready())throw new Error("Order database is not configured.");
 let endpoint;try{endpoint=new URL(base);if(endpoint.protocol!=="https:")throw Error()}catch{throw new Error("Order database URL is invalid.")}
 let response;try{const u=endpoint.toString();response=await fetch(u.endsWith("/")?u.slice(0,-1):u,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(command),signal:AbortSignal.timeout(12000)})}catch(e){console.error("Upstash connection failed:",safeMessage(e?.message));throw new Error("Order database could not be reached.")}
 const raw=await response.text();let data;try{data=raw?JSON.parse(raw):{}}catch{throw new Error("Order database returned an invalid response.")}
 if(!response.ok||data?.error||!Object.prototype.hasOwnProperty.call(data,"result")){console.error("Upstash request failed:",response.status,safeMessage(data?.error||data?.message));throw new Error("Order database request failed.")}
 return data.result;
}
const key=id=>"tenacity:order:"+id;
async function getOrder(id){const raw=await redis(["GET",key(id)]);if(!raw)return null;try{return JSON.parse(raw)}catch{console.error("Invalid stored order:",safeMessage(id));return null}}
async function saveOrder(o){await redis(["SET",key(o.orderNumber),JSON.stringify(o),"EX",15552000]);return o}
function orderNumber(){return "TL-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+crypto.randomInt(36**5).toString(36).toUpperCase().padStart(5,"0")}
function json(res,status,data){res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");res.setHeader("Pragma","no-cache");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(data)}
function readBody(req){if(typeof req.body==="string"){try{return JSON.parse(req.body||"{}")}catch{return {}}}return req.body&&typeof req.body==="object"?req.body:{}}
function bodyWithinLimit(req,max=32768){const n=Number(req.headers?.["content-length"]||0);if(n>max)return false;try{return Buffer.byteLength(typeof req.body==="string"?req.body:JSON.stringify(req.body||{}),"utf8")<=max}catch{return false}}
function clientIp(req){const h=req.headers?.["x-vercel-forwarded-for"]||req.headers?.["x-forwarded-for"]||req.socket?.remoteAddress||"unknown";return String(Array.isArray(h)?h[0]:h).split(",")[0].trim().slice(0,100)||"unknown"}
async function rateLimit(req,scope,limit,seconds,subject="ip"){const id=subject==="ip"?clientIp(req):String(subject),hash=crypto.createHash("sha256").update(id).digest("hex").slice(0,32),k="tenacity:rl:"+scope+":"+hash,n=Number(await redis(["INCR",k]));if(n===1)await redis(["EXPIRE",k,seconds]);return n<=limit}
module.exports={ready,redis,key,getOrder,saveOrder,orderNumber,json,readBody,bodyWithinLimit,rateLimit,clientIp};
