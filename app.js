var screens=document.querySelectorAll(".screen");
var navBtns=document.querySelectorAll(".nav-btn");
var subScreens=document.querySelectorAll(".sub-screen");

function showScreen(id){
  screens.forEach(function(s){s.classList.remove("active")});
  var el=document.getElementById(id);
  if(el){el.classList.add("active");el.scrollTop=0;}
  navBtns.forEach(function(b){b.classList.toggle("active",b.dataset.screen===id)});
  var isSub=false;
  subScreens.forEach(function(s){if(s.id===id)isSub=true});
  document.querySelector(".bottom-nav").style.display=isSub?"none":"flex";
  if(id==="map"){
    if(typeof initMap==="function"&&!mapInitialized)initMap();
    if(typeof refreshMap==="function")setTimeout(refreshMap,100);
  }
  if(id==="calendar"&&typeof renderCalendar==="function")renderCalendar();
}

navBtns.forEach(function(b){
  b.addEventListener("click",function(){showScreen(b.dataset.screen)});
});

document.querySelectorAll(".menu-item[data-sub]").forEach(function(item){
  item.addEventListener("click",function(){showScreen(item.dataset.sub)});
});

document.querySelectorAll(".back-btn[data-back]").forEach(function(btn){
  btn.addEventListener("click",function(){showScreen(btn.dataset.back)});
});

function updateGreeting(){
  var el=document.getElementById("greeting");
  if(!el)return;
  var h=new Date().getHours();
  if(h>=5&&h<12)el.textContent="Dzień dobry";
  else if(h>=12&&h<18)el.textContent="Dobry dzień";
  else el.textContent="Dobry wieczór";
}
updateGreeting();

document.querySelectorAll(".weekday-btn").forEach(function(btn){
  btn.addEventListener("click",function(){
    document.querySelectorAll(".weekday-btn").forEach(function(b){b.classList.remove("active")});
    btn.classList.add("active");
  });
});
