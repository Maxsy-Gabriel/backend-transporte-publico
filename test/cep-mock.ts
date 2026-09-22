import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LEITURA_ORIGINAL = Symbol('leituraOriginalDoConfig');

/** Como o servidor de mentira responde à próxima consulta. */
export interface Comportamento {
  status?: number;
  /** Corpo (vira JSON). */
  corpo?: unknown;
  /** Corpo cru, sem passar por JSON (para simular resposta quebrada). */
  textoBruto?: string;
  /** Espera antes de responder (para simular lentidão/timeout). */
  atrasoMs?: number;
}

/** Resposta de sucesso no formato real da BrasilAPI v2 (coordenadas em TEXTO, longitude primeiro). */
export function enderecoSe() {
  return {
    cep: '01001000',
    state: 'SP',
    city: 'São Paulo',
    neighborhood: 'Sé',
    street: 'Praça da Sé',
    service: 'open-cep',
    location: {
      type: 'Point',
      coordinates: { longitude: '-46.633081', latitude: '-23.5503898' },
    },
  };
}

/**
 * Servidor HTTP de mentira que imita a BrasilAPI. Os testes definem a resposta de cada cenário
 * (sucesso, 404, 500, JSON quebrado, lentidão...) e conferem quais URLs foram consultadas.
 */
export async function iniciarCepMock() {
  let comportamento: Comportamento = { corpo: enderecoSe() };
  const consultas: string[] = [];

  const servidor = createServer((req, res) => {
    consultas.push(req.url ?? '');
    const responder = () => {
      res.statusCode = comportamento.status ?? 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        comportamento.textoBruto ?? JSON.stringify(comportamento.corpo ?? {}),
      );
    };
    if (comportamento.atrasoMs) setTimeout(responder, comportamento.atrasoMs);
    else responder();
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const { port } = servidor.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    consultas,
    definir(novo: Comportamento) {
      comportamento = novo;
    },
    restaurar() {
      comportamento = { corpo: enderecoSe() };
      consultas.length = 0;
    },
    async fechar() {
      servidor.closeAllConnections();
      await new Promise<void>((pronto) => servidor.close(() => pronto()));
    },
  };
}

/**
 * Faz o app consultar o servidor de mentira. O ConfigModule lê o ambiente uma vez só, então a
 * URL e o timeout são trocados na leitura do ConfigService (o CepService lê a cada consulta).
 */
export function apontarCepPara(
  app: INestApplication,
  url: string,
  timeoutMs = 300,
): void {
  const config = app.get(ConfigService);
  // Guarda a leitura ORIGINAL uma única vez: numa segunda chamada `getOrThrow` já é o mock, e
  // usá-lo como "original" faria o mock chamar a si mesmo (recursão infinita).
  const guardada = config as unknown as Record<symbol, unknown>;
  guardada[LEITURA_ORIGINAL] ??= config.getOrThrow.bind(config);
  const original = guardada[LEITURA_ORIGINAL] as (
    ...args: unknown[]
  ) => unknown;
  vi.spyOn(config, 'getOrThrow').mockImplementation(((
    chave: string,
    ...resto: unknown[]
  ) => {
    if (chave === 'CEP_API_BASE_URL') return url;
    if (chave === 'CEP_API_TIMEOUT_MS') return timeoutMs;
    return original(chave, ...resto);
  }) as never);
}
