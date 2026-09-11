// test-calendar.js — testy kalendarza + wydarzeń (uruchom: node tools/test-calendar.js)
var fs=require("fs");
var path=require("path");
var dir=path.join(__dirname,"..");

var pass=0,fail=0;
function ok(cond,label){
  if(cond){pass++;console.log("PASS - "+label);}
  else{fail++;console.log("FAIL - "+label);}
}

eval(fs.readFileSync(path.join(dir,"calendar.js"),"utf8"));

// KALENDARZ (czysta data lokalna, bez UTC)
ok(typeof calNow==="function","calNow zwraca obiekt daty lokalnej (y,m,d)");
var t=calNow();
ok(t.y===new Date().getFullYear()&&t.m===new Date().getMonth()&&t.d===new Date().getDate(),
   "calNow = dzisiejsza lokalna data urządzenia (nic twardego)");

// lata przestępne i długość miesięcy
ok(calDaysInMonth(2024,1)===29,"luty 2024 (rok przestępny) ma 29 dni");
ok(calDaysInMonth(2023,1)===28,"luty 2023 ma 28 dni");
ok(calDaysInMonth(2000,1)===29,"luty 2000 (przestępny wiekowy) ma 29 dni");
ok(calDaysInMonth(2100,1)===28,"luty 2100 (nieprzestępny wiekowy) ma 28 dni");
ok(calDaysInMonth(2026,8)===30,"wrzesień ma 30 dni");
ok(calDaysInMonth(2026,11)===31,"grudzień ma 31 dni");

// siatka: 42 komórki, początek w poniedziałek
var g=calGrid(2026,8,{y:2026,m:8,d:10});
ok(g.length===42,"siatka ma 42 komórki (6 tygodni)");
ok(g[0].y===2026&&g[0].m===7&&g[0].inMonth===false,"pierwsza komórka to koniec poprzedniego miesiąca (31 sierpnia 2026 jest poniedziałkiem)");
ok(g[0].d===31,"pierwsza komórka = 31.08 (poniedziałek-początek)");

// dzisiaj zaznaczone dokładnie raz
var todayCells=g.filter(function(c){return c.isToday;});
ok(todayCells.length===1&&todayCells[0].d===10&&todayCells[0].m===8,
   "w podanym miesiącu dokładnie jeden dzień oznaczony jako DZISIAJ (10.09)");

// przejście przez granicę roku między miesiącami
var gg=calGrid(2026,0,{y:2026,m:0,d:1});
var other=gg.filter(function(c){return !c.inMonth;});
var prev=other.filter(function(c){return c.y===2025;});
var next=other.filter(function(c){return c.y===2026&&c.m===1;});
ok(prev.length>0,"komórki przed 1 stycznia 2026 należą do grudnia 2025");
ok(next.length>0,"komórki po styczniu 2026 przechodzą w luty 2026");

// nazwy miesięcy i etykieta dnia
ok(calMonthName(8)==="wrzesień","nazwa miesiąca: wrzesień");
ok(calDateLabel(2026,8,10)==="Czwartek, 10 września","etykieta dnia: Czwartek, 10 września");
ok(calDateLabel(2026,7,31)==="Poniedziałek, 31 sierpnia","etykieta dnia: Poniedziałek, 31 sierpnia");

// WYDARZENIA (magazyn localStorage enroute_calendar)
var mstr="";
var mem={get:function(){return mstr;},set:function(v){mstr=v;}};
eval(fs.readFileSync(path.join(dir,"events.js"),"utf8"));
evtSetStore(mem.get,mem.set);
evtReset();

// 1. utworzenie wydarzenia
var created=evtAdd("2026-09-10",{name:"Matematyka",start:"08:00",end:"08:45",desc:"Sala 204"});
ok(created.ok&&created.event&&created.event.id,"utworzono wydarzenie (zwraca id)");

// 2. zapis wydarzenia (traja w storage)
ok(mstr.indexOf("Matematyka")>-1,"wydarzenie zapisane w magazynie (JSON)");

// 3. odczyt wydarzeń
ok(evtGet("2026-09-10").length===1,"odczyt wydarzeń dnia");

// 4. przypisanie do właściwej daty
ok(evtGet("2026-09-10")[0].name==="Matematyka","wydarzenie przypisane do 2026-09-10");

// 5. brak wydarzenia w innym dniu
ok(evtGet("2026-09-11").length===0,"inny dzień nie ma wydarzeń");
ok(evtHas("2026-09-10")&&!evtHas("2026-09-11"),"evtHas: tylko właściwa data");

// 6. sortowanie chronologiczne
evtAdd("2026-09-10",{name:"Historia",start:"12:00"});
evtAdd("2026-09-10",{name:"Informatyka",start:"10:30"});
var sorted=evtGet("2026-09-10").map(function(e){return e.name;});
ok(JSON.stringify(sorted)===JSON.stringify(["Matematyka","Informatyka","Historia"]),
   "sortowanie: 08:00, 10:30, 12:00 ("+sorted.join(", ")+")");

// 7. edycja wydarzenia
var first=evtGet("2026-09-10")[0];
var up=evtUpdate(first.id,{name:"Matematyka rozszerzona",start:"08:00",end:"09:00",desc:"Sala 201"});
ok(up.ok&&evtGet("2026-09-10")[0].name==="Matematyka rozszerzona"&&evtGet("2026-09-10")[0].end==="09:00",
   "edycja: nazwa i koniec zaktualizowane");

// 8. usuwanie wydarzenia
var target=evtGet("2026-09-10").find(function(e){return e.name==="Historia";});
ok(evtRemove("2026-09-10",target.id)===true,"usunięto wydarzenie (zwraca true)");
ok(evtGet("2026-09-10").every(function(e){return e.name!=="Historia";}),"wydarzenie zniknęło z listy");

// 9. walidacja pustej nazwy
ok(!evtValidate({name:"",start:"08:00"}).ok,"pusta nazwa => błąd");
ok(evtValidate({name:" ",start:"08:00"}).errors.name,"nazwa z samych spacji => błąd");

// 10. walidacja godzin
ok(!evtValidate({name:"A",start:""}).ok,"brak startu => błąd");
ok(!evtValidate({name:"A",start:"25:61"}).ok,"niepoprawna godzina startu => błąd");
ok(!evtValidate({name:"A",start:"08:00",end:"07:59"}).ok,"koniec przed startem => błąd");
ok(evtValidate({name:"A",start:"08:00",end:"08:00"}).ok,"koniec równy startowi => OK");
ok(evtValidate({name:"A",start:"08:00",end:"09:00"}).ok,"start < koniec => OK");

// 10b. długie nazwa/opis
ok(!evtValidate({name:new Array(EVT_NAME_MAX+5).join("x"),start:"08:00"}).ok,"za długa nazwa => błąd");
ok(!evtValidate({name:"A",start:"08:00",desc:new Array(EVT_DESC_MAX+5).join("x")}).ok,"za długi opis => błąd");
ok(!evtAdd("2026-09-10",{name:"",start:"08:00"}).ok,"evtAdd nie zapisuje wydarzenia z pustą nazwą");

// 11. lokalny klucz daty (bez UTC / bez sztywnych dat)
var n=calNow();
var expectKey=n.y+"-"+String(n.m+1).padStart(2,"0")+"-"+String(n.d).padStart(2,"0");
ok(evtDateKey(n.y,n.m,n.d)===expectKey,"evtDateKey buduje lokalny klucz dnia (YYYY-MM-DD)");
ok(evtDateKey(2026,8,10)==="2026-09-10","evtDateKey: wrzesień, zero-padding");

// 12. przerwanie sesji: dane przeżywają „przeładowanie" (persistencja storage)
var pers=evtGet("2026-09-10").length;
var keepStore=mem.get();   // magazyn NIE jest czyszczony przy przeładowaniu strony
EVT_DATA=null;             // nowe otwarcie: bez buforowanego stanu
evtLoad();                 // odczyt bezpośrednio z przechowywanego magazynu
ok(evtGet("2026-09-10").length===pers&&keepStore.indexOf("Matematyka")>-1,
   "odczyt po ponownym załadowaniu magazynu zachowuje dane ("+evtGet("2026-09-10").length+" wydarzeń)");

// 13. wydarzenia w przyszłości (podstawa pod planer) — dzisiejszy klucz lokalny
var now=calNow();
var todayKey=evtDateKey(now.y,now.m,now.d);
evtAdd(todayKey,{name:"Dzisiejsze wydarzenie",start:"18:00"});
var upc=evtUpcoming(10);
ok(upc.length>0,"evtUpcoming zwraca nadchodzące wydarzenia ("+upc.length+")");
ok(upc.some(function(x){return x.ev.name==="Dzisiejsze wydarzenie";}),
   "evtUpcoming zawiera wydarzenie z dzisiejszej lokalnej daty ("+todayKey+")");
ok(evtUpcoming(1).length===1,"evtUpcoming(1) zwraca dokładnie 1 wydarzenie");
ok(evtUpcoming(0).length===0,"evtUpcoming(0) zwraca 0 wydarzeń (fix: 0 nie oznacza 'wszystkie')");
ok(evtUpcoming(-5).length>0,"evtUpcoming(ujemne) traktowane jak bez limitu (bez crasha)");

// KONIEC
if(fail>0){console.log("WSZYSTKIE TESTY FAIL ("+fail+" błędów)");process.exit(1);}
console.log("WSZYSTKIE TESTY PASS ("+pass+" testów)");