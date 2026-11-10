const form=document.getElementById('orderForm');
if(form){
  const service=form.elements.service;
  const paper=form.elements.paper;
  const buttons=[...document.querySelectorAll('.service')];
  const fileInput=form.elements.file;
  const notice=document.getElementById('notice');
  const submit=form.querySelector('button[type="submit"]');

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
  const fileHelp=document.getElementById('fileHelp');
  fileInput.addEventListener('change',()=>{
    const file=fileInput.files[0];
    if(!file){fileHelp.textContent='الملفات المسموحة PDF وJPG وPNG، والحد الأقصى 3 ميجابايت.';return;}
    const mb=(file.size/1024/1024).toFixed(2);
    fileHelp.textContent='الملف المختار: '+file.name+' — '+mb+' ميجابايت';
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    notice.textContent='';
    const file=fileInput.files[0];
    if(!file){notice.textContent='من فضلك ارفع ملف الطباعة.';return;}
    if(file.size>3*1024*1024){notice.textContent='حجم الملف أكبر من 3 ميجابايت. اختر ملفًا أصغر.';return;}
    if(!['application/pdf','image/jpeg','image/png'].includes(file.type)){notice.textContent='نوع الملف غير مدعوم. ارفع PDF أو JPG أو PNG.';return;}
    submit.disabled=true;
    submit.textContent='جارٍ إرسال الطلب...';
    try{
      const data=new FormData(form);
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(new Error('تعذر قراءة الملف'));
        reader.readAsDataURL(file);
      });
      const response=await fetch('/api/orders',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          customer:data.get('customer'),phone:data.get('phone'),service:data.get('service'),
          paper:data.get('paper'),size:data.get('size'),finish:data.get('finish'),
          copies:data.get('copies'),notes:data.get('notes'),
          file:{name:file.name,type:file.type,base64:String(dataUrl).split(',')[1]}
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
      fileHelp.textContent='الملفات المسموحة PDF وJPG وPNG، والحد الأقصى 3 ميجابايت.';
    }catch(error){
      notice.textContent=error.message||'حدث خطأ. حاول مرة أخرى.';
    }finally{
      submit.disabled=false;
      submit.innerHTML='إرسال الطلب <span aria-hidden="true">←</span>';
    }
  });
  const year=document.getElementById('year');
  if(year)year.textContent=new Date().getFullYear();
  syncServices();
}