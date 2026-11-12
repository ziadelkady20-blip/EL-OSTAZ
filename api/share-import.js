import crypto from 'node:crypto';
import { head } from '@vercel/blob';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';
const ALLOWED_TYPES=['application/pdf','image/jpeg','image/png'];
const MAX_FILES=20;
function verifyToken(token){
  if(!process.env.ADMIN_SESSION_SECRET||typeof token!=='string'||token.length>20000)return null;
  const [encoded,supplied]=token.split('.');
  if(!encoded||!supplied)return null;
  const expected=crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(encoded).digest();
  let actual;try{actual=Buffer.from(supplied,'base64url');}catch{return null;}
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  try{
    const payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    if(payload.version!==1||!Number.isFinite(payload.expiresAt)||payload.expiresAt<Date.now())return null;
    if(!Array.isArray(payload.files)||!payload.files.length||payload.files.length>MAX_FILES)return null;
    return payload;
  }catch{return null;}
}
export default async function handler(req,res){
  if(!allowMethods(req,res,['POST']))return;
  try{
    const body=await readJson(req);
    const payload=verifyToken(safeText(body.token,20000));
    if(!payload)return sendJson(res,410,{error:'انتهت صلاحية رابط المشاركة. أعد مشاركة الملف من واتساب.'});
    const files=[];
    for(const file of payload.files){
      const pathname=safeText(file.pathname,500);
      const type=safeText(file.type,80).toLowerCase();
      const size=Number(file.size);
      if(!pathname.startsWith('orders/share/')||!ALLOWED_TYPES.includes(type)||!Number.isSafeInteger(size)||size<1)throw new Error('بيانات الملف غير صالحة');
      const blob=await head(pathname,{access:'private'});
      if(!blob||Number(blob.size)!==size||String(blob.contentType).toLowerCase()!==type)throw new Error('الملف لم يعد متاحًا. أعد مشاركته من واتساب.');
      files.push({pathname,name:safeText(file.name,160)||'shared-file',type,size,pageCount:Number.isInteger(file.pageCount)?file.pageCount:null});
    }
    return sendJson(res,200,{files});
  }catch(error){
    console.error('share import error',error);
    return sendJson(res,400,{error:error?.message||'تعذر استيراد الملف'});
  }
}
