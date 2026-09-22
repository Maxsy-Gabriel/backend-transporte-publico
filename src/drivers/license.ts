/**
 * A CNH vale até o fim do dia da validade informada: só está vencida a partir do dia seguinte.
 * (Compara em UTC, o mesmo fundamento das datas sem hora guardadas no banco.)
 */
export function cnhVencida(validade: Date, hoje: Date = new Date()): boolean {
  const inicioDoDia = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()),
  );
  return validade < inicioDoDia;
}
