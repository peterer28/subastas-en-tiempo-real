-- =====================================================================
--  Datos semilla · catálogos, usuarios de prueba y vehículos de ejemplo
--  Contraseña de los 3 usuarios: Demo2026!
-- =====================================================================

INSERT INTO item_types (name) VALUES
 ('Automóvil'), ('Pickup'), ('SUV'), ('Camión'), ('Motocicleta'), ('Microbús');

INSERT INTO transmissions (name) VALUES ('Automática'), ('Manual'), ('CVT'), ('Doble embrague');
INSERT INTO fuel_types   (name) VALUES ('Gasolina'), ('Diésel'), ('Híbrido'), ('Eléctrico'), ('Gas LP');

INSERT INTO drivetrains (code, name) VALUES
 ('FWD', 'Tracción delantera'), ('RWD', 'Tracción trasera'),
 ('AWD', 'Tracción integral'),  ('4WD', 'Doble tracción 4x4');

INSERT INTO damage_levels (code, name, description, color_hex) VALUES
 ('VERDE',    'Verde',    'Daño menor / Limpio',     '#2E9E5B'),
 ('AMARILLO', 'Amarillo', 'Daño medio / Reparable',  '#D99A00'),
 ('ROJO',     'Rojo',     'Daño severo / Salvamento','#D64545');

INSERT INTO makes (name) VALUES
 ('Toyota'), ('Honda'), ('Nissan'), ('Ford'), ('Chevrolet'), ('Hyundai'),
 ('Kia'), ('Mazda'), ('Jeep'), ('Tesla'), ('Mitsubishi'), ('Isuzu');

INSERT INTO models (make_id, name)
SELECT m.id, x.model FROM makes m JOIN (VALUES
 ('Toyota','Corolla'), ('Toyota','Hilux'), ('Toyota','RAV4'), ('Toyota','Tacoma'), ('Toyota','Camry'),
 ('Honda','Civic'), ('Honda','CR-V'), ('Honda','Accord'),
 ('Nissan','Sentra'), ('Nissan','Frontier'), ('Nissan','Rogue'),
 ('Ford','F-150'), ('Ford','Escape'), ('Ford','Ranger'), ('Ford','Mustang'),
 ('Chevrolet','Silverado'), ('Chevrolet','Equinox'), ('Chevrolet','Malibu'),
 ('Hyundai','Tucson'), ('Hyundai','Elantra'), ('Hyundai','Santa Fe'),
 ('Kia','Sportage'), ('Kia','Sorento'), ('Kia','Rio'),
 ('Mazda','CX-5'), ('Mazda','Mazda3'),
 ('Jeep','Wrangler'), ('Jeep','Grand Cherokee'),
 ('Tesla','Model 3'), ('Tesla','Model Y'),
 ('Mitsubishi','L200'), ('Mitsubishi','Outlander'),
 ('Isuzu','D-Max'), ('Isuzu','NPR')
) AS x(make, model) ON x.make = m.name;

-- ---------------------------------------------------------------------
-- Usuarios de prueba (bcrypt generado con pgcrypto, compatible con bcryptjs)
-- ---------------------------------------------------------------------
INSERT INTO users (first_name, last_name, email, phone, password_hash) VALUES
 ('Ana',    'López',  'ana@demo.gt',    '+502 5555 0101', crypt('Demo2026!', gen_salt('bf', 10))),
 ('Carlos', 'Méndez', 'carlos@demo.gt', '+502 5555 0202', crypt('Demo2026!', gen_salt('bf', 10))),
 ('Sofía',  'Ruiz',   'sofia@demo.gt',  '+502 5555 0303', crypt('Demo2026!', gen_salt('bf', 10)));

-- ---------------------------------------------------------------------
-- Vehículos de ejemplo (publicados por Ana para que Carlos y Sofía pujen)
-- ---------------------------------------------------------------------
WITH seller AS (SELECT id FROM users WHERE email = 'ana@demo.gt'),
data(year, itype, make, model, engine, trans, fuel, drive, cyl, damage, km, loc, descr,
     base, start_offset, end_offset) AS (VALUES
 (2021,'Pickup','Toyota','Hilux','2.8L I4 Turbodiésel','Manual','Diésel','4WD',4,'AMARILLO',68000,'Escuintla',
  'Golpe frontal en defensa y faro derecho. Motor y caja funcionan.', 145000, interval '-1 hour', interval '3 minutes'),
 (2019,'Automóvil','Honda','Civic','2.0L I4 i-VTEC','CVT','Gasolina','FWD',4,'VERDE',52000,'Ciudad de Guatemala',
  'Rayones leves en puerta trasera. Interior limpio.', 82000, interval '-2 hours', interval '1 day'),
 (2020,'SUV','Hyundai','Tucson','2.0L I4 MPi','Automática','Gasolina','FWD',4,'ROJO',41000,'Puerto Quetzal',
  'Daño por inundación. Se vende como salvamento.', 38000, interval '-3 hours', interval '2 days'),
 (2022,'Automóvil','Tesla','Model 3','Motor eléctrico dual','Automática','Eléctrico','AWD',0,'AMARILLO',23000,'Mixco',
  'Impacto lateral izquierdo. Batería con 94 % de salud.', 210000, interval '-30 minutes', interval '3 days'),
 (2018,'Pickup','Ford','F-150','3.5L V6 EcoBoost','Automática','Gasolina','4WD',6,'VERDE',89000,'Antigua Guatemala',
  'Detalles cosméticos en la paila. Llantas nuevas.', 175000, interval '-1 day', interval '5 hours'),
 (2017,'SUV','Jeep','Wrangler','3.6L V6 Pentastar','Manual','Gasolina','4WD',6,'AMARILLO',97000,'Chimaltenango',
  'Golpe en guardafango trasero, techo rígido en buen estado.', 160000, interval '2 hours', interval '4 days')
),
ins AS (
  INSERT INTO vehicles (seller_id, year, item_type_id, make_id, model_id, engine, transmission_id,
                        fuel_type_id, drivetrain_id, cylinders, damage_level_id, mileage, location, description)
  SELECT s.id, d.year, it.id, mk.id, md.id, d.engine, tr.id, ft.id, dt.id, d.cyl, dl.id, d.km, d.loc, d.descr
  FROM data d CROSS JOIN seller s
  JOIN item_types it ON it.name = d.itype
  JOIN makes mk ON mk.name = d.make
  JOIN models md ON md.name = d.model AND md.make_id = mk.id
  JOIN transmissions tr ON tr.name = d.trans
  JOIN fuel_types ft ON ft.name = d.fuel
  JOIN drivetrains dt ON dt.code = d.drive
  JOIN damage_levels dl ON dl.code = d.damage
  RETURNING id, model_id
)
INSERT INTO auctions (vehicle_id, base_price, starts_at, scheduled_end_at, ends_at, status)
SELECT ins.id, d.base, now() + d.start_offset, now() + d.end_offset, now() + d.end_offset,
       CASE WHEN d.start_offset < interval '0' THEN 'LIVE'::auction_status ELSE 'SCHEDULED' END
FROM ins
JOIN models md ON md.id = ins.model_id
JOIN data d ON d.model = md.name;

-- ---------------------------------------------------------------------
-- 5 fotografías de muestra por vehículo (SVG generado). Reemplázalas
-- desde "Mis publicaciones" con fotos reales.
-- ---------------------------------------------------------------------
INSERT INTO vehicle_photos (vehicle_id, position, mime_type, data)
SELECT v.id, g.n, 'image/svg+xml', convert_to(format(
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="%s"/>
  <rect y="420" width="800" height="180" fill="#D9DDE1"/>
  <g transform="translate(400 380) scale(%s 1) translate(-260 -120)">
    <path d="M30 150 Q20 100 70 92 L150 84 Q210 30 300 28 L360 30 Q420 36 470 86 L500 92 Q520 96 520 130 L520 150 Z" fill="%s"/>
    <path d="M170 86 Q220 44 300 42 L350 44 Q395 50 430 86 Z" fill="#E8F1F8" opacity=".9"/>
    <circle cx="140" cy="155" r="38" fill="#4A5058"/><circle cx="140" cy="155" r="16" fill="#C9CED3"/>
    <circle cx="410" cy="155" r="38" fill="#4A5058"/><circle cx="410" cy="155" r="16" fill="#C9CED3"/>
  </g>
  <text x="40" y="70" font-family="Arial, sans-serif" font-size="34" fill="#4A5058">%s %s</text>
  <text x="40" y="110" font-family="Arial, sans-serif" font-size="22" fill="#6B7480">Foto %s de 5 · imagen de muestra</text>
</svg>',
  (ARRAY['#F2F5F8','#FFF4EA','#EEF6F1','#F6F2FA','#FBF7EC'])[g.n],
  CASE WHEN g.n % 2 = 0 THEN '-1' ELSE '1' END,
  (ARRAY['#E9730C','#3D7CC9','#2E9E5B','#B8BEC5','#D64545','#8C6BB1'])[(v.lot_number % 6) + 1],
  mk.name, md.name, g.n), 'UTF8')
FROM vehicles v
JOIN makes mk ON mk.id = v.make_id
JOIN models md ON md.id = v.model_id
CROSS JOIN generate_series(1, 5) AS g(n);
