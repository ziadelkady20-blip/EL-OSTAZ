import crypto from 'node:crypto';
import { head } from '@vercel/blob';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';
const ALLOWED_TYPES=['application/pdf','image/jpeg','image/png'];
const MAX_FILES=20;
const MAX_FILE=5*1024**4;
function signPayload(payload){
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(encoded).digest('base64url');
  return encoded+'.'+signature;
}
function cleanFileName(value){
  return (safeText(value,160).split('/').join('_').split(String.fromCharCode(92)).join('_').split(String.fromCharCode(0)).join('_'))||'shared-file';
}
export default async function handler(req,res){
  if(!allowMethods(req,res,['POST']))return;
  try{
    if(!process.env.ADMIN_SESSION_SECRET)return sendJson(res,503,{error:'خدمة المشاركة غير مهيأة حاليًا'});
    const body=await readJson(req);
    const incoming=Array.isArray(body.files)?body.files:[body.file||body];
    if(!incoming.length||incoming.length>MAX_FILES)throw new Error('يمكن مشاركة من ملف واحد إلى ٢٠ ملفًا في المرة الواحدة');
    const files=[];
    for(const raw of incoming){
      const pathname=safeText(raw?.pathname,500);
      const name=cleanFileName(raw?.name||raw?.fileName);
      const type=safeText(raw?.type||raw?.contentType,80).toLowerCase();
      const size=Number(raw?.size);
      const pathParts=pathname.split('/');
      if(pathParts.length!==4||pathParts[0]!=='orders'||pathParts[1]!=='share'||!/^[a-f0-9-]{36}$/i.test(pathParts[2])||!pathParts[3]||pathParts[3].length>160)throw new Error('مسار الملف غير صالح');
      if(!ALLOWED_TYPES.includes(type)||!Number.isSafeInteger(size)||size<1||size>MAX_FILE)throw new Error('بيانات الملف غير صالحة');
      const blob=await head(pathname,{access:'private'});
      if(!blob||Number(blob.size)!==size||String(blob.contentType).toLowerCase()!==type)throw new Error('لم نتمكن من التحقق من الملف المرفوع');
      const pageCountValue=Number(raw?.pageCount);
      const pageCount=type==='application/pdf'&&Number.isInteger(pageCountValue)&&pageCountValue>=1&&pageCountValue<=10000?pageCountValue:null;
      files.push({pathname,name,type,size,pageCount});
    }
    const expiresAt=Date.now()+20*60*1000;
    const token=signPayload({version:1,expiresAt,nonce:crypto.randomBytes(12).toString('hex'),files});
    return sendJson(res,200,{url:'https://el-ostaz-ochre.vercel.app/#ostaz-share='+encodeURIComponent(token),expiresAt});
  }catch(error){
    console.error('share prepare error',error);
    return sendJson(res,400,{error:error?.message||'تعذر تجهيز الملف للموقع'});
  }
}
