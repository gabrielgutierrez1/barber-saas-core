-- Solo desarrollo/demo: 2 salones x 4 servicios + directorio central.
-- En producción provisionar por cliente, permisos de menor privilegio, backups y cifrado.
CREATE DATABASE tenant_manager;
CREATE DATABASE tenant1_catalog;
CREATE DATABASE tenant1_reservations;
CREATE DATABASE tenant1_payments;
CREATE DATABASE tenant1_auth;
CREATE DATABASE tenant2_catalog;
CREATE DATABASE tenant2_reservations;
CREATE DATABASE tenant2_payments;
CREATE DATABASE tenant2_auth;
