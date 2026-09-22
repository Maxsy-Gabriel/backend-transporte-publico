-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GUARDIAN', 'DRIVER', 'OPERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "GuardianRelationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "BoardingStatus" AS ENUM ('BOARDED', 'ALIGHTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseExpiresAt" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "vehicleId" UUID,
    "driverId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT,
    "cep" CHAR(8) NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "routeId" UUID,
    "stopId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_relations" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "relationship" "Relationship" NOT NULL,
    "status" "GuardianRelationStatus" NOT NULL DEFAULT 'PENDING',
    "documentName" TEXT,
    "documentPath" TEXT,
    "documentMime" TEXT,
    "documentSize" INTEGER,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardian_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boarding_records" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "BoardingStatus" NOT NULL DEFAULT 'BOARDED',
    "boardedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alightedAt" TIMESTAMPTZ(3),
    "registeredById" UUID NOT NULL,

    CONSTRAINT "boarding_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licenseNumber_key" ON "drivers"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "routes_vehicleId_idx" ON "routes"("vehicleId");

-- CreateIndex
CREATE INDEX "routes_driverId_idx" ON "routes"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "routes_name_shift_key" ON "routes"("name", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_routeId_position_key" ON "route_stops"("routeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "students_registrationNumber_key" ON "students"("registrationNumber");

-- CreateIndex
CREATE INDEX "students_routeId_idx" ON "students"("routeId");

-- CreateIndex
CREATE INDEX "students_stopId_idx" ON "students"("stopId");

-- CreateIndex
CREATE INDEX "guardian_relations_studentId_idx" ON "guardian_relations"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_relations_guardianId_studentId_key" ON "guardian_relations"("guardianId", "studentId");

-- CreateIndex
CREATE INDEX "trips_routeId_startedAt_idx" ON "trips"("routeId", "startedAt");

-- CreateIndex
CREATE INDEX "boarding_records_studentId_boardedAt_idx" ON "boarding_records"("studentId", "boardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_records_tripId_studentId_key" ON "boarding_records"("tripId", "studentId");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_relations" ADD CONSTRAINT "guardian_relations_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_relations" ADD CONSTRAINT "guardian_relations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_relations" ADD CONSTRAINT "guardian_relations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boarding_records" ADD CONSTRAINT "boarding_records_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boarding_records" ADD CONSTRAINT "boarding_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boarding_records" ADD CONSTRAINT "boarding_records_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Regras de integridade que o Prisma não expressa no schema (adicionadas à mão).
-- O `prisma migrate dev` não as reporta como drift.
-- =============================================================================

-- Capacidade do veículo deve ser positiva.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_check" CHECK ("capacity" > 0);

-- A posição do ponto na rota começa em 1.
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_position_check" CHECK ("position" >= 1);

-- Viagem: a finalização nunca é anterior ao início...
ALTER TABLE "trips" ADD CONSTRAINT "trips_finished_after_started_check"
  CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");

-- ...e o status é coerente com a finalização (IN_PROGRESS sem finishedAt, FINISHED com).
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check"
  CHECK (("status" = 'IN_PROGRESS' AND "finishedAt" IS NULL) OR ("status" = 'FINISHED' AND "finishedAt" IS NOT NULL));

-- Só pode haver UMA viagem em andamento por rota.
CREATE UNIQUE INDEX "trips_one_in_progress_per_route_key" ON "trips" ("routeId") WHERE "status" = 'IN_PROGRESS';

-- Embarque precede desembarque: o desembarque nunca é anterior ao embarque...
ALTER TABLE "boarding_records" ADD CONSTRAINT "boarding_records_alighted_after_boarded_check"
  CHECK ("alightedAt" IS NULL OR "alightedAt" >= "boardedAt");

-- ...e o status é coerente com o desembarque (BOARDED sem alightedAt, ALIGHTED com).
ALTER TABLE "boarding_records" ADD CONSTRAINT "boarding_records_status_check"
  CHECK (("status" = 'BOARDED' AND "alightedAt" IS NULL) OR ("status" = 'ALIGHTED' AND "alightedAt" IS NOT NULL));

-- Um aluno não pode estar a bordo de duas vans ao mesmo tempo (um embarque em aberto por vez).
CREATE UNIQUE INDEX "boarding_records_open_per_student_key" ON "boarding_records" ("studentId") WHERE "status" = 'BOARDED';
