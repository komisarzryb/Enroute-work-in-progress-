// calendar.js — Miesiąc kalendarzowy + wydarzenia dnia (ENROUTE 0.4 BETA)
// Lokalna data urządzenia (bez UTC), przystępny do testów rachunek dni.

var CAL_DOW=["niedziela","poniedziałek","wtorek","środa","czwartek","piątek","sobota"];
var CAL_MONTH_GEN=["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];

function calNow(){
  var d=new Date();
  return{y:d.getFullYear(),m:d.getMonth(),d:d.getDate()};
}
function calDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function calMonthName(m){
  return["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"][m];
}
function calWeekdayName(y,m,d){return CAL_DOW[new Date(y,m,d).getDay()];}
function calDateLabel(y,m,d){
  var cap=calWeekdayName(y,m,d);
  return cap.charAt(0).toUpperCase()+cap.slice(1)+", "+d+" "+CAL_MONTH_GEN[m];
}
// 6 wierszy x 7 dni (poniedziałek = początek). isToday bazuje na dacie lokalnej urządzenia.
function calGrid(y,m,today){
  today=today||calNow();
  var cursor=new Date(y,m,1-(new Date(y,m,1).getDay()+6)%7);
  var cells=[];
  for(var i=0;i<42;i++){
    cells.push({
      y:cursor.getFullYear(),m:cursor.getMonth(),d:cursor.getDate(),
      inMonth:cursor.getMonth()===m,
      isToday:today&&cursor.getFullYear()===today.y&&cursor.getMonth()===today.m&&cursor.getDate()===today.d
    });
    cursor=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1);
  }
  return cells;
}

if(typeof document!=="undefined"){
  var calView=(function(){var t=calNow();return{y:t.y,m:t.m};})();
  var calSelected=(function(){var t=calNow();return{y:t.y,m:t.m,d:t.d};})();
  var evtEditing=null;
  var evtPendingDel=null;

  function renderCalendar(){
    if(!document.getElementById("calGrid"))return;
    var title=document.getElementById("calTitle");
    if(title)title.textContent=calMonthName(calView.m)+" "+calView.y;
    var today=calNow();
    var cells=calGrid(calView.y,calView.m,today);
    var grid=document.getElementById("calGrid");
    grid.innerHTML="";
    for(var i=0;i<cells.length;i++){
      var c=cells[i];
      var b=document.createElement("button");
      b.type="button";
      b.className="cal-cell";
      if(!c.inMonth)b.classList.add("cal-cell-other");
      if(c.isToday)b.classList.add("cal-cell-today");
      if(calSelected&&c.y===calSelected.y&&c.m===calSelected.m&&c.d===calSelected.d)b.classList.add("cal-cell-selected");
      if(c.inMonth&&calHasEvents(c.y,c.m,c.d))b.classList.add("cal-cell-has");
      b.textContent=c.d;
      b.setAttribute("aria-label",calDateLabel(c.y,c.m,c.d));
      (function(cell){b.addEventListener("click",function(){
        calSelected={y:cell.y,m:cell.m,d:cell.d};
        renderCalendar();
      });})(c);
      grid.appendChild(b);
    }
    var weekly=document.getElementById("calTodayBtn");
    if(weekly)weekly.classList.toggle("cal-today-active",calView.y===today.y&&calView.m===today.m);
    renderDayPanel();
  }

  function calHasEvents(y,m,d){
    if(typeof evtHas!=="function")return false;
    return evtHas(evtDateKey(y,m,d));
  }

  function renderDayPanel(){
    var head=document.getElementById("calDayHeader");
    if(!head)return;
    if(!calSelected){
      head.textContent="Wybierz dzień";
      return;
    }
    head.textContent=calDateLabel(calSelected.y,calSelected.m,calSelected.d);
    var key=evtDateKey(calSelected.y,calSelected.m,calSelected.d);
    var events=evtGet(key);
    var countEl=document.getElementById("calDayCount");
    if(countEl)countEl.textContent=events.length?(events.length===1?"1 wydarzenie":events.length+" wydarzeń"):"";
    var listEl=document.getElementById("calDayEvents");
    if(!listEl)return;
    listEl.innerHTML="";
    if(!events.length){
      var empty=document.createElement("p");
      empty.className="cal-day-empty";
      empty.textContent="Brak zaplanowanych wydarzeń";
      listEl.appendChild(empty);
      return;
    }
    events.forEach(function(ev){
      listEl.appendChild(evtItemNode(ev));
    });
  }

  function evtItemNode(ev){
    var el=document.createElement("div");
    el.className="evt-item";
    var row=document.createElement("div");
    row.className="evt-main";
    var time=document.createElement("div");
    time.className="evt-time";
    time.textContent=ev.start+(ev.end?" – "+ev.end:"");
    var name=document.createElement("div");
    name.className="evt-name";
    name.textContent=ev.name;
    row.appendChild(time);row.appendChild(name);
    el.appendChild(row);
    if(ev.desc){
      var desc=document.createElement("div");
      desc.className="evt-desc";
      desc.textContent=ev.desc;
      el.appendChild(desc);
    }
    if(evtPendingDel&&evtPendingDel===ev.id){
      var conf=document.createElement("div");
      conf.className="evt-confirm";
      var t=document.createElement("span");
      t.className="evt-confirm-text";
      t.textContent="Usunąć wydarzenie?";
      var yes=document.createElement("button");
      yes.type="button";
      yes.className="btn btn-sm btn-danger";
      yes.textContent="Usuń";
      yes.setAttribute("aria-label","Potwierdź usunięcie wydarzenia "+ev.name);
      var no=document.createElement("button");
      no.type="button";
      no.className="btn btn-sm btn-secondary";
      no.textContent="Anuluj";
      conf.appendChild(t);conf.appendChild(no);conf.appendChild(yes);
      no.addEventListener("click",function(){evtPendingDel=null;renderDayPanel();});
      yes.addEventListener("click",function(){
        evtRemove(evtDateKey(calSelected.y,calSelected.m,calSelected.d),ev.id);
        evtPendingDel=null;
        renderCalendar();
      });
      el.appendChild(conf);
    }else{
      var acts=document.createElement("div");
      acts.className="evt-actions";
      var edit=document.createElement("button");
      edit.type="button";
      edit.className="btn btn-sm btn-secondary";
      edit.textContent="Edytuj";
      edit.setAttribute("aria-label","Edytuj wydarzenie "+ev.name);
      var del=document.createElement("button");
      del.type="button";
      del.className="btn btn-sm btn-danger-outline";
      del.textContent="Usuń";
      del.setAttribute("aria-label","Usuń wydarzenie "+ev.name);
      edit.addEventListener("click",function(){openEventForm(ev);});
      del.addEventListener("click",function(){evtPendingDel=ev.id;renderDayPanel();});
      acts.appendChild(edit);acts.appendChild(del);
      el.appendChild(acts);
    }
    return el;
  }

  function openEventForm(ev){
    evtEditing=ev||null;
    var nameEl=document.getElementById("evtName");
    var startEl=document.getElementById("evtStart");
    var endEl=document.getElementById("evtEnd");
    var descEl=document.getElementById("evtDesc");
    var titleEl=document.getElementById("evtSheetTitle");
    if(titleEl)titleEl.textContent=ev?"Edytuj wydarzenie":"Nowe wydarzenie";
    var sheetDateEl=document.getElementById("evtSheetDate");
    if(sheetDateEl&&calSelected)sheetDateEl.textContent=calDateLabel(calSelected.y,calSelected.m,calSelected.d);
    if(nameEl)nameEl.value=ev?ev.name:"";
    if(startEl)startEl.value=ev?ev.start:"08:00";
    if(endEl)endEl.value=ev?(ev.end||""):"";
    if(descEl)descEl.value=ev?(ev.desc||""):"";
    clearEvtErrors();
    var sheet=document.getElementById("evtSheet");
    if(sheet){
      sheet.hidden=false;
      var btn=document.getElementById("evtSaveBtn");
      if(btn)btn.textContent=ev?"Zapisz":"Dodaj";
      if(nameEl){setTimeout(function(){nameEl.focus();},120);}
      document.querySelector(".bottom-nav").style.pointerEvents="none";
    }
  }
  function closeEventForm(){
    var sheet=document.getElementById("evtSheet");
    if(sheet)sheet.hidden=true;
    var back=document.querySelector(".bottom-nav");
    if(back)back.style.pointerEvents="";
  }
  function clearEvtErrors(){
    ["evtName","evtStart","evtEnd","evtDesc"].forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.classList.remove("invalid");
    });
    ["evtNameErr","evtStartErr","evtEndErr","evtDescErr"].forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.textContent="";
    });
  }
  function setEvtError(field,msg){
    var input=document.getElementById("evt"+field);
    if(input)input.classList.add("invalid");
    var errEl=document.getElementById("evt"+field+"Err");
    if(errEl)errEl.textContent=msg;
    var first=document.getElementById("evt"+field);
    if(first)first.focus();
  }

  var evtForm=document.getElementById("evtForm");
  if(evtForm)evtForm.addEventListener("submit",function(e){
    e.preventDefault();
    var nameEl=document.getElementById("evtName");
    var startEl=document.getElementById("evtStart");
    var endEl=document.getElementById("evtEnd");
    var descEl=document.getElementById("evtDesc");
    var fields={
      name:nameEl?nameEl.value:"",
      start:startEl?startEl.value:"",
      end:endEl?endEl.value:"",
      desc:descEl?descEl.value:""
    };
    var v=evtValidate(fields);
    if(!v.ok){
      clearEvtErrors();
      if(v.errors.name)setEvtError("Name",v.errors.name);
      if(v.errors.start)setEvtError("Start",v.errors.start);
      if(v.errors.end)setEvtError("End",v.errors.end);
      if(v.errors.desc)setEvtError("Desc",v.errors.desc);
      return;
    }
    var key=evtDateKey(calSelected.y,calSelected.m,calSelected.d);
    if(evtEditing){evtUpdate(evtEditing.id,fields);}
    else{evtAdd(key,fields);}
    closeEventForm();
    renderCalendar();
  });

  var navPrev=document.getElementById("calPrev");
  if(navPrev)navPrev.addEventListener("click",function(){
    calView.m--;
    if(calView.m<0){calView.m=11;calView.y--;}
    renderCalendar();
  });
  var navNext=document.getElementById("calNext");
  if(navNext)navNext.addEventListener("click",function(){
    calView.m++;
    if(calView.m>11){calView.m=0;calView.y++;}
    renderCalendar();
  });
  var navToday=document.getElementById("calTodayBtn");
  if(navToday)navToday.addEventListener("click",function(){
    var t=calNow();
    calView={y:t.y,m:t.m};
    calSelected={y:t.y,m:t.m,d:t.d};
    evtPendingDel=null;
    renderCalendar();
  });
  var calAddBtn=document.getElementById("calAdd");
  if(calAddBtn)calAddBtn.addEventListener("click",function(){openEventForm(null);});
  var calAddEventBtn=document.getElementById("calAddEvent");
  if(calAddEventBtn)calAddEventBtn.addEventListener("click",function(){openEventForm(null);});
  var evtCancelBtn=document.getElementById("evtCancel");
  if(evtCancelBtn)evtCancelBtn.addEventListener("click",function(){closeEventForm();});
  var evtSheet=document.getElementById("evtSheet");
  if(evtSheet&&document.body){document.body.appendChild(evtSheet);}
  document.addEventListener("visibilitychange",function(){
    if(!document.hidden&&document.getElementById("calendar").classList.contains("active"))renderCalendar();
  });
  var calLastToday=calNow().d+"/"+calNow().m;
  setInterval(function(){
    var t=calNow();
    var key=t.d+"/"+t.m;
    if(key!==calLastToday){calLastToday=key;renderCalendar();}
  },60000);
  if(typeof evtLoad==="function")evtLoad();
  renderCalendar();
}