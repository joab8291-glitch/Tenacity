import {redis,getOrder,saveOrder,json,readBody} from "../_lib/store.js";

function constantTimeEqual(a,b){
  if(a.length!==b.length)return false;
  let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  return mismatch===0;
}

function authorized(req){
  const expected=process.env.TENACITY_ORDER_ADMIN_TOKEN;
  const header=req.headers?.authorization;
  const supplied=String(Array.isArray(header)?header[0]||"":header||"").replace(/^Bearer\s+/i,"").trim();
  if(typeof expected!=="string"||!expected||!supplied)return false;
  return constantTimeEqual(Buffer.from(expected,"utf8"),Buffer.from(supplied,"utf8"));
}

export default async function handler(req,res){
  if(!authorized(req))return json(res,401,{error:"Unauthorized"});
  try{
    if(req.method==="GET"){
      const ids=await redis(["LRANGE","tenacity:orders","0","99"]);
      const orders=await Promise.all((ids||[]).map(getOrder));
      return json(res,200,{orders:orders.filter(Boolean)});
    }
    if(req.method==="DELETE"){
      const b=readBody(req),id=String(b.orderNumber||"").toUpperCase(),o=await getOrder(id);
      if(!id)return json(res,400,{error:"Order number is required"});
      if(!o)return json(res,404,{error:"Order not found"});
      await redis(["DEL","tenacity:order:"+id]);
      await redis(["LREM","tenacity:orders","0",id]);
      return json(res,200,{success:true,deleted:id});
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
    console.error("Admin orders:",e?.message||e);
    return json(res,503,{error:"Order management unavailable. Check the order database connection and try again."});
  }
}
