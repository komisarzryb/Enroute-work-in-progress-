function timeToMin(s){var p=String(s).split(":");return(+p[0])*60+(+p[1]);}
function minToTime(m){m=Math.round(m);m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");}
function schedRefDate(date){
  if(typeof date!=="string")date=(new Date()).getFullYear()+'-'+String((new Date()).getMonth()+1).padStart(2,'0')+'-'+String((new Date()).getDate()).padStart(2,'0');
  if(date>=SCHEDULES.meta.start&&date<=SCHEDULES.meta.end)return date;
  var dow=new Date(date+'T12:00:00').getDay();
  var sd=SCHEDULES.meta.start,ed=SCHEDULES.meta.end;
  var d=new Date(sd+'T12:00:00');
  var end=new Date(ed+'T12:00:00');
  while(d<=end){if(d.getDay()===dow)return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');d.setDate(d.getDate()+1);}
  return sd;
}

function queryTrips(lineIds,fromName,toName,date){
  var fn=fromName.replace(/\s*\(\d+\)\s*$/,'').trim();
  var tn=toName.replace(/\s*\(\d+\)\s*$/,'').trim();
  var lines=Array.isArray(lineIds)?lineIds:[lineIds],results=[];
  for(var li=0;li<lines.length;li++){var line=lines[li];
    var data=SCHEDULES.lines[line];if(!data)continue;
    var nameMap={};
    for(var k=0;k<data.keys.length;k++){
      var n=data.keys[k][1];if(!nameMap[n])nameMap[n]=[];nameMap[n].push(k);
    }
    var fki=nameMap[fn]||[],tki=nameMap[tn]||[];
    if(!fki.length||!tki.length)continue;
    for(var ti=0;ti<data.trips.length;ti++){
      var trip=data.trips[ti];
      if(!trip[1].includes(date))continue;
      var stops=trip[3],fi2=-1,ti2=-1;
      for(var si=0;si<stops.length;si++){
        var ki=stops[si][0];
        if(fi2<0&&fki.indexOf(ki)>=0)fi2=si;
        if(tki.indexOf(ki)>=0)ti2=si;
      }
      if(fi2>=0&&ti2>fi2){
        var dep=stops[fi2].length>2?stops[fi2][2]:stops[fi2][1];
        var arr=stops[ti2][1];
        results.push({line:line,tid:trip[0],dep:dep,arr:arr});
      }
    }
  }
  results.sort(function(a,b){return a.dep<b.dep?-1:a.dep>b.dep?1:0;});
  return results;
}

var PLAN_MODE="buffer";
var PLAN_BUFFER=20;

function planBackward(routeId,targetMin,date,bufferMin){
  var route=null;
  for(var i=0;i<ROUTES.length;i++){if(ROUTES[i].id===routeId){route=ROUTES[i];break;}}
  if(!route)return null;
  var refDate=schedRefDate(date);
  if(bufferMin>0){
    var buffered=planBackwardFor(route,targetMin-bufferMin,refDate);
    if(buffered){buffered.target=targetMin;return buffered;}
  }
  var res=planBackwardFor(route,targetMin,refDate);
  if(res)return res;
  return{fail:true,target:targetMin,route:route.name,date:refDate};
}

function planBackwardFor(route,targetMin,refDate){
  var legs=[],limit=targetMin,ok=true;
  for(var i=route.legs.length-1;i>=0;i--){
    var leg=route.legs[i];
    if(leg.type==="walk"){
      var w1=limit-leg.min;
      if(w1<0){ok=false;break;}
      legs.unshift({type:"walk",label:leg.label,min:leg.min,t1:w1,t2:limit});
      limit=w1;
    }else{
      var cands=queryTrips(leg.line,leg.from,leg.to,refDate);
      if(!cands.length){ok=false;break;}
      var limitDep=limit-leg.buffer;
      var best=null;
      for(var c=0;c<cands.length;c++){
        if(timeToMin(cands[c].arr)<=limitDep){
          if(!best||cands[c].dep>best.dep)best=cands[c];
        }
      }
      if(!best){ok=false;break;}
      legs.unshift({type:"ride",line:best.line,t1:timeToMin(best.dep),t2:timeToMin(best.arr),depStr:best.dep,arrStr:best.arr,fromName:leg.from,toName:leg.to,tid:best.tid});
      limit=timeToMin(best.dep)-(leg.margin||0);
    }
  }
  if(!ok)return null;
  return{route:route.name,legs:legs,leaveHome:legs[0].t1,arriveTarget:legs[legs.length-1].t2,target:targetMin,date:refDate};
}

function planForward(routeId,startMin,date){
  var route=null;
  for(var i=0;i<ROUTES.length;i++){if(ROUTES[i].id===routeId){route=ROUTES[i];break;}}
  if(!route)return null;
  var refDate=schedRefDate(date);
  var defs=route.legs.slice().reverse(),out=[],current=startMin,ok=true;
  for(var i=0;i<defs.length;i++){
    var def=defs[i];
    if(def.type==="walk"){
      out.push({type:"walk",label:def.labelBack||def.label,min:def.min,t1:current,t2:current+def.min});
      current=current+def.min;
    }else{
      var cands=queryTrips(def.line,def.to,def.from,refDate);
      if(!cands.length){ok=false;break;}
      var best=null;
      var needMin=current+(def.margin||0);
      for(var c=0;c<cands.length;c++){
        if(timeToMin(cands[c].dep)>=needMin){
          if(!best||cands[c].dep<best.dep)best=cands[c];
        }
      }
      if(!best){ok=false;break;}
      out.push({type:"ride",line:best.line,t1:timeToMin(best.dep),t2:timeToMin(best.arr),depStr:best.dep,arrStr:best.arr,fromName:def.to,toName:def.from,tid:best.tid});
      current=timeToMin(best.arr)+(def.buffer||0);
    }
  }
  if(!ok)return{fail:true,start:startMin,route:route?route.name:'',date:refDate};
  return{route:route.name,legs:out,startMin:startMin,arriveTarget:out[out.length-1].t2,date:refDate};
}

function planSummaryHTML(plan){
  if(!plan)return "";
  var h="",prevT2=null;
  plan.legs.forEach(function(leg){
    if(prevT2!==null&&leg.t1>prevT2)h+="<br>czekanie <b>"+(leg.t1-prevT2)+" min</b>";
    var id=leg.type==="ride"?leg.line:"pieszo";
    var txt=leg.type==="ride"?leg.fromName+" → "+leg.toName:leg.label;
    var times=leg.type==="ride"?
      (leg.depStr===leg.arrStr?minToTime(leg.t1)+"–"+minToTime(leg.t2):leg.depStr+"–"+leg.arrStr):
      minToTime(leg.t1)+"–"+minToTime(leg.t2);
    h+="<br>"+id+" <b>"+times+"</b> "+txt;
    prevT2=leg.t2;
  });
  return h;
}

function planTimelineHTML(plan){
  if(!plan||!plan.legs)return "";
  var h="";
  h+='<div class="tl-item">';
  h+='<div class="tl-dot tl-dot-start"></div>';
  h+='<div class="tl-line"></div>';
  h+='<div class="tl-body">';
  h+='<div class="tl-time">'+minToTime(plan.legs[0].t1)+'</div>';
  h+='<div class="tl-label">Wyjście z domu</div>';
  h+='</div></div>';

  var prevT2=plan.legs[0].t1;
  plan.legs.forEach(function(leg,i){
    var isLast=i===plan.legs.length-1;
    if(leg.t1>prevT2){
      h+='<div class="tl-item">';
      h+='<div class="tl-dot tl-dot-wait"></div>';
      if(!isLast)h+='<div class="tl-line"></div>';
      h+='<div class="tl-body">';
      h+='<div class="tl-row"><span class="tl-badge tl-badge-wait">Czekanie</span><span class="tl-dur">'+(leg.t1-prevT2)+' min</span></div>';
      h+='<div class="tl-times">'+minToTime(prevT2)+' – '+minToTime(leg.t1)+'</div>';
      h+='</div></div>';
    }
    if(leg.type==="walk"){
      h+='<div class="tl-dot tl-dot-walk"></div>';
      if(!isLast)h+='<div class="tl-line"></div>';
      h+='<div class="tl-body">';
      h+='<div class="tl-row"><span class="tl-badge tl-badge-walk">Pieszo</span><span class="tl-dur">'+leg.min+' min</span></div>';
      h+='<div class="tl-times">'+minToTime(leg.t1)+' – '+minToTime(leg.t2)+'</div>';
      h+='<div class="tl-desc">'+leg.label+'</div>';
      h+='</div></div>';
    }else{
      var dotCls=leg.line==="731"?"tl-dot-bus":"tl-dot-train";
      var badgeCls=leg.line==="731"?"tl-badge-bus":"tl-badge-train";
      var dur=Math.round(leg.t2-leg.t1);
      h+='<div class="tl-dot '+dotCls+'"></div>';
      if(!isLast)h+='<div class="tl-line"></div>';
      h+='<div class="tl-body">';
      h+='<div class="tl-row"><span class="tl-badge '+badgeCls+'">'+leg.line+'</span><span class="tl-dur">'+dur+' min</span></div>';
      var times=leg.depStr===leg.arrStr?minToTime(leg.t1)+' – '+minToTime(leg.t2):leg.depStr+' – '+leg.arrStr;
      h+='<div class="tl-times">'+times+'</div>';
      h+='<div class="tl-desc">'+leg.fromName+' → '+leg.toName+'</div>';
      h+='</div></div>';
    }
    prevT2=leg.t2;
  });

  var lastLeg=plan.legs[plan.legs.length-1];
  h+='<div class="tl-item">';
  h+='<div class="tl-dot tl-dot-end"></div>';
  h+='<div class="tl-body">';
  h+='<div class="tl-time">'+minToTime(lastLeg.t2)+'</div>';
  h+='<div class="tl-label">Przyjazd</div>';
  h+='</div></div>';

  return h;
}

function renderSchoolPlan(){
  var inp=document.getElementById("schoolTime");
  var leave=document.getElementById("leave");
  var morning=document.getElementById("morning");
  var tl=document.getElementById("homeTimeline");
  var tlCard=document.getElementById("timelineCard");
  var summary=document.getElementById("routeSummary");
  var display=document.getElementById("schoolTimeDisplay");
  if(!inp||!leave)return;

  if(display)display.textContent=inp.value||"09:40";
  var goal=timeToMin(inp.value||"08:00");
  var pl=planBackward("school",goal,undefined,PLAN_MODE==="buffer"?PLAN_BUFFER:0);

  if(!pl||pl.fail){
    leave.textContent="Brak połączenia";
    morning.innerHTML="Nie znaleziono trasy na <b>"+minToTime(goal)+"</b> w tym oknie rozkładowym.";
    if(tlCard)tlCard.hidden=true;
    if(summary)summary.innerHTML="";
    return;
  }

  leave.textContent=minToTime(pl.leaveHome);
  var buffer=Math.max(0,goal-pl.arriveTarget);
  morning.innerHTML="Przyjazd <b>"+minToTime(pl.arriveTarget)+"</b> · "+buffer+" min zapasu";

  if(tl){tl.innerHTML=planTimelineHTML(pl);}
  if(tlCard)tlCard.hidden=false;

  if(summary){
    var badges=[];
    pl.legs.forEach(function(leg){
      if(leg.type==="ride"){
        var cls=leg.line==="731"?"summary-badge-bus":"summary-badge-train";
        badges.push('<span class="summary-badge '+cls+'">'+leg.line+'</span>');
      }else{
        badges.push('<span class="summary-badge summary-badge-walk">Pieszo</span>');
      }
    });
    summary.innerHTML='<div class="route-badges">'+badges.join('<span class="route-arrow">&rarr;</span>')+'</div>';
  }
}

function renderReturnPlan(){
  var inp=document.getElementById("endTime");
  var out=document.getElementById("returnResult");
  if(!inp||!out)return;
  var start=timeToMin(inp.value||"15:25");
  var pl=planForward("school",start);
  if(!pl||pl.fail){
    out.innerHTML='<span class="muted">Brak połączenia powrotnego z wyjścia o '+minToTime(start)+'.</span>';
    return;
  }
  out.innerHTML='<b>Wyjście ze szkoły o '+minToTime(pl.startMin)+'</b>'
    +planSummaryHTML(pl)
    +'<br><b>W domu o '+minToTime(pl.arriveTarget)+'</b>'
    +'<br><small class="muted">Rozkład z dnia '+pl.date+'</small>';
}

if(typeof document!=="undefined"){
  var planBtn=document.getElementById("plan");
  if(planBtn)planBtn.addEventListener("click",function(){
    var card=document.getElementById("routeCard");
    if(card)card.classList.add("loading");
    requestAnimationFrame(function(){
      renderSchoolPlan();
      if(card)card.classList.remove("loading");
    });
  });
  var schoolInp=document.getElementById("schoolTime");
  if(schoolInp)schoolInp.addEventListener("change",renderSchoolPlan);
  var retBtn=document.getElementById("return");
  if(retBtn)retBtn.addEventListener("click",renderReturnPlan);
  var endInp=document.getElementById("endTime");
  if(endInp)endInp.addEventListener("change",renderReturnPlan);
  var modeBtns=document.querySelectorAll(".mode-btn");
  modeBtns.forEach(function(b){
    b.addEventListener("click",function(){
      PLAN_MODE=b.getAttribute("data-mode")||"buffer";
      modeBtns.forEach(function(x){x.classList.toggle("active",x===b)});
      var info=document.getElementById("planBufferInfo");
      if(info)info.style.display=PLAN_MODE==="buffer"?"":"none";
      renderSchoolPlan();
    });
  });
  renderSchoolPlan();
  renderReturnPlan();
}
