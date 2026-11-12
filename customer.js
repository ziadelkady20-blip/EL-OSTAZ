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
  const fulfillmentMethod=form.elements.fulfillmentMethod;
  const deliveryAddressField=document.getElementById('deliveryAddressField');
  const deliveryAddress=form.elements.deliveryAddress;
  function syncFulfillmentFields(){
    const needsDelivery=fulfillmentMethod.value==='delivery';
    deliveryAddressField.hidden=!needsDelivery;
    deliveryAddress.required=needsDelivery;
    if(!needsDelivery)deliveryAddress.value='';
  }
  fulfillmentMethod.addEventListener('change',syncFulfillmentFields);
  const MAX_FILE=5*1024**4;
  const MAX_FILES=20;
  const NORMAL_SHEET_PRICE=0.75;
  const GLOSSY_SHEET_PRICE=5;
  const BINDING_FEE=10;
  const SERVICES=['طباعة وجه واحد (ألوان)','طباعة وجهين (ألوان)','طباعة وجه واحد (أبيض وأسود)','طباعة وجهين (أبيض وأسود)','شهادات','صور شخصية'];
  const PAPERS=['ورق عادي','ورق جلوسي'];
  const SIZES=['A4 (20 × 30)','A3 (30 × 40)'];
  const FINISHES=['بدون','تكعيب','دبوس'];
  const PAGE_LAYOUTS=[1,2,4,6,8,9,16];
  const allowedTypes=['application/pdf','image/jpeg','image/png'];
  const items=[];
  let pdfjsPromise=null;

  function openPendingSharesDatabase(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('ostaz-share-target-v1',1);
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains('pending-shares')){
          request.result.createObjectStore('pending-shares',{keyPath:'id'});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('تعذر فتح الملفات المستلمة'));
    });
  }
  async function takePendingSharedFiles(){
    const database=await openPendingSharesDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const transaction=database.transaction('pending-shares','readwrite');
        const store=transaction.objectStore('pending-shares');
        const request=store.getAll();
        let records=[];
        request.onsuccess=()=>{
          records=request.result||[];
          records.forEach(record=>store.delete(record.id));
        };
        request.onerror=()=>reject(request.error||new Error('تعذر قراءة الملفات المستلمة'));
        transaction.oncomplete=()=>resolve(records);
        transaction.onerror=()=>reject(transaction.error||new Error('تعذر قراءة الملفات المستلمة'));
        transaction.onabort=()=>reject(transaction.error||new Error('تم إلغاء قراءة الملفات'));
      });
    }finally{
      database.close();
    }
  }

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function formatMoney(value){
    return new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' جنيه';
  }
  function isStandardService(value){
    return SERVICES.slice(0,4).includes(value);
  }
  function isDuplexService(value){
    return value.includes('وجهين');
  }
  function oneSidedService(value){
    return value.replace('وجهين','وجه واحد');
  }
  function availableServices(item){
    return SERVICES.filter(value=>
      (item.paper!=='ورق جلوسي'||!isDuplexService(value)) &&
      (item.fileType==='application/pdf'||!isDuplexService(value))
    );
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
    const copies=Number(item.copies);
    if(!Number.isInteger(copies)||copies<1||copies>500)return null;
    const isPdf=item.fileType==='application/pdf';
    const special=item.service==='شهادات'||item.service==='صور شخصية';
    if(isPdf&&(!Number.isInteger(Number(item.pageCount))||Number(item.pageCount)<1))return null;
    const duplex=isDuplexService(item.service);
    if(duplex&&(item.paper!=='ورق عادي'||!isPdf))return null;
    const pagesPerSheet=isPdf&&!special?Number(item.pagesPerSheet||1):1;
    if(isPdf&&!special&&!PAGE_LAYOUTS.includes(pagesPerSheet))return null;
    const printedSidesPerCopy=isPdf
      ?(special?Number(item.pageCount):Math.ceil(Number(item.pageCount)/pagesPerSheet))
      :1;
    const sheetsPerCopy=duplex?Math.ceil(printedSidesPerCopy/2):printedSidesPerCopy;
    if(!Number.isInteger(sheetsPerCopy)||sheetsPerCopy<1)return null;
    const totalSheets=sheetsPerCopy*copies;
    const pricePerSheet=item.paper==='ورق جلوسي'?GLOSSY_SHEET_PRICE:NORMAL_SHEET_PRICE;
    return {
      pagesPerSheet,
      printedSidesPerCopy,
      sheetsPerCopy,
      totalSheets,
      pricePerSheet,
      price:Number((totalSheets*pricePerSheet).toFixed(2))
    };
  }
  function options(values,selected){
    return values.map(value=>'<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(value)+'</option>').join('');
  }
  function pageStatus(item){
    if(item.fileType!=='application/pdf')return 'صورة واحدة — تُحسب ورقة لكل نسخة';
    if(item.pageStatus==='reading')return 'جارٍ قراءة صفحات ملف PDF...';
    if(item.pageStatus==='error')return 'تعذرت قراءة الملف؛ أعد حفظه كـ PDF عادي';
    if(item.pageStatus==='manual'&&!item.pageCount)return 'أدخل عدد صفحات PDF لحساب السعر';
    return item.pageCount+' صفحة';
  }
  function cardPriceText(item){
    const estimate=getEstimate(item);
    if(estimate)return item.fileType==='application/pdf'
      ?'تكلفة هذا الملف: '+formatMoney(estimate.price)+' · '+estimate.totalSheets+' ورقة × '+formatMoney(estimate.pricePerSheet)
      :'تكلفة الصورة: '+formatMoney(estimate.price)+' · صورة واحدة × '+item.copies+' نسخة';
    if(item.fileType==='application/pdf'&&item.pageStatus==='reading')return 'جارٍ حساب التكلفة...';
    if(item.fileType==='application/pdf'&&item.pageStatus==='manual'&&!item.pageCount)return 'أدخل عدد صفحات PDF لحساب التكلفة';
    return 'السعر يحتاج مراجعة المطبعة';
  }
  function fileCard(item,index){
    const special=item.service==='شهادات'||item.service==='صور شخصية';
    const manualPageCount=item.preuploadedFile&&item.fileType==='application/pdf'
      ?'<label>عدد صفحات ملف PDF<input data-field="pageCount" type="number" min="1" max="10000" step="1" value="'+esc(item.pageCount||'')+'" placeholder="اكتب عدد الصفحات" required><small>أدخل عدد صفحات الملف حتى يظهر الحساب الصحيح.</small></label>'
      :'';
    return '<article class="file-item-card" data-item-id="'+esc(item.id)+'">'+
      '<div class="file-item-head"><div class="file-item-title"><span class="file-item-number">'+(index+1)+'</span><div><b>'+esc(item.file.name)+'</b><small>'+esc((item.file.size/1024/1024).toFixed(2))+' MB · '+esc(pageStatus(item))+'</small></div></div><button type="button" class="file-remove" data-remove-item="'+esc(item.id)+'">حذف الملف ×</button></div>'+
      '<div class="file-item-grid">'+
        '<label>الخدمة<select data-field="service">'+options(availableServices(item),item.service)+'</select></label>'+
        '<label>نوع الورق<select data-field="paper">'+PAPERS.map(value=>'<option value="'+esc(value)+'" '+(value===item.paper?'selected':'')+' '+(special&&value==='ورق عادي'?'disabled':'')+'>'+esc(value)+'</option>').join('')+'</select></label>'+
        '<label>المقاس<select data-field="size">'+options(SIZES,item.size)+'</select></label>'+
        '<label>التقفيل<select data-field="finish">'+options(FINISHES,item.finish)+'</select></label>'+
        '<label data-pages-per-sheet-field '+(special||item.fileType!=='application/pdf'?'hidden':'')+'>عدد الصفحات في الورقة الواحدة<select data-field="pagesPerSheet">'+PAGE_LAYOUTS.map(value=>'<option value="'+value+'" '+(value===Number(item.pagesPerSheet||1)?'selected':'')+'>'+new Intl.NumberFormat('ar-EG').format(value)+(value===1?' صفحة':' صفحات')+'</option>').join('')+'</select><small>في الطباعة وجهين، هذا العدد يكون على كل وجه من الورقة.</small></label>'+
        manualPageCount+
        '<label>عدد النسخ<input data-field="copies" type="number" min="1" max="500" step="1" value="'+esc(item.copies)+'" required></label>'+
      '</div>'+
      '<label class="file-item-notes">ملاحظات تخص هذا الملف<textarea data-field="notes" rows="2" placeholder="مثال: الطباعة من صفحة ١ إلى ١٠ فقط">'+esc(item.notes||'')+'</textarea></label>'+
      '<div class="file-item-price" aria-live="polite">'+esc(cardPriceText(item))+'</div>'+
      '<small class="file-upload-status">'+esc(item.uploadStatus||'جاهز للرفع مع الطلب')+'</small>'+
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
    const bindingFee=items.some(item=>item.finish==='تكعيب')?BINDING_FEE:0;
    const imageItems=items.filter(item=>item.fileType.startsWith('image/'));
    const totalImages=imageItems.length;
    const totalPrintedImages=imageItems.reduce((sum,item)=>sum+Number(item.copies||1),0);
    const imageSummary=totalImages
      ?'<div class="price-estimate-file image-count-summary"><div class="price-estimate-file-head"><b>إجمالي الصور المرفوعة</b><strong>'+new Intl.NumberFormat('ar-EG').format(totalImages)+' صورة</strong></div><small>بعد احتساب النسخ: '+new Intl.NumberFormat('ar-EG').format(totalPrintedImages)+' صورة مطبوعة</small></div>'
      :'';
    estimateHint.textContent=allPriced
      ?'تم حساب تكلفة كل الملفات حسب إعدادات كل ملف.'
      :'جارٍ استكمال قراءة بعض الملفات؛ سيظهر الحساب الكامل بعد انتهاء القراءة.';
    estimateLines.innerHTML=imageSummary+items.map((item,index)=>{
      const estimate=estimates[index];
      const details=[
        item.service,
        item.paper,
        item.size,
        'التقفيل: '+item.finish,
        'النسخ: '+item.copies
      ].join(' · ');
      const pageDetails=estimate
        ?(item.fileType==='application/pdf'
          ?'صفحات الملف: '+item.pageCount+' · صفحات في الورقة: '+estimate.pagesPerSheet+' · الأوراق لكل نسخة: '+estimate.sheetsPerCopy+' · إجمالي الأوراق: '+estimate.totalSheets+' · سعر الورقة: '+formatMoney(estimate.pricePerSheet)
          :'عدد الصور: ١ · بعد النسخ: '+item.copies+' صورة مطبوعة · إجمالي الأوراق: '+estimate.totalSheets+' · سعر الورقة: '+formatMoney(estimate.pricePerSheet))
        :pageStatus(item);
      const price=estimate?formatMoney(estimate.price):(item.pageStatus==='reading'?'جارٍ الحساب':'يحتاج مراجعة');
      return '<div class="price-estimate-file"><div class="price-estimate-file-head"><b>'+(index+1)+'. '+esc(item.file.name)+'</b><strong>'+esc(price)+'</strong></div><small>'+esc(details)+'</small><small>'+esc(pageDetails)+'</small></div>';
    }).join('')+(bindingFee
      ?'<div class="price-estimate-file"><div class="price-estimate-file-head"><b>رسوم التكعيب على الأوردر (مرة واحدة)</b><strong>'+esc(formatMoney(bindingFee))+'</strong></div></div>'
      :'');
    estimateTotalLabel.textContent=allPriced?'إجمالي كل الملفات والرسوم':'الإجمالي المحسوب حاليًا';
    estimateTotal.textContent=priced.length||bindingFee?formatMoney(subtotal+bindingFee):'جارٍ الحساب';
    estimateNote.textContent='سعر الورقة العادية ٠٫٧٥ جنيه (٧٥ قرش)، والجلوسي ٥ جنيه للورقة، ورسوم التكعيب ١٠ جنيه على الأوردر مرة واحدة. السعر النهائي يخضع لمراجعة المطبعة.';
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

  async function addSelectedFiles(selected,{fromShare=false}={}){
    if(!selected.length)return;
    let added=0;
    let limitReached=false;
    for(const file of selected){
      if(items.length>=MAX_FILES){limitReached=true;break;}
      const type=fileTypeOf(file);
      if(!type){fileHelp.textContent='الملف '+file.name+' غير مدعوم. ارفع PDF أو JPG أو PNG.';continue;}
      if(file.size<1||file.size>MAX_FILE){fileHelp.textContent='حجم الملف '+file.name+' غير صالح أو أكبر من الحد المسموح.';continue;}
      const item={
        id:crypto.randomUUID(),file,fileType:type,
        service:(type!=='application/pdf'&&isDuplexService(service.value))?oneSidedService(service.value):(service.value||SERVICES[0]),
        paper:(service.value==='شهادات'||service.value==='صور شخصية')?'ورق جلوسي':'ورق عادي',
        size:SIZES[0],finish:FINISHES[0],copies:1,pagesPerSheet:1,pageCount:null,
        pageStatus:type==='application/pdf'?'reading':'image',pageReadStarted:false,notes:'',
        uploadStatus:fromShare?'وصل من المشاركة — جاهز للإعداد':'جاهز للرفع مع الطلب'
      };
      items.push(item);added++;
    }
    renderFiles();
    fileHelp.textContent=limitReached
      ?'الحد الأقصى '+MAX_FILES+' ملفًا في الطلب الواحد. أُضيفت الملفات المتاحة فقط.'
      :added?(fromShare?'تم استلام '+added+' ملف من المشاركة. اختر إعدادات كل ملف.':'تمت إضافة '+added+' ملف. يمكنك إضافة ملفات أخرى أو تعديل إعدادات كل ملف على حدة.')
      :'لم تتم إضافة ملفات جديدة.';
    for(const item of items.filter(value=>value.pageStatus==='reading'&&!value.pageCount&&!value.pageReadStarted)){
      item.pageReadStarted=true;
      try{item.pageCount=await readPdfPageCount(item.file);item.pageStatus='ready';}
      catch(error){item.pageStatus='error';item.pageError=error.message||'تعذرت قراءة ملف PDF.';}
      renderFiles();
    }
  }
  fileInput.addEventListener('change',()=>{
    const selected=Array.from(fileInput.files||[]);
    fileInput.value='';
    void addSelectedFiles(selected);
  });
  async function consumeAndroidShare(){
    const params=new URLSearchParams(location.search);
    if(params.get('shared')!=='1'&&!params.has('share-error'))return;
    if(params.get('shared')==='1'){
      try{
        const records=await takePendingSharedFiles();
        const files=records.flatMap(record=>record.files||[]);
        const rejected=records.reduce((sum,record)=>sum+Number(record.rejectedCount||0),0);
        const overflow=records.reduce((sum,record)=>sum+Number(record.overflowCount||0),0);
        await addSelectedFiles(files,{fromShare:true});
        if(rejected||overflow)fileHelp.textContent+=' تم تجاهل '+(rejected+overflow)+' ملف غير مدعوم أو زائد عن الحد.';
      }catch(error){fileHelp.textContent='تعذر استيراد الملفات المشتركة. افتح الموقع وحاول المشاركة مرة أخرى.';}
    }else{
      fileHelp.textContent=params.get('share-error')==='no-files'
        ?'لم نعثر على PDF أو JPG أو PNG في المشاركة.'
        :'تعذر استقبال الملف من قائمة المشاركة. حاول مرة أخرى.';
    }
    const cleanUrl=new URL(location.href);
    cleanUrl.searchParams.delete('shared');cleanUrl.searchParams.delete('share-error');
    history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
  }
  async function consumeIosShare(){
    const fragment=new URLSearchParams(location.hash.replace(/^#/,''));
    const token=fragment.get('ostaz-share');
    if(!token)return;
    history.replaceState(null,'',location.pathname+location.search);
    fileHelp.textContent='جارٍ استيراد الملف الذي أرسلته من قائمة المشاركة...';
    try{
      const response=await fetch('/api/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'import',token})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'تعذر استيراد الملف');
      let added=0;
      for(const file of result.files||[]){
        if(items.length>=MAX_FILES)break;
        const type=fileTypeOf({name:file.name,type:file.type});
        if(!type||!file.pathname||!Number.isSafeInteger(Number(file.size))||Number(file.size)<1)continue;
        const pageCount=Number.isInteger(file.pageCount)&&file.pageCount>0?file.pageCount:null;
        const special=service.value==='شهادات'||service.value==='صور شخصية';
        const fileObject={name:file.name,size:Number(file.size),type};
        items.push({
          id:crypto.randomUUID(),file:fileObject,
          preuploadedFile:{pathname:file.pathname,name:file.name,type,size:Number(file.size)},
          fileType:type,
          service:(type!=='application/pdf'&&isDuplexService(service.value))?oneSidedService(service.value):(service.value||SERVICES[0]),
          paper:special?'ورق جلوسي':'ورق عادي',size:SIZES[0],finish:FINISHES[0],copies:1,pagesPerSheet:1,
          pageCount,pageStatus:type==='application/pdf'?(pageCount?'ready':'manual'):'image',
          pageReadStarted:false,notes:'',uploadStatus:'تم استيراده من واتساب — جاهز للإعداد'
        });
        added++;
      }
      renderFiles();
      fileHelp.textContent=added
        ?'تم استيراد '+added+' ملف من واتساب. راجع عدد صفحات PDF إذا طُلب منك، ثم اختر إعدادات الطباعة.'
        :'لم تتم إضافة ملفات جديدة؛ راجع الحد الأقصى للملفات في الطلب.';
    }catch(error){fileHelp.textContent=error.message||'تعذر استيراد الملف. أعد مشاركته من واتساب.';}
  }

  filesHost.addEventListener('change',event=>{
    const control=event.target.closest('[data-field]');
    if(!control)return;
    const card=control.closest('[data-item-id]');
    const item=items.find(value=>value.id===card?.dataset.itemId);
    if(!item)return;
    const field=control.dataset.field;
    item[field]=field==='pageCount'?(control.value===''?null:Number(control.value)):control.value;
    if(field==='pageCount')item.pageStatus=item.pageCount?'ready':'manual';
    if(field==='service'){
      delete item.serviceBeforeGlossy;
      const special=item.service==='شهادات'||item.service==='صور شخصية';
      if(special){
        item.pagesPerSheet=1;
        item.paper='ورق جلوسي';
      }
    }
    if(field==='paper'){
      if(item.paper==='ورق جلوسي'&&isDuplexService(item.service)){
        item.serviceBeforeGlossy=item.service;
        item.service=oneSidedService(item.service);
      }else if(item.paper==='ورق عادي'&&item.serviceBeforeGlossy){
        item.service=item.serviceBeforeGlossy;
        delete item.serviceBeforeGlossy;
      }
      if(item.service==='شهادات'||item.service==='صور شخصية')item.paper='ورق جلوسي';
    }
    if(field==='service'||field==='paper'||field==='pageCount')renderFiles();
    else renderEstimate();
  });
  filesHost.addEventListener('input',event=>{
    const control=event.target.closest('[data-field]');
    if(!control)return;
    const card=control.closest('[data-item-id]');
    const item=items.find(value=>value.id===card?.dataset.itemId);
    if(!item)return;
    const field=control.dataset.field;
    item[field]=field==='pageCount'?(control.value===''?null:Number(control.value)):control.value;
    if(field==='pageCount')item.pageStatus=item.pageCount?'ready':'manual';
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
    const orderData={
      customer:form.elements.customer.value.trim(),
      phone:form.elements.phone.value.trim(),
      notes:form.elements.notes.value.trim(),
      fulfillmentMethod:fulfillmentMethod.value,
      deliveryAddress:deliveryAddress.value.trim()
    };
    if(!['pickup','delivery'].includes(orderData.fulfillmentMethod)){
      notice.textContent='اختر طريقة الاستلام.';return;
    }
    if(orderData.fulfillmentMethod==='delivery'&&!orderData.deliveryAddress){
      notice.textContent='اكتب عنوان التوصيل بالتفصيل.';deliveryAddress.focus();return;
    }
    if(orderData.fulfillmentMethod==='pickup')orderData.deliveryAddress='';
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
    form.querySelectorAll('input,select,textarea,button').forEach(control=>{control.disabled=true;});
    submit.textContent='جارٍ تجهيز الطلب...';
    const uploadedItems=[];
    try{
      for(let index=0;index<items.length;index++){
        const item=items[index];
        item.uploadStatus='جارٍ الرفع...';
        const card=filesHost.querySelector('[data-item-id="'+item.id+'"]');
        const status=card?.querySelector('.file-upload-status');
        if(status)status.textContent='جارٍ رفع الملف '+(index+1)+' من '+items.length+'...';
        let blob;
        if(item.preuploadedFile){
          blob=item.preuploadedFile;
          item.uploadStatus='تم استيراده من المشاركة';
          if(status)status.textContent='تم استيراده مسبقًا';
        }else{
          const uploadFile=item.file.type===item.fileType?item.file:new File([item.file],item.file.name,{type:item.fileType});
          const pathname='orders/'+crypto.randomUUID()+'/'+item.file.name.replace(/[\\/]/g,'_');
          blob=await upload(pathname,uploadFile,{
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
        }
        if(status)status.textContent='اكتمل الرفع';
        uploadedItems.push({
          service:item.service,
          paper:item.paper,
          size:item.size,
          finish:item.finish,
          copies:Number(item.copies),
          pagesPerSheet:Number(item.pagesPerSheet||1),
          notes:item.notes,
          pageCount:item.pageCount,
          file:{pathname:blob.pathname,name:item.file.name,type:item.fileType,size:item.file.size}
        });
      }
      fileHelp.textContent='اكتمل رفع كل الملفات. جارٍ تسجيل الطلب...';
      submit.textContent='جارٍ تسجيل الطلب...';
      const response=await fetch('/api/orders',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          ...orderData,
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
      help.textContent='تم استلام '+items.length+' ملفًا. '+(orderData.fulfillmentMethod==='delivery'?'اخترت التوصيل إلى العنوان المسجل.':'اخترت الاستلام من الفرع.')+' احتفظ برقم الطلب لمتابعة كل الملفات.';
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
      syncFulfillmentFields();
      items.splice(0,items.length);
      syncServices();
      renderFiles();
      fileHelp.textContent='يمكنك اختيار عدة ملفات PDF مرة واحدة، أو الضغط مجددًا لإضافة ملفات أخرى. الحد الأقصى ٢٠ ملفًا للطلب.';
    }catch(error){
      notice.textContent=error.message||'حدث خطأ. حاول مرة أخرى.';
      fileHelp.textContent='لم يكتمل إرسال الطلب. الملفات التي اكتمل رفعها ستظل محفوظة مؤقتًا؛ حاول مرة أخرى.';
    }finally{
      form.querySelectorAll('input,select,textarea,button').forEach(control=>{control.disabled=false;});
      submit.innerHTML='إرسال الطلب <span aria-hidden="true">←</span>';
    }
  });
  const year=document.getElementById('year');
  if(year)year.textContent=new Date().getFullYear();
  syncServices();
  syncFulfillmentFields();
  renderFiles();
  void consumeAndroidShare();
  void consumeIosShare();
}
