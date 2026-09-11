var map,markers=[],routeLines=[],activeLine=null,mapInitialized=false,liveMarkers=[],liveVeh=null,curLineId="731",curDir=0,_fetchingLive=false;

function initMap(){
  if(mapInitialized)return;
  mapInitialized=true;
  map=L.map("leaflet-map",{zoomControl:false,attributionControl:true}).setView([52.402,20.941],11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",maxZoom:18}).addTo(map);
  L.control.zoom({position:"topright"}).addTo(map);
  document.querySelectorAll(".line-btn").forEach(function(btn){
    btn.addEventListener("click",function(){selectLine(btn.dataset.line,curDir)});
  });
  document.querySelectorAll(".dir-btn").forEach(function(btn){
    btn.addEventListener("click",function(){selectLine(curLineId,+btn.dataset.dir)});
  });
  selectLine("731",0);
  setInterval(function(){
    var mapScr=document.getElementById("map");
    if(!mapScr||!mapScr.classList.contains("active"))return;
    if(activeLine&&activeLine.id==="731")fetchLive();
    else updatePositions();
  },30000);
  map.on("popupopen",function(e){startStopBoard(e.popup);});
  map.on("popupclose",function(){stopBoardRefreshStop();});
  var go=document.getElementById("planGo");
  if(go)go.addEventListener("click",planJourney);
  var pt=document.getElementById("planTime");
  if(pt)pt.addEventListener("change",planJourney);
  var pd=document.getElementById("planDest");
  if(pd)pd.addEventListener("change",planJourney);
  if(go)planJourney();
}

function refreshMap(){
  if(map)map.invalidateSize();
}

function mergeDir(base,dir){
  var o={id:base.id,name:base.name,color:base.color};
  o.fullName=dir===1?base.fullNameRev:base.fullName;
  o.stops=dir===1?base.stopsRev:base.stops;
  o.shape=dir===1?base.shapeRev:base.shape;
  o.travelTimes=dir===1?base.travelTimesRev:base.travelTimes;
  o.departures=dir===1?base.departuresRev:base.departures;
  if(base.posts)o.posts=base.posts;
  return o;
}

function renderDirButtons(){
  var sel=document.getElementById("dirSel");
  if(!sel)return;
  var base=LINES.find(function(l){return l.id===curLineId});
  if(!base||!base.stopsRev){sel.hidden=true;return;}
  sel.hidden=false;
  var ends=[base.stops[base.stops.length-1].name,base.stopsRev[base.stopsRev.length-1].name];
  var btns=sel.querySelectorAll(".dir-btn");
  btns.forEach(function(b,i){
    b.textContent="→ "+ends[i];
    b.classList.toggle("active",i===curDir);
  });
}

function selectLine(lineId,dir){
  curLineId=lineId;
  curDir=dir===1?1:0;
  document.querySelectorAll(".line-btn").forEach(function(b){b.classList.remove("active")});
  var btn=document.querySelector('[data-line="'+lineId+'"]');
  if(btn)btn.classList.add("active");
  var base=LINES.find(function(l){return l.id===lineId});
  if(!base)return;
  activeLine=mergeDir(base,curDir);
  clearMap();
  drawRoute(activeLine);
  renderDirButtons();
  if(activeLine&&activeLine.id==="731")fetchLive();
  else updatePositions();
  map.fitBounds(getRouteBounds(activeLine),{padding:[30,30],maxZoom:12});
}

function clearMap(){
  markers.forEach(function(m){map.removeLayer(m)});
  routeLines.forEach(function(l){map.removeLayer(l)});
  liveMarkers.forEach(function(m){map.removeLayer(m)});
  markers=[];
  routeLines=[];
  liveMarkers=[];
}

function buildLineCoords(line){
  if(!line.shape)return line.stops.map(function(s){return[s.lat,s.lon]});
  var coords=line.shape.slice();
  var first=line.stops[0],last=line.stops[line.stops.length-1];
  if(Math.abs(coords[0][0]-first.lat)>0.002||Math.abs(coords[0][1]-first.lon)>0.002)coords.unshift([first.lat,first.lon]);
  if(Math.abs(coords[coords.length-1][0]-last.lat)>0.002||Math.abs(coords[coords.length-1][1]-last.lon)>0.002)coords.push([last.lat,last.lon]);
  return coords;
}

function drawRoute(line){
  var coords=buildLineCoords(line);
  var polyline=L.polyline(coords,{color:line.color,weight:4,opacity:0.7,dashArray:"8,8"}).addTo(map);
  routeLines.push(polyline);
  if(line.posts){
    line.posts.forEach(function(p){
      var cur=p.dir===curDir;
      var mctx=stopBoardCtxFromPost(p);
      var marker=L.circleMarker([p.lat,p.lon],{radius:cur?6:4,fillColor:cur?line.color:"#5b708b",color:"#fff",weight:cur?2:1,fillOpacity:cur?0.9:0.5}).addTo(map).bindPopup(function(){
        return DEPT.loadingHTML(mctx);
      });
      marker._boardCtx=mctx;
      markers.push(marker);
    });
  }else{
    line.stops.forEach(function(stop,si){
      var mctx=stopBoardCtxFromStop(line,si);
      var marker=L.circleMarker([stop.lat,stop.lon],{radius:6,fillColor:line.color,color:"#fff",weight:2,fillOpacity:0.9}).addTo(map).bindPopup(function(){return DEPT.loadingHTML(mctx);});
      marker._boardCtx=mctx;
      markers.push(marker);
    });
  }
}

// --- tablica odjazdów na przystanku (REALNE dane: RT > GTFS > uczciwy brak) ---
var stopPopupTimer=null;

function stopBoardCtxFromPost(p){
  return {lineId:curLineId,dir:p.dir,si:p.si,name:p.name,code:deptCodeFromName(p.name),displayName:p.name,lat:p.lat,lon:p.lon};
}
function stopBoardCtxFromStop(line,si){
  var st=line.stops[si];
  return {lineId:line.id,dir:curDir,si:si,name:st.name,code:deptCodeFromName(st.name),displayName:st.name,lat:st.lat,lon:st.lon};
}

function renderStopBoardInto(popup,ctx){
  popup.setContent(DEPT.loadingHTML(ctx));
  DEPT.ensureRt(ctx.lineId).then(function(veh){
    if(!popup.isOpen())return;
    try{
      var dateKey=deptWarsawDateKey(new Date());
      var nowMin=deptWarsawMinFrac(new Date());
      var board=DEPT.buildBoard(ctx,dateKey,nowMin,veh);
      popup.setContent(DEPT.renderBoard(board));
    }catch(e){
      popup.setContent(DEPT.errorHTML(ctx,"Błąd odczytu rozkładu."));
    }
  }).catch(function(){
    if(popup.isOpen())popup.setContent(DEPT.errorHTML(ctx,"Brak połączenia z siecią — odjazdy chwilowo niedostępne."));
  });
}

function startStopBoard(popup){
  stopBoardRefreshStop();
  var src=popup._source&&popup._source._boardCtx;
  if(!src)return;
  renderStopBoardInto(popup,src);
  stopPopupTimer=setInterval(function(){
    if(popup.isOpen())renderStopBoardInto(popup,src);
    else stopBoardRefreshStop();
  },DEPT.RT_REFRESH_MS);
}

function stopBoardRefreshStop(){
  if(stopPopupTimer){clearInterval(stopPopupTimer);stopPopupTimer=null;}
}

function updatePositions(){
  if(!activeLine||!map)return;
  markers.filter(function(m){return m._isVehicle}).forEach(function(m){map.removeLayer(m)});
  markers=markers.filter(function(m){return!m._isVehicle});
  var now=new Date();
  var timeStr=deptHM(deptWarsawMinFrac(now));
  var liveUsed=activeLine.id==="731"&&liveVeh&&liveVeh.length>0;
  if(liveUsed){
    drawLiveVehicles();
    document.getElementById("map-info").innerHTML="<b>"+activeLine.fullName+"</b><p>Pozycje na żywo (ZTM): "+liveVeh.length+" pojazdów</p><strong>Czas: "+timeStr+"</strong>";
    return;
  }
  liveMarkers.forEach(function(m){map.removeLayer(m)});
  liveMarkers=[];
  var pos=estimatePosition(activeLine,now);
  if(pos){
    var icon=L.divIcon({className:"vehicle-marker",html:"<div style='background:"+activeLine.color+";color:#fff;padding:6px 10px;border-radius:10px;font-weight:800;font-size:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)'>"+activeLine.name+"</div>",iconAnchor:[30,15]});
    var vehicleMarker=L.marker([pos.lat,pos.lon],{icon:icon}).addTo(map);
    vehicleMarker._isVehicle=true;
    markers.push(vehicleMarker);
    document.getElementById("map-info").innerHTML="<b>"+activeLine.fullName+"</b><p>Estymacja: "+pos.fromStop+" → "+(pos.toStop||"koniec trasy")+"</p><strong>Czas: "+timeStr+"</strong>";
  }else{
    var nextDep=getNextDeparture(activeLine,now);
    document.getElementById("map-info").innerHTML="<b>"+activeLine.fullName+"</b><p>Brak aktywnych kursów</p>"+(nextDep?"<strong>Następny: "+nextDep+"</strong>":"");
  }
}

function estimatePosition(line,now){
  var currentMin=deptWarsawMinFrac(now);
  var totalTravel=line.travelTimes.reduce(function(a,b){return a+b},0);
  for(var d=0;d<line.departures.length;d++){
    var parts=line.departures[d].split(":");
    var depMin=parseInt(parts[0])*60+parseInt(parts[1]);
    if(currentMin>=depMin&&currentMin<=depMin+totalTravel){
      var elapsed=currentMin-depMin;
      for(var i=0;i<line.travelTimes.length;i++){
        if(i+1>=line.stops.length)break;
        if(elapsed<line.travelTimes[i]){
          var ratio=elapsed/line.travelTimes[i];
          return{lat:line.stops[i].lat+ratio*(line.stops[i+1].lat-line.stops[i].lat),lon:line.stops[i].lon+ratio*(line.stops[i+1].lon-line.stops[i].lon),fromStop:line.stops[i].name,toStop:line.stops[i+1].name};
        }
        elapsed-=line.travelTimes[i];
      }
      var last=line.stops[line.stops.length-1];
      return{lat:last.lat,lon:last.lon,fromStop:last.name,toStop:null};
    }
  }
  return null;
}

function getNextDeparture(line,now){
  var currentMin=Math.floor(deptWarsawMinFrac(now));
  for(var i=0;i<line.departures.length;i++){
    var parts=line.departures[i].split(":");
    var depMin=parseInt(parts[0])*60+parseInt(parts[1]);
    if(depMin>currentMin)return line.departures[i];
  }
  return null;
}

function delayText(d){
  if(d>0.7)return "spóźnienie +"+Math.round(d)+" min";
  if(d<-0.7)return "przyspieszenie "+Math.round(-d)+" min";
  return "o czasie";
}

function cumTimes(line){
  if(line._cum)return line._cum;
  var c=[0],s=0;
  for(var i=0;i<line.travelTimes.length;i++){s+=line.travelTimes[i];c.push(s);}
  line._cum=c;
  return c;
}

function assignVtx(line){
  if(line._vi)return line._vi;
  var sh=line.shape||line.stops.map(function(s){return[s.lat,s.lon]});
  line._sh=sh;
  var vi=[];
  line.stops.forEach(function(st){
    var bi=0,bd=Infinity;
    for(var j=0;j<sh.length;j++){
      var d=(sh[j][0]-st.lat)*(sh[j][0]-st.lat)+(sh[j][1]-st.lon)*(sh[j][1]-st.lon);
      if(d<bd){bd=d;bi=j;}
    }
    vi.push(bi);
  });
  line._vi=vi;
  return vi;
}

function elapsedForPoint(line,lat,lon){
  var vi=assignVtx(line),sh=line._sh,cum=cumTimes(line);
  var b=0,bd=Infinity;
  for(var j=0;j<sh.length;j++){
    var d=(sh[j][0]-lat)*(sh[j][0]-lat)+(sh[j][1]-lon)*(sh[j][1]-lon);
    if(d<bd){bd=d;b=j;}
  }
  var k=0;
  for(var i=0;i<vi.length-1;i++){
    if(b<=vi[i+1]){k=i;break;}
  }
  var span=vi[k+1]-vi[k];
  var frac=span>0?(b-vi[k])/span:0;
  if(frac<0)frac=0;
  if(frac>1)frac=1;
  return {elapsed:cum[k]+line.travelTimes[k]*frac,vi:b};
}

function tripFor(line,elapsed,now){
  var cmin=deptWarsawMinFrac(now);
  var expect=elapsed>=0?cmin-elapsed:0;
  var best=cmin,bd=Infinity;
  for(var i=0;i<line.departures.length;i++){
    var p=line.departures[i].split(":");
    var dm=(+p[0])*60+(+p[1]);
    var diff=Math.abs(dm-expect);
    if(diff<bd){bd=diff;best=dm;}
  }
  return{depMin:best,delay:cmin-elapsed-best};
}

function fetchLive(){
  if(!activeLine||activeLine.id!=="731"||!map)return;
  if(_fetchingLive)return;
  _fetchingLive=true;
  DEPT.refreshZtm("731",null,function(v){
    _fetchingLive=false;
    liveVeh=v||[];
    updatePositions();
  });
}

function drawLiveVehicles(){
  liveMarkers.forEach(function(m){map.removeLayer(m)});
  liveMarkers=[];
  if(!liveVeh||liveVeh.length===0)return;
  assignVtx(activeLine);
  var now=new Date();
  liveVeh.forEach(function(v){
    var e=elapsedForPoint(activeLine,v.lat,v.lon);
    var sh=activeLine._sh;
    var m=L.circleMarker(sh[e.vi],{radius:7,fillColor:"#0f9d58",color:"#fff",weight:2,fillOpacity:0.9}).addTo(map)
      .bindPopup("Autobus 731 nr <b>"+deptEsc(v.vn)+"</b><br>Opóźnienie: <b>"+delayText(tripFor(activeLine,e.elapsed,now).delay)+"</b>");
    m._isLive=true;
    liveMarkers.push(m);
  });
}

function getRouteBounds(line){
  var lats=line.stops.map(function(s){return s.lat});
  var lons=line.stops.map(function(s){return s.lon});
  return[[Math.min.apply(null,lats),Math.min.apply(null,lons)],[Math.max.apply(null,lats),Math.max.apply(null,lons)]];
}

function pad(n){return String(n).padStart(2,"0")}

function parseHM(s){
  var p=String(s).split(":");
  return (+p[0])*60+(+p[1]);
}
function fmtHM(m){
  m=Math.round(m)%1440;
  if(m<0)m+=1440;
  return pad(Math.floor(m/60))+":"+pad(m%60);
}
function sumBetween(arr,a,b){
  var s=0;
  for(var k=a;k<b;k++)s+=arr[k];
  return s;
}
function findStop(line,name,prefix){
  for(var i=0;i<line.stops.length;i++){
    if(prefix?line.stops[i].name.indexOf(name)===0:line.stops[i].name===name)return i;
  }
  return -1;
}
function planJourney(){
  var res=document.getElementById("planResult");
  var pt=document.getElementById("planTime");
  if(!res||!pt||!LINES.length)return;
  var t0=parseHM(pt.value||"07:00");
  var walkToStop=10,walkToStation=15;
  var bus=mergeDir(LINES.find(function(l){return l.id==="731"}),1);
  var bi=findStop(bus,"Os. Bukowy Dworek",true);
  var ai=findStop(bus,"Urząd Miasta",false);
  var busTime=bi>=0&&ai>bi?sumBetween(bus.travelTimes,bi,ai)+1:0;
  var busDep=null;
  if(bi>=0&&ai>bi){
    bus.departures.forEach(function(ds){
      var dm=parseHM(ds);
      if(dm>=t0+walkToStop&&busDep===null)busDep=dm;
    });
  }
  if(busDep===null){
    res.innerHTML="<p class='muted'>Brak kursu 731 ze stacji Osiedle Bukowy Dworek po godz. <b>"+fmtHM(t0+walkToStop)+"</b> (kierunek Legionowo – Urząd Miasta). Wybierz wcześniejszą godzinę.</p>";
    return;
  }
  var busArr=busDep+busTime;
  var stationTime=busArr+walkToStation;
  var best=null;
  ["S4","S40"].forEach(function(tid){
    var base=LINES.find(function(l){return l.id===tid});
    if(!base)return;
    var t=mergeDir(base,1);
    var ti=findStop(t,"Legionowo",false);
    var pi=findStop(t,"Warszawa Praga",false);
    if(ti<0||pi<0||pi<=ti)return;
    var tt=sumBetween(t.travelTimes,ti,pi);
    t.departures.forEach(function(ds){
      var dm=parseHM(ds);
      if(dm>=stationTime){
        var arr=dm+tt;
        if(!best||arr<best.arr)best={line:tid,dep:dm,arr:arr,tt:tt};
      }
    });
  });
  if(!best){
    res.innerHTML="<p class='muted'>Po "+(t0>0?fmtHM(t0):"")+" brak pociągu S4/S40 z Legionowa do Warszawy Pragi. Sprawdź inną godzinę.</p>";
    return;
  }
  var h="<div class='plan-leg'><span class='pl'>pieszo</span><span class='pm'><b>"+fmtHM(t0)+"–"+fmtHM(busDep)+"</b> z domu do przystanku <b>Osiedle Bukowy Dworek (2)</b></span></div>";
  h+="<div class='plan-leg'><span class='pl'>731</span><span class='pm'><b>"+fmtHM(busDep)+"–"+fmtHM(busArr)+"</b> do <b>Urzędu Miasta (1)</b> (w stronę Starostwo)</span></div>";
  h+="<div class='plan-leg'><span class='pl'>pieszo</span><span class='pm'><b>"+fmtHM(busArr)+"–"+fmtHM(stationTime)+"</b> z Urzędu Miasta na dworzec <b>Legionowo</b></span></div>";
  h+="<div class='plan-leg'><span class='pl'>"+best.line+"</span><span class='pm'><b>"+fmtHM(best.dep)+"–"+fmtHM(best.arr)+"</b> <b>Legionowo</b> → <b>Warszawa Praga</b></span></div>";
  h+="<div class='plan-total'>Przyjazd <b>Warszawa Praga</b> o <b>"+fmtHM(best.arr)+"</b> · łącznie ok. "+(best.arr-t0)+" min</div>";
  res.innerHTML=h;
}
