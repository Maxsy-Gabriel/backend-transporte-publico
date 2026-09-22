import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Public } from '../src/auth/decorators/public.decorator.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, createApp } from './create-app.js';

/** DTO de teste: exercita o ValidationPipe global. */
class CadastroTesteDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  password: string;
}

/** Erro do Prisma no mesmo formato que o Prisma 7 + adapter-pg produz de verdade. */
function erroPrisma(code: string, sqlState?: string) {
  return new Prisma.PrismaClientKnownRequestError(
    'mensagem interna com pessoa@segredo.com',
    {
      code,
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: sqlState,
            detail: 'Registro contém (pessoa@segredo.com, hash-da-senha)',
          },
        },
      },
    },
  );
}

/** Controller usado SÓ nestes testes: cria situações que ainda não existem nas rotas reais. */
// @Public: estas rotas de teste dispensam o JWT (a API key continua exigida pelo helper `api`).
@Public()
@Controller('__teste')
class ControllerDeTeste {
  @Post('cadastro')
  cadastro(@Body() dto: CadastroTesteDto) {
    return { email: dto.email };
  }

  @Get('grande')
  grande() {
    return Array.from({ length: 300 }, (_, i) => ({
      indice: i,
      texto: 'conteúdo repetido '.repeat(3),
    }));
  }

  @Get('prisma/:codigo')
  prisma(@Param('codigo') codigo: string) {
    // "P2039-23514" simula uma violação de CHECK (código P2039 + SQLSTATE 23514).
    const [code, sqlState] = codigo.split('-');
    throw erroPrisma(code, sqlState);
  }

  @Get('erro-interno')
  erroInterno() {
    throw new Error('falha com senha-interna-987');
  }
}

describe('Fundação da aplicação', () => {
  let app: INestApplication;
  const http = () => api(app);

  beforeAll(async () => {
    app = await createApp([ControllerDeTeste]);
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => vi.restoreAllMocks());

  it('conecta ao banco de testes', async () => {
    const linhas = await app.get(PrismaService).$queryRaw<
      { ok: number }[]
    >`SELECT 1::int AS ok`;

    expect(linhas[0].ok).toBe(1);
  });

  describe('400 e 404', () => {
    it('rota inexistente -> 404', async () => {
      const res = await http().get('/nao-existe').expect(404);

      expect(res.body.statusCode).toBe(404);
    });

    it('body válido -> 201', async () => {
      const res = await http()
        .post('/__teste/cadastro')
        .send({ email: 'ana@exemplo.com', password: 'senha-com-10-chars' })
        .expect(201);

      expect(res.body).toEqual({ email: 'ana@exemplo.com' });
    });

    it('body inválido -> 400 com a lista de problemas', async () => {
      const res = await http()
        .post('/__teste/cadastro')
        .send({ email: 'nao-e-email', password: 'curta' })
        .expect(400);

      expect(res.body.message).toHaveLength(2);
    });

    it('campo não declarado no DTO (ex.: role) -> 400', async () => {
      const res = await http()
        .post('/__teste/cadastro')
        .send({
          email: 'ana@exemplo.com',
          password: 'senha-com-10-chars',
          role: 'ADMIN',
        })
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('role');
    });

    it('JSON malformado -> 400', async () => {
      await http()
        .post('/__teste/cadastro')
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
    });
  });

  describe('erros do banco (PrismaExceptionFilter)', () => {
    it.each([
      ['P2002', 409, 'unicidade'],
      ['P2003', 409, 'chave estrangeira'],
      ['P2039-23514', 409, 'CHECK do banco'],
      ['P2025', 404, 'registro inexistente'],
    ])('%s -> %i (%s)', async (codigo, status) => {
      const res = await http().get(`/__teste/prisma/${codigo}`).expect(status);

      // Nada do erro original (e-mail, hash) pode chegar ao cliente.
      expect(JSON.stringify(res.body)).not.toMatch(/segredo|hash/);
    });

    it('erro de banco desconhecido -> 500 genérico e o log só cita o código', async () => {
      const logs: string[] = [];
      vi.spyOn(Logger.prototype, 'error').mockImplementation((...args) => {
        logs.push(JSON.stringify(args));
      });

      const res = await http().get('/__teste/prisma/P2999').expect(500);

      expect(JSON.stringify(res.body)).not.toMatch(/segredo|hash/);
      expect(logs.join()).toContain('P2999');
      expect(logs.join()).not.toMatch(/segredo|hash/);
    });

    it('erro inesperado (não é do banco) -> 500 sem mensagem interna nem stack', async () => {
      // O Nest registra o erro no log do servidor; aqui só conferimos a resposta.
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const res = await http().get('/__teste/erro-interno').expect(500);

      expect(JSON.stringify(res.body)).not.toMatch(/senha-interna|at /);
    });
  });

  describe('Helmet e Compression', () => {
    it('envia os cabeçalhos de segurança e remove o X-Powered-By', async () => {
      const res = await http().get('/nao-existe');

      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('comprime respostas grandes com gzip quando o cliente aceita', async () => {
      const res = await http()
        .get('/__teste/grande')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      expect(res.headers['content-encoding']).toBe('gzip');
      expect(res.body).toHaveLength(300);
    });
  });

  describe('interceptor de log', () => {
    it('registra método, rota, status e duração, sem corpo, token nem query string', async () => {
      const logs: unknown[] = [];
      vi.spyOn(Logger.prototype, 'log').mockImplementation((mensagem) => {
        logs.push(mensagem);
      });

      await http()
        .post('/__teste/cadastro?token=token-na-query')
        .set('Authorization', 'Bearer jwt-secreto')
        .send({ email: 'ana@exemplo.com', password: 'senha-do-corpo-xyz' });
      // O log sai no evento `finish`, logo depois de a resposta ser enviada.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        method: 'POST',
        route: '/__teste/cadastro',
        status: 201,
      });
      expect(typeof (logs[0] as { durationMs: number }).durationMs).toBe(
        'number',
      );
      const texto = JSON.stringify(logs);
      expect(texto).not.toContain('jwt-secreto');
      expect(texto).not.toContain('senha-do-corpo-xyz');
      expect(texto).not.toContain('token-na-query');
    });
  });
});
