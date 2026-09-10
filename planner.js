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
    if(buffered){reanchorWalks(buffered);buffered.target=targetMin;return buffered;}
  }
  var res=planBackwardFor(route,targetMin,refDate);
  if(res){reanchorWalks(res);res.target=targetMin;return res;}
  return{fail:true,target:targetMin,route:route.name,date:refDate};
}

function reanchorWalks(plan){
  var legs=plan.legs;
  for(var i=1;i<legs.length;i++){
    if(legs[i].type==="walk"){
      legs[i].t1=legs[i-1].t2;
      legs[i].t2=legs[i-1].t2+legs[i].min;
    }
  }
  plan.leaveHome=legs[0].t1;
  plan.arriveTarget=legs[legs.length-1].t2;
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

function planTimelineHTML(plan,labels){
  if(!plan||!plan.legs)return "";
  var L=labels||{};
  var startLabel=L.startLabel||"Wyjście z domu";
  var endLabel=L.endLabel||"Przyjazd";
  var h="";
  h+='<div class="tl-item">';
  h+='<div class="tl-dot tl-dot-start"></div>';
  h+='<div class="tl-line"></div>';
  h+='<div class="tl-body">';
  h+='<div class="tl-time">'+minToTime(plan.legs[0].t1)+'</div>';
  h+='<div class="tl-label">'+startLabel+'</div>';
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
  h+='<div class="tl-label">'+endLabel+'</div>';
  h+='</div></div>';

  return h;
}

function planTimelineRender(plan,labels){
  var icons={
    walk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="13" cy="4" r="2"/><path d="M8 21l3-6 3 2 1 4"/><path d="M14 11l3-2 2 3"/><path d="M10 8L8 12h5"/></svg>',
    bus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="8.5" cy="18" r=".5"/><circle cx="15.5" cy="18" r=".5"/><line x1="4" y1="10" x2="20" y2="10"/></svg>',
    train:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="5" y="3" width="14" height="14" rx="2"/><path d="M5 15h14"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/><path d="M9 3V1M15 3V1"/></svg>'
  };
  var h="";
  h+='<div class="rt-item rt-item-start">';
  h+='<div class="rt-dot rt-dot-start"></div>';
  h+='<div class="rt-body">';
  h+='<div class="rt-time">'+minToTime(plan.legs[0].t1)+'</div>';
  h+='<div class="rt-label">'+(labels&&labels.startLabel||"Wyjście")+'</div>';
  h+='</div></div>';

  var prevT2=plan.legs[0].t1;
  plan.legs.forEach(function(leg,i){
    var isLast=i===plan.legs.length-1;
    if(leg.t1>prevT2){
      h+='<div class="rt-item rt-item-wait">';
      h+='<div class="rt-dot rt-dot-wait"></div>';
      if(!isLast)h+='<div class="rt-line"></div>';
      h+='<div class="rt-body">';
      h+='<div class="rt-row"><span class="rt-badge rt-badge-wait">Czekanie</span><span class="rt-dur">'+(leg.t1-prevT2)+' min</span></div>';
      h+='<div class="rt-times">'+minToTime(prevT2)+' – '+minToTime(leg.t1)+'</div>';
      h+='</div></div>';
    }
    if(leg.type==="walk"){
      h+='<div class="rt-item">';
      h+='<div class="rt-dot rt-dot-walk"></div>';
      if(!isLast)h+='<div class="rt-line"></div>';
      h+='<div class="rt-body">';
      h+='<div class="rt-row"><span class="rt-badge rt-badge-walk">'+icons.walk+'Pieszo</span><span class="rt-dur">'+leg.min+' min</span></div>';
      h+='<div class="rt-times">'+minToTime(leg.t1)+' – '+minToTime(leg.t2)+'</div>';
      h+='<div class="rt-desc">'+leg.label+'</div>';
      h+='</div></div>';
    }else{
      var dotCls=leg.line==="731"?"rt-dot-bus":"rt-dot-train";
      var badgeCls=leg.line==="731"?"rt-badge-bus":"rt-badge-train";
      var ic=leg.line==="731"?icons.bus:icons.train;
      var dur=Math.round(leg.t2-leg.t1);
      h+='<div class="rt-item">';
      h+='<div class="rt-dot '+dotCls+'"></div>';
      if(!isLast)h+='<div class="rt-line"></div>';
      h+='<div class="rt-body">';
      h+='<div class="rt-row"><span class="rt-badge '+badgeCls+'">'+ic+leg.line+'</span><span class="rt-dur">'+dur+' min</span></div>';
      var times=leg.depStr===leg.arrStr?minToTime(leg.t1)+' – '+minToTime(leg.t2):leg.depStr+' – '+leg.arrStr;
      h+='<div class="rt-times">'+times+'</div>';
      h+='<div class="rt-desc">'+leg.fromName+' → '+leg.toName+'</div>';
      h+='</div></div>';
    }
    prevT2=leg.t2;
  });

  return h;
}

function durationText(min){
  var m=Math.round(min);
  if(m<60)return m+" min";
  var h=Math.floor(m/60),mm=m-h*60;
  return h+" h "+String(mm).padStart(2,"0")+" min";
}

function renderReturnPlan(){
  var inp=document.getElementById("endTime");
  var out=document.getElementById("returnResult");
  var hint=document.getElementById("returnHint");
  if(!inp||!out)return;
  if(hint)hint.hidden=true;
  var start=timeToMin(inp.value||"15:25");
  var pl=planForward("school",start);
  if(!pl||pl.fail){
    out.innerHTML='<div class="return-error">Brak połączenia powrotnego z wyjścia o <b>'+minToTime(start)+'</b>.</div><div class="muted">Nie znaleziono trasy w tym oknie rozkładowym.</div>';
    return;
  }
  var h="";
  h+='<div class="return-hero">';
  h+='<div class="return-hero-label">WYJŚCIE ZE SZKOŁY</div>';
  h+='<div class="return-hero-time">'+minToTime(pl.startMin)+'</div>';
  h+='</div>';
  h+='<div class="return-route-head">TRASA</div>';
  h+='<div class="rt">'+planTimelineRender(pl,{startLabel:"Wyjście ze szkoły"})+'</div>';
  h+='<div class="return-summary">';
  h+='<div class="return-at">W DOMU <span class="return-at-time">'+minToTime(pl.arriveTarget)+'</span></div>';
  h+='<div class="return-total">Łączny czas podróży: <b>'+durationText(pl.arriveTarget-pl.startMin)+'</b></div>';
  h+='</div>';
  out.innerHTML=h;
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
  var tripBtns=document.querySelectorAll(".trip-btn");
  tripBtns.forEach(function(b){
    b.addEventListener("click",function(){
      var side=b.getAttribute("data-side")||"school";
      tripBtns.forEach(function(x){x.classList.toggle("active",x===b)});
      var sv=document.getElementById("schoolView"),rv=document.getElementById("returnView");
      if(sv)sv.hidden=side!=="school";
      if(rv)rv.hidden=side!=="return";
      if(side==="return")renderReturnPlan();
      else renderSchoolPlan();
    });
  });
  renderSchoolPlan();
  renderReturnPlan();
}
