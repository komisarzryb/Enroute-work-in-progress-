// test-calendar-dom.js — testy zachowania kalendarza z mockiem DOM (uruchom: node tools/test-calendar-dom.js)
// Weryfikuje: klik dnia, kropki, nawigację miesięcy, przycisk Dzisiaj, formularz dodaj/edytuj/usuń bez przeładowania.
var fs=require("fs");
var path=require("path");
var dir=path.join(__dirname,"..");

function makeEl(tag){
  var el={
    tagName:tag,className:"",children:[],attributes:{},
    _handlers:{},_classes:{},_innerHTML:"",
    get innerHTML(){return this._innerHTML;},
    set innerHTML(v){this._innerHTML=v;this.children=[];this._textDerived="";},
    get textContent(){if(this._textDerived)return this._textDerived;return this.children.map(function(c){return c.textContent;}).join("");},
    set textContent(v){this._textDerived=String(v);},
    value:"",hidden:false,
    addEventListener:function(ev,fn){this._handlers[ev]=fn;},
    appendChild:function(c){this.children.push(c);return c;},
    focus:function(){},
    setAttribute:function(k,v){this.attributes[k]=v;},
    getAttribute:function(k){return this.attributes[k]||"";},
    classList:{
      add:function(c){el._classes[c]=true;},
      remove:function(c){delete el._classes[c];},
      toggle:function(c,f){if(f===undefined)el._classes[c]=!el._classes[c];else if(f)el._classes[c]=true;else delete el._classes[c];},
      contains:function(c){return !!el._classes[c];}
    },
    style:{}
  };
  return el;
}

var els={};
global.document={
  getElementById:function(id){if(!els[id]){els[id]=makeEl("div");}return els[id];},
  querySelectorAll:function(sel){if(sel===".bottom-nav")return[makeEl("nav")];return[];},
  querySelector:function(sel){return makeEl("div");},
  createElement:function(tag){return makeEl(tag);},
  addEventListener:function(){},
  body:{appendChild:function(){}}
};
global.window=global;
global.navigator={};
global.setInterval=function(){return 0;};
global.setTimeout=function(fn){fn();return 0;};
global.localStorage={_s:{},getItem:function(k){return this._s[k]||null;},setItem:function(k,v){this._s[k]=v;}};

eval(fs.readFileSync(path.join(dir,"events.js"),"utf8"));
eval(fs.readFileSync(path.join(dir,"calendar.js"),"utf8"));

var pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log("PASS - "+m);}else{fail++;console.log("FAIL - "+m);}}

var grid=document.getElementById("calGrid");
ok(grid.children.length===42,"siatka ma 42 komórki po render");

var today=new Date();
var tKey=evtDateKey(today.getFullYear(),today.getMonth(),today.getDate());
evtAdd(tKey,{name:"testDzis",start:"10:00"});
renderCalendar();

var dayPanel=document.getElementById("calDayEvents");
ok(dayPanel.children.length===1&&dayPanel.children[0].textContent.indexOf("testDzis")>-1,
   "panel dnia pokazuje wydarzenie dzisiejsze ("+tKey+")");

var todayCell=grid.children.filter(function(c){return c.textContent===""+today.getDate();})[0];
ok(todayCell&&todayCell.classList.contains("cal-cell-has"),
   "dzień z wydarzeniem ma kropkę cal-cell-has");

var selBefore={y:today.getFullYear(),m:today.getMonth(),d:today.getDate()};
document.getElementById("calPrev")._handlers.click();
ok(calSelected.y===selBefore.y&&calSelected.m===selBefore.m&&calSelected.d===selBefore.d,
   "wybrany dzień zachowany po przejściu na inny miesiąc");
document.getElementById("calNext")._handlers.click();

document.getElementById("calTodayBtn")._handlers.click();
ok(calView.y===today.getFullYear()&&calView.m===today.getMonth(),
   "Dzisiaj wraca do bieżącego miesiąca");
ok(calSelected.y===today.getFullYear()&&calSelected.m===today.getMonth()&&calSelected.d===today.getDate(),
   "Dzisiaj ustawia dzisiejszy dzień jako wybrany");

function submitForm(name,start,end,desc){
  document.getElementById("evtName").value=name;
  document.getElementById("evtStart").value=start;
  document.getElementById("evtEnd").value=end||"";
  document.getElementById("evtDesc").value=desc||"";
  document.getElementById("evtForm")._handlers.submit({preventDefault:function(){}});
}

var cntBefore=evtGet(tKey).length;
submitForm("Matematyka","08:00","08:45","Sala 12");
ok(evtGet(tKey).length===cntBefore+1&&evtGet(tKey).some(function(e){return e.name==="Matematyka";}),
   "submit formularza zapisuje wydarzenie (bez przeładowania)");

submitForm("","08:00");
ok(!evtGet(tKey).some(function(e){return e.name==="";}),
   "pusta nazwa w formularzu nie zapisuje wydarzenia");
document.getElementById("evtName").value="Zły koniec";
submitForm("Wydarzenie","08:00","07:00");
ok(!evtGet(tKey).some(function(e){return e.name==="Wydarzenie";}),
   "koniec przed startem w formularzu nie zapisuje wydarzenia");

var ev=evtGet(tKey).filter(function(e){return e.name==="Matematyka";})[0];
ok(evtUpdate(ev.id,{name:"Matematyka 2",start:"08:00",end:"09:00"}).ok&&evtGet(tKey)[0].name==="Matematyka 2",
   "edycja aktualizuje dane wydarzenia");

ok(evtRemove(tKey,ev.id)&&!evtGet(tKey).some(function(e){return e.id===ev.id;}),
   "usunięcie (po potwierdzeniu) usuwa wydarzenie");

if(fail>0){console.log("WSZYSTKIE TESTY FAIL ("+fail+" błędów)");process.exit(1);}
console.log("WSZYSTKIE TESTY PASS ("+pass+" testów)");