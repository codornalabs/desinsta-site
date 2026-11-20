/* Desinsta · site: a Bateria animada (motor window.BatCore) em qualquer lugar da página.
   Cada Bateria tem o seu motor e só anda enquanto aparece na tela. */
(function () {
  'use strict';
  const C = window.BatCore, NS = 'http://www.w3.org/2000/svg';
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // aplica a árvore do motor ao SVG mudando só os atributos que mudaram (igual ao protótipo)
  function patch(parent, vnodes) {
    const kids = parent.childNodes;
    for (let i = 0; i < vnodes.length; i++) {
      const v = vnodes[i];
      let el = kids[i];
      if (!el || el.__t !== v.t) {
        const nel = document.createElementNS(NS, v.t);
        nel.__t = v.t; nel.__a = {};
        if (el) parent.replaceChild(nel, el); else parent.appendChild(nel);
        el = nel;
      }
      const prev = el.__a, next = v.a;
      for (const k in next) if (prev[k] !== next[k]) el.setAttribute(k, next[k]);
      for (const k in prev) if (!(k in next)) el.removeAttribute(k);
      el.__a = next;
      patch(el, v.c);
    }
    while (kids.length > vnodes.length) parent.removeChild(parent.lastChild);
  }

  // um laço só para todas as Baterias visíveis
  const ativas = new Set();
  let rodando = false, ultimo = 0;
  function laco(agora) {
    const dt = Math.min(0.1, Math.max(0, (agora - ultimo) / 1000));
    ultimo = agora;
    ativas.forEach((b) => b.quadro(dt));
    if (ativas.size) requestAnimationFrame(laco); else rodando = false;
  }

  // gestos do repertório do motor e quanto cada um dura (os mesmos do protótipo)
  const DURACAO = { wave: 2.4, celebrate: 2.1, worry: 2.4, sigh: 1.9, giggle: 0.95, pump: 1.5, look: 2.4, sway: 2.6, yawn: 2.6, eh: 0.75,
    stretch: 1.4, shiver: 0.8, groggy: 1.1, dizzy: 1.9, collapse: 1.4 };
  const LEVES = ['wave', 'pump', 'look', 'sway', 'worry', 'yawn', 'sigh', 'shiver', 'stretch', 'giggle', 'eh', 'groggy', 'dizzy', 'collapse'];

  let contador = 0;
  // alvo: onde o SVG entra. Opções: carga (0 a 100), area (onde o olhar segue o ponteiro), observar (o que diz se ela está
  // na tela), antes(sim) e depois(sim) em volta dos passos do motor, aoQuadro(sim) depois do desenho, aoTocar()
  function BateriaSite(alvo, o) {
    o = o || {};
    const pfx = 'bs' + (++contador);
    const sim = C.createSim((Date.now() % 100000) + contador * 7919);
    C.input(sim, { type: 'demo', on: false });
    C.step(sim, C.DT);
    const c0 = (o.carga == null ? 100 : o.carga) / 100;
    sim.charge = c0; sim.level.x = c0; sim.level.v = 0;
    for (let i = 0; i < 4; i++) C.step(sim, C.DT);
    sim.events.length = 0;
    if (mq) {
      C.input(sim, { type: 'reduced', on: mq.matches });
      if (mq.addEventListener) mq.addEventListener('change', (e) => C.input(sim, { type: 'reduced', on: e.matches }));
    }

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', C.VIEW.single.join(' '));
    svg.setAttribute('class', 'bateria-animada');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    alvo.appendChild(svg);

    let acc = 0, visivel = false;
    const desenhar = () => patch(svg, C.scene(sim, { layout: 'single', pfx }));
    const api = {
      sim, svg,
      quadro(dt) {
        if (o.antes) o.antes(sim);
        acc += dt;
        let k = 0;
        while (acc >= C.DT && k < 24) { C.step(sim, C.DT); acc -= C.DT; k++; }
        if (k === 24) acc = 0;
        if (o.depois) o.depois(sim);
        desenhar();
        if (o.aoQuadro) o.aoQuadro(sim);
        sim.events.length = 0;
      },
      tocar() { C.input(sim, { type: 'tap' }); },
      gesto(tipo, dur) {
        if (!DURACAO[tipo] || !Array.isArray(sim.acts)) return;
        const d = dur || DURACAO[tipo];
        sim.acts = sim.acts.filter((x) => LEVES.indexOf(x.type) < 0);
        sim.acts.push({ type: tipo, t0: sim.t, dur: d });
        sim.nextIdle = Math.max(sim.nextIdle || 0, sim.t + d + 2.5);
      },
      entrada(ev) { C.input(sim, ev); },
      get faixa() { return sim.band; },
      get carga() { return Math.max(0, Math.min(1, sim.level.x)); },
      get modo() { return sim.mode; },
      get ativa() { return ativas.has(api); },
    };

    function atualizar() {
      if (visivel && !document.hidden) {
        ativas.add(api);
        if (!rodando) { rodando = true; ultimo = performance.now(); requestAnimationFrame(laco); }
      } else ativas.delete(api);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { visivel = es[es.length - 1].isIntersecting; atualizar(); }, { rootMargin: '120px 0px' })
        .observe(o.observar || alvo);
    } else visivel = true;
    document.addEventListener('visibilitychange', atualizar);
    desenhar(); // o primeiro desenho já sai, sem esperar o laço
    atualizar();

    // o olhar segue o ponteiro dentro da área; tocar no corpo faz ela reagir
    function paraView(e) {
      const m = svg.getScreenCTM();
      return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
    }
    const area = o.area || alvo;
    area.addEventListener('pointermove', (e) => {
      const p = paraView(e);
      if (p) C.input(sim, { type: 'pointer', gx: (p.x - 120) / 70, gy: (p.y - 118) / 70 });
    });
    area.addEventListener('pointerleave', () => C.input(sim, { type: 'pointerleave' }));
    svg.addEventListener('pointerdown', (e) => {
      const p = paraView(e);
      if (!p) return;
      const cfg = C.V[sim.variant], b = cfg.body;
      if (p.x > b[0] - 24 && p.x < b[0] + b[2] + 24 && p.y > b[1] - 26 && p.y < cfg.ground + 6) {
        C.input(sim, { type: 'tap' });
        if (o.aoTocar) o.aoTocar();
      }
    });
    return api;
  }

  window.BateriaSite = BateriaSite;
})();
