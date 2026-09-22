import { validate } from './env.validation.js';

/** Ambiente mínimo válido; cada teste altera só o que quer exercitar. */
const base = () => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://app:senha-do-banco@localhost:5432/transporte',
  JWT_SECRET: 'a'.repeat(64),
  API_KEY: 'k'.repeat(40),
});

/** Executa validate e devolve a mensagem do erro (ou string vazia se não lançou). */
function mensagemDoErro(env: Record<string, unknown>): string {
  try {
    validate(env);
  } catch (erro) {
    return (erro as Error).message;
  }
  return '';
}

describe('validate (variáveis de ambiente)', () => {
  it('aceita o ambiente mínimo e aplica os padrões', () => {
    const config = validate(base());

    expect(config.PORT).toBe(3000);
    expect(config.JWT_EXPIRES_IN).toBe('1h');
  });

  it('converte PORT para número', () => {
    expect(validate({ ...base(), PORT: '8080' }).PORT).toBe(8080);
  });

  it('aplica os padrões da API de CEP e do upload', () => {
    const config = validate(base());

    expect(config.CEP_API_BASE_URL).toBe('https://brasilapi.com.br/api/cep/v2');
    expect(config.CEP_API_TIMEOUT_MS).toBe(5000);
    expect(config.UPLOAD_DIR).toBe('./storage/uploads');
    expect(config.UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it.each([
    ['CEP_API_BASE_URL', 'nao-e-url'],
    ['CEP_API_BASE_URL', 'ftp://servidor.com/cep'],
    ['CEP_API_TIMEOUT_MS', '10'],
    ['CEP_API_TIMEOUT_MS', 'lento'],
    ['UPLOAD_DIR', ''],
    ['UPLOAD_MAX_BYTES', '100'],
    ['UPLOAD_MAX_BYTES', '99999999999'],
  ])('rejeita %s=%s', (variavel, valor) => {
    expect(mensagemDoErro({ ...base(), [variavel]: valor })).toContain(
      variavel,
    );
  });

  it('aceita a API de CEP em http local (usada nos testes com servidor de mentira)', () => {
    expect(
      mensagemDoErro({ ...base(), CEP_API_BASE_URL: 'http://127.0.0.1:4010' }),
    ).toBe('');
  });

  it('rejeita variável ausente e cita o nome dela', () => {
    expect(mensagemDoErro({ NODE_ENV: 'development' })).toMatch(
      /DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*API_KEY/,
    );
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['NODE_ENV', 'staging'],
    ['JWT_EXPIRES_IN', 'uma hora'],
  ])('rejeita %s=%s', (variavel, valor) => {
    expect(mensagemDoErro({ ...base(), [variavel]: valor })).toContain(
      variavel,
    );
  });

  it.each(['JWT_SECRET', 'API_KEY'])(
    'não vaza o valor curto de %s na mensagem de erro',
    (variavel) => {
      const mensagem = mensagemDoErro({ ...base(), [variavel]: 'valor-curto' });

      expect(mensagem).toContain(variavel);
      expect(mensagem).not.toContain('valor-curto');
    },
  );

  it('não vaza a senha do banco quando a DATABASE_URL é inválida', () => {
    const mensagem = mensagemDoErro({
      ...base(),
      DATABASE_URL: 'mysql://root:senha-super-secreta@host/db',
    });

    expect(mensagem).toContain('DATABASE_URL');
    expect(mensagem).not.toContain('senha-super-secreta');
  });

  describe('valores de exemplo (.env.example)', () => {
    const exemplo = 'dev-change-me-dev-change-me-dev-change-me-dev';

    it('são aceitos em desenvolvimento (conveniência para quem clona)', () => {
      expect(
        mensagemDoErro({ ...base(), JWT_SECRET: exemplo, API_KEY: exemplo }),
      ).toBe('');
    });

    it.each(['JWT_SECRET', 'API_KEY'])(
      '%s de exemplo é recusado em produção',
      (variavel) => {
        expect(
          mensagemDoErro({
            ...base(),
            NODE_ENV: 'production',
            [variavel]: exemplo,
          }),
        ).toContain(variavel);
      },
    );
  });
});
