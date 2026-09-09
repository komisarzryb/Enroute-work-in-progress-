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
function dump(pl){pl.legs.forEach(function(l){console.log("   "+(l.type==="walk"?"Pieszo "+minToTime(l.t1)+"-"+minToTime(l.t2):l.line+" "+l.depStr+"->"+l.arrStr));});}
function noGapBeforeWalk(legs){
  for(var i=1;i<legs.length;i++){if(legs[i-1].t2<legs[i].t1&&legs[i].type==="walk")return false;}
  return true;
}

console.log("=== REGRESJA FAST: S4 08:45-09:01 -> spacer 6 min -> 09:01-09:07 (cel 09:30) ===");
var f=planBackward("school",times("09:30"),"2026-09-09",0);
if(!f||f.fail){console.log("FAIL brak planu fast");process.exit(1);}
dump(f);
var tr=null,ti=-1;
for(var i=0;i<f.legs.length;i++){if(f.legs[i].type==="ride"&&f.legs[i].arrStr==="09:01"){tr=f.legs[i];ti=i;}}
ok(!!tr&&f.legs[ti+1].type==="walk"&&f.legs[ti+1].t1===times("09:01")&&f.legs[ti+1].t2===times("09:07"),
   "spacer po 09:01 jest natychmiastowy: 09:01-09:07");
ok(f.arriveTarget===times("09:07"),"fast przyjazd = 09:07");
var fh=planTimelineHTML(f);
ok(fh.indexOf("09:01 – 09:14")===-1,"timeline NIE zawiera '09:01 – 09:14'");
ok(fh.indexOf("09:01 – 09:07")>-1,"timeline zawiera '09:01 – 09:07'");
ok(noGapBeforeWalk(f.legs),"brak czekania przed jakimkolwiek spacerem");

console.log("");
console.log("=== FAST 09:40 (najpozniejsza kombinacja, naturalny przyjazd) ===");
var f2=planBackward("school",times("09:40"),"2026-09-09",0);
dump(f2);
ok(f2.arriveTarget<=times("09:40"),"przyjazd "+minToTime(f2.arriveTarget)+" <= cel 09:40");
ok(noGapBeforeWalk(f2.legs),"brak czekania przed spacerem (fast 09:40)");
var ow=(planTimelineHTML(f2).match(/tl-badge-wait/g)||[]).length;
ok(ow>0,"realne czekania przesiadkowe zachowane ("+ow+")");

console.log("");
console.log("=== INVARIANT FAST: wszystkie daty x cele: nigdy czekanie przed spacerem, przyjazd <= cel ===");
var dates=[];
for(var d=new Date(SCHEDULES.meta.start);d<=new Date(SCHEDULES.meta.end);d.setDate(d.getDate()+1)){
  dates.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"));
}
["08:00","08:30","09:00","09:30","09:40","10:00","12:00"].forEach(function(t){
  dates.forEach(function(ds){
    var p=planBackward("school",times(t),ds,0);
    if(!p||p.fail)return;
    if(!noGapBeforeWalk(p.legs))fails.push("FAST "+ds+" "+t+": czekanie przed spacerem");
    if(p.arriveTarget>times(t))fails.push("FAST "+ds+" "+t+": przyjazd po cslu ("+minToTime(p.arriveTarget)+")");
  });
});
ok(true,"przeskanowano "+dates.length+" dat x 7 celow");

console.log("");
console.log("=== ZAPAS oraz POWROT bez zmian ===");
var b=planBackward("school",times("09:40"),"2026-09-09",20);
ok(b&&b.arriveTarget===times("09:07")&&(times("09:40")-b.arriveTarget)>=20,
   "ZAPAS: przyjazd 09:07, zapas 33 >= 20 (logika bez zmian)");
var r=planForward("school",times("15:25"),"2026-09-09");
ok(r&&!r.fail&&r.arriveTarget>0,"powrot dziala (dom "+minToTime(r.arriveTarget)+")");

console.log("");
if(fails.length){console.log("FAIL");fails.forEach(function(x){console.log(" - "+x);});process.exit(1);}
console.log("WSZYSTKIE TESTY PASS");