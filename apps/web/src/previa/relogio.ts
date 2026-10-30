/** O "agora" das amostras (quinta, 29/10/2026, 9h30 em Joinville), andando a partir de quando a prévia abre. */
const AGORA = new Date("2026-10-29T09:30:00-03:00").getTime();
const DataReal = Date;
const desvio = AGORA - DataReal.now();

class DataDaPrevia extends DataReal {
  constructor(...args: unknown[]) {
    if (args.length) super(...(args as [string]));
    else super(DataReal.now() + desvio);
  }
  static override now() {
    return DataReal.now() + desvio;
  }
}

globalThis.Date = DataDaPrevia as DateConstructor;
