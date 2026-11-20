import {ready,redis,orderNumber,json,readBody,bodyWithinLimit,rateLimit} from "./_lib/store.js";
function normalizePhone(v){let p=String(v||"").replace(/[\s()+-]/g,"");if(p.startsWith("0"))p="254"+p.slice(1);if(/^[17]\d{8}$/.test(p))p="254"+p;return /^254[17]\d{8}$/.test(p)?p:null}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});if(!bodyWithinLimit(req,16000))return json(res,413,{error:"Request is too large."});if(!ready())return json(res,503,{error:"Quotation service is temporarily unavailable. Please contact sales directly."});
 try{
  if(!await rateLimit(req,"quote",5,900))return json(res,429,{error:"Too many quotation requests. Please try again later."});
  const b=readBody(req),name=String(b.name||"").trim().replace(/\s+/g," ").slice(0,100),phone=normalizePhone(b.phone),email=String(b.email||"").trim().slice(0,120);
  const items=Array.isArray(b.items)?b.items.slice(0,30).map(x=>({name:String(x?.name||"").trim().replace(/[<>]/g,"").slice(0,140),quantity:Number(x?.quantity)})).filter(x=>x.name&&Number.isInteger(x.quantity)&&x.quantity>=1&&x.quantity<=999):[],notes=String(b.notes||"").trim().slice(0,1000);
  if(name.length<2||!phone||!items.length)return json(res,400,{error:"Enter your name, a valid Kenyan phone number and at least one product with a valid quantity."});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return json(res,400,{error:"Enter a valid email address."});
  if(!await rateLimit(req,"quote-phone",3,3600,phone))return json(res,429,{error:"This phone number has submitted several requests. Please contact sales."});
  const order={orderNumber:orderNumber(),type:"quotation",status:"quote_requested",customer:{name,phone,email},items,notes,amount:null,currency:"KES",payment:{status:"not_due"},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await redis(["SET","tenacity:order:"+order.orderNumber,JSON.stringify(order),"EX",15552000]);await redis(["LPUSH","tenacity:orders",order.orderNumber]);await redis(["LTRIM","tenacity:orders","0","999"]);
  return json(res,201,{success:true,orderNumber:order.orderNumber,status:order.status,message:"Your quotation request has been received. Keep this order number for tracking."});
 }catch(e){console.error("Quote create:",e.message);return json(res,503,{error:"We could not save your quotation. Please try again or contact sales."})}
}