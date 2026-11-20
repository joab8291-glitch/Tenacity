import {getOrder,saveOrder,redis,json,readBody,bodyWithinLimit,rateLimit} from "./_lib/store.js";
let tokenCache={value:"",expires:0};
function phone(v){let p=String(v||"").replace(/[\s\-+()]/g,"");if(p.startsWith("0"))p="254"+p.slice(1);if(/^[17]\d{8}$/.test(p))p="254"+p;return /^254[17]\d{8}$/.test(p)?p:null}
function stamp(){const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+p.month+p.day+p.hour+p.minute+p.second}
function cfg(){const env=process.env.MPESA_ENV||"production",base=(process.env.MPESA_BASE_URL||(env==="sandbox"?"https://sandbox.safaricom.co.ke":"https://api.safaricom.co.ke")).replace(/\/+$/,""),missing=["MPESA_CONSUMER_KEY","MPESA_CONSUMER_SECRET","MPESA_SHORTCODE","MPESA_PASSKEY","MPESA_CALLBACK_URL"].filter(k=>!process.env[k]);if(missing.length)throw Error("Daraja configuration is incomplete.");const callback=new URL(process.env.MPESA_CALLBACK_URL);if(callback.protocol!=="https:")throw Error("Callback URL must use HTTPS.");return{base,shortcode:process.env.MPESA_SHORTCODE,passkey:process.env.MPESA_PASSKEY,callback:callback.toString()}}
async function token(base){if(tokenCache.value&&Date.now()<tokenCache.expires)return tokenCache.value;const auth=Buffer.from(process.env.MPESA_CONSUMER_KEY+":"+process.env.MPESA_CONSUMER_SECRET).toString("base64"),r=await fetch(base+"/oauth/v1/generate?grant_type=client_credentials",{headers:{Authorization:"Basic "+auth},signal:AbortSignal.timeout(18000)}),d=await r.json();if(!r.ok||!d.access_token)throw Error("Daraja authentication failed.");tokenCache={value:d.access_token,expires:Date.now()+Math.max(30,(Number(d.expires_in)||3599)-60)*1000};return tokenCache.value}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});if(!bodyWithinLimit(req,8000))return json(res,413,{error:"Request is too large."});
 try{
  if(!await rateLimit(req,"mpesa-ip",8,900))return json(res,429,{error:"Too many payment attempts. Please wait before trying again."});
  const b=readBody(req);if(b.action!=="initiate")return json(res,400,{error:"Only approved-order payments are supported."});
  const id=String(b.orderNumber||"").trim().toUpperCase();if(!/^TL-[0-9]{6}-[A-Z0-9]{5}$/.test(id))return json(res,400,{error:"Enter a valid order number."});
  if(!await rateLimit(req,"mpesa-order",1,60,id))return json(res,429,{error:"A payment prompt was recently requested for this order. Please wait before retrying."});
  const o=await getOrder(id);if(!o||o.type!=="quotation"||o.status!=="approved"||!Number.isSafeInteger(Number(o.amount))||Number(o.amount)<1)return json(res,409,{error:"This order is not approved for payment yet."});
  if(o.payment?.status==="confirmed"||o.status==="paid")return json(res,409,{error:"This order has already been paid."});
  if(o.payment?.status==="initiated"&&Date.now()-Date.parse(o.payment.initiatedAt||0)<60000)return json(res,409,{error:"A payment prompt is already in progress. Check the customer's phone."});
  const storedPhone=phone(o.customer?.phone),requestedPhone=b.phone?phone(b.phone):storedPhone;if(!storedPhone||!requestedPhone||requestedPhone!==storedPhone)return json(res,400,{error:"Payment can only be sent to the phone number provided with the quotation."});
  const c=cfg(),t=await token(c.base),ts=stamp(),Password=Buffer.from(c.shortcode+c.passkey+ts).toString("base64");
  const payload={BusinessShortCode:c.shortcode,Password,Timestamp:ts,TransactionType:"CustomerPayBillOnline",Amount:Number(o.amount),PartyA:storedPhone,PartyB:c.shortcode,PhoneNumber:storedPhone,CallBackURL:c.callback,AccountReference:id,TransactionDesc:"Tenacity order "+id};
  const r=await fetch(c.base+"/mpesa/stkpush/v1/processrequest",{method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)}),d=await r.json();
  if(!r.ok||d.ResponseCode!=="0"||!d.CheckoutRequestID||!d.MerchantRequestID)return json(res,502,{error:d.errorMessage||d.ResponseDescription||"Safaricom could not initiate payment."});
  o.payment={status:"initiated",phone:storedPhone,checkoutRequestId:d.CheckoutRequestID,merchantRequestId:d.MerchantRequestID,initiatedAt:new Date().toISOString()};o.updatedAt=new Date().toISOString();await saveOrder(o);
  await redis(["SET","tenacity:checkout:"+d.CheckoutRequestID,JSON.stringify({orderNumber:id,merchantRequestId:d.MerchantRequestID}),"EX",86400]);
  return json(res,200,{success:true,orderNumber:id,customerMessage:d.CustomerMessage||"Check the registered phone and enter the M-Pesa PIN."});
 }catch(e){console.error("Tenacity M-Pesa:",e.message);return json(res,503,{error:"Payment service unavailable. Please try again shortly."})}
}