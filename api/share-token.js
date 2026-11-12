import crypto from 'node:crypto';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { allowMethods, readJson, safeText, sendJson } from '../lib/http.js';
const MAX_FILE=5*1024**4;
const TYPE_BY_EXTENSION={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
export default async function handler(req,res){
  if(!allowMethods(req,res,['POST']))return;
  try{
    const body=await readJson(req);
    const fileName=(safeText(body.fileName||body.name,160).split('/').join('_').split(String.fromCharCode(92)).join('_').split(String.fromCharCode(0)).join('_'))||'shared-file';
    const extension=safeText(body.extension,12).split('.').join('').toLowerCase()||fileName.split('.').pop().toLowerCase();
    const contentType=TYPE_BY_EXTENSION[extension];
    const size=Number(body.size);
    if(!contentType)throw new Error('الملف غير مدعوم. استخدم PDF أو JPG أو PNG');
    if(!Number.isSafeInteger(size)||size<1||size>MAX_FILE)throw new Error('حجم الملف غير صالح أو يتجاوز الحد التقني للتخزين');
    const pathname='orders/share/'+crypto.randomUUID()+'/'+fileName;
    const expiresAt=Date.now()+15*60*1000;
    const clientToken=await generateClientTokenFromReadWriteToken({pathname,allowedContentTypes:[contentType],maximumSizeInBytes:size,validUntil:expiresAt,addRandomSuffix:false});
    const storeId=clientToken.split('_')[3];
    if(!storeId)throw new Error('تعذر تجهيز صلاحية رفع الملف');
    const requestId=storeId+':'+Date.now()+':'+crypto.randomBytes(8).toString('hex');
    const headers={
      authorization:'Bearer '+clientToken,
      'x-vercel-blob-store-id':storeId,
      'x-api-version':'13',
      'x-api-blob-request-id':requestId,
      'x-api-blob-request-attempt':'0',
      'x-vercel-blob-access':'private',
      'x-content-type':contentType
    };
    return sendJson(res,200,{pathname,fileName,contentType,size,uploadUrl:'https://blob.vercel-storage.com/?pathname='+encodeURIComponent(pathname),headers,expiresAt});
  }catch(error){
    console.error('share token error',error);
    return sendJson(res,400,{error:error?.message||'تعذر تجهيز مشاركة الملف'});
  }
}
