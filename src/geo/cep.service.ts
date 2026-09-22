import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { EnvironmentVariables } from '../config/env.validation.js';

/** Endereço e coordenadas de um CEP. As coordenadas são nulas quando o serviço não as conhece. */
export interface EnderecoCep {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Integração externa (HttpService): consulta o endereço e as coordenadas de um CEP.
 *
 * URL e tempo limite vêm do ambiente. Toda falha vira um erro CONTROLADO, nunca um 500:
 *   CEP inexistente -> 404 | tempo esgotado -> 504 | serviço fora do ar, erro 5xx ou resposta
 *   fora do formato -> 502.
 * O CEP recebido já foi validado (8 dígitos), então nada de fora entra na URL consultada.
 */
@Injectable()
export class CepService {
  private readonly logger = new Logger(CepService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async consultar(cep: string): Promise<EnderecoCep> {
    const base = this.config
      .getOrThrow('CEP_API_BASE_URL', { infer: true })
      .replace(/\/+$/, '');
    const timeout = this.config.getOrThrow('CEP_API_TIMEOUT_MS', {
      infer: true,
    });

    let resposta;
    try {
      resposta = await firstValueFrom(
        this.http.get<unknown>(`${base}/${cep}`, {
          timeout,
          maxContentLength: 100_000,
          // O status HTTP é tratado aqui (404, 5xx) em vez de o axios lançar exceção.
          validateStatus: () => true,
        }),
      );
    } catch (erro) {
      // Sem resposta HTTP: tempo esgotado, DNS, conexão recusada...
      const tempoEsgotado =
        isAxiosError(erro) &&
        (erro.code === 'ECONNABORTED' || erro.code === 'ETIMEDOUT');
      this.logger.warn(
        `Falha ao consultar o serviço de CEP (${tempoEsgotado ? 'tempo esgotado' : 'indisponível'})`,
      );
      if (tempoEsgotado) {
        throw new GatewayTimeoutException(
          'Tempo esgotado ao consultar o serviço de CEP.',
        );
      }
      throw new BadGatewayException('Serviço de CEP indisponível.');
    }

    if (resposta.status === 404) {
      throw new NotFoundException('CEP não encontrado.');
    }
    if (resposta.status !== 200) {
      this.logger.warn(
        `O serviço de CEP respondeu com status ${resposta.status}`,
      );
      throw new BadGatewayException('O serviço de CEP retornou um erro.');
    }
    return this.interpretar(resposta.data, cep);
  }

  /** Converte a resposta da BrasilAPI v2 e rejeita o que estiver fora do formato esperado. */
  private interpretar(dados: unknown, cep: string): EnderecoCep {
    if (!dados || typeof dados !== 'object') {
      throw new BadGatewayException('Resposta inválida do serviço de CEP.');
    }
    const d = dados as {
      street?: unknown;
      neighborhood?: unknown;
      city?: unknown;
      state?: unknown;
      location?: { coordinates?: { latitude?: unknown; longitude?: unknown } };
    };
    const texto = (valor: unknown) =>
      typeof valor === 'string' ? valor.trim() : '';

    const state = texto(d.state).toUpperCase();
    const city = texto(d.city);
    if (!/^[A-Z]{2}$/.test(state) || !city) {
      throw new BadGatewayException('Resposta inválida do serviço de CEP.');
    }

    // A BrasilAPI devolve as coordenadas como TEXTO e às vezes sem elas. Só valem as duas juntas.
    const latitude = this.coordenada(d.location?.coordinates?.latitude, 90);
    const longitude = this.coordenada(d.location?.coordinates?.longitude, 180);
    const temCoordenadas = latitude !== null && longitude !== null;

    return {
      cep,
      street: texto(d.street),
      neighborhood: texto(d.neighborhood),
      city,
      state,
      latitude: temCoordenadas ? latitude : null,
      longitude: temCoordenadas ? longitude : null,
    };
  }

  /** Converte texto/número em coordenada, ou null se estiver ausente ou fora da faixa. */
  private coordenada(valor: unknown, limite: number): number | null {
    if (typeof valor === 'string' && valor.trim() === '') return null;
    if (typeof valor !== 'string' && typeof valor !== 'number') return null;
    const numero = Number(valor);
    return Number.isFinite(numero) && Math.abs(numero) <= limite
      ? numero
      : null;
  }
}
