-- =====================================================================
--  Martillo Autos · Esquema PostgreSQL
--  Usuarios, catálogos, vehículos, fotos, subastas y pujas.
--  Las pujas en vivo viajan por Firebase RTDB; cada puja aceptada se
--  registra también aquí (trazabilidad) y al cerrar la subasta se guarda
--  el resultado final (vendida / desierta, ganador y precio).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), crypt()

DROP VIEW  IF EXISTS v_catalog CASCADE;
DROP TABLE IF EXISTS bids, auctions, vehicle_photos, vehicles,
                     models, makes, item_types, transmissions, fuel_types,
                     drivetrains, damage_levels, users CASCADE;
DROP TYPE  IF EXISTS auction_status CASCADE;

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name     VARCHAR(80)  NOT NULL,
    last_name      VARCHAR(80)  NOT NULL,
    email          VARCHAR(160) NOT NULL,
    phone          VARCHAR(20)  NOT NULL,
    password_hash  TEXT         NOT NULL,          -- bcrypt
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- ---------------------------------------------------------------------
-- Catálogos (ficha técnica)
-- ---------------------------------------------------------------------
CREATE TABLE item_types (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(60) NOT NULL UNIQUE                -- Automóvil, Pickup, SUV, Moto…
);

CREATE TABLE makes (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE models (
    id       SERIAL PRIMARY KEY,
    make_id  INT NOT NULL REFERENCES makes(id) ON DELETE CASCADE,
    name     VARCHAR(80) NOT NULL,
    CONSTRAINT uq_models UNIQUE (make_id, name)
);

CREATE TABLE transmissions (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(40) NOT NULL UNIQUE                -- Automática, Manual, CVT…
);

CREATE TABLE fuel_types (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(40) NOT NULL UNIQUE                -- Gasolina, Diésel, Híbrido…
);

CREATE TABLE drivetrains (
    id    SERIAL PRIMARY KEY,
    code  VARCHAR(4)  NOT NULL UNIQUE,               -- AWD, FWD, RWD, 4WD
    name  VARCHAR(60) NOT NULL
);

CREATE TABLE damage_levels (
    id           SERIAL PRIMARY KEY,
    code         VARCHAR(10) NOT NULL UNIQUE,        -- VERDE, AMARILLO, ROJO
    name         VARCHAR(40) NOT NULL,
    description  VARCHAR(120) NOT NULL,
    color_hex    CHAR(7) NOT NULL
);

-- ---------------------------------------------------------------------
-- Vehículos
-- ---------------------------------------------------------------------
CREATE TABLE vehicles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_number       SERIAL UNIQUE,                  -- número de lote visible
    seller_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    year             SMALLINT NOT NULL CHECK (year BETWEEN 1950 AND 2100),
    item_type_id     INT NOT NULL REFERENCES item_types(id),
    make_id          INT NOT NULL REFERENCES makes(id),
    model_id         INT NOT NULL REFERENCES models(id),
    engine           VARCHAR(80) NOT NULL,           -- ej. 2.5L I4 DOHC
    transmission_id  INT NOT NULL REFERENCES transmissions(id),
    fuel_type_id     INT NOT NULL REFERENCES fuel_types(id),
    drivetrain_id    INT NOT NULL REFERENCES drivetrains(id),
    cylinders        SMALLINT NOT NULL CHECK (cylinders BETWEEN 0 AND 16), -- 0 = eléctrico
    damage_level_id  INT NOT NULL REFERENCES damage_levels(id),
    mileage          INT CHECK (mileage >= 0),
    vin              VARCHAR(17),
    location         VARCHAR(120) NOT NULL DEFAULT 'Guatemala',
    description      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_vehicles_seller  ON vehicles(seller_id);
CREATE INDEX ix_vehicles_filters ON vehicles(make_id, model_id, year, fuel_type_id, damage_level_id);

-- Fotos almacenadas en la BD (funciona en cualquier hosting sin servicio extra)
CREATE TABLE vehicle_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    position    SMALLINT NOT NULL DEFAULT 0,
    mime_type   VARCHAR(40) NOT NULL,
    data        BYTEA NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_photos_vehicle ON vehicle_photos(vehicle_id, position);

-- ---------------------------------------------------------------------
-- Subastas
-- ---------------------------------------------------------------------
CREATE TYPE auction_status AS ENUM ('SCHEDULED', 'LIVE', 'SOLD', 'DESERTED', 'CANCELLED');

CREATE TABLE auctions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          UUID NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE CASCADE,
    base_price          NUMERIC(12,2) NOT NULL CHECK (base_price > 0),
    currency            CHAR(3) NOT NULL DEFAULT 'GTQ',
    min_increment_pct   NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    soft_close_seconds  INT NOT NULL DEFAULT 60,      -- reinicio del minuto final
    starts_at           TIMESTAMPTZ NOT NULL,
    scheduled_end_at    TIMESTAMPTZ NOT NULL,         -- cierre que indicó el vendedor
    ends_at             TIMESTAMPTZ NOT NULL,         -- cierre vigente (incluye extensiones)
    status              auction_status NOT NULL DEFAULT 'SCHEDULED',
    current_bid         NUMERIC(12,2),
    total_bids          INT NOT NULL DEFAULT 0,
    -- Resultado (se llena al cerrar)
    winner_id           UUID REFERENCES users(id),
    final_price         NUMERIC(12,2),
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_auction_dates CHECK (scheduled_end_at > starts_at),
    CONSTRAINT ck_sold_has_winner CHECK (
        status <> 'SOLD' OR (winner_id IS NOT NULL AND final_price IS NOT NULL)
    )
);
CREATE INDEX ix_auctions_status_end ON auctions(status, ends_at);

-- ---------------------------------------------------------------------
-- Pujas (historial completo, trazabilidad)
-- ---------------------------------------------------------------------
CREATE TABLE bids (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id    UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    bidder_id     UUID NOT NULL REFERENCES users(id),
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    bidder_alias  VARCHAR(12) NOT NULL,              -- alias anónimo mostrado (**469)
    firebase_key  VARCHAR(40) UNIQUE,                -- push-id del nodo en RTDB
    placed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_bids_auction ON bids(auction_id, amount DESC);
CREATE INDEX ix_bids_bidder  ON bids(bidder_id);

-- ---------------------------------------------------------------------
-- Vista de catálogo (lo que consume el Home)
-- ---------------------------------------------------------------------
CREATE VIEW v_catalog AS
SELECT v.id, v.lot_number, v.seller_id, v.year, v.engine, v.cylinders,
       v.mileage, v.location, v.description, v.created_at,
       it.id AS item_type_id,  it.name AS item_type,
       mk.id AS make_id,       mk.name AS make,
       md.id AS model_id,      md.name AS model,
       tr.id AS transmission_id, tr.name AS transmission,
       ft.id AS fuel_type_id,  ft.name AS fuel_type,
       dt.id AS drivetrain_id, dt.code AS drivetrain,
       dl.id AS damage_level_id, dl.code AS damage_code, dl.name AS damage_name,
       a.id AS auction_id, a.base_price, a.currency, a.starts_at, a.ends_at,
       a.status AS auction_status, a.current_bid, a.total_bids, a.final_price,
       (SELECT p.id FROM vehicle_photos p WHERE p.vehicle_id = v.id
         ORDER BY p.position LIMIT 1) AS cover_photo_id,
       (SELECT count(*) FROM vehicle_photos p WHERE p.vehicle_id = v.id) AS photo_count
FROM vehicles v
JOIN item_types    it ON it.id = v.item_type_id
JOIN makes         mk ON mk.id = v.make_id
JOIN models        md ON md.id = v.model_id
JOIN transmissions tr ON tr.id = v.transmission_id
JOIN fuel_types    ft ON ft.id = v.fuel_type_id
JOIN drivetrains   dt ON dt.id = v.drivetrain_id
JOIN damage_levels dl ON dl.id = v.damage_level_id
JOIN auctions       a ON a.vehicle_id = v.id;
