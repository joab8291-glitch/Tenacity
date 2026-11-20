import {timingSafeEqual} from "node:crypto";
import {redis,getOrder,saveOrder,json,readBody} from "../_lib/store.js";

function authorized(req){
  const expected=process.env.TENACITY_ORDER_ADMIN_TOKEN;
  const supplied=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");
  if(!expected||!supplied)return false;
  const expectedBuffer=Buffer.from(expected);
  const suppliedBuffer=Buffer.from(supplied);
  return expectedBuffer.length===suppliedBuffer.length&&timingSafeEqual(expectedBuffer,suppliedBuffer);
}

export default async function handler(req,res){
  if(!authorized(req))return json(res,401,{error:"Unauthorized"});
  try{
    if(req.method==="GET"){
      const ids=await redis(["LRANGE","tenacity:orders","0","99"]);
      const orders=await Promise.all((ids||[]).map(getOrder));
      return json(res,200,{orders:orders.filter(Boolean)});
    }
    if(req.method==="PATCH"){
      const b=readBody(req),id=String(b.orderNumber||"").toUpperCase(),o=await getOrder(id);
      if(!o)return json(res,404,{error:"Order not found"});
      if(!["approved","rejected","fulfilled"].includes(b.status))return json(res,400,{error:"Invalid status"});
      if(b.status==="approved"){
        const amount=Number(b.amount);
        if(!Number.isSafeInteger(amount)||amount<1||amount>250000)return json(res,400,{error:"Set a valid whole-number KES amount."});
        o.amount=amount;
        o.status="approved";
        o.payment={...o.payment,status:"pending"};
      }else{
        o.status=b.status;
      }
      o.adminNote=String(b.adminNote||"").slice(0,500);
      o.updatedAt=new Date().toISOString();
      await saveOrder(o);
      return json(res,200,{success:true,order:o});
    }
    return json(res,405,{error:"Method not allowed"});
  }catch(e){
    console.error("Admin orders:",e.message);
    return json(res,503,{error:"Order management unavailable. Check the order database connection and try again."});
  }
}
