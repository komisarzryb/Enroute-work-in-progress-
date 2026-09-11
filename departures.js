// departures.js — prawdziwe odjazdy na przystanku (ENROUTE 0.4 BETA)
//
// Zasada: REALTIME > oficjalny GTFS (rozkład) > uczciwy brak danych.
//  - REALTIME: pozycje ZTM (busestrams_get) => rzeczywiste opóźnienie/ETA dla linii z DEPT.RT_PROVIDERS.
//  - ROZKŁAD: oficjalne czasy z SCHEDULES (wygenerowane z feedu GTFS przez tools/import-gtfs.js).
//  - Nigdy nie zmyślamy danych: brak źródła/odpowiedzi => komunikat, nie "autobus za X min".
//
// Czas liczony zawsze w strefie Europe/Warsaw (Intl), niezależnie od czasu maszyny.
// Wymaga załadowania LINES (transport-data.js) i SCHEDULES (schedules.js) przed sobą.

var DEPT = {
  RT_REFRESH_MS: 20000,            // odświeżanie otwartej tablicy
  RT_FETCH_DEBOUNCE_MS: 15000,     // min. odstęp między pobraniami pozycji ZTM
  RT_VEHICLE_MAX_AGE_MS: 120000,   // odrzucamy pozycje starsze niż 2 min
  RT_MATCH_WINDOW_MIN: 45,         // "pojazd należy do kursu" gdy dep_start różni się o <= 45 min
  MAX_ROWS: 6,
  RT_PROVIDERS: { "731": "ztm-pos" },
  ZTM_URL: "https://api.um.warszawa.pl/api/action/busestrams_get/?resource_id=f2e5503e-927d-4ad3-9500-4ab9e55deb59&type=1&apikey=fde6064a-316e-4407-bf99-d90693976428",
  CACHE: { ztm: { fetchedAt: 0, vehicles: null, ok: false, pending: null } },
  _dirKeyCache: {},
  _geoCache: {}
};

function deptPad2(n){ return String(n).padStart(2, "0"); }
function deptHM(m){ m=Math.round(m)%1440; if(m<0)m+=1440; return deptPad2(Math.floor(m/60))+":"+deptPad2(m%60); }
function deptHM2min(s){ var p=String(s).split(":"); return (+p[0])*60+(+p[1]); }
function deptNormName(s){ return String(s||"").toLowerCase().replace(/\s+/g,"").replace(/\[.*?\]/g,"").replace(/\(.*?\)/g,""); }
function deptEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// --- czas Europe/Warsaw -----------------------------------------------------
function deptWarsawParts(d){
  try{
    var dt=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Warsaw",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
    var p=dt.formatToParts(d),o={y:0,m:0,dd:0,h:0,min:0,s:0};
    for(var i=0;i<p.length;i++){var t=p[i].type,v=p[i].value;
      if(t==="day")o.dd=+v;else if(t==="month")o.m=+v;else if(t==="year")o.y=+v;
      else if(t==="hour")o.h=+v;else if(t==="minute")o.min=+v;else if(t==="second")o.s=+v;
    }
    if(o.h===24)o.h=0;
    return o;
  }catch(e){
    return {y:d.getFullYear(),m:d.getMonth()+1,dd:d.getDate(),h:d.getHours(),min:d.getMinutes(),s:d.getSeconds()};
  }
}
function deptWarsawDateKey(d){ var o=deptWarsawParts(d); return o.y+"-"+deptPad2(o.m)+"-"+deptPad2(o.dd); }
function deptWarsawMinFrac(d){ var o=deptWarsawParts(d); return o.h*60+o.min+o.s/60; }
function deptRefDate(date){
  if(typeof date!=="string")date=deptWarsawDateKey(new Date());
  if(date>=SCHEDULES.meta.start&&date<=SCHEDULES.meta.end)return date;
  var dow=new Date(date+"T12:00:00").getDay();
  var d=new Date(SCHEDULES.meta.start+"T12:00:00"),end=new Date(SCHEDULES.meta.end+"T12:00:00");
  while(d<=end){ if(d.getDay()===dow)return d.getFullYear()+"-"+deptPad2(d.getMonth()+1)+"-"+deptPad2(d.getDate()); d.setDate(d.getDate()+1); }
  return SCHEDULES.meta.start;
}

// --- identyfikacja przystanku (GTFS keys) ----------------------------------
function deptCodeFromName(name){
  var m=String(name||"").match(/\((\d+)\)\s*$/);
  return m?deptPad2(m[1]):null;
}

// kierunek tripu: ostatni przystanek wyznacza kierunek (krótkie kursy 731 też)
function TripStopNames(lineId, trip){
  var s=trip[3]; if(!s||!s.length)return -1;
  var keys=SCHEDULES.lines[lineId].keys;
  return {first:keys[s[0][0]][1],last:keys[s[s.length-1][0]][1]};
}
function deptDirOfTrip(lineId, trip){
  var base=DEPT._lineBase(lineId); if(!base)return -1;
  var stops=base.stops,rev=base.stopsRev||[];
  var dom=TripStopNames(lineId, trip); if(dom===-1)return -1;
  var last=deptNormName(dom.last),first=deptNormName(dom.first);
  var e0=rev.length?deptNormName(stops[stops.length-1].name):"";
  var e1=rev.length?deptNormName(rev[rev.length-1].name):"";
  if(last===e0)return 0;
  if(rev.length&&last===e1)return 1;
  if(first===deptNormName(stops[0].name))return 0;
  if(rev.length&&first===deptNormName(rev[0].name))return 1;
  return -1;
}

function deptTripsForDate(lineId, date){
  var l=SCHEDULES.lines[lineId]; if(!l)return[];
  return l.trips.filter(function(t){ return t[1].indexOf(date)>=0; });
}

// indeksy kluczy (słupków) obsługujące dany kierunek linii
DEPT.dirKeyIdxes=function(lineId,dir){
  var c=DEPT._dirKeyCache; var key=lineId+"/"+dir;
  if(c[key])return c[key];
  var set={},out=[];
  var trips=SCHEDULES.lines[lineId].trips;
  for(var i=0;i<trips.length;i++){
    var d=deptDirOfTrip(lineId,trips[i]);
    if(d!==dir)continue;
    trips[i][3].forEach(function(st){ if(!set[st[0]]){set[st[0]]=1;out.push(st[0]);} });
  }
  c[key]=out;
  return out;
};

// rozwiąż słypek: (nazwa+stop_code) > (nazwa+kierunek) > (nazwa)
DEPT.resolveStop=function(lineId,stopName,stopCode,dir){
  var l=SCHEDULES.lines[lineId]; if(!l)return{ok:false,reason:"brak linii w GTFS"};
  var code=stopCode?deptPad2(String(stopCode).replace(/\D/g,"")):null;
  var norm=deptNormName(stopName);
  var keys=l.keys,dirSet=DEPT.dirKeyIdxes(lineId,dir),dirMap={};
  for(var i=0;i<dirSet.length;i++)dirMap[dirSet[i]]=1;
  var byName=[];
  for(var k=0;k<keys.length;k++){
    if(deptNormName(keys[k][1])===norm)byName.push(k);
  }
  if(!byName.length)return{ok:false,reason:"nie znaleziono przystanku w GTFS"};
  var pick=null;
  if(code){
    for(i=0;i<byName.length;i++){ if(String(keys[byName[i]][2])===code&&dirMap[byName[i]]){pick=byName[i];break;} }
    if(pick===null){ for(i=0;i<byName.length;i++){ if(String(keys[byName[i]][2])===code){pick=byName[i];break;} } }
  }
  if(pick===null){ for(i=0;i<byName.length;i++){ if(dirMap[byName[i]]){pick=byName[i];break;} } }
  if(pick===null)pick=byName[0];
  return {ok:true,keyIdx:pick,stopId:keys[pick][0],stopCode:keys[pick][2],name:keys[pick][1],dir:dir,lineId:lineId};
};

// --- wiersze rozkładu (oficjalny GTFS) -------------------------------------
DEPT.rowsForStop=function(lineId,res,date){
  var trips=deptTripsForDate(lineId,date),rows=[];
  for(var i=0;i<trips.length;i++){
    var trip=trips[i];
    var d=deptDirOfTrip(lineId,trip); if(d!==res.dir)continue;
    var stops=trip[3],found=-1;
    for(var j=0;j<stops.length;j++){ if(stops[j][0]===res.keyIdx){found=j;break;} }
    if(found<0)continue;
    var dep=stops[found].length>2?stops[found][2]:stops[found][1];
    var originDep=stops[0].length>2?stops[0][2]:stops[0][1];
    rows.push({
      tripId:trip[0],lineId:lineId,dir:res.dir,
      depMin:deptHM2min(dep),depStr:dep,originDepMin:deptHM2min(originDep),
      dest:TripStopNames(lineId, trip).last,stopId:res.stopId,stopCode:res.stopCode,
      rt:false,delay:0,etaMin:null
    });
  }
  rows.sort(function(a,b){return a.depMin-b.depMin;});
  return rows;
};

// --- geometria (do rzutowania pozycji pojazdu na trasę) --------------------
DEPT._lineBase=function(lineId){
  for(var i=0;i<LINES.length;i++){ if(LINES[i].id===lineId)return LINES[i]; }
  return null;
};
function deptGeoFor(base,dir){
  var key=base.id+"/"+dir;
  if(DEPT._geoCache[key])return DEPT._geoCache[key];
  var shape=dir===1?(base.shapeRev||base.shape):base.shape;
  var stops=dir===1?(base.stopsRev||base.stops):base.stops;
  var tt=dir===1?(base.travelTimesRev||base.travelTimes):base.travelTimes;
  var geom={stops:stops,tt:tt,sh:shape||stops.map(function(s){return[s.lat,s.lon]}),vi:null,cum:null};
  var vi=[],i,j;
  geom.stops.forEach(function(st){
    var bi=0,bd=Infinity;
    for(j=0;j<geom.sh.length;j++){
      var d=(geom.sh[j][0]-st.lat)*(geom.sh[j][0]-st.lat)+(geom.sh[j][1]-st.lon)*(geom.sh[j][1]-st.lon);
      if(d<bd){bd=d;bi=j;}
    }
    vi.push(bi);
  });
  geom.vi=vi;
  var cum=[0],s=0;
  for(i=0;i<tt.length;i++){s+=tt[i];cum.push(s);}
  geom.cum=cum;
  DEPT._geoCache[key]=geom;
  return geom;
}
function deptElapsedForPoint(geom,lat,lon){
  var b=0,bd=Infinity,j;
  for(j=0;j<geom.sh.length;j++){
    var d=(geom.sh[j][0]-lat)*(geom.sh[j][0]-lat)+(geom.sh[j][1]-lon)*(geom.sh[j][1]-lon);
    if(d<bd){bd=d;b=j;}
  }
  var vi=geom.vi,k=0;
  for(var i=0;i<vi.length-1;i++){ if(b<=vi[i+1]){k=i;break;} }
  var span=vi[k+1]-vi[k],frac=span>0?(b-vi[k])/span:0;
  if(frac<0)frac=0; if(frac>1)frac=1;
  return geom.cum[k]+geom.tt[k]*frac;
}

// --- RT: realtime z pozycji ZTM --------------------------------------------
function deptDelayText(d){
  if(d>0.7)return "+"+Math.round(d)+" min";
  if(d<-0.7)return Math.round(-d)+" min przed czasem";
  return "o czasie";
}

DEPT.parsedZtmVehicles=function(json,lineId,nowMs){
  var out=[];
  if(!Array.isArray(json&&json.result))return out;
  json.result.forEach(function(x){
    if(String(x.Lines)!==lineId)return;
    var la=parseFloat(x.Lat),lo=parseFloat(x.Lon);
    if(isNaN(la)||isNaN(lo))return;
    var ageMs=nowMs-deptWarsawWallEpoch(x.Time);
    if(!isFinite(ageMs))ageMs=0;
    if(ageMs>DEPT.RT_VEHICLE_MAX_AGE_MS)return;
    out.push({lat:la,lon:lo,vn:String(x.VehicleNumber),br:String(x.Brigade),ageMs:ageMs});
  });
  return out;
};
// "YYYY-MM-DD HH:MM:SS" wg zegara Warszawy -> epoch ms (bez wzgledu na strefe maszyny)
function deptWarsawOffsetMin(d){
  try{
    var p=new Intl.DateTimeFormat("en",{timeZone:"Europe/Warsaw",timeZoneName:"longOffset"}).formatToParts(d);
    for(var i=0;i<p.length;i++){
      if(p[i].type==="timeZoneName"){
        var m=String(p[i].value).match(/(?:GMT)?([+-])(\d{1,2}):?(\d{2})/);
        if(m)return (m[1]==="-"?-1:1)*((+m[2])*60+(+m[3]));
      }
    }
  }catch(e){}
  return null;
}
function deptWarsawWallEpoch(s){
  if(!s)return NaN;
  var m=String(s).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if(!m)return NaN;
  var guess=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]);
  var off=deptWarsawOffsetMin(new Date(guess));
  return off===null?guess:guess-off*60000;
}

// RT overlay: dopasuj pojazd do kursu (kiedy jest PRZED przystankiem)
DEPT.applyRt=function(base,dir,si,res,rows,vehicles,nowMinFrac){
  if(!vehicles||!vehicles.length)return 0;
  var geom=deptGeoFor(base,dir);
  var cumToStop=geom.cum[si];
  if(cumToStop===undefined)return 0;
  var matched=0;
  for(var v=0;v<vehicles.length;v++){
    var el=deptElapsedForPoint(geom,vehicles[v].lat,vehicles[v].lon);
    if(el>=cumToStop)continue;             // pojazd jest poza przystankiem (za nim)
    if(el<0)continue;
    var expected=nowMinFrac-el;
    var best=null,bd=Infinity;
    for(var r=0;r<rows.length;r++){
      if(rows[r].rt)continue;
      var diff=Math.abs(rows[r].originDepMin-expected);
      if(diff<bd){bd=diff;best=rows[r];}
    }
    if(best&&bd<=DEPT.RT_MATCH_WINDOW_MIN){
      if(best.rt)continue;
      best.rt=true;best.delay=Math.round(nowMinFrac-el-best.originDepMin);
      best.etaMin=best.depMin+best.delay;best.veh=vehicles[v].vn;
      matched++;
    }
  }
  return matched;
};

// --- tablica odjazdów -------------------------------------------------------
DEPT.buildBoard=function(ctx,dateKey,nowMinFrac,vehicles){
  var base=DEPT._lineBase(ctx.lineId);
  var res=base?DEPT.resolveStop(ctx.lineId,ctx.name,ctx.code,ctx.dir):{ok:false};
  if(!res.ok)return{ok:false,reason:res.reason||"nie rozpoznano słupka",ctx:ctx};
  var refDate=deptRefDate(dateKey);
  var rows=DEPT.rowsForStop(ctx.lineId,res,refDate);
  var matched=0;
  if(vehicles&&vehicles.length&&DEPT.RT_PROVIDERS[ctx.lineId]){
    matched=DEPT.applyRt(base,ctx.dir,ctx.si,res,rows,vehicles,nowMinFrac);
  }
  var eff=function(r){return r.rt?r.etaMin:r.depMin;};
  var future=rows.filter(function(r){return eff(r)>=nowMinFrac-0.9;});
  future.sort(function(a,b){return eff(a)-eff(b);});
  var shown=future.slice(0,DEPT.MAX_ROWS);
  var source=matched>0?"rt":"gtfs";
  var hasProvider=!!DEPT.RT_PROVIDERS[ctx.lineId];
  var status;
  if(!hasProvider)status="Dla linii "+ctx.lineId+" brak źródła na żywo — pokazuję rozkład";
  else if(vehicles&&vehicles.length)status=matched>0?"Pozycje na żywo ZTM":"Dane rzeczywiste chwilowo niedostępne — pokazuję rozkład";
  else status="Dane rzeczywiste chwilowo niedostępne — pokazuję rozkład";
  return {
    ok:true,ctx:ctx,res:res,refDate:refDate,rows:shown,source:source,
    matched:matched,status:status,nowMinFrac:nowMinFrac,fetchAtMs:vehicles?DEPT.CACHE.ztm.fetchedAt:0,
    hasProvider:hasProvider,vehiclesCount:vehicles?vehicles.length:0,isEmpty:!shown.length
  };
};

DEPT.deptCountdown=function(effMin,nowMinFrac){
  var m=Math.round(effMin-nowMinFrac);
  if(m<=0)return"teraz";
  if(m<60)return"za "+m+" min";
  var h=Math.floor(m/60);return"za "+h+" h "+deptPad2(m-h*60)+" min";
};

DEPT.renderBoard=function(board){
  if(!board.ok){
    return '<div class="dep-board dep-error">'+deptEsc(board.reason||"Brak danych.")+"</div>";
  }
  var h="";
  h+='<div class="dep-board">';
  h+='<div class="dep-head">';
  h+='<div class="dep-stop">'+deptEsc(board.ctx.displayName||board.ctx.name)+"</div>";
  h+='<div class="dep-line">'+deptEsc(board.ctx.lineId)+" → "+deptEsc(board.res.name)+' <span class="dep-code">sł. '+deptEsc(board.res.stopCode==null?"-":board.res.stopCode)+'</span></div>';
  h+='</div>';
  if(board.isEmpty&&!board.rows.length)h+='<div class="dep-empty">Dziś brak kursów w tym kierunku (rozkład z dnia '+board.refDate+").</div>";
  h+='<div class="dep-rows">';
  board.rows.forEach(function(r){
    var t=r.rt?deptHM(r.etaMin):r.depStr;
    var badge=r.rt?'<span class="dep-badge dep-badge-rt">REALTIME</span>':'<span class="dep-badge dep-badge-sched">ROZKŁAD</span>';
    var delay=r.rt?(r.delay?('<span class="dep-delay'+(r.delay>0.7?" dep-delay-late":"")+'">'+deptDelayText(r.delay)+"</span>"):""):"";
    h+='<div class="dep-row">';
    h+='<span class="dep-row-line">'+deptEsc(r.lineId)+'</span>';
    h+='<span class="dep-row-dest">'+deptEsc(r.dest)+'</span>';
    h+='<span class="dep-row-time">'+t+'</span>';
    h+='<span class="dep-row-ctd">'+DEPT.deptCountdown(r.rt?r.etaMin:r.depMin,board.nowMinFrac)+'</span>';
    h+=badge+delay;
    h+='</div>';
  });
  h+='</div>';
  h+='<div class="dep-status">'+deptEsc(board.status);
  if(board.rows.length)h+=' <span class="dep-updated">• aktualizacja '+deptHM(board.nowMinFrac)+'</span>';
  h+="</div>";
  h+='<div class="dep-note">Rozkład: oficjalny GTFS (ZTM/KM) · '+deptEsc(board.refDate)+".</div>";
  h+="</div>";
  return h;
};
DEPT.loadingHTML=function(ctx){
  return '<div class="dep-board dep-loading">Pobieranie odjazdów dla <b>'+deptEsc(ctx.displayName||ctx.name)+'</b>…</div>';
};
DEPT.errorHTML=function(ctx,msg){
  return '<div class="dep-board dep-error">'+deptEsc(msg||"Dane rzeczywiste chwilowo niedostępne.")+"</div>";
};

// --- pobieranie pozycji ZTM (async) -----------------------------------------
DEPT.refreshZtm=function(lineId,fetchImpl,onUpdate){
  var c=DEPT.CACHE.ztm;
  var t=Date.now();
  var settled=function(v){
    if(onUpdate)try{onUpdate(v);}catch(e){}
    return v;
  };
  var cachedOk=c.vehicles&&t-c.fetchedAt<DEPT.RT_FETCH_DEBOUNCE_MS;
  if(c.pending)return c.pending.then(settled);
  if(cachedOk)return Promise.resolve(settled(c.vehicles));
  var fn=fetchImpl||(typeof fetch!=="undefined"?fetch.bind(window||self):null);
  if(!fn){c.ok=false;return Promise.resolve(settled(null));}
  c.pending=fn(DEPT.ZTM_URL)
    .then(function(r){return r.json();})
    .then(function(j){
      c.vehicles=DEPT.parsedZtmVehicles(j,lineId,Date.now());
      c.fetchedAt=Date.now();c.ok=!DEPT.RT_PROVIDERS[lineId]||c.vehicles.length>0;c.error=false;
      return c.vehicles;
    })
    .catch(function(){
      c.ok=false;c.error=true;c.fetchedAt=Date.now();
      return null;
    })
    .then(function(v){c.pending=null;return settled(v);});
  return c.pending;
};
DEPT.getZtmVehicles=function(lineId){
  var c=DEPT.CACHE.ztm;
  if(c.vehicles&&DEPT.RT_PROVIDERS[lineId])return c.vehicles;
  return null;
};
DEPT.ensureRt=function(lineId){
  if(!DEPT.RT_PROVIDERS[lineId])return Promise.resolve(null);
  return DEPT.refreshZtm(lineId).then(function(){return DEPT.getZtmVehicles(lineId);});
};