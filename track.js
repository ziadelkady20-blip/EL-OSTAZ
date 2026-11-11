const form=document.getElementById('trackForm');
const input=document.getElementById('orderCode');
const resultHost=document.getElementById('trackResult');
const message=document.getElementById('trackMessage');
const labels={new:'تم استلام الطلب',confirmed:'تم تأكيد الطلب',printing:'طلبك قيد الطباعة',ready:'الطلب جاهز للاستلام',delivered:'تم تسليم الطلب',cancelled:'تم إلغاء الطلب'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=value=>value?new Date(value).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
async function track(code){
  message.textContent='جاري البحث عن طلبك...';resultHost.hidden=true;
  try{
    const response=await fetch('/api/track?code='+encodeURIComponent(code),{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر العثور على الطلب');
    const order=data.order;
    const history=Array.isArray(order.status_history)?order.status_history:[];
    const timeline=history.map(item=>'<li class="track-event"><span class="track-dot"></span><div><b>'+esc(labels[item.status]||item.status)+'</b><small>'+esc(dateText(item.at))+'</small>'+(item.message?'<p>'+esc(item.message)+'</p>':'')+'</div></li>').join('');
    const priceSummary=order.quoted_price!=null
      ?'<div class="track-price-summary"><div><small>عدد صفحات الملف</small><b>'+esc(order.page_count)+' صفحة</b></div><div><small>عدد النسخ</small><b>'+esc(order.copies)+' نسخة</b></div><div class="track-price-total"><small>الحساب المبدئي</small><strong>'+esc(Number(order.quoted_price).toFixed(2))+' جنيه</strong></div><p>السعر تقديري ويخضع لمراجعة المطبعة قبل التنفيذ.</p></div>'
      :'';
    resultHost.innerHTML='<div class="track-result-head"><div><small>رقم الطلب</small><h2>'+esc(order.order_code)+'</h2></div><span class="status-pill status-'+esc(order.status)+'">'+esc(labels[order.status]||order.status)+'</span></div><div class="track-service"><small>الخدمة المطلوبة</small><b>'+esc(order.service_type)+'</b><small>تاريخ استلام الطلب: '+esc(dateText(order.created_at))+'</small></div>'+priceSummary+'<h3>مراحل طلبك</h3><ol class="track-timeline">'+timeline+'</ol>';
    resultHost.hidden=false;message.textContent='';
  }catch(error){message.textContent=error.message;resultHost.hidden=true;}
}
form.addEventListener('submit',event=>{event.preventDefault();const code=input.value.trim().toUpperCase();input.value=code;track(code);});
const initial=new URLSearchParams(location.search).get('code');
if(initial){input.value=initial.toUpperCase();track(input.value);}
