const form=document.getElementById('trackForm');
const input=document.getElementById('orderCode');
const resultHost=document.getElementById('trackResult');
const message=document.getElementById('trackMessage');
const labels={new:'تم استلام الطلب',confirmed:'تم تأكيد الطلب',printing:'طلبك قيد الطباعة',ready:'الطلب جاهز للتسليم',delivered:'تم تسليم الطلب',cancelled:'تم إلغاء الطلب'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=value=>value?new Date(value).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
async function track(code){
  message.textContent='جاري البحث عن طلبك...';resultHost.hidden=true;
  try{
    const response=await fetch('/api/track?code='+encodeURIComponent(code),{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر العثور على الطلب');
    const order=data.order;
    const fulfillmentLabel=order.fulfillment_method==='delivery'?'توصيل للعنوان':'استلام من الفرع';
    const history=Array.isArray(order.status_history)?order.status_history:[];
    const timeline=history.map(item=>'<li class="track-event"><span class="track-dot"></span><div><b>'+esc(labels[item.status]||item.status)+'</b><small>'+esc(dateText(item.at))+'</small>'+(item.message?'<p>'+esc(item.message)+'</p>':'')+'</div></li>').join('');
    const files=Array.isArray(order.files)?order.files:[];
    const priced=files.filter(file=>file.quoted_price!=null);
    const bindingFee=Number(order.binding_fee||0);
    const partialTotal=priced.reduce((sum,file)=>sum+Number(file.quoted_price),0)+bindingFee;
    const allPriced=files.length>0&&priced.length===files.length;
    const totalImages=files.reduce((sum,file)=>sum+Number(file.image_count??(String(file.file_type||'').startsWith('image/')?1:0)),0);
    const totalPrintedImages=files.reduce((sum,file)=>sum+Number(file.printed_image_count??(String(file.file_type||'').startsWith('image/')?(file.image_count??1)*(file.copies||1):0)),0);
    const imageSummary=totalImages?'<div class="track-price-total"><small>إجمالي الصور المرفوعة: '+totalImages+' صورة · بعد النسخ: '+totalPrintedImages+' صورة مطبوعة</small></div>':'';
    const hasOrderTotal=order.quoted_price!=null;
    const fileRows=files.map((file,index)=>{
      const details=[
        file.service_type||'—',
        file.paper_type||'—',
        file.paper_size||'—',
        'التقفيل: '+(file.finishing||'—'),
        'النسخ: '+(file.copies||1)
      ].join(' · ');
      const isImage=Number(file.image_count??0)>0||String(file.file_type||'').startsWith('image/');
      const pages=isImage
        ?'عدد الصور: '+(file.image_count??1)+' · بعد النسخ: '+(file.printed_image_count??((file.image_count??1)*(file.copies||1)))+' صورة مطبوعة · إجمالي الأوراق: '+(file.total_sheets??'—')+' · سعر الورقة: '+(file.price_per_sheet!=null?Number(file.price_per_sheet).toFixed(2)+' جنيه':'—')
        :'الصفحات: '+file.page_count+' · صفحات في الورقة: '+(file.pages_per_sheet??1)+' · الأوراق لكل نسخة: '+(file.sheets_per_copy??'—')+' · إجمالي الأوراق: '+(file.total_sheets??'—')+' · سعر الورقة: '+(file.price_per_sheet!=null?Number(file.price_per_sheet).toFixed(2)+' جنيه':'—');
      const price=file.quoted_price!=null?Number(file.quoted_price).toFixed(2)+' جنيه':'يحدد بعد مراجعة المطبعة';
      return '<article class="track-file-item"><div><b>'+esc((index+1)+'. '+(file.file_name||'ملف الطباعة'))+'</b><strong>'+esc(price)+'</strong></div><small>'+esc(details)+'</small><small>'+esc(pages)+'</small>'+(file.notes?'<p>'+esc(file.notes)+'</p>':'')+'</article>';
    }).join('');
    const bindingFeeRow=bindingFee>0?'<div class="track-price-total"><small>رسوم التكعيب (مرة واحدة على الطلب)</small><strong>'+esc(bindingFee.toFixed(2))+' جنيه</strong></div>':'';
    const priceSummary=files.length
      ?'<div class="track-price-summary"><div class="track-files-heading"><b>تفاصيل الملفات ('+files.length+')</b></div>'+imageSummary+fileRows+bindingFeeRow+'<div class="track-price-total"><small>'+(hasOrderTotal?'إجمالي الطلب المسجل':(priced.length?'مجموع الملفات التي تم حسابها':'الإجمالي بعد المراجعة'))+'</small><strong>'+(hasOrderTotal?esc(Number(order.quoted_price).toFixed(2))+' جنيه':(priced.length?esc(partialTotal.toFixed(2))+' جنيه':'بعد المراجعة'))+'</strong></div><p>'+(hasOrderTotal?'هذا هو إجمالي الطلب المسجل لدى المطبعة، ويخضع للتأكيد قبل التنفيذ.':'بعض الملفات تحتاج تسعيرًا يدويًا؛ المطبعة ستؤكد الإجمالي النهائي بعد مراجعة الطلب.')+'</p></div>'
      :'';
    resultHost.innerHTML='<div class="track-result-head"><div><small>رقم الطلب</small><h2>'+esc(order.order_code)+'</h2></div><span class="status-pill status-'+esc(order.status)+'">'+esc(labels[order.status]||order.status)+'</span></div><div class="track-service"><small>الخدمة المطلوبة</small><b>'+esc(order.service_type)+'</b><small>طريقة الاستلام: '+esc(fulfillmentLabel)+'</small><small>تاريخ استلام الطلب: '+esc(dateText(order.created_at))+'</small></div>'+priceSummary+'<h3>مراحل طلبك</h3><ol class="track-timeline">'+timeline+'</ol>';
    resultHost.hidden=false;message.textContent='';
  }catch(error){message.textContent=error.message;resultHost.hidden=true;}
}
form.addEventListener('submit',event=>{event.preventDefault();const code=input.value.trim().toUpperCase();input.value=code;track(code);});
const initial=new URLSearchParams(location.search).get('code');
if(initial){input.value=initial.toUpperCase();track(input.value);}
