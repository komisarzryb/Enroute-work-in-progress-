var map,markers=[],routeLines=[],activeLine=null,mapInitialized=false,liveMarkers=[],liveVeh=null,lastLiveFetch=0,curLineId="731",curDir=0;

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
  setInterval(updatePositions,30000);
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
  activeLine=mergeDir(base,curDir);
  clearMap();
  drawRoute(activeLine);
  renderDirButtons();
  updatePositions();
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
    var other=mergeDir(LINES.find(function(l){return l.id===line.id}),1-curDir);
    line.posts.forEach(function(p){
      var cur=p.dir===curDir;
      var marker=L.circleMarker([p.lat,p.lon],{radius:cur?6:4,fillColor:cur?line.color:"#5b708b",color:"#fff",weight:cur?2:1,fillOpacity:cur?0.9:0.5}).addTo(map).bindPopup(function(){
        return postPopupHTML(p,cur?line:other);
      });
      markers.push(marker);
    });
  }else{
    line.stops.forEach(function(stop,si){
      var marker=L.circleMarker([stop.lat,stop.lon],{radius:6,fillColor:line.color,color:"#fff",weight:2,fillOpacity:0.9}).addTo(map).bindPopup(function(){return stopPopupHTML(line,si)});
      markers.push(marker);
    });
  }
}

function postPopupHTML(p,line){
  var cum=cumTimes(line);
  var now=new Date(),cmin=nowMinFrac(now);
  var nextArr=null;
  line.departures.forEach(function(ds){
    var pp=ds.split(":");
    var dm=(+pp[0])*60+(+pp[1]);
    var a=dm+cum[p.si];
    if(a>=cmin&&(nextArr===null||a<nextArr))nextArr=a;
  });
  var h="<b>"+p.name+"</b><br><span style='color:"+line.color+"'>"+line.fullName+"</span><br>";
  if(nextArr!==null){
    h+="<b>Najbliższy:</b> "+minToHM(nextArr)+" (za "+Math.round(nextArr-cmin)+" min)<br>";
  }else{
    h+="Dziś brak już kursu<br>";
  }
  if(line.id==="731"&&liveVeh&&liveVeh.length){
    var b=liveETA(line,p.si,now);
    if(b){
      h+="<b>Na żywo:</b> nr "+b.vn+" → "+minToHM(b.eta)+", "+delayText(b.delay);
    }else{
      h+="<i>Brak autobusu na żywo przed tym przystankiem</i>";
    }
  }else if(line.id!=="731"){
    h+="<i>Plan, bez danych na żywo</i>";
  }
  if(p.dir!==curDir)h+="<br><i>(słupek w drugą stronę)</i>";
  return h;
}

function updatePositions(){
  if(!activeLine||!map)return;
  markers.filter(function(m){return m._isVehicle}).forEach(function(m){map.removeLayer(m)});
  markers=markers.filter(function(m){return!m._isVehicle});
  fetchLive();
  var now=new Date();
  var timeStr=pad(now.getHours())+":"+pad(now.getMinutes());
  var liveUsed=activeLine.id==="731"&&liveVeh&&liveVeh.length>0;
  if(liveUsed){
    drawLiveVehicles();
    document.getElementById("map-info").innerHTML="<b>"+activeLine.fullName+"</b><p>Pozycje na żywo (ZTM): "+liveVeh.length+" pojazdów</p><strong>Czas: "+timeStr+"</strong>";
    return;
  }
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
  var currentMin=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  var totalTravel=line.travelTimes.reduce(function(a,b){return a+b},0);
  for(var d=0;d<line.departures.length;d++){
    var parts=line.departures[d].split(":");
    var depMin=parseInt(parts[0])*60+parseInt(parts[1]);
    if(currentMin>=depMin&&currentMin<=depMin+totalTravel){
      var elapsed=currentMin-depMin;
      for(var i=0;i<line.travelTimes.length;i++){
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
  var currentMin=now.getHours()*60+now.getMinutes();
  for(var i=0;i<line.departures.length;i++){
    var parts=line.departures[i].split(":");
    var depMin=parseInt(parts[0])*60+parseInt(parts[1]);
    if(depMin>currentMin)return line.departures[i];
  }
  return null;
}

function nowMinFrac(d){return d.getHours()*60+d.getMinutes()+d.getSeconds()/60}

function minToHM(m){
  m=Math.round(m)%1440;
  if(m<0)m+=1440;
  return pad(Math.floor(m/60))+":"+pad(m%60);
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
  var cmin=nowMinFrac(now);
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

function liveETA(line,idx,now){
  var cum=cumTimes(line),cmin=nowMinFrac(now);
  var best=null;
  liveVeh.forEach(function(v){
    var e=elapsedForPoint(line,v.lat,v.lon);
    var t=tripFor(line,e.elapsed,now);
    var eta=t.depMin+cum[idx]+t.delay;
    if(eta>=cmin&&(best===null||eta<best.eta))best={eta:eta,delay:t.delay,vn:v.vn};
  });
  return best;
}

function stopPopupHTML(line,idx){
  var st=line.stops[idx],cum=cumTimes(line);
  var now=new Date(),cmin=nowMinFrac(now);
  var nextArr=null;
  line.departures.forEach(function(ds){
    var p=ds.split(":");
    var dm=(+p[0])*60+(+p[1]);
    var a=dm+cum[idx];
    if(a>=cmin&&(nextArr===null||a<nextArr))nextArr=a;
  });
  var h="<b>"+st.name+"</b><br><span style='color:"+line.color+"'>"+line.fullName+"</span><br>";
  if(nextArr!==null){
    h+="<b>Najbliższy:</b> "+minToHM(nextArr)+" (za "+Math.round(nextArr-cmin)+" min)<br>";
  }else{
    h+="Dziś brak już kursu<br>";
  }
  if(line.id==="731"&&liveVeh&&liveVeh.length){
    var b=liveETA(line,idx,now);
    if(b){
      h+="<b>Na żywo:</b> nr "+b.vn+" → "+minToHM(b.eta)+", "+delayText(b.delay);
    }else{
      h+="<i>Brak autobusu na żywo przed tym przystankiem</i>";
    }
  }else if(line.id!=="731"){
    h+="<i>Plan, bez danych na żywo</i>";
  }
  return h;
}

function parseWarsawTime(s){
  if(!s)return NaN;
  var m=s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if(!m)return NaN;
  return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]).getTime();
}

function fetchLive(){
  if(!activeLine||activeLine.id!=="731"||!map)return;
  var t=Date.now();
  if(t-lastLiveFetch<15000)return;
  lastLiveFetch=t;
  fetch("https://api.um.warszawa.pl/api/action/busestrams_get/?resource_id=f2e5503e-927d-4ad3-9500-4ab9e55deb59&type=1&apikey=fde6064a-316e-4407-bf99-d90693976428")
    .then(function(r){return r.json()})
    .then(function(j){
      var out=[];
      if(Array.isArray(j&&j.result)){
        var nowMs=Date.now();
        j.result.forEach(function(x){
          if(String(x.Lines)!=="731")return;
          var la=parseFloat(x.Lat),lo=parseFloat(x.Lon);
          if(isNaN(la)||isNaN(lo))return;
          var ageMs=nowMs-parseWarsawTime(x.Time);
          if(!isNaN(ageMs)&&ageMs>120000)return;
          out.push({lat:la,lon:lo,vn:String(x.VehicleNumber),br:String(x.Brigade)});
        });
      }
      liveVeh=out;
      if(activeLine&&activeLine.id==="731")updatePositions();
    })
    .catch(function(){});
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
      .bindPopup("Autobus 731 nr <b>"+v.vn+"</b><br>Opóźnienie: <b>"+delayText(tripFor(activeLine,e.elapsed,now).delay)+"</b>");
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
  if(!res||!LINES.length)return;
  var t0=parseHM(document.getElementById("planTime").value||"07:00");
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
  var h="<div class='plan-leg'><span class='pt'>"+fmtHM(t0)+"</span><span class='pm'>Wyjście z domu. Pieszo <b>"+walkToStop+" min</b> do przystanku <b>Osiedle Bukowy Dworek (2)</b> (przyjazd ok. "+fmtHM(busDep)+")</span></div>";
  h+="<div class='plan-leg'><span class='pt'>"+fmtHM(busDep)+"</span><span class='pm'>Autobus <b>731</b> w stronę Starostwo → <b>Urząd Miasta (1)</b> o <b>"+fmtHM(busArr)+"</b> (jazda ok. "+(busTime)+" min)</span></div>";
  h+="<div class='plan-leg'><span class='pt'>"+fmtHM(busArr)+"</span><span class='pm'>Pieszo <b>"+walkToStation+" min</b> z Urzędu Miasta na stację <b>Legionowo</b> (na miejscu ok. "+fmtHM(stationTime)+")</span></div>";
  h+="<div class='plan-leg'><span class='pt'>"+fmtHM(best.dep)+"</span><span class='pm'>Pociąg <b>"+best.line+"</b> z <b>Legionowa</b> → <b>Warszawa Praga</b> o <b>"+fmtHM(best.arr)+"</b> (jazda ok. "+best.tt+" min)</span></div>";
  h+="<div class='plan-total'>Dojazd od wyjścia z domu: <b>"+fmtHM(best.arr)+"</b> · łącznie ok. "+(best.arr-t0)+" min</div>";
  res.innerHTML=h;
}
