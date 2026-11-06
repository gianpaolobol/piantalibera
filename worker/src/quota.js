// Quote atomiche in un Durable Object (un'unica istanza "global").
// Un Durable Object elabora una richiesta alla volta: verifica e incremento
// avvengono senza corse, a differenza di KV.
//
// Contabilità per giorno UTC:
//   ip:<hash>      render riusciti o in corso per quell'IP
//   inflight:<hash> lavori in corso per quell'IP (limite di concorrenza)
//   neurons        Neurons stimati impegnati nel giorno (tetto di spesa)
//   renders        richieste accettate nel giorno
// I contatori dei giorni precedenti vengono cancellati con un allarme.

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, "");

export class QuotaGate {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json() : {};
    const s = this.state.storage, day = dayKey();
    const k = name => `${day}:${name}`;
    if (url.pathname === "/reserve") {
      const { ipHash, neurons, perIpDaily, maxConcurrent, neuronBudget, globalDaily } = body;
      const [ip, inflight, used, renders] = await Promise.all([s.get(k(`ip:${ipHash}`)), s.get(k(`inflight:${ipHash}`)), s.get(k("neurons")), s.get(k("renders"))]);
      const st = { ip: ip || 0, inflight: inflight || 0, neurons: used || 0, renders: renders || 0 };
      if (st.ip >= perIpDaily) return Response.json({ ok: false, reason: "quota_exceeded", ...st });
      if (st.inflight >= maxConcurrent) return Response.json({ ok: false, reason: "too_many_concurrent", ...st });
      if (st.renders >= globalDaily) return Response.json({ ok: false, reason: "global_quota_exceeded", ...st });
      if (st.neurons + neurons > neuronBudget) return Response.json({ ok: false, reason: "budget_exceeded", ...st });
      await s.put({ [k(`ip:${ipHash}`)]: st.ip + 1, [k(`inflight:${ipHash}`)]: st.inflight + 1, [k("neurons")]: st.neurons + neurons, [k("renders")]: st.renders + 1 });
      if (s.setAlarm && !(await s.getAlarm?.())) await s.setAlarm(Date.now() + 26 * 3600e3);
      return Response.json({ ok: true, ip: st.ip + 1, neurons: st.neurons + neurons, renders: st.renders + 1 });
    }
    if (url.pathname === "/release") {
      // a fine lavoro: libera la concorrenza; se il modello ha fallito restituisce la quota
      // dell'utente ma NON i Neurons (una chiamata fallita può comunque essere fatturata)
      const { ipHash, neurons, failed, reservedDay } = body;
      const kd = name => `${reservedDay || day}:${name}`;
      const [ip, inflight, used, renders] = await Promise.all([s.get(kd(`ip:${ipHash}`)), s.get(kd(`inflight:${ipHash}`)), s.get(kd("neurons")), s.get(kd("renders"))]);
      const upd = { [kd(`inflight:${ipHash}`)]: Math.max(0, (inflight || 1) - 1) };
      if (failed) { upd[kd(`ip:${ipHash}`)] = Math.max(0, (ip || 1) - 1); upd[kd("renders")] = Math.max(0, (renders || 1) - 1); }
      await s.put(upd);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/status") {
      const { ipHash } = body;
      const [ip, used, renders] = await Promise.all([s.get(k(`ip:${ipHash}`)), s.get(k("neurons")), s.get(k("renders"))]);
      return Response.json({ ip: ip || 0, neurons: used || 0, renders: renders || 0 });
    }
    return new Response("not found", { status: 404 });
  }

  async alarm() {
    const today = dayKey(), yesterday = dayKey(new Date(Date.now() - 86400e3));
    const all = await this.state.storage.list();
    const old = [...all.keys()].filter(key => !key.startsWith(today) && !key.startsWith(yesterday));
    if (old.length) await this.state.storage.delete(old);
    await this.state.storage.setAlarm(Date.now() + 26 * 3600e3);
  }
}

/** Neurons stimati per FLUX.2 klein: riquadri 512×512 in uscita e in ingresso (tariffe configurabili). */
export function estimateNeurons({ width, height, variants, inputs }, rates) {
  const outTiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return Math.ceil(variants * (outTiles * rates.outTile + inputs * rates.inTile));
}
