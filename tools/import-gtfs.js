#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),{execSync}=require('child_process'),os=require('os'),readline=require('readline');

const WANT=['731','S4','S40'];           // primary feed (ZTM Warszawa)
const R90WANT=['R90'];                   // secondary feed (PKP PLK / Koleje Mazowieckie)
const GTFS_URL='https://gtfs.ztm.waw.pl/last';
const R90_URL='https://mkuran.pl/gtfs/polish_trains.zip';
const OUT=path.resolve(__dirname,'..','schedules.js');
const TD=path.join(os.tmpdir(),'enroute-gtfs');

let feed=process.argv.includes('--feed')?process.argv[process.argv.indexOf('--feed')+1]:null;
let r90Feed=process.argv.includes('--secondary-feed')?process.argv[process.argv.indexOf('--secondary-feed')+1]:null;

function prepFeed(arg,url,target){
  if(arg&&arg.endsWith('.zip')){
    fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
    execSync('powershell -Command "Expand-Archive -LiteralPath \''+arg+'\' -DestinationPath \''+target+'\' -Force"',{stdio:'inherit'});
    return target;
  }
  if(arg)return arg;
  const z=path.join(TD,target.split(/[\\\/]/).pop()+'.zip');
  fs.mkdirSync(TD,{recursive:true});
  console.log('Pobieram GTFS z',url,'...');
  execSync('powershell -Command "Invoke-WebRequest -Uri \''+url+'\' -OutFile \''+z+'\' -TimeoutSec 300 -UseBasicParsing"',{stdio:'inherit'});
  const ex=path.join(TD,target.split(/[\\\/]/).pop());
  fs.rmSync(ex,{recursive:true,force:true});fs.mkdirSync(ex,{recursive:true});
  execSync('powershell -Command "Expand-Archive -LiteralPath \''+z+'\' -DestinationPath \''+ex+'\' -Force"',{stdio:'inherit'});
  return ex;
}

function splitCSV(line){const r=[];let c='',q=false;for(const ch of line){if(ch==='"'){q=!q;continue;}if(ch===','&&!q){r.push(c);c='';}else c+=ch;}r.push(c);return r;}

function csv(file){
  const h=[],rows=[];
  let first=true;
  const rl=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  return new Promise((res,rej)=>{
    rl.on('line',line=>{
      if(first){first=false;h.push(...splitCSV(line.replace(/^\uFEFF/,'')));return;}
      const f=splitCSV(line);const o={};h.forEach((k,i)=>o[k]=f[i]||'');rows.push(o);
    });
    rl.on('error',rej);
    rl.on('close',()=>res(rows));
  });
}
const csvOr=(f,d)=>csv(f).catch(()=>d||[]);
const dashDate=d=>{const m=/^(\d{4})(\d{2})(\d{2})$/.exec(d);return m?m[1]+'-'+m[2]+'-'+m[3]:d;};

// Import selected route products from one feed.
// Returns {lineKeys,lineTrips,dateMin,dateMax}
async function extract(feedDir,wantProducts){
  const stops=await csv(path.join(feedDir,'stops.txt'));
  const stopsById={};for(const r of stops)stopsById[r.stop_id]={name:r.stop_name,code:r.stop_code,lat:+r.stop_lat,lon:+r.stop_lon};
  const routes=await csv(path.join(feedDir,'routes.txt'));
  const rMap={};for(const r of routes)rMap[r.route_id]=r.route_short_name;
  const cal=await csvOr(path.join(feedDir,'calendar.txt'));
  const calDates=await csvOr(path.join(feedDir,'calendar_dates.txt'));
  const svcDates={};
  for(const r of cal){
    if(!r.service_id)continue;
    const days=[+r.monday,+r.tuesday,+r.wednesday,+r.thursday,+r.friday,+r.saturday,+r.sunday];
    const d=new Date(+r.start_date.slice(0,4),+r.start_date.slice(4,6)-1,+r.start_date.slice(6,8));
    const end=new Date(+r.end_date.slice(0,4),+r.end_date.slice(4,6)-1,+r.end_date.slice(6,8));
    const ds=[];
    while(d<=end){const dw=(d.getDay()+6)%7;if(days[dw])ds.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));d.setDate(d.getDate()+1);}
    svcDates[r.service_id]=ds;
  }
  for(const r of calDates){
    const d=dashDate(r.date);
    const a=svcDates[r.service_id]||[];
    if(r.exception_type==='1'){if(!a.includes(d))a.push(d);}
    else if(r.exception_type==='2'){const i=a.indexOf(d);if(i>=0)a.splice(i,1);}
    svcDates[r.service_id]=a;
  }
  const trips=await csv(path.join(feedDir,'trips.txt'));
  const productRoutes=new Set();
  for(const r of routes)if(wantProducts.includes(r.route_short_name))productRoutes.add(r.route_id);
  const ourTrips=trips.filter(t=>productRoutes.has(t.route_id));
  const tripSet=new Set(ourTrips.map(t=>t.trip_id));
  console.log(wantProducts.join('/'),'(z',feedDir+'):',ourTrips.length,'tripów');

  const tripStops={};
  await new Promise(res=>{
    const rl=readline.createInterface({input:fs.createReadStream(path.join(feedDir,'stop_times.txt')),crlfDelay:Infinity});
    let hdr=null;
    rl.on('line',line=>{
      line=line.replace(/^\uFEFF/,'');
      if(hdr===null){hdr=splitCSV(line).map(h=>h.trim());return;}
      const f={};splitCSV(line).forEach((v,i)=>f[hdr[i]]=v);
      if(!tripSet.has(f.trip_id))return;
      if(!tripStops[f.trip_id])tripStops[f.trip_id]=[];
      tripStops[f.trip_id].push({seq:+f.stop_sequence,sid:f.stop_id,arr:(f.arrival_time||'').slice(0,5),dep:(f.departure_time||'').slice(0,5)});
    });
    rl.on('close',res);
  });
  for(const tid of Object.keys(tripStops))tripStops[tid].sort((a,b)=>a.seq-b.seq);

  const lineKeys={};const lineKeyIdx={};
  for(const ln of wantProducts){
    const seen=new Set(),keys=[],km=new Map();
    for(const t of ourTrips){
      if(rMap[t.route_id]!==ln)continue;
      for(const s of(tripStops[t.trip_id]||[])){
        if(seen.has(s.sid))continue;seen.add(s.sid);
        const info=stopsById[s.sid];
        km.set(s.sid,keys.length);
        keys.push([s.sid,info?info.name:s.sid,info?info.code:'']);
      }
    }
    lineKeys[ln]=keys;lineKeyIdx[ln]=km;
  }

  const lineTrips={};
  for(const ln of wantProducts){
    const km=lineKeyIdx[ln];
    const byPhys={};
    for(const t of ourTrips){
      if(rMap[t.route_id]!==ln)continue;
      const stops=tripStops[t.trip_id];if(!stops||stops.length<2)continue;
      const pk=t.trip_id+'|'+t.direction_id;
      if(!byPhys[pk])byPhys[pk]={tid:t.trip_id,dir:+t.direction_id,dates:new Set()};
      const ds=svcDates[t.service_id]||[];
      for(const d of ds)byPhys[pk].dates.add(d);
    }
    lineTrips[ln]=[];
    for(const p of Object.values(byPhys)){
      const sd=[...p.dates].sort();
      const stArr=[];
      for(const s of tripStops[p.tid]){
        const ki=km.get(s.sid);if(ki===undefined)continue;
        if(s.arr===s.dep)stArr.push([ki,s.arr]);else stArr.push([ki,s.arr,s.dep]);
      }
      lineTrips[ln].push([p.tid,sd,p.dir,stArr]);
    }
  }

  // feed-wide date span (union of all service dates used by wanted products)
  const spans=[];
  for(const ln of wantProducts)for(const t of lineTrips[ln])spans.push(...t[1]);
  spans.sort();
  return {lineKeys,lineTrips,dateMin:spans[0]||'',dateMax:spans[spans.length-1]||''};
}

(async()=>{
  const primary=prepFeed(feed,GTFS_URL,path.join(TD,'feed'));
  const secondary=prepFeed(r90Feed,R90_URL,path.join(TD,'ptfeed'));

  const a=await extract(primary,WANT);
  const b=await extract(secondary,R90WANT);

  // Merge
  const lineKeys=Object.assign({},a.lineKeys,b.lineKeys);
  const lineTrips=Object.assign({},a.lineTrips,b.lineTrips);

  let fi={};
  try{fi=(await csv(path.join(primary,'feed_info.txt')))[0];}catch(e){}

  // meta window = intersection of feed ranges so a date is valid only when both sources have data
  const starts=[a.dateMin,b.dateMin].filter(Boolean);
  const ends=[a.dateMax,b.dateMax].filter(Boolean);
  const sd=starts.sort()[starts.length-1];
  const sed=ends.sort()[0];

  const out=`// schedules.js — auto-generated by tools/import-gtfs.js
// sources: ZTM Warszawa (${WANT.join('/')}) + PKP PLK/Koleje Mazowieckie (${R90WANT.join('/')})
// DO NOT EDIT BY HAND — regenerate: node tools/import-gtfs.js
var SCHEDULES={meta:{agency:${JSON.stringify(fi.feed_publisher_name||'ZTM Warszawa')},url:${JSON.stringify(fi.feed_publisher_url||GTFS_URL)},version:${JSON.stringify(fi.feed_version||'')},start:${JSON.stringify(sd)},end:${JSON.stringify(sed)}},lines:{${Object.keys(lineKeys).map(ln=>`"${ln}":{keys:${JSON.stringify(lineKeys[ln])},trips:${JSON.stringify(lineTrips[ln])}}`).join(',\n')}}};\n`;
  fs.writeFileSync(OUT,out,'utf8');
  const sz=fs.statSync(OUT).size;
  console.log('Zapisano',OUT,'('+Math.round(sz/1024)+' KB)');
  console.log('Zakres dat:',sd,'do',sed);
  Object.keys(lineTrips).forEach(ln=>console.log(ln,':',lineTrips[ln].length,'fizycznych tripów,',lineKeys[ln].length,'przystanków'));
})();