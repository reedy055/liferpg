const CACHE_VERSION = 'liferpg-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./db.js','./charts.js',
  './manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_VERSION).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  }else{
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
  }
});
