// calendar.js — Miesiąc kalendarzowy (ENROUTE 0.4 BETA)
// Lokalna data urządzenia (bez UTC), przystępny do testów rachunek dni.
function calNow(){
  var d=new Date();
  return{y:d.getFullYear(),m:d.getMonth(),d:d.getDate()};
}
function calDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function calMonthName(m){
  return["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"][m];
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
  var calSelected=null;

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
      b.textContent=c.d;
      (function(cell){b.addEventListener("click",function(){calSelected=cell;renderCalendar();});})(c);
      grid.appendChild(b);
    }
    var weekly=document.getElementById("calTodayBtn");
    if(weekly)weekly.classList.toggle("cal-today-active",calView.y===today.y&&calView.m===today.m);
  }

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
    calSelected=null;
    renderCalendar();
  });
  document.addEventListener("visibilitychange",function(){
    if(!document.hidden&&document.getElementById("calendar").classList.contains("active"))renderCalendar();
  });
  var calLastToday=calNow().d+"/"+calNow().m;
  setInterval(function(){
    var t=calNow();
    var key=t.d+"/"+t.m;
    if(key!==calLastToday){calLastToday=key;renderCalendar();}
  },60000);
  renderCalendar();
}