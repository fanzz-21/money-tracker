(function (global) {
  function fmtRp(n) {
    return "Rp " + Number(n || 0).toLocaleString("id-ID");
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function flowColors() {
    return {
      in: getCssVar("--color-secondary") || "#006c49",
      out: getCssVar("--color-tertiary") || "#ba0035",
      inBg: getCssVar("--color-secondary-container") || "#6cf8bb",
      outBg: getCssVar("--color-tertiary-container") || "#e21e49"
    };
  }

  function catColors(count) {
    const base = [
      getCssVar("--color-primary") || "#00685f",
      getCssVar("--color-secondary") || "#006c49",
      getCssVar("--color-tertiary") || "#ba0035",
      getCssVar("--color-tertiary-container") || "#e21e49",
      getCssVar("--color-primary-container") || "#008378",
      getCssVar("--color-secondary-container") || "#6cf8bb",
      getCssVar("--color-outline") || "#6d7a77",
      getCssVar("--color-on-surface-variant") || "#3d4947"
    ];
    const out = [];
    for (let i = 0; i < count; i++) out.push(base[i % base.length]);
    return out;
  }

  function clearCanvas(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
  }

  function drawFlowChart(canvas, data) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    clearCanvas(ctx, w, h);

    if (!data || !data.length) return;

    const maxVal = Math.max(...data.flatMap((d) => [d.masuk, d.keluar]), 1);
    const pad = 40;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2 - 20;
    const stepX = chartW / (data.length - 1 || 1);

    const colors = flowColors();
    const gridColor = getCssVar("--color-outline-variant") || "#bcc9c6";
    const textColor = getCssVar("--color-on-surface-variant") || "#3d4947";
    const axisColor = getCssVar("--color-outline") || "#6d7a77";

    ctx.font = "12px Inter";
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const y = pad + (chartH / yTicks) * i;
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const val = ((yTicks - i) / yTicks) * maxVal;
      ctx.fillText(fmtRp(val).replace("Rp ", ""), pad - 20, y - 6);
    }

    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, pad + chartH);
    ctx.lineTo(w - pad, pad + chartH);
    ctx.stroke();

    const lineW = 3;

    const inPath = new Path2D();
    const outPath = new Path2D();
    data.forEach((d, i) => {
      const x = pad + stepX * i;
      const yIn = pad + chartH - (d.masuk / maxVal) * chartH;
      const yOut = pad + chartH - (d.keluar / maxVal) * chartH;
      if (i === 0) {
        inPath.moveTo(x, yIn);
        outPath.moveTo(x, yOut);
      } else {
        inPath.lineTo(x, yIn);
        outPath.lineTo(x, yOut);
      }
    });

    ctx.strokeStyle = colors.in;
    ctx.lineWidth = lineW;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(inPath);

    ctx.strokeStyle = colors.out;
    ctx.stroke(outPath);

    data.forEach((d, i) => {
      const x = pad + stepX * i;
      const yIn = pad + chartH - (d.masuk / maxVal) * chartH;
      const yOut = pad + chartH - (d.keluar / maxVal) * chartH;
      ctx.fillStyle = colors.in;
      ctx.beginPath();
      ctx.arc(x, yIn, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.out;
      ctx.beginPath();
      ctx.arc(x, yOut, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = textColor;
      ctx.fillText(d.label, x, pad + chartH + 8);
    });
  }

  function drawCatChart(canvas, data) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    clearCanvas(ctx, w, h);

    if (!data || !data.length) {
      ctx.font = "14px Inter";
      ctx.fillStyle = getCssVar("--color-on-surface-variant") || "#3d4947";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Belum ada pengeluaran", w / 2, h / 2);
      return;
    }

    const total = data.reduce((a, b) => a + b.amount, 0);
    const colors = catColors(data.length);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 20;

    let startAngle = -Math.PI / 2;
    data.forEach((d, i) => {
      const sliceAngle = (d.amount / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      startAngle += sliceAngle;
    });

    ctx.font = "12px Inter";
    ctx.fillStyle = getCssVar("--color-on-surface-variant") || "#3d4947";
    ctx.textAlign = "center";
    startAngle = -Math.PI / 2;
    data.forEach((d) => {
      const sliceAngle = (d.amount / total) * Math.PI * 2;
      const mid = startAngle + sliceAngle / 2;
      const labelR = radius * 0.6;
      const lx = cx + Math.cos(mid) * labelR;
      const ly = cy + Math.sin(mid) * labelR;
      const pct = ((d.amount / total) * 100).toFixed(0);
      if (sliceAngle > 0.3) {
        ctx.fillStyle = "#fff";
        ctx.fillText(pct + "%", lx, ly + 4);
      }
      startAngle += sliceAngle;
    });
  }

  function renderCatLegend(container, data) {
    container.replaceChildren();
    if (!data || !data.length) return;
    const total = data.reduce((a, b) => a + b.amount, 0);
    const colors = catColors(data.length);
    data.forEach((d, i) => {
      const pct = ((d.amount / total) * 100).toFixed(1);
      const row = document.createElement("div");
      row.className = "flex items-center justify-center gap-2";
      const swatch = document.createElement("span");
      swatch.className = "w-3 h-3 rounded";
      swatch.style.background = colors[i];
      const name = document.createElement("span");
      name.className = "font-body-sm text-body-sm text-on-surface-variant dark:text-surface-variant";
      name.textContent = d.name;
      const pctEl = document.createElement("span");
      pctEl.className = "font-body-sm text-body-sm font-medium";
      pctEl.textContent = pct + "%";
      row.append(swatch, name, pctEl);
      container.appendChild(row);
    });
  }

  global.Chart = { drawFlowChart, drawCatChart, renderCatLegend, fmtRp };
})(window);