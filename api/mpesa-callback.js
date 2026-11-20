import {getOrder,saveOrder,json,readBody,redis,bodyWithinLimit} from "./_lib/store.js";
function callbackPhone(v){const p=String(v||"");return /^254[17]\d{8}$/.test(p)?p:null}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{ResultCode:1,ResultDesc:"Method not allowed"});if(!bodyWithinLimit(req,16000))return json(res,413,{ResultCode:1,ResultDesc:"Payload too large"});
 const s=readBody(req)?.Body?.stkCallback;if(!s?.CheckoutRequestID||typeof s.CheckoutRequestID!=="string")return json(res,200,{ResultCode:0,ResultDesc:"Accepted"});
 try{
  const raw=await redis(["GET","tenacity:checkout:"+s.CheckoutRequestID]);if(!raw)return json(res,200,{ResultCode:0,ResultDesc:"Unmatched callback acknowledged"});
  const mapping=JSON.parse(raw),o=await getOrder(mapping.orderNumber);if(!o)return json(res,200,{ResultCode:0,ResultDesc:"Order not found; acknowledged"});
  if(o.payment?.checkoutRequestId!==s.CheckoutRequestID||o.payment?.merchantRequestId!==mapping.merchantRequestId||s.MerchantRequestID!==mapping.merchantRequestId)return json(res,200,{ResultCode:0,ResultDesc:"Callback reference mismatch; acknowledged"});
  if(o.payment?.status==="confirmed"||o.status==="paid")return json(res,200,{ResultCode:0,ResultDesc:"Already processed"});
  if(Number(s.ResultCode)===0){
   const meta=Object.fromEntries((s.CallbackMetadata?.Item||[]).map(x=>[x.Name,x.Value])),paid=Number(meta.Amount),receipt=String(meta.MpesaReceiptNumber||""),p=callbackPhone(meta.PhoneNumber);
   if(paid===Number(o.amount)&&/^[A-Z0-9]{8,16}$/.test(receipt)&&p===o.payment?.phone){o.status="paid";o.payment={status:"confirmed",receipt,amount:paid,phone:p,confirmedAt:new Date().toISOString(),checkoutRequestId:s.CheckoutRequestID}}
   else{o.payment={...o.payment,status:"amount_mismatch",reportedAmount:Number.isFinite(paid)?paid:null,receipt:receipt||null,failedAt:new Date().toISOString()}}
  }else{o.payment={...o.payment,status:"failed",failureCode:String(s.ResultCode).slice(0,20),failureReason:String(s.ResultDesc||"Payment was not completed").slice(0,180)}}
  o.updatedAt=new Date().toISOString();await saveOrder(o);return json(res,200,{ResultCode:0,ResultDesc:"Accepted"});
 }catch(e){console.error("Tenacity callback processing failed:",e.message);return json(res,500,{ResultCode:1,ResultDesc:"Callback processing failed"})}
}