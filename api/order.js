import {getOrder,json,rateLimit} from "./_lib/store.js";
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"Method not allowed"});
 try{
  if(!await rateLimit(req,"order-lookup",30,300))return json(res,429,{error:"Too many tracking attempts. Please wait and try again."});
  const id=String(req.query?.orderNumber||"").trim().toUpperCase();if(!/^TL-[0-9]{6}-[A-Z0-9]{5}$/.test(id))return json(res,400,{error:"Enter a valid order number."});
  const o=await getOrder(id);if(!o)return json(res,404,{error:"We couldn't find that order number."});
  return json(res,200,{orderNumber:o.orderNumber,status:o.status,amount:o.amount,currency:o.currency,items:o.items,createdAt:o.createdAt,updatedAt:o.updatedAt,paymentStatus:o.payment?.status||"not_due",paymentReceipt:o.payment?.receipt||null,paymentConfirmedAt:o.payment?.confirmedAt||null,message:o.status==="approved"?"Your quotation is approved. You can proceed to pay for this order.":o.status==="paid"?"Payment confirmed. Thank you.":o.status==="rejected"?"The team could not approve this request. Please contact sales.":"Your request is being reviewed by our team."});
 }catch(e){console.error("Order lookup:",e.message);return json(res,503,{error:"Order tracking is temporarily unavailable."})}
}