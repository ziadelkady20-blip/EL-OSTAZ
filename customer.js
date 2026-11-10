import { upload } from 'https://esm.sh/@vercel/blob@2.9.0/client';

const installButton=document.getElementById('installAppButton');
const installDialog=document.getElementById('installGuideDialog');
const closeInstallGuide=()=>installDialog?.close();
let deferredInstallPrompt=null;

function isAppInstalled(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
}
function showInstallGuide(){
  if(!installDialog)return;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const intro=document.getElementById('installGuideIntro');
  const steps=document.getElementById('installGuideSteps');
  if(ios){
    intro.textContent='على iPhone أو iPad، أضف الموقع من Safari بهذه الخطوات:';
    steps.innerHTML='<li>افتح الموقع من متصفح <b>Safari</b>.</li><li>اضغط زر المشاركة <b>Share</b> أسفل الشاشة.</li><li>اختر <b>إضافة إلى الشاشة الرئيسية</b> (Add to Home Screen).</li><li>اترك اسم «الأستاذ» واضغط <b>إضافة</b>.</li>';
  }else{
    intro.textContent='يمكنك تثبيت الأستاذ كتطبيق مستقل على هاتفك:';
    steps.innerHTML='<li>افتح قائمة المتصفح ⋮ أو زر المشاركة.</li><li>اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.</li><li>اضغط <b>تثبيت</b> أو <b>إضافة</b>.</li>';
  }
  installDialog.showModal();
}
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(error=>console.warn('PWA service worker registration failed',error)));
}
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  if(installButton)installButton.innerHTML='ثبّت تطبيق الأستاذ <span aria-hidden="true">↓</span>';
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  if(installButton)installButton.closest('.install-app')?.classList.add('is-installed');
});
if(installButton){
  if(isAppInstalled())installButton.closest('.install-app')?.classList.add('is-installed');
  installButton.addEventListener('click',async()=>{
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      const choice=await deferredInstallPrompt.userChoice;
      deferredInstallPrompt=null;
      if(choice?.outcome==='accepted')installButton.textContent='تم إرسال طلب التثبيت';
      return;
    }
    showInstallGuide();
  });
}
document.getElementById('closeInstallGuide')?.addEventListener('click',closeInstallGuide);
document.getElementById('closeInstallGuideBottom')?.addEventListener('click',closeInstallGuide);
installDialog?.addEventListener('click',event=>{
  if(event.target===installDialog)closeInstallGuide();
});


const form=document.getElementById('orderForm');
if(form){
  const service=form.elements.service;
  const paper=form.elements.paper;
  const buttons=[...document.querySelectorAll('.service')];
  const fileInput=form.elements.file;
  const notice=document.getElementById('notice');
  const submit=form.querySelector('button[type="submit"]');
  const fileHelp=document.getElementById('fileHelp');
  const MAX_FILE=5*1024**4;

  function syncServices(){
    buttons.forEach(button=>{
      const active=button.dataset.service===service.value;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
    const special=service.value==='شهادات'||service.value==='صور شخصية';
    paper.options[0].disabled=special;
    if(special) paper.value='ورق جلوسي';
  }
  buttons.forEach(button=>button.addEventListener('click',()=>{
    service.value=button.dataset.service;
    syncServices();
    document.getElementById('order').scrollIntoView({behavior:'smooth',block:'start'});
  }));
  service.addEventListener('change',syncServices);
  fileInput.addEventListener('change',()=>{
    const file=fileInput.files[0];
    if(!file){fileHelp.textContent='الملفات المسموحة PDF وJPG وPNG. ارفع ملفات الطباعة مباشرة وبالحجم الأصلي.';return;}
    const mb=(file.size/1024/1024).toFixed(2);
    fileHelp.textContent='الملف المختار: '+file.name+' — '+mb+' ميجابايت';
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    notice.textContent='';
    const file=fileInput.files[0];
    if(!file){notice.textContent='من فضلك ارفع ملف الطباعة.';return;}
    if(file.size>MAX_FILE){notice.textContent='حجم الملف يتجاوز الحد التقني الأقصى للتخزين (5 تيرابايت).';return;}
    if(!['application/pdf','image/jpeg','image/png'].includes(file.type)){notice.textContent='نوع الملف غير مدعوم. ارفع PDF أو JPG أو PNG.';return;}
    submit.disabled=true;
    submit.textContent='جارٍ رفع الملف...';
    fileHelp.textContent='جارٍ تجهيز رفع الملف بأمان...';
    try{
      const pathname='orders/'+crypto.randomUUID()+'/'+file.name.replace(/[\\/]/g,'_');
      const blob=await upload(pathname,file,{
        access:'private',
        handleUploadUrl:'/api/uploads',
        multipart:true,
        clientPayload:JSON.stringify({contentType:file.type,size:file.size}),
        onUploadProgress(progress){
          const percent=Math.round(progress.percentage);
          fileHelp.textContent='جارٍ رفع الملف: '+percent+'%';
          submit.textContent='رفع الملف '+percent+'%';
        }
      });
      fileHelp.textContent='اكتمل رفع الملف. جارٍ تسجيل الطلب...';
      submit.textContent='جارٍ تسجيل الطلب...';
      const data=new FormData(form);
      const response=await fetch('/api/orders',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          customer:data.get('customer'),phone:data.get('phone'),service:data.get('service'),
          paper:data.get('paper'),size:data.get('size'),finish:data.get('finish'),
          copies:data.get('copies'),notes:data.get('notes'),
          file:{pathname:blob.pathname,name:file.name,type:file.type,size:file.size}
        })
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'تعذر إرسال الطلب');
      notice.replaceChildren();
      const heading=document.createElement('strong');
      heading.textContent='تم استلام طلبك بنجاح.';
      const code=document.createElement('div');
      code.className='tracking-code';
      code.textContent='رقم طلبك: '+result.order.order_code;
      const help=document.createElement('p');
      help.textContent='احتفظ برقم الطلب واستخدمه لمتابعة حالة الطباعة.';
      const link=document.createElement('a');
      link.className='btn';
      link.href=result.trackingUrl;
      link.textContent='تابع حالة طلبك ←';
      notice.append(heading,code,help,link);
      form.reset();
      syncServices();
      fileHelp.textContent='الملفات المسموحة PDF وJPG وPNG. ارفع ملفات الطباعة مباشرة وبالحجم الأصلي.';
    }catch(error){
      notice.textContent=error.message||'حدث خطأ. حاول مرة أخرى.';
      fileHelp.textContent='لم يكتمل رفع الملف. حاول مرة أخرى أو تواصل معنا عبر واتساب.';
    }finally{
      submit.disabled=false;
      submit.innerHTML='إرسال الطلب <span aria-hidden="true">←</span>';
    }
  });
  const year=document.getElementById('year');
  if(year)year.textContent=new Date().getFullYear();
  syncServices();
}
