var fs=require("fs");var path=require("path");
var base=path.join(__dirname,"..");

function el(){return {addEventListener:function(){},classList:{add:function(){},remove:function(){},toggle:function(){}},style:{},getAttribute:function(){return"";},innerHTML:"",textContent:"",value:"09:40",hidden:false};}
var els={};
global.document={getElementById:function(id){if(!els[id])els[id]=el();return els[id];},querySelectorAll:function(){return[];}};
global.requestAnimationFrame=function(fn){fn();};
global.window=global;

eval(fs.readFileSync(path.join(base,"transport-data.js"),"utf8"));
eval(fs.readFileSync(path.join(base,"schedules.js"),"utf8"));
eval(fs.readFileSync(path.join(base,"planner.js"),"utf8"));

function times(t){var p=t.split(":");return (+p[0])*60+(+p[1]);}
var fails=[];
function ok(c,m){console.log((c?"PASS":"FAIL")+" - "+m);if(!c)fails.push(m);}

console.log("--- REGRESJA: cel 09:40, Z zapasem 20, data 2026-09-09 ---");
var pl=planBackward("school",times("09:40"),"2026-09-09",20);
if(!pl||pl.fail){console.log("FAIL brak planu");process.exit(1);}
pl.legs.forEach(function(l){console.log("   "+(l.type==="walk"?"Pieszo "+minToTime(l.t1)+"-"+minToTime(l.t2):l.line+" "+l.depStr+"->"+l.arrStr));});

var train=null,tidx=-1;
for(var i=0;i<pl.legs.length;i++){if(pl.legs[i].type==="ride"&&pl.legs[i].arrStr==="09:01"){train=pl.legs[i];tidx=i;}}
ok(!!train&&pl.legs[tidx+1].type==="walk","pociag 08:45->09:01, nastepny spacer");
var walk=pl.legs[tidx+1];
if(train&&walk&&walk.type==="walk"){
  ok(walk.t1===times("09:01"),"koncowy spacer startuje natychmiast o 09:01 (rzeczywisty "+(walk.t1===times("09:01")?minToTime(walk.t1):minToTime(walk.t1))+")");
  ok(walk.t2===times("09:07"),"koncowy spacer konczy sie 09:01+6min = "+minToTime(walk.t2));
  ok(walk.min===6,"spacer jest 6 minut");
}
var buffer=times("09:40")-pl.arriveTarget;
ok(pl.arriveTarget===times("09:07"),"przyjazd = 09:07");
ok(buffer>=20,"zapas "+buffer+" min >= 20");

var html=planTimelineHTML(pl);
ok(html.indexOf("09:01 – 09:07")>-1,"timeline zawiera '09:01 – 09:07'");
ok(html.indexOf("09:01 – 09:14")===-1,"timeline NIE zawiera '09:01 – 09:14'");

// NIGDY nie ma czekania, po ktorym idzie spacer (spacer zawsze natychmiast)
var walkGap=false;
for(var g=1;g<pl.legs.length;g++){
  if(pl.legs[g-1].t2<pl.legs[g].t1&&pl.legs[g].type==="walk")walkGap=true;
}
ok(!walkGap,"brak czekania przed etapem spaceru (spacer zawsze bezposrednio)");

// realne czekanie (przesiadka pieszo->pociag) pozostaje
var realWaits=(html.match(/tl-badge-wait/g)||[]).length;
ok(realWaits>0,"zachowane realne czekanie przesiadkowe ("+realWaits+")");
ok(html.indexOf("Czekanie</span><span class=\"tl-dur\">13 min</span>")===-1,"brak sztucznego 'Czekanie 13 min'");

console.log("");
console.log("--- INVARIANT: wsystkie daty okna rozkladu, cel 09:40, Z zapasem ---");
for(var dd=new Date(SCHEDULES.meta.start);dd<=new Date(SCHEDULES.meta.end);dd.setDate(dd.getDate()+1)){
  var ds=dd.getFullYear()+"-"+String(dd.getMonth()+1).padStart(2,"0")+"-"+String(dd.getDate()).padStart(2,"0");
  var p=planBackward("school",times("09:40"),ds,20);
  if(!p||p.fail)continue;
  var gap=false;
  for(var g=1;g<p.legs.length;g++){if(p.legs[g-1].t2<p.legs[g].t1&&p.legs[g].type==="walk")gap=true;}
  if(gap)fails.push(ds+": czekanie przed spacerem");
  if(times("09:40")-p.arriveTarget<20)fails.push(ds+": zapas < 20 ("+(times("09:40")-p.arriveTarget)+" przyjazd "+minToTime(p.arriveTarget)+")");
}
if(!fails.length||true){for(var dd=new Date(SCHEDULES.meta.start);dd<=new Date(SCHEDULES.meta.end);dd.setDate(dd.getDate()+1)){
  var ds=dd.getFullYear()+"-"+String(dd.getMonth()+1).padStart(2,"0")+"-"+String(dd.getDate()).padStart(2,"0");
  var p=planBackward("school",times("09:40"),ds,20);
  if(p&&!p.fail)console.log("   "+ds+" -> przyjazd "+minToTime(p.arriveTarget)+", zapas "+(times("09:40")-p.arriveTarget));
}}

console.log("");
console.log("--- FAST i POWROT bez zmian ---");
var f=planBackward("school",times("09:40"),"2026-09-09",0);
ok(f&&!f.fail&&f.arriveTarget===times("09:40"),"fast: przyjazd = cel ("+minToTime(f.arriveTarget)+")");
var r=planForward("school",times("15:25"),"2026-09-09");
ok(r&&!r.fail&&r.arriveTarget>0,"powrot dziala (dom "+minToTime(r.arriveTarget)+")");

console.log("");
if(fails.length){console.log("FAIL");fails.forEach(function(x){console.log(" - "+x);});process.exit(1);}
console.log("WSZYSTKIE TESTY PASS");