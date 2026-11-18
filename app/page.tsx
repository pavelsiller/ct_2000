export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#151b28] text-slate-100 flex items-center justify-center p-8">
      <div className="max-w-xl w-full rounded-xl border border-slate-700/70 bg-slate-900/70 p-8 space-y-4">
        <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
          Český Těšín 2000
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          Izometrická pixel-art mapa Českého Těšína
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          Projekt využívá open-source generátor mapových dlaždic <strong>izomapa</strong> (Adam Klatovský)
          a webový prohlížeč <strong>brno2000</strong> (Mirek Kubásek). Probíhá generování dat a dlaždic.
        </p>
      </div>
    </main>
  );
}
