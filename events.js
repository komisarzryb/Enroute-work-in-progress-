// events.js — dane kalendarza: wydarzenia przypisane do dat (ENROUTE 0.4 BETA)
// Jeden spójny magazyn: localStorage["enroute_calendar"] = {v:1, events:{"YYYY-MM-DD":[ {id,name,start,end,desc} ]}}
// Struktura pozwala później dodać: plan lekcji, Librus, wydarzenia cykliczne, dni wolne, odwołane lekcje.

var EVT_KEY="enroute_calendar";
var EVT_VERSION=1;
var EVT_NAME_MAX=120;
var EVT_DESC_MAX=400;
var EVT_DATA=null;
var evtMem=null;

function evtPad(n){return(n<10?"0":"")+n;}
// Klucz daty w lokalnym polu czasu urządzenia (bez UTC, bez przesunięć strefy).
function evtDateKey(y,m,d){return y+"-"+evtPad(m+1)+"-"+evtPad(d);}
function evtDateKeyNow(){var t=calNow();return evtDateKey(t.y,t.m,t.d);}

var evtStore={
  get:function(){if(typeof localStorage!=="undefined"&&localStorage)return localStorage.getItem(EVT_KEY);return evtMem;},
  set:function(v){if(typeof localStorage!=="undefined"&&localStorage)localStorage.setItem(EVT_KEY,v);else evtMem=v;}
};
function evtSetStore(get,set){evtStore.get=get||evtStore.get;evtStore.set=set||evtStore.set;}

function evtEmpty(){return{v:EVT_VERSION,events:{}};}
function evtLoad(){
  var raw=evtStore.get();
  if(!raw){EVT_DATA=evtEmpty();evtSave();return EVT_DATA;}
  try{
    var d=JSON.parse(raw);
    if(!d||typeof d!=="object"||!d.events){EVT_DATA=evtEmpty();evtSave();return EVT_DATA;}
    EVT_DATA=d;
  }catch(e){EVT_DATA=evtEmpty();evtSave();}
  return EVT_DATA;
}
function evtSave(){evtStore.set(JSON.stringify(EVT_DATA||evtEmpty()));}
function evtReset(){EVT_DATA=evtEmpty();evtSave();return EVT_DATA;}

function evtSort(evs){
  return evs.slice().sort(function(a,b){
    var s=(a.start||"00:00").localeCompare(b.start||"00:00");
    if(s)return s;
    return(String(a.name||"").localeCompare(String(b.name||"")));
  });
}
function evtGet(dateKey){
  if(!EVT_DATA)evtLoad();
  return evtSort(EVT_DATA.events[dateKey]||[]);
}
function evtHas(dateKey){
  if(!EVT_DATA)evtLoad();
  return !!(EVT_DATA.events[dateKey]&&EVT_DATA.events[dateKey].length);
}
function evtNextId(){
  return Date.now().toString(36)+Math.random().toString(36).slice(2,8);
}
function evtTimeOk(t){
  return typeof t==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
function evtValidate(f){
  f=f||{};
  var errors={};
  var name=(f.name||"").trim();
  if(!name)errors.name="Podaj nazwę wydarzenia";
  else if(name.length>EVT_NAME_MAX)errors.name="Nazwa zbyt długa (maks. "+EVT_NAME_MAX+" znaków)";
  var desc=(f.desc||"").trim();
  if(desc.length>EVT_DESC_MAX)errors.desc="Opis zbyt długi (maks. "+EVT_DESC_MAX+" znaków)";
  var start=(f.start||"").trim();
  if(!start)errors.start="Podaj godzinę rozpoczęcia";
  else if(!evtTimeOk(start))errors.start="Niepoprawna godzina rozpoczęcia";
  var end=(f.end||"").trim();
  if(end&&!evtTimeOk(end))errors.end="Niepoprawna godzina zakończenia";
  else if(end&&start&&start>end)errors.end="Koniec nie może być wcześniejszy niż start";
  return{ok:Object.keys(errors).length===0,errors:errors};
}
function evtAdd(dateKey,f){
  if(!EVT_DATA)evtLoad();
  var v=evtValidate(f);
  if(!v.ok)return{ok:false,errors:v.errors};
  var ev={id:evtNextId(),name:(f.name||"").trim(),start:(f.start||"").trim(),end:(f.end||"").trim()||null,desc:(f.desc||"").trim()||null};
  if(!EVT_DATA.events[dateKey])EVT_DATA.events[dateKey]=[];
  EVT_DATA.events[dateKey].push(ev);
  evtSave();
  return{ok:true,event:ev};
}
function evtUpdate(id,f){
  if(!EVT_DATA)evtLoad();
  for(var dateKey in EVT_DATA.events){
    var arr=EVT_DATA.events[dateKey];
    for(var i=0;i<arr.length;i++){
      if(arr[i].id===id){
        var merged={
          name:(f.name!==undefined?f.name:arr[i].name),
          start:(f.start!==undefined?f.start:arr[i].start),
          end:(f.end!==undefined?f.end:arr[i].end),
          desc:(f.desc!==undefined?f.desc:arr[i].desc)
        };
        var v=evtValidate(merged);
        if(!v.ok)return{ok:false,errors:v.errors};
        arr[i]={id:id,name:(merged.name||"").trim(),start:(merged.start||"").trim(),end:(merged.end||"").trim()||null,desc:(merged.desc||"").trim()||null};
        evtSave();
        return{ok:true,event:arr[i]};
      }
    }
  }
  return{ok:false,errors:{id:"Nie znaleziono wydarzenia"}};
}
function evtRemove(dateKey,id){
  if(!EVT_DATA)evtLoad();
  var arr=EVT_DATA.events[dateKey];
  if(!arr)return false;
  for(var i=0;i<arr.length;i++){
    if(arr[i].id===id){
      arr.splice(i,1);
      if(!arr.length)delete EVT_DATA.events[dateKey];
      evtSave();
      return true;
    }
  }
  return false;
}
function evtUpcoming(limit){
  if(!EVT_DATA)evtLoad();
  var all=[],today=evtDateKeyNow();
  for(var dateKey in EVT_DATA.events){
    EVT_DATA.events[dateKey].forEach(function(ev){all.push({date:dateKey,ev:ev});});
  }
  all.sort(function(a,b){
    var d=(a.date+"").localeCompare(b.date||"");
    if(d)return d;
    return(a.ev.start||"00:00").localeCompare(b.ev.start||"00:00");
  });
  return all.filter(function(x){return x.date>=today;}).slice(0,limit||all.length);
}