/* Desinsta · site: começo, a história da Bateria (rolar a página descarrega), lista de espera e botão que flutua. */
(function () {
  'use strict';
  const C = window.BatCore;

  // A lista de espera ainda não tem para onde mandar os e-mails. Quando o serviço for escolhido,
  // trocar `ligada` para true e fazer `enviar` mandar o e-mail para ele (e devolver erro se não der).
  const LISTA = {
    ligada: false,
    async enviar(email) { throw new Error('lista sem serviço: ' + email.length); },
  };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const celular = () => window.innerWidth < 640;
  const computador = () => window.innerWidth >= 1024;
  const arrumadores = [];

  // ---------------------------------------------------------------- janela: cenário + Bateria
  // O cenário é o do app (390 × 844, pés da Bateria em y 397). pes(W, H) diz onde ficam os pés dentro da janela;
  // o cenário cobre a janela inteira a partir desse ponto. A Bateria pode ficar menor que o cenário (maxBateria).
  function Janela(el, o) {
    const cena = $('.cena', el), lugar = $('.bateria-lugar', el), balao = $('.balao', el);
    const bat = window.BateriaSite(lugar, Object.assign({ observar: el, area: o.area || el }, o.bateria || {}));
    function arrumar() {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const pes = Math.round(o.pes(W, H));
      const s = Math.max(W / 390, pes / 397, (H - pes) / 447);
      cena.style.transform = 'translate(' + ((W - 390 * s) / 2).toFixed(1) + 'px,' + (pes - 397 * s).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
      const b = Math.min(s, o.maxBateria ? o.maxBateria() : s);
      lugar.style.width = (200 * b).toFixed(1) + 'px';
      lugar.style.left = (W / 2 - 100 * b).toFixed(1) + 'px';
      lugar.style.top = (pes - 172.9 * b).toFixed(1) + 'px';
      if (balao) balao.style.bottom = (H - pes + 140 * b + 22).toFixed(1) + 'px';
    }
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(arrumar);
      ro.observe(el);
      (o.observarTambem || []).forEach((x) => ro.observe(x));
    }
    arrumadores.push(arrumar);
    arrumar();
    return { bat, arrumar };
  }

  // troca a fala do balão com o pulinho do app
  function falar(balao, texto) {
    const fala = $('.balao-fala', balao);
    if (fala.textContent === texto) return;
    fala.textContent = texto;
    balao.classList.remove('pula');
    void balao.offsetWidth;
    balao.classList.add('pula');
  }

  // falas que mudam a cada toque; se ela ficar tonta (5 toques seguidos), ela reclama
  function conversa(balao, falas, tonta) {
    let i = 0, tontaAntes = false;
    return {
      proxima() { i = (i + 1) % falas.length; falar(balao, falas[i]); },
      vigiar(sim) {
        const agora = sim.acts.some((a) => a.type === 'dizzy');
        if (agora && !tontaAntes) falar(balao, tonta);
        tontaAntes = agora;
      },
    };
  }

  // ---------------------------------------------------------------- começo
  const heroi = $('.heroi');
  if (heroi) {
    const palco = $('.heroi-palco', heroi), folha = $('.heroi-folha', heroi), balao = $('.balao', palco);
    const papo = conversa(balao, [
      'Tô pedindo tomada...',
      'Eram só 5 minutinhos, lembra?',
      'O feed me descarrega. A vida fora dele me recarrega.',
      'Larga o celular comigo? Amanhã você me agradece.',
    ], 'Ei! Assim eu fico tonta.');
    const lugar = $('.bateria-lugar', palco), hora = $('.adesivo-hora', palco), feed = $('.adesivo-feed', palco);
    const bat = window.BateriaSite(lugar, {
      observar: palco, area: heroi, carga: 22,
      aoTocar: () => papo.proxima(), aoQuadro: (sim) => papo.vigiar(sim),
    });
    // a Bateria fica no canto de baixo, à direita, em cima da foto; o balão acima dela, encostado na direita
    function arrumar() {
      const W = palco.clientWidth, H = palco.clientHeight;
      if (!W || !H) return;
      const largura = Math.round(Math.min(celular() ? 150 : 190, W * 0.42));
      const chao = celular() ? folha.offsetTop - 6 : H - 10;
      const topo = chao - largura * 0.865;
      lugar.style.width = largura + 'px';
      lugar.style.left = Math.round(W - largura - (celular() ? 4 : 14)) + 'px';
      lugar.style.top = Math.round(topo) + 'px';
      balao.classList.add('ao-lado');
      balao.style.left = 'auto';
      balao.style.right = (celular() ? 12 : 22) + 'px';
      balao.style.transform = 'none';
      balao.style.bottom = Math.round(H - topo - largura * 0.12 + 10) + 'px';
      const cima = celular() ? heroi.querySelector('.heroi-texto').offsetTop + heroi.querySelector('.heroi-texto').offsetHeight + 18 : 24;
      hora.style.left = (celular() ? 18 : 24) + 'px'; hora.style.top = cima + 'px';
      // no celular, os adesivos descem para o canto de baixo, à esquerda (o rosto fica no meio da foto)
      if (celular()) {
        hora.style.top = Math.round(chao - 92) + 'px';
        feed.style.left = (celular() ? 18 : 24) + 'px'; feed.style.top = Math.round(chao - 48) + 'px';
      } else { feed.style.left = '24px'; feed.style.top = (cima + 44) + 'px'; }
    }
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(arrumar); [palco, folha, heroi].forEach((x) => ro.observe(x)); }
    arrumadores.push(arrumar);
    arrumar();
    balao.addEventListener('click', () => { bat.tocar(); papo.proxima(); });
    setTimeout(() => bat.gesto('sigh'), 900);
  }

  // ---------------------------------------------------------------- a história: rolar a página descarrega a Bateria
  const historia = $('.historia');
  if (historia) {
    const palco = $('.historia-palco', historia), folha = $('.historia-folha', historia);
    const passos = $$('.passo', historia), de = passos.map((p) => parseFloat(p.dataset.de));
    const pontosBox = $('.passos-pontos', historia);
    pontosBox.innerHTML = passos.map(() => '<span></span>').join('');
    const pontos = $$('span', pontosBox), imgs = $$('.cena img', palco);
    const num = $('.carga-num', historia), nome = $('.carga-nome', historia), cheio = $('.carga-pilha-cheio', historia);
    const passosBox = $('.passos', historia);
    // a folha acompanha a altura do passo da vez; a Bateria fica no lugar calculado pelo passo mais alto
    let alturaMax = 0;
    function medir() {
      historia.classList.add('medido');
      alturaMax = Math.max.apply(null, passos.map((el) => el.offsetHeight));
      passosBox.style.height = passos[passo].offsetHeight + 'px';
    }

    // carga ao longo da seção (0 = começo, 1 = fim): cheia, o feed descarrega, apagão, o Desinsta recarrega
    const PONTOS = [[0, 1], [0.10, 1], [0.455, 0], [0.56, 0], [0.64, 0.25], [0.68, 0.25], [0.76, 0.6], [0.80, 0.6], [0.88, 1], [1, 1]];
    function alvo(p) {
      for (let i = 1; i < PONTOS.length; i++) {
        const [p0, c0] = PONTOS[i - 1], [p1, c1] = PONTOS[i];
        if (p <= p1) return c0 + (c1 - c0) * (p1 === p0 ? 1 : (p - p0) / (p1 - p0));
      }
      return 1;
    }
    // o que ela está fazendo: rolando o feed, apagada, recarregando longe da tela
    const modo = (p) => (p < 0.10 ? 'idle' : p < 0.455 ? 'scroll' : p < 0.56 ? 'idle' : p < 0.88 ? 'rest' : 'idle');
    function progresso() {
      const r = historia.getBoundingClientRect(), total = r.height - window.innerHeight;
      return total > 0 ? clamp(-r.top / total, 0, 1) : 0;
    }

    let p = 0, a = 1, pedidoEm = -9, passo = 0, faixa = 4, numero = 100;
    function mostrarPasso(k) {
      if (k === passo) return;
      passo = k;
      passos.forEach((el, i) => el.classList.toggle('ativo', i === k));
      passosBox.style.height = passos[k].offsetHeight + 'px';
      pontos.forEach((s, i) => { s.className = i < k ? 'feito' : i === k ? 'agora' : ''; });
    }
    function mostrarCarga(sim) {
      const n = Math.round(clamp(sim.level.x, 0, 1) * 100);
      if (n !== numero) { numero = n; num.textContent = n + '%'; cheio.style.width = Math.max(n, 4) + '%'; }
      if (sim.band !== faixa) {
        faixa = sim.band;
        nome.textContent = C.BAND_NAMES[faixa];
        historia.dataset.faixa = faixa;
        imgs.forEach((img) => img.classList.toggle('ligada', +img.dataset.f === faixa));
      }
    }
    pontos.forEach((s, i) => { s.className = i === 0 ? 'agora' : ''; });
    medir();
    arrumadores.push(medir);

    // a mão com o celular: no computador ela enche o cartão (CSS); no celular e no tablet ela cabe entre o
    // chip da carga e a folha na altura do passo mais alto (a folha muda, a mão não pula)
    const mao = $('.mao', palco), tela = $('.mao-tela', palco), chip = $('.carga-chip', historia);
    function arrumarMao() {
      const foto = $('.mao-foto', mao);
      if (computador()) { [mao, foto, tela].forEach((x) => x.removeAttribute('style')); return; }
      // no celular e no tablet, a foto enche a tela e a tela do celular da foto fica entre o chip e a folha
      // (na foto de 1200 × 2133, a tela do celular vai de x 336 a 888 e de y 300 a 1508)
      const cima = chip.offsetTop + chip.offsetHeight + 10;
      const baixo = folha.offsetTop + folha.offsetHeight - (folha.offsetHeight - passosBox.offsetHeight + alturaMax) - 12;
      const W = palco.clientWidth, H = palco.clientHeight;
      let s = Math.max(120, baixo - cima) / 1208;
      s = Math.min(s, (W - 24) / 552);
      const x0 = W / 2 - 612 * s, y0 = cima + Math.max(0, (baixo - cima - 1208 * s) / 2) - 300 * s;
      const px = (n) => n.toFixed(1) + 'px';
      Object.assign(mao.style, { left: '0px', top: '0px', width: px(W), height: px(H) });
      Object.assign(foto.style, { left: px(x0), top: px(y0), width: px(1200 * s), height: px(2133 * s) });
      Object.assign(tela.style, { left: px(x0 + 336 * s), top: px(y0 + 300 * s), width: px(552 * s), height: px(1208 * s) });
    }
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(arrumarMao); [palco, folha].forEach((x) => ro.observe(x)); }
    arrumadores.push(arrumarMao);
    arrumarMao();

    Janela(tela, {
      area: palco,
      // dentro da tela do celular, o cenário inteiro, com os pés a 80% da altura
      pes: (W, H) => H * 0.8,
      observarTambem: [mao],
      bateria: {
        carga: 100,
        // antes dos passos do motor: a carga segue a rolagem, e o modo muda quando a pessoa entra em outra parte
        antes(sim) {
          p = progresso(); a = alvo(p);
          sim.charge = a;
          const m = modo(p);
          if (sim.mode === m || sim.t - pedidoEm < 0.6) return;
          const pede = (ev) => { C.input(sim, ev); pedidoEm = sim.t; };
          if (m === 'scroll' && a > 0.05) pede({ type: 'scroll', on: true, user: true });
          else if (m === 'rest' && a < 0.97) pede({ type: 'rest', on: true, user: true });
          else if (m === 'idle' && sim.mode === 'scroll' && a > 0.02) pede({ type: 'scroll', on: false, user: true }); // joga o celular
          else if (m === 'idle' && sim.mode === 'rest' && a < 0.98) pede({ type: 'rest', on: false, user: true });
          // no 0% o motor larga o celular sozinho (e desaba); no 100% ele acorda sozinho (e comemora)
        },
        depois(sim) { sim.charge = a; },
        aoQuadro(sim) {
          let k = 0;
          for (let i = 0; i < de.length; i++) if (p >= de[i]) k = i;
          mostrarPasso(k);
          mostrarCarga(sim);
        },
      },
    });
  }

  // ---------------------------------------------------------------- fim: chama para baixar
  const final = $('.final');
  if (final) {
    const palco = $('.final-palco', final), balao = $('.balao', palco);
    const papo = conversa(balao, [
      'Bora recarregar comigo?',
      'Os 3 primeiros dias são por minha conta.',
      'Enquanto isso, larga o feed um pouquinho?',
      'Hehe. Faz cócegas.',
    ], 'Ei! Assim eu fico tonta.');
    const j = Janela(palco, {
      pes: (W, H) => H * 0.82,
      maxBateria: () => 1.3,
      bateria: { carga: 70, aoTocar: () => papo.proxima(), aoQuadro: (sim) => papo.vigiar(sim) },
    });
    balao.addEventListener('click', () => { j.bat.tocar(); papo.proxima(); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { j.bat.gesto('wave'); io.disconnect(); }
      }, { threshold: 0.6 });
      io.observe(palco);
    }
  }

  // ---------------------------------------------------------------- formulários da lista
  $$('.lista-form').forEach((form, n) => {
    const input = $('input[type=email]', form), retorno = $('.lista-retorno', form);
    retorno.id = 'lista-retorno-' + (n + 1);
    input.setAttribute('aria-describedby', retorno.id);
    const mostrar = (texto, erro) => { retorno.textContent = texto; retorno.hidden = false; retorno.classList.toggle('erro', !!erro); };
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') { input.removeAttribute('aria-invalid'); retorno.hidden = true; }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) { input.setAttribute('aria-invalid', 'true'); mostrar('Escreva o seu e-mail.', true); input.focus(); return; }
      if (!input.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        input.setAttribute('aria-invalid', 'true'); mostrar('Esse e-mail parece incompleto. Confere?', true); input.focus(); return;
      }
      input.removeAttribute('aria-invalid');
      if (!LISTA.ligada) { mostrar('Prévia do site: a lista de espera ainda não está ligada, então este e-mail não foi guardado.'); return; }
      try {
        await LISTA.enviar(v);
        mostrar('Pronto! Você está na lista. A gente avisa no lançamento.');
        form.reset();
      } catch (err) {
        mostrar('Não deu para entrar na lista agora. Tenta de novo daqui a pouco?', true);
      }
    });
  });

  // os atalhos para a lista já deixam o campo de e-mail pronto
  $$('a[href="#lista"]').forEach((a) => a.addEventListener('click', () => {
    setTimeout(() => { const i = $('#email-2'); if (i) i.focus({ preventScroll: true }); }, 700);
  }));

  // ---------------------------------------------------------------- botão que flutua: só fora do começo, da história e do fim
  const flut = $('.flutuante');
  if (flut && 'IntersectionObserver' in window) {
    const vistos = new Set();
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target)));
      const ver = vistos.size === 0;
      flut.classList.toggle('visivel', ver);
      flut.tabIndex = ver ? 0 : -1;
      flut.setAttribute('aria-hidden', ver ? 'false' : 'true');
    });
    ['.heroi', '.historia', '.final', '.rodape'].forEach((s) => { const el = $(s); if (el) io.observe(el); });
  }

  // as fontes mudam a altura dos textos: arruma as janelas de novo quando chegam
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => arrumadores.forEach((f) => f()));
  window.addEventListener('resize', () => arrumadores.forEach((f) => f()));
})();
