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
  const estimateHost=document.getElementById('priceEstimate');
  const estimateHint=document.getElementById('priceEstimateHint');
  const estimateLines=document.getElementById('priceEstimateLines');
  const estimateTotal=document.getElementById('priceEstimateTotal');
  const MAX_FILE=5*1024**4;
  const PAGE_PRICE=0.75;
  let selectedPdfPages=null;
  let pdfReadToken=0;
  let pdfjsPromise=null;

  function formatMoney(value){
    return new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' جنيه';
  }
  function isStandardPrintService(){
    return ['طباعة وجه واحد (ألوان)','طباعة وجهين (ألوان)','طباعة وجه واحد (أبيض وأسود)','طباعة وجهين (أبيض وأسود)'].includes(service.value);
  }
  function updatePriceEstimate(){
    if(!estimateHost)return;
    const file=fileInput.files[0];
    if(!file||file.type!=='application/pdf'){
      estimateHost.hidden=true;
      return;
    }
    estimateHost.hidden=false;
    if(!isStandardPrintService()){
      estimateHint.textContent='التسعير التلقائي متاح لخدمات الطباعة العادية فقط.';
      estimateLines.innerHTML='<div class="price-estimate-line"><span>الخدمة المختارة</span><b>يتم تأكيد سعرها من المطبعة</b></div>';
      estimateTotal.textContent='بعد المراجعة';
      return;
    }
    if(!selectedPdfPages){
      estimateHint.textContent='جارٍ قراءة عدد صفحات ملف PDF...';
      estimateLines.innerHTML='';
      estimateTotal.textContent='—';
      return;
    }
    const copies=Math.max(1,Number.parseInt(form.elements.copies.value,10)||1);
    const duplex=service.value.includes('وجهين');
    const sheetsPerCopy=duplex?Math.ceil(selectedPdfPages/2):selectedPdfPages;
    const totalSheets=sheetsPerCopy*copies;
    const total=totalSheets*PAGE_PRICE;
    const rows=[
      ['عدد صفحات الملف',selectedPdfPages+' صفحة'],
      ['طريقة الطباعة',duplex?'وجهين':'وجه واحد'],
      ['الأوراق لكل نسخة',sheetsPerCopy+' ورقة'],
      ['عدد النسخ',copies+' نسخة'],
      ['سعر الورقة',formatMoney(PAGE_PRICE)],
      ['إجمالي الأوراق',totalSheets+' ورقة']
    ];
    estimateHint.textContent=duplex?'تم احتساب كل ورقة بوجهين.':'تم احتساب كل صفحة كوجه مستقل.';
    estimateLines.innerHTML=rows.map(([label,value])=>'<div class="price-estimate-line"><span>'+label+'</span><b>'+value+'</b></div>').join('');
    estimateTotal.textContent=formatMoney(total);
  }
  async function readPdfPageCount(file){
    if(!pdfjsPromise){
      pdfjsPromise=import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then(pdfjs=>{
        pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        return pdfjs;
      });
    }
    const pdfjs=await pdfjsPromise;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const pdf=await pdfjs.getDocument({data:bytes}).promise;
    const pages=pdf.numPages;
    await pdf.destroy();
    if(!Number.isInteger(pages)||pages<1||pages>10000)throw new Error('عدد صفحات الملف غير صالح أو يتجاوز ١٠٠٠٠ صفحة.');
    return pages;
  }

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
  service.addEventListener('change',updatePriceEstimate);
  form.elements.copies.addEventListener('input',updatePriceEstimate);
  fileInput.addEventListener('change',async()=>{
    const token=++pdfReadToken;
    selectedPdfPages=null;
    const file=fileInput.files[0];
    if(!file){
      fileHelp.textContent='الملفات المسموحة PDF وJPG وPNG. ارفع ملفات الطباعة مباشرة وبالحجم الأصلي.';
      updatePriceEstimate();
      return;
    }
    const mb=(file.size/1024/1024).toFixed(2);
    if(file.type==='application/pdf'){
      fileHelp.textContent='تم اختيار PDF ('+mb+' ميجابايت). جارٍ قراءة عدد الصفحات...';
      updatePriceEstimate();
      try{
        const pages=await readPdfPageCount(file);
        if(token!==pdfReadToken)return;
        selectedPdfPages=pages;
        fileHelp.textContent='الملف: '+file.name+' — '+mb+' ميجابايت — '+pages+' صفحة';
        updatePriceEstimate();
      }catch(error){
        if(token!==pdfReadToken)return;
        fileHelp.textContent=error.message||'تعذرت قراءة ملف PDF. جرّب حفظه كملف PDF عادي وغير محمي بكلمة مرور.';
        updatePriceEstimate();
      }
    }else{
      fileHelp.textContent='الملف المختار: '+file.name+' — '+mb+' ميجابايت. التسعير التلقائي متاح لملفات PDF.';
      updatePriceEstimate();
    }
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    notice.textContent='';
    const file=fileInput.files[0];
    if(!file){notice.textContent='من فضلك ارفع ملف الطباعة.';return;}
    if(file.type==='application/pdf'&&isStandardPrintService()&&!selectedPdfPages){
      notice.textContent='تعذر قراءة عدد صفحات ملف PDF. ارفع ملف PDF سليم وغير محمي بكلمة مرور.';
      return;
    }
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
          pageCount:file.type==='application/pdf'?selectedPdfPages:null,
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
      selectedPdfPages=null;
      syncServices();
      updatePriceEstimate();
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
