const screens=document.querySelectorAll(".screen");document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{screens.forEach(s=>s.classList.remove("active"));document.getElementById(b.dataset.screen).classList.add("active")});function add(t,m){let[a,b]=t.split(":").map(Number),x=a*60+b+m;return String(Math.floor(x/60)%24).padStart(2,"0")+":"+String(x%60).padStart(2,"0")}document.getElementById("plan").onclick=()=>{let t=document.getElementById("schoolTime").value||"09:40";document.getElementById("leave").textContent="Wyjdź o "+add(t,-88);document.getElementById("morning").textContent="Przyjazd "+add(t,-16)+" · 16 min zapasu"};document.getElementById("return").onclick=()=>{let t=document.getElementById("endTime").value||"15:25";document.getElementById("returnResult").textContent="Proponowany wyjazd: "+add(t,8)+" · przyjazd około "+add(t,48)};document.getElementById("theme").onclick=()=>document.body.classList.toggle("light");document.getElementById("snake").onclick=()=>alert("Snake — dodamy pełną minigrę w kolejnej wersji.");
const ZTM_API_KEY = "fde6064a-316e-4407-bf99-d90693976428";
const LINE_731_URL = "https://api.um.warszawa.pl/api/action/busestrams_get/?resource_id=f2e5503e-927d-4ad3-9500-4ab9e55deb59&apikey=" + ZTM_API_KEY + "&type=1&line=731";

async function pobierzPozycjeAutobusu731() {
  const kartaMapy = document.querySelector("#map .card");
  try {
    const odpowiedz = await fetch(LINE_731_URL);
    const dane = await odpowiedz.json();
    if (dane.result && typeof dane.result === "string") {
      kartaMapy.innerHTML = "<b>731 → Legionowo</b><p>Błąd z API ZTM:</p><strong>" + dane.result + "</strong>";
      return;
    }
    if (dane.result && dane.result.length > 0) {
      const pojazd = dane.result[0];
      kartaMapy.innerHTML = "<b>731 → Legionowo</b><p>Namiary z API ZTM</p><strong>Lat: " + pojazd.Lat + " · Lon: " + pojazd.Lon + "</strong><p class='muted'>Ostatni sygnał: " + pojazd.Time + "</p>";
    } else {
      kartaMapy.innerHTML = "<b>731 → Legionowo</b><p>Brak aktywnych pojazdów tej linii w tej chwili.</p>";
    }
  } catch (blad) {
    kartaMapy.innerHTML = "<b>731 → Legionowo</b><p style='color:#ff8080'>BŁĄD: " + blad.message + "</p>";
  }
}

pobierzPozycjeAutobusu731();
