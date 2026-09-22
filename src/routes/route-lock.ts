import type { Prisma } from '../generated/prisma/client.js';

/**
 * Trava a linha da rota até o fim da transação (`SELECT ... FOR UPDATE`).
 *
 * Por que: a regra de capacidade é "contar os alunos da rota e só então colocar mais um". Sem
 * trava, duas requisições simultâneas contam o mesmo total e AS DUAS entram na última vaga.
 * Com a trava, a segunda espera a primeira terminar e enxerga o total já atualizado.
 * Toda operação que altera a lotação de uma rota (alocar aluno, trocar veículo, desativar,
 * incluir ponto) usa esta função.
 */
export function travarRota(tx: Prisma.TransactionClient, routeId: string) {
  return tx.$queryRaw`SELECT id FROM routes WHERE id = ${routeId}::uuid FOR UPDATE`;
}

/**
 * Trava todas as rotas de um veículo. As linhas são travadas em ordem de id para que duas
 * transações nunca se esperem mutuamente (deadlock).
 */
export function travarRotasDoVeiculo(
  tx: Prisma.TransactionClient,
  vehicleId: string,
) {
  return tx.$queryRaw`SELECT id FROM routes WHERE "vehicleId" = ${vehicleId}::uuid ORDER BY id FOR UPDATE`;
}
