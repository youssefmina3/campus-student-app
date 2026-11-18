/* Runs before styles load, so the saved appearance is applied before first paint. */
(function(){
 const KEY='campus-theme';
 const icons={dark:'<path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z"/>',light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'};
 const valid=value=>value==='dark'?'dark':'light';
 let current='light';try{current=valid(localStorage.getItem(KEY))}catch{}
 function refreshButton(){const button=document.querySelector('#theme-toggle');if(!button)return;const next=current==='dark'?'light':'dark';button.setAttribute('aria-checked',String(current==='dark'));button.setAttribute('title','Switch to '+next+' mode');button.innerHTML='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'+icons[next]+'</svg><span class="theme-toggle-label">'+(next==='dark'?'Dark':'Light')+' mode</span>'}
 function apply(value,persist=true){current=valid(value);document.documentElement.dataset.theme=current;document.documentElement.style.colorScheme=current;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',current==='dark'?'#0c111c':'#f5f6f8');if(persist)try{localStorage.setItem(KEY,current)}catch{}refreshButton();return current}
 function toggle(){return apply(current==='dark'?'light':'dark')}
 function bindToggle(){const button=document.querySelector('#theme-toggle');if(button)button.onclick=toggle;refreshButton()}
 window.CampusTheme={get:()=>current,set:apply,toggle,bindToggle};
 window.addEventListener('storage',event=>{if(event.key===KEY)apply(event.newValue,false)});
 apply(current,false);
})();
