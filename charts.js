// Minimal canvas charts: heatmap (last 90 days), bar chart (last 30 days)
function renderHeatmap(canvas, progressByDay){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const cols = 13, rows = 7, cell = Math.floor(Math.min(W/(cols+1), H/(rows+1)));
  const pad = 6, startX = 10, startY = 10;
  // Build last 90 dates
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  for(let i=89;i>=0;i--){
    const d = new Date(today); d.setDate(today.getDate()-i);
    days.push(d.toISOString().slice(0,10));
  }
  // Map into 13 columns x 7 rows (approx)
  let idx = 0;
  for(let c=0;c<cols;c++){
    for(let r=0;r<rows;r++){
      if(idx>=days.length) break;
      const day = days[idx++];
      const p = (progressByDay[day]?.points)||0;
      // intensity 0..1
      const t = Math.min(1, p/100);
      const x = startX + c*(cell+pad);
      const y = startY + r*(cell+pad);
      ctx.fillStyle = `rgba(91,140,255,${0.15 + 0.65*t})`;
      ctx.strokeStyle = 'rgba(30,36,56,1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x,y,cell,cell,4);
      ctx.fill(); ctx.stroke();
    }
  }
}

function renderBar30(canvas, last30){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const pad = 20;
  const innerW = W - pad*2, innerH = H - pad*2;
  const max = Math.max(10, ...last30.map(x=>x.points||0));
  const barW = innerW/last30.length;
  // grid
  ctx.strokeStyle = 'rgba(30,36,56,1)';
  ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){
    const y = pad + (innerH*i/4);
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke();
  }
  // bars
  for(let i=0;i<last30.length;i++){
    const val = last30[i].points||0;
    const h = (val/max)*innerH;
    const x = pad + i*barW + 2;
    const y = H - pad - h;
    ctx.fillStyle = 'rgba(83,255,136,0.85)';
    ctx.beginPath(); ctx.roundRect(x,y,Math.max(2,barW-4),h,3); ctx.fill();
  }
}

window.Charts = { renderHeatmap, renderBar30 };
