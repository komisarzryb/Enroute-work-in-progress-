// test-calendar.js — testy funkcji kalendarza (uruchom: node tools/test-calendar.js)
var fs=require("fs");
var path=require("path");
var src=fs.readFileSync(path.join(__dirname,"..","calendar.js"),"utf8");
eval(src);

var pass=0,fail=0;
function ok(cond,label){
  if(cond){pass++;console.log("PASS - "+label);}
  else{fail++;console.log("FAIL - "+label);}
}

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

// nazwy miesięcy
ok(calMonthName(8)==="wrzesień","nazwa miesiąca: wrzesień");

// KONIEC
if(fail>0){console.log("WSZYSTKIE TESTY FAIL ("+fail+" błędów)");process.exit(1);}
console.log("WSZYSTKIE TESTY PASS ("+pass+" testów)");