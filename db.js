// Tiny IndexedDB state store: one DB, one object store, single "state" key.
const DB_NAME = 'liferpg_db';
const DB_VER = 1;
const STORE = 'stateStore';

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

async function getState(){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE,'readonly');
    const store = tx.objectStore(STORE);
    const r = store.get('state');
    r.onsuccess = ()=> resolve(r.result || null);
    r.onerror = ()=> reject(r.error);
  });
}

async function setState(state){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE,'readwrite');
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
    tx.objectStore(STORE).put(state,'state');
  });
}

async function exportJSON(){
  const state = await getState();
  return JSON.stringify(state || {}, null, 2);
}

async function importJSON(text){
  let obj;
  try { obj = JSON.parse(text); } catch(e){ throw new Error('Invalid JSON'); }
  if(!obj || typeof obj !== 'object') throw new Error('Invalid data');
  // Minimal schema guard
  if(!obj.version) obj.version = 1;
  await setState(obj);
  return true;
}

window.DB = { getState, setState, exportJSON, importJSON };
