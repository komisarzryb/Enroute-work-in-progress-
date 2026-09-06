var map,markers=[],routeLines=[],activeLine=null,mapInitialized=false;

function initMap(){
  if(mapInitialized)return;
  mapInitialized=true;
  map=L.map("leaflet-map",{zoomControl:false,attributionControl:true}).setView([52.402,20.941],11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",maxZoom:18}).addTo(map);
  L.control.zoom({position:"topright"}).addTo(map);
  document.querySelectorAll(".line-btn").forEach(function(btn){
    btn.addEventListener("click",function(){selectLine(btn.dataset.line)});
  });
  selectLine("731");
  setInterval(updatePositions,30000);
}

function refreshMap(){
  if(map)map.invalidateSize();
}

function selectLine(lineId){
  document.querySelectorAll(".line-btn").forEach(function(b){b.classList.remove("active")});
  var btn=document.querySelector('[data-line="'+lineId+'"]');
  if(btn)btn.classList.add("active");
  activeLine=LINES.find(function(l){return l.id===lineId});
  clearMap();
  drawRoute(activeLine);
  updatePositions();
  map.fitBounds(getRouteBounds(activeLine),{padding:[30,30],maxZoom:12});
}

function clearMap(){
  markers.forEach(function(m){map.removeLayer(m)});
  routeLines.forEach(function(l){map.removeLayer(l)});
  markers=[];
  routeLines=[];
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
  line.stops.forEach(function(stop){
    var marker=L.circleMarker([stop.lat,stop.lon],{radius:6,fillColor:line.color,color:"#fff",weight:2,fillOpacity:0.9}).addTo(map).bindPopup("<b>"+stop.name+"</b>");
    markers.push(marker);
  });
}

function updatePositions(){
  if(!activeLine||!map)return;
  markers.filter(function(m){return m._isVehicle}).forEach(function(m){map.removeLayer(m)});
  markers=markers.filter(function(m){return!m._isVehicle});
  var now=new Date();
  var pos=estimatePosition(activeLine,now);
  if(pos){
    var icon=L.divIcon({className:"vehicle-marker",html:"<div style='background:"+activeLine.color+";color:#fff;padding:6px 10px;border-radius:10px;font-weight:800;font-size:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)'>"+activeLine.name+"</div>",iconAnchor:[30,15]});
    var vehicleMarker=L.marker([pos.lat,pos.lon],{icon:icon}).addTo(map);
    vehicleMarker._isVehicle=true;
    markers.push(vehicleMarker);
    var timeStr=pad(now.getHours())+":"+pad(now.getMinutes());
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

function getRouteBounds(line){
  var lats=line.stops.map(function(s){return s.lat});
  var lons=line.stops.map(function(s){return s.lon});
  return[[Math.min.apply(null,lats),Math.min.apply(null,lons)],[Math.max.apply(null,lats),Math.max.apply(null,lons)]];
}

function pad(n){return String(n).padStart(2,"0")}
