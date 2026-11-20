const CFG=window.CFG,sb=supabase.createClient(CFG.url,CFG.key);
const L=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},S=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
let db=L('db')||{products:[],sales:[],purchases:[],expenses:[]},q=L('q')||[],role=L('role'),user=L('user'),tab='dash',charts=[],cart=[{}],busy=false;
const inv={day:'',customer:'',ctype:'خرده',pay:'نقدی'},V={},PAY=['نقدی','کارت‌خوان','بانکی','نسیه','چک'];
const $=s=>document.querySelector(s),n=v=>+v||0,fmt=v=>Math.round(n(v)).toLocaleString('fa-IR'),uid=()=>crypto.randomUUID();
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);inv.day=today();
const fd=d=>new Date(d).toLocaleDateString('fa-IR-u-ca-persian'),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MN=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const pk=d=>{const o={};new Intl.DateTimeFormat('en-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit'}).formatToParts(new Date(d)).forEach(p=>o[p.type]=p.value);return(o.year||o.relatedYear)+'-'+o.month};
const pkl=k=>MN[+k.split('-')[1]-1]+' '+k.split('-')[0];
const amt=s=>n(s.qty)*n(s.price),prf=s=>n(s.qty)*(n(s.price)-n(s.cost)),sum=(a,f)=>a.reduce((x,y)=>x+f(y),0);
const prod=id=>db.products.find(p=>p.id==id),isAdmin=()=>role=='admin',sortD=a=>a.slice().sort((x,y)=>y.day.localeCompare(x.day));
const toast=m=>{const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),3500)};
const persist=()=>{S('db',db);S('q',q)};
const setStat=()=>{const e=$('#stat');if(e)e.innerHTML=(navigator.onLine?'<i class=ok></i>آنلاین':'<i class=off></i>آفلاین')+(q.length?` · ${fmt(q.length)} تغییر در انتظار ارسال`:'')};
function stocks(){const m={};db.products.forEach(p=>m[p.id]=n(p.opening));db.purchases.forEach(x=>m[x.product_id]=(m[x.product_id]||0)+n(x.qty));db.sales.forEach(x=>m[x.product_id]=(m[x.product_id]||0)-n(x.qty));return m}
/* ---------- همگام‌سازی آفلاین/آنلاین ---------- */
function put(t,r){const i=db[t].findIndex(x=>x.id==r.id);i<0?db[t].push(r):db[t][i]=r;q.push({t,op:'u',r});persist();sync()}
function del(t,id){db[t]=db[t].filter(x=>x.id!=id);q.push({t,op:'d',id});persist();sync()}
async function sync(){if(!navigator.onLine||busy||!user)return;busy=true;try{
 while(q.length){const j=q[0],r=j.op=='u'?await sb.from(j.t).upsert(j.r):await sb.from(j.t).delete().eq('id',j.id);
  if(r.error){if(/fetch|network|load failed/i.test(r.error.message))throw r.error;toast('خطا در ذخیره: '+r.error.message)}q.shift();persist();setStat()}
 const nd={};for(const t of Object.keys(db)){const r=await sb.from(t).select('*').limit(50000);if(r.error)throw r.error;nd[t]=r.data}
 if(!q.length){db=nd;persist()}setStat();if(!document.activeElement?.matches('input,select'))render()}catch(e){console.warn(e)}busy=false}
/* ---------- ورود ---------- */
function loginView(){$('#app').innerHTML=`<form class=login onsubmit="return doLogin(event)"><h1>🌾 ${esc(CFG.shop)}</h1><input id=u placeholder="نام کاربری" autocomplete=username required><input id=p type=password placeholder="رمز عبور" autocomplete=current-password required><button class=pri>ورود</button></form>`}
async function doLogin(e){e.preventDefault();const r=await sb.auth.signInWithPassword({email:$('#u').value.trim().toLowerCase()+'@shop.local',password:$('#p').value});r.error?toast('نام کاربری یا رمز عبور اشتباه است'):boot();return false}
async function logout(){if(q.length&&!confirm('تغییرات ارسال‌نشده با خروج از بین می‌رود. خروج؟'))return;await sb.auth.signOut().catch(()=>{});localStorage.clear();location.reload()}
async function boot(){try{const{data}=await sb.auth.getSession();if(data.session){user=data.session.user.email.split('@')[0];
  if(navigator.onLine){const r=await sb.from('profiles').select('role').eq('id',data.session.user.id).single();if(r.data)role=r.data.role}S('user',user);S('role',role);render();sync();return}}catch(e){}
 user&&!navigator.onLine?render():loginView()}
/* ---------- نمایش ---------- */
const TABS={dash:'📊 داشبورد',sales:'🧾 فروش',stock:'📦 انبار',purchases:'🚚 خرید',expenses:'💸 هزینه‌ها'};
const go=t=>{tab=t;render()};
function render(){charts.forEach(c=>c.destroy());charts=[];
 $('#app').innerHTML=`<header><b>🌾 ${esc(CFG.shop)}</b><span id=stat></span><span>${esc(user)} (${isAdmin()?'مدیر':'فقط مشاهده'}) <button onclick=logout()>خروج</button></span></header><nav>${Object.entries(TABS).map(([k,v])=>`<a class="${k==tab?'on':''}" onclick="go('${k}')">${v}</a>`).join('')}</nav><main>${V[tab]()}</main>`;
 setStat();if(tab=='dash')drawCharts()}
const tbl=(h,rows)=>`<div class=tw><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join('')||'<tr><td colspan=99>موردی نیست</td></tr>'}</tbody></table></div>`;
const opts=(a,v)=>a.map(x=>`<option ${x==v?'selected':''}>${x}</option>`).join('');
function form(title,fields,init,save){const d=document.createElement('dialog');
 d.innerHTML=`<form method=dialog><h3>${title}</h3>${fields.map(f=>`<label>${f.l}${f.o?`<select name=${f.k}>${f.o.map(o=>`<option value="${esc(o.v??o)}" ${(o.v??o)==init[f.k]?'selected':''}>${esc(o.t??o)}</option>`).join('')}</select>`:`<input name=${f.k} type=${f.t||'text'} step=any value="${esc(init[f.k]??'')}">`}</label>`).join('')}<div><button class=pri value=ok>ذخیره</button><button value=x formnovalidate>انصراف</button></div></form>`;
 document.body.append(d);d.showModal();d.onclose=()=>{if(d.returnValue=='ok'){const o={};fields.forEach(f=>{const v=d.querySelector(`[name=${f.k}]`).value;o[f.k]=f.t=='number'?n(v):v});save(o)}d.remove()}}
/* داشبورد */
V.dash=()=>{const t=today(),mk=pk(t),sa=db.sales,st=stocks(),ms=sa.filter(s=>pk(s.day)==mk),me=db.expenses.filter(e=>pk(e.day)==mk);
 const rev=sum(ms,amt),gp=sum(ms,prf),ex=sum(me,e=>n(e.amount)),low=db.products.filter(p=>st[p.id]<=n(p.reorder)),cr={};
 sa.filter(s=>s.pay=='نسیه').forEach(s=>{const c=s.customer||'نامشخص';cr[c]=(cr[c]||0)+amt(s)});
 const k=(l,v,c)=>`<div class="kpi ${c||''}"><span>${l}</span><b>${v}</b></div>`;
 return `<div class=kpis>${k('فروش امروز',fmt(sum(sa.filter(s=>s.day==t),amt))+' ت')}${k('فروش '+pkl(mk),fmt(rev)+' ت')}${k('سود ناخالص ماه',fmt(gp)+' ت')}${k('هزینه‌های ماه',fmt(ex)+' ت','r')}${k('سود خالص ماه',fmt(gp-ex)+' ت',gp-ex>=0?'':'r')}${k('کالاهای کم‌موجودی',fmt(low.length),low.length?'y':'')}</div>
 <div class=two><section class=card><h3>روند روزانه (۳۰ روز اخیر)</h3><canvas id=c1></canvas></section><section class=card><h3>روند ماهانه</h3><canvas id=c2></canvas></section></div>
 <div class=two><section class=card><h3>هشدار انبار</h3>${tbl(['کالا','موجودی','نقطه سفارش'],low.slice(0,10).map(p=>[esc(p.name),fmt(st[p.id]),fmt(p.reorder)]))}</section>
 <section class=card><h3>فروش نسیه به تفکیک مشتری</h3>${tbl(['مشتری','مبلغ'],Object.entries(cr).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c,v])=>[esc(c),fmt(v)]))}</section></div>`};
Chart.defaults.font.family='Vazirmatn';
function drawCharts(){const days=[...Array(30)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)});
 const by=(a,f,k)=>{const m={};a.forEach(x=>m[k(x)]=(m[k(x)]||0)+f(x));return m},O={responsive:true};
 const sd=by(db.sales,amt,s=>s.day),pd=by(db.sales,prf,s=>s.day);
 charts.push(new Chart($('#c1'),{type:'line',data:{labels:days.map(d=>new Date(d).toLocaleDateString('fa-IR-u-ca-persian',{month:'numeric',day:'numeric'})),datasets:[{label:'فروش',data:days.map(d=>sd[d]||0),borderColor:'#1f6f4a',backgroundColor:'#1f6f4a22',fill:true,tension:.3},{label:'سود ناخالص',data:days.map(d=>pd[d]||0),borderColor:'#e0a100',tension:.3}]},options:O}));
 const sm=by(db.sales,amt,s=>pk(s.day)),pm=by(db.sales,prf,s=>pk(s.day)),em=by(db.expenses,e=>n(e.amount),e=>pk(e.day)),ks=[...new Set([...Object.keys(sm),...Object.keys(em)])].sort().slice(-12);
 charts.push(new Chart($('#c2'),{type:'bar',data:{labels:ks.map(pkl),datasets:[{label:'فروش',data:ks.map(k=>sm[k]||0),backgroundColor:'#1f6f4a'},{label:'هزینه',data:ks.map(k=>em[k]||0),backgroundColor:'#c0392b'},{label:'سود خالص',data:ks.map(k=>(pm[k]||0)-(em[k]||0)),backgroundColor:'#e0a100'}]},options:O}))}
/* فروش و فاکتور */
const priceOf=id=>{const p=prod(id)||{};return n(inv.ctype=='عمده'?p.wholesale||p.retail:p.retail)};
const pick=(i,id)=>{cart[i].pid=id;cart[i].price=priceOf(id);render()},repr=()=>{cart.forEach(c=>c.pid&&(c.price=priceOf(c.pid)));render()};
const tot=()=>$('#tot').textContent=fmt(sum(cart,c=>n(c.qty)*n(c.price)));
function groupInv(){const m={};db.sales.forEach(s=>{const g=m[s.invoice]??={no:s.invoice,day:s.day,customer:s.customer,pay:s.pay,total:0};g.total+=amt(s)});return Object.values(m).sort((a,b)=>b.day.localeCompare(a.day)||b.no.localeCompare(a.no,'en',{numeric:true}))}
V.sales=()=>{const st=stocks();return `${isAdmin()?`<section class=card><h3>ثبت فاکتور فروش</h3><div class=grid>
 <label>تاریخ<input type=date value="${inv.day}" oninput="inv.day=this.value"></label><label>مشتری<input value="${esc(inv.customer)}" oninput="inv.customer=this.value" placeholder="نام مشتری"></label>
 <label>نوع مشتری<select onchange="inv.ctype=this.value;repr()">${opts(['خرده','عمده'],inv.ctype)}</select></label><label>پرداخت<select onchange="inv.pay=this.value">${opts(PAY,inv.pay)}</select></label></div>
 ${cart.map((c,i)=>`<div class=line><select onchange="pick(${i},this.value)"><option value="">انتخاب کالا…</option>${db.products.map(p=>`<option value="${p.id}" ${p.id==c.pid?'selected':''}>${esc(p.name)} — موجودی ${fmt(st[p.id])}</option>`).join('')}</select>
 <input type=number step=any placeholder="تعداد" value="${c.qty??''}" oninput="cart[${i}].qty=+this.value;tot()"><input type=number placeholder="قیمت واحد" value="${c.price??''}" oninput="cart[${i}].price=+this.value;tot()"><button onclick="cart.splice(${i},1);if(!cart.length)cart=[{}];render()">✕</button></div>`).join('')}
 <button onclick="cart.push({});render()">+ ردیف</button> &nbsp; <b>جمع: <span id=tot>${fmt(sum(cart,c=>n(c.qty)*n(c.price)))}</span> تومان</b> &nbsp; <button class=pri onclick=saveInv()>ثبت فاکتور</button></section>`:''}
 <section class=card><h3>فاکتورهای اخیر</h3>${tbl(['شماره','تاریخ','مشتری','پرداخت','مبلغ (تومان)',''],groupInv().slice(0,50).map(g=>[g.no,fd(g.day),esc(g.customer),g.pay,fmt(g.total),`<button onclick="printInv('${g.no}')">📄 PDF</button> ${isAdmin()?`<button onclick="delInv('${g.no}')">🗑</button>`:''}`]))}</section>`};
function saveInv(){const ls=cart.filter(c=>c.pid&&n(c.qty));if(!ls.length)return toast('حداقل یک ردیف کامل ثبت کنید');const st=stocks();
 for(const c of ls)if(n(c.qty)>n(st[c.pid])&&!confirm(`موجودی «${prod(c.pid).name}» کافی نیست (${fmt(st[c.pid])}). ادامه می‌دهید؟`))return;
 const no='F-'+(db.sales.reduce((m,s)=>Math.max(m,+String(s.invoice).replace(/\D/g,'')||0),1000)+1);
 ls.forEach(c=>put('sales',{id:uid(),day:inv.day,invoice:no,customer:inv.customer,ctype:inv.ctype,pay:inv.pay,product_id:c.pid,qty:c.qty,price:c.price,cost:n(prod(c.pid).buy)}));
 cart=[{}];inv.customer='';toast('فاکتور '+no+' ثبت شد');render()}
function delInv(no){if(confirm('فاکتور '+no+' حذف شود؟ موجودی انبار برمی‌گردد.')){db.sales.filter(s=>s.invoice==no).forEach(s=>del('sales',s.id));render()}}
function printInv(no){const rs=db.sales.filter(s=>s.invoice==no);if(!rs.length)return;const r=rs[0],total=sum(rs,amt);
 const rows=rs.map((s,i)=>{const p=prod(s.product_id)||{};return `<tr><td>${fmt(i+1)}</td><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td>${fmt(s.qty)}</td><td>${fmt(s.price)}</td><td>${fmt(amt(s))}</td></tr>`}).join('');
 const w=open('','_blank');if(!w)return toast('اجازه باز شدن پنجره را بدهید');
 w.document.write(`<!doctype html><html dir=rtl lang=fa><head><meta charset=utf-8><title>فاکتور ${no}</title><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap" rel=stylesheet><style>@page{size:A4;margin:14mm}body{font-family:Vazirmatn,Tahoma;color:#1d2b24;margin:0}.h{display:flex;justify-content:space-between;border-bottom:4px solid #1f6f4a;padding-bottom:12px}h1{margin:0;color:#1f6f4a}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#1f6f4a;color:#fff}th,td{padding:9px;border:1px solid #cfdad3;text-align:center}.t{margin-top:16px;text-align:left;font-size:20px;font-weight:700;color:#1f6f4a}.f{margin-top:50px;display:flex;justify-content:space-around;color:#6b7c73}</style></head><body>
 <div class=h><div><h1>${esc(CFG.shop)}</h1><div>${esc(CFG.phone)}</div></div><div style="text-align:left"><b>فاکتور فروش</b><div>شماره: ${no}</div><div>تاریخ: ${fd(r.day)}</div></div></div>
 <p><b>مشتری:</b> ${esc(r.customer)||'—'} &nbsp;|&nbsp; <b>نوع پرداخت:</b> ${esc(r.pay)}</p>
 <table><thead><tr><th>#</th><th>شرح کالا</th><th>واحد</th><th>تعداد</th><th>قیمت واحد (تومان)</th><th>مبلغ (تومان)</th></tr></thead><tbody>${rows}</tbody></table>
 <div class=t>جمع کل: ${fmt(total)} تومان</div><div class=f><span>مهر و امضای فروشنده</span><span>امضای خریدار</span></div><script>onload=()=>setTimeout(print,500)<\/script></body></html>`);w.document.close()}
/* انبار */
V.stock=()=>{const st=stocks();return `<section class=card><h3>موجودی انبار ${isAdmin()?'<button class=pri onclick=editP()>+ کالای جدید</button>':''}</h3>`+
 tbl(['کد','کالا','واحد','قیمت خرید','فروش خرده','فروش عمده','موجودی','وضعیت',''],db.products.slice().sort((a,b)=>a.code.localeCompare(b.code)).map(p=>{const s=st[p.id];return [p.code,esc(p.name),esc(p.unit),fmt(p.buy),fmt(p.retail),fmt(p.wholesale),`<b>${fmt(s)}</b>`,s<=0?'<span class="b r">ناموجود</span>':s<=n(p.reorder)?'<span class="b y">سفارش بده</span>':'<span class="b g">کافی</span>',isAdmin()?`<button onclick="editP('${p.id}')">✎</button>`:'']}))+'</section>'};
function editP(id){const p=prod(id)||{id:uid()};form(id?'ویرایش کالا':'کالای جدید',[{k:'code',l:'کد'},{k:'name',l:'نام'},{k:'category',l:'دسته'},{k:'unit',l:'واحد'},{k:'buy',l:'قیمت خرید',t:'number'},{k:'retail',l:'قیمت فروش خرده',t:'number'},{k:'wholesale',l:'قیمت فروش عمده',t:'number'},{k:'opening',l:'موجودی اولیه',t:'number'},{k:'reorder',l:'نقطه سفارش',t:'number'}],p,o=>{put('products',{...p,...o});render()})}
/* خرید و هزینه */
V.purchases=()=>`<section class=card><h3>خریدها ${isAdmin()?'<button class=pri onclick=addPur()>+ ثبت خرید</button>':''}</h3>`+tbl(['تاریخ','کالا','تعداد','قیمت واحد','مبلغ','تأمین‌کننده','پرداخت',''],sortD(db.purchases).slice(0,200).map(x=>[fd(x.day),esc(prod(x.product_id)?.name),fmt(x.qty),fmt(x.price),fmt(x.qty*x.price),esc(x.supplier),x.pay,isAdmin()?`<button onclick="del('purchases','${x.id}');render()">🗑</button>`:'']))+'</section>';
function addPur(){form('ثبت خرید (موجودی انبار زیاد می‌شود)',[{k:'day',l:'تاریخ',t:'date'},{k:'product_id',l:'کالا',o:db.products.map(p=>({v:p.id,t:p.name}))},{k:'qty',l:'تعداد',t:'number'},{k:'price',l:'قیمت واحد خرید',t:'number'},{k:'supplier',l:'تأمین‌کننده'},{k:'pay',l:'پرداخت',o:PAY}],{day:today(),pay:'نقدی'},o=>{put('purchases',{id:uid(),...o});const p=prod(o.product_id);if(p&&o.price)put('products',{...p,buy:o.price});render()})}
V.expenses=()=>`<section class=card><h3>هزینه‌ها ${isAdmin()?'<button class=pri onclick=addExp()>+ ثبت هزینه</button>':''}</h3>`+tbl(['تاریخ','عنوان','دسته','مبلغ','پرداخت',''],sortD(db.expenses).slice(0,200).map(x=>[fd(x.day),esc(x.title),esc(x.category),fmt(x.amount),x.pay,isAdmin()?`<button onclick="del('expenses','${x.id}');render()">🗑</button>`:'']))+'</section>';
function addExp(){form('ثبت هزینه',[{k:'day',l:'تاریخ',t:'date'},{k:'title',l:'عنوان'},{k:'category',l:'دسته',o:['اجاره','حقوق','آب و برق و گاز','حمل و نقل','اداری','لوازم مصرفی','سایر']},{k:'amount',l:'مبلغ (تومان)',t:'number'},{k:'pay',l:'پرداخت',o:PAY}],{day:today(),pay:'نقدی'},o=>{put('expenses',{id:uid(),...o});render()})}
addEventListener('online',()=>{setStat();sync()});addEventListener('offline',setStat);setInterval(sync,6e4);
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
boot();
