import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Traduz erros conhecidos do Prisma em respostas HTTP coerentes (404/409), no mesmo formato
 * padrão do Nest: { statusCode, message, error }.
 *
 * Por que existe: as regras de negócio validam antes de gravar, mas o banco é a última
 * linha de defesa. Numa corrida (duas requisições disputando a última vaga) é a constraint
 * do banco que barra; o cliente deve receber 409, não um 500 opaco.
 *
 * SEGURANÇA: a mensagem dos erros do Prisma inclui valores da linha (e-mail, hash de senha).
 * Por isso ela nunca vai para a resposta nem para o log: só registramos o CÓDIGO do erro.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(erro: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    // O BaseExceptionFilter monta a resposta padrão a partir da exceção HTTP equivalente.
    super.catch(this.traduzir(erro), host);
  }

  private traduzir(erro: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (erro.code) {
      case 'P2002': // violação de unicidade
        return new ConflictException('Já existe um registro com estes dados.');
      case 'P2003': // violação de chave estrangeira
        return new ConflictException(
          'Operação não permitida: existem registros relacionados.',
        );
      case 'P2025': // registro não encontrado (update/delete/findOrThrow)
        return new NotFoundException('Registro não encontrado.');
    }

    // CHECK do banco: com driver adapter o erro vem em meta, com o SQLSTATE 23514.
    const meta = erro.meta as
      | { driverAdapterError?: { cause?: { originalCode?: string } } }
      | undefined;
    if (meta?.driverAdapterError?.cause?.originalCode === '23514') {
      return new ConflictException(
        'A operação viola uma regra de integridade dos dados.',
      );
    }

    // Qualquer outro erro do banco é falha nossa: 500 genérico, log só com o código.
    this.logger.error(`Erro de banco não tratado (código ${erro.code})`);
    return new InternalServerErrorException();
  }
}
