const base=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
export function ready(){return !!(base&&token)}
export async function redis(command){if(!ready())throw new Error("Order database is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");const r=await fetch(base.replace(/\/$/,""),{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(command),signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok||d.error)throw new Error("Order database request failed.");return d.result}
export const key=(id)=>"tenacity:order:"+id;
export async function getOrder(id){const raw=await redis(["GET",key(id)]);if(!raw)return null;try{return JSON.parse(raw)}catch{return null}}
export async function saveOrder(order){await redis(["SET",key(order.orderNumber),JSON.stringify(order),"EX",60*60*24*180]);return order}
export function orderNumber(){return "TL-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+Math.random().toString(36).slice(2,7).toUpperCase()}
export function json(res,status,data){res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(data)}
export function readBody(req){if(typeof req.body==="string"){try{return JSON.parse(req.body||"{}")}catch{return {}}}return req.body||{}}
