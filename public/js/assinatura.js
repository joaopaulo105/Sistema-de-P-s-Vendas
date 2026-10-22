// Área de assinatura com o dedo (celular/tablet) ou mouse. Gera PNG legível na impressão/PDF.

export class Assinatura {
  constructor(canvas, { valor = null, bloqueada = false, aoMudar = () => {} } = {}) {
    this.c = canvas;
    this.valor = valor;
    this.bloqueada = bloqueada;
    this.aoMudar = aoMudar;
    this.tracos = 0;
    this.ajustar = this.ajustar.bind(this);
    this.ajustar();
    window.addEventListener('resize', this.ajustar);
    if (!bloqueada) this.ligar();
  }

  ajustar() {
    const r = this.c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    this.g = this.c.getContext('2d');
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.g.lineCap = 'round';
    this.g.lineJoin = 'round';
    this.g.strokeStyle = '#0B1A3A'; // tinta escura sobre papel branco nos dois temas
    if (this.valor) {
      const img = new Image();
      img.onload = () => this.g.drawImage(img, 0, 0, r.width, r.height);
      img.src = this.valor;
    }
  }

  ligar() {
    let desenhando = false, ultimo = null;
    const ponto = e => { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure > 0 ? e.pressure : .5 }; };
    this.c.addEventListener('pointerdown', e => {
      desenhando = true; ultimo = ponto(e);
      this.c.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.c.addEventListener('pointermove', e => {
      if (!desenhando) return;
      const p = ponto(e);
      this.g.lineWidth = 1.3 + p.p * 2.4;
      this.g.beginPath();
      this.g.moveTo(ultimo.x, ultimo.y);
      this.g.quadraticCurveTo(ultimo.x, ultimo.y, (ultimo.x + p.x) / 2, (ultimo.y + p.y) / 2);
      this.g.lineTo(p.x, p.y);
      this.g.stroke();
      ultimo = p;
      this.tracos++;
    });
    const fim = () => {
      if (!desenhando) return;
      desenhando = false;
      if (this.tracos) { this.valor = this.c.toDataURL('image/png'); this.aoMudar(this.valor); }
    };
    this.c.addEventListener('pointerup', fim);
    this.c.addEventListener('pointercancel', fim);
  }

  limpar() {
    const r = this.c.getBoundingClientRect();
    this.g.clearRect(0, 0, r.width, r.height);
    this.valor = null; this.tracos = 0;
    this.aoMudar(null);
  }

  destruir() { window.removeEventListener('resize', this.ajustar); }
}
