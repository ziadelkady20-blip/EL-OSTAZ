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
    const files=Array.isArray(order.files)?order.files:[];
    const priced=files.filter(file=>file.quoted_price!=null);
    const partialTotal=priced.reduce((sum,file)=>sum+Number(file.quoted_price),0);
    const allPriced=files.length>0&&priced.length===files.length;
    const hasOrderTotal=order.quoted_price!=null;
    const fileRows=files.map((file,index)=>{
      const details=[
        file.service_type||'—',
        file.paper_type||'—',
        file.paper_size||'—',
        'التقفيل: '+(file.finishing||'—'),
        'النسخ: '+(file.copies||1)
      ].join(' · ');
      const pages=file.page_count!=null?'الصفحات: '+file.page_count+' · الأوراق لكل نسخة: '+(file.sheets_per_copy??'—')+' · إجمالي الأوراق: '+(file.total_sheets??'—'):'ملف صورة أو خدمة تحتاج مراجعة';
      const price=file.quoted_price!=null?Number(file.quoted_price).toFixed(2)+' جنيه':'يحدد بعد مراجعة المطبعة';
      return '<article class="track-file-item"><div><b>'+esc((index+1)+'. '+(file.file_name||'ملف الطباعة'))+'</b><strong>'+esc(price)+'</strong></div><small>'+esc(details)+'</small><small>'+esc(pages)+'</small>'+(file.notes?'<p>'+esc(file.notes)+'</p>':'')+'</article>';
    }).join('');
    const priceSummary=files.length
      ?'<div class="track-price-summary"><div class="track-files-heading"><b>تفاصيل الملفات ('+files.length+')</b></div>'+fileRows+'<div class="track-price-total"><small>'+(hasOrderTotal?'إجمالي الطلب المسجل':(priced.length?'مجموع الملفات التي تم حسابها':'الإجمالي بعد المراجعة'))+'</small><strong>'+(hasOrderTotal?esc(Number(order.quoted_price).toFixed(2))+' جنيه':(priced.length?esc(partialTotal.toFixed(2))+' جنيه':'بعد المراجعة'))+'</strong></div><p>'+(hasOrderTotal?'هذا هو إجمالي الطلب المسجل لدى المطبعة، ويخضع للتأكيد قبل التنفيذ.':'بعض الملفات تحتاج تسعيرًا يدويًا؛ المطبعة ستؤكد الإجمالي النهائي بعد مراجعة الطلب.')+'</p></div>'
      :'';
    resultHost.innerHTML='<div class="track-result-head"><div><small>رقم الطلب</small><h2>'+esc(order.order_code)+'</h2></div><span class="status-pill status-'+esc(order.status)+'">'+esc(labels[order.status]||order.status)+'</span></div><div class="track-service"><small>الخدمة المطلوبة</small><b>'+esc(order.service_type)+'</b><small>تاريخ استلام الطلب: '+esc(dateText(order.created_at))+'</small></div>'+priceSummary+'<h3>مراحل طلبك</h3><ol class="track-timeline">'+timeline+'</ol>';
    resultHost.hidden=false;message.textContent='';
  }catch(error){message.textContent=error.message;resultHost.hidden=true;}
}
form.addEventListener('submit',event=>{event.preventDefault();const code=input.value.trim().toUpperCase();input.value=code;track(code);});
const initial=new URLSearchParams(location.search).get('code');
if(initial){input.value=initial.toUpperCase();track(input.value);}
