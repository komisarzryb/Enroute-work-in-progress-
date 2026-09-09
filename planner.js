function timeToMin(s){
  var p=String(s).split(":");
  return (+p[0])*60+(+p[1]);
}
function minToTime(m){
  m=Math.round(m);
  m=((m%1440)+1440)%1440;
  return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
}

function mergeGraphicLine(base,dir){
  return{
    id:base.id,
    stops:dir?base.stopsRev:base.stops,
    travelTimes:dir?base.travelTimesRev:base.travelTimes,
    departures:dir?base.departuresRev:base.departures
  };
}
function findStopIdx(stops,name,prefix){
  for(var i=0;i<stops.length;i++){
    if(prefix?stops[i].name.indexOf(name)===0:stops[i].name===name)return i;
  }
  return -1;
}
function rideSummary(lineIds,dir,fromName,toName){
  var out=[];
  (Array.isArray(lineIds)?lineIds:[lineIds]).forEach(function(id){
    var base=null;
    for(var i=0;i<LINES.length;i++){if(LINES[i].id===id){base=LINES[i];break;}}
    if(!base)return;
    var g=mergeGraphicLine(base,dir);
    var fi=findStopIdx(g.stops,fromName,true);
    var ti=findStopIdx(g.stops,toName,false);
    if(fi<0||ti<0||ti<=fi)return;
    var tr=0;
    for(var k=fi;k<ti;k++)tr+=g.travelTimes[k];
    out.push({line:id,travelMin:tr,departures:g.departures});
  });
  return out;
}

function planBackward(routeId,targetMin){
  var route=null;
  for(var i=0;i<ROUTES.length;i++){if(ROUTES[i].id===routeId){route=ROUTES[i];break;}}
  if(!route)return null;
  var legs=[],limit=targetMin,ok=true,i;
  for(i=route.legs.length-1;i>=0;i--){
    var leg=route.legs[i];
    if(leg.type==="walk"){
      var w1=limit-leg.min;
      if(w1<0){ok=false;break;}
      legs.unshift({type:"walk",label:leg.label,min:leg.min,t1:w1,t2:limit});
      limit=w1;
    }else{
      var cands=rideSummary(leg.line,leg.dir,leg.from,leg.to);
      if(!cands.length){ok=false;break;}
      var limitDep=limit-leg.buffer,lastDep=-1,lastArr=-1,lastLn=null;
      for(var c=0;c<cands.length;c++){
        for(var d=0;d<cands[c].departures.length;d++){
          var dm=timeToMin(cands[c].departures[d]);
          if(dm+cands[c].travelMin<=limitDep&&dm>lastDep){
            lastDep=dm;lastArr=dm+cands[c].travelMin;lastLn=cands[c].line;
          }
        }
      }
      if(lastDep<0){ok=false;break;}
      legs.unshift({type:"ride",line:lastLn,t1:lastDep,t2:lastArr,fromName:leg.from,toName:leg.to});
      limit=lastDep-(leg.margin||0);
    }
  }
  if(!ok)return{fail:true,target:targetMin,route:route.name};
  return{route:route.name,legs:legs,leaveHome:legs[0].t1,arriveTarget:legs[legs.length-1].t2,target:targetMin};
}

function planForward(routeId,startMin){
  var route=null;
  for(var i=0;i<ROUTES.length;i++){if(ROUTES[i].id===routeId){route=ROUTES[i];break;}}
  if(!route)return null;
  var defs=route.legs.slice().reverse(),out=[],current=startMin,ok=true,i;
  for(i=0;i<defs.length;i++){
    var def=defs[i];
    if(def.type==="walk"){
      out.push({type:"walk",label:def.labelBack||def.label,min:def.min,t1:current,t2:current+def.min});
      current=current+def.min;
    }else{
      var cands=rideSummary(def.line,def.dir===1?0:1,def.to,def.from);
      if(!cands.length){ok=false;break;}
      var firstDep=null,firstArr=null,firstLn=null;
      for(var c=0;c<cands.length;c++){
        for(var d=0;d<cands[c].departures.length;d++){
          var dm=timeToMin(cands[c].departures[d]);
          if(dm>=current+(def.margin||0)&&(firstDep===null||dm<firstDep)){
            firstDep=dm;firstArr=dm+cands[c].travelMin;firstLn=cands[c].line;
          }
        }
      }
      if(firstDep===null){ok=false;break;}
      out.push({type:"ride",line:firstLn,t1:firstDep,t2:firstArr,fromName:def.to,toName:def.from});
      current=firstArr+(def.buffer||0);
    }
  }
  if(!ok)return{fail:true,start:startMin,route:route.name};
  return{route:route.name,legs:out,startMin:startMin,arriveTarget:out[out.length-1].t2};
}

function planSummaryHTML(plan){
  if(!plan)return "";
  var h="",prevT2=null;
  plan.legs.forEach(function(leg){
    if(prevT2!==null&&leg.t1>prevT2){
      h+="<br>czekanie <b>"+(leg.t1-prevT2)+" min</b>";
    }
    var id=leg.type==="ride"?leg.line:"pieszo";
    var txt=leg.type==="ride"?leg.fromName+" → "+leg.toName:leg.label;
    h+="<br>"+id+" <b>"+minToTime(leg.t1)+"–"+minToTime(leg.t2)+"</b> "+txt;
    prevT2=leg.t2;
  });
  return h;
}

function renderSchoolPlan(){
  var inp=document.getElementById("schoolTime");
  var leave=document.getElementById("leave");
  var m=document.getElementById("morning");
  if(!inp||!leave||!m)return;
  var goal=timeToMin(inp.value||"08:00");
  var pl=planBackward("school",goal);
  if(!pl||pl.fail){
    leave.textContent="Brak połączenia";
    m.innerHTML="Nie da się zdążyć na <b>"+minToTime(goal)+"</b> z aktualnie przybliżonych rozkładów. Spróbuj późniejszej godziny.";
    return;
  }
  leave.textContent="Wyjdź o "+minToTime(pl.leaveHome);
  m.innerHTML=planSummaryHTML(pl)
    +"<br>Przyjazd do szkoły <b>"+minToTime(pl.arriveTarget)+"</b> (zapas "
    +Math.max(0,goal-pl.arriveTarget)+" min)";
}

function renderReturnPlan(){
  var inp=document.getElementById("endTime");
  var out=document.getElementById("returnResult");
  if(!inp||!out)return;
  var start=timeToMin(inp.value||"15:15");
  var pl=planForward("school",start);
  if(!pl||pl.fail){
    out.innerHTML="<span class=muted>Brak połączenia powrotnego z wyjścia o "
      +minToTime(start)+" z aktualnie przybliżonych rozkładów.</span>";
    return;
  }
  out.innerHTML="Wyjście ze szkoły <b>"+minToTime(pl.startMin)+"</b>"
    +planSummaryHTML(pl)
    +"<br><b>W domu o "+minToTime(pl.arriveTarget)+"</b>";
}

if(typeof document!=="undefined"){
  document.getElementById("plan").addEventListener("click",renderSchoolPlan);
  document.getElementById("schoolTime").addEventListener("change",renderSchoolPlan);
  document.getElementById("return").addEventListener("click",renderReturnPlan);
  document.getElementById("endTime").addEventListener("change",renderReturnPlan);
  renderSchoolPlan();
  renderReturnPlan();
}