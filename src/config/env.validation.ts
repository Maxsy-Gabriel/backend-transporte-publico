/**
 * Validação das variáveis de ambiente, executada na inicialização.
 *
 * Se algo estiver ausente ou inválido, a aplicação não sobe e mostra o que corrigir.
 * A mensagem cita só o NOME da variável e a regra: o valor nunca aparece, para não
 * vazar segredos em log. Usa class-validator, o mesmo mecanismo dos DTOs.
 */
import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(Environment, {
    message: 'NODE_ENV deve ser development, test ou production',
  })
  NODE_ENV: Environment;

  @Type(() => Number)
  @IsInt({ message: 'PORT deve ser um número inteiro' })
  @Min(1, { message: 'PORT deve estar entre 1 e 65535' })
  @Max(65535, { message: 'PORT deve estar entre 1 e 65535' })
  PORT: number = 3000;

  /** Conexão PostgreSQL. Nunca é logada. */
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL deve começar com postgresql://',
  })
  DATABASE_URL: string;

  /** Segredo de assinatura do JWT: um valor diferente em cada ambiente. */
  @IsString({ message: 'JWT_SECRET é obrigatório' })
  @MinLength(32, { message: 'JWT_SECRET deve ter pelo menos 32 caracteres' })
  JWT_SECRET: string;

  /** Duração do token: 15m, 1h, 7d... */
  @Matches(/^\d+[smhd]$/, {
    message: 'JWT_EXPIRES_IN deve ter o formato 15m, 1h ou 7d',
  })
  JWT_EXPIRES_IN: string = '1h';

  /**
   * Chave da API: toda rota exige o cabeçalho X-API-KEY com este valor (ApiKeyGuard).
   * Um valor diferente em cada ambiente.
   */
  @IsString({ message: 'API_KEY é obrigatória' })
  @MinLength(32, { message: 'API_KEY deve ter pelo menos 32 caracteres' })
  API_KEY: string;

  /**
   * API de CEP e geocodificação das paradas (BrasilAPI v2 por padrão). Para trocar de provedor
   * compatível basta mudar esta variável; nada fica fixo no código.
   */
  @IsUrl(
    {
      require_tld: false,
      require_protocol: true,
      protocols: ['http', 'https'],
    },
    { message: 'CEP_API_BASE_URL deve ser uma URL http(s)' },
  )
  CEP_API_BASE_URL: string = 'https://brasilapi.com.br/api/cep/v2';

  /** Tempo máximo de espera pela API de CEP, em milissegundos. */
  @Type(() => Number)
  @IsInt({ message: 'CEP_API_TIMEOUT_MS deve ser um número inteiro' })
  @Min(100, { message: 'CEP_API_TIMEOUT_MS deve estar entre 100 e 30000' })
  @Max(30_000, { message: 'CEP_API_TIMEOUT_MS deve estar entre 100 e 30000' })
  CEP_API_TIMEOUT_MS: number = 5_000;

  /** Pasta dos documentos enviados. Em produção, use um volume persistente. */
  @IsString()
  @IsNotEmpty({ message: 'UPLOAD_DIR não pode ser vazio' })
  UPLOAD_DIR: string = './storage/uploads';

  /** Tamanho máximo de um upload, em bytes (padrão 5 MB). */
  @Type(() => Number)
  @IsInt({ message: 'UPLOAD_MAX_BYTES deve ser um número inteiro' })
  @Min(1024, { message: 'UPLOAD_MAX_BYTES deve estar entre 1 KB e 20 MB' })
  @Max(20 * 1024 * 1024, {
    message: 'UPLOAD_MAX_BYTES deve estar entre 1 KB e 20 MB',
  })
  UPLOAD_MAX_BYTES: number = 5 * 1024 * 1024;
}

/** Função `validate` do ConfigModule: devolve o objeto tipado ou lança com a lista de problemas. */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validado = plainToInstance(EnvironmentVariables, config);
  const erros = validateSync(validado, {
    // Sem `target`/`value`: os erros não carregam os valores (segredos) informados.
    validationError: { target: false, value: false },
  });
  const problemas = erros.flatMap((erro) =>
    Object.values(erro.constraints ?? {}),
  );

  // Em produção os valores de exemplo do .env.example não podem ser usados.
  if (validado.NODE_ENV === Environment.Production) {
    for (const nome of ['JWT_SECRET', 'API_KEY'] as const) {
      if (validado[nome]?.includes('change-me')) {
        problemas.push(
          `${nome} parece o valor de exemplo; gere um valor aleatório para produção`,
        );
      }
    }
  }

  if (problemas.length > 0) {
    throw new Error(
      `Configuração de ambiente inválida:\n${problemas.map((p) => ` - ${p}`).join('\n')}`,
    );
  }
  return validado;
}
