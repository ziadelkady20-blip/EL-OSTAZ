const loginView=document.getElementById('loginView');
const dashboard=document.getElementById('dashboardView');
const loginForm=document.getElementById('loginForm');
const loginError=document.getElementById('loginError');
const ordersHost=document.getElementById('orders');
const statusLabels={new:'جديد',confirmed:'تم التأكيد',printing:'قيد الطباعة',ready:'جاهز للتسليم',delivered:'تم التسليم',cancelled:'ملغي'};
const statusOptions=Object.entries(statusLabels);
let allOrders=[];

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=value=>value?new Date(value).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
function showDashboard(username){
  loginView.hidden=true;
  dashboard.hidden=false;
  document.getElementById('adminIdentity').textContent='مرحبًا، '+username;
  loadOrders();
  setupPushNotifications();
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
    const haystack=[o.order_code,o.customer_name,o.phone,o.delivery_address].join(' ').toLowerCase();
    return matchesStatus&&haystack.includes(query);
  });
  if(!visible.length){ordersHost.innerHTML='<div class="empty">لا توجد طلبات مطابقة للبحث الحالي.</div>';return;}
  ordersHost.innerHTML=visible.map(order=>{
    const history=Array.isArray(order.status_history)?order.status_history:[];
    const timeline=history.map(item=>'<li><b>'+esc(statusLabels[item.status]||item.status)+'</b><small>'+esc(dateText(item.at))+'</small>'+(item.message?'<p>'+esc(item.message)+'</p>':'')+'</li>').join('');
    const options=statusOptions.map(([value,label])=>'<option value="'+value+'" '+(order.status===value?'selected':'')+'>'+label+'</option>').join('');
    const orderFiles=Array.isArray(order.files)&&order.files.length?order.files:[{
      file_name:order.file_name,
      file_type:order.file_type,
      service_type:order.service_type,
      paper_type:order.paper_type,
      paper_size:order.paper_size,
      finishing:order.finishing,
      copies:order.copies,
      page_count:order.page_count,
      quoted_price:order.quoted_price
    }];
    const fulfillmentMarkup='<p class="order-customer-note"><b>طريقة الاستلام:</b> '+(order.fulfillment_method==='delivery'?'توصيل للعنوان':'استلام من الفرع')+(order.fulfillment_method==='delivery'?'<br><b>عنوان التوصيل:</b> '+esc(order.delivery_address||'—'):'')+'</p>';
    const filesMarkup='<section class="admin-order-files"><div class="admin-order-files-title"><b>ملفات الطلب ('+orderFiles.length+')</b><strong>'+(order.quoted_price!=null?esc(Number(order.quoted_price).toFixed(2))+' جنيه':'الإجمالي يحتاج مراجعة')+'</strong></div>'+orderFiles.map((file,index)=>'<article class="admin-order-file"><div class="admin-order-file-head"><b>'+esc((index+1)+'. '+(file.file_name||'ملف الطباعة'))+'</b><a class="btn light file-download" href="/api/orders/file?id='+order.id+'&fileIndex='+index+'">تنزيل الملف ↓</a></div><div class="admin-order-file-grid"><div><small>الخدمة</small><b>'+esc(file.service_type||'—')+'</b></div><div><small>الورق والمقاس</small><b>'+esc((file.paper_type||'—')+' · '+(file.paper_size||'—'))+'</b></div><div><small>التقفيل والنسخ</small><b>'+esc((file.finishing||'—')+' · '+(file.copies||1)+' نسخة')+'</b></div><div><small>عدد الصفحات</small><b>'+((file.page_count)?esc(file.page_count)+' صفحة':'—')+'</b></div><div><small>عدد الأوراق المطبوعة</small><b>'+(file.total_sheets!=null?esc(file.total_sheets)+' ورقة':'—')+'</b></div><div><small>تكلفة الملف</small><b>'+(file.quoted_price!=null?esc(Number(file.quoted_price).toFixed(2))+' جنيه':'يحتاج تسعير')+'</b></div></div>'+(file.notes?'<p class="order-customer-note"><b>ملاحظات الملف:</b> '+esc(file.notes)+'</p>':'')+'</article>').join('')+'</section>';
    return '<article class="admin-order-card" data-order="'+order.id+'">'+
      '<div class="admin-order-top"><div><span class="order-code">'+esc(order.order_code)+'</span><h3>'+esc(order.customer_name)+'</h3><small>'+esc(order.phone)+' · '+esc(dateText(order.created_at))+'</small></div><span class="status-pill status-'+esc(order.status)+'">'+esc(statusLabels[order.status]||order.status)+'</span></div>'+
      fulfillmentMarkup+
      filesMarkup+
      (order.notes?'<p class="order-customer-note"><b>ملاحظات عامة:</b> '+esc(order.notes)+'</p>':'')+
      '<div class="admin-order-controls"><label>تحديث الحالة<select class="next-status">'+options+'</select></label><label>السعر النهائي للطلب (جنيه)<input class="quoted-price" type="number" min="0" step="0.01" value="'+(order.quoted_price??'')+'" placeholder="اكتب الإجمالي بعد المراجعة"></label><label class="customer-message">رسالة تظهر للعميل<input class="status-note" maxlength="300" placeholder="مثال: طلبك جاهز للاستلام"></label><button class="btn save-status" type="button">حفظ التحديث</button></div>'+
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

let pushPublicKey='';
let pushRegistration=null;
const pushButton=document.getElementById('enablePushButton');
const pushStatus=document.getElementById('pushStatus');
const pushHelp=document.getElementById('pushHelp');

function isInstalledAdminApp(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function base64UrlToBytes(value){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=window.atob(base64);
  return Uint8Array.from(raw,char=>char.charCodeAt(0));
}
async function setupPushNotifications(){
  if(!pushButton||!pushStatus)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
    pushButton.disabled=true;
    pushStatus.textContent='هذا المتصفح لا يدعم إشعارات الويب. حدّث iOS وافتح لوحة الإدارة من Safari.';
    return;
  }
  try{
    const response=await fetch('/api/admin/push',{credentials:'same-origin',cache:'no-store'});
    const config=await response.json();
    if(!response.ok||!config.publicKey)throw new Error('إعداد مفتاح الإشعارات غير مكتمل على السيرفر');
    pushPublicKey=config.publicKey;
    pushRegistration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    const ready=await navigator.serviceWorker.ready;
    pushRegistration=ready;
    const current=await ready.pushManager.getSubscription();
    if(current){
      await savePushSubscription(current);
      pushButton.textContent='إيقاف إشعارات هذا الجهاز';
      pushStatus.textContent='إشعارات هذا الجهاز مفعّلة. ستصلك تنبيهات الطلبات الجديدة.';
      pushButton.dataset.active='true';
    }else{
      pushButton.textContent='تفعيل إشعارات الموبايل';
      pushStatus.textContent='فعّل الإشعارات ليصلك تنبيه عند وصول طلب جديد.';
      pushButton.dataset.active='false';
    }
    if(!isInstalledAdminApp()){
      pushHelp.textContent='مهم للآيفون: افتح هذه الصفحة في Safari، اضغط مشاركة، ثم إضافة إلى الشاشة الرئيسية، فعّل «فتح كتطبيق ويب»، وافتح أيقونة الأستاذ الجديدة. بعدها اضغط تفعيل الإشعارات من داخل التطبيق.';
    }else{
      pushHelp.textContent='التطبيق مثبت على الشاشة الرئيسية. اضغط تفعيل الإشعارات واسمح بها عند ظهور رسالة iPhone.';
    }
  }catch(error){
    pushButton.disabled=true;
    pushStatus.textContent=error.message||'تعذر تجهيز إشعارات الموبايل.';
    pushHelp.textContent='تأكد من اتصال الإنترنت ثم حدّث الصفحة. إذا استمرت المشكلة راجع إعدادات السيرفر.';
  }
}
async function savePushSubscription(subscription){
  const response=await fetch('/api/admin/push',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'same-origin',
    body:JSON.stringify({subscription:subscription.toJSON()})
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'تعذر حفظ اشتراك الإشعارات');
  return data;
}
if(pushButton){
  pushButton.addEventListener('click',async()=>{
    pushButton.disabled=true;
    try{
      if(!isInstalledAdminApp()){
        pushStatus.textContent='لا يمكن تفعيل إشعارات iPhone من تبويب Safari عادي. أضف لوحة الإدارة إلى الشاشة الرئيسية وافتحها من الأيقونة أولًا.';
        pushHelp.textContent='Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية ← فتح كتطبيق ويب ← إضافة. ثم افتح تطبيق الأستاذ واضغط الزر مرة أخرى.';
        return;
      }
      if(pushButton.dataset.active==='true'){
        const subscription=await pushRegistration.pushManager.getSubscription();
        if(subscription){
          await fetch('/api/admin/push',{
            method:'DELETE',
            headers:{'Content-Type':'application/json'},
            credentials:'same-origin',
            body:JSON.stringify({endpoint:subscription.endpoint})
          });
          await subscription.unsubscribe();
        }
        pushButton.dataset.active='false';
        pushButton.textContent='تفعيل إشعارات الموبايل';
        pushStatus.textContent='تم إيقاف إشعارات هذا الجهاز.';
        return;
      }
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('لم يتم السماح بالإشعارات. فعّلها من إعدادات iPhone ثم حاول مرة أخرى.');
      const subscription=await pushRegistration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToBytes(pushPublicKey)
      });
      await savePushSubscription(subscription);
      pushButton.dataset.active='true';
      pushButton.textContent='إيقاف إشعارات هذا الجهاز';
      pushStatus.textContent='تم تفعيل الإشعارات بنجاح. سننبهك عند وصول أي طلب طباعة جديد.';
      pushHelp.textContent='تأكد أن إشعارات تطبيق الأستاذ مسموح بها من إعدادات iPhone ← الإشعارات.';
    }catch(error){
      pushStatus.textContent=error.message||'تعذر تفعيل الإشعارات.';
    }finally{
      pushButton.disabled=false;
    }
  });
}
