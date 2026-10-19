ALTER TABLE roles DROP CONSTRAINT roles_name_check;
ALTER TABLE roles ADD CONSTRAINT roles_name_check CHECK (name IN ('USER', 'STAFF', 'ADMIN'));
INSERT INTO roles (id, name) VALUES (3, 'STAFF');
ALTER TABLE tickets ADD COLUMN used_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN used_by UUID REFERENCES users(id);
