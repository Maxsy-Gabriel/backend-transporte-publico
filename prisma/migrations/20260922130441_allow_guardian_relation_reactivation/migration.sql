-- DropIndex
DROP INDEX "guardian_relations_guardianId_studentId_key";

-- CreateIndex
CREATE INDEX "guardian_relations_guardianId_studentId_idx" ON "guardian_relations"("guardianId", "studentId");

-- Índice único PARCIAL: só impede um segundo vínculo NÃO-REVOGADO para o mesmo par
-- (responsável, aluno). Depois de REVOKED, a secretaria pode cadastrar um vínculo novo
-- (ex.: guarda devolvida por decisão judicial) sem apagar o antigo, que fica como histórico.
CREATE UNIQUE INDEX "guardian_relations_active_pair_key"
  ON "guardian_relations" ("guardianId", "studentId")
  WHERE "status" <> 'REVOKED';
