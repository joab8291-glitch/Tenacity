const base=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;

function ready(){return !!(base&&token)}

function safeMessage(value){
  return String(value||"").replaceAll("\r"," ").replaceAll("\n"," ").replaceAll("\t"," ").slice(0,240);
}

async function redis(command){
  if(!ready()) throw new Error("Order database is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  let endpoint;
  try{
    endpoint=new URL(base);
    if(endpoint.protocol!=="https:") throw new Error("Invalid protocol");
  }catch{
    throw new Error("Order database URL is invalid. Check UPSTASH_REDIS_REST_URL in the deployment environment.");
  }

  let response;
  try{
    const endpointUrl=endpoint.toString();
    const requestUrl=endpointUrl.endsWith("/")?endpointUrl.slice(0,-1):endpointUrl;
    response=await fetch(requestUrl,{
      method:"POST",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify(command),
      signal:AbortSignal.timeout(12000)
    });
  }catch(error){
    console.error("Upstash connection failed:",safeMessage(error?.message));
    throw new Error("Order database could not be reached. Check the Upstash URL, token and network availability.");
  }

  const raw=await response.text();
  let data;
  try{
    data=raw?JSON.parse(raw):{};
  }catch{
    console.error("Upstash returned a non-JSON response:",response.status,safeMessage(raw.slice(0,180)));
    throw new Error("Order database returned an invalid response. Check the Upstash service and credentials.");
  }

  if(!response.ok||data?.error){
    console.error("Upstash request failed:",response.status,safeMessage(data?.error||data?.message||response.statusText));
    throw new Error("Order database request failed ("+response.status+"). Check the Upstash database status and credentials.");
  }
  if(!Object.prototype.hasOwnProperty.call(data,"result")){
    console.error("Upstash response did not contain a result:",response.status);
    throw new Error("Order database returned an unexpected response.");
  }
  return data.result;
}

const key=(id)=>"tenacity:order:"+id;
async function getOrder(id){
  const raw=await redis(["GET",key(id)]);
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{
    console.error("Stored order record is invalid:",safeMessage(id));
    return null;
  }
}
async function saveOrder(order){
  await redis(["SET",key(order.orderNumber),JSON.stringify(order),"EX",60*60*24*180]);
  return order;
}
function orderNumber(){
  return "TL-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
}
function json(res,status,data){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  return res.status(status).json(data);
}
function readBody(req){
  if(typeof req.body==="string"){
    try{return JSON.parse(req.body||"{}")}catch{return {}}
  }
  return req.body||{};
}

module.exports={ready,redis,key,getOrder,saveOrder,orderNumber,json,readBody};
