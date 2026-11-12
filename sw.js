self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
const SHARE_DB='ostaz-share-target-v1';
const SHARE_STORE='pending-shares';
function openShareDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(SHARE_DB,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(SHARE_STORE))request.result.createObjectStore(SHARE_STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('تعذر فتح مساحة الملفات'));
  });
}
function isSupportedSharedFile(file){
  const name=String(file?.name||'').toLowerCase();
  const type=String(file?.type||'').toLowerCase();
  return type==='application/pdf'||type==='image/jpeg'||type==='image/png'||name.endsWith('.pdf')||name.endsWith('.jpg')||name.endsWith('.jpeg')||name.endsWith('.png');
}
async function saveSharedFiles(files,rejectedCount,overflowCount){
  const database=await openShareDatabase();
  try{
    await new Promise((resolve,reject)=>{
      const transaction=database.transaction(SHARE_STORE,'readwrite');
      transaction.objectStore(SHARE_STORE).add({id:crypto.randomUUID(),files,rejectedCount,overflowCount,createdAt:Date.now()});
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error||new Error('تعذر حفظ الملفات'));
      transaction.onabort=()=>reject(transaction.error||new Error('تم إلغاء حفظ الملفات'));
    });
  }finally{database.close();}
}
self.addEventListener('fetch',event=>{
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin!==self.location.origin||requestUrl.pathname!=='/share-target/'||event.request.method!=='POST')return;
  event.respondWith((async()=>{
    try{
      const formData=await event.request.formData();
      const receivedFiles=formData.getAll('files').filter(entry=>entry&&typeof entry.name==='string'&&typeof entry.size==='number'&&entry.size>0);
      const supportedFiles=receivedFiles.filter(isSupportedSharedFile);
      const files=supportedFiles.slice(0,20);
      const overflowCount=Math.max(0,supportedFiles.length-files.length);
      const rejectedCount=Math.max(0,receivedFiles.length-supportedFiles.length);
      if(!files.length)return Response.redirect(new URL('/?share-error=no-files',self.location.origin),303);
      await saveSharedFiles(files,rejectedCount,overflowCount);
      return Response.redirect(new URL('/?shared=1',self.location.origin),303);
    }catch(error){
      console.error('Android share target error',error);
      return Response.redirect(new URL('/?share-error=failed',self.location.origin),303);
    }
  })());
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{};}catch{}
  const title=data.title||'إشعار من مطبعة الأستاذ';
  const options={body:data.body||'وصل تحديث جديد للطلبات.',icon:'/assets/ostaz-logo.svg?v=2',badge:'/assets/ostaz-logo.svg?v=2',tag:data.tag||'ostaz-admin',renotify:true,data:{url:data.url||'/admin.html'},dir:'rtl',lang:'ar'};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/admin.html',self.location.origin).href;
  event.waitUntil((async()=>{
    const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clientsList){
      if(client.url.startsWith(self.location.origin)&&'focus' in client){await client.navigate(target);return client.focus();}
    }
    return self.clients.openWindow(target);
  })());
});
