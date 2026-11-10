const loginView=document.getElementById('loginView');
const dashboard=document.getElementById('dashboardView');
const loginForm=document.getElementById('loginForm');
const loginError=document.getElementById('loginError');
const ordersHost=document.getElementById('orders');
const statusLabels={new:'جديد',confirmed:'تم التأكيد',printing:'قيد الطباعة',ready:'جاهز للاستلام',delivered:'تم التسليم',cancelled:'ملغي'};
const statusOptions=Object.entries(statusLabels);
let allOrders=[];

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=value=>value?new Date(value).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
function showDashboard(username){
  loginView.hidden=true;
  dashboard.hidden=false;
  document.getElementById('adminIdentity').textContent='مرحبًا، '+username;
  loadOrders();
}
async function checkSession(){
  try{
    const response=await fetch('/api/admin/me',{credentials:'same-origin'});
    const data=await response.json();
    if(response.ok&&data.authenticated)showDashboard(data.username);
    else{loginView.hidden=false;dashboard.hidden=true;}
  }catch{loginView.hidden=false;dashboard.hidden=true;}
}
loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  loginError.textContent='';
  const button=loginForm.querySelector('button');
  button.disabled=true;button.textContent='جارٍ التحقق...';
  try{
    const data=Object.fromEntries(new FormData(loginForm));
    const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'تعذر تسجيل الدخول');
    loginForm.reset();showDashboard(result.username);
  }catch(error){loginError.textContent=error.message;}
  finally{button.disabled=false;button.innerHTML='دخول لوحة التحكم <span>←</span>';}
});
document.getElementById('logoutButton').addEventListener('click',async()=>{
  await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin'});
  allOrders=[];loginView.hidden=false;dashboard.hidden=true;
});
async function loadOrders(){
  ordersHost.innerHTML='<div class="empty">جاري تحميل الطلبات...</div>';
  try{
    const response=await fetch('/api/orders',{credentials:'same-origin',cache:'no-store'});
    if(response.status===401){loginView.hidden=false;dashboard.hidden=true;return;}
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر تحميل الطلبات');
    allOrders=data.orders||[];
    renderOrders();
    document.getElementById('lastUpdated').textContent='آخر تحديث: '+new Date().toLocaleTimeString('ar-EG');
  }catch(error){ordersHost.innerHTML='<div class="empty">'+esc(error.message)+'</div>';}
}
function renderOrders(){
  document.getElementById('total').textContent=allOrders.length;
  document.getElementById('newCount').textContent=allOrders.filter(o=>o.status==='new').length;
  document.getElementById('printingCount').textContent=allOrders.filter(o=>o.status==='printing').length;
  document.getElementById('readyCount').textContent=allOrders.filter(o=>o.status==='ready').length;
  const query=(document.getElementById('searchOrders').value||'').trim().toLowerCase();
  const status=document.getElementById('statusFilter').value;
  const visible=allOrders.filter(o=>{
    const matchesStatus=!status||o.status===status;
    const haystack=[o.order_code,o.customer_name,o.phone].join(' ').toLowerCase();
    return matchesStatus&&haystack.includes(query);
  });
  if(!visible.length){ordersHost.innerHTML='<div class="empty">لا توجد طلبات مطابقة للبحث الحالي.</div>';return;}
  ordersHost.innerHTML=visible.map(order=>{
    const history=Array.isArray(order.status_history)?order.status_history:[];
    const timeline=history.map(item=>'<li><b>'+esc(statusLabels[item.status]||item.status)+'</b><small>'+esc(dateText(item.at))+'</small>'+(item.message?'<p>'+esc(item.message)+'</p>':'')+'</li>').join('');
    const options=statusOptions.map(([value,label])=>'<option value="'+value+'" '+(order.status===value?'selected':'')+'>'+label+'</option>').join('');
    return '<article class="admin-order-card" data-order="'+order.id+'">'+
      '<div class="admin-order-top"><div><span class="order-code">'+esc(order.order_code)+'</span><h3>'+esc(order.customer_name)+'</h3><small>'+esc(order.phone)+' · '+esc(dateText(order.created_at))+'</small></div><span class="status-pill status-'+esc(order.status)+'">'+esc(statusLabels[order.status]||order.status)+'</span></div>'+
      '<div class="admin-order-details"><div><small>الخدمة</small><b>'+esc(order.service_type)+'</b></div><div><small>الورق والمقاس</small><b>'+esc(order.paper_type)+' · '+esc(order.paper_size)+'</b></div><div><small>النسخ والتقفيل</small><b>'+esc(order.copies)+' نسخة · '+esc(order.finishing)+'</b></div><div><small>ملف الطباعة</small><b>'+esc(order.file_name||'لا يوجد ملف')+'</b></div></div>'+
      (order.notes?'<p class="order-customer-note"><b>ملاحظات العميل:</b> '+esc(order.notes)+'</p>':'')+
      '<div class="admin-order-controls"><label>تحديث الحالة<select class="next-status">'+options+'</select></label><label>السعر (جنيه)<input class="quoted-price" type="number" min="0" step="0.01" value="'+(order.quoted_price??'')+'" placeholder="اختياري"></label><label class="customer-message">رسالة تظهر للعميل<input class="status-note" maxlength="300" placeholder="مثال: طلبك جاهز للاستلام"></label><button class="btn save-status" type="button">حفظ التحديث</button>'+(order.file_name?'<a class="btn light file-download" href="/api/orders/file?id='+order.id+'">تنزيل الملف ↓</a>':'')+'</div>'+
      '<details class="order-history"><summary>سجل تغييرات الحالة ('+history.length+')</summary><ol>'+timeline+'</ol></details>'+
      '</article>';
  }).join('');
  ordersHost.querySelectorAll('.save-status').forEach(button=>button.addEventListener('click',updateStatus));
}
async function updateStatus(event){
  const card=event.currentTarget.closest('.admin-order-card');
  const button=event.currentTarget;
  const orderId=Number(card.dataset.order);
  const status=card.querySelector('.next-status').value;
  const quotedPrice=card.querySelector('.quoted-price').value;
  const note=card.querySelector('.status-note').value;
  button.disabled=true;button.textContent='جارٍ الحفظ...';
  try{
    const response=await fetch('/api/orders/status',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({id:orderId,status,quotedPrice,note})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'تعذر حفظ الحالة');
    document.getElementById('adminNotice').textContent='تم تحديث الطلب '+result.order.order_code+' بنجاح.';
    await loadOrders();
  }catch(error){document.getElementById('adminNotice').textContent=error.message;}
  finally{button.disabled=false;button.textContent='حفظ التحديث';}
}
document.getElementById('refresh').addEventListener('click',loadOrders);
document.getElementById('searchOrders').addEventListener('input',renderOrders);
document.getElementById('statusFilter').addEventListener('change',renderOrders);
checkSession();