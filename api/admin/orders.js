import crypto from "node:crypto";
import {redis,getOrder,saveOrder,json,readBody,bodyWithinLimit,rateLimit} from "../_lib/store.js";
function authorized(req){const expected=process.env.TENACITY_ORDER_ADMIN_TOKEN,raw=req.headers?.authorization,supplied=String(Array.isArray(raw)?raw[0]||"":raw||"").replace(/^Bearer\s+/i,"").trim();if(typeof expected!=="string"||Buffer.byteLength(expected)<32||!supplied)return false;const a=Buffer.from(expected),b=Buffer.from(supplied);return a.length===b.length&&crypto.timingSafeEqual(a,b)}
export default async function handler(req,res){
 if(!["GET","PATCH","DELETE"].includes(req.method))return json(res,405,{error:"Method not allowed"});
 try{
  // Count every attempt before checking credentials so invalid tokens cannot be brute-forced
  // without consuming the same shared, IP-scoped Redis limit as authenticated requests.
  if(!await rateLimit(req,"admin-auth",20,900))return json(res,429,{error:"Too many access attempts. Wait 15 minutes before trying again."});
  if(!authorized(req))return json(res,401,{error:"Unauthorized"});
  if(!await rateLimit(req,"admin",180,300))return json(res,429,{error:"Too many admin requests. Wait and retry."});
  if(req.method!=="GET"&&!bodyWithinLimit(req,12000))return json(res,413,{error:"Request is too large."});
  if(req.method==="GET"){const ids=await redis(["LRANGE","tenacity:orders","0","99"]),orders=await Promise.all((ids||[]).map(getOrder));return json(res,200,{orders:orders.filter(Boolean)})}
  const b=readBody(req),id=String(b.orderNumber||"").trim().toUpperCase();if(!/^TL-[0-9]{6}-[A-Z0-9]{5}$/.test(id))return json(res,400,{error:"Enter a valid order number."});
  const o=await getOrder(id);if(!o)return json(res,404,{error:"Order not found"});
  if(req.method==="DELETE"){await redis(["DEL","tenacity:order:"+id]);await redis(["LREM","tenacity:orders","0",id]);return json(res,200,{success:true,deleted:id})}
  if(!["approved","rejected","fulfilled"].includes(b.status))return json(res,400,{error:"Invalid status"});
  if(b.status==="approved"){const amount=Number(b.amount);if(!Number.isSafeInteger(amount)||amount<1||amount>250000)return json(res,400,{error:"Set a valid whole-number KES amount."});if(o.payment?.status==="confirmed")return json(res,409,{error:"A paid order cannot be re-approved."});o.amount=amount;o.status="approved";o.payment={...o.payment,status:"pending"}}
  else{if(o.payment?.status==="confirmed"&&b.status!=="fulfilled")return json(res,409,{error:"A paid order cannot be rejected."});o.status=b.status}
  o.adminNote=String(b.adminNote||"").trim().slice(0,500);o.updatedAt=new Date().toISOString();await saveOrder(o);return json(res,200,{success:true,order:o});
 }catch(e){console.error("Admin orders:",e?.message||e);return json(res,503,{error:"Order management unavailable. Try again shortly."})}
}