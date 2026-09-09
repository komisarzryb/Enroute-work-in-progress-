#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),{execSync,spawnSync}=require('child_process'),os=require('os'),readline=require('readline');

const WANT=['731','S4','S40'];
const GTFS_URL='https://gtfs.ztm.waw.pl/last';
const OUT=path.resolve(__dirname,'..','schedules.js');
const TD=path.join(os.tmpdir(),'enroute-gtfs');

let feed=process.argv.includes('--feed')?process.argv[process.argv.indexOf('--feed')+1]:null;

if(!feed){
  const z=path.join(TD,'ztm.zip');
  fs.mkdirSync(TD,{recursive:true});
  console.log('Pobieram GTFS...');
  execSync('curl -sL -o "'+z+'" "'+GTFS_URL+'" --connect-timeout 20 --max-time 300',{stdio:'inherit'});
  const ex=path.join(TD,'feed');
  fs.rmSync(ex,{recursive:true,force:true});fs.mkdirSync(ex,{recursive:true});
  execSync('powershell -Command "Expand-Archive -LiteralPath \''+z+'\' -DestinationPath \''+ex+'\' -Force"',{stdio:'inherit'});
  feed=ex;
}else if(feed.endsWith('.zip')){
  const ex=path.join(TD,'feed');
  fs.rmSync(ex,{recursive:true,force:true});fs.mkdirSync(ex,{recursive:true});
  execSync('powershell -Command "Expand-Archive -LiteralPath \''+feed+'\' -DestinationPath \''+ex+'\' -Force"',{stdio:'inherit'});
  feed=ex;
}
console.log('Feed:',feed);

function csv(file){
  const h=[],rows=[];
  let first=true;
  const rl=readline.createInterface({input:fs.createReadStream(path.join(feed,file)),crlfDelay:Infinity});
  return new Promise(res=>{
    rl.on('line',line=>{
      if(first){first=false;h.push(...splitCSV(line.replace(/^\uFEFF/,'')));return;}
      const f=splitCSV(line);const o={};h.forEach((k,i)=>o[k]=f[i]||'');rows.push(o);
    });
    rl.on('close',()=>res(rows));
  });
}
function splitCSV(line){const r=[];let c='',q=false;for(const ch of line){if(ch==='"'){q=!q;continue;}if(ch===','&&!q){r.push(c);c='';}else c+=ch;}r.push(c);return r;}

(async()=>{
const stops=await csv('stops.txt');
const stopsById={};for(const r of stops)stopsById[r.stop_id]={name:r.stop_name,code:r.stop_code,lat:+r.stop_lat,lon:+r.stop_lon};
const routes=await csv('routes.txt');const rMap={};for(const r of routes)rMap[r.route_id]=r.route_short_name;
const cal=await csv('calendar.txt');const calDates=await csv('calendar_dates.txt');
const svcDates={};
for(const r of cal){
  const days=[+r.monday,+r.tuesday,+r.wednesday,+r.thursday,+r.friday,+r.saturday,+r.sunday];
  let d=new Date(+r.start_date.slice(0,4),+r.start_date.slice(4,6)-1,+r.start_date.slice(6,8));
  const end=new Date(+r.end_date.slice(0,4),+r.end_date.slice(4,6)-1,+r.end_date.slice(6,8));
  const ds=[];
  while(d<=end){const dw=(d.getDay()+6)%7;    if(days[dw])ds.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));d.setDate(d.getDate()+1);}
  svcDates[r.service_id]=ds;
}
for(const r of calDates){const a=svcDates[r.service_id]||[];if(r.exception_type==='1'&&!a.includes(r.date))a.push(r.date);else if(r.exception_type==='2'){const i=a.indexOf(r.date);if(i>=0)a.splice(i,1);}svcDates[r.service_id]=a;}

const trips=await csv('trips.txt');
const wantRoutes=new Set();for(const r of routes)if(WANT.includes(r.route_short_name))wantRoutes.add(r.route_id);
const ourTrips=trips.filter(t=>wantRoutes.has(t.route_id));
const tripSet=new Set(ourTrips.map(t=>t.trip_id));
console.log('Trasy',WANT.join('/'),':',ourTrips.length,'tripów');

// Stream stop_times for our trips
const tripStops={};
await new Promise(res=>{
  const rl=readline.createInterface({input:fs.createReadStream(path.join(feed,'stop_times.txt')),crlfDelay:Infinity});
  let hdr=true;
  rl.on('line',line=>{
    if(hdr){hdr=false;line=line.replace(/^\uFEFF/,'');return;}
    const f=splitCSV(line);
    if(!tripSet.has(f[0]))return;
    if(!tripStops[f[0]])tripStops[f[0]]=[];
    tripStops[f[0]].push({seq:+f[4],sid:f[3],arr:f[1].slice(0,5),dep:f[2].slice(0,5)});
  });
  rl.on('close',res);
});
for(const tid of Object.keys(tripStops))tripStops[tid].sort((a,b)=>a.seq-b.seq);

// Build keys per line (unique stop_ids across all trips)
const lineKeys={};const lineKeyIdx={};
for(const ln of WANT){
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

// Build trip entries per line (grouped by physical trip+dir, dates merged)
const lineTrips={};
for(const ln of WANT){
  const km=lineKeyIdx[ln];
  const byPhys={}; // physKey → {tid,dir,dates:Set,stops}
  for(const t of ourTrips){
    if(rMap[t.route_id]!==ln)continue;
    const stops=tripStops[t.trip_id];if(!stops||stops.length<2)continue;
    const dates=svcDates[t.service_id]||[];
    const pk=t.trip_id+'|'+t.direction_id;
    if(!byPhys[pk])byPhys[pk]={tid:t.trip_id,dir:+t.direction_id,dates:new Set(),stops};
    for(const d of dates)byPhys[pk].dates.add(d);
  }
  lineTrips[ln]=[];
  for(const p of Object.values(byPhys)){
    const sd=[...p.dates].sort();
    const stArr=[];
    for(const s of p.stops){
      const ki=km.get(s.sid);if(ki===undefined)continue;
      if(s.arr===s.dep)stArr.push([ki,s.arr]);else stArr.push([ki,s.arr,s.dep]);
    }
    lineTrips[ln].push([p.tid,sd,p.dir,stArr]);
  }
}

// Feed info
let fi={};try{fi=(await csv('feed_info.txt'))[0];}catch(e){}
const allDates=new Set();
for(const ln of WANT)for(const t of lineTrips[ln])for(const d of t[1])allDates.add(d);
const sd=[...allDates].sort();

const out=`// schedules.js — auto-generated from ZTM GTFS by tools/import-gtfs.js
// DO NOT EDIT BY HAND — regenerate: node tools/import-gtfs.js
var SCHEDULES={meta:{agency:${JSON.stringify(fi.feed_publisher_name||'')},url:${JSON.stringify(fi.feed_publisher_url||'')},version:${JSON.stringify(fi.feed_version||'')},start:${JSON.stringify(sd[0]||'')},end:${JSON.stringify(sd[sd.length-1]||'')}},lines:{${WANT.map(ln=>`"${ln}":{keys:${JSON.stringify(lineKeys[ln])},trips:${JSON.stringify(lineTrips[ln])}}`).join(',\n')}}};\n`;
fs.writeFileSync(OUT,out,'utf8');
const sz=fs.statSync(OUT).size;
console.log('Zapisano',OUT,'('+Math.round(sz/1024)+' KB)');
console.log('Zakres dat:',sd[0],'do',sd[sd.length-1]);
WANT.forEach(ln=>console.log(ln,':',lineTrips[ln].length,'fizycznych tripów,',lineKeys[ln].length,'przystanków'));
})();
