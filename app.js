const KEY='ostaz_print_orders_v1';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
const write=orders=>localStorage.setItem(KEY,JSON.stringify(orders));

const form=document.getElementById('orderForm');
if(form){
  const year=document.getElementById('year');
  if(year) year.textContent=new Date().getFullYear();

  const service=document.getElementById('service');
  const serviceButtons=[...document.querySelectorAll('.service')];
  const syncServices=()=>{
    serviceButtons.forEach(button=>{
      const active=button.dataset.service===service.value;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
  };

  serviceButtons.forEach(button=>button.addEventListener('click',()=>{
    service.value=button.dataset.service;
    syncServices();
    document.getElementById('order').scrollIntoView({behavior:'smooth',block:'start'});
  }));
  service.addEventListener('change',syncServices);

  const fileInput=form.elements.file;
  const fileHelp=document.getElementById('fileHelp');
  const defaultFileHelp=fileHelp?.textContent||'';
  fileInput.addEventListener('change',()=>{
    const file=fileInput.files[0];
    if(!file){if(fileHelp)fileHelp.textContent=defaultFileHelp;return}
    const size=file.size<1024*1024
      ?Math.max(1,Math.round(file.size/1024))+' KB'
      :(file.size/(1024*1024)).toFixed(2)+' MB';
    if(fileHelp)fileHelp.textContent='الملف المختار: '+file.name+' — '+size;
  });

  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=new FormData(form);
    const file=fileInput.files[0];
    if(!file)return;
    const order={
      id:'OS-'+Date.now().toString().slice(-7),
      customer:data.get('customer'),
      phone:data.get('phone'),
      service:data.get('service'),
      paper:data.get('paper'),
      size:data.get('size'),
      finish:data.get('finish'),
      copies:data.get('copies'),
      fileName:file.name,
      notes:data.get('notes'),
      status:'جديد',
      created:new Date().toLocaleString('ar-EG')
    };
    const orders=read();
    orders.unshift(order);
    write(orders);
    document.getElementById('notice').textContent='تم تسجيل الطلب التجريبي رقم '+order.id+' بنجاح.';
    form.reset();
    syncServices();
    if(fileHelp)fileHelp.textContent=defaultFileHelp;
  });
}

const host=document.getElementById('orders');
if(host){
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  function render(){
    const orders=read();
    document.getElementById('total').textContent=orders.length;
    document.getElementById('newCount').textContent=orders.filter(order=>order.status==='جديد').length;
    document.getElementById('working').textContent=orders.filter(order=>order.status==='قيد التنفيذ').length;
    document.getElementById('done').textContent=orders.filter(order=>order.status==='مكتمل').length;
    if(!orders.length){
      host.innerHTML='<div class="empty">لا توجد طلبات حتى الآن.</div>';
      return;
    }
    host.innerHTML=orders.map(order=>'<article class="order-row">'+
      '<div><b>'+esc(order.customer)+'</b><small>'+esc(order.id)+' • '+esc(order.created)+'</small></div>'+
      '<div>'+esc(order.service)+'<small>'+esc(order.paper)+' • '+esc(order.size)+'</small></div>'+
      '<div>'+esc(order.phone)+'<small>'+esc(order.fileName)+'</small></div>'+
      '<div><b>'+esc(order.copies)+' نسخة</b><small>'+esc(order.finish)+'</small></div>'+
      '<select aria-label="حالة الطلب" data-id="'+esc(order.id)+'">'+
        '<option '+(order.status==='جديد'?'selected':'')+'>جديد</option>'+
        '<option '+(order.status==='قيد التنفيذ'?'selected':'')+'>قيد التنفيذ</option>'+
        '<option '+(order.status==='مكتمل'?'selected':'')+'>مكتمل</option>'+
        '<option '+(order.status==='ملغي'?'selected':'')+'>ملغي</option>'+
      '</select></article>').join('');
    host.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>{
      const all=read();
      const item=all.find(order=>order.id===select.dataset.id);
      if(item){item.status=select.value;write(all);render()}
    }));
  }
  document.getElementById('refresh').addEventListener('click',render);
  render();
}