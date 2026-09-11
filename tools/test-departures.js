// test-departures.js — testy tablicy odjazdów na przystanku (uruchom: node tools/test-departures.js)
// Zasada modułu: REALTIME (ZTM) > oficjalny GTFS (rozkład) > uczciwy brak danych (nigdy nie zmyślaj).
var fs=require("fs");var path=require("path");
var base=path.join(__dirname,"..");

eval(fs.readFileSync(path.join(base,"transport-data.js"),"utf8"));
eval(fs.readFileSync(path.join(base,"schedules.js"),"utf8"));
eval(fs.readFileSync(path.join(base,"departures.js"),"utf8"));
eval(fs.readFileSync(path.join(base,"planner.js"),"utf8"));

var fails=[];
function ok(c,m){console.log((c?"PASS":"FAIL")+" - "+m);if(!c)fails.push(m);}
function hs(hm){var p=hm.split(":");return(+p[0])*60+(+p[1]);}

console.log("=== STREFA EUROPE/WARSAW (czas bezwzgledny, niezaleznie od TZ maszyny) ===");
ok(deptWarsawMinFrac(new Date("2026-09-11T11:30:00Z"))===810,"11:30Z to 13:30 w Warszawie (UTC+2) -> 810 min");
ok(deptWarsawDateKey(new Date("2026-09-11T11:30:00Z"))==="2026-09-11","dateKey 11:30Z = 2026-09-11");
ok(deptWarsawDateKey(new Date("2026-09-11T23:00:00Z"))==="2026-09-12","23:00Z to 01:00 następnego dnia w Warszawie");
ok(deptWarsawMinFrac(new Date("2026-09-11T23:00:00Z"))===60,"01:00 następnego dnia -> 60 min");
ok(deptWarsawMinFrac(new Date("2026-12-11T12:30:00Z"))===(13*60+30),"grudzień (UTC+1): 12:30Z to 13:30 -> 810");
ok(deptPad2(3)==="03"&&deptPad2(11)==="11","deptPad2");

console.log("=== NORMALIZACJA NAZW I STOP_CODE ===");
ok(deptNormName("Os.Młodych [Legionowo]")===deptNormName("Os. Młodych"),"nazwy z [..]/spacjami normalizują się identycznie");
ok(deptNormName("Urząd Miasta (3)")==="urządmiasta","nazwa normalizuje się do 'urządmiasta'");
ok(deptCodeFromName("Winnica (11)")==="11","słupek (11) -> 11");
ok(deptCodeFromName("Starostwo Powiatowe (1)")==="01","słupek (1) -> 01");
ok(deptCodeFromName("Żerań FSO")===null,"brak słupka -> null");
ok(deptHM(810)==="13:30"&&deptHM(1440)==="00:00","deptHM formatuje minuty");

console.log("=== IDENTYFIKACJA SŁUPKA (stop_id + stop_code + kierunek) ===");
var r0=DEPT.resolveStop("731","Urząd Miasta (3)","3",0);
ok(r0.ok&&r0.keyIdx===54&&r0.stopId==="3499"&&r0.stopCode==="03","731 UM (3) dir0 -> stopId 3499, slupek 03, keyIdx 54");
var rw=DEPT.resolveStop("731","Winnica (11)","11",0);
ok(rw.ok&&rw.stopId==="7289"&&rw.stopCode==="11","731 Winnica (11) dir0 -> 7289 / 11");
var r1=DEPT.resolveStop("731","Urząd Miasta (1)","1",1);
ok(r1.ok&&r1.keyIdx===25&&r1.stopId==="3166"&&r1.stopCode==="01","731 UM (1) dir1 -> 3166 / 01 (inny słupek niż dir0)");
var rz0=DEPT.resolveStop("731","Zegrzyńska","1",0);
var rz1=DEPT.resolveStop("731","Zegrzyńska","2",1);
ok(rz0.ok&&rz0.keyIdx===51&&rz0.stopId==="6547","Zegrzyńska dir0 -> key 51 (6547)");
ok(rz1.ok&&rz1.keyIdx===28&&rz1.stopId==="6758","Zegrzyńska dir1 -> key 28 (6758), nie mylona z dir0");
var rFall=DEPT.resolveStop("731","Urząd Miasta","9",0);
ok(rFall.ok&&rFall.stopId==="3499","zły stop_code -> fallback wg kierunku nadal poprawny");
var rMiss=DEPT.resolveStop("731","Nieistniejący Przystanek",null,0);
ok(!rMiss.ok,"nieznany przystanek -> ok:false (uczciwie brak danych)");
ok(DEPT.dirKeyIdxes("731",0).indexOf(39)>=0,"terminus dir0 (Starostwo Powiatowe 01) w osiagalnych kluczach");
ok(DEPT.dirKeyIdxes("731",1).indexOf(39)>=0,"terminus wspolny (Starostwo Powiatowe) obsługuje tez dir1");
ok(DEPT.dirKeyIdxes("731",0).indexOf(43)>=0&&DEPT.dirKeyIdxes("731",1).indexOf(43)<0,"Cynkowa to wyłacznie kierunek dir0 (04: Cynkowa)");
var s4=DEPT.resolveStop("S4","Legionowo",null,0);
ok(s4.ok&&s4.stopCode==="80"&&s4.stopId==="8469","S4 Legionowo dir0 -> klucz jednolity, stop_code 80");

console.log("=== ROZKŁAD (oficjalny GTFS w schedules.js) ===");
var res=DEPT.resolveStop("731","Urząd Miasta (3)","3",0);
var rows=DEPT.rowsForStop("731",res,"2026-09-11");
ok(rows.length===43,"piątek 2026-09-11: 43 kursy 731 na UM (3) dir0");
ok(rows[0].depStr==="04:57","pierwszy kurs na UM (3) = 04:57 (godzina z feedu GTFS)");
ok(rows.every(function(r){return /^\d{2}:\d{2}$/.test(r.depStr)&&r.dest==="Żerań FSO";}),"wszystkie wiersze: poprawne godziny i kierunek docelowy Żerań FSO");
ok(rows.every(function(r,i){return i===0||r.depMin>=rows[i-1].depMin;}),"wiersze posortowane rosnąco");
ok(rows.every(function(r){return r.rt===false&&r.delay===0&&r.etaMin===null&&r.stopId==="3499";}),"wiersze rozkładowe bez zmyślanego RT/delay");
var res1=DEPT.resolveStop("731","Urząd Miasta (1)","1",1);
var rows1=DEPT.rowsForStop("731",res1,"2026-09-11");
ok(rows1.length>0&&rows1[0].depStr==="04:35","dir1 UM (1): pierwszy kurs 04:35 (inny niż dir0)");
ok(rows[0].depStr!==rows1[0].depStr,"kierunki rozdzielone osobnymi słupkami i czasami");
// krótkie kursy 731 kierowane poprawnie po OSTATNIM przystanku
var shortOK=false;
SCHEDULES.lines["731"].trips.forEach(function(t){
  if(t[1].indexOf("2026-09-11")<0)return;
  var kN=SCHEDULES.lines["731"].keys;
  if(deptNormName(kN[t[3][0][0]][1])==="os.młodych"&&deptDirOfTrip("731",t)===0)shortOK=true;
});
ok(shortOK,"krótki kurs 731 (Os. Młodych -> Żerań FSO) zakwalifikowany jako dir0");

console.log("=== TABLICA: filtrowanie przyszłych, sortowanie, limit ===");
var b=DEPT.buildBoard({lineId:"731",dir:0,si:15,name:"Urząd Miasta (3)",code:"3",displayName:"Urząd Miasta (3)"},"2026-09-11",660,null);
ok(b.ok&&b.source==="gtfs","board przy 11:00 -> zrodlo gtfs (brak RT)");
ok(b.rows.length>0&&b.rows.length<=DEPT.MAX_ROWS,"liczba wierszy w granicach limitu");
ok(b.rows.every(function(r){return (r.rt?r.etaMin:r.depMin)>=660;}),"tylko przyszłe odjazdy");
ok(b.rows[0].depStr>="11:00"&&b.rows[0].depStr<"11:40","najbliższy kurs to 11:09 (realny GTFS), nie symulowany");
var bLate=DEPT.buildBoard({lineId:"731",dir:0,si:15,name:"Urząd Miasta (3)",code:"3",displayName:"Urząd Miasta (3)"},"2026-09-11",24*60-1,null);
ok(bLate.ok&&bLate.isEmpty&&bLate.rows.length===0,"po 23:59 -> uczciwie 'brak kursów', zero zmyślonych");
var bNoDir=DEPT.buildBoard({lineId:"S4",dir:0,si:21,name:"Legionowo",code:null,displayName:"Legionowo"},"2026-09-11",660,null);
ok(bNoDir.ok&&bNoDir.source==="gtfs"&&bNoDir.status.indexOf("brak źródła na żywo")>0,"pociąg bez RT: status uczciwie o braku danych na żywo");
var bNoVeh=DEPT.buildBoard({lineId:"731",dir:0,si:15,name:"Urząd Miasta (3)",code:"3",displayName:"Urząd Miasta (3)"},"2026-09-11",660,null);
ok(bNoVeh.status==="Dane rzeczywiste chwilowo niedostępne — pokazuję rozkład","brak pozycji ZTM -> uczciwy komunikat o niedostepności RT");

console.log("=== REALTIME (pozycje ZTM -> opóźnienie/ETA) ===");
var base=DEPT._lineBase("731"),L0=base.stops[0];
var vehBefore=[{lat:L0.lat,lon:L0.lon,vn:"101"}];
var bRt=DEPT.buildBoard({lineId:"731",dir:0,si:15,name:"Urząd Miasta (3)",code:"3",displayName:"Urząd Miasta (3)"},"2026-09-11",14*60,vehBefore);
ok(bRt.source==="rt"&&bRt.matched>=1,"pojazd przed przystankiem -> tryb REALTIME (matched="+bRt.matched+")");
var rtRow=null;bRt.rows.forEach(function(r){if(r.rt)rtRow=r;});
ok(!!rtRow,"co najmniej jeden wiersz oznaczony REALTIME");
ok(rtRow.rt&&rtRow.etaMin===rtRow.depMin+rtRow.delay&&rtRow.veh==="101","ETA=rozkład+opóźnienie, dopasowany pojazd 101, delay="+rtRow.delay);
var Lz=base.stops[base.stops.length-1];
var vehAfter=[{lat:Lz.lat,lon:Lz.lon,vn:"199"}];
var bAfter=DEPT.buildBoard({lineId:"731",dir:0,si:15,name:"Urząd Miasta (3)",code:"3",displayName:"Urząd Miasta (3)"},"2026-09-11",14*60,vehAfter);
ok(bAfter.source==="gtfs"&&bAfter.matched===0,"pojazd ZA przystankiem -> nie tworzy fałszywego odjazdu (uczciwy rozkład)");
var two=[{lat:L0.lat,lon:L0.lon,vn:"101"},{lat:L0.lat,lon:L0.lon,vn:"202"}];
var bTwo=DEPT.buildBoard({lineId:"731",dir:0,si:15,name:"Urząd Miasta (3)",code:"3",displayName:"Urząd Miasta (3)"},"2026-09-11",14*60,two);
var twoVehicles=[];bTwo.rows.forEach(function(r){if(r.rt&&twoVehicles.indexOf(r.veh)<0)twoVehicles.push(r.veh);});
ok(bTwo.matched>=1&&twoVehicles.length===bTwo.matched,"pojazdy na tym samym fragmencie -> każdy dopasowany do OSOBNEGO kursu (matched="+bTwo.matched+", pojazdy="+twoVehicles.join(",")+")");
var bMismatch=DEPT.buildBoard({lineId:"S4",dir:0,si:21,name:"Legionowo",code:null,displayName:"Legionowo"},"2026-09-11",14*60,vehBefore);
ok(bMismatch.matched===0,"pojazdy NIE są dopasowywane dla pociągów bez zrodła RT");

console.log("=== ODCZYT POZYCJI ZTM (parsowanie, wiek, filtr linii) ===");
var nowMs=Date.UTC(2026,8,11,11,31,0); // 13:31 w Warszawie
var j={result:[
  {Lines:"731",Lat:"52.42",Lon:"20.93",Time:"2026-09-11 13:30:00",VehicleNumber:"101",Brigade:"1"},
  {Lines:"731",Lat:"52.42",Lon:"20.93",Time:"2026-09-11 11:00:00",VehicleNumber:"102",Brigade:"1"},
  {Lines:"999",Lat:"52.42",Lon:"20.93",Time:"2026-09-11 13:30:00",VehicleNumber:"103",Brigade:"1"},
  {Lines:"731",Lat:"abc",Lon:"20.93",Time:"2026-09-11 13:30:00",VehicleNumber:"104",Brigade:"1"}
]};
var p=DEPT.parsedZtmVehicles(j,"731",nowMs);
ok(p.length===1&&p[0].vn==="101","parsowanie ZTM: tylko świeża (60s) pozycja linii 731 z poprawnymi coord (wiek="+p[0].ageMs+")");
ok(deptWarsawWallEpoch("2026-09-11 13:30:00")===Date.UTC(2026,8,11,11,30,0),"lato: 13:30 czasu warszawskiego = 11:30 UTC (UTC+2)");
ok(deptWarsawWallEpoch("2026-12-11 13:30:00")===Date.UTC(2026,11,11,12,30,0),"zima: 13:30 czasu warszawskiego = 12:30 UTC (UTC+1)");

console.log("=== RENDER (czytelna tablica z etykietami REALTIME/ROZKŁAD) ===");
var bh=DEPT.renderBoard(bRt);
ok(bh.indexOf("REALTIME")>-1&&bh.indexOf("ROZKŁAD")>-1,"render ma plakietki REALTIME i ROZKŁAD");
ok(bh.indexOf("za ")>-1&&bh.indexOf("min")>-1,"render ma odliczanie 'za X min'");
ok(bh.indexOf("Urząd Miasta")>-1,"render ma nazwę przystanku");
var be=DEPT.renderBoard({ok:false,reason:"nie rozpoznano słupka"});
ok(be.indexOf("nie rozpoznano słupka")>-1,"render błędu pokazuje uczciwie powód");
var bi=DEPT.renderBoard(bLate);
ok(bi.indexOf("Dziś brak kursów")>-1,"pusta tablica -> 'Dziś brak kursów', bez zmyślenia");
ok(DEPT.deptCountdown(5,0)==="za 5 min"&&DEPT.deptCountdown(0,0)==="teraz"&&DEPT.deptCountdown(65,0)==="za 1 h 05 min","deptCountdown");

console.log("=== MAPOWANIE DNIA (okna rozkładowego) ===");
ok(deptRefDate("2026-09-11")==="2026-09-11","data w oknie rozkładowym bez zmian");
var fri=deptRefDate("2027-01-15");
ok(fri==="2026-09-11"||fri==="2026-09-18","data spoza okna -> najbliższy piątek w oknie ("+fri+")");
ok(new Date(fri+"T12:00:00").getDay()===5,"mapowane dni mają ten sam dzień tygodnia");

console.log("");
if(fails.length){console.log("FAIL");fails.forEach(function(x){console.log(" - "+x);});process.exit(1);}
console.log("WSZYSTKIE TESTY PASS");