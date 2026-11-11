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
  const buttons=[...document.querySelectorAll('.service')];
  const fileInput=form.elements.file;
  const notice=document.getElementById('notice');
  const submit=form.querySelector('button[type="submit"]');
  const fileHelp=document.getElementById('fileHelp');
  const filesHost=document.getElementById('filesContainer');
  const estimateHost=document.getElementById('priceEstimate');
  const estimateHint=document.getElementById('priceEstimateHint');
  const estimateLines=document.getElementById('priceEstimateLines');
  const estimateTotal=document.getElementById('priceEstimateTotal');
  const estimateTotalLabel=document.getElementById('priceEstimateTotalLabel');
  const estimateNote=document.getElementById('priceEstimateNote');
  const MAX_FILE=5*1024**4;
  const MAX_FILES=20;
  const PAGE_PRICE=0.75;
  const SERVICES=['طباعة وجه واحد (ألوان)','طباعة وجهين (ألوان)','طباعة وجه واحد (أبيض وأسود)','طباعة وجهين (أبيض وأسود)','شهادات','صور شخصية'];
  const PAPERS=['ورق عادي','ورق جلوسي'];
  const SIZES=['A4 (20 × 30)','A3 (30 × 40)'];
  const FINISHES=['بدون','تكعيب','دبوس'];
  const allowedTypes=['application/pdf','image/jpeg','image/png'];
  const items=[];
  let pdfjsPromise=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function formatMoney(value){
    return new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' جنيه';
  }
  function isStandardService(value){
    return SERVICES.slice(0,4).includes(value);
  }
  function fileTypeOf(file){
    if(allowedTypes.includes(file.type))return file.type;
    const name=file.name.toLowerCase();
    if(name.endsWith('.pdf'))return 'application/pdf';
    if(name.endsWith('.jpg')||name.endsWith('.jpeg'))return 'image/jpeg';
    if(name.endsWith('.png'))return 'image/png';
    return '';
  }
  function getEstimate(item){
    if(item.fileType!=='application/pdf'||!item.pageCount||!isStandardService(item.service))return null;
    const copies=Number(item.copies);
    if(!Number.isInteger(copies)||copies<1||copies>500)return null;
    const duplex=item.service.includes('وجهين');
    const sheetsPerCopy=duplex?Math.ceil(item.pageCount/2):item.pageCount;
    const totalSheets=sheetsPerCopy*copies;
    return {sheetsPerCopy,totalSheets,price:Number((totalSheets*PAGE_PRICE).toFixed(2))};
  }
  function options(values,selected){
    return values.map(value=>'<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(value)+'</option>').join('');
  }
  function pageStatus(item){
    if(item.fileType!=='application/pdf')return 'صورة — التسعير بعد مراجعة المطبعة';
    if(item.pageStatus==='reading')return 'جارٍ قراءة صفحات ملف PDF...';
    if(item.pageStatus==='error')return 'تعذرت قراءة الملف؛ أعد حفظه كـ PDF عادي';
    return item.pageCount+' صفحة';
  }
  function cardPriceText(item){
    const estimate=getEstimate(item);
    if(estimate)return 'تكلفة هذا الملف: '+formatMoney(estimate.price)+' · '+estimate.totalSheets+' ورقة';
    if(item.fileType==='application/pdf'&&item.pageStatus==='reading')return 'جارٍ حساب التكلفة...';
    return 'السعر يحتاج مراجعة المطبعة';
  }
  function fileCard(item,index){
    const special=item.service==='شهادات'||item.service==='صور شخصية';
    return '<article class="file-item-card" data-item-id="'+esc(item.id)+'">'+
      '<div class="file-item-head"><div class="file-item-title"><span class="file-item-number">'+(index+1)+'</span><div><b>'+esc(item.file.name)+'</b><small>'+esc((item.file.size/1024/1024).toFixed(2))+' MB · '+esc(pageStatus(item))+'</small></div></div><button type="button" class="file-remove" data-remove-item="'+esc(item.id)+'">حذف الملف ×</button></div>'+
      '<div class="file-item-grid">'+
        '<label>الخدمة<select data-field="service">'+options(SERVICES,item.service)+'</select></label>'+
        '<label>نوع الورق<select data-field="paper">'+PAPERS.map(value=>'<option value="'+esc(value)+'" '+(value===item.paper?'selected':'')+' '+(special&&value==='ورق عادي'?'disabled':'')+'>'+esc(value)+'</option>').join('')+'</select></label>'+
        '<label>المقاس<select data-field="size">'+options(SIZES,item.size)+'</select></label>'+
        '<label>التقفيل<select data-field="finish">'+options(FINISHES,item.finish)+'</select></label>'+
        '<label>عدد النسخ<input data-field="copies" type="number" min="1" max="500" step="1" value="'+esc(item.copies)+'" required></label>'+
      '</div>'+
      '<label class="file-item-notes">ملاحظات تخص هذا الملف<textarea data-field="notes" rows="2" placeholder="مثال: الطباعة من صفحة ١ إلى ١٠ فقط">'+esc(item.notes||'')+'</textarea></label>'+
      '<div class="file-item-price" aria-live="polite">'+esc(cardPriceText(item))+'</div>'+
      '<small class="file-upload-status">'+esc(item.uploadStatus||'جاهز للرفع مع الطلب')}</small>'+
    '</article>';
  }
  function renderFiles(){
    if(!items.length){
      filesHost.innerHTML='<div class="files-empty">لم تتم إضافة ملفات بعد. اختر ملفاتك لتحديد إعدادات كل ملف.</div>';
    }else{
      filesHost.innerHTML=items.map(fileCard).join('');
    }
    renderEstimate();
  }
  function renderEstimate(){
    if(!items.length){estimateHost.hidden=true;return;}
    estimateHost.hidden=false;
    const estimates=items.map(getEstimate);
    const priced=estimates.filter(Boolean);
    const subtotal=priced.reduce((sum,item)=>sum+item.price,0);
    const allPriced=priced.length===items.length;
    estimateHint.textContent=allPriced
      ?'تم حساب تكلفة كل الملفات حسب إعدادات كل ملف.'
      :'بعض الملفات تحتاج تسعيرًا يدويًا من المطبعة؛ المعروض حاليًا هو مجموع الملفات القابلة للحساب فقط.';
    estimateLines.innerHTML=items.map((item,index)=>{
      const estimate=estimates[index];
      const details=[
        item.service,
        item.paper,
        item.size,
        'التقفيل: '+item.finish,
        'النسخ: '+item.copies
      ].join(' · ');
      const pageDetails=item.pageCount
        ?'الصفحات: '+item.pageCount+' · الأوراق لكل نسخة: '+(estimate?estimate.sheetsPerCopy:'—')+' · إجمالي الأوراق: '+(estimate?estimate.totalSheets:'—')
        :pageStatus(item);
      const price=estimate?formatMoney(estimate.price):(item.pageStatus==='reading'?'جارٍ الحساب':'يحتاج تسعيرًا');
      return '<div class="price-estimate-file"><div class="price-estimate-file-head"><b>'+(index+1)+'. '+esc(item.file.name)+'</b><strong>'+esc(price)+'</strong></div><small>'+esc(details)+'</small><small>'+esc(pageDetails)+'</small></div>';
    }).join('');
    estimateTotalLabel.textContent=allPriced?'إجمالي كل الملفات':'المجموع المحسوب حاليًا';
    estimateTotal.textContent=priced.length?formatMoney(subtotal):'بعد مراجعة المطبعة';
    estimateNote.textContent=allPriced
      ?'سعر الورقة ٧٥ قرشًا. هذا إجمالي تقديري قبل مراجعة المطبعة وتأكيد الطلب.'
      :'الملفات التي يظهر أمامها «يحتاج تسعيرًا» ستضاف بعد مراجعة المطبعة؛ لا يعتبر المجموع الحالي إجماليًا نهائيًا.';
    items.forEach(item=>{
      const card=filesHost.querySelector('[data-item-id="'+item.id+'"]');
      const priceHost=card?.querySelector('.file-item-price');
      if(priceHost)priceHost.textContent=cardPriceText(item);
    });
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
    try{
      const pages=pdf.numPages;
      if(!Number.isInteger(pages)||pages<1||pages>10000)throw new Error('عدد صفحات الملف غير صالح أو يتجاوز ١٠٠٠٠ صفحة.');
      return pages;
    }finally{
      await pdf.destroy();
    }
  }
  function syncServices(){
    buttons.forEach(button=>{
      const active=button.dataset.service===service.value;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  buttons.forEach(button=>button.addEventListener('click',()=>{
    service.value=button.dataset.service;
    syncServices();
    document.getElementById('order').scrollIntoView({behavior:'smooth',block:'start'});
  }));
  service.addEventListener('change',syncServices);

  fileInput.addEventListener('change',async()=>{
    const selected=Array.from(fileInput.files||[]);
    fileInput.value='';
    if(!selected.length)return;
    let added=0;
    for(const file of selected){
      if(items.length>=MAX_FILES){
        fileHelp.textContent='الحد الأقصى '+MAX_FILES+' ملفًا في الطلب الواحد. احذف ملفًا إذا أردت إضافة غيره.';
        break;
      }
      const type=fileTypeOf(file);
      if(!type){fileHelp.textContent='الملف '+file.name+' غير مدعوم. ارفع PDF أو JPG أو PNG.';continue;}
      if(file.size<1||file.size>MAX_FILE){fileHelp.textContent='حجم الملف '+file.name+' غير صالح أو أكبر من الحد المسموح.';continue;}
      const item={
        id:crypto.randomUUID(),
        file,
        fileType:type,
        service:service.value||SERVICES[0],
        paper:(service.value==='شهادات'||service.value==='صور شخصية')?'ورق جلوسي':'ورق عادي',
        size:SIZES[0],
        finish:FINISHES[0],
        copies:1,
        pageCount:null,
        pageStatus:type==='application/pdf'?'reading':'image',
        pageReadStarted:false,
        notes:'',
        uploadStatus:'جاهز للرفع مع الطلب'
      };
      items.push(item);
      added++;
    }
    renderFiles();
    fileHelp.textContent=added
      ?'تمت إضافة '+added+' ملف. يمكنك إضافة ملفات أخرى أو تعديل إعدادات كل ملف على حدة.'
      :'لم تتم إضافة ملفات جديدة.';
    for(const item of items.filter(value=>value.pageStatus==='reading'&&!value.pageCount&&!value.pageReadStarted)){
      item.pageReadStarted=true;
      try{
        item.pageCount=await readPdfPageCount(item.file);
        item.pageStatus='ready';
      }catch(error){
        item.pageStatus='error';
        item.pageError=error.message||'تعذرت قراءة ملف PDF.';
      }
      renderFiles();
    }
  });

  filesHost.addEventListener('change',event=>{
    const control=event.target.closest('[data-field]');
    if(!control)return;
    const card=control.closest('[data-item-id]');
    const item=items.find(value=>value.id===card?.dataset.itemId);
    if(!item)return;
    const field=control.dataset.field;
    item[field]=field==='copies'?control.value:control.value;
    if(field==='service'&&(item.service==='شهادات'||item.service==='صور شخصية')){
      item.paper='ورق جلوسي';
      const paperSelect=card.querySelector('[data-field="paper"]');
      if(paperSelect)paperSelect.value='ورق جلوسي';
    }
    if(field==='paper'&&(item.service==='شهادات'||item.service==='صور شخصية')&&item.paper!=='ورق جلوسي'){
      item.paper='ورق جلوسي';
      control.value='ورق جلوسي';
    }
    renderEstimate();
  });
  filesHost.addEventListener('input',event=>{
    const control=event.target.closest('[data-field]');
    if(!control)return;
    const card=control.closest('[data-item-id]');
    const item=items.find(value=>value.id===card?.dataset.itemId);
    if(!item)return;
    item[control.dataset.field]=control.value;
    renderEstimate();
  });
  filesHost.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-item]');
    if(!button)return;
    const index=items.findIndex(item=>item.id===button.dataset.removeItem);
    if(index>=0)items.splice(index,1);
    renderFiles();
    fileHelp.textContent=items.length?'يمكنك متابعة تعديل الملفات أو إضافة ملفات أخرى.':'تم حذف كل الملفات من الطلب.';
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    notice.textContent='';
    if(!items.length){notice.textContent='أضف ملفًا واحدًا على الأقل قبل إرسال الطلب.';return;}
    if(items.length>MAX_FILES){notice.textContent='الحد الأقصى '+MAX_FILES+' ملفًا في الطلب الواحد.';return;}
    for(let index=0;index<items.length;index++){
      const item=items[index];
      const copies=Number(item.copies);
      if(!SERVICES.includes(item.service)||!PAPERS.includes(item.paper)||!SIZES.includes(item.size)||!FINISHES.includes(item.finish)){
        notice.textContent='راجع اختيارات الملف رقم '+(index+1)+'.';
        return;
      }
      if(!Number.isInteger(copies)||copies<1||copies>500){
        notice.textContent='عدد النسخ للملف رقم '+(index+1)+' يجب أن يكون من ١ إلى ٥٠٠.';
        return;
      }
      if((item.service==='شهادات'||item.service==='صور شخصية')&&item.paper!=='ورق جلوسي'){
        notice.textContent='الشهادات والصور الشخصية تتطلب ورق جلوسي.';
        return;
      }
      if(item.fileType==='application/pdf'&&!item.pageCount){
        notice.textContent='انتظر حتى يكتمل حساب صفحات الملف رقم '+(index+1)+' أو أعد رفعه إذا تعذرت قراءته.';
        return;
      }
      if(!allowedTypes.includes(item.fileType)||item.file.size>MAX_FILE){
        notice.textContent='راجع نوع أو حجم الملف رقم '+(index+1)+'.';
        return;
      }
    }
    submit.disabled=true;
    submit.textContent='جارٍ تجهيز الطلب...';
    const uploadedItems=[];
    try{
      for(let index=0;index<items.length;index++){
        const item=items[index];
        item.uploadStatus='جارٍ الرفع...';
        const card=filesHost.querySelector('[data-item-id="'+item.id+'"]');
        const status=card?.querySelector('.file-upload-status');
        if(status)status.textContent='جارٍ رفع الملف '+(index+1)+' من '+items.length+'...';
        const uploadFile=item.file.type===item.fileType?item.file:new File([item.file],item.file.name,{type:item.fileType});
        const pathname='orders/'+crypto.randomUUID()+'/'+item.file.name.replace(/[\\/]/g,'_');
        const blob=await upload(pathname,uploadFile,{
          access:'private',
          handleUploadUrl:'/api/uploads',
          multipart:true,
          clientPayload:JSON.stringify({contentType:item.fileType,size:item.file.size}),
          onUploadProgress(progress){
            const percent=Math.round(progress.percentage);
            fileHelp.textContent='رفع الملف '+(index+1)+' من '+items.length+': '+percent+'%';
            submit.textContent='رفع '+(index+1)+'/'+items.length+' — '+percent+'%';
            if(status)status.textContent='جارٍ الرفع: '+percent+'%';
          }
        });
        item.uploadStatus='اكتمل الرفع';
        if(status)status.textContent='اكتمل الرفع';
        uploadedItems.push({
          service:item.service,
          paper:item.paper,
          size:item.size,
          finish:item.finish,
          copies:Number(item.copies),
          notes:item.notes,
          pageCount:item.pageCount,
          file:{pathname:blob.pathname,name:item.file.name,type:item.fileType,size:item.file.size}
        });
      }
      fileHelp.textContent='اكتمل رفع كل الملفات. جارٍ تسجيل الطلب...';
      submit.textContent='جارٍ تسجيل الطلب...';
      const data=new FormData(form);
      const response=await fetch('/api/orders',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          customer:data.get('customer'),
          phone:data.get('phone'),
          notes:data.get('notes'),
          items:uploadedItems
        })
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'تعذر إرسال الطلب');
      notice.replaceChildren();
      const heading=document.createElement('strong');
      heading.textContent='تم استلام طلبك بنجاح.';
      const code=document.createElement('div');
      code.className='tracking-code';
      code.textContent='رقم طلبك: '+result.order.order_code;
      const help=document.createElement('p');
      help.textContent='تم استلام '+items.length+' ملفًا. احتفظ برقم الطلب لمتابعة كل الملفات.';
      const total=document.createElement('p');
      total.className='order-confirmation-total';
      total.textContent=result.order.quoted_price!=null
        ?'الإجمالي التقديري لكل الملفات: '+formatMoney(Number(result.order.quoted_price))
        :'بعض الملفات تحتاج تسعيرًا يدويًا؛ ستراجع المطبعة الطلب كاملًا وتؤكد الإجمالي.';
      const link=document.createElement('a');
      link.className='btn';
      link.href=result.trackingUrl;
      link.textContent='تابع حالة طلبك ←';
      notice.append(heading,code,help,total,link);
      form.reset();
      items.splice(0,items.length);
      syncServices();
      renderFiles();
      fileHelp.textContent='يمكنك اختيار عدة ملفات PDF مرة واحدة، أو الضغط مجددًا لإضافة ملفات أخرى. الحد الأقصى ٢٠ ملفًا للطلب.';
    }catch(error){
      notice.textContent=error.message||'حدث خطأ. حاول مرة أخرى.';
      fileHelp.textContent='لم يكتمل إرسال الطلب. الملفات التي اكتمل رفعها ستظل محفوظة مؤقتًا؛ حاول مرة أخرى.';
    }finally{
      submit.disabled=false;
      submit.innerHTML='إرسال الطلب <span aria-hidden="true">←</span>';
    }
  });
  const year=document.getElementById('year');
  if(year)year.textContent=new Date().getFullYear();
  syncServices();
  renderFiles();
}
