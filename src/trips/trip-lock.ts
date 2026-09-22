import type { Prisma } from '../generated/prisma/client.js';

/**
 * Trava a linha da viagem até o fim da transação (`SELECT ... FOR UPDATE`).
 *
 * Por que: embarcar, desembarcar e finalizar mexem no mesmo estado — "quem está a bordo agora".
 * Sem a trava, um embarque poderia ser gravado no exato instante em que a viagem está sendo
 * finalizada: a checagem "ninguém a bordo" da finalização não veria esse embarque, e a viagem
 * terminaria com um aluno marcado como a bordo. As três operações usam esta mesma trava, igual
 * `travarRota` faz para a capacidade da rota.
 */
export function travarViagem(tx: Prisma.TransactionClient, tripId: string) {
  return tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId}::uuid FOR UPDATE`;
}
